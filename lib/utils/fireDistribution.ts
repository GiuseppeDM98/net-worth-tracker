/**
 * FIRE › Calcolatore — the Distribuzione view's numbers, read from the fan the tab already ran.
 *
 * The Ventaglio engine (`runAccumulationSimulation`) records, per path, the year it reaches the
 * moving FIRE target and what happens to its capital after that year on the same returns. This
 * module turns those per-path facts into the three things the view shows:
 *
 * 1. the DISTRIBUTION of the FIRE year — a histogram by calendar year with an «oltre l'orizzonte»
 *    bar for the paths that never get there, the year by which one path in ten, half and nine in
 *    ten are FIRE, and the two tails around the deterministic base year;
 * 2. the LEVER on the bad tail — how much more saving per year brings the 90th-percentile FIRE
 *    year within the base year, found by bisection over re-runs made on the SAME shocks (the
 *    runner the tab injects seeds every run identically, so the only thing that changes between
 *    two runs is the savings); the lucky tail moves with it and is reported too, because more
 *    saving weighs on the good tail as much as on the bad one;
 * 3. the RETIREMENT survival — among the paths that reach FIRE, how many still hold capital at
 *    the horizon once they withdraw the inflated expenses from their own FIRE year on.
 *
 * Not a Gaussian: the FIRE year is skewed right and cut by the horizon, with a mass on «never».
 * The view therefore bins years and never fits a curve.
 *
 * Pure and Firestore-free; `lib/utils/fireNarrative.ts` puts these numbers into words.
 */

import type { AccumulationSimulationResult } from '@/lib/services/monteCarloService';
import { binYears, type YearHistogramBin } from '@/lib/utils/yearHistogram';

// ─── The FIRE-year distribution ───────────────────────────────────────────────

export interface FireYearDistribution {
  /** Calendar-year bins of the paths that reach FIRE within the horizon. */
  bins: YearHistogramBin[];
  binWidthYears: number;
  pathCount: number;
  /** Paths that do not reach FIRE within the simulated horizon — the «oltre» bar. */
  neverCount: number;
  neverPct: number;
  horizonCalendarYear: number;
  /** The deterministic base scenario's year; null when that walk never reaches FIRE. */
  baseCalendarYear: number | null;
  /** The deterministic walk is FIRE at year 0: every path starts past the target. */
  atStart: boolean;
  /** The calendar year by which 10% / 50% / 90% of the paths are FIRE; null when that share is not reached within the horizon. */
  p10Year: number | null;
  p50Year: number | null;
  p90Year: number | null;
  /** The tails around the base year: FIRE before it, in it, after it (the «never» paths count as late). */
  earlyCount: number;
  atBaseCount: number;
  lateCount: number;
}

/** Sorted ascending, «never» last: the shape every percentile of the FIRE year reads. */
function sortedFireYears(fireYears: (number | null)[]): number[] {
  return fireYears.map((year) => (year === null ? Number.POSITIVE_INFINITY : year)).sort((a, b) => a - b);
}

/**
 * The year (from today) by which AT LEAST `fraction` of the paths are FIRE — the nearest-rank
 * percentile, `sorted[ceil(n × fraction) − 1]`, chosen over the fan's `floor(n × fraction)`
 * because the sentence built on it («nove percorsi su dieci entro il 2041») must be exactly
 * true, ties included: the 900th smallest of 1000 years is the year the 900th path got there.
 * Null when that path never reaches FIRE within the horizon.
 */
export function fireYearAtPercentile(fireYears: (number | null)[], fraction: number): number | null {
  if (fireYears.length === 0) return null;
  const sorted = sortedFireYears(fireYears);
  const year = sorted[nearestRankIndex(sorted.length, fraction)];
  return Number.isFinite(year) ? year : null;
}

/** `ceil(n × fraction) − 1`, clamped to the array: the index of the nearest-rank percentile. */
function nearestRankIndex(count: number, fraction: number): number {
  return Math.min(count - 1, Math.max(0, Math.ceil(count * fraction) - 1));
}

export function summarizeFireYearDistribution(
  result: AccumulationSimulationResult,
  startCalendarYear: number,
  deterministicBaseYears: number | null,
  maxBins = 12,
): FireYearDistribution {
  const horizonYears = result.percentiles.length - 1;
  const horizonCalendarYear = startCalendarYear + horizonYears;
  const reached = result.fireYears.filter((year): year is number => year !== null);
  const baseCalendarYear = deterministicBaseYears !== null ? startCalendarYear + deterministicBaseYears : null;
  const { bins, binWidthYears } = binYears(
    reached.map((year) => startCalendarYear + year),
    { total: result.fireYears.length, referenceYear: baseCalendarYear, maxBins, ceilingYear: horizonCalendarYear },
  );
  const calendarOf = (fraction: number): number | null => {
    const year = fireYearAtPercentile(result.fireYears, fraction);
    return year === null ? null : startCalendarYear + year;
  };
  const neverCount = result.fireYears.length - reached.length;
  const pathCount = result.fireYears.length;

  return {
    bins,
    binWidthYears,
    pathCount,
    neverCount,
    neverPct: pathCount > 0 ? (neverCount / pathCount) * 100 : 0,
    horizonCalendarYear,
    baseCalendarYear,
    atStart: deterministicBaseYears === 0,
    p10Year: calendarOf(0.1),
    p50Year: calendarOf(0.5),
    p90Year: calendarOf(0.9),
    earlyCount: deterministicBaseYears === null ? reached.length : reached.filter((year) => year < deterministicBaseYears).length,
    atBaseCount: deterministicBaseYears === null ? 0 : reached.filter((year) => year === deterministicBaseYears).length,
    lateCount: deterministicBaseYears === null ? neverCount : reached.filter((year) => year > deterministicBaseYears).length + neverCount,
  };
}

// ─── The lever on the bad tail ────────────────────────────────────────────────

export interface TailLeverInput {
  /** The run the view shows, made with `baseAnnualSavings`. */
  baseResult: AccumulationSimulationResult;
  /** Re-runs the simulation with other annual savings — on the SAME shocks, or the answer is noise. */
  run: (annualSavings: number) => AccumulationSimulationResult;
  baseAnnualSavings: number;
  /** The year (from today) to bring the tail within — the deterministic base year. */
  targetYears: number;
  /** Which tail: 0.9 is the year by which nine paths in ten are FIRE (default). */
  percentile?: number;
  /** The most extra saving per year the search tries. */
  extraCap: number;
  /** The unit the answer is rounded UP to (default 100 € a year). */
  step?: number;
}

export interface TailLever {
  targetYears: number;
  percentile: number;
  /** Extra annual saving that brings the tail within the target; 0 = already there; null = not within `extraCap`. */
  extraAnnualSavings: number | null;
  extraCap: number;
  /** The tail's year (from today) with the base savings and with the answer (with the cap when unreachable); null = beyond the horizon. */
  tailYearsBefore: number | null;
  tailYearsAfter: number | null;
  /** The lucky tail (one path in ten) before and after: it moves too, and the sentence says by how much. */
  luckyYearsBefore: number | null;
  luckyYearsAfter: number | null;
}

const LUCKY_PERCENTILE = 0.1;

/**
 * The most extra saving per year the lever search tries: three times the current saving, or the
 * annual expenses, whichever is more, never under 12.000 € — rounded up to the thousand so the
 * sentence that names it reads as a round figure.
 */
export function resolveLeverCap(annualSavings: number, annualExpenses: number): number {
  return Math.ceil(Math.max(3 * annualSavings, annualExpenses, 12_000) / 1000) * 1000;
}

/**
 * The extra annual saving that brings the tail's FIRE year within the target, by bisection.
 *
 * More saving never delays a path (the same returns on a larger portfolio), so «within the
 * target» is monotone in the savings and a bisection finds the smallest extra that meets it;
 * the answer is rounded UP to `step` and re-run, so the figure printed is one that actually
 * meets the target. About log2(cap / step) + 3 runs.
 */
export function solveSavingsForTail(input: TailLeverInput): TailLever {
  const percentile = input.percentile ?? 0.9;
  const step = input.step ?? 100;
  const tailOf = (result: AccumulationSimulationResult) => fireYearAtPercentile(result.fireYears, percentile);
  const luckyOf = (result: AccumulationSimulationResult) => fireYearAtPercentile(result.fireYears, LUCKY_PERCENTILE);
  const meets = (result: AccumulationSimulationResult) => {
    const year = tailOf(result);
    return year !== null && year <= input.targetYears;
  };
  const withExtra = (extra: number) => input.run(input.baseAnnualSavings + extra);

  const shared = {
    targetYears: input.targetYears,
    percentile,
    extraCap: input.extraCap,
    tailYearsBefore: tailOf(input.baseResult),
    luckyYearsBefore: luckyOf(input.baseResult),
  };

  if (meets(input.baseResult)) {
    return { ...shared, extraAnnualSavings: 0, tailYearsAfter: shared.tailYearsBefore, luckyYearsAfter: shared.luckyYearsBefore };
  }

  const atCap = withExtra(input.extraCap);
  if (!meets(atCap)) {
    return { ...shared, extraAnnualSavings: null, tailYearsAfter: tailOf(atCap), luckyYearsAfter: luckyOf(atCap) };
  }

  // Invariant: `low` does not meet the target, `high` does.
  let low = 0;
  let high = input.extraCap;
  while (high - low > step) {
    const mid = (low + high) / 2;
    if (meets(withExtra(mid))) high = mid;
    else low = mid;
  }
  const extra = Math.ceil(high / step) * step;
  const answer = withExtra(extra);
  return { ...shared, extraAnnualSavings: extra, tailYearsAfter: tailOf(answer), luckyYearsAfter: luckyOf(answer) };
}

// ─── Retirement survival: «dal FIRE in poi» ───────────────────────────────────

export interface RetirementSurvival {
  /** Paths that reach FIRE within the horizon — the ones that retire. */
  retiredCount: number;
  survivedCount: number;
  ruinedCount: number;
  survivedPct: number;
  horizonCalendarYear: number;
  /** The age at the horizon, when the age is known. */
  horizonAge: number | null;
  /** The calendar year by which one retired path in ten has run out; null when fewer than one in ten do. */
  p10RuinCalendarYear: number | null;
  /** Among the ruined paths, the median number of years the capital lasted after the FIRE year. */
  medianYearsLastedWhenRuined: number | null;
}

export function summarizeRetirementSurvival(
  result: AccumulationSimulationResult,
  startCalendarYear: number,
  userAge: number | undefined,
): RetirementSurvival | null {
  const retired = result.retirements.filter((outcome): outcome is NonNullable<typeof outcome> => outcome !== null);
  if (retired.length === 0) return null;
  const ruined = retired.filter((outcome) => outcome.ruinYear !== null);
  const ruinYears = retired.map((outcome) => (outcome.ruinYear === null ? Number.POSITIVE_INFINITY : outcome.ruinYear)).sort((a, b) => a - b);
  // Nearest rank again: the year by which at least one retired path in ten has run out.
  const p10Ruin = ruinYears[nearestRankIndex(ruinYears.length, 0.1)];
  const lasted = ruined.map((outcome) => (outcome.ruinYear as number) - outcome.fireYear).sort((a, b) => a - b);
  const horizonYears = result.retirementHorizonYears;

  return {
    retiredCount: retired.length,
    survivedCount: retired.length - ruined.length,
    ruinedCount: ruined.length,
    survivedPct: ((retired.length - ruined.length) / retired.length) * 100,
    horizonCalendarYear: startCalendarYear + horizonYears,
    horizonAge: userAge !== undefined && Number.isFinite(userAge) ? userAge + horizonYears : null,
    p10RuinCalendarYear: Number.isFinite(p10Ruin) ? startCalendarYear + p10Ruin : null,
    medianYearsLastedWhenRuined: lasted.length > 0 ? lasted[Math.floor(lasted.length / 2)] : null,
  };
}
