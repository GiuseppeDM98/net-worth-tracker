/**
 * Every derived number of Cashflow › Tracciamento that is not a raw expense row: the period
 * totals, the delta against the previous period, the anchored month series behind the two
 * charts, the savings history, the category ranking with its residual and the movements
 * count. `cashflowNarrative.ts` turns these into words; the components only render them.
 *
 * Design: pure and Firebase-free (only `types/expenses`, the date helpers and the grouping
 * rule), so the whole layer is unit-tested without a mock. Two rules hold everywhere:
 *   - classification is by `type`, never by the sign of `amount` (a refund is still spending);
 *   - `transfer` rows are net-zero between two accounts — never income, never spending,
 *     still a movement in the inventory.
 * Month bucketing uses the Italian calendar (`getItalyYear`/`getItalyMonth`), like
 * `cashflowTimeSeries.ts`; the period slice uses `periodToRange`, like the filter toolbar.
 */

import type { Expense, ExpenseType } from '@/types/expenses';
import { EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { type Period, periodToRange, MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { endOfMonthBound, getItalyDate, getItalyDateIso, getItalyMonth, getItalyMonthYear, getItalyYear, isItalyDayAfter, toDate } from '@/lib/utils/dateHelpers';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import { getCategoryKey, getCategoryName, resolveDisplayLabels } from '@/lib/utils/expenseGrouping';

// ─── Period totals ────────────────────────────────────────────────────────────

export interface PeriodCashflowTotals {
  /** Income and spending as positive magnitudes; net = income − expenses. */
  income: number;
  expenses: number;
  net: number;
  /** (income − expenses) / income, in percent; null without income — a rate needs a denominator. */
  savingsRate: number | null;
  /** income / expenses; null without spending or without income. The second number of the pair, kept on purpose. */
  coverageRatio: number | null;
  /** Transfers in the period: never a flow, still movements — the verdict must not deny them. */
  transferCount: number;
}

function isSpending(expense: Expense): boolean {
  return expense.type !== 'income' && expense.type !== 'transfer';
}

/** Totals of a list of rows, classified by type. Amount signs are ignored on purpose. */
export function summarizePeriodCashflow(expenses: Expense[]): PeriodCashflowTotals {
  let income = 0;
  let spending = 0;
  let transferCount = 0;
  for (const expense of expenses) {
    if (expense.type === 'transfer') {
      transferCount++;
    } else if (expense.type === 'income') {
      // A negative income row is a reversal of income, not spending.
      income += expense.amount;
    } else if (isSpending(expense)) {
      // Spending is a magnitude (the convention of calculateTotalExpenses): a positive
      // spending row never turns into income.
      spending += Math.abs(expense.amount);
    }
  }
  return {
    income,
    expenses: spending,
    net: income - spending,
    savingsRate: income > 0 ? ((income - spending) / income) * 100 : null,
    // A ratio with a zero numerator says nothing the "nessuna entrata" verdict has not.
    coverageRatio: spending > 0 && income > 0 ? income / spending : null,
    transferCount,
  };
}

function sliceBetween(expenses: Expense[], from: Date, to: Date): Expense[] {
  return expenses.filter((expense) => {
    const date = getExpenseDate(expense.date);
    return date >= from && date <= to;
  });
}

/**
 * The rows of the period, both ends inclusive — the calendar's bounds, nothing narrower.
 * «Il 2026» is January → December even in August: recurring series and instalments are
 * materialised as real future-dated rows, and the page shows them rather than hiding them.
 *
 * What is not spent yet is never passed off as spent: `summarizeScheduled` counts it and
 * every sentence built on these totals names it as a PART of them («Nel totale ci sono ancora
 * 1850 € di spese già in calendario»), while the list marks each such row. Two windows that must
 * NOT follow this rule and stay anchored to today: `previousPeriod` (a comparison needs two
 * comparable windows) and `resolveAnchorMonth` (the trailing savings history is history, not
 * the period).
 */
export function filterExpensesByPeriod(expenses: Expense[], period: Period): Expense[] {
  const range = periodToRange(period);
  return sliceBetween(expenses, range.from, range.to);
}

/**
 * A row the period counts but that has not happened yet — an instalment, a recurring occurrence.
 *
 * The comparison is by Italian calendar DAY, not by instant: a row dated today is never scheduled,
 * whatever hour it carries. See `isItalyDayAfter` for why an instant comparison marks a spesa
 * recorded an hour ago as «in calendario».
 */
export function isScheduledRow(expense: Expense, now: Date): boolean {
  return isItalyDayAfter(getExpenseDate(expense.date), now);
}

/** `isScheduledRow` with the right-hand side hoisted, for loops over many rows. */
function isScheduledAfterDay(expense: Expense, todayIso: string): boolean {
  return getItalyDateIso(getExpenseDate(expense.date)) > todayIso;
}

export interface ScheduledSlice {
  /** Rows dated after today, across every type. */
  count: number;
  /** Spending not yet spent, as a magnitude. */
  expenses: number;
  /** Income not yet received. */
  income: number;
  /** The last month the period still has ahead of it; null when nothing is scheduled. */
  throughMonth: number | null;
}

/**
 * The part of a period that has not happened yet. The totals above it include this; this is
 * the number that lets every sentence say so, instead of letting a forecast read as a fact.
 */
export function summarizeScheduled(expenses: Expense[], now: Date): ScheduledSlice {
  let count = 0;
  let spending = 0;
  let income = 0;
  let throughMonth: number | null = null;
  const todayIso = getItalyDateIso(now);
  for (const expense of expenses) {
    if (!isScheduledAfterDay(expense, todayIso)) continue;
    count++;
    if (expense.type === 'income') income += expense.amount;
    else if (isSpending(expense)) spending += Math.abs(expense.amount);
    const month = getItalyMonth(getExpenseDate(expense.date));
    if (throughMonth === null || month > throughMonth) throughMonth = month;
  }
  return { count, expenses: spending, income, throughMonth };
}

/**
 * Spending already booked up to `now` versus spending dated after it (instalments and
 * recurring rows of the rest of the month): the projection extrapolates only the former and
 * adds the latter as it is — a row due on the 27th is neither "spent" on the 22nd nor to be
 * scaled by 31/22.
 *
 * The split is by DAY, like `isScheduledRow`: today belongs to what is already booked, because
 * today is one of the days the pace divides by.
 */
export function splitSpendingAtDate(expenses: Expense[], now: Date): { spentToDate: number; scheduled: number } {
  let spentToDate = 0;
  let scheduled = 0;
  const todayIso = getItalyDateIso(now);
  for (const expense of expenses) {
    if (!isSpending(expense)) continue;
    if (isScheduledAfterDay(expense, todayIso)) scheduled += Math.abs(expense.amount);
    else spentToDate += Math.abs(expense.amount);
  }
  return { spentToDate, scheduled };
}

/** A year period that is still running — it reaches past today. */
export function isYearToDate(period: Period, now: Date): boolean {
  return period.kind === 'year' && period.year === getItalyMonthYear(now).year;
}

/**
 * The window of the CURRENT period that `previousPeriod` can honestly be compared with: the
 * period itself, except for a year still running, where it is January → the end of today's
 * month. The period's own totals span the whole year; a delta may not, because the previous
 * year has no months to match December against — twelve against eight is a rise by
 * construction, the mirror of the drop `previousPeriod` already refuses.
 *
 * Null exactly when `previousPeriod` is null: with no predecessor there is nothing to scope.
 */
export function currentComparisonWindow(period: Period, now: Date): Period | null {
  if (period.kind === 'custom') return null;
  // A ytd period already stops at today's month: it IS its own comparable window.
  if (period.kind === 'ytd') return period;
  if (period.kind === 'year' && isYearToDate(period, now)) {
    const anchor = resolveAnchorMonth(period, now);
    return { kind: 'custom', from: new Date(period.year, 0, 1), to: endOfMonthBound(period.year, anchor.month) };
  }
  return period;
}

/**
 * The period to compare against: the previous month; the previous year — but for a year still
 * running, the SAME months of the previous year (a full year against eight months reads as a
 * drop by construction). A custom range has no honest predecessor (a same-length window would
 * compare unlike months), so null.
 */
export function previousPeriod(period: Period, now: Date): Period | null {
  if (period.kind === 'month') {
    return period.month === 1
      ? { kind: 'month', year: period.year - 1, month: 12 }
      : { kind: 'month', year: period.year, month: period.month - 1 };
  }
  // Year-to-date against the SAME months a year earlier — same shape, so it keeps its name
  // and its range rule instead of degrading into an anonymous custom window.
  if (period.kind === 'ytd') return { kind: 'ytd', year: period.year - 1, throughMonth: period.throughMonth };
  if (period.kind === 'year') {
    if (!isYearToDate(period, now)) return { kind: 'year', year: period.year - 1 };
    const anchor = resolveAnchorMonth(period, now);
    return { kind: 'custom', from: new Date(period.year - 1, 0, 1), to: new Date(period.year - 1, anchor.month, 0) };
  }
  return null;
}

export interface PeriodDelta {
  /** Percent change against the previous period; null when the previous value is zero. */
  income: number | null;
  expenses: number | null;
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function computePeriodDelta(current: PeriodCashflowTotals, previous: PeriodCashflowTotals): PeriodDelta {
  return {
    income: percentChange(current.income, previous.income),
    expenses: percentChange(current.expenses, previous.expenses),
  };
}

// ─── Month windows ────────────────────────────────────────────────────────────

export interface MonthRef {
  year: number;
  month: number;
}

/**
 * The month every trailing window ends at: the selected month, the last month of the year
 * (today's month for the current year — the future is not data), or the month of a custom
 * range's last day.
 *
 * Deliberately still anchored to today for a running year, even though the period itself is
 * now the whole calendar year: this anchors the trailing SAVINGS HISTORY, which is history
 * and must not run into months that have not happened. The period's own chart uses
 * `resolveFlowWindow`, which does cover the whole year.
 */
export function resolveAnchorMonth(period: Period, now: Date): MonthRef {
  const today = getItalyMonthYear(now);
  if (period.kind === 'month') return { year: period.year, month: period.month };
  if (period.kind === 'ytd') return { year: period.year, month: period.throughMonth };
  if (period.kind === 'year') {
    return { year: period.year, month: period.year === today.year ? today.month : 12 };
  }
  return { year: getItalyYear(period.to), month: getItalyMonth(period.to) };
}

export interface FlowWindow {
  endYear: number;
  endMonth: number;
  count: number;
}

/**
 * The window of the income-vs-spending chart: the trailing months for a month or a custom
 * range, ALL TWELVE months for a year — the chart of a period must draw the period, and a
 * year is January → December whether or not it has finished. The months still ahead carry
 * only what is materialised (recurring rows, instalments) and are drawn as scheduled.
 */
export function resolveFlowWindow(period: Period, now: Date, trailing = 6): FlowWindow {
  if (period.kind === 'year') return { endYear: period.year, endMonth: 12, count: 12 };
  // January → the period's last month; a ytd window has no month ahead of today to mark.
  if (period.kind === 'ytd') return { endYear: period.year, endMonth: period.throughMonth, count: period.throughMonth };
  const anchor = resolveAnchorMonth(period, now);
  return { endYear: anchor.year, endMonth: anchor.month, count: trailing };
}

export interface MonthFlow extends MonthRef {
  /** "2026-08" — sortable, unique across years. */
  key: string;
  /** "Ago" — the axis label. */
  label: string;
  income: number;
  expenses: number;
  net: number;
  /** Percent; null when the month had no income. */
  savingsRate: number | null;
  /**
   * The month has not started yet: its bars hold only what is already in the calendar.
   * False for the month in progress — that one is partly real, and `highlightKey` marks it.
   */
  scheduled: boolean;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * A gap-free series of `count` months ending at (endYear, endMonth), oldest first. Rows
 * outside the window are ignored; an empty month is a zero bucket with a null rate.
 *
 * `now` marks the months that have not started; omit it and nothing is marked (a window
 * entirely in the past needs no mark).
 */
export function buildTrailingMonthFlows(expenses: Expense[], endYear: number, endMonth: number, count: number, now?: Date): MonthFlow[] {
  // Walk back from the anchor to build the axis, then reverse into chronological order.
  const axis: MonthRef[] = [];
  let year = endYear;
  let month = endMonth;
  for (let i = 0; i < count; i++) {
    axis.unshift({ year, month });
    month--;
    if (month < 1) {
      month = 12;
      year--;
    }
  }

  // A month is scheduled when it starts after today — the month in progress is partly real.
  const today = now ? getItalyMonthYear(now) : null;
  const startsAfterToday = (ref: MonthRef) =>
    today !== null && (ref.year > today.year || (ref.year === today.year && ref.month > today.month));

  const byKey = new Map<string, MonthFlow>();
  for (const ref of axis) {
    byKey.set(monthKey(ref.year, ref.month), {
      ...ref,
      key: monthKey(ref.year, ref.month),
      label: MONTH_NAMES_SHORT[ref.month - 1],
      income: 0,
      expenses: 0,
      net: 0,
      savingsRate: null,
      scheduled: startsAfterToday(ref),
    });
  }

  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;
    const date = toDate(expense.date);
    const bucket = byKey.get(monthKey(getItalyYear(date), getItalyMonth(date)));
    if (!bucket) continue;
    if (expense.type === 'income') bucket.income += expense.amount;
    else bucket.expenses += Math.abs(expense.amount);
  }

  for (const bucket of byKey.values()) {
    bucket.net = bucket.income - bucket.expenses;
    bucket.savingsRate = bucket.income > 0 ? (bucket.net / bucket.income) * 100 : null;
  }

  return axis.map((ref) => byKey.get(monthKey(ref.year, ref.month))!);
}

// ─── Savings history ──────────────────────────────────────────────────────────

export interface SavingsHistory {
  months: MonthFlow[];
  /** The month still running, if the window ends on it — drawn, never ranked. */
  ongoing: MonthFlow | null;
  /** The months that can be judged: the window minus the running one. */
  closedCount: number;
  /** Mean rate over the measured months (closed months with income); null when none. */
  average: number | null;
  best: MonthFlow | null;
  worst: MonthFlow | null;
  /** Measured months whose rate is negative, in chronological order. */
  deficitMonths: MonthFlow[];
  measuredCount: number;
}

/**
 * Average, best, worst and deficits over the CLOSED months with income. A month still running
 * (the salary is in, most of the spending is not) would be the best by construction, so it is
 * excluded from every ranking — its rate is the hero tile's job — but stays in `months` for
 * the chart.
 */
export function summarizeSavingsHistory(months: MonthFlow[], now: Date): SavingsHistory {
  const today = getItalyMonthYear(now);
  const ongoing = months.find((m) => m.year === today.year && m.month === today.month) ?? null;
  const closed = months.filter((m) => m !== ongoing);
  const measured = closed.filter((m) => m.savingsRate !== null);
  if (measured.length === 0) {
    return { months, ongoing, closedCount: closed.length, average: null, best: null, worst: null, deficitMonths: [], measuredCount: 0 };
  }
  const rate = (m: MonthFlow) => m.savingsRate as number;
  const average = measured.reduce((sum, m) => sum + rate(m), 0) / measured.length;
  const best = measured.reduce((top, m) => (rate(m) > rate(top) ? m : top), measured[0]);
  const worst = measured.reduce((bottom, m) => (rate(m) < rate(bottom) ? m : bottom), measured[0]);
  return {
    months,
    ongoing,
    closedCount: closed.length,
    average,
    best,
    worst,
    deficitMonths: measured.filter((m) => rate(m) < 0),
    measuredCount: measured.length,
  };
}

// ─── Category ranking ─────────────────────────────────────────────────────────

/** Shaped like the overview payload's category rows, so `CategoryTile` renders both. */
export interface RankedCategory {
  category: string;
  categoryKey: string;
  amount: number;
  /** Share of the kind's total, 0-100. */
  percentage: number;
}

export interface CategoryRanking {
  rows: RankedCategory[];
  total: number;
  /** What the capped rows leave out; null when every category is shown. */
  remainder: { amount: number; percentage: number } | null;
}

/**
 * The period's top categories of one kind — spending (fixed, variable, debt) or income —
 * keyed by category id (the grouping rule), labels qualified only where two keys share a
 * name, capped at `limit` and closed by the residual so the list adds up to its total. A
 * category whose net amount is negative (a reversed salary, a refund larger than the
 * purchases) is not a share of anything: it leaves the ranking, and the shares are measured
 * over the positive categories, so no row can read «il 120%».
 */
export function rankCategories(expenses: Expense[], kind: 'expenses' | 'income', limit = 5): CategoryRanking {
  const selected = expenses.filter((e) => (kind === 'income' ? e.type === 'income' : isSpending(e)));
  const byKey = new Map<string, { name: string; qualifier: string; amount: number }>();
  let total = 0;
  for (const expense of selected) {
    const key = getCategoryKey(expense);
    const entry = byKey.get(key) ?? { name: getCategoryName(expense), qualifier: EXPENSE_TYPE_LABELS[expense.type], amount: 0 };
    const amount = kind === 'income' ? expense.amount : Math.abs(expense.amount);
    entry.amount += amount;
    total += amount;
    byKey.set(key, entry);
  }
  const ranked = Array.from(byKey.entries())
    .filter(([, entry]) => entry.amount > 0)
    .sort((a, b) => b[1].amount - a[1].amount);
  total = ranked.reduce((sum, [, entry]) => sum + entry.amount, 0);
  if (total <= 0) return { rows: [], total: 0, remainder: null };

  const top = ranked.slice(0, limit);
  const labels = resolveDisplayLabels(top.map(([key, entry]) => ({ key, name: entry.name, qualifier: entry.qualifier })));
  const rows = top.map(([key, entry]) => ({
    category: labels.get(key) ?? entry.name,
    categoryKey: key,
    amount: entry.amount,
    percentage: (entry.amount / total) * 100,
  }));
  const shown = rows.reduce((sum, row) => sum + row.amount, 0);
  const remainderAmount = total - shown;
  return {
    rows,
    total,
    remainder: ranked.length > limit && remainderAmount > 0 ? { amount: remainderAmount, percentage: (remainderAmount / total) * 100 } : null,
  };
}

// ─── Movements ────────────────────────────────────────────────────────────────

export interface MovementsSummary {
  count: number;
  expenseCount: number;
  incomeCount: number;
  transferCount: number;
  /** The row with the largest absolute amount, labelled like the feed (note, else category). */
  largest: { label: string; amount: number; type: ExpenseType } | null;
  /**
   * The subset dated after today — listed, not yet happened. Counted across every type
   * (a scheduled income is as unspent as a scheduled instalment); the total is a magnitude,
   * so it never mixes signs. Zero when the period is entirely in the past.
   */
  scheduled: { count: number; total: number };
}

/**
 * The inventory of a list of rows. `now` splits it into what has happened and what is only
 * in the calendar: the register lists both, and the reading must not let them read as one.
 */
export function summarizeMovements(expenses: Expense[], now: Date): MovementsSummary {
  let expenseCount = 0;
  let incomeCount = 0;
  let transferCount = 0;
  let scheduledCount = 0;
  let scheduledTotal = 0;
  let largest: Expense | null = null;
  const todayIso = getItalyDateIso(now);
  for (const expense of expenses) {
    if (expense.type === 'income') incomeCount++;
    else if (expense.type === 'transfer') transferCount++;
    else expenseCount++;
    if (isScheduledAfterDay(expense, todayIso)) {
      scheduledCount++;
      scheduledTotal += Math.abs(expense.amount);
    }
    if (!largest || Math.abs(expense.amount) > Math.abs(largest.amount)) largest = expense;
  }
  return {
    count: expenses.length,
    expenseCount,
    incomeCount,
    transferCount,
    largest: largest
      ? { label: largest.notes?.trim() || largest.categoryName, amount: Math.abs(largest.amount), type: largest.type }
      : null,
    scheduled: { count: scheduledCount, total: scheduledTotal },
  };
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface PeriodCalendar {
  dayOfMonth: number;
  daysInMonth: number;
}

/**
 * The day and the length of the month, for the month-end spending projection — only when
 * the period IS the current Italian month: a closed month has nothing left to project.
 */
export function resolvePeriodCalendar(period: Period, now: Date): PeriodCalendar | null {
  if (period.kind !== 'month') return null;
  const today = getItalyMonthYear(now);
  if (period.year !== today.year || period.month !== today.month) return null;
  return {
    dayOfMonth: getItalyDate(now).getDate(),
    daysInMonth: new Date(period.year, period.month, 0).getDate(),
  };
}
