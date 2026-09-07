/**
 * cashFlowMap — l'unico modo di indicizzare i cash flow per mese, in tutta la pipeline di Rendimenti.
 *
 * PERCHÉ ESISTE
 * Ogni formula che neutralizza i flussi (TWR, volatilità, indice dei drawdown, grafico Evoluzione)
 * ha bisogno della stessa cosa: dato un mese, quanto denaro è entrato o uscito. La costruzione della
 * mappa era ricopiata quattro volte, identica riga per riga, in `performanceService.ts` (tre punti)
 * e in `drawdownSeries.ts`. Quattro copie della stessa regola sono quattro occasioni perché una
 * cambi e le altre no — e siccome quelle quattro funzioni devono per forza leggere la STESSA serie
 * (è l'invariante di riconciliazione fra heatmap, Underwater e Max Drawdown), una divergenza qui si
 * manifesterebbe come due grafici che raccontano storie diverse, non come un errore.
 *
 * L'INVARIANTE CHE NESSUNO DICHIARAVA: UN FLUSSO PER MESE
 * Le quattro copie davano per scontato che ci fosse al massimo un `CashFlowData` per mese — vero
 * oggi, perché `getCashFlowsFromExpenses` aggrega per mese a monte — ma nessuna lo verificava: con
 * due elementi sullo stesso mese, `map.set` avrebbe tenuto in silenzio solo l'ultimo, buttando via
 * l'altro senza che niente lo segnalasse. Qui i flussi dello stesso mese si **sommano**, che è
 * l'unica lettura sensata e non può perdere denaro. Sui dati attuali non cambia nulla: cambia solo
 * ciò che succederebbe se l'assunzione a monte venisse meno.
 *
 * IL SECONDO CANALE: I FLUSSI DEI FONDI PENSIONE (2026-09-06)
 * Il denaro che entra o esce dalla base misurata attraverso i fondi pensione (TFR, datoriale, un
 * volontario da busta paga, l'ingresso del fondo nella base, o un volontario da conto quando il
 * fondo è fuori) non passa dal cashflow: non è in `netCashFlow` e non deve esserlo, perché quel
 * numero è «quanto hai messo da parte» nella tessera Contributi. Viaggia in `pensionFlow`, e
 * `externalFlowOf` è l'UNICA somma dei due canali — la mappa la usa, e così ogni formula che
 * neutralizza i flussi la vede senza saperlo. `mergePensionFlows` è dove i flussi entrano nella
 * serie, mese per mese, una volta sola.
 *
 * IL TERZO CANALE: I FLUSSI MISURATI SUL CONFINE DELLA BASE (2026-09-07)
 * Quando la base è un sottoinsieme del patrimonio, il risparmio del Cashflow non è il capitale che
 * l'ha attraversata: un acquisto pagato da un conto fuori dalla base è denaro che entra, e il
 * Cashflow salta i trasferimenti per costruzione (issue/PR #319). Per i mesi in cui il confine si
 * può misurare — registro operazioni e Δquantità del `byAsset`, `lib/utils/portfolioFlows.ts` —
 * `portfolioFlow` SOSTITUISCE `netCashFlow` in `externalFlowOf`; dove non si può (`null`/assente)
 * si torna al risparmio del Cashflow. `netCashFlow` non cambia mai significato: resta ciò che la
 * tessera Contributi stampa come «messi da parte».
 */

import type { CashFlowData, PensionBoundaryFlow, PortfolioBoundaryFlow } from '@/types/performance';

/**
 * La chiave `YYYY-MM` di un mese.
 *
 * Un'unica funzione per i due lati della ricerca: chi costruisce la mappa parte da una `Date`, chi
 * la interroga parte dai campi `year`/`month` di uno snapshot. Erano due format string separate, e
 * bastava che una perdesse il padding perché la ricerca fallisse in silenzio restituendo 0 — cioè
 * "nessun cash flow questo mese", il valore più difficile da distinguere da un dato corretto.
 *
 * @param year - Anno completo (es. 2026)
 * @param month - Mese 1-based (1 = gennaio)
 */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** La chiave `YYYY-MM` del mese in cui cade una data. */
export function monthKeyOf(date: Date): string {
  return monthKey(date.getFullYear(), date.getMonth() + 1);
}

/**
 * Tutto il capitale esterno che ha attraversato la base in un mese: il flusso misurato sul confine
 * quando il mese lo ha (`portfolioFlow`), altrimenti il risparmio del cashflow, più il canale dei
 * fondi pensione. È il numero che ogni formula di rendimento sottrae — mai `netCashFlow` da solo,
 * che è la metà stampata dalla tessera Contributi.
 */
export function externalFlowOf(cashFlow: CashFlowData): number {
  return (cashFlow.portfolioFlow ?? cashFlow.netCashFlow) + (cashFlow.pensionFlow ?? 0);
}

/**
 * Indicizza i cash flow esterni per mese.
 *
 * @param cashFlows - Flussi mensili (contributi/prelievi esterni; i dividendi sono già esclusi da
 *   `netCashFlow` a monte, perché sono rendimento del portafoglio e non capitale che entra)
 * @returns Mappa `YYYY-MM` → flusso esterno del mese (`externalFlowOf`), sommato se più elementi
 *   cadono nello stesso
 */
export function buildCashFlowMap(cashFlows: CashFlowData[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const cashFlow of cashFlows) {
    const key = monthKeyOf(cashFlow.date);
    map.set(key, (map.get(key) ?? 0) + externalFlowOf(cashFlow));
  }
  return map;
}

/**
 * Innesta i flussi dei fondi pensione nella serie mensile dei cash flow, dentro una finestra.
 *
 * Un flusso che cade in un mese già presente si somma al suo `pensionFlow`; un mese che il cashflow
 * non conosce (nessuna spesa registrata, ma un TFR accreditato) nasce come riga a zero con il solo
 * `pensionFlow`, così la mappa lo vede. `netCashFlow`, `income` ed `expenses` non vengono toccati.
 * La finestra è per mese, estremi inclusi: la stessa che `getCashFlowsFromExpenses` applica alle
 * spese, letta sui mesi perché un flusso pensionistico ha un mese e non un giorno.
 *
 * @param cashFlows - La serie costruita dalle spese (qualsiasi ordine; non viene mutata)
 * @param pensionFlows - I flussi da `resolvePerformanceBase`, di qualsiasi periodo
 * @param startDate - Primo giorno della finestra (il suo mese è il primo incluso)
 * @param endDate - Ultimo istante della finestra (il suo mese è l'ultimo incluso)
 * @returns Una nuova serie, ordinata per data
 */
export function mergePensionFlows(
  cashFlows: CashFlowData[],
  pensionFlows: PensionBoundaryFlow[],
  startDate: Date,
  endDate: Date
): CashFlowData[] {
  const firstKey = monthKeyOf(startDate);
  const lastKey = monthKeyOf(endDate);
  const inWindow = pensionFlows.filter((flow) => flow.month >= firstKey && flow.month <= lastKey);
  if (inWindow.length === 0) return cashFlows;

  const byMonth = new Map<string, CashFlowData>(
    cashFlows.map((cashFlow) => [monthKeyOf(cashFlow.date), { ...cashFlow }])
  );
  for (const flow of inWindow) {
    const existing = byMonth.get(flow.month);
    if (existing) {
      existing.pensionFlow = (existing.pensionFlow ?? 0) + flow.amount;
      continue;
    }
    const [year, month] = flow.month.split('-').map(Number);
    byMonth.set(flow.month, {
      date: new Date(year, month - 1, 1),
      income: 0,
      expenses: 0,
      dividendIncome: 0,
      netCashFlow: 0,
      pensionFlow: flow.amount,
    });
  }

  return [...byMonth.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Innesta i flussi misurati sul confine della base nella serie mensile, dentro una finestra.
 *
 * Stessa forma di `mergePensionFlows`: un mese già presente riceve il suo `portfolioFlow`, un mese
 * che il cashflow non conosce nasce come riga a zero con il solo flusso misurato. Un mese della
 * finestra SENZA flusso misurato resta com'è, con `portfolioFlow` assente: è `externalFlowOf` a
 * ricadere sul risparmio del cashflow, e la distinzione fra «misurato a zero» e «non misurabile»
 * sopravvive fino alla formula. `netCashFlow`, `income` ed `expenses` non vengono toccati.
 *
 * @param cashFlows - La serie costruita dalle spese (qualsiasi ordine; non viene mutata)
 * @param portfolioFlows - I flussi da `resolvePerformanceBase`, di qualsiasi periodo
 * @param startDate - Primo giorno della finestra (il suo mese è il primo incluso)
 * @param endDate - Ultimo istante della finestra (il suo mese è l'ultimo incluso)
 * @returns Una nuova serie, ordinata per data
 */
export function mergePortfolioFlows(
  cashFlows: CashFlowData[],
  portfolioFlows: PortfolioBoundaryFlow[],
  startDate: Date,
  endDate: Date
): CashFlowData[] {
  const firstKey = monthKeyOf(startDate);
  const lastKey = monthKeyOf(endDate);
  const inWindow = portfolioFlows.filter((flow) => flow.month >= firstKey && flow.month <= lastKey);
  if (inWindow.length === 0) return cashFlows;

  const byMonth = new Map<string, CashFlowData>(
    cashFlows.map((cashFlow) => [monthKeyOf(cashFlow.date), { ...cashFlow }])
  );
  for (const flow of inWindow) {
    const existing = byMonth.get(flow.month);
    if (existing) {
      existing.portfolioFlow = (existing.portfolioFlow ?? 0) + flow.amount;
      continue;
    }
    const [year, month] = flow.month.split('-').map(Number);
    byMonth.set(flow.month, {
      date: new Date(year, month - 1, 1),
      income: 0,
      expenses: 0,
      dividendIncome: 0,
      netCashFlow: 0,
      portfolioFlow: flow.amount,
    });
  }

  return [...byMonth.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}
