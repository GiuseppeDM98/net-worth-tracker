/**
 * drawdownSeries — l'indice di rendimento su cui si misurano tutti i drawdown di Rendimenti.
 *
 * PERCHÉ UN INDICE GEOMETRICO E NON `patrimonio − cashflow cumulativo`
 * La prima versione di Max Drawdown / Durata / Tempo di Recupero / grafico Underwater aggiustava il
 * patrimonio sottraendo la somma di tutti i contributi e prelievi dall'inizio del periodo. È un
 * aggiustamento ADDITIVO su una grandezza che si misura in percentuale, e ha due difetti:
 *
 *  1. **La base si restringe.** Chi accumula risparmio vede `NW − CF_cumulato` crescere molto meno
 *     del patrimonio: dopo qualche anno il denominatore è una frazione del capitale investito, e la
 *     stessa perdita in euro produce una percentuale di drawdown molto più profonda di quella vera.
 *     Al limite la base tocca lo zero (o va sotto) e la percentuale perde ogni significato.
 *  2. **Non era confrontabile con la heatmap.** La heatmap concatena i rendimenti mensili
 *     `(V_fine − CF_mese) / V_inizio − 1`; l'Underwater usava tutt'altra matematica. I due grafici
 *     rispondevano alla stessa domanda con numeri diversi, e la didascalia in pagina doveva
 *     scusarsene.
 *
 * L'indice qui sotto concatena esattamente i rendimenti mensili della heatmap. Il grafico Underwater
 * diventa così il cumulato della heatmap — la stessa cosa vista in due modi — e le percentuali di
 * drawdown sono quelle standard del Time-Weighted Return, indipendenti da quanto capitale è entrato.
 *
 * I mesi con patrimonio iniziale a zero vengono saltati (rendimento indefinito): l'indice resta
 * fermo, non si azzera.
 */

import type { MonthlySnapshot } from '@/types/assets';
import type { CashFlowData } from '@/types/performance';
import { buildCashFlowMap, monthKey } from '@/lib/utils/cashFlowMap';

/** Valore convenzionale di partenza dell'indice. Solo i rapporti contano, non il livello. */
const INDEX_BASE = 100;

/** Un punto dell'indice, con lo snapshot che lo ha prodotto (serve per le etichette di periodo). */
export interface TwrIndexPoint {
  /** Indice cumulato, base 100 al primo snapshot. */
  value: number;
  snapshot: MonthlySnapshot;
}

/** L'ampiezza massima e i tre indici che la delimitano. `value` è 0 quando non c'è mai stato un calo. */
export interface MaxDrawdownResult {
  /** Percentuale negativa (es. −7.07), 0 se il portafoglio non è mai sceso sotto un massimo. */
  value: number;
  /** Indice del massimo da cui parte il drawdown più profondo. */
  peakIndex: number;
  /** Indice del punto più basso. */
  troughIndex: number;
  /** Indice del primo mese che torna al livello del picco; `null` se il recupero non è ancora avvenuto. */
  recoveryIndex: number | null;
}

/**
 * Costruisce l'indice TWR concatenando i rendimenti mensili.
 *
 * `index[i] = index[i-1] × (1 + r_i)` con `r_i = (V_i − CF_i) / V_{i-1} − 1`, cioè la stessa formula
 * di `prepareMonthlyReturnsHeatmap`. Il primo punto vale sempre 100.
 *
 * @param snapshots - Snapshot già ordinati cronologicamente
 * @param cashFlows - Cashflow mensili (contributi/prelievi esterni, dividendi esclusi)
 * @returns Un punto per snapshot; array vuoto se non ci sono snapshot
 */
export function buildTwrIndex(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): TwrIndexPoint[] {
  if (snapshots.length === 0) return [];
  const cashFlowMap = buildCashFlowMap(cashFlows);

  const points: TwrIndexPoint[] = [{ value: INDEX_BASE, snapshot: snapshots[0] }];
  let index = INDEX_BASE;

  for (let i = 1; i < snapshots.length; i++) {
    const startNetWorth = snapshots[i - 1].totalNetWorth;
    const snapshot = snapshots[i];

    // `> 0`, non `!== 0`: un capitale di partenza negativo (mese liquidato, saldi netti negativi)
    // ribalterebbe il segno del rapporto e farebbe scendere l'indice mentre il portafoglio sale.
    if (startNetWorth > 0) {
      const cashFlow = cashFlowMap.get(monthKey(snapshot.year, snapshot.month)) ?? 0;
      index *= (snapshot.totalNetWorth - cashFlow) / startNetWorth;
    }

    points.push({ value: index, snapshot });
  }

  return points;
}

/**
 * Il drawdown puntuale di ogni punto rispetto al massimo raggiunto fino a quel momento.
 *
 * IL PRIMO PUNTO CONTA COME MASSIMO INIZIALE, ed è corretto che sia così: è il livello da cui il
 * periodo parte, quindi un portafoglio che scende dal primo mese è davvero sotto il suo massimo.
 * Far partire il picco dal secondo punto mostrerebbe 0% all'inizio di un periodo in discesa — cioè
 * "sei sul massimo" mentre stai perdendo — e romperebbe l'invariante che tiene insieme questa
 * pagina: l'Underwater è il cumulato dei rendimenti mensili della heatmap rispetto al massimo
 * corrente, e quel cumulato parte da 100 prima del primo mese misurato.
 *
 * @returns Percentuali ≤ 0, una per punto (0 = il portafoglio è su un nuovo massimo)
 */
export function computeDrawdownSeries(index: TwrIndexPoint[]): number[] {
  let peak = index[0]?.value ?? 0;
  return index.map((point) => {
    if (point.value > peak) peak = point.value;
    if (peak <= 0) return 0;
    return Math.min(0, ((point.value - peak) / peak) * 100);
  });
}

/**
 * Il drawdown più profondo della serie, con il picco da cui parte, il minimo e l'eventuale recupero.
 *
 * Il recupero è il primo mese DOPO il minimo che torna al livello del picco. Restando su un indice
 * monotono nei massimi, "tornare al picco" e "toccare un nuovo massimo" coincidono.
 *
 * @param index - Serie da `buildTwrIndex`
 * @returns `value: 0` (e indici a 0) quando il portafoglio non è mai sceso sotto un massimo
 */
export function findMaxDrawdown(index: TwrIndexPoint[]): MaxDrawdownResult {
  const empty: MaxDrawdownResult = { value: 0, peakIndex: 0, troughIndex: 0, recoveryIndex: null };
  if (index.length < 2) return empty;

  let peak = index[0].value;
  let peakIndex = 0;
  let worst = 0;
  let worstPeakIndex = 0;
  let worstTroughIndex = 0;

  for (let i = 0; i < index.length; i++) {
    const { value } = index[i];
    if (value > peak) {
      peak = value;
      peakIndex = i;
    }
    if (peak <= 0) continue;

    const drawdown = ((value - peak) / peak) * 100;
    if (drawdown < worst) {
      worst = drawdown;
      worstPeakIndex = peakIndex;
      worstTroughIndex = i;
    }
  }

  if (worst === 0) return empty;

  const peakValue = index[worstPeakIndex].value;
  let recoveryIndex: number | null = null;
  for (let i = worstTroughIndex + 1; i < index.length; i++) {
    if (index[i].value >= peakValue) {
      recoveryIndex = i;
      break;
    }
  }

  return { value: worst, peakIndex: worstPeakIndex, troughIndex: worstTroughIndex, recoveryIndex };
}
