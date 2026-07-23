/**
 * Pure aggregation layer for the "Andamento nel Tempo" section of the Analisi tab.
 *
 * Builds time-series datasets (monthly or yearly buckets) over the full cashflow
 * history for two charts:
 *  - income / expenses / net savings over time (buildTimeBuckets)
 *  - per-category income or expense over time, as multi-line series
 *    (buildCategoryTimeSeries)
 *
 * DESIGN NOTES
 * - Kept as a pure, dependency-light module (only date/label helpers) so it can be
 *   unit-tested in isolation, matching the project pattern of budgetUtils/allocationUtils.
 * - The time axis is built from the actual data range (first→last bucket with data),
 *   never earlier than `historyStartYear`. This honours the "anno inizio storico
 *   cashflow" setting as a hard lower bound while avoiding empty leading buckets.
 * - `transfer` records are net-zero movements between cash accounts and are excluded
 *   everywhere, consistent with the rest of the Analisi tab.
 *
 * Sign convention (see types/expenses.ts): income amounts are positive, expense
 * amounts are negative — expense magnitudes are taken via Math.abs.
 */

import { type Expense, type ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';

export type TimeGranularity = 'month' | 'year';

/** Aggregate flow figures for a single time bucket. */
export interface TimeBucket {
  /** Stable, chronologically sortable key: "2025" (year) or "2025-03" (month). */
  key: string;
  /** Human label for the X axis: "2025" or "Mar 25". */
  label: string;
  /** Total income in the bucket (positive). */
  income: number;
  /** Total expenses in the bucket as a positive magnitude. */
  expenses: number;
  /** Net savings: income − expenses (can be negative). */
  net: number;
}

/** One category's value across the bucket axis (aligned by index to the axis). */
export interface CategorySeries {
  name: string;
  /** Per-bucket value; same length and order as the returned `buckets`. */
  values: number[];
}

export interface CategoryTimeSeries {
  /** The shared, ordered X axis. */
  buckets: Array<{ key: string; label: string }>;
  /** One entry per kept category (the top-N by total over the window). */
  series: CategorySeries[];
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function isExpenseRecord(expense: Expense): boolean {
  return expense.type !== 'income' && expense.type !== 'transfer';
}

/** Bucket key for a date at the requested granularity. Month is zero-padded to sort lexically. */
function bucketKeyFor(year: number, month: number, granularity: TimeGranularity): string {
  return granularity === 'year' ? `${year}` : `${year}-${String(month).padStart(2, '0')}`;
}

/** Human label for a bucket: "2025" (year) or "Mar 25" (month, mirrors SavingsRateTrendSection). */
function bucketLabelFor(year: number, month: number, granularity: TimeGranularity): string {
  if (granularity === 'year') return `${year}`;
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${year.toString().slice(2)}`;
}

/**
 * Build the ordered, gap-free bucket axis spanning the data range.
 *
 * Lower bound is the first bucket with data but never earlier than historyStartYear;
 * upper bound is the last bucket with data. Empty buckets between the two ends are
 * included so the chart has an evenly-spaced, continuous axis.
 *
 * Returns an empty array when no relevant records exist.
 */
function buildBucketAxis(
  relevant: Expense[],
  granularity: TimeGranularity,
  historyStartYear: number,
): Array<{ key: string; label: string; year: number; month: number }> {
  if (relevant.length === 0) return [];

  // Find the earliest and latest (year, month) present in the data.
  let minYear = Infinity;
  let minMonth = 1;
  let maxYear = -Infinity;
  let maxMonth = 12;

  for (const expense of relevant) {
    const date = toDate(expense.date);
    const year = getItalyYear(date);
    const month = getItalyMonth(date);

    if (year < minYear || (year === minYear && month < minMonth)) {
      minYear = year;
      minMonth = month;
    }
    if (year > maxYear || (year === maxYear && month > maxMonth)) {
      maxYear = year;
      maxMonth = month;
    }
  }

  // Clamp the lower bound to historyStartYear (never show buckets before the setting).
  if (minYear < historyStartYear) {
    minYear = historyStartYear;
    minMonth = 1;
  }

  const axis: Array<{ key: string; label: string; year: number; month: number }> = [];

  if (granularity === 'year') {
    for (let year = minYear; year <= maxYear; year++) {
      axis.push({ key: bucketKeyFor(year, 1, 'year'), label: bucketLabelFor(year, 1, 'year'), year, month: 1 });
    }
    return axis;
  }

  // Monthly: walk forward month by month from (minYear, minMonth) to (maxYear, maxMonth).
  let year = minYear;
  let month = minMonth;
  while (year < maxYear || (year === maxYear && month <= maxMonth)) {
    axis.push({ key: bucketKeyFor(year, month, 'month'), label: bucketLabelFor(year, month, 'month'), year, month });
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
  return axis;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Aggregate income, expenses and net savings per time bucket over the full history.
 *
 * @param expenses          All expense/income/transfer records.
 * @param granularity       'month' or 'year' buckets.
 * @param historyStartYear  Hard lower bound — buckets never start before this year.
 * @returns Chronologically ordered buckets; empty array when no non-transfer data exists.
 */
export function buildTimeBuckets(
  expenses: Expense[],
  granularity: TimeGranularity,
  historyStartYear: number,
): TimeBucket[] {
  // Exclude transfers (net-zero) and anything before the history floor.
  const relevant = expenses.filter(
    (e) => e.type !== 'transfer' && getItalyYear(toDate(e.date)) >= historyStartYear,
  );

  const axis = buildBucketAxis(relevant, granularity, historyStartYear);
  if (axis.length === 0) return [];

  // Seed an accumulator per bucket key so empty buckets stay at zero.
  const byKey = new Map<string, TimeBucket>();
  for (const bucket of axis) {
    byKey.set(bucket.key, { key: bucket.key, label: bucket.label, income: 0, expenses: 0, net: 0 });
  }

  for (const expense of relevant) {
    const date = toDate(expense.date);
    const key = bucketKeyFor(getItalyYear(date), getItalyMonth(date), granularity);
    const bucket = byKey.get(key);
    // A record can fall outside the axis only if its year was clamped below the floor —
    // already filtered out above, so this guard is defensive.
    if (!bucket) continue;

    if (expense.type === 'income') {
      bucket.income += expense.amount;
    } else {
      bucket.expenses += Math.abs(expense.amount);
    }
  }

  // Finalise net after all records are folded in.
  for (const bucket of byKey.values()) {
    bucket.net = bucket.income - bucket.expenses;
  }

  // axis preserves chronological order; map keys back through it.
  return axis.map((b) => byKey.get(b.key)!);
}

/**
 * Build per-category multi-line series (income or expenses) over the full history.
 *
 * Categories are ranked by total value over the whole window and only the top `topN`
 * are kept, each as its own series. The remaining (smaller) categories are dropped
 * rather than folded into an "Altro" residual: that residual was the sum of many
 * categories and routinely dwarfed every individual line, flattening the chart.
 *
 * @param expenses          All expense/income/transfer records.
 * @param granularity       'month' or 'year' buckets.
 * @param chartType         'income' selects income records, 'expenses' selects costs.
 * @param historyStartYear  Hard lower bound — buckets never start before this year.
 * @param topN              Max number of categories to keep (ranked by total).
 * @returns Shared bucket axis + one value array per kept category; empty when no data.
 */
export function buildCategoryTimeSeries(
  expenses: Expense[],
  granularity: TimeGranularity,
  chartType: 'income' | 'expenses',
  historyStartYear: number,
  topN = 6,
): CategoryTimeSeries {
  const relevant = expenses.filter((e) => {
    if (getItalyYear(toDate(e.date)) < historyStartYear) return false;
    return chartType === 'income' ? e.type === 'income' : isExpenseRecord(e);
  });

  const axis = buildBucketAxis(relevant, granularity, historyStartYear);
  if (axis.length === 0) return { buckets: [], series: [] };

  // Index each bucket key to its position so we can scatter values into arrays.
  const bucketIndex = new Map<string, number>();
  axis.forEach((b, i) => bucketIndex.set(b.key, i));

  // Rank categories by total value over the window.
  const categoryTotals = new Map<string, number>();
  for (const expense of relevant) {
    const value = Math.abs(expense.amount);
    categoryTotals.set(expense.categoryName, (categoryTotals.get(expense.categoryName) ?? 0) + value);
  }
  const rankedCategories = Array.from(categoryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const keptCategories = new Set(rankedCategories.slice(0, topN));

  // Seed a zero-filled value array for each kept category.
  const seriesByName = new Map<string, number[]>();
  for (const name of keptCategories) seriesByName.set(name, new Array(axis.length).fill(0));

  for (const expense of relevant) {
    // Categories beyond the top-N are dropped entirely (no "Altro" residual).
    if (!keptCategories.has(expense.categoryName)) continue;

    const date = toDate(expense.date);
    const key = bucketKeyFor(getItalyYear(date), getItalyMonth(date), granularity);
    const index = bucketIndex.get(key);
    if (index === undefined) continue;

    seriesByName.get(expense.categoryName)![index] += Math.abs(expense.amount);
  }

  // Preserve rank order so the legend reads strongest-first.
  const series: CategorySeries[] = rankedCategories
    .filter((name) => keptCategories.has(name))
    .map((name) => ({ name, values: seriesByName.get(name)! }));

  return {
    buckets: axis.map(({ key, label }) => ({ key, label })),
    series,
  };
}

/**
 * Average monthly savings rate over the N months trailing (and including) a
 * reference month — the counterbalancing figure shown when the selected month
 * is a deficit, mirroring the Panoramica hero's 12-month reassurance line
 * (see CLAUDE.md "Panoramica: hero critique follow-up").
 *
 * Months with no income are skipped (no rate to average), consistent with the
 * "no data" gap semantics used everywhere else in this module. Returns null
 * when no month in the window has income data.
 */
export function computeTrailingSavingsRateAverage(
  expenses: Expense[],
  referenceYear: number,
  referenceMonth: number,
  monthsBack = 12,
): number | null {
  let year = referenceYear;
  let month = referenceMonth;
  const rates: number[] = [];

  for (let i = 0; i < monthsBack; i++) {
    const monthExpenses = expenses.filter((e) => {
      const d = toDate(e.date);
      return getItalyYear(d) === year && getItalyMonth(d) === month;
    });

    const income = monthExpenses
      .filter((e) => e.type === 'income')
      .reduce((s, e) => s + e.amount, 0);
    const outflow = monthExpenses
      .filter((e) => isExpenseRecord(e))
      .reduce((s, e) => s + Math.abs(e.amount), 0);

    if (income > 0) rates.push(((income - outflow) / income) * 100);

    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
  }

  if (rates.length === 0) return null;
  return rates.reduce((s, r) => s + r, 0) / rates.length;
}

/**
 * The three real spending types, in the canonical order used across the app
 * (structural → discretionary → debt). Mirrors budgetUtils' SECTION_ORDER so the
 * "Uscite per Tipo" chart reads the same direction as the budget sections.
 */
const EXPENSE_TYPE_ORDER: ExpenseType[] = ['fixed', 'variable', 'debt'];

/**
 * Build per-type multi-line series (Fisse / Variabili / Debiti) over the full history.
 *
 * Answers a different question than buildCategoryTimeSeries: how the spending *mix*
 * (structural vs discretionary vs debt) evolves over time. Unlike categories there is
 * no top-N ranking — the type domain is fixed and small — but a type with zero spend
 * across the whole window is dropped so a user with no debt doesn't get a flat line at 0.
 *
 * @param expenses          All expense/income/transfer records.
 * @param granularity       'month' or 'year' buckets.
 * @param historyStartYear  Hard lower bound — buckets never start before this year.
 * @returns Shared bucket axis + one value array per non-empty type; empty when no data.
 */
export function buildTypeTimeSeries(
  expenses: Expense[],
  granularity: TimeGranularity,
  historyStartYear: number,
): CategoryTimeSeries {
  const relevant = expenses.filter(
    (e) => isExpenseRecord(e) && getItalyYear(toDate(e.date)) >= historyStartYear,
  );

  const axis = buildBucketAxis(relevant, granularity, historyStartYear);
  if (axis.length === 0) return { buckets: [], series: [] };

  const bucketIndex = new Map<string, number>();
  axis.forEach((b, i) => bucketIndex.set(b.key, i));

  // One zero-filled value array per spending type, in canonical order.
  const seriesByType = new Map<ExpenseType, number[]>();
  for (const type of EXPENSE_TYPE_ORDER) seriesByType.set(type, new Array(axis.length).fill(0));

  for (const expense of relevant) {
    const values = seriesByType.get(expense.type as ExpenseType);
    // isExpenseRecord guarantees the type is one of fixed/variable/debt.
    if (!values) continue;

    const date = toDate(expense.date);
    const key = bucketKeyFor(getItalyYear(date), getItalyMonth(date), granularity);
    const index = bucketIndex.get(key);
    if (index === undefined) continue;

    values[index] += Math.abs(expense.amount);
  }

  // Drop types with no spend over the whole window (e.g. a user with no debt).
  const series: CategorySeries[] = EXPENSE_TYPE_ORDER.filter((type) =>
    seriesByType.get(type)!.some((v) => v > 0),
  ).map((type) => ({ name: EXPENSE_TYPE_LABELS[type], values: seriesByType.get(type)! }));

  return {
    buckets: axis.map(({ key, label }) => ({ key, label })),
    series,
  };
}
