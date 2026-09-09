/**
 * Every number Cashflow › Budget prints, born here and nowhere else: the ceiling's standing
 * against the calendar, the income targets beside it, the annual budgets on their own axis
 * (year-to-date — a different horizon, named as such), the per-category rows, the trailing
 * months of total spending and the split of the alerts between «soglie superate» and
 * «sforamenti previsti». Pure and SDK-free; the projection rule is budgetUtils' (which is
 * the app's, spendingProjection.ts), so this module never extrapolates on its own.
 */

import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { BudgetAlert, BudgetHistoryRecord, BudgetItem, BudgetKind, BudgetPace } from '@/types/budget';
import {
  buildSpendingForecast,
  budgetItemKey,
  budgetItemLabel,
  collectMonthSpending,
  findCrossingDay,
  forecastMonthlyItem,
  projectCrossingDay,
  getActualForItem,
  getMonthlyTotalExpenses,
  getPeriodActual,
  resolveBudgetCalendar,
  resolveItemPace,
  sectionWeight,
  splitMonthlyTotalExpenses,
  type BudgetCalendar,
} from '@/lib/utils/budgetUtils';
import { getItalyDate, getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { resolveMonthCeilings, type MonthCeiling } from '@/lib/utils/budgetHistory';

// ─── The ceiling ──────────────────────────────────────────────────────────────

export interface CeilingSummary {
  ceiling: number;
  /** Everything booked in the month, scheduled rows included — what «usato» reads. */
  spent: number;
  spentToDate: number;
  scheduled: number;
  /** spent / ceiling, 0-100 (can exceed 100). */
  usedPct: number;
  /** dayOfMonth / daysInMonth, 0-100 — where the calendar stands today. */
  calendarPct: number;
  calendar: BudgetCalendar;
  /** Month-end total at the current pace; null in the first days of the month. */
  projection: number | null;
  /** max(0, ceiling − spent). */
  remaining: number;
  /** The remaining spread over the days left; null once the month has no day left. */
  dailyAllowance: number | null;
  exceeded: boolean;
  /** max(0, spent − ceiling). */
  overBy: number;
  /** Day of the month the running total went past the ceiling (scheduled rows included — a day after today reads «supererai»); null while under. */
  crossedOn: number | null;
  /** Day the pace crosses a ceiling still holding, before the month ends; null when it holds, is already over, or there is no pace yet. */
  projectedCrossingDay: number | null;
  /** What is actually spent per day so far (spentToDate / dayOfMonth). */
  dailyPace: number;
  /** What the ceiling allows per day over the whole month (ceiling / daysInMonth). */
  sustainablePace: number;
}

/**
 * The overall ceiling against ALL of the month's spending (never only the budgeted
 * categories), read against the calendar. Null without a ceiling: the tile has nothing to
 * measure against, and a tile with nothing to say is not rendered.
 */
export function summarizeCeiling(ceiling: number | undefined, expenses: Expense[], now: Date): CeilingSummary | null {
  if (!ceiling || ceiling <= 0) return null;
  const calendar = resolveBudgetCalendar(now);
  const split = splitMonthlyTotalExpenses(expenses, getItalyYear(now), getItalyMonth(now), now);
  const forecast = buildSpendingForecast(split, ceiling, now);
  const remaining = Math.max(0, ceiling - forecast.spentSoFar);
  const year = getItalyYear(now);
  const month = getItalyMonth(now);
  const rows = collectMonthSpending(expenses, year, month);
  const exceeded = forecast.spentSoFar > ceiling;
  const scheduledRows = rows.filter((row) => row.day > calendar.dayOfMonth);
  return {
    ceiling,
    spent: forecast.spentSoFar,
    spentToDate: split.spentToDate,
    scheduled: split.scheduled,
    usedPct: (forecast.spentSoFar / ceiling) * 100,
    calendarPct: (calendar.dayOfMonth / calendar.daysInMonth) * 100,
    calendar,
    projection: calendar.canForecast ? forecast.projectedTotal : null,
    remaining,
    dailyAllowance: calendar.daysLeft > 0 ? forecast.dailyAllowance : null,
    exceeded,
    overBy: Math.max(0, forecast.spentSoFar - ceiling),
    crossedOn: exceeded ? findCrossingDay(rows, ceiling) : null,
    projectedCrossingDay: exceeded ? null : projectCrossingDay(split.spentToDate, scheduledRows, ceiling, calendar),
    dailyPace: calendar.dayOfMonth > 0 ? split.spentToDate / calendar.dayOfMonth : 0,
    sustainablePace: ceiling / calendar.daysInMonth,
  };
}

// ─── Income targets ───────────────────────────────────────────────────────────

export interface IncomeTargetSummary {
  /** Sum of the monthly income targets. */
  expected: number;
  /** The income those targets matched this month — untargeted income stays out. */
  registered: number;
  count: number;
}

/** The month's income targets against what they matched; null without monthly targets. */
export function summarizeIncomeTargets(items: BudgetItem[], expenses: Expense[], now: Date): IncomeTargetSummary | null {
  const targets = items.filter((item) => item.kind === 'income' && item.period === 'monthly' && item.amount > 0);
  if (targets.length === 0) return null;
  let expected = 0;
  let registered = 0;
  for (const target of targets) {
    expected += target.amount;
    registered += getPeriodActual(target, expenses, now);
  }
  return { expected, registered, count: targets.length };
}

// ─── Annual budgets ───────────────────────────────────────────────────────────

export interface AnnualBudgetRow {
  item: BudgetItem;
  key: string;
  label: string;
  budget: number;
  /** Year-to-date. */
  spent: number;
  usedPct: number;
  remaining: number;
  /** Used share above the year's elapsed share. */
  ahead: boolean;
  exceeded: boolean;
}

export interface AnnualBudgetSummary {
  rows: AnnualBudgetRow[];
  year: number;
  /** Day of year / days in year, 0-100. */
  yearElapsedPct: number;
  /** Calendar months after the current one. */
  monthsLeft: number;
  aheadCount: number;
}

function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

/** Day of year from calendar fields, so DST never shifts it (AGENTS.md § Commands, `TZ=Europe/Rome`). */
function dayOfYear(date: Date): number {
  return Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86_400_000);
}

/**
 * The annual spending budgets on their own axis: year-to-date against the year elapsed.
 * Income targets are out (annual income is not a spending budget), monthly items are the
 * other tiles'. Order follows the user's, like the category rows.
 */
export function summarizeAnnualBudgets(items: BudgetItem[], expenses: Expense[], now: Date): AnnualBudgetSummary {
  const italy = getItalyDate(now);
  const year = italy.getFullYear();
  const yearElapsedPct = (dayOfYear(italy) / daysInYear(year)) * 100;
  const rows = items
    .filter((item) => item.kind === 'expense' && item.period === 'annual' && item.amount > 0)
    .sort((a, b) => a.order - b.order)
    .map((item): AnnualBudgetRow => {
      const spent = getActualForItem(item, expenses, year);
      const usedPct = (spent / item.amount) * 100;
      return {
        item,
        key: budgetItemKey(item),
        label: budgetItemLabel(item),
        budget: item.amount,
        spent,
        usedPct,
        remaining: Math.max(0, item.amount - spent),
        ahead: usedPct > yearElapsedPct,
        exceeded: spent > item.amount,
      };
    });
  return {
    rows,
    year,
    yearElapsedPct,
    monthsLeft: 12 - (italy.getMonth() + 1),
    aheadCount: rows.filter((row) => row.ahead).length,
  };
}

// ─── Per-category rows ────────────────────────────────────────────────────────

export interface CategoryBudgetRow {
  item: BudgetItem;
  key: string;
  label: string;
  kind: BudgetKind;
  budget: number;
  /** Everything booked in the month. */
  spent: number;
  usedPct: number;
  /** Month-end figure; null for an income target, with nothing spent, or before the 4th. */
  projection: number | null;
  pace: BudgetPace;
}

export interface CategoryBudgetRows {
  /** Monthly spending budgets, fixed → variable → debt, then the user's order. */
  expense: CategoryBudgetRow[];
  /** Monthly income targets. */
  income: CategoryBudgetRow[];
}

/**
 * The monthly rows of «Per categoria» — every scope, subcategory slices included, because
 * the list is the inventory of what the user set. Annual items belong to their own tile.
 */
export function buildCategoryRows(items: BudgetItem[], categories: ExpenseCategory[], expenses: Expense[], now: Date): CategoryBudgetRows {
  const { canForecast } = resolveBudgetCalendar(now);
  const monthly = items
    .filter((item) => item.period === 'monthly')
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'expense' ? -1 : 1;
      const section = sectionWeight(a, categories) - sectionWeight(b, categories);
      return section !== 0 ? section : a.order - b.order;
    })
    .map((item): CategoryBudgetRow => {
      const forecast = forecastMonthlyItem(item, expenses, now, categories);
      const isIncome = item.kind === 'income';
      return {
        item,
        key: budgetItemKey(item),
        label: budgetItemLabel(item),
        kind: item.kind,
        budget: item.amount,
        spent: forecast.spentSoFar,
        usedPct: item.amount > 0 ? (forecast.spentSoFar / item.amount) * 100 : 0,
        projection: !isIncome && canForecast && forecast.spentSoFar > 0 ? forecast.projectedTotal : null,
        pace: isIncome ? 'variable' : resolveItemPace(item, categories),
      };
    });
  return {
    expense: monthly.filter((row) => row.kind === 'expense'),
    income: monthly.filter((row) => row.kind === 'income'),
  };
}

// ─── Trailing months ──────────────────────────────────────────────────────────

export interface SpendingHistoryMonth {
  key: string;
  label: string;
  total: number;
  /** The running month: drawn, never ranked. */
  ongoing: boolean;
  /** The ceiling this month reads against — its own when recorded, today's otherwise; null with none. */
  ceiling: number | null;
  ceilingSource: MonthCeiling['source'];
}

export interface SpendingHistory {
  months: SpendingHistoryMonth[];
  /** Closed months in the window. */
  closedCount: number;
  /** Closed months whose total is over THEIR ceiling; null when no closed month has one. */
  overCount: number | null;
  /** Closed months that read against their own recorded ceiling. */
  recordedCount: number;
  /** Label of the first closed month with a record («Giu»); null when none has one. */
  recordedFrom: string | null;
  /** Average of the closed months; null when there is none. */
  average: number | null;
}

/** The 'YYYY-MM' keys of the trailing `count` months ending with the month of `now`, oldest first. */
export function trailingMonthKeys(now: Date, count = 6): string[] {
  const year = getItalyYear(now);
  const month = getItalyMonth(now);
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const index = (month - 1 - offset + 12 * count) % 12;
    const y = year + Math.floor((month - 1 - offset) / 12);
    keys.push(`${y}-${String(index + 1).padStart(2, '0')}`);
  }
  return keys;
}

/**
 * Total spending of the trailing `count` months, the running month last, each read against
 * ITS ceiling: the month's own recorded one when the cron captured it, today's otherwise
 * (`resolveMonthCeilings`) — and the source travels with the month so the caption can say
 * which. Without records every month reads against today's, as before the history existed.
 */
export function buildSpendingHistory(
  expenses: Expense[],
  now: Date,
  ceiling: number | null,
  count = 6,
  records: BudgetHistoryRecord[] = [],
): SpendingHistory {
  const keys = trailingMonthKeys(now, count);
  const runningKey = keys[keys.length - 1];
  const ceilings = resolveMonthCeilings(records, keys, runningKey, ceiling);
  const months: SpendingHistoryMonth[] = keys.map((key, i) => {
    const [y, m] = key.split('-').map(Number);
    const monthCeiling = ceilings.get(key) ?? { ceiling: null, source: 'current' as const };
    return {
      key,
      label: MONTH_NAMES_SHORT[m - 1],
      total: getMonthlyTotalExpenses(expenses, y, m),
      ongoing: i === keys.length - 1,
      ceiling: monthCeiling.ceiling,
      ceilingSource: monthCeiling.source,
    };
  });
  const closed = months.filter((m) => !m.ongoing);
  const withCeiling = closed.filter((m) => m.ceiling !== null);
  const recorded = closed.filter((m) => m.ceilingSource === 'recorded');
  return {
    months,
    closedCount: closed.length,
    overCount: withCeiling.length > 0 ? withCeiling.filter((m) => m.total > m.ceiling!).length : null,
    recordedCount: recorded.length,
    recordedFrom: recorded[0]?.label ?? null,
    average: closed.length > 0 ? closed.reduce((sum, m) => sum + m.total, 0) / closed.length : null,
  };
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export interface AlertsSummary {
  /** Alerts whose threshold was actually crossed on spend — the Avvisi tile's rows. */
  rows: BudgetAlert[];
  /** Forecast-only alerts: their place is «Categorie a rischio», the footer counts them. */
  forecastOnlyCount: number;
}

/** Splits the evaluator's alerts so that no row appears in two tiles. */
export function summarizeAlerts(alerts: BudgetAlert[]): AlertsSummary {
  return {
    rows: alerts.filter((alert) => alert.thresholdCrossed),
    forecastOnlyCount: alerts.filter((alert) => !alert.thresholdCrossed).length,
  };
}

