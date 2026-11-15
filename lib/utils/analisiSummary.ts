/**
 * The numbers of Analisi that are born nowhere else: the period as a calendar object (its
 * month count, the month its anomalies run on, whether it is still running), the top
 * expenses of the period, the subcategory ranking, the income ring's shares, the spending
 * series the Periodo tile draws (per month against the same months of the previous year, or
 * per year), the flow summary, the year-over-year movers and «Cosa è cambiato». The compositions, the pacing and the anomalies keep living in
 * `cashflowComposition.ts` / `comparisonDeltas.ts` — this module only adds what the tiles
 * need on top of them, so every figure the page prints has one source.
 *
 * Pure and timezone-agnostic: the month/day resolvers are injected (the page passes the
 * Italy-calendar ones), exactly like `comparisonDeltas` and `expenseEntityStats`.
 */

import type { Expense, ExpenseType } from '@/types/expenses';
import type { CategoryDeltaRow } from '@/lib/utils/comparisonDeltas';
import type { CategorySlice, CompositionSlice } from '@/lib/utils/cashflowComposition';
import { roundToCents } from '@/lib/utils/cents';
import { RING_REST_KEY } from '@/lib/utils/ringChart';
import { NO_SUBCATEGORY_KEY } from '@/types/expenses';
import { getCategoryKey, getCategoryName, getSubCategoryKey, getSubCategoryLabel } from '@/lib/utils/expenseGrouping';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import {
  isSpendingType,
  resolveFlowAbsence,
  SPENDING_EXPENSE_TYPES,
  type FlowAbsence,
  type SpendingExpenseType,
} from '@/lib/utils/spendingRoles';
import type { PeriodCashflowTotals } from '@/lib/utils/tracciamentoSummary';
import type { StripFigure } from '@/lib/utils/verdictStrip';
import { meaningfulSavingsRate } from '@/lib/utils/savingsRate';

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
  if (period.month !== null) {
    // A month that has not started holds only its calendar: nothing to run hot against a
    // six-month average, so no month is meant and the tile stays absent (2026-09-14).
    const notStarted = period.year > today.year || (period.year === today.year && period.month > today.month);
    return notStarted ? null : { year: period.year, month: period.month };
  }
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
  /** The category, as printed — what the reading and the closed answer name. */
  label: string;
  /** The first line of the row's note (≤ 48 characters), the tile's label when present; null without one. */
  note: string | null;
  /** The subcategory, when the row carries one. */
  subCategoryLabel: string | null;
  /**
   * «Volo · 12 ago» — the subcategory and the day, under the label; «· in calendario» when the row is
   * still ahead. A row labelled by its note opens on its category («Casa · Condominio · 14 mar»;
   * widest fact first, owner 2026-11-15).
   */
  caption: string;
  /** Dated after today: in the period's total, not spent yet (The Scheduled-Is-Not-Spent Rule). */
  scheduled: boolean;
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
export function rankTopExpenses(expenses: Expense[], dayOf: DayResolver, limit = 5, isScheduled: (expense: Expense) => boolean = () => false): TopExpenses {
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
      const scheduled = isScheduled(expense);
      const note = noteLabel(expense);
      const captionParts = [note ? getCategoryName(expense) : null, subCategoryLabel, day, scheduled ? 'in calendario' : null].filter((part): part is string => part !== null);
      return {
        key: expense.id,
        label: getCategoryName(expense),
        note,
        subCategoryLabel,
        caption: captionParts.join(' · '),
        scheduled,
        amount: Math.abs(expense.amount),
        percentage: (Math.abs(expense.amount) / total) * 100,
        expenseType: expense.type,
        categoryKey: getCategoryKey(expense),
        subCategoryKey: hasSubCategory ? subCategoryKey : null,
      };
    });

  return { rows, shownTotal: rows.reduce((sum, row) => sum + row.amount, 0), total, count: spending.length };
}

/** What Spese maggiori shows folded, and the most it unfolds to («Mostra altre N»). */
export const TOP_EXPENSES_SHOWN = 10;
export const TOP_EXPENSES_MORE = 20;
const NOTE_LABEL_CHARS = 48;

/** The row's own words when it has them: the first line of its note, cut at 48 characters. */
export function noteLabel(expense: Expense): string | null {
  const line = expense.notes?.split('\n')[0].trim();
  if (!line) return null;
  return line.length > NOTE_LABEL_CHARS ? `${line.slice(0, NOTE_LABEL_CHARS - 1).trimEnd()}…` : line;
}

/** The first `count` rows with their own sum: what the reading speaks of. */
export function limitTopExpenses(top: TopExpenses, count: number): TopExpenses {
  const rows = top.rows.slice(0, count);
  return { ...top, rows, shownTotal: rows.reduce((sum, row) => sum + row.amount, 0) };
}

// ─── «Dove vanno i soldi» and «Entrate» ───────────────────────────────────────

/** A spending subcategory; a row without one ranks under its category's name. */
export interface SubCategorySlice extends CategorySlice {
  subCategoryKey: string;
  /** «Casa» under «Condominio»; «senza sottocategoria» under a category's own rows. */
  caption: string;
}

/**
 * The «Sottocategorie» view of the spending ranking: one row per (type, category, subcategory),
 * largest first, the share of the period's spending. A category's rows without a subcategory are ONE
 * row named after the category and captioned «senza sottocategoria»; when two categories of
 * different types share a name, the caption names the type too, or the two rows read the same.
 */
export function buildSubCategoryRanking(expenses: Expense[]): SubCategorySlice[] {
  const buckets = new Map<string, Omit<SubCategorySlice, 'percentage'>>();
  for (const expense of expenses) {
    if (!isSpending(expense)) continue;
    const categoryKey = getCategoryKey(expense);
    const subCategoryKey = getSubCategoryKey(expense);
    const key = `${expense.type}:${categoryKey}:${subCategoryKey}`;
    const none = subCategoryKey === NO_SUBCATEGORY_KEY;
    const bucket = buckets.get(key) ?? {
      key,
      expenseType: expense.type,
      categoryKey,
      subCategoryKey,
      value: 0,
      name: none ? getCategoryName(expense) : getSubCategoryLabel(expense),
      caption: none ? 'senza sottocategoria' : getCategoryName(expense),
    };
    bucket.value = roundToCents(bucket.value + Math.abs(expense.amount));
    buckets.set(key, bucket);
  }
  const rows = Array.from(buckets.values()).filter((row) => row.value > 0);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  // Two categories may share a name across types («Casa» necessaria and non necessaria): name the type too.
  const categoryName = (row: (typeof rows)[number]) => (row.subCategoryKey === NO_SUBCATEGORY_KEY ? row.name : row.caption);
  const typesByName = new Map<string, Set<ExpenseType>>();
  for (const row of rows) typesByName.set(categoryName(row), (typesByName.get(categoryName(row)) ?? new Set()).add(row.expenseType));
  const qualify = (row: (typeof rows)[number]): string => {
    if ((typesByName.get(categoryName(row))?.size ?? 0) <= 1) return row.caption;
    const type = SPENDING_TYPE_LABELS[row.expenseType as SpendingType].toLowerCase();
    return row.subCategoryKey === NO_SUBCATEGORY_KEY ? `senza sottocategoria · ${type}` : `${row.caption} · ${type}`;
  };
  return rows
    .map((row) => ({ ...row, caption: qualify(row), percentage: (row.value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

/** A ring part with its share printed so the legend adds up to 100 on screen; `key` is `RING_REST_KEY` on the rest. */
export interface RingShare {
  key: string;
  label: string;
  value: number;
  printedPercentage: number;
  rest: boolean;
}

/** The first `count` slices and ONE «Altre N categorie» (a single leftover keeps its name). */
export function buildRingShares(slices: readonly CompositionSlice[], count: number): RingShare[] {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return [];
  const head = slices.length === count + 1 ? slices : slices.slice(0, count);
  const tail = slices.slice(head.length);
  const pct = (value: number) => Math.round((value / total) * 100);
  const shares: RingShare[] = head.map((slice) => ({ key: slice.key, label: slice.name, value: slice.value, printedPercentage: pct(slice.value), rest: false }));
  const restValue = tail.reduce((sum, slice) => sum + slice.value, 0);
  if (restValue > 0) {
    shares.push({ key: RING_REST_KEY, label: `Altre ${tail.length} categorie`, value: restValue, printedPercentage: pct(restValue), rest: true });
  }
  // The rounding drift goes on the rest, the row that is a remainder by definition (AGENTS.md → «A list
  // that must add up adds up ON SCREEN»); without a rest, on the largest, as `summarizeFlow` does.
  const last = shares[shares.length - 1];
  const drifted = last.rest ? last : shares[0];
  drifted.printedPercentage += 100 - shares.reduce((sum, share) => sum + share.printedPercentage, 0);
  return shares;
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

/** The spending types, declared once in spendingRoles.ts (`SPENDING_EXPENSE_TYPES`). */
export type SpendingType = SpendingExpenseType;

/**
 * The types' short names — the legends, the Flusso reading («Necessarie 58%, non necessarie 37%,
 * debiti 5%») — as the app names them since 2026-10-20 («Spese Necessarie» / «Spese Non
 * Necessarie»; the ids stay `fixed` / `variable`).
 */
export const SPENDING_TYPE_LABELS: Record<SpendingType, string> = { fixed: 'Necessarie', variable: 'Non necessarie', debt: 'Debiti' };

export interface TypeShare {
  type: SpendingType;
  label: string;
  amount: number;
  /** Share of the spending, 0-100, unrounded. */
  percentage: number;
  /**
   * The same share as printed — a whole percent, rounded ONCE here so the reading and the phone's
   * legend print the same figure and the list adds up to exactly 100 (AGENTS.md → «A list that
   * must add up adds up ON SCREEN»). No type is a remainder by definition, so the drift goes to the
   * largest, where one point is the smallest relative error.
   */
  printedPercentage: number;
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

  const typeShares: TypeShare[] = SPENDING_EXPENSE_TYPES.filter((type) => byType[type] > 0)
    .map((type) => {
      const percentage = expensesTotal > 0 ? (byType[type] / expensesTotal) * 100 : 0;
      return { type, label: SPENDING_TYPE_LABELS[type], amount: byType[type], percentage, printedPercentage: Math.round(percentage) };
    })
    .sort((a, b) => b.amount - a.amount);
  // Three shares round off by at most one point, and the largest of three is at least 33: the
  // correction can never push it below zero.
  if (typeShares.length > 0) {
    typeShares[0].printedPercentage += 100 - typeShares.reduce((sum, share) => sum + share.printedPercentage, 0);
  }

  return {
    incomeTotal,
    incomeSources: Array.from(incomeByCategory.values()).filter((amount) => amount > 0).length,
    expensesTotal,
    categoryCount: spendingByCategory.size,
    typeShares,
  };
}

/** One spending category inside a type block of the phone's type flow. */
export interface TypeFlowCategory {
  /** `getCategoryKey` of the rows — the identity a click hands to Analisi's entity focus. */
  categoryKey: string;
  categoryName: string;
  value: number;
}

export interface TypeFlowBlock extends TypeShare {
  /** Every category of the type, largest first. Sums to `amount`. */
  categories: TypeFlowCategory[];
}

export interface TypeFlowBreakdown {
  /** The spending types in the reading's own order (largest first), each with its categories. */
  blocks: TypeFlowBlock[];
  /** The bar's base: the period's spending (`flow.expensesTotal`), a magnitude. */
  spending: number;
  /** SIGNED income (`flow.incomeTotal`): a reversal lowers it, as on Periodo. */
  income: number;
  /** income − spending when positive, else 0: what the period put aside. */
  surplus: number;
  /** spending − income when positive, else 0: what the wealth covered. */
  deficit: number;
  /**
   * Where the income ends along the spending bar, 0-100 (clamped), when spending ran past it.
   * `null` with no deficit, and `null` when income is not positive (none, or a net reversal):
   * a line at 0 — or left of the bar — would draw its label outside the tile.
   */
  incomeEdge: number | null;
  /** Spending with income ≤ 0: every euro spent came from the wealth. */
  noIncome: boolean;
  /** Non-null exactly when there is nothing to draw (no spending and no surplus). */
  absence: FlowAbsence | null;
}

/**
 * The Flusso «Per tipo» on a phone, in numbers: the reading's type
 * shares — taken from the SAME `FlowSummary` the sentence prints, so the bar and the words can
 * never show two figures — plus each type's categories for the rows under it.
 *
 * Shares are of the SPENDING, not of what left the budget: the reading gives the types over the
 * spending and the savings over the income, and a screen shows one base, never two figures on
 * different bases. Savings therefore sit outside the bar, as `surplus`.
 *
 * Categories are keyed by (type, category) and labelled by their plain name: inside one type's
 * block a qualifier could only repeat the block's own type (see `resolveDisplayLabels`). The map
 * is PER TYPE because the key alone is not: two legacy rows without a `categoryId`, both named
 * «Casa», one fixed and one variable, share the name-derived key and must still land apart.
 */
export function buildTypeFlowBreakdown(expenses: Expense[], flow: FlowSummary): TypeFlowBreakdown {
  const byType = new Map<SpendingType, Map<string, TypeFlowCategory>>(SPENDING_EXPENSE_TYPES.map((type) => [type, new Map()]));
  let rowCount = 0;
  for (const expense of expenses) {
    if (expense.type === 'income') rowCount++;
    if (!isSpendingType(expense.type)) continue;
    rowCount++;
    const categories = byType.get(expense.type)!;
    const categoryKey = getCategoryKey(expense);
    const category = categories.get(categoryKey) ?? { categoryKey, categoryName: getCategoryName(expense), value: 0 };
    category.value += Math.abs(expense.amount);
    categories.set(categoryKey, category);
  }

  const blocks = flow.typeShares.map((share) => ({
    ...share,
    categories: Array.from(byType.get(share.type)!.values())
      .filter((category) => category.value > 0)
      .sort((a, b) => b.value - a.value),
  }));
  const spending = flow.expensesTotal;
  const income = flow.incomeTotal;
  const surplus = Math.max(0, income - spending);
  const deficit = Math.max(0, spending - income);
  const hasIncome = income > 0;
  return {
    blocks,
    spending,
    income,
    surplus,
    deficit,
    // income / spending is below 1 whenever there is a deficit; the clamp keeps the line on the
    // bar however the caller's rounding lands.
    incomeEdge: hasIncome && deficit > 0 ? Math.min(100, Math.max(0, (income / spending) * 100)) : null,
    noIncome: !hasIncome && spending > 0,
    absence: resolveFlowAbsence(rowCount, spending + surplus),
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

// ─── «Cosa è cambiato» ────────────────────────────────────────────────────────

/** The movers «Cosa è cambiato» draws. */
export const CHANGE_ROWS = 6;

/** `bar` in % of a track centred on zero: a rise right of 50, a fall left of it. */
export interface CategoryChange extends CategoryDeltaRow {
  bar: { left: number; width: number };
}

export interface CategoryChanges {
  /** The six largest |delta| (a delta that prints 0 € is no mover), grown first. */
  rows: CategoryChange[];
  /** `pacing.expenses.delta`: the same window, so every row's delta sums to it. */
  totalDelta: number;
  /** The fewest movers in the total's direction that reach it, at most three; [] at 0 €. */
  explainedBy: CategoryDeltaRow[];
  /** Their share of the total when three do not reach it; null when they do. */
  explainedShare: number | null;
  newLabels: string[];
  goneLabels: string[];
}

/**
 * The categories that moved most against the Periodo's own baseline (the comparison rows of
 * `buildCategoryComparison`), with what explains the total: the largest movers in its direction,
 * taken until they reach it. The bars share one scale, the largest mover filling its half.
 */
export function summarizeCategoryChanges(deltaRows: readonly CategoryDeltaRow[], totalDelta: number): CategoryChanges {
  const byMagnitude = deltaRows.filter((row) => Math.round(row.delta) !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const largest = byMagnitude.slice(0, CHANGE_ROWS);
  const scale = Math.max(0, ...largest.map((row) => Math.abs(row.delta)));
  const rows = [...largest]
    .sort((a, b) => b.delta - a.delta)
    .map((row): CategoryChange => {
      const width = scale > 0 ? (Math.abs(row.delta) / scale) * 50 : 0;
      return { ...row, bar: { left: row.delta >= 0 ? 50 : 50 - width, width } };
    });
  const explainedBy: CategoryDeltaRow[] = [];
  let explainedShare: number | null = null;
  if (Math.round(totalDelta) !== 0) {
    let reached = 0;
    for (const row of byMagnitude.filter((r) => Math.sign(r.delta) === Math.sign(totalDelta)).slice(0, 3)) {
      explainedBy.push(row);
      reached += Math.abs(row.delta);
      if (reached >= Math.abs(totalDelta)) break;
    }
    if (reached < Math.abs(totalDelta)) explainedShare = (reached / Math.abs(totalDelta)) * 100;
  }
  const labels = (status: CategoryDeltaRow['status']) => deltaRows.filter((row) => row.status === status).map((row) => row.label);
  return { rows, totalDelta, explainedBy, explainedShare, newLabels: labels('new'), goneLabels: labels('gone') };
}

// ─── The phone composition (2026-10-14; THE tile «Dove vanno i soldi» since 2026-11-12) ───

/** THE tile of the page («Dove vanno i soldi»): open at every width, never a row (The First-Screen Rule). */
export const ANALISI_CLASSIFICA_ID = 'analisi-classifica';

/**
 * The rows below `desktop:`, in the DOM's order (The First-Screen Rule). «Cosa è cambiato» exists
 * only with a comparison or the month's anomalies, the Scheda only with a focus: the page hands the
 * controller the rows PRESENT. `flusso` is a lift key, never a row: the Flusso lives in «Dettaglio».
 */
export const ANALISI_SECTION_IDS = {
  maggiori: 'analisi-maggiori',
  cambiato: 'analisi-cambiato',
  entrate: 'analisi-entrate',
  periodo: 'analisi-periodo',
  scheda: 'analisi-scheda',
  flusso: 'analisi-flusso',
} as const;

/** The block of `PeriodoTile` the strip lifts: the trio's values (and the caption of their deltas). */
export const ANALISI_TRIO_BLOCK = 'trio';

/** The block of `FlussoTile` the strip lifts: what was put aside, printed by the «Risparmio» cell. */
export const ANALISI_SAVINGS_BLOCK = 'risparmio';

/**
 * The blocks of the Flusso a phone's strip repeats (since 2026-10-14). Here, not in `FlussoTile`: that
 * module is loaded on demand, and a value imported from it would put it back in the page's first graph.
 */
export type FlussoLiftedBlock = 'risparmio';

/** Narrows the `string[]` of `liftedBlocks(strip, section)` to the Flusso's blocks at the call site. */
export function isFlussoLiftedBlock(block: string): block is FlussoLiftedBlock {
  return block === ANALISI_SAVINGS_BLOCK;
}

/**
 * The two figures under the verdict on a phone (The First-Screen Rule): the period's income and
 * what was left of it, exactly as the Periodo rows print them (`currency`: the «−» U+2212 only on
 * a negative net, a printed zero unsigned — `formatEuroMinus`). The spending is in the verdict's
 * first sentence. «Entrate» opens Entrate and lifts the Periodo's amounts — which the strip and the
 * first sentence all print (The Lifted-Figure Rule) —; «Risparmio» opens the Periodo, whose reading
 * is the savings, and lifts the Flusso's own «Risparmio» figure, which prints the same surplus.
 *
 * `[]` when nothing flowed (income and spending both zero: a period of transfers only, and the
 * Flusso is not drawn) and when the period has not started (The Absence-Has-Three-Names Rule: what
 * is in it is calendar, not a figure of the period).
 */
export function selectAnalisiStrip(totals: Pick<PeriodCashflowTotals, 'income' | 'expenses' | 'net'>, { notStarted = false }: { notStarted?: boolean } = {}): StripFigure[] {
  if (notStarted || (totals.income <= 0 && totals.expenses <= 0)) return [];
  return [
    {
      label: 'Entrate',
      value: totals.income,
      format: 'currency',
      ...(totals.income > 0 ? { tone: 'positive' as const } : {}),
      opens: ANALISI_SECTION_IDS.entrate,
      lifts: { section: ANALISI_SECTION_IDS.periodo, block: ANALISI_TRIO_BLOCK },
    },
    {
      label: 'Risparmio',
      value: totals.net,
      format: 'currency',
      opens: ANALISI_SECTION_IDS.periodo,
      lifts: { section: ANALISI_SECTION_IDS.flusso, block: ANALISI_SAVINGS_BLOCK },
    },
  ];
}

// ─── «Andamento risparmio» ────────────────────────────────────────────────────

/**
 * The points of the savings-rate line, one per month in the order given: `rate` is
 * `meaningfulSavingsRate` of the month's income and spending — `null` (a gap, never a zero) with
 * no income or a deficit beyond the floor, so one month of −16.567% never rescales the axis
 * (2026-11-12). The component walks the window and sums each month; this decides what is drawn.
 */
export function buildSavingsRateTrendPoints(
  months: readonly { label: string; month: number; year: number; income: number; expenses: number }[],
): { label: string; month: number; year: number; rate: number | null; overspent: boolean }[] {
  return months.map(({ label, month, year, income, expenses }) => {
    const rate = meaningfulSavingsRate(income, expenses);
    // A gap with income is a deficit beyond the floor: the chart's description says so.
    return { label, month, year, rate, overspent: rate === null && income > 0 };
  });
}
