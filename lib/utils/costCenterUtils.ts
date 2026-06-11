/**
 * Cost Center pure utilities
 *
 * All the derivation logic behind the "Centri di Costo" tab lives here, free of
 * React, Firestore and the DOM, so it can be unit-tested in isolation and reused by
 * both the Panoramica (list) and the Detail view.
 *
 * SIGN CONVENTION:
 * Expenses are stored as negative numbers. Callers pass the already-filtered list of
 * outgoing expenses (amount < 0); every figure returned here is a positive "cost".
 *
 * TIMEZONE:
 * All calendar boundaries are computed in Italy time via the dateHelpers, so a
 * purchase made late on 31/12 in Italy lands in the right month/year regardless of
 * the server's UTC offset. Functions accept an explicit `now` for deterministic tests.
 */

import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Expense } from '@/types/expenses';
import {
  CostCenter,
  CostCenterPeriod,
  CostCenterPeriodStats,
  CostCenterAnnualForecast,
  CostCenterBudgetVerdict,
  CostCenterCategorySlice,
  CostCenterRecurringSplit,
  CostCenterMonthlySeries,
  CostCenterMonthlyBucket,
  CostCenterComparisonSeries,
  CostCenterLifecycle,
} from '@/types/costCenters';
import { toDate, getItalyDate, getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';

// A center is "dormant" (but not archived) when it has had no spending for this many
// days. Surfaced visually so a long-finished project doesn't look active forever.
export const DORMANT_THRESHOLD_DAYS = 90;

// Categories beyond this rank collapse into a single "Altro" series so the stacked
// chart and composition list stay readable instead of sprouting a dozen thin slices.
export const MAX_COMPOSITION_CATEGORIES = 5;

// Centers beyond this rank are dropped from the cross-center comparison overlay.
export const MAX_COMPARISON_CENTERS = 5;

const OTHER_CATEGORY_LABEL = 'Altro';

// ==================== Period filtering ====================

/** A {year, month} pair (month 1-based) used as an ordered month key. */
interface YearMonth {
  year: number;
  month: number;
}

function toYearMonth(date: Date): YearMonth {
  return { year: getItalyYear(date), month: getItalyMonth(date) };
}

/** Subtract `count` whole months from a {year, month} pair (month 1-based). */
function subtractMonths({ year, month }: YearMonth, count: number): YearMonth {
  const zeroBased = month - 1 - count;
  const y = year + Math.floor(zeroBased / 12);
  const m = ((zeroBased % 12) + 12) % 12;
  return { year: y, month: m + 1 };
}

function isOnOrAfter(a: YearMonth, b: YearMonth): boolean {
  return a.year !== b.year ? a.year > b.year : a.month >= b.month;
}

/**
 * Returns the subset of `expenses` whose date falls inside the given period window,
 * measured in Italy time relative to `now`.
 *
 * - month: the current calendar month
 * - year: the current calendar year (Jan 1 → now)
 * - rolling12: the trailing 12 calendar months, current month included
 * - all: everything
 */
export function filterExpensesByPeriod(
  expenses: Expense[],
  period: CostCenterPeriod,
  now: Date = new Date(),
): Expense[] {
  if (period === 'all') return expenses;

  const current = toYearMonth(now);

  if (period === 'month') {
    return expenses.filter((e) => {
      const ym = toYearMonth(toDate(e.date));
      return ym.year === current.year && ym.month === current.month;
    });
  }

  if (period === 'year') {
    return expenses.filter((e) => getItalyYear(toDate(e.date)) === current.year);
  }

  // rolling12: lower bound is 11 months before the current month
  const lowerBound = subtractMonths(current, 11);
  return expenses.filter((e) => isOnOrAfter(toYearMonth(toDate(e.date)), lowerBound));
}

/**
 * Number of calendar months spanned by the period window, used as the denominator
 * for the monthly average. For "all" it spans from the first expense to now.
 */
function monthsInWindow(
  period: CostCenterPeriod,
  expenses: Expense[],
  now: Date,
): number {
  switch (period) {
    case 'month':
      return 1;
    case 'year':
      return getItalyMonth(now); // months elapsed this year (1-based)
    case 'rolling12':
      return 12;
    case 'all': {
      if (expenses.length === 0) return 1;
      const first = expenses.reduce(
        (min, e) => (toDate(e.date) < min ? toDate(e.date) : min),
        toDate(expenses[0].date),
      );
      const a = toYearMonth(first);
      const b = toYearMonth(now);
      const span = (b.year - a.year) * 12 + (b.month - a.month) + 1;
      return Math.max(1, span);
    }
  }
}

// ==================== Per-center stats ====================

const absAmount = (e: Expense) => Math.abs(e.amount);

/**
 * Aggregate figures for a single center over the given period.
 *
 * `averageMonthly` divides the total by the calendar months in the window (a true
 * monthly average), NOT by the count of months that happened to have a transaction —
 * a sporadic project should read as the low monthly cost it actually is.
 */
export function computeCenterStats(
  expenses: Expense[],
  period: CostCenterPeriod,
  now: Date = new Date(),
): CostCenterPeriodStats {
  const scoped = filterExpensesByPeriod(expenses, period, now);

  if (scoped.length === 0) {
    return {
      totalSpent: 0,
      transactionCount: 0,
      averageMonthly: 0,
      firstActivityDate: null,
      lastActivityDate: null,
    };
  }

  const totalSpent = scoped.reduce((sum, e) => sum + absAmount(e), 0);
  const dates = scoped.map((e) => toDate(e.date));
  const firstActivityDate = dates.reduce((min, d) => (d < min ? d : min), dates[0]);
  const lastActivityDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);
  const averageMonthly = totalSpent / monthsInWindow(period, scoped, now);

  return {
    totalSpent,
    transactionCount: scoped.length,
    averageMonthly,
    firstActivityDate,
    lastActivityDate,
  };
}

/**
 * Sorts centers by their period spend, descending. Pure: takes the precomputed
 * total alongside each center so it doesn't re-aggregate.
 */
export function rankCentersBySpend<T extends { totalSpent: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.totalSpent - a.totalSpent);
}

// ==================== Period-over-period delta ====================

export interface CostCenterPeriodComparison {
  current: number;
  previous: number;
  // Signed fraction (e.g. 0.2 = +20%). null when there is no comparable predecessor
  // (the "all" period) or the previous window had zero spend.
  deltaPct: number | null;
}

/** A noon Date that lands inside the given {year, month} regardless of timezone. */
function noonOf({ year, month }: YearMonth): Date {
  return new Date(year, month - 1, 15, 12, 0, 0);
}

/**
 * Compares the current period total against the immediately preceding comparable
 * window: previous month, previous year, or the 12 months before the trailing year.
 * Drives the Δ chip on the detail hero. "all" has no predecessor → deltaPct null.
 */
export function computePeriodComparison(
  expenses: Expense[],
  period: CostCenterPeriod,
  now: Date = new Date(),
): CostCenterPeriodComparison {
  const total = (list: Expense[]) => list.reduce((sum, e) => sum + absAmount(e), 0);
  const current = total(filterExpensesByPeriod(expenses, period, now));

  if (period === 'all') return { current, previous: 0, deltaPct: null };

  const currentYm = toYearMonth(now);
  // month → previous month (1); year/rolling12 → 12 months back (previous year / window).
  const shift = period === 'month' ? 1 : 12;
  const prevNow = noonOf(subtractMonths(currentYm, shift));
  const previous = total(filterExpensesByPeriod(expenses, period, prevNow));

  const deltaPct = previous > 0 ? (current - previous) / previous : null;
  return { current, previous, deltaPct };
}

// ==================== Annual forecast (B2) ====================

function daysInYear(year: number): number {
  // Leap year check; Dec 31 day-of-year is 365 or 366.
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 366 : 365;
}

/** Day-of-year (1-based) for `date` in Italy time. */
function dayOfYear(date: Date): number {
  const italy = getItalyDate(date);
  const start = new Date(italy.getFullYear(), 0, 0);
  const diff = italy.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/**
 * Projects the full-year cost from the year-to-date pace (B2).
 *
 * The projection blends the actual YTD daily pace with the prior full-year pace,
 * weighted by how far through the year we are — so a single big January purchase
 * doesn't blow the estimate up on day 10. Same dampening idea as the budget forecast,
 * applied on a yearly horizon.
 */
export function projectAnnualCost(
  expenses: Expense[],
  now: Date = new Date(),
): CostCenterAnnualForecast {
  const year = getItalyYear(now);
  const totalDays = daysInYear(year);
  const elapsed = Math.max(1, dayOfYear(now));
  const yearProgress = Math.min(1, elapsed / totalDays);

  const spentYtd = filterExpensesByPeriod(expenses, 'year', now).reduce(
    (sum, e) => sum + absAmount(e),
    0,
  );

  const priorYearTotal = expenses
    .filter((e) => getItalyYear(toDate(e.date)) === year - 1)
    .reduce((sum, e) => sum + absAmount(e), 0);

  const actualDailyPace = spentYtd / elapsed;
  let projectedTotal: number;
  if (priorYearTotal > 0) {
    const referenceDailyPace = priorYearTotal / totalDays;
    const blended = yearProgress * actualDailyPace + (1 - yearProgress) * referenceDailyPace;
    projectedTotal = spentYtd + blended * (totalDays - elapsed);
  } else {
    projectedTotal = actualDailyPace * totalDays;
  }

  return { spentYtd, projectedTotal, yearProgress };
}

// ==================== Budget verdict (B1) ====================

/**
 * Compares spend against the center's ceiling for the relevant window (B1).
 * Returns null when no budget is set. A monthly ceiling is measured on the current
 * month; an annual ceiling on the year-to-date.
 */
export function evaluateCenterBudget(
  center: Pick<CostCenter, 'budgetAmount' | 'budgetPeriod'>,
  expenses: Expense[],
  now: Date = new Date(),
): CostCenterBudgetVerdict | null {
  const { budgetAmount, budgetPeriod } = center;
  if (!budgetAmount || budgetAmount <= 0 || !budgetPeriod) return null;

  const window: CostCenterPeriod = budgetPeriod === 'monthly' ? 'month' : 'year';
  const spent = filterExpensesByPeriod(expenses, window, now).reduce(
    (sum, e) => sum + absAmount(e),
    0,
  );

  const ratio = spent / budgetAmount;
  const remaining = budgetAmount - spent;
  const status: CostCenterBudgetVerdict['status'] =
    ratio > 1 ? 'over' : ratio >= 0.9 ? 'warning' : 'ok';

  return { spent, budgetAmount, budgetPeriod, ratio, remaining, status };
}

// ==================== Category composition (A4) ====================

/**
 * Breaks the center's spend down by expense category, sorted by amount descending.
 * Categories past MAX_COMPOSITION_CATEGORIES collapse into a single "Altro" slice so
 * the breakdown stays readable.
 */
export function buildCategoryComposition(expenses: Expense[]): CostCenterCategorySlice[] {
  if (expenses.length === 0) return [];

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const e of expenses) {
    const name = e.categoryName?.trim() || OTHER_CATEGORY_LABEL;
    const entry = byCategory.get(name) ?? { total: 0, count: 0 };
    entry.total += absAmount(e);
    entry.count += 1;
    byCategory.set(name, entry);
  }

  const grandTotal = [...byCategory.values()].reduce((sum, v) => sum + v.total, 0) || 1;
  const sorted = [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total);

  const head = sorted.slice(0, MAX_COMPOSITION_CATEGORIES);
  const tail = sorted.slice(MAX_COMPOSITION_CATEGORIES);

  const slices: CostCenterCategorySlice[] = head.map(([categoryName, v]) => ({
    categoryName,
    total: v.total,
    pct: v.total / grandTotal,
    transactionCount: v.count,
  }));

  if (tail.length > 0) {
    const total = tail.reduce((sum, [, v]) => sum + v.total, 0);
    const count = tail.reduce((sum, [, v]) => sum + v.count, 0);
    slices.push({
      categoryName: OTHER_CATEGORY_LABEL,
      total,
      pct: total / grandTotal,
      transactionCount: count,
    });
  }

  return slices;
}

/**
 * Splits spend into fixed (recurring or installment) vs one-off (A4).
 * Surfaces a signal already latent in the expense flags but never shown.
 */
export function splitRecurringVsOneOff(expenses: Expense[]): CostCenterRecurringSplit {
  let recurring = 0;
  let oneOff = 0;
  for (const e of expenses) {
    const amount = absAmount(e);
    if (e.isRecurring || e.isInstallment) recurring += amount;
    else oneOff += amount;
  }
  const total = recurring + oneOff;
  return { recurring, oneOff, recurringPct: total > 0 ? recurring / total : 0 };
}

// ==================== Monthly series (A4 chart) ====================

/** Enumerate a gap-free, inclusive month axis from `start` to `end`. */
function enumerateMonths(start: YearMonth, end: YearMonth): YearMonth[] {
  const months: YearMonth[] = [];
  let cursor = start;
  while (isOnOrAfter(end, cursor)) {
    months.push(cursor);
    cursor = subtractMonths(cursor, -1); // add one month
  }
  return months;
}

function monthLabel(year: number, month: number): string {
  return format(new Date(year, month - 1, 1), 'MMM yy', { locale: it });
}

/**
 * Builds a gap-free monthly series stacked by category for the detail chart (A4).
 *
 * The top categories (by total spend) get their own stacked series; everything else
 * collapses into "Altro". `maxMonths`, when given, keeps only the most recent N months.
 */
export function buildMonthlySeriesByCategory(
  expenses: Expense[],
  maxMonths?: number,
): CostCenterMonthlySeries {
  if (expenses.length === 0) return { buckets: [], categories: [] };

  // Resolve the top categories once; everything else is "Altro".
  const composition = buildCategoryComposition(expenses);
  const topNames = new Set(
    composition.filter((c) => c.categoryName !== OTHER_CATEGORY_LABEL).map((c) => c.categoryName),
  );
  const categoryKey = (e: Expense) => {
    const name = e.categoryName?.trim() || OTHER_CATEGORY_LABEL;
    return topNames.has(name) ? name : OTHER_CATEGORY_LABEL;
  };

  // Determine the month span.
  const dates = expenses.map((e) => toDate(e.date));
  const first = toYearMonth(dates.reduce((min, d) => (d < min ? d : min), dates[0]));
  const last = toYearMonth(dates.reduce((max, d) => (d > max ? d : max), dates[0]));
  let axis = enumerateMonths(first, last);
  if (maxMonths && axis.length > maxMonths) axis = axis.slice(-maxMonths);

  const bucketMap = new Map<string, CostCenterMonthlyBucket>();
  for (const { year, month } of axis) {
    const key = `${year}-${month}`;
    bucketMap.set(key, { label: monthLabel(year, month), year, month, total: 0, byCategory: {} });
  }

  for (const e of expenses) {
    const ym = toYearMonth(toDate(e.date));
    const bucket = bucketMap.get(`${ym.year}-${ym.month}`);
    if (!bucket) continue; // outside the trimmed window
    const amount = absAmount(e);
    const cat = categoryKey(e);
    bucket.byCategory[cat] = (bucket.byCategory[cat] ?? 0) + amount;
    bucket.total += amount;
  }

  // Preserve composition order; append "Altro" last if present anywhere.
  const orderedCategories = composition
    .map((c) => c.categoryName)
    .filter((name) => name !== OTHER_CATEGORY_LABEL);
  const buckets = axis.map(({ year, month }) => bucketMap.get(`${year}-${month}`)!);
  const hasOther = buckets.some((b) => OTHER_CATEGORY_LABEL in b.byCategory);
  if (hasOther) orderedCategories.push(OTHER_CATEGORY_LABEL);

  return { buckets, categories: orderedCategories };
}

// ==================== Cross-center comparison (B3) ====================

/**
 * Builds a gap-free monthly series with one value per center, for the comparison
 * overlay on the Panoramica (B3). Keeps the top centers by total spend within the
 * window; the rest are dropped to avoid an unreadable tangle of lines.
 */
export function buildComparisonSeries(
  centers: { id: string; name: string; color?: string; expenses: Expense[] }[],
  period: CostCenterPeriod,
  now: Date = new Date(),
): CostCenterComparisonSeries {
  // Scope each center's expenses to the period and rank by total.
  const scoped = centers
    .map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      expenses: filterExpensesByPeriod(c.expenses, period, now),
    }))
    .map((c) => ({ ...c, total: c.expenses.reduce((sum, e) => sum + absAmount(e), 0) }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_COMPARISON_CENTERS);

  if (scoped.length === 0) return { buckets: [], centers: [] };

  // Union month axis across the kept centers.
  const allDates = scoped.flatMap((c) => c.expenses.map((e) => toDate(e.date)));
  const first = toYearMonth(allDates.reduce((min, d) => (d < min ? d : min), allDates[0]));
  const last = toYearMonth(allDates.reduce((max, d) => (d > max ? d : max), allDates[0]));
  const axis = enumerateMonths(first, last);

  const bucketMap = new Map<string, CostCenterComparisonBucketInternal>();
  for (const { year, month } of axis) {
    bucketMap.set(`${year}-${month}`, {
      label: monthLabel(year, month),
      year,
      month,
      byCenter: Object.fromEntries(scoped.map((c) => [c.id, 0])),
    });
  }

  for (const c of scoped) {
    for (const e of c.expenses) {
      const ym = toYearMonth(toDate(e.date));
      const bucket = bucketMap.get(`${ym.year}-${ym.month}`);
      if (bucket) bucket.byCenter[c.id] += absAmount(e);
    }
  }

  return {
    buckets: axis.map(({ year, month }) => bucketMap.get(`${year}-${month}`)!),
    centers: scoped.map((c) => ({ id: c.id, name: c.name, color: c.color })),
  };
}

type CostCenterComparisonBucketInternal = CostCenterComparisonSeries['buckets'][number];

// ==================== Lifecycle (B4) ====================

/**
 * Derives the lifecycle status of a center (B4):
 * - archived: the user explicitly closed it (archivedAt set)
 * - dormant: no spending for DORMANT_THRESHOLD_DAYS
 * - active: otherwise
 */
export function getLifecycleStatus(
  center: Pick<CostCenter, 'archivedAt'>,
  lastActivityDate: Date | null,
  now: Date = new Date(),
): CostCenterLifecycle {
  if (center.archivedAt) return 'archived';
  if (!lastActivityDate) return 'dormant';
  const daysSince = (now.getTime() - lastActivityDate.getTime()) / 86_400_000;
  return daysSince > DORMANT_THRESHOLD_DAYS ? 'dormant' : 'active';
}
