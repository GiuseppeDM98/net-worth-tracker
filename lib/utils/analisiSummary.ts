/**
 * The numbers of Analisi that are born nowhere else: the period as a calendar object (its
 * month count, the month its anomalies run on, whether it is still running), the top
 * expenses of the period, the spending series the Periodo tile draws (per month against the
 * same months of the previous year, or per year), the flow summary and the year-over-year
 * movers. The compositions, the pacing and the anomalies keep living in
 * `cashflowComposition.ts` / `comparisonDeltas.ts` — this module only adds what the tiles
 * need on top of them, so every figure the page prints has one source.
 *
 * Pure and timezone-agnostic: the month/day resolvers are injected (the page passes the
 * Italy-calendar ones), exactly like `comparisonDeltas` and `expenseEntityStats`.
 */

import type { Expense, ExpenseType } from '@/types/expenses';
import type { CategoryDeltaRow } from '@/lib/utils/comparisonDeltas';
import { NO_SUBCATEGORY_KEY } from '@/types/expenses';
import { getCategoryKey, getCategoryName, getSubCategoryKey, getSubCategoryLabel } from '@/lib/utils/expenseGrouping';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';

// ─── The period ───────────────────────────────────────────────────────────────

/**
 * The four modes of the Analisi axis (the URL's `?period=`).
 *
 * `ytd` and `current` are NOT the same window: `current` is the whole calendar year, December
 * included, and therefore carries what is only scheduled; `ytd` stops at the end of today's
 * month. Two questions — «come sta andando l'anno?» and «quanto ho fatto finora?» — so two
 * modes, each saying which it is.
 */
export type PeriodMode = 'ytd' | 'current' | 'year' | 'history';

/** The page's period state: `year` is null only in history, `month` only when a month is picked. */
export interface AnalisiPeriod {
  mode: PeriodMode;
  year: number | null;
  month: number | null;
}

export interface MonthRef {
  year: number;
  /** 1-12. */
  month: number;
}

export type MonthResolver = (expense: Expense) => MonthRef;
export type DayResolver = (expense: Expense) => MonthRef & { day: number };

/**
 * The single month the anomalies (and the «Fuori scala» tile) run on: an explicitly picked
 * month, or today's month for the bare running year — the only month a live check can mean.
 * A past year without a month, and the history, have no such month.
 */
export function resolveSingleMonth(period: AnalisiPeriod, today: MonthRef): MonthRef | null {
  if (period.mode === 'history' || period.year === null) return null;
  if (period.month !== null) return { year: period.year, month: period.month };
  // Both windows on the running year mean today's month; a past year means no month at all.
  return period.mode === 'current' || period.mode === 'ytd' ? { year: today.year, month: today.month } : null;
}

/** Whether the period is still running today — the tense of the verdict. */
export function isPeriodOngoing(period: AnalisiPeriod, today: MonthRef): boolean {
  if (period.mode === 'history' || period.year === null) return true;
  if (period.year !== today.year) return false;
  return period.month === null || period.month === today.month;
}

/** The last month a period covers, or null when it covers the whole year (or no year at all). */
export function resolvePeriodThroughMonth(period: AnalisiPeriod, today: MonthRef): number | null {
  if (period.mode === 'history' || period.year === null) return null;
  if (period.month !== null) return period.month;
  return period.mode === 'ytd' ? today.month : null;
}

// ─── Top expenses ─────────────────────────────────────────────────────────────

const isSpending = (expense: Expense): boolean => expense.type !== 'income' && expense.type !== 'transfer';

export interface TopExpenseRow {
  key: string;
  /** The category, as printed. */
  label: string;
  /** The subcategory, when the row carries one. */
  subCategoryLabel: string | null;
  /** «12 ago · Volo» — the day and the subcategory, under the label. */
  caption: string;
  amount: number;
  /** Share of the period's spending, 0-100. */
  percentage: number;
  expenseType: ExpenseType;
  categoryKey: string;
  subCategoryKey: string | null;
}

export interface TopExpenses {
  rows: TopExpenseRow[];
  /** The sum of the rows shown. */
  shownTotal: number;
  /** The period's whole spending, what the shares are measured on. */
  total: number;
  /** How many spending rows the period has. */
  count: number;
}

/**
 * The largest spending rows of the period, by magnitude. Income and transfers never rank;
 * the share is measured on the whole spending of the period, so the reading can say what
 * the top rows weigh.
 */
export function rankTopExpenses(expenses: Expense[], dayOf: DayResolver, limit = 5): TopExpenses {
  const spending = expenses.filter(isSpending);
  const total = spending.reduce((sum, expense) => sum + Math.abs(expense.amount), 0);
  if (spending.length === 0 || total <= 0) return { rows: [], shownTotal: 0, total: 0, count: 0 };

  const rows = [...spending]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit)
    .map((expense): TopExpenseRow => {
      const when = dayOf(expense);
      // The subcategory follows the grouping rule (keyed by id): a name without an id is the
      // «no subcategory» bucket, and the click lands on the category.
      const subCategoryKey = getSubCategoryKey(expense);
      const hasSubCategory = subCategoryKey !== NO_SUBCATEGORY_KEY;
      const subCategoryLabel = hasSubCategory ? getSubCategoryLabel(expense) : null;
      const day = `${when.day} ${MONTH_NAMES_SHORT[when.month - 1].toLowerCase()}`;
      return {
        key: expense.id,
        label: getCategoryName(expense),
        subCategoryLabel,
        caption: subCategoryLabel ? `${day} · ${subCategoryLabel}` : day,
        amount: Math.abs(expense.amount),
        percentage: (Math.abs(expense.amount) / total) * 100,
        expenseType: expense.type,
        categoryKey: getCategoryKey(expense),
        subCategoryKey: hasSubCategory ? subCategoryKey : null,
      };
    });

  return { rows, shownTotal: rows.reduce((sum, row) => sum + row.amount, 0), total, count: spending.length };
}

// ─── Spending series ──────────────────────────────────────────────────────────

export interface SpendingPoint {
  /** 'YYYY-MM' for a month, 'YYYY' for a year. */
  key: string;
  /** 'Gen' / '2026'. */
  label: string;
  /** Spending magnitude in the bucket. */
  value: number;
  /**
   * The same month one year earlier, for the monthly series. 0 means «tracked, nothing
   * spent»; null means unknowable — the previous year is below the history floor, or it has
   * no rows at all — and draws as a gap, never as a flat zero. Always null on a yearly series.
   */
  prevYearValue: number | null;
  /** The bucket that contains today — drawn at half tone and outlined. */
  ongoing: boolean;
  /**
   * The bucket has not started yet: it holds only what is already in the calendar
   * (recurring rows, instalments). Never true for the bucket in progress.
   */
  scheduled: boolean;
}

/**
 * Spending per month of `year`, January to `throughMonth`, beside the same month of the
 * previous year. The baseline is null below the history floor and when the previous year has
 * no rows at all (the same rule `computeTotalsPacing` uses to refuse a fake zero baseline).
 */
export function buildMonthlySpending(
  expenses: Expense[],
  year: number,
  throughMonth: number,
  historyStartYear: number,
  monthOf: MonthResolver,
  today: MonthRef,
): SpendingPoint[] {
  const current = new Array<number>(12).fill(0);
  const previous = new Array<number>(12).fill(0);
  let previousYearHasRows = false;

  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;
    const when = monthOf(expense);
    if (when.year === year - 1) previousYearHasRows = true;
    if (!isSpending(expense)) continue;
    if (when.year === year) current[when.month - 1] += Math.abs(expense.amount);
    else if (when.year === year - 1) previous[when.month - 1] += Math.abs(expense.amount);
  }

  const baselineKnown = year - 1 >= historyStartYear && previousYearHasRows;
  const points: SpendingPoint[] = [];
  for (let month = 1; month <= throughMonth; month++) {
    points.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: MONTH_NAMES_SHORT[month - 1],
      value: current[month - 1],
      prevYearValue: baselineKnown ? previous[month - 1] : null,
      ongoing: year === today.year && month === today.month,
      scheduled: year > today.year || (year === today.year && month > today.month),
    });
  }
  return points;
}

/**
 * Spending per year, from the first year with data at or after the floor to today's year,
 * gap-free: a tracked year with nothing spent is a zero bar, not a missing one.
 */
export function buildYearlySpending(expenses: Expense[], historyStartYear: number, monthOf: MonthResolver, today: MonthRef): SpendingPoint[] {
  const byYear = new Map<number, number>();
  let firstYear: number | null = null;
  for (const expense of expenses) {
    const { year } = monthOf(expense);
    if (year < historyStartYear || expense.type === 'transfer') continue;
    if (firstYear === null || year < firstYear) firstYear = year;
    if (isSpending(expense)) byYear.set(year, (byYear.get(year) ?? 0) + Math.abs(expense.amount));
  }
  if (firstYear === null) return [];

  const points: SpendingPoint[] = [];
  for (let year = firstYear; year <= today.year; year++) {
    points.push({ key: String(year), label: String(year), value: byYear.get(year) ?? 0, prevYearValue: null, ongoing: year === today.year, scheduled: false });
  }
  return points;
}

// ─── Flow ─────────────────────────────────────────────────────────────────────

export type SpendingType = 'fixed' | 'variable' | 'debt';

/** The lowercase names the Flusso reading uses («Fisse 58%, variabili 37%, debiti 5%»). */
export const SPENDING_TYPE_LABELS: Record<SpendingType, string> = { fixed: 'Fisse', variable: 'Variabili', debt: 'Debiti' };

const SPENDING_TYPES: SpendingType[] = ['fixed', 'variable', 'debt'];

export interface TypeShare {
  type: SpendingType;
  label: string;
  amount: number;
  /** Share of the spending, 0-100. */
  percentage: number;
}

export interface FlowSummary {
  incomeTotal: number;
  /** Distinct income categories with a positive amount — the sources the flow starts from. */
  incomeSources: number;
  expensesTotal: number;
  /** Distinct (type, category) keys with spending — the same identity the Sankey nodes carry. */
  categoryCount: number;
  /** The spending types with something in them, largest first. */
  typeShares: TypeShare[];
}

/** What the Sankey shows, in numbers: sources, types, categories and their shares. */
export function summarizeFlow(expenses: Expense[]): FlowSummary {
  const incomeByCategory = new Map<string, number>();
  const spendingByCategory = new Set<string>();
  const byType: Record<SpendingType, number> = { fixed: 0, variable: 0, debt: 0 };
  let incomeTotal = 0;
  let expensesTotal = 0;

  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;
    if (expense.type === 'income') {
      incomeTotal += expense.amount;
      const key = getCategoryKey(expense);
      incomeByCategory.set(key, (incomeByCategory.get(key) ?? 0) + expense.amount);
      continue;
    }
    const amount = Math.abs(expense.amount);
    expensesTotal += amount;
    if (amount > 0) spendingByCategory.add(`${expense.type}:${getCategoryKey(expense)}`);
    if (expense.type in byType) byType[expense.type as SpendingType] += amount;
  }

  const typeShares = SPENDING_TYPES.filter((type) => byType[type] > 0)
    .map((type) => ({ type, label: SPENDING_TYPE_LABELS[type], amount: byType[type], percentage: expensesTotal > 0 ? (byType[type] / expensesTotal) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    incomeTotal,
    incomeSources: Array.from(incomeByCategory.values()).filter((amount) => amount > 0).length,
    expensesTotal,
    categoryCount: spendingByCategory.size,
    typeShares,
  };
}

// ─── Movers ───────────────────────────────────────────────────────────────────

export interface CategoryMover {
  label: string;
  /** current − previous: positive means spending grew. */
  delta: number;
  deltaPercent: number | null;
  expenseType: ExpenseType;
  categoryKey: string;
}

/** The category that grew the most and the one that fell the most, out of the comparison rows; null on a side with no mover. */
export function resolveCategoryMovers(rows: CategoryDeltaRow[]): { grown: CategoryMover | null; shrunk: CategoryMover | null } {
  const toMover = (row: CategoryDeltaRow): CategoryMover => ({
    label: row.label,
    delta: row.delta,
    deltaPercent: row.deltaPercent,
    expenseType: row.expenseType,
    categoryKey: row.categoryKey,
  });
  let grown: CategoryDeltaRow | null = null;
  let shrunk: CategoryDeltaRow | null = null;
  for (const row of rows) {
    if (row.delta > 0 && (!grown || row.delta > grown.delta)) grown = row;
    if (row.delta < 0 && (!shrunk || row.delta < shrunk.delta)) shrunk = row;
  }
  return { grown: grown ? toMover(grown) : null, shrunk: shrunk ? toMover(shrunk) : null };
}
