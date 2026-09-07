/**
 * performanceBase — quale capitale misurano le metriche di Rendimenti.
 *
 * DUE ESCLUSIONI, UNA DOMANDA SOLA
 * Rendimenti risponde a "come sta andando il portafoglio che gestisco", non "quanto vale tutto
 * quello che possiedo" (quella è Storico). Due categorie di capitale non appartengono alla domanda:
 *
 *  - **Fondi pensione** (`AssetType 'pensionFund'`): capitale illiquido e non ribilanciabile,
 *    alimentato da versamenti (TFR/datoriale/volontario) invece che da attività di mercato.
 *    Includerlo distorce TWR, Sharpe, volatilità, Max Drawdown, ROI e CAGR.
 *  - **Asset `allocationRole: 'excluded'`** (tipicamente la casa in cui vivi): valutati a mano,
 *    fermi per mesi e poi aggiornati con uno scalino. Dentro le metriche di rischio fanno due danni
 *    opposti — deprimono la volatilità mentre il valore resta fermo, e generano un mese-fantasma
 *    quando la stima viene aggiornata.
 *
 * Entrambe sono attivabili/disattivabili dall'utente (Impostazioni → Preferenze), ma il default
 * esclude entrambe: è la base onesta.
 *
 * PERCHÉ SI LEGGE `byAsset` E NON `byAssetClass`
 * Il valore di un fondo pensione può essere già spalmato su equity/bonds dentro `byAssetClass` per
 * via del look-through di `composition` (`calculateCurrentAllocation` — la stessa funzione che
 * produce sia il denominatore di Allocazione sia il `byAssetClass` dello snapshot), quindi
 * sottrarre da lì richiederebbe di sapere esattamente in quali bucket è finito. `byAsset` porta il
 * valore totale sotto il suo `assetId`, indipendentemente da come è stato fatto lo split.
 *
 * IL BACKFILL, E PERCHÉ SERVE (fix 2026-07-27)
 * `byAsset` è popolato solo dagli snapshot generati dal cron; quelli storici creati a mano non ce
 * l'hanno. La prima versione di questo modulo sottraeva l'esclusione solo dove `byAsset` esisteva:
 * il capitale escluso restava dentro il patrimonio fino all'ultimo mese senza breakdown e ne usciva
 * al primo mese con breakdown, producendo uno **scalino di base** letto come crollo di mercato.
 * Sui dati reali questo valeva −9,37% a novembre 2025 (fondo pensione da 23.597 € su 256.801 € di
 * patrimonio) contro un patrimonio che quel mese era cresciuto di 377 €, e teneva il Max Drawdown
 * inchiodato a −12,10% invece del −7% reale.
 *
 * La correzione: per i mesi **senza** `byAsset` si sottrae una costante `E₀`, il valore escluso del
 * primo mese che il breakdown ce l'ha. È corretto in due passaggi:
 *   1. dentro il blocco pre-breakdown la sottrazione è costante → non introduce nessun rendimento
 *      spurio (una costante si semplifica al numeratore di `(V_fine − CF) / V_inizio`);
 *   2. al giunto il salto vale `E₀ − E₀ = 0` → **artefatto nullo per costruzione**.
 *
 * Uno snapshot che HA `byAsset` ma non contiene l'asset non viene backfillato: quella è evidenza
 * genuina che l'asset non esisteva quel mese, e va sottratto 0.
 *
 * APPROSSIMAZIONE DICHIARATA: il backfill corregge il **denominatore** dei mesi storici, non il
 * **numeratore**. Il capitale escluso non valeva `E₀` tre anni fa, e soprattutto la sua variazione
 * in quei mesi (rivalutazione della casa, versamenti TFR/datoriali che non transitano da nessun
 * conto e quindi sono invisibili al cashflow) resta dentro il rendimento misurato. Non è
 * ricostruibile — quegli snapshot non hanno il dettaglio per strumento — ed è un errore di secondo
 * ordine rispetto allo scalino che sostituisce.
 *
 * `PerformanceBase` resta il seam minimale: due valori oggi — `portfolio` (applica le esclusioni) e
 * `netWorth` (tutto) — pronti a crescere senza riscrivere i chiamanti.
 *
 * IL TOGGLE VINCE SUL RUOLO (2026-09-06)
 * Un fondo pensione porta quasi sempre anche `allocationRole: 'excluded'` — è la scelta naturale
 * per un capitale bloccato fino alla pensione — e le due esclusioni erano in OR: sull'account
 * reale «Includi i fondi pensione» acceso non cambiava un numero, perché il ruolo teneva i fondi
 * fuori comunque. Per un asset di tipo `pensionFund` decide SOLO il toggle pensione; il ruolo
 * governa gli altri asset (la casa, il private equity).
 *
 * FONDI DENTRO, MA ONESTI: L'INGRESSO E I FLUSSI DI CONFINE (2026-09-06)
 * Con il toggle acceso il fondo non entra «da sempre»: la sua crescita è rendimento solo da quando
 * i versamenti sono tracciati (`resolvePensionReturnStart`, la stessa regola di Previdenza e della
 * Panoramica), quindi prima di quel mese resta fuori come oggi. Nel mese d'ingresso il suo intero
 * valore è un FLUSSO — capitale che entra nella base misurata, come la prima apparizione di uno
 * strumento è un effetto quantità in Storico — e da lì in poi ogni versamento è un flusso nel mese
 * in cui ha mosso il valore (`valueEffectMonth`). Regola unica, in `resolvePerformanceBase`:
 * un versamento è un flusso se e solo se attraversa il confine della base. Fondi dentro → TFR,
 * datoriale e un volontario da busta paga entrano da fuori (+); un volontario da conto è interno
 * (0). Fondi fuori → un volontario da conto (`linkedExpenseId`) è cassa che esce (−), TFR e
 * datoriale non toccano la base (0). Con questo sparisce la vecchia limitazione dichiarata del
 * volontario letto come deflusso non neutralizzato. I flussi viaggiano su un canale proprio
 * (`CashFlowData.pensionFlow`), non in `netCashFlow`: la tessera Contributi non deve leggere
 * l'ingresso di un fondo come «messi da parte».
 *
 * L'ALTRA METÀ DELLA BASE: DA QUALE MESE (`resolveHasBaseline`, 2026-07-28)
 * La base non è solo *quale capitale* si misura, è anche *da quale mese*. Il primo snapshot di un
 * periodo può essere due cose diverse — la valutazione di partenza pre-periodo (dicembre per lo YTD)
 * oppure il primo mese di storia dell'utente — e la distinzione cambia cosa si mostra nei grafici.
 * `resolveHasBaseline` è l'unica risposta a quella domanda, così che service e pagina non possano
 * più darsene due (era il finding A10: la pagina usava la lista dei periodi senza il controllo di
 * lunghezza che il service applicava).
 */

import type { Asset, AssetAllocationSettings, MonthlySnapshot } from '@/types/assets';
import type { PensionBoundaryFlow, PeriodMonth } from '@/types/performance';
import type { PensionContribution } from '@/types/pension';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { hasAssetBreakdown } from '@/lib/utils/snapshotAssetBreakdown';
import { resolvePensionReturnStart, valueEffectMonth } from '@/lib/utils/pensionReturn';
import { monthKey } from '@/lib/utils/cashFlowMap';

export type PerformanceBase = 'portfolio' | 'netWorth';

/**
 * Cosa tenere DENTRO la base, letto dalle impostazioni utente. Entrambi i flag sono opt-in:
 * assenti (o `false`) significa "escludi", che è il default del prodotto.
 *
 * WARNING (checklist comment): i due chiamanti di `resolvePerformanceExclusions` devono passare
 * le STESSE opzioni, o un periodo CUSTOM finisce per disaccordarsi con le metriche precalcolate —
 * `lib/services/performanceService.ts` (`getAllPerformanceData`) e
 * `app/dashboard/performance/page.tsx` (`cachedSnapshots`).
 */
export interface PerformanceBaseOptions {
  /** `true` = i fondi pensione restano nella base. Default `false`. */
  includePensionFunds?: boolean;
  /** `true` = gli asset `allocationRole: 'excluded'` restano nella base. Default `false`. */
  includeExcludedAssets?: boolean;
}

/**
 * Traduce le impostazioni salvate in opzioni della base.
 *
 * Esiste per un motivo solo: i due chiamanti devono leggere gli STESSI campi con gli STESSI default.
 * Un'impostazione assente (account mai configurato) vale `false` su entrambi i flag, cioè la base
 * esclusiva — mai dedurre il contrario dal silenzio.
 */
export function resolvePerformanceBaseOptions(
  settings: AssetAllocationSettings | null | undefined
): PerformanceBaseOptions {
  return {
    includePensionFunds: settings?.performanceIncludesPensionFunds ?? false,
    includeExcludedAssets: settings?.performanceIncludesExcludedAssets ?? false,
  };
}

/**
 * Gli `assetId` da togliere dalla base, secondo le opzioni.
 *
 * Unica fonte di verità sulla composizione della base: entrambi i chiamanti passano di qui invece
 * di rifiltrare gli asset per conto proprio. Il ruolo di allocazione arriva da
 * `resolveAllocationRole` (che gestisce anche il flag legacy `excludeFromAllocation`), mai
 * reimplementato qui.
 *
 * @param assets - Tutti gli asset dell'account
 * @param options - Cosa tenere dentro (default: escludi fondi pensione e asset non allocati)
 * @returns Lista di assetId, senza duplicati (un fondo pensione marcato `excluded` compare una volta)
 */
export function resolvePerformanceExclusions(
  assets: Asset[],
  options: PerformanceBaseOptions = {}
): string[] {
  const { includePensionFunds = false, includeExcludedAssets = false } = options;
  if (includePensionFunds && includeExcludedAssets) return [];

  const excluded = new Set<string>();
  for (const asset of assets) {
    // A pension fund answers to its own toggle only: its allocation role (usually `excluded`, the
    // natural pick for capital locked until retirement) must not veto it, or the toggle is a
    // silent no-op — see the header.
    if (asset.type === 'pensionFund') {
      if (!includePensionFunds) excluded.add(asset.id);
      continue;
    }
    if (!includeExcludedAssets && resolveAllocationRole(asset) === 'excluded') excluded.add(asset.id);
  }

  return [...excluded];
}

/**
 * Il primo snapshot precede l'inizio nominale del periodo? (cioè: è un mese di *baseline*)
 *
 * Un mese di baseline è la valutazione da cui parte la misura, non un mese misurato: non produce un
 * rendimento proprio, non compare nella heatmap e non deve comparire nei grafici del periodo. Un
 * primo snapshot che invece cade DENTRO il periodo richiesto è il primo mese di storia dell'utente,
 * e va mostrato.
 *
 * Data-driven, non indovinato dal tipo di periodo (finding A1): l'euristica precedente
 * (`['YTD','1Y','3Y','5Y','CUSTOM'].includes(period)`) sbagliava in due casi reali — uno YTD senza
 * lo snapshot di dicembre, dove il primo elemento è gennaio ed è dentro il periodo, e un 1Y/3Y/5Y su
 * uno storico più corto della finestra, dove il primo mese reale veniva scartato come baseline.
 *
 * @param snapshots - Snapshot del periodo, in qualsiasi ordine (si guarda il più vecchio)
 * @param nominalPeriodStart - Il mese richiesto dall'utente; `null` per ALL, che non ha inizio
 *   nominale e quindi non può avere baseline (il primo snapshot È l'inizio della storia)
 * @returns `true` se e solo se il mese del primo snapshot è strettamente precedente all'inizio nominale
 */
export function resolveHasBaseline(
  snapshots: Pick<MonthlySnapshot, 'year' | 'month'>[],
  nominalPeriodStart: PeriodMonth | null | undefined
): boolean {
  if (!nominalPeriodStart || snapshots.length === 0) return false;

  const earliest = snapshots.reduce((oldest, s) =>
    s.year !== oldest.year ? (s.year < oldest.year ? s : oldest) : s.month < oldest.month ? s : oldest
  );

  // Confronto su un indice mensile assoluto: evita di costruire due Date solo per ordinarle.
  return earliest.year * 12 + earliest.month < nominalPeriodStart.year * 12 + nominalPeriodStart.month;
}

/** Somma il valore degli asset esclusi presenti nel breakdown di uno snapshot. */
function sumExcludedValue(snapshot: MonthlySnapshot, excludedIds: Set<string>): number {
  return (snapshot.byAsset ?? []).reduce(
    (sum, entry) => (excludedIds.has(entry.assetId) ? sum + entry.totalValue : sum),
    0
  );
}

/**
 * Il valore `E₀` da riportare indietro sui mesi privi di breakdown: quello del primo mese, in
 * ordine cronologico, che il breakdown ce l'ha. Zero quando nessuno snapshot ha `byAsset` (niente
 * da sottrarre, e niente scalino possibile).
 */
function resolveBackfillValue(snapshots: MonthlySnapshot[], excludedIds: Set<string>): number {
  const earliestWithBreakdown = [...snapshots]
    .filter(hasAssetBreakdown)
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))[0];

  return earliestWithBreakdown ? sumExcludedValue(earliestWithBreakdown, excludedIds) : 0;
}

/**
 * Proietta gli snapshot sulla base richiesta.
 *
 * Per `netWorth` gli snapshot tornano intatti. Per `portfolio` (default) il valore degli asset
 * esclusi viene tolto da `totalNetWorth` e `illiquidNetWorth` (sia i fondi pensione sia la prima
 * casa sono illiquidi): dal breakdown quando c'è, dal backfill costante quando manca — vedi la nota
 * sul backfill in testa al file.
 *
 * @param snapshots - Snapshot dell'account, in qualsiasi ordine (l'ordine di input è preservato)
 * @param excludedAssetIds - Da `resolvePerformanceExclusions`
 * @param base - `portfolio` applica le esclusioni, `netWorth` non tocca nulla
 */
export function toPerformanceBaseSnapshots(
  snapshots: MonthlySnapshot[],
  excludedAssetIds: string[],
  base: PerformanceBase = 'portfolio'
): MonthlySnapshot[] {
  if (base === 'netWorth' || excludedAssetIds.length === 0) return snapshots;
  const excludedIds = new Set(excludedAssetIds);
  const backfillValue = resolveBackfillValue(snapshots, excludedIds);

  return snapshots.map((snapshot) => {
    const excludedValue = hasAssetBreakdown(snapshot)
      ? sumExcludedValue(snapshot, excludedIds)
      : backfillValue;
    if (!excludedValue) return snapshot;

    return {
      ...snapshot,
      totalNetWorth: snapshot.totalNetWorth - excludedValue,
      illiquidNetWorth: Math.max(0, snapshot.illiquidNetWorth - excludedValue),
    };
  });
}

/** The whole base, resolved once for both callers (the service and the page). */
export interface PerformanceBaseResolution {
  options: PerformanceBaseOptions;
  /** The account's pension funds, whatever the options say. */
  pensionFundIds: string[];
  /**
   * 'YYYY-MM' of the snapshot from which the funds are IN the base — the first month at or after
   * `resolvePensionReturnStart` whose breakdown carries a fund. `null` = out in every month: the
   * toggle is off, there are no funds, or nothing is trackable yet.
   */
  pensionEntryMonth: string | null;
  /** Out of the base in EVERY month: the role-excluded assets, plus the funds when they never enter. */
  excludedAssetIds: string[];
  /** The snapshots projected on the base, in the input order. */
  snapshots: MonthlySnapshot[];
  /** Every crossing of the base's boundary through the pension funds, any period. */
  pensionFlows: PensionBoundaryFlow[];
}

/** Sum of the pension funds' value frozen in one snapshot. */
function sumPensionValue(snapshot: MonthlySnapshot, fundIds: Set<string>): number {
  return (snapshot.byAsset ?? []).reduce(
    (sum, entry) => (fundIds.has(entry.assetId) ? sum + entry.totalValue : sum),
    0
  );
}

/**
 * The month the funds enter the base: the earliest snapshot at or after the trusted start whose
 * breakdown carries a fund with a value. A snapshot before `byAsset` cannot say what the fund was
 * worth, and one with a breakdown but no fund is evidence the fund did not exist yet.
 */
function resolvePensionEntryMonth(
  snapshots: MonthlySnapshot[],
  fundIds: Set<string>,
  trustedStartMonth: string | null
): string | null {
  if (!trustedStartMonth) return null;
  const entry = [...snapshots]
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
    .find(
      (snapshot) =>
        monthKey(snapshot.year, snapshot.month) >= trustedStartMonth &&
        hasAssetBreakdown(snapshot) &&
        sumPensionValue(snapshot, fundIds) > 0
    );
  return entry ? monthKey(entry.year, entry.month) : null;
}

/**
 * Whether one contribution crossed the base's boundary, and in which direction — the ONE rule.
 *
 * `month > entryMonth` means the fund was already inside the base when the value moved (the entry
 * month itself is covered by the entry flow, which carries the fund's whole value). A voluntary
 * contribution paid from a cash account is recognised by its `linkedExpenseId` (the transfer the
 * service wrote); one without it was withheld from payroll and came from outside, like TFR.
 */
function classifyContribution(
  contribution: PensionContribution,
  fundIds: Set<string>,
  entryMonth: string | null
): PensionBoundaryFlow | null {
  const month = valueEffectMonth(contribution);
  const fundInBase = entryMonth !== null && month > entryMonth && fundIds.has(contribution.assetId);
  const fromCash = contribution.source === 'voluntary' && !!contribution.linkedExpenseId;

  if (fundInBase) {
    return fromCash ? null : { month, amount: contribution.amount, kind: 'contribution' };
  }
  return fromCash ? { month, amount: -contribution.amount, kind: 'withdrawal' } : null;
}

/**
 * Resolve the measured base once: which snapshots, which exclusions, which pension flows.
 *
 * WARNING (checklist comment): the TWO callers must both go through here —
 * `lib/services/performanceService.ts` (`getAllPerformanceData`) and
 * `app/dashboard/performance/page.tsx` (`cachedSnapshots` + the custom range) — or a custom period
 * disagrees with the pre-computed ones. `buildCacheKey` fingerprints the resolution.
 *
 * With the funds OUT (toggle off, no fund, or no trustable start) the projection is the one the
 * file has always made, and the only flows are the voluntary contributions that left a cash
 * account. With the funds IN, the months before `pensionEntryMonth` are projected WITHOUT the
 * funds (actual values, or the E₀ backfill before `byAsset`), the months from it on WITH them, and
 * the flows are the entry value plus every later contribution that came from outside.
 *
 * @param input.snapshots - The account's snapshots, any order (the order is preserved)
 * @param input.assets - Every asset of the account
 * @param input.contributions - Every pension contribution of the account, any period
 * @param input.settings - The saved settings (the two toggles and `pensionReturnStartMonth`)
 */
export function resolvePerformanceBase(input: {
  snapshots: MonthlySnapshot[];
  assets: Asset[];
  contributions: PensionContribution[];
  settings: AssetAllocationSettings | null | undefined;
}): PerformanceBaseResolution {
  const { snapshots, assets, contributions, settings } = input;
  const options = resolvePerformanceBaseOptions(settings);
  const pensionFundIds = assets.filter((asset) => asset.type === 'pensionFund').map((asset) => asset.id);
  const fundIds = new Set(pensionFundIds);

  // Everything the role keeps out, whatever the pension toggle says.
  const otherExcluded = resolvePerformanceExclusions(assets, { ...options, includePensionFunds: true });
  const outEverywhere = [...otherExcluded, ...pensionFundIds];

  const pensionEntryMonth =
    options.includePensionFunds && pensionFundIds.length > 0
      ? resolvePensionEntryMonth(snapshots, fundIds, resolvePensionReturnStart(contributions, settings?.pensionReturnStartMonth))
      : null;

  const contributionFlows = contributions
    .map((contribution) => classifyContribution(contribution, fundIds, pensionEntryMonth))
    .filter((flow): flow is PensionBoundaryFlow => flow !== null);

  if (pensionEntryMonth === null) {
    return {
      options,
      pensionFundIds,
      pensionEntryMonth: null,
      excludedAssetIds: outEverywhere,
      snapshots: toPerformanceBaseSnapshots(snapshots, outEverywhere),
      pensionFlows: contributionFlows,
    };
  }

  const withoutFunds = toPerformanceBaseSnapshots(snapshots, outEverywhere);
  const withFunds = toPerformanceBaseSnapshots(snapshots, otherExcluded);
  const projected = snapshots.map((snapshot, index) =>
    monthKey(snapshot.year, snapshot.month) >= pensionEntryMonth ? withFunds[index] : withoutFunds[index]
  );
  const entrySnapshot = snapshots.find((snapshot) => monthKey(snapshot.year, snapshot.month) === pensionEntryMonth)!;
  const entryFlow: PensionBoundaryFlow = {
    month: pensionEntryMonth,
    amount: sumPensionValue(entrySnapshot, fundIds),
    kind: 'entry',
  };

  return {
    options,
    pensionFundIds,
    pensionEntryMonth,
    excludedAssetIds: otherExcluded,
    snapshots: projected,
    pensionFlows: [entryFlow, ...contributionFlows].sort((a, b) => a.month.localeCompare(b.month)),
  };
}
