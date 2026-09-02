/**
 * Storico's numbers: everything a tile of that page shows that the snapshots do not carry as
 * a field. Pure and clock-free — the page passes the snapshots and, where a "today" is needed,
 * the latest snapshot IS today (a snapshot is a frozen end-of-month photograph).
 *
 * Two figures here are deliberately NOT what Rendimenti computes, and the difference is the
 * point of the page: the growth since the first snapshot and its CAGR are WEALTH growth —
 * contributions included, `(latest / first) ^ (12 / months) − 1` — never an investment return
 * (doc/guide/storico.md § History and Snapshot Baselines).
 *
 * The pace has ONE basis for the whole page: the average monthly increase of the last twelve
 * months, in euro. It decides «accelera / rallenta» in the verdict AND the next-doubling
 * projection in the Raddoppi tile, so the two never disagree (DESIGN.md → The Same-Basis Rule).
 * It is linear on purpose: wealth growth is contributions plus returns, and a compound
 * extrapolation of a saver's contributions is a forecast dressed as a measurement.
 *
 * The words live in `storicoNarrative.ts`.
 */

import type { DoublingMilestone, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import { getItalyYear } from '@/lib/utils/dateHelpers';

export interface PeriodMonth {
  year: number;
  /** 1-12 */
  month: number;
}

export interface SnapshotPoint extends PeriodMonth {
  value: number;
}

/** A wealth CAGR below a year annualises noise; the sentence drops the clause instead. */
export const CAGR_MIN_MONTHS = 12;
/** The trailing window the pace is measured on. */
export const TRAILING_MONTHS = 12;
/** Below two years the trailing window overlaps most of the history: no pace verdict. */
export const PACE_MIN_HISTORY_MONTHS = 24;
/** Within ±10% of the lifetime average the pace is «al ritmo di sempre». */
export const PACE_BAND = 0.1;
/** A target further than fifty years away at the current pace has no honest date. */
export const PROJECTION_MAX_MONTHS = 600;

/** Calendar months from `a` to `b` (Jan → Mar = 2). */
export function monthSpan(a: PeriodMonth, b: PeriodMonth): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function addMonths(period: PeriodMonth, months: number): PeriodMonth {
  const index = period.year * 12 + (period.month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** A chronological copy; the input is never mutated. */
export function sortSnapshots(snapshots: MonthlySnapshot[]): MonthlySnapshot[] {
  return [...snapshots].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
}

function toPoint(snapshot: MonthlySnapshot): SnapshotPoint {
  return { year: snapshot.year, month: snapshot.month, value: snapshot.totalNetWorth };
}

// ─── Growth since the first snapshot ──────────────────────────────────────────

export interface GrowthSummary {
  first: SnapshotPoint;
  latest: SnapshotPoint;
  snapshotCount: number;
  /** Calendar months between the first and the latest snapshot (0 with one snapshot). */
  monthsElapsed: number;
  delta: number;
  /** `null` when the first snapshot is not positive (no denominator). */
  growthPct: number | null;
  /** Wealth CAGR in percent, contributions included; `null` below `CAGR_MIN_MONTHS` or without a denominator. */
  cagr: number | null;
}

export function summarizeGrowth(snapshots: MonthlySnapshot[]): GrowthSummary | null {
  const ordered = sortSnapshots(snapshots);
  if (ordered.length === 0) return null;
  const first = toPoint(ordered[0]);
  const latest = toPoint(ordered[ordered.length - 1]);
  const monthsElapsed = monthSpan(first, latest);
  const delta = latest.value - first.value;
  const hasDenominator = first.value > 0;
  const growthPct = hasDenominator ? (latest.value / first.value - 1) * 100 : null;
  const cagr =
    hasDenominator && monthsElapsed >= CAGR_MIN_MONTHS && latest.value > 0
      ? (Math.pow(latest.value / first.value, 12 / monthsElapsed) - 1) * 100
      : null;
  return { first, latest, snapshotCount: ordered.length, monthsElapsed, delta, growthPct, cagr };
}

// ─── Month by month ───────────────────────────────────────────────────────────

export interface MonthMove extends SnapshotPoint {
  delta: number;
}

export interface MonthlyMoves {
  /** The largest rise between two consecutive calendar months; `null` when no month rose. */
  best: MonthMove | null;
  /** The largest fall; `null` when no month fell. */
  worst: MonthMove | null;
  risingMonths: number;
  /** Pairs of snapshots exactly one calendar month apart — a gap is not a month. */
  measuredMonths: number;
}

export function summarizeMonthlyMoves(snapshots: MonthlySnapshot[]): MonthlyMoves {
  const ordered = sortSnapshots(snapshots);
  let best: MonthMove | null = null;
  let worst: MonthMove | null = null;
  let risingMonths = 0;
  let measuredMonths = 0;
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (monthSpan(previous, current) !== 1) continue;
    measuredMonths += 1;
    const delta = current.totalNetWorth - previous.totalNetWorth;
    if (delta > 0) risingMonths += 1;
    const move: MonthMove = { ...toPoint(current), delta };
    if (delta > 0 && (!best || delta > best.delta)) best = move;
    if (delta < 0 && (!worst || delta < worst.delta)) worst = move;
  }
  return { best, worst, risingMonths, measuredMonths };
}

// ─── All-time high ────────────────────────────────────────────────────────────

export interface AllTimeHigh {
  peak: SnapshotPoint;
  /** The latest snapshot is (one of) the highest. */
  isAtHigh: boolean;
  /** latest − peak, ≤ 0. */
  gap: number;
  /** `null` when the peak is not positive. */
  gapPct: number | null;
}

export function summarizeAllTimeHigh(snapshots: MonthlySnapshot[]): AllTimeHigh | null {
  const ordered = sortSnapshots(snapshots);
  if (ordered.length === 0) return null;
  // The first occurrence keeps the record: a later equal month did not set a new high.
  let peak = ordered[0];
  for (const snapshot of ordered) if (snapshot.totalNetWorth > peak.totalNetWorth) peak = snapshot;
  const latest = ordered[ordered.length - 1];
  const gap = latest.totalNetWorth - peak.totalNetWorth;
  return {
    peak: toPoint(peak),
    isAtHigh: gap >= 0,
    gap,
    gapPct: peak.totalNetWorth > 0 ? (gap / peak.totalNetWorth) * 100 : null,
  };
}

// ─── Pace ─────────────────────────────────────────────────────────────────────

export type PaceVerdict = 'accelerating' | 'steady' | 'slowing' | 'losing';

export interface GrowthPace {
  /** latest − the snapshot exactly `TRAILING_MONTHS` earlier; `null` when that month is missing. */
  trailingDelta: number | null;
  /** `trailingDelta` over the value twelve months earlier, in percent; `null` without a positive base. */
  trailingPct: number | null;
  /** The page's ONE pace: `trailingDelta / TRAILING_MONTHS`, euro per month. */
  trailingMonthly: number | null;
  /** Lifetime average, euro per month; `null` with fewer than two snapshots. */
  lifetimeMonthly: number | null;
  /** `null` without a trailing figure or below `PACE_MIN_HISTORY_MONTHS` of history. */
  verdict: PaceVerdict | null;
}

export function summarizeGrowthPace(snapshots: MonthlySnapshot[]): GrowthPace {
  const growth = summarizeGrowth(snapshots);
  if (!growth) return { trailingDelta: null, trailingPct: null, trailingMonthly: null, lifetimeMonthly: null, verdict: null };

  const lifetimeMonthly = growth.monthsElapsed > 0 ? growth.delta / growth.monthsElapsed : null;

  const yearAgo = addMonths(growth.latest, -TRAILING_MONTHS);
  const base = snapshots.find((s) => s.year === yearAgo.year && s.month === yearAgo.month);
  const trailingDelta = base ? growth.latest.value - base.totalNetWorth : null;
  const trailingPct = base && trailingDelta !== null && base.totalNetWorth > 0 ? (trailingDelta / base.totalNetWorth) * 100 : null;
  const trailingMonthly = trailingDelta === null ? null : trailingDelta / TRAILING_MONTHS;

  let verdict: PaceVerdict | null = null;
  if (trailingDelta !== null && trailingMonthly !== null && lifetimeMonthly !== null && growth.monthsElapsed >= PACE_MIN_HISTORY_MONTHS) {
    if (trailingDelta < 0) verdict = 'losing';
    else if (lifetimeMonthly <= 0) verdict = 'accelerating';
    else if (trailingMonthly > lifetimeMonthly * (1 + PACE_BAND)) verdict = 'accelerating';
    else if (trailingMonthly < lifetimeMonthly * (1 - PACE_BAND)) verdict = 'slowing';
    else verdict = 'steady';
  }

  return { trailingDelta, trailingPct, trailingMonthly, lifetimeMonthly, verdict };
}

// ─── Evoluzione's points ──────────────────────────────────────────────────────

export interface EvolutionPoint extends PeriodMonth {
  /** The axis key, `MM/YY`, as `prepareNetWorthHistoryData` emits it. */
  date: string;
  totalNetWorth: number;
  note?: string;
  /** Change against the previous CALENDAR month; `null` on the first point or after a gap. */
  delta: number | null;
}

/** The net-worth series with each month's change, for the Evoluzione chart and its tooltip. */
export function withMonthDeltas<T extends PeriodMonth & { totalNetWorth: number }>(points: T[]): Array<T & { delta: number | null }> {
  const ordered = [...points].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
  return ordered.map((point, i) => {
    const previous = i > 0 ? ordered[i - 1] : null;
    // Change against the previous CALENDAR month: null on the first point and after a gap.
    const delta = previous && monthSpan(previous, point) === 1 ? point.totalNetWorth - previous.totalNetWorth : null;
    return { ...point, delta };
  });
}

// ─── Next doubling ────────────────────────────────────────────────────────────

export interface DoublingProjection {
  /** The milestone's target (2× the last doubling, or the next fixed threshold). */
  target: number;
  remaining: number;
  /** Euro per month — the page's one pace. */
  monthlyPace: number;
  /** Rounded up: a target reached mid-month shows in that month's snapshot. */
  monthsToTarget: number;
  eta: PeriodMonth;
}

/**
 * Where the milestone in progress lands at the current pace, linearly. `null` without a
 * milestone in progress, without a positive pace, when the target is already reached, or
 * beyond `PROJECTION_MAX_MONTHS` — a date fifty years out is not a projection, it is noise.
 */
export function projectNextDoubling(
  inProgress: DoublingMilestone | null,
  latest: SnapshotPoint,
  monthlyPace: number | null,
): DoublingProjection | null {
  if (!inProgress || monthlyPace === null || monthlyPace <= 0) return null;
  const remaining = inProgress.endValue - latest.value;
  if (remaining <= 0) return null;
  const monthsToTarget = Math.ceil(remaining / monthlyPace);
  if (monthsToTarget > PROJECTION_MAX_MONTHS) return null;
  return { target: inProgress.endValue, remaining, monthlyPace, monthsToTarget, eta: addMonths(latest, monthsToTarget) };
}

// ─── Drivers (savings vs market), on chartService's yearly rows ───────────────

export interface DriverYear {
  year: string;
  netSavings: number;
  investmentGrowth: number;
  netWorthGrowth: number;
  /** Growth over the baseline's value, in percent; `null` without a positive baseline. */
  growthPct: number | null;
  /** The snapshot the year is measured FROM; absent on a legacy row means «December of the previous year». */
  baseline?: PeriodMonth;
  /** The last snapshot of the year — where its window (and its savings) closes. */
  latest: PeriodMonth;
}

/**
 * The share of a year's growth each driver explains, 0-100 and summing to 100 by construction
 * (the market's share is the remainder). `null` when either half is negative or nothing was
 * added: a share of a mixed-sign total means nothing.
 */
export function resolveDriverShares(row: Pick<DriverYear, 'netSavings' | 'investmentGrowth'>): { savings: number; market: number } | null {
  if (row.netSavings < 0 || row.investmentGrowth < 0) return null;
  const total = row.netSavings + row.investmentGrowth;
  if (total <= 0) return null;
  const savings = Math.round((row.netSavings / total) * 100);
  return { savings, market: 100 - savings };
}

/**
 * The month a running year is measured from: the one AFTER its baseline snapshot («gennaio»
 * after a December, «aprile» when the history starts in March). A row without a baseline is a
 * December-based one.
 */
export function runningSinceMonth(row: { baseline?: PeriodMonth }): number {
  if (!row.baseline) return 1;
  return row.baseline.month === 12 ? 1 : row.baseline.month + 1;
}

/**
 * The years the decomposition is honest on: from the cashflow floor (`cashflowHistoryStartYear`)
 * onwards, newest first. Before it there are no transactions, and "market" would silently be
 * the whole growth.
 */
export function selectDriverYears<T extends DriverYear>(rows: T[], startYear: number): T[] {
  return rows.filter((row) => Number(row.year) >= startYear).sort((a, b) => Number(b.year) - Number(a.year));
}

export function sumDriverYears(rows: DriverYear[]): Pick<DriverYear, 'netSavings' | 'investmentGrowth' | 'netWorthGrowth'> | null {
  if (rows.length === 0) return null;
  return rows.reduce(
    (sum, row) => ({
      netSavings: sum.netSavings + row.netSavings,
      investmentGrowth: sum.investmentGrowth + row.investmentGrowth,
      netWorthGrowth: sum.netWorthGrowth + row.netWorthGrowth,
    }),
    { netSavings: 0, investmentGrowth: 0, netWorthGrowth: 0 },
  );
}

/** The running year when it has a row (it is the one the reading is about), else the newest closed one. */
export function resolveFeaturedDriverYear<T extends DriverYear>(rows: T[], currentYear: number): { row: T; isRunning: boolean } | null {
  if (rows.length === 0) return null;
  const running = rows.find((row) => Number(row.year) === currentYear);
  if (running) return { row: running, isRunning: true };
  const newest = [...rows].sort((a, b) => Number(b.year) - Number(a.year))[0];
  return { row: newest, isRunning: false };
}

/**
 * The rows inside the last `count` CALENDAR months of a monthly series, chronological — a
 * month without a row stays a gap, so «ultimi 12 mesi» never silently spans fourteen.
 */
export function selectTrailingMonths<T extends PeriodMonth>(rows: T[], count: number): T[] {
  const ordered = [...rows].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
  const latest = ordered[ordered.length - 1];
  if (!latest) return [];
  return ordered.filter((row) => monthSpan(row, latest) < count);
}

// ─── Lavoro e investimenti ────────────────────────────────────────────────────

export interface LaborMetrics {
  startYear: number;
  /** Income in the labor categories since the floor. */
  totalLaborIncome: number;
  /** Labor income plus all spending (spending is negative in the ledger). */
  totalSavedFromWork: number;
  /** All spending since the floor, negative as stored; transfers excluded (net-zero). */
  totalExpensesSum: number;
  /** Net-worth growth since the floor's baseline minus every inflow and outflow: the market's share. */
  totalInvestmentGrowthGross: number;
  totalInvestmentGrowthNet: number;
}

/**
 * The «Lavoro e investimenti» recap: what the labor categories brought in since the cashflow
 * floor, what was left after all spending, and the market's share of the growth over the same
 * window (from December of the year before the floor, or the floor's first snapshot).
 * `estimatedTaxes` is the Patrimonio's estimate on latent gains, passed in so this stays SDK-free.
 * Transfers are skipped: they are net-zero and stored positive, so counting them as spending
 * would inflate the savings and deflate the market by the same amount.
 */
export function summarizeLaborMetrics(
  snapshots: MonthlySnapshot[],
  expenses: Expense[],
  laborCategoryIds: string[],
  startYear: number,
  estimatedTaxes: number,
): LaborMetrics | null {
  if (laborCategoryIds.length === 0 || expenses.length === 0) return null;
  const categorySet = new Set(laborCategoryIds);
  const inWindow = expenses.filter((e) => e.type !== 'transfer' && getItalyYear(e.date) >= startYear);
  const totalLaborIncome = inWindow.filter((e) => e.type === 'income' && categorySet.has(e.categoryId)).reduce((sum, e) => sum + e.amount, 0);
  const allIncome = inWindow.filter((e) => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
  const totalExpensesSum = inWindow.filter((e) => e.type !== 'income').reduce((sum, e) => sum + e.amount, 0);

  const ordered = sortSnapshots(snapshots);
  const relevant = ordered.filter((s) => s.year >= startYear);
  let totalInvestmentGrowthGross = 0;
  if (relevant.length > 0) {
    const baseline = ordered.find((s) => s.year === startYear - 1 && s.month === 12) ?? relevant[0];
    totalInvestmentGrowthGross = relevant[relevant.length - 1].totalNetWorth - baseline.totalNetWorth - (allIncome + totalExpensesSum);
  }
  return {
    startYear,
    totalLaborIncome,
    totalSavedFromWork: totalLaborIncome + totalExpensesSum,
    totalExpensesSum,
    totalInvestmentGrowthGross,
    totalInvestmentGrowthNet: totalInvestmentGrowthGross - estimatedTaxes,
  };
}
