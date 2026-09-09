/**
 * FIRE › What If — the numbers of the tab, read from the impact the service already computed.
 *
 * `calculateWhatIfImpact` perturbs the baseline and diffs the FIRE and Coast metrics; this
 * module turns that result into the shapes the tiles and the narrative read — the event as the
 * page states it (household-agnostic: months, an amount, a share of the income — never a
 * category), the job-loss hit split the way the tile explains it, every figure as a before/after
 * pair with the calendar years of the base scenario, the two walks merged into one series for
 * the overlaid chart, the divergence at the FIRE year, and the sensitivity reading. Nothing here
 * re-runs a projection: a figure that needs the walk comes from the walk's own `yearlyData`.
 *
 * Pure and Firestore-free; `lib/utils/whatIfNarrative.ts` puts these numbers into words.
 */

import type { FIRESensitivityMatrix } from '@/lib/services/fireService';
import type { FIREProjectionResult } from '@/types/assets';
import type { WhatIfAdjustedInputs, WhatIfBaseline, WhatIfEventType, WhatIfImpact, WhatIfScenario } from '@/types/whatIf';

// ─── The event ────────────────────────────────────────────────────────────────

export interface WhatIfEvent {
  kind: WhatIfEventType;
  /** True when the perturbation is zero — nothing to simulate, the page says so. */
  isEmpty: boolean;
  /** jobLoss: the window without the lost income. */
  months: number;
  /** jobLoss: the income that stops, per year — the UI's sum, whatever its sources. */
  lostAnnualIncome: number;
  /** jobLoss: `lostAnnualIncome` over the household income (expenses + savings); null when that is 0. */
  lostShareOfIncomePct: number | null;
  /** majorPurchase / windfall: the one-off amount. */
  lumpSum: number;
  /** cashflowChange: the yearly deltas. */
  savingsDelta: number;
  expensesDelta: number;
  /** `adjusted.netWorth − baseline.netWorth`. */
  netWorthDelta: number;
  netWorthAfter: number;
  savingsAfter: number;
  expensesAfter: number;
}

/** The event as the page states it, from the scenario the UI built and the inputs it produced. */
export function summarizeWhatIfEvent(scenario: WhatIfScenario, baseline: WhatIfBaseline, adjusted: WhatIfAdjustedInputs): WhatIfEvent {
  const householdIncome = baseline.annualExpenses + baseline.annualSavings;
  const months = Math.max(0, scenario.monthsWithoutIncome ?? 0);
  const lostAnnualIncome = Math.max(0, scenario.lostAnnualIncome ?? householdIncome);
  const lumpSum = Math.max(0, scenario.lumpSumAmount ?? 0);
  const savingsDelta = scenario.annualSavingsDelta ?? 0;
  const expensesDelta = scenario.annualExpensesDelta ?? 0;

  const isEmpty = (() => {
    switch (scenario.eventType) {
      case 'jobLoss':
        return months <= 0 || lostAnnualIncome <= 0;
      case 'majorPurchase':
      case 'windfall':
        return lumpSum <= 0;
      case 'cashflowChange':
        return savingsDelta === 0 && expensesDelta === 0;
    }
  })();

  return {
    kind: scenario.eventType,
    isEmpty,
    months,
    lostAnnualIncome,
    lostShareOfIncomePct: householdIncome > 0 ? (lostAnnualIncome / householdIncome) * 100 : null,
    lumpSum,
    savingsDelta,
    expensesDelta,
    netWorthDelta: adjusted.netWorth - baseline.netWorth,
    netWorthAfter: adjusted.netWorth,
    savingsAfter: adjusted.annualSavings,
    expensesAfter: adjusted.annualExpenses,
  };
}

// ─── The job-loss hit ─────────────────────────────────────────────────────────

export interface JobLossHit {
  /** Expenses + savings: what the household earns in a year. */
  totalIncome: number;
  /** What keeps coming in during the window. */
  retainedIncome: number;
  /** The savings no longer made — the lost income first eats the savings. */
  forgoneSavings: number;
  /** The expenses the retained income no longer covers, drawn from the portfolio. */
  drawnExpenses: number;
  /** `forgoneSavings + drawnExpenses` — equal to the service's net-worth hit. */
  total: number;
}

/**
 * The job-loss hit split the way the tile explains it: the retained income covers the expenses
 * first, so the portfolio pays only the uncovered part; the rest of the hit is the savings that
 * are no longer made. Pro-rated on the months. Generalises the full-income case to a partial
 * loss (one partner's salary) and always sums to the service's perturbation.
 */
export function decomposeJobLossHit(input: { annualSavings: number; annualExpenses: number; lostAnnualIncome: number; months: number }): JobLossHit {
  const months = Math.max(0, input.months);
  const lost = Math.max(0, input.lostAnnualIncome);
  const totalIncome = input.annualSavings + input.annualExpenses;
  const forgoneSavings = (Math.min(input.annualSavings, lost) * months) / 12;
  const drawnExpenses = (Math.max(lost - input.annualSavings, 0) * months) / 12;
  return {
    totalIncome,
    retainedIncome: Math.max(totalIncome - lost, 0),
    forgoneSavings,
    drawnExpenses,
    total: forgoneSavings + drawnExpenses,
  };
}

// ─── Before / after ───────────────────────────────────────────────────────────

export interface MetricPair {
  before: number;
  after: number;
  /** `after − before`. */
  delta: number;
}

export interface WhatIfTimeline {
  /** Base-scenario years to FIRE: 0 = reached today, null = not within the horizon. */
  yearsBefore: number | null;
  yearsAfter: number | null;
  /** `currentYear + years`; the current year when reached today; null beyond the horizon. */
  calendarBefore: number | null;
  calendarAfter: number | null;
  /** `yearsAfter − yearsBefore`; null when either side is beyond the horizon. */
  deltaYears: number | null;
  reachedBefore: boolean;
  reachedAfter: boolean;
  horizonYears: number;
  horizonCalendarYear: number;
}

export interface WhatIfCoastSummary {
  numberToday: MetricPair;
  /** `max(0, number − net worth)`: 0 once the target is reached. */
  gap: MetricPair;
  reachedBefore: boolean;
  reachedAfter: boolean;
  retirementAge: number;
}

export interface WhatIfSummary {
  timeline: WhatIfTimeline;
  netWorth: MetricPair;
  /** The bridge number when the lock is on (`isBridge`), else expenses ÷ SWR. */
  fireNumber: MetricPair;
  progressPct: MetricPair;
  /** The sustainable allowance per month, `annualAllowance / 12`. */
  monthlyIncome: MetricPair;
  coast: WhatIfCoastSummary | null;
  isBridge: boolean;
}

const pairOf = (before: number | null, after: number | null): MetricPair => {
  const b = before ?? 0;
  const a = after ?? 0;
  return { before: b, after: a, delta: a - b };
};

/** Every figure of the impact as a before/after pair, with the base scenario's calendar years. */
export function summarizeWhatIf(impact: WhatIfImpact, baseline: WhatIfBaseline, currentYear: number, horizonYears = 50): WhatIfSummary {
  const { yearsToFIRE } = impact.fire;
  const calendar = (years: number | null) => (years === null ? null : currentYear + years);
  const timeline: WhatIfTimeline = {
    yearsBefore: yearsToFIRE.before,
    yearsAfter: yearsToFIRE.after,
    calendarBefore: calendar(yearsToFIRE.before),
    calendarAfter: calendar(yearsToFIRE.after),
    deltaYears: yearsToFIRE.delta,
    reachedBefore: yearsToFIRE.before === 0,
    reachedAfter: yearsToFIRE.after === 0,
    horizonYears,
    horizonCalendarYear: currentYear + horizonYears,
  };

  const bridge = baseline.pensionBridge;
  return {
    timeline,
    netWorth: pairOf(baseline.netWorth, impact.adjusted.netWorth),
    fireNumber: pairOf(impact.fire.fireNumber.before, impact.fire.fireNumber.after),
    progressPct: pairOf(impact.fire.progressToFI.before, impact.fire.progressToFI.after),
    monthlyIncome: pairOf((impact.fire.annualAllowance.before ?? 0) / 12, (impact.fire.annualAllowance.after ?? 0) / 12),
    coast:
      impact.coast && baseline.coast
        ? {
            numberToday: pairOf(impact.coast.coastFireNumberToday.before, impact.coast.coastFireNumberToday.after),
            gap: pairOf(impact.coast.gapToCoastFI.before, impact.coast.gapToCoastFI.after),
            reachedBefore: impact.coast.isCoastReachedBefore,
            reachedAfter: impact.coast.isCoastReachedAfter,
            retirementAge: baseline.coast.retirementAge,
          }
        : null,
    isBridge: !!bridge && bridge.valueToday > 0 && bridge.yearsToUnlock > 0,
  };
}

// ─── The overlaid chart ───────────────────────────────────────────────────────

export interface WhatIfComparisonPoint {
  calendarYear: number;
  /** Base-scenario net worth of the plan of today; null for a year that walk does not cover. */
  before: number | null;
  after: number | null;
  /** The base-scenario FIRE number of each walk (inflated expenses ÷ SWR). */
  targetBefore: number | null;
  targetAfter: number | null;
}

/**
 * The two walks merged by calendar year, the union of the years they cover. A walk stops five
 * years after its last scenario reaches FIRE, so the two can differ in length: a side the walk
 * does not cover is null (a gap in the line), never a flat repeat of its last value.
 */
export function buildWhatIfComparisonSeries(before: FIREProjectionResult | null, after: FIREProjectionResult | null): WhatIfComparisonPoint[] {
  const byYear = new Map<number, WhatIfComparisonPoint>();
  const ensure = (year: number) => {
    let point = byYear.get(year);
    if (!point) {
      point = { calendarYear: year, before: null, after: null, targetBefore: null, targetAfter: null };
      byYear.set(year, point);
    }
    return point;
  };
  before?.yearlyData.forEach((row) => {
    const point = ensure(row.calendarYear);
    point.before = row.baseNetWorth;
    point.targetBefore = row.baseFireNumber;
  });
  after?.yearlyData.forEach((row) => {
    const point = ensure(row.calendarYear);
    point.after = row.baseNetWorth;
    point.targetAfter = row.baseFireNumber;
  });
  return [...byYear.values()].sort((a, b) => a.calendarYear - b.calendarYear);
}

// ─── The divergence ───────────────────────────────────────────────────────────

export interface WhatIfDivergence {
  /** The FIRE year of the plan of today, or of the plan after the event when today's never gets there. */
  calendarYear: number;
  before: number;
  after: number;
  /** `after − before` at that year: the hit (or the gain) of today, compounded. */
  gapThen: number;
}

/**
 * Both capitals at the FIRE year of the plan of today — the one figure only this tile has: the
 * perturbation of today read where it matters. Falls back to the FIRE year after the event when
 * the plan of today never reaches it; null when neither does or the target is already reached.
 */
export function summarizeDivergence(series: WhatIfComparisonPoint[], timeline: WhatIfTimeline): WhatIfDivergence | null {
  const year =
    timeline.yearsBefore !== null && timeline.yearsBefore > 0
      ? timeline.calendarBefore
      : timeline.yearsAfter !== null && timeline.yearsAfter > 0
        ? timeline.calendarAfter
        : null;
  if (year === null) return null;
  const point = series.find((p) => p.calendarYear === year);
  if (!point || point.before === null || point.after === null) return null;
  return { calendarYear: year, before: point.before, after: point.after, gapThen: point.after - point.before };
}

// ─── Sensitivity ──────────────────────────────────────────────────────────────

export interface SensitivityReading {
  baselineExpenses: number;
  baselineSavings: number;
  /** Years to FIRE at the baseline cell; null beyond the horizon. */
  baselineYears: number | null;
  /** The row one step below the baseline expenses (−10%), at the baseline savings. */
  lessSpending: { annualExpenses: number; years: number | null } | null;
  /** The column one step above the baseline savings (+25%, or the first positive fallback). */
  moreSaving: { annualSavings: number; label: string; years: number | null } | null;
}

/** The three cells the reading names: the baseline, spending 10% less, saving one step more. */
export function summarizeSensitivity(matrix: FIRESensitivityMatrix): SensitivityReading {
  const baselineColumn = matrix.columns.findIndex((column) => column.isBaseline);
  const baselineRow = matrix.rows.find((row) => row.multiplier === 1) ?? null;
  const lessRow = matrix.rows.find((row) => Math.abs(row.multiplier - 0.9) < 1e-9) ?? null;
  const nextColumn = baselineColumn >= 0 ? (matrix.columns[baselineColumn + 1] ?? null) : null;

  return {
    baselineExpenses: matrix.baselineAnnualExpenses,
    baselineSavings: matrix.baselineAnnualSavings,
    baselineYears: matrix.baselineYearsToFIRE,
    lessSpending:
      lessRow && baselineColumn >= 0 ? { annualExpenses: lessRow.annualExpenses, years: lessRow.cells[baselineColumn]?.yearsToFIRE ?? null } : null,
    moreSaving:
      baselineRow && nextColumn
        ? { annualSavings: nextColumn.annualSavings, label: nextColumn.label, years: baselineRow.cells[baselineColumn + 1]?.yearsToFIRE ?? null }
        : null,
  };
}
