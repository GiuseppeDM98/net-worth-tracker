/**
 * FIRE › Monte Carlo — the numbers of the tab, read from the results the service already ran.
 *
 * `runMonteCarloSimulation` produces the success rate, the per-year percentiles, the failure
 * analysis and the final-value histogram; this module turns one run (the base scenario) and the
 * three scenario runs into the shapes the tiles and the narrative read — the horizon dated in
 * calendar years and in age, the year the 10th percentile first touches zero (the «10% peggiore»
 * of the verdict), the final percentiles of ALL simulations (never the survivors-only median),
 * the histogram with the bin holding the median, the scenarios side by side, the Dettaglio's
 * overlay and percentile rows, the plan as typed, and the «changed since the last run» check.
 * Nothing here re-runs a simulation: every figure is one of the run's own.
 *
 * Pure and Firestore-free; `lib/utils/monteCarloNarrative.ts` puts these numbers into words.
 */

import type { MonteCarloCapitalInflow, MonteCarloParams, MonteCarloResults, MonteCarloScenarios, PercentilesData } from '@/types/assets';
import type { VerdictTone } from '@/lib/utils/narrative';

// ─── Context ──────────────────────────────────────────────────────────────────

export interface MonteCarloContext {
  /** Calendar year of the simulation's year 0. */
  startCalendarYear: number;
  /** The saved age, if any — names «fino a 81 anni»; null drops the age clauses. */
  currentAge: number | null;
}

// ─── The base run ─────────────────────────────────────────────────────────────

export interface FinalPercentiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface HistogramBin {
  from: number;
  to: number;
  count: number;
  sharePct: number;
  /** The bin the median of all simulations falls in — outlined on the chart. */
  containsMedian: boolean;
}

export interface MonteCarloRun {
  successRate: number;
  successCount: number;
  failureCount: number;
  simulations: number;
  years: number;
  endCalendarYear: number;
  endAge: number | null;
  /** The median final value of ALL simulations (failed ones count as 0): the last row's p50. */
  medianFinal: number;
  finalPercentiles: FinalPercentiles;
  /** First simulation year (1-based) at which the 10th percentile is zero; null when it never is. */
  p10DepletionYear: number | null;
  p10DepletionCalendarYear: number | null;
  p10DepletionAge: number | null;
  /** Among the failed simulations only — rounded to the year. */
  failureAverageYear: number | null;
  failureAverageCalendarYear: number | null;
  failureMedianYear: number | null;
  failureMedianCalendarYear: number | null;
  histogram: HistogramBin[];
  /** Upper bound of the equal-width range — the 95th percentile the service caps the bins at. */
  histogramCap: number;
  /** Upper bound of the last bin — the largest final value simulated. */
  histogramMax: number;
}

/**
 * The first year (from 1) at which the 10th percentile is zero — i.e. at least one simulation in
 * ten has run out of money by then. Year 0 is the starting capital and is never read.
 */
export function resolveP10DepletionYear(percentiles: PercentilesData[]): number | null {
  const hit = percentiles.find((row) => row.year >= 1 && row.p10 <= 0);
  return hit ? hit.year : null;
}

function calendarOf(year: number | null, ctx: MonteCarloContext): number | null {
  return year === null ? null : ctx.startCalendarYear + year;
}

function ageAt(year: number | null, ctx: MonteCarloContext): number | null {
  return year === null || ctx.currentAge === null ? null : ctx.currentAge + year;
}

function buildHistogram(results: MonteCarloResults, median: number): HistogramBin[] {
  const bins = results.distribution;
  const last = bins.length - 1;
  return bins.map((bin, index) => {
    const from = bin.from ?? 0;
    const to = bin.to ?? 0;
    // Half-open bins, the last one closed on its upper bound — the service's own rule.
    const containsMedian = index === last ? median >= from && median <= to : median >= from && median < to;
    return { from, to, count: bin.count, sharePct: bin.percentage, containsMedian };
  });
}

export function summarizeMonteCarloRun(results: MonteCarloResults, params: MonteCarloParams, ctx: MonteCarloContext): MonteCarloRun {
  const years = params.retirementYears;
  const lastRow = results.percentiles[results.percentiles.length - 1];
  const finalPercentiles: FinalPercentiles = lastRow
    ? { p10: lastRow.p10, p25: lastRow.p25, p50: lastRow.p50, p75: lastRow.p75, p90: lastRow.p90 }
    : { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 };
  const p10DepletionYear = resolveP10DepletionYear(results.percentiles);
  const failureAverageYear = results.failureAnalysis ? Math.round(results.failureAnalysis.averageFailureYear) : null;
  const failureMedianYear = results.failureAnalysis ? Math.round(results.failureAnalysis.medianFailureYear) : null;
  const histogram = buildHistogram(results, finalPercentiles.p50);

  return {
    successRate: results.successRate,
    successCount: results.successCount,
    failureCount: results.failureCount,
    simulations: params.numberOfSimulations,
    years,
    endCalendarYear: ctx.startCalendarYear + years,
    endAge: ageAt(years, ctx),
    medianFinal: finalPercentiles.p50,
    finalPercentiles,
    p10DepletionYear,
    p10DepletionCalendarYear: calendarOf(p10DepletionYear, ctx),
    p10DepletionAge: ageAt(p10DepletionYear, ctx),
    failureAverageYear,
    failureAverageCalendarYear: calendarOf(failureAverageYear, ctx),
    failureMedianYear,
    failureMedianCalendarYear: calendarOf(failureMedianYear, ctx),
    histogram,
    histogramCap: histogram.length > 1 ? histogram[histogram.length - 2].to : histogram.length === 1 ? histogram[0].to : 0,
    histogramMax: histogram.length > 0 ? histogram[histogram.length - 1].to : 0,
  };
}

// ─── The three scenarios ──────────────────────────────────────────────────────

export type ScenarioKey = 'bear' | 'base' | 'bull';

export interface ScenarioResults {
  bear: MonteCarloResults;
  base: MonteCarloResults;
  bull: MonteCarloResults;
}

export interface ScenarioRunSummary {
  key: ScenarioKey;
  successRate: number;
  successCount: number;
  failureCount: number;
  /** Median final value of all simulations (the last row's p50). */
  medianFinal: number;
  p10DepletionCalendarYear: number | null;
}

export interface ScenarioComparison {
  /** Bear, base, bull — in that order. */
  rows: ScenarioRunSummary[];
  /** Bull probability minus bear probability, in points. */
  spreadPoints: number;
}

export const SCENARIO_KEYS: ScenarioKey[] = ['bear', 'base', 'bull'];

export function summarizeScenarios(results: ScenarioResults, params: MonteCarloParams, ctx: MonteCarloContext): ScenarioComparison {
  const rows = SCENARIO_KEYS.map((key) => {
    const run = summarizeMonteCarloRun(results[key], params, ctx);
    return {
      key,
      successRate: run.successRate,
      successCount: run.successCount,
      failureCount: run.failureCount,
      medianFinal: run.medianFinal,
      p10DepletionCalendarYear: run.p10DepletionCalendarYear,
    };
  });
  return { rows, spreadPoints: rows[2].successRate - rows[0].successRate };
}

// ─── Dettaglio: the overlay and the percentile rows ──────────────────────────

export interface OverlayPoint {
  calendarYear: number;
  bearP50: number;
  baseP50: number;
  bullP50: number;
  /** The base scenario's 10–90 band, drawn faintly behind the three medians. */
  baseBand: [number, number];
}

/** The three medians and the base band on one calendar axis (the base run sets the length). */
export function buildOverlaySeries(results: ScenarioResults, startCalendarYear: number): OverlayPoint[] {
  return results.base.percentiles.map((baseRow, index) => ({
    calendarYear: startCalendarYear + baseRow.year,
    bearP50: results.bear.percentiles[index]?.p50 ?? 0,
    baseP50: baseRow.p50,
    bullP50: results.bull.percentiles[index]?.p50 ?? 0,
    baseBand: [baseRow.p10, baseRow.p90],
  }));
}

export interface PercentileRow extends FinalPercentiles {
  calendarYear: number;
}

/** Every `step` years from year 0, plus the last year whatever the horizon. */
export function buildPercentileRows(percentiles: PercentilesData[], startCalendarYear: number, step = 5): PercentileRow[] {
  const lastIndex = percentiles.length - 1;
  return percentiles
    .filter((row, index) => row.year % step === 0 || index === lastIndex)
    .map((row) => ({ calendarYear: startCalendarYear + row.year, p10: row.p10, p25: row.p25, p50: row.p50, p75: row.p75, p90: row.p90 }));
}

// ─── The plan as typed ────────────────────────────────────────────────────────

export type AllocationKey = 'equity' | 'bonds' | 'realEstate' | 'commodities';

export interface PlanAllocationEntry {
  key: AllocationKey;
  /** The class as the sentence names it («azioni»). */
  label: string;
  pct: number;
}

export interface PlanInflow {
  yearOffset: number;
  calendarYear: number;
  amount: number;
}

export interface MonteCarloPlan {
  initialPortfolio: number;
  /** The pension capital the lock keeps out of the starting portfolio (0 without the lock). */
  lockedValue: number;
  annualWithdrawal: number;
  isIndexed: boolean;
  years: number;
  endAge: number | null;
  endCalendarYear: number;
  simulations: number;
  /** Only the classes above 0%, in the model's order. */
  allocation: PlanAllocationEntry[];
  inflows: PlanInflow[];
}

const ALLOCATION_LABELS: { key: AllocationKey; label: string; field: keyof MonteCarloParams }[] = [
  { key: 'equity', label: 'azioni', field: 'equityPercentage' },
  { key: 'bonds', label: 'obbligazioni', field: 'bondsPercentage' },
  { key: 'realEstate', label: 'immobili', field: 'realEstatePercentage' },
  { key: 'commodities', label: 'materie prime', field: 'commoditiesPercentage' },
];

export function summarizeMonteCarloPlan(params: MonteCarloParams, inflows: MonteCarloCapitalInflow[], lockedValue: number, ctx: MonteCarloContext): MonteCarloPlan {
  return {
    initialPortfolio: params.initialPortfolio,
    lockedValue,
    annualWithdrawal: params.annualWithdrawal,
    isIndexed: params.withdrawalAdjustment === 'inflation',
    years: params.retirementYears,
    endAge: ageAt(params.retirementYears, ctx),
    endCalendarYear: ctx.startCalendarYear + params.retirementYears,
    simulations: params.numberOfSimulations,
    allocation: ALLOCATION_LABELS.map(({ key, label, field }) => ({ key, label, pct: params[field] as number })).filter((entry) => entry.pct > 0),
    inflows: inflows.map((inflow) => ({ yearOffset: inflow.year, calendarYear: ctx.startCalendarYear + inflow.year, amount: inflow.amount })),
  };
}

// ─── Changed since the last run? ──────────────────────────────────────────────

export interface MonteCarloRunInputs {
  params: MonteCarloParams;
  scenarios: MonteCarloScenarios;
  inflows: MonteCarloCapitalInflow[];
}

/** The plan fields a run reads. The single form's market fields are NOT among them: the scenarios carry those. */
const PLAN_FIELDS: (keyof MonteCarloParams)[] = [
  'initialPortfolio',
  'retirementYears',
  'equityPercentage',
  'bondsPercentage',
  'realEstatePercentage',
  'commoditiesPercentage',
  'annualWithdrawal',
  'withdrawalAdjustment',
  'numberOfSimulations',
];

/**
 * True when the typed inputs differ from the ones the shown results were run with — the
 * Parametri footer then says the figures are the last run's until Esegui is pressed.
 */
export function haveRunInputsChanged(last: MonteCarloRunInputs, current: MonteCarloRunInputs): boolean {
  if (PLAN_FIELDS.some((field) => last.params[field] !== current.params[field])) return true;
  for (const key of SCENARIO_KEYS) {
    const a = last.scenarios[key];
    const b = current.scenarios[key];
    for (const field of Object.keys(a) as (keyof typeof a)[]) {
      if (a[field] !== b[field]) return true;
    }
  }
  if (last.inflows.length !== current.inflows.length) return true;
  return last.inflows.some((inflow, index) => inflow.year !== current.inflows[index].year || inflow.amount !== current.inflows[index].amount);
}

// ─── Tone ─────────────────────────────────────────────────────────────────────

/** The old hero's thresholds, kept: ≥ 90 solid, 80–89 to watch, below 80 to rework. */
export function resolveSuccessTone(successRate: number): VerdictTone {
  if (successRate >= 90) return 'positive';
  if (successRate >= 80) return 'warning';
  return 'negative';
}

// ─── The form's numbers ───────────────────────────────────────────────────────

/**
 * Parses what the Patrimonio iniziale field holds — an it-IT amount («488.600,00»), a plain
 * number («488600») or a mix — into a number; null when nothing numeric is typed.
 */
export function parseItalianNumber(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '');
  if (cleaned === '') return null;
  // A comma is the decimal separator; dots are thousands separators unless no comma is present
  // and there is exactly one dot followed by 1-2 digits (a plain «12.5» typed by hand).
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : /^-?\d+\.\d{1,2}$/.test(cleaned)
      ? cleaned
      : cleaned.replace(/\./g, '');
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? value : null;
}

/** «488.600» — how the amount field prints a committed value. */
export function formatInputAmount(value: number): string {
  return Math.round(value).toLocaleString('it-IT');
}
