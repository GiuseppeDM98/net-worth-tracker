/**
 * Every number of Cashflow › Centri di Costo (the list and the detail), free of React and
 * Firestore. The page has NO period axis: a center's cost is its whole cost, so every figure
 * here is lifetime unless it says otherwise — and the ones that use another window carry it
 * in their name (`ytd`, `lastYear`, `trailing…`, the budget's own `period`, `yearProjection`).
 *
 * Two rules this module shares with the rest of the app rather than re-deriving:
 * - the projection is the app's ONE rule (`projectWindowEndWithScheduled`: the pace on what
 *   is booked up to today plus the rows already dated after today), on the month and on the
 *   year alike; the blended year model that weighed last year in is gone;
 * - a monthly ceiling is read exactly like the Budget page's (`summarizeCeiling`), today's
 *   mark on the track included, so a center's tetto and the overall tetto never disagree.
 *
 * "Booked" means dated up to `now`: a row dated after today (an instalment, a recurring
 * charge) is never counted as spent — it lives in `scheduled` and in the projections.
 *
 * SIGN CONVENTION: callers pass the center's outgoing rows (amount < 0); every figure returned
 * here is a positive cost.
 */

import type { Expense } from '@/types/expenses';
import type { CostCenter, CostCenterBudgetPeriod, CostCenterLifecycle, CostCenterRecurringSplit } from '@/types/costCenters';
import { getLifecycleStatus, resolveLastActivityDate, splitRecurringVsOneOff } from '@/lib/utils/costCenterUtils';
import { summarizeCeiling } from '@/lib/utils/budgetSummary';
import { projectWindowEndWithScheduled } from '@/lib/utils/spendingProjection';
import { resolveBudgetCalendar } from '@/lib/utils/budgetUtils';
import { getItalyDate, getItalyMonth, getItalyYear, isItalyDayAfter, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';

// ─── Calendar ─────────────────────────────────────────────────────────────────

/**
 * Below this many elapsed days of the year a yearly pace is one purchase extrapolated over
 * twelve months; the projection waits, like the month's waits for its fourth day.
 */
export const MIN_YEAR_FORECAST_DAYS = 28;

export interface YearCalendar {
  dayOfYear: number;
  daysInYear: number;
  daysLeft: number;
  canForecast: boolean;
}

function daysInYearOf(year: number): number {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 366 : 365;
}

/**
 * Day of year in Italy time, computed from the calendar fields in UTC so the DST hour never
 * shortens a day (an expense stamped at local midnight came out a day short otherwise).
 */
function dayOfYearOf(date: Date): number {
  const italy = getItalyDate(date);
  const start = Date.UTC(italy.getFullYear(), 0, 0);
  const current = Date.UTC(italy.getFullYear(), italy.getMonth(), italy.getDate());
  return Math.round((current - start) / 86_400_000);
}

/** The year as the projection reads it: day, length, days left, whether a pace is a pace yet. */
export function resolveYearCalendar(now: Date): YearCalendar {
  const daysInYear = daysInYearOf(getItalyYear(now));
  const dayOfYear = Math.min(dayOfYearOf(now), daysInYear);
  return { dayOfYear, daysInYear, daysLeft: Math.max(0, daysInYear - dayOfYear), canForecast: dayOfYear >= MIN_YEAR_FORECAST_DAYS };
}

// ─── Row helpers ──────────────────────────────────────────────────────────────

const cost = (expense: Expense) => Math.abs(expense.amount);
/**
 * A row already happened, by Italian calendar DAY — the same boundary Tracciamento's
 * `isScheduledRow` uses, so a spesa recorded today is booked here too whatever hour it carries.
 */
const isBooked = (expense: Expense, now: Date) => !isItalyDayAfter(toDate(expense.date), now);
const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

function sum(rows: Expense[]): number {
  return rows.reduce((total, row) => total + cost(row), 0);
}

/** Whole calendar months from the month of `from` to the month of `to`, both included. */
function monthsBetween(from: Date, to: Date): number {
  return (getItalyYear(to) - getItalyYear(from)) * 12 + (getItalyMonth(to) - getItalyMonth(from)) + 1;
}

function wholeDaysBetween(from: Date, to: Date): number {
  const a = getItalyDate(from);
  const b = getItalyDate(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}

// ─── The budget ───────────────────────────────────────────────────────────────

export interface CenterBudgetSummary {
  period: CostCenterBudgetPeriod;
  amount: number;
  /** What is used on the window, the rows already in the calendar included («impegnato»). */
  spent: number;
  spentToDate: number;
  scheduled: number;
  /** spent / amount, 0-100 (can exceed 100). */
  usedPct: number;
  /** Today on the window (day / days in month, or day / days in year), 0-100. */
  calendarPct: number;
  /** Window-end total at the app's projection rule; null before the window has a pace. */
  projection: number | null;
  exceeded: boolean;
  /** Not over yet, but the projection lands past the ceiling (The Risk-vs-Fact Rule). */
  atRisk: boolean;
  overBy: number;
  remaining: number;
  daysLeft: number;
  /** Monthly only: the day the running total went (or, with a scheduled row, will go) past the ceiling. */
  crossedOn: number | null;
  /** Monthly only: the day the pace crosses a ceiling still holding. */
  projectedCrossingDay: number | null;
  status: 'ok' | 'warning' | 'over';
}

function budgetStatus(usedPct: number): CenterBudgetSummary['status'] {
  return usedPct > 100 ? 'over' : usedPct >= 90 ? 'warning' : 'ok';
}

function summarizeMonthlyBudget(amount: number, expenses: Expense[], now: Date): CenterBudgetSummary | null {
  const ceiling = summarizeCeiling(amount, expenses, now);
  if (!ceiling) return null;
  const projection = ceiling.projection;
  return {
    period: 'monthly',
    amount,
    spent: ceiling.spent,
    spentToDate: ceiling.spentToDate,
    scheduled: ceiling.scheduled,
    usedPct: ceiling.usedPct,
    calendarPct: ceiling.calendarPct,
    projection,
    exceeded: ceiling.exceeded,
    atRisk: !ceiling.exceeded && projection !== null && Math.round(projection) > amount,
    overBy: ceiling.overBy,
    remaining: ceiling.remaining,
    daysLeft: ceiling.calendar.daysLeft,
    crossedOn: ceiling.crossedOn,
    projectedCrossingDay: ceiling.projectedCrossingDay,
    status: budgetStatus(ceiling.usedPct),
  };
}

interface YearSplit {
  spentToDate: number;
  scheduled: number;
}

/** This year's rows split at today (see splitMonthlyTotalExpenses for the month). */
function splitYearSpending(expenses: Expense[], now: Date): YearSplit {
  const year = getItalyYear(now);
  let spentToDate = 0;
  let scheduled = 0;
  for (const expense of expenses) {
    if (getItalyYear(toDate(expense.date)) !== year) continue;
    if (isBooked(expense, now)) spentToDate += cost(expense);
    else scheduled += cost(expense);
  }
  return { spentToDate, scheduled };
}

function summarizeAnnualBudget(amount: number, split: YearSplit, calendar: YearCalendar, canProject: boolean): CenterBudgetSummary {
  const spent = split.spentToDate + split.scheduled;
  const usedPct = (spent / amount) * 100;
  const exceeded = spent > amount;
  const projection = canProject && calendar.canForecast ? projectWindowEndWithScheduled(split.spentToDate, split.scheduled, calendar.dayOfYear, calendar.daysInYear) : null;
  return {
    period: 'annual',
    amount,
    spent,
    spentToDate: split.spentToDate,
    scheduled: split.scheduled,
    usedPct,
    calendarPct: (calendar.dayOfYear / calendar.daysInYear) * 100,
    projection,
    exceeded,
    atRisk: !exceeded && projection !== null && Math.round(projection) > amount,
    overBy: Math.max(0, spent - amount),
    remaining: Math.max(0, amount - spent),
    daysLeft: calendar.daysLeft,
    crossedOn: null,
    projectedCrossingDay: null,
    status: budgetStatus(usedPct),
  };
}

// ─── One center ───────────────────────────────────────────────────────────────

export interface CenterSummary {
  center: CostCenter;
  /** The center's outgoing rows as given, for the bars and the movements list. */
  expenses: Expense[];
  /** Everything booked up to today — the center's cost. */
  total: number;
  count: number;
  /** Rows dated after today: in the calendar, not spent. */
  scheduled: { total: number; count: number };
  firstDate: Date | null;
  /** Most recent booked row, unscoped — what dormancy is measured on. */
  lastDate: Date | null;
  /** Whole days since `lastDate`; null when never used. */
  idleDays: number | null;
  /** Calendar months from the first expense's month to today's, both included (≥ 1 once used). */
  monthsSpan: number;
  monthsWithSpending: number;
  /** total / monthsSpan — a sporadic project reads as the low monthly cost it is. */
  averageMonthly: number;
  ytd: number;
  /** ytd / total, 0-100. */
  ytdPct: number;
  lastYear: number;
  /** Year-end cost at the app rule; null when dormant/archived, before the threshold, or with nothing booked this year. */
  yearProjection: number | null;
  /** Month-end cost at the same rule; null under the same conditions on the month. */
  monthProjection: number | null;
  /** Booked in the running month up to today. */
  monthSpentToDate: number;
  budget: CenterBudgetSummary | null;
  lifecycle: CostCenterLifecycle;
  recurring: CostCenterRecurringSplit;
}

export function summarizeCenter(center: CostCenter, expenses: Expense[], now: Date): CenterSummary {
  const booked = expenses.filter((row) => isBooked(row, now));
  const scheduledRows = expenses.filter((row) => !isBooked(row, now));
  const total = sum(booked);
  const firstDate = booked.length > 0 ? booked.map((row) => toDate(row.date)).reduce((min, date) => (date < min ? date : min)) : null;
  const lastDate = resolveLastActivityDate(booked);
  const lifecycle = getLifecycleStatus(center, lastDate, now);
  const monthsSpan = firstDate ? Math.max(1, monthsBetween(firstDate, now)) : 0;
  const monthsWithSpending = new Set(booked.map((row) => monthKey(getItalyYear(toDate(row.date)), getItalyMonth(toDate(row.date))))).size;

  const year = getItalyYear(now);
  const yearSplit = splitYearSpending(expenses, now);
  const lastYear = sum(booked.filter((row) => getItalyYear(toDate(row.date)) === year - 1));
  const yearCalendar = resolveYearCalendar(now);
  // A pace belongs to a center that is alive: a dormant or archived one gets no projection.
  const canProject = lifecycle === 'active';
  const yearProjection =
    canProject && yearCalendar.canForecast && yearSplit.spentToDate > 0
      ? projectWindowEndWithScheduled(yearSplit.spentToDate, yearSplit.scheduled, yearCalendar.dayOfYear, yearCalendar.daysInYear)
      : null;

  const monthCalendar = resolveBudgetCalendar(now);
  const month = getItalyMonth(now);
  const monthRows = expenses.filter((row) => getItalyYear(toDate(row.date)) === year && getItalyMonth(toDate(row.date)) === month);
  const monthSplit = { spentToDate: sum(monthRows.filter((row) => isBooked(row, now))), scheduled: sum(monthRows.filter((row) => !isBooked(row, now))) };
  const monthProjection =
    canProject && monthCalendar.canForecast && monthSplit.spentToDate > 0
      ? projectWindowEndWithScheduled(monthSplit.spentToDate, monthSplit.scheduled, monthCalendar.dayOfMonth, monthCalendar.daysInMonth)
      : null;

  const budget = resolveBudget(center, expenses, now, yearSplit, yearCalendar, canProject);

  return {
    center,
    expenses,
    total,
    count: booked.length,
    scheduled: { total: sum(scheduledRows), count: scheduledRows.length },
    firstDate,
    lastDate,
    idleDays: lastDate ? Math.max(0, wholeDaysBetween(lastDate, now)) : null,
    monthsSpan,
    monthsWithSpending,
    averageMonthly: monthsSpan > 0 ? total / monthsSpan : 0,
    ytd: yearSplit.spentToDate,
    ytdPct: total > 0 ? (yearSplit.spentToDate / total) * 100 : 0,
    lastYear,
    yearProjection,
    monthProjection,
    monthSpentToDate: monthSplit.spentToDate,
    budget,
    lifecycle,
    recurring: splitRecurringVsOneOff(booked),
  };
}

function resolveBudget(
  center: CostCenter,
  expenses: Expense[],
  now: Date,
  yearSplit: YearSplit,
  yearCalendar: YearCalendar,
  canProject: boolean,
): CenterBudgetSummary | null {
  const { budgetAmount, budgetPeriod } = center;
  if (!budgetAmount || budgetAmount <= 0 || !budgetPeriod) return null;
  if (budgetPeriod === 'monthly') {
    const monthly = summarizeMonthlyBudget(budgetAmount, expenses, now);
    // A dormant center has no pace, so its projection says nothing — and nothing is «a rischio».
    return monthly && !canProject ? { ...monthly, projection: null, atRisk: false, projectedCrossingDay: null } : monthly;
  }
  return summarizeAnnualBudget(budgetAmount, yearSplit, yearCalendar, canProject);
}

// ─── The list ─────────────────────────────────────────────────────────────────

export interface CenterRankedRow {
  summary: CenterSummary;
  /** total / active total, 0-100. */
  share: number;
  /** total / largest active total, 0-100 — the bar. */
  rank: number;
}

export interface CostCentersSummary {
  /** Ranked by lifetime cost, largest first. */
  active: CenterRankedRow[];
  archived: CenterRankedRow[];
  /** The active centers' cost and movements. */
  total: number;
  count: number;
  firstDate: Date | null;
  ytd: number;
  lastYear: number;
  /** The trailing twelve months, today's included. */
  trailingTotal: number;
  trailingAverage: number;
  archivedTotal: number;
  /** Active centers idle past the threshold or never used, longest idle first, never-used last. */
  dormant: CenterSummary[];
  /** Active centers whose ceiling is already over. */
  over: CenterSummary[];
  /** Active centers whose projection lands past a ceiling still holding. */
  atRisk: CenterSummary[];
  /** Active centers with a ceiling. */
  withBudget: number;
}

function rankRows(summaries: CenterSummary[]): CenterRankedRow[] {
  const sorted = [...summaries].sort((a, b) => b.total - a.total);
  const total = sorted.reduce((acc, row) => acc + row.total, 0);
  const max = sorted[0]?.total ?? 0;
  return sorted.map((summary) => ({
    summary,
    share: total > 0 ? (summary.total / total) * 100 : 0,
    rank: max > 0 ? (summary.total / max) * 100 : 0,
  }));
}

/** Rows booked in the trailing `count` months (today's month included), summed. */
function trailingMonthsTotal(expenses: Expense[], now: Date, count: number): number {
  const keys = new Set(trailingMonthRefs(now, count).map((ref) => ref.key));
  return sum(expenses.filter((row) => isBooked(row, now) && keys.has(monthKey(getItalyYear(toDate(row.date)), getItalyMonth(toDate(row.date))))));
}

export function summarizeCostCenters(rows: ReadonlyArray<{ center: CostCenter; expenses: Expense[] }>, now: Date): CostCentersSummary {
  const summaries = rows.map((row) => summarizeCenter(row.center, row.expenses, now));
  const activeSummaries = summaries.filter((summary) => summary.lifecycle !== 'archived');
  const active = rankRows(activeSummaries);
  const archived = rankRows(summaries.filter((summary) => summary.lifecycle === 'archived'));
  const activeExpenses = rows.filter((row) => !row.center.archivedAt).flatMap((row) => row.expenses);
  const firstDates = activeSummaries.map((summary) => summary.firstDate).filter((date): date is Date => date !== null);
  const trailingTotal = trailingMonthsTotal(activeExpenses, now, 12);

  const dormant = activeSummaries
    .filter((summary) => summary.lifecycle === 'dormant')
    .sort((a, b) => (b.idleDays ?? -1) - (a.idleDays ?? -1));

  return {
    active,
    archived,
    total: activeSummaries.reduce((acc, summary) => acc + summary.total, 0),
    count: activeSummaries.reduce((acc, summary) => acc + summary.count, 0),
    firstDate: firstDates.length > 0 ? firstDates.reduce((min, date) => (date < min ? date : min)) : null,
    ytd: activeSummaries.reduce((acc, summary) => acc + summary.ytd, 0),
    lastYear: activeSummaries.reduce((acc, summary) => acc + summary.lastYear, 0),
    trailingTotal,
    trailingAverage: trailingTotal / 12,
    archivedTotal: archived.reduce((acc, row) => acc + row.summary.total, 0),
    dormant,
    over: active.map((row) => row.summary).filter((summary) => summary.budget?.exceeded),
    atRisk: active.map((row) => row.summary).filter((summary) => summary.budget?.atRisk),
    withBudget: activeSummaries.filter((summary) => summary.budget !== null).length,
  };
}

// ─── The bars ─────────────────────────────────────────────────────────────────

export interface MonthRef {
  key: string;
  year: number;
  month: number;
  /** «Set», «Ott» — the axis label. */
  label: string;
  ongoing: boolean;
}

/** The trailing `count` months ending on today's, oldest first. */
export function trailingMonthRefs(now: Date, count: number): MonthRef[] {
  const year = getItalyYear(now);
  const month = getItalyMonth(now);
  const refs: MonthRef[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const zeroBased = month - 1 - offset;
    const y = year + Math.floor(zeroBased / 12);
    const m = ((zeroBased % 12) + 12) % 12 + 1;
    refs.push({ key: monthKey(y, m), year: y, month: m, label: MONTH_NAMES_SHORT[m - 1], ongoing: offset === 0 });
  }
  return refs;
}

export interface CenterStackMonth extends MonthRef {
  total: number;
  byCenter: Record<string, number>;
}

export interface CenterStackSeries {
  id: string;
  name: string;
  /** The persisted colour value (a slot key or a legacy hex), resolved by the component. */
  color: string | undefined;
}

export interface CenterMonthStack {
  months: CenterStackMonth[];
  /** The centers with spending in the window, in the list's rank order. */
  centers: CenterStackSeries[];
}

/**
 * The trailing months stacked by center — the hero's bars. Only what is booked counts (the
 * running month shows its spending to date, not its instalments), and a center without a
 * euro in the window is not a series: a legend swatch for an empty band would be a lie.
 */
export function buildCenterMonthStack(rows: ReadonlyArray<CenterRankedRow>, now: Date, count: number): CenterMonthStack {
  const refs = trailingMonthRefs(now, count);
  const months: CenterStackMonth[] = refs.map((ref) => ({ ...ref, total: 0, byCenter: {} }));
  const byKey = new Map(months.map((month) => [month.key, month]));
  const spent = new Map<string, number>();

  for (const row of rows) {
    const id = row.summary.center.id;
    for (const month of months) month.byCenter[id] = 0;
    for (const expense of row.summary.expenses) {
      if (!isBooked(expense, now)) continue;
      const date = toDate(expense.date);
      const month = byKey.get(monthKey(getItalyYear(date), getItalyMonth(date)));
      if (!month) continue;
      const amount = cost(expense);
      month.byCenter[id] += amount;
      month.total += amount;
      spent.set(id, (spent.get(id) ?? 0) + amount);
    }
  }

  const centers = rows
    .filter((row) => (spent.get(row.summary.center.id) ?? 0) > 0)
    .map((row) => ({ id: row.summary.center.id, name: row.summary.center.name, color: row.summary.center.color }));
  // Drop the series of the centers that have nothing in the window, so the stack only carries
  // the bands the legend names.
  const kept = new Set(centers.map((center) => center.id));
  for (const month of months) {
    for (const id of Object.keys(month.byCenter)) if (!kept.has(id)) delete month.byCenter[id];
  }
  return { months, centers };
}
