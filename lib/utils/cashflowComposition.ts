/**
 * Composition rankings for the Analisi tab — pure, colour-free.
 *
 * WHY A SEPARATE MODULE FROM cashflowSankey
 * The Analisi page has two independent drill-down paths (doc/guide/cashflow.md § Cashflow
 * Drill-Down): the Sankey and the CompositionList below it. They answer different
 * questions — a flow versus a ranking — so they keep different shapes and different
 * code. What they must share is the answer to "which rows are the same bucket", and
 * that lives in expenseGrouping. Merging the two would couple a bar list to a graph
 * layout; keeping the keying separate is what let them disagree in the first place.
 *
 * NO COLOURS HERE
 * Slices carry identity, label and magnitude. The caller resolves colours from
 * useChartColors() — the same contract CompositionList states, and the reason this file
 * can be unit-tested without a React runtime.
 */

import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import {
  getCategoryKey,
  getCategoryName,
  getSubCategoryKey,
  getSubCategoryLabel,
  resolveDisplayLabels,
  selectExpensesForDrillDown,
  type CategoryScope,
} from '@/lib/utils/expenseGrouping';

/** One row of a ranked composition list. */
export interface CompositionSlice {
  /** Identity — what a click drills into. Never the display name. */
  key: string;
  /** Display label, qualified by type only where two categories collide on the name. */
  name: string;
  value: number;
  /** Share of the list's total, 0-100. */
  percentage: number;
}

/** A category slice also carries the type, so a click can build an exact filter. */
export interface CategorySlice extends CompositionSlice {
  expenseType: ExpenseType;
  categoryKey: string;
}

/** Spending is ranked by magnitude, so a refund does not read as a negative row. */
const magnitude = (expense: Expense): number => Math.abs(expense.amount);

function withPercentages<T extends { value: number }>(slices: T[]): T[] {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  return slices
    .map((slice) => ({ ...slice, percentage: total > 0 ? (slice.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}

interface CategoryAccumulator {
  expenseType: ExpenseType;
  categoryKey: string;
  name: string;
  value: number;
}

/**
 * Rank spending categories.
 *
 * Grouped by (type, category), not by name: "Casa" under Spese Fisse and "Casa" under
 * Spese Variabili are two different documents and get two rows, each drillable into its
 * own transactions. They used to be summed into one row whose drill-down then showed a
 * mix of both.
 */
export function buildExpenseComposition(expenses: Expense[]): CategorySlice[] {
  const buckets = new Map<string, CategoryAccumulator>();

  for (const expense of expenses) {
    if (expense.type === 'income' || expense.type === 'transfer') continue;

    const categoryKey = getCategoryKey(expense);
    const key = `${expense.type}:${categoryKey}`;
    const bucket = buckets.get(key) ?? {
      expenseType: expense.type,
      categoryKey,
      name: getCategoryName(expense),
      value: 0,
    };
    bucket.value += magnitude(expense);
    buckets.set(key, bucket);
  }

  const labels = resolveDisplayLabels(
    Array.from(buckets.entries()).map(([key, bucket]) => ({
      key,
      name: bucket.name,
      qualifier: EXPENSE_TYPE_LABELS[bucket.expenseType],
    }))
  );

  return withPercentages(
    Array.from(buckets.entries()).map(([key, bucket]) => ({
      key,
      name: labels.get(key) ?? bucket.name,
      value: bucket.value,
      percentage: 0,
      expenseType: bucket.expenseType,
      categoryKey: bucket.categoryKey,
    }))
  );
}

/**
 * Rank income categories. No type qualifier: every row is income, and the card heading
 * already says so.
 */
export function buildIncomeComposition(expenses: Expense[]): CategorySlice[] {
  const buckets = new Map<string, CategoryAccumulator>();

  for (const expense of expenses) {
    if (expense.type !== 'income') continue;

    const categoryKey = getCategoryKey(expense);
    const bucket = buckets.get(categoryKey) ?? {
      expenseType: 'income' as ExpenseType,
      categoryKey,
      name: getCategoryName(expense),
      value: 0,
    };
    bucket.value += magnitude(expense);
    buckets.set(categoryKey, bucket);
  }

  return withPercentages(
    Array.from(buckets.values()).map((bucket) => ({
      key: `income:${bucket.categoryKey}`,
      name: bucket.name,
      value: bucket.value,
      percentage: 0,
      expenseType: bucket.expenseType,
      categoryKey: bucket.categoryKey,
    }))
  );
}

/**
 * Rank one category's subcategories. Rows carrying none land in the shared sentinel
 * bucket rather than vanishing from a breakdown that is supposed to add up.
 */
export function buildSubCategoryComposition(expenses: Expense[], category: CategoryScope): CompositionSlice[] {
  const buckets = new Map<string, { key: string; name: string; value: number }>();

  for (const expense of selectExpensesForDrillDown(expenses, category)) {
    const key = getSubCategoryKey(expense);
    const bucket = buckets.get(key) ?? { key, name: getSubCategoryLabel(expense), value: 0 };
    bucket.value += magnitude(expense);
    buckets.set(key, bucket);
  }

  return withPercentages(Array.from(buckets.values()).map((bucket) => ({ ...bucket, percentage: 0 })));
}

export interface SpendingAnomaly {
  /** Stable identity for the React key and for the drill-down jump. */
  key: string;
  expenseType: ExpenseType;
  categoryKey: string;
  categoryLabel: string;
  currentTotal: number;
  referenceAverage: number;
  deltaPercent: number;
  absoluteDelta: number;
}

/** Flag a category when it exceeds its recent average by both a share and an amount. */
const ANOMALY_DELTA_PERCENT = 25;
const ANOMALY_DELTA_ABSOLUTE = 50;
const ANOMALY_REFERENCE_MONTHS = 6;
const ANOMALY_MIN_MONTHS_WITH_DATA = 3;

/**
 * Spending categories that ran hot in one month against their own recent history.
 *
 * Each category is compared to its own trailing average, keyed by (type, category) so
 * a fixed "Casa" and a variable "Casa" get independent baselines — sharing one would
 * both blur the average and emit two chips the reader cannot tell apart.
 *
 * @param expenses Every row available, not just the month under test: the baseline is
 *                 drawn from the months before it.
 * @param year     Calendar year of the month under test.
 * @param month    1-12, Italy timezone (the caller resolves that).
 */
export function detectSpendingAnomalies(
  expenses: Expense[],
  year: number,
  month: number,
  monthOf: (expense: Expense) => { year: number; month: number }
): SpendingAnomaly[] {
  const isSpending = (expense: Expense) => expense.type !== 'income' && expense.type !== 'transfer';

  // The months the baseline is drawn from, walking backwards across year boundaries.
  const referenceMonths: Array<{ year: number; month: number }> = [];
  let refYear = year;
  let refMonth = month - 1;
  for (let i = 0; i < ANOMALY_REFERENCE_MONTHS; i++) {
    if (refMonth < 1) {
      refMonth = 12;
      refYear--;
    }
    referenceMonths.push({ year: refYear, month: refMonth });
    refMonth--;
  }

  // One pass builds both the month under test and every reference month, keyed the same
  // way — a second pass per category was O(categories × months × rows).
  const currentTotals = new Map<string, CategoryAccumulator>();
  const referenceTotals = new Map<string, number[]>();

  for (const expense of expenses) {
    if (!isSpending(expense)) continue;

    const when = monthOf(expense);
    const categoryKey = getCategoryKey(expense);
    const key = `${expense.type}:${categoryKey}`;

    if (when.year === year && when.month === month) {
      const bucket = currentTotals.get(key) ?? {
        expenseType: expense.type,
        categoryKey,
        name: getCategoryName(expense),
        value: 0,
      };
      bucket.value += magnitude(expense);
      currentTotals.set(key, bucket);
      continue;
    }

    const position = referenceMonths.findIndex((m) => m.year === when.year && m.month === when.month);
    if (position === -1) continue;

    const totals = referenceTotals.get(key) ?? new Array<number>(ANOMALY_REFERENCE_MONTHS).fill(0);
    totals[position] += magnitude(expense);
    referenceTotals.set(key, totals);
  }

  if (currentTotals.size === 0) return [];

  const labels = resolveDisplayLabels(
    Array.from(currentTotals.entries()).map(([key, bucket]) => ({
      key,
      name: bucket.name,
      qualifier: EXPENSE_TYPE_LABELS[bucket.expenseType],
    }))
  );

  const anomalies: SpendingAnomaly[] = [];

  for (const [key, bucket] of currentTotals) {
    const monthlyTotals = referenceTotals.get(key) ?? [];
    // Too new or too irregular to have a meaningful baseline.
    if (monthlyTotals.filter((total) => total > 0).length < ANOMALY_MIN_MONTHS_WITH_DATA) continue;

    // Averaged over all six months rather than only the ones with spending, so an
    // occasional spender is not flagged every time they do spend.
    const referenceAverage = monthlyTotals.reduce((sum, total) => sum + total, 0) / ANOMALY_REFERENCE_MONTHS;
    if (referenceAverage === 0) continue;

    const absoluteDelta = bucket.value - referenceAverage;
    const deltaPercent = (absoluteDelta / referenceAverage) * 100;

    // Only increases: spending less is good news, not an anomaly.
    if (deltaPercent > ANOMALY_DELTA_PERCENT && absoluteDelta > ANOMALY_DELTA_ABSOLUTE) {
      anomalies.push({
        key,
        expenseType: bucket.expenseType,
        categoryKey: bucket.categoryKey,
        categoryLabel: labels.get(key) ?? bucket.name,
        currentTotal: bucket.value,
        referenceAverage,
        deltaPercent,
        absoluteDelta,
      });
    }
  }

  return anomalies.sort((a, b) => b.deltaPercent - a.deltaPercent);
}
