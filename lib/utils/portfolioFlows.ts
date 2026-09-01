/**
 * portfolioFlows — i flussi che attraversano il confine della base dei Rendimenti.
 *
 * IL DIFETTO CHE QUESTO MODULO CHIUDE
 * `getCashFlowsFromExpenses` risponde a «quanto denaro è entrato nel patrimonio dall'esterno»:
 * entrate meno uscite del Cashflow, con i trasferimenti **saltati per costruzione** (sono
 * net-zero sul patrimonio). È la risposta giusta quando la base è tutto il patrimonio.
 *
 * Non lo è quando la base è il solo portafoglio gestito. Lì la liquidità sta FUORI dalla base, e
 * comprare un ETF con i soldi di un conto è denaro che **entra** nella base — un trasferimento,
 * cioè esattamente ciò che quella funzione non può vedere. Sui dati reali dell'account, febbraio →
 * agosto 2026, questo valeva 35.208 € di acquisti letti come rendimento, contro 659 € di flussi
 * effettivamente neutralizzati: la pagina raddoppiava il rendimento (audit del 2026-08-29, D1).
 *
 * LA REGOLA: I FLUSSI SEGUONO LA BASE
 * Base `netWorth` (nulla è escluso) → i flussi restano quelli del Cashflow: solo il denaro che
 * entra dall'esterno cambia il capitale misurato.
 * Base `portfolio` (qualcosa è escluso) → i flussi sono le variazioni di **quantità** degli
 * strumenti dentro la base, valorizzate al prezzo del mese: `Σ (q₁ − q₀) × p₁`. Una quantità che
 * cresce è capitale entrato, una che cala è capitale uscito, e il prezzo non c'entra — che è
 * precisamente la definizione di flusso che TWR vuole al numeratore.
 *
 * IL REGISTRO PRIMA, LE QUANTITÀ COME RETE — **per asset, non per data**
 * Il registro operazioni è la fonte migliore dove esiste: è datato all'OPERAZIONE, mentre uno
 * snapshot è datato alla rilevazione. Sull'account reale la differenza si vede — 722 quote NTSG
 * comprate il 20/08/2025 stanno nel registro ad agosto e nello snapshot a settembre — e sull'ordine
 * ha ragione il registro.
 *
 * Ma il registro da solo non regge la storia, perché conosce solo ciò che è stato registrato. Ad
 * aprile 2025 registra l'acquisto del portafoglio nuovo (30.065 €) e non la vendita del vecchio,
 * che stava su un altro intermediario: preso da solo quel mese vale **−100%**. Le quantità degli
 * snapshot, invece, non possono mancare un'operazione — se la posizione è cambiata, la quantità lo
 * dice — ma sbagliano il mese al confine.
 *
 * Nessuna delle due, da sola, ci arriva. La regola è quindi **per asset**:
 *   - l'asset ha operazioni registrate, e il mese è dal suo primo movimento in poi → **registro**;
 *   - altrimenti → **Δquantità**.
 * Aprile 2025 torna esatto proprio così: MWEQ e SWDA dal registro (+30.065), i cinque strumenti del
 * vecchio intermediario dalle quantità (−20.322), flusso netto +9.743.
 *
 * La conseguenza che conta è sul FUTURO: un utente che registra le sue operazioni ha ogni asset
 * coperto, quindi la misura è interamente basata sul registro e le quantità non intervengono mai.
 * La rete serve al passato, non lo zavorra.
 *
 * I LIMITI, DICHIARATI
 *  - **Δquantità: prezzo di fine mese, non di operazione.** Un acquisto a metà mese è valorizzato al
 *    prezzo di chiusura: giusto in quantità, approssimato in euro. È la convenzione «flusso a fine
 *    periodo», la stessa che il resto della pipeline già assume. Non riguarda il ramo registro.
 *  - **Δquantità: una variazione di quantità non è sempre un'operazione.** Split, fusioni,
 *    conferimenti in natura e dividendi reinvestiti in quote muovono le quantità senza denaro, e
 *    verrebbero letti come versamenti.
 *  - **Registro: un'operazione non registrata sparisce.** Per un asset marcato come coperto le
 *    Δquantità non intervengono più, quindi una vendita dimenticata sottostima il flusso e gonfia il
 *    rendimento. È il prezzo di preferire il registro, e la guardia naturale sarebbe una
 *    riconciliazione fra le due fonti — non c'è ancora.
 *
 * QUANDO IL FLUSSO NON È MISURABILE
 * Serve il `byAsset` di ENTRAMBI i mesi di una coppia: senza, non c'è modo di sapere se una
 * variazione di valore fosse un acquisto o il mercato. Quel mese non produce una voce — e
 * l'assenza è un'informazione, non uno zero. Chi consuma questi flussi deve ricadere sul Cashflow
 * per i mesi assenti, altrimenti uno storico fatto di snapshot inseriti a mano (nessun `byAsset`)
 * finirebbe con flussi nulli e ogni versamento verrebbe letto come rendimento. Un mese misurato in
 * cui non si è mosso niente vale invece **zero**, ed è una voce a tutti gli effetti: le due cose
 * non vanno confuse.
 *
 * GLI ASSET OPACHI AL FLUSSO
 * Per alcuni asset la quantità non conta unità ma **valore**, e cresce sia per i versamenti sia per
 * il mercato: un fondo pensione tiene il suo valore in `quantity` con prezzo 1
 * (`assertFundValueLivesInQuantity`). Su questi una Δquantità non distingue un versamento da un
 * rendimento, e leggerla come flusso cancellerebbe il rendimento del fondo. Vanno passati in
 * `flowOpaqueAssetIds`: contribuiscono 0 al ramo Δquantità (i loro versamenti restano non
 * neutralizzati — è la limitazione storica del modulo, non una regressione). Un conto corrente NON
 * è opaco: lì la quantità è il saldo, e una sua variazione è davvero denaro che si muove.
 */

import type { MonthlySnapshot } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { CashFlowData } from '@/types/performance';
import { hasAssetBreakdown } from '@/lib/utils/snapshotAssetBreakdown';
import { monthKey } from '@/lib/utils/cashFlowMap';

/** Le posizioni di un mese, indicizzate per `assetId`, senza gli asset fuori base. */
function positionsInBase(
  snapshot: MonthlySnapshot,
  excludedIds: Set<string>
): Map<string, { quantity: number; price: number }> {
  const out = new Map<string, { quantity: number; price: number }>();
  for (const entry of snapshot.byAsset) {
    if (excludedIds.has(entry.assetId)) continue;
    const previous = out.get(entry.assetId);
    // Uno stesso assetId due volte nello stesso mese non dovrebbe esistere; se esiste, si somma
    // invece di tenere in silenzio solo l'ultima (stessa scelta di `buildCashFlowMap`).
    out.set(entry.assetId, {
      quantity: (previous?.quantity ?? 0) + entry.quantity,
      price: entry.price,
    });
  }
  return out;
}

/**
 * Il registro, indicizzato per l'uso che ne fa il flusso: quanto denaro un asset ha mosso in un
 * mese, e da quale mese quell'asset e' coperto.
 *
 * Un `adjustment` non muove denaro (e' una rettifica di quantita'), quindi non entra nel flusso —
 * ma conta come copertura: l'asset e' comunque tracciato nel registro.
 *
 * @param trades - Le operazioni dell'account, in qualsiasi ordine
 * @returns `flows` = `assetId|YYYY-MM` → euro netti (acquisti positivi, vendite negative);
 *   `coveredFrom` = `assetId` → il mese della sua prima operazione
 */
export function indexLedger(trades: AssetTransaction[]): {
  flows: Map<string, number>;
  coveredFrom: Map<string, string>;
} {
  const flows = new Map<string, number>();
  const coveredFrom = new Map<string, string>();

  for (const trade of trades) {
    const month = monthKey(trade.date.getFullYear(), trade.date.getMonth() + 1);
    const since = coveredFrom.get(trade.assetId);
    if (since === undefined || month < since) coveredFrom.set(trade.assetId, month);
    if (trade.type === 'adjustment') continue;
    // Le commissioni sono denaro uscito dalle tasche per entrare (o non uscire) dal portafoglio:
    // stessa convenzione di `computeInvestedCapital`.
    const fees = trade.fees ?? 0;
    const amount =
      trade.type === 'buy'
        ? trade.quantity * trade.priceEur + fees
        : -(trade.quantity * trade.priceEur - fees);
    const key = `${trade.assetId}|${month}`;
    flows.set(key, (flows.get(key) ?? 0) + amount);
  }

  return { flows, coveredFrom };
}

/**
 * Il flusso netto di un mese: quanto capitale e' entrato (positivo) o uscito (negativo) dalla base
 * fra due snapshot consecutivi.
 *
 * Per ogni asset in base sceglie la fonte secondo la regola in testa al file: il registro se
 * l'asset e' coperto in quel mese, le Delta-quantita' altrimenti.
 *
 * @param previous - Lo snapshot del mese precedente
 * @param current - Lo snapshot del mese misurato
 * @param excludedIds - Gli `assetId` fuori base (da `resolvePerformanceExclusions`)
 * @param ledger - Il registro indicizzato da `indexLedger`; assente = solo Delta-quantita'
 * @param flowOpaqueIds - Asset la cui quantita' assorbe anche il mercato (fondi pensione): niente
 *   Delta-quantita' su di loro, o il loro rendimento verrebbe letto come versamento
 * @returns Euro entrati nella base
 */
export function computeMonthlyPortfolioFlow(
  previous: MonthlySnapshot,
  current: MonthlySnapshot,
  excludedIds: Set<string>,
  ledger?: { flows: Map<string, number>; coveredFrom: Map<string, string> },
  flowOpaqueIds: Set<string> = new Set()
): number {
  const before = positionsInBase(previous, excludedIds);
  const after = positionsInBase(current, excludedIds);
  const month = monthKey(current.year, current.month);

  let flow = 0;
  for (const assetId of new Set([...before.keys(), ...after.keys()])) {
    const coveredFrom = ledger?.coveredFrom.get(assetId);
    if (coveredFrom !== undefined && month >= coveredFrom) {
      // Coperto dal registro: e' la fonte, anche quando non ha operazioni QUEL mese (nessuna
      // operazione = nessun flusso, che e' un'informazione, non un buco da riempire).
      flow += ledger!.flows.get(`${assetId}|${month}`) ?? 0;
      continue;
    }
    if (flowOpaqueIds.has(assetId)) continue;
    const from = before.get(assetId);
    const to = after.get(assetId);
    const deltaQuantity = (to?.quantity ?? 0) - (from?.quantity ?? 0);
    if (deltaQuantity === 0) continue;
    // Una posizione chiusa non ha prezzo nel mese corrente: si valorizza all'ultimo noto.
    flow += deltaQuantity * (to?.price ?? from?.price ?? 0);
  }
  return flow;
}

/**
 * I flussi mensili del portafoglio, nella forma che il resto della pipeline gia' consuma.
 *
 * **Una voce per ogni mese MISURABILE, zeri compresi.** Le coppie sono quelle di snapshot
 * consecutivi — le stesse che `calculateTimeWeightedReturn` collega — e una coppia e' misurabile
 * solo se entrambi i mesi hanno il `byAsset`. Un mese assente significa «non misurabile», e il
 * chiamante deve ricadere sul Cashflow; un mese presente a zero significa «misurato, non si e'
 * mosso niente». Confondere le due cose azzererebbe i flussi di chi non ha breakdown.
 *
 * Solo `netCashFlow` e' misurato: `income`/`expenses`/`dividendIncome` restano a zero perche' un
 * acquisto non e' ne' uno stipendio ne' una spesa, e riempirli con i numeri del Cashflow
 * mescolerebbe due perimetri diversi nello stesso oggetto.
 *
 * @param snapshots - Gli snapshot dell'account, in qualsiasi ordine (non vengono modificati)
 * @param excludedAssetIds - Gli `assetId` fuori base
 * @param trades - Il registro operazioni; assente o vuoto = tutto sulle Delta-quantita'
 * @param flowOpaqueAssetIds - Asset la cui quantita' assorbe anche il mercato (fondi pensione)
 * @returns Un `CashFlowData` per ogni mese misurabile, ordinato per data
 */
export function buildPortfolioCashFlows(
  snapshots: MonthlySnapshot[],
  excludedAssetIds: string[],
  trades: AssetTransaction[] = [],
  flowOpaqueAssetIds: string[] = []
): CashFlowData[] {
  const excludedIds = new Set(excludedAssetIds);
  const opaqueIds = new Set(flowOpaqueAssetIds);
  const ledger = trades.length > 0 ? indexLedger(trades) : undefined;
  const ordered = [...snapshots].sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month
  );

  const flows: CashFlowData[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (!hasAssetBreakdown(previous) || !hasAssetBreakdown(current)) continue;
    flows.push({
      date: new Date(current.year, current.month - 1, 1),
      income: 0,
      expenses: 0,
      dividendIncome: 0,
      netCashFlow: computeMonthlyPortfolioFlow(previous, current, excludedIds, ledger, opaqueIds),
    });
  }
  return flows;
}
