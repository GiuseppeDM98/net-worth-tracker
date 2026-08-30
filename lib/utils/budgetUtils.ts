// Budget Utility Functions
//
// Pure functions for computing budget actuals, comparisons, forecasts, categories at risk
// and alerts from the allExpenses array. No Firestore dependency — fully testable
// with Vitest, and reused both client-side (BudgetTab) and server-side (email).
//
// Amount sign convention (same as expenseService):
//   Expenses are stored as negative numbers, income as positive.
//   We take Math.abs() when returning totals so callers get positive values.

import { Expense, ExpenseCategory } from '@/types/expenses';
import {
  BudgetAlert,
  BudgetComparison,
  BudgetItem,
  BudgetPace,
  BudgetRiskSummary,
  DEFAULT_ALERT_THRESHOLDS,
  SpendingForecast,
  SpendingSplit,
} from '@/types/budget';
import { getItalyDate, getItalyDateIso, getItalyMonth, getItalyMonthYear, getItalyYear, toDate } from './dateHelpers';
import { projectMonthEndWithScheduled } from './spendingProjection';

// Section display order: fixed → variable → debt → income
const SECTION_ORDER: Record<string, number> = { fixed: 0, variable: 1, debt: 2, income: 3 };

// Stable key for the overall (whole-portfolio) spending budget.
export const OVERALL_BUDGET_KEY = '__overall__';

// ==================== Key Helpers ====================

/**
 * Stable composite key for a budget item used for deduplication and lookups.
 * Exported so both the component and reconcile can use the same key logic.
 */
export function budgetItemKey(item: Pick<BudgetItem, 'scope' | 'expenseType' | 'categoryId' | 'subCategoryId'>): string {
  switch (item.scope) {
    case 'type':
      return `type-${item.expenseType}`;
    case 'category':
      return `cat-${item.categoryId}`;
    case 'subcategory':
      return `sub-${item.categoryId}-${item.subCategoryId}`;
  }
}

/** Returns the budget kind a category implies: income categories → 'income'. */
export function categoryKind(category: Pick<ExpenseCategory, 'type'>): 'expense' | 'income' {
  return category.type === 'income' ? 'income' : 'expense';
}

// ==================== Core Matching ====================

/**
 * Returns true if an expense matches the budget item's scope, kind and identifiers.
 *
 * Type-scope expense items match only spending types; type-scope income items match
 * income transactions. Category/subcategory items match by ID regardless of sign —
 * a category is inherently income or expense, so its `kind` is fixed by the category.
 */
function expenseMatchesItem(expense: Expense, item: BudgetItem): boolean {
  // Transfers are net-zero — never match any budget item
  if (expense.type === 'transfer') return false;

  switch (item.scope) {
    case 'type':
      if (item.kind === 'income') {
        return expense.type === 'income' && expense.amount > 0;
      }
      // Expense type-scope budgets are spending-only: skip income and positive amounts
      if (expense.type === 'income' || expense.amount > 0) return false;
      return expense.type === item.expenseType;
    case 'category':
      return expense.categoryId === item.categoryId;
    case 'subcategory':
      return (
        expense.categoryId === item.categoryId &&
        expense.subCategoryId === item.subCategoryId
      );
    default:
      return false;
  }
}

// ==================== Annual and Monthly Actuals ====================

/**
 * Returns the total absolute EUR amount for a budget item in a given year.
 *
 * Amounts are stored as negatives in the DB; we return a positive total.
 * Multi-currency expenses are summed as-is (no conversion), matching the
 * behavior of existing cashflow tabs.
 */
export function getActualForItem(
  item: BudgetItem,
  expenses: Expense[],
  year: number
): number {
  let total = 0;
  for (const expense of expenses) {
    const expYear = getItalyYear(toDate(expense.date));
    if (expYear !== year) continue;
    if (!expenseMatchesItem(expense, item)) continue;
    total += Math.abs(expense.amount);
  }
  return total;
}

/**
 * Returns monthly spending breakdown for a budget item in a given year.
 * Always returns 12 entries (one per calendar month), zero for months
 * with no matching expenses. Index 0 = January, index 11 = December.
 */
export function getMonthlyActualsForItem(
  item: BudgetItem,
  expenses: Expense[],
  year: number
): number[] {
  const monthly = new Array<number>(12).fill(0);
  for (const expense of expenses) {
    const { month, year: expYear } = getItalyMonthYear(toDate(expense.date));
    if (expYear !== year) continue;
    if (!expenseMatchesItem(expense, item)) continue;
    monthly[month - 1] += Math.abs(expense.amount);
  }
  return monthly;
}

/**
 * Returns the absolute EUR total of all real spending in a single month/year —
 * every expense (amount < 0) except transfers, regardless of category.
 *
 * This is what the overall budget is measured against: a ceiling on ALL spending
 * combined (issue #148), not just the categories that happen to have a budget.
 */
export function getMonthlyTotalExpenses(
  expenses: Expense[],
  year: number,
  month: number
): number {
  let total = 0;
  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;
    if (expense.amount >= 0) continue; // income / positive corrections
    const { month: expMonth, year: expYear } = getItalyMonthYear(toDate(expense.date));
    if (expYear !== year || expMonth !== month) continue;
    total += Math.abs(expense.amount);
  }
  return total;
}

/** Returns the absolute EUR total for a budget item in a single month of a year. */
export function getMonthActualForItem(
  item: BudgetItem,
  expenses: Expense[],
  year: number,
  month: number
): number {
  let total = 0;
  for (const expense of expenses) {
    const { month: expMonth, year: expYear } = getItalyMonthYear(toDate(expense.date));
    if (expYear !== year || expMonth !== month) continue;
    if (!expenseMatchesItem(expense, item)) continue;
    total += Math.abs(expense.amount);
  }
  return total;
}

/**
 * The month's total spending split at `now`: booked up to today versus dated after it
 * (instalments, recurring rows of the rest of the month). The projection extrapolates only
 * the former and adds the latter as it is — the rule Tracciamento and the Panoramica apply
 * (`splitSpendingAtDate`), so the three surfaces print ONE month-end figure.
 */
export function splitMonthlyTotalExpenses(
  expenses: Expense[],
  year: number,
  month: number,
  now: Date
): SpendingSplit {
  let spentToDate = 0;
  let scheduled = 0;
  const todayIso = getItalyDateIso(now);
  for (const expense of expenses) {
    if (expense.type === 'transfer') continue;
    if (expense.amount >= 0) continue;
    const date = toDate(expense.date);
    const { month: expMonth, year: expYear } = getItalyMonthYear(date);
    if (expYear !== year || expMonth !== month) continue;
    if (getItalyDateIso(date) > todayIso) scheduled += Math.abs(expense.amount);
    else spentToDate += Math.abs(expense.amount);
  }
  return { spentToDate, scheduled };
}

/** A budget item's month spending split at `now` (see splitMonthlyTotalExpenses). */
export function splitMonthActualForItem(
  item: BudgetItem,
  expenses: Expense[],
  year: number,
  month: number,
  now: Date
): SpendingSplit {
  let spentToDate = 0;
  let scheduled = 0;
  const todayIso = getItalyDateIso(now);
  for (const expense of expenses) {
    const date = toDate(expense.date);
    const { month: expMonth, year: expYear } = getItalyMonthYear(date);
    if (expYear !== year || expMonth !== month) continue;
    if (!expenseMatchesItem(expense, item)) continue;
    if (getItalyDateIso(date) > todayIso) scheduled += Math.abs(expense.amount);
    else spentToDate += Math.abs(expense.amount);
  }
  return { spentToDate, scheduled };
}

/**
 * Returns the spend a budget item is measured against for its period, relative
 * to `now`: monthly → the current month's spend; annual → the year-to-date spend.
 */
export function getPeriodActual(item: BudgetItem, expenses: Expense[], now: Date = new Date()): number {
  const year = getItalyYear(now);
  if (item.period === 'annual') {
    return getActualForItem(item, expenses, year);
  }
  return getMonthActualForItem(item, expenses, year, getItalyMonth(now));
}

/**
 * Returns the individual expenses a budget item matches in its current period,
 * relative to `now`, sorted by absolute amount descending (largest first).
 *
 * Period window mirrors getPeriodActual: monthly → the current month; annual →
 * the current year (year-to-date). Reuses expenseMatchesItem so the listed
 * expenses always reconcile with the total getPeriodActual reports — the email's
 * per-expense breakdown can never disagree with the row's spent amount.
 */
export function getPeriodExpensesForItem(
  item: BudgetItem,
  expenses: Expense[],
  now: Date = new Date()
): Expense[] {
  const year = getItalyYear(now);
  const month = item.period === 'annual' ? null : getItalyMonth(now);

  const matched: Expense[] = [];
  for (const expense of expenses) {
    const { month: expMonth, year: expYear } = getItalyMonthYear(toDate(expense.date));
    if (expYear !== year) continue;
    if (month !== null && expMonth !== month) continue;
    if (!expenseMatchesItem(expense, item)) continue;
    matched.push(expense);
  }
  return matched.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

// ==================== Default Pre-fill ====================

/**
 * Computes the suggested default amount for a new budget item from history.
 *
 * Uses the most recent prior year with data: the full annual total for an
 * annual budget, or that total / 12 for a monthly budget. Returns 0 when no
 * historical data exists (so the input field starts empty).
 */
export function getDefaultAmount(
  item: Pick<BudgetItem, 'kind' | 'scope' | 'expenseType' | 'categoryId' | 'subCategoryId'>,
  expenses: Expense[],
  historyStartYear: number,
  period: BudgetItem['period'] = 'monthly'
): number {
  const currentYear = getItalyYear();
  const previousYear = currentYear - 1;

  const yearsToTry: number[] = [];
  for (let y = previousYear; y >= historyStartYear; y--) {
    yearsToTry.push(y);
  }
  if (yearsToTry.length === 0) return 0;

  const probe = { ...item, id: '', amount: 0, order: 0, period } as BudgetItem;
  for (const year of yearsToTry) {
    const annual = getActualForItem(probe, expenses, year);
    if (annual > 0) return period === 'annual' ? annual : annual / 12;
  }

  return 0;
}

// ==================== Comparison Builder ====================

/**
 * Builds the full BudgetComparison object for a single budget item.
 *
 * budgetUsedRatio = currentYearTotal / annual budget (amount, or amount×12 if monthly).
 */
export function buildBudgetComparison(
  item: BudgetItem,
  expenses: Expense[],
  currentYear: number,
  historyStartYear: number
): BudgetComparison {
  const previousYear = currentYear - 1;

  const currentYearTotal = getActualForItem(item, expenses, currentYear);
  const previousYearTotal = getActualForItem(item, expenses, previousYear);

  const currentYearMonthly = getMonthlyActualsForItem(item, expenses, currentYear);
  const previousYearMonthly = getMonthlyActualsForItem(item, expenses, previousYear);

  const historicalYears: number[] = [];
  for (let y = historyStartYear; y < currentYear; y++) {
    historicalYears.push(y);
  }

  let historicalAverage = 0;
  const historicalMonthlyAverage = new Array<number>(12).fill(0);

  if (historicalYears.length > 0) {
    const annualTotals = historicalYears.map((y) => getActualForItem(item, expenses, y));
    historicalAverage = annualTotals.reduce((a, b) => a + b, 0) / historicalYears.length;

    const monthlyTotals = historicalYears.map((y) => getMonthlyActualsForItem(item, expenses, y));
    for (let m = 0; m < 12; m++) {
      const sum = monthlyTotals.reduce((acc, yearData) => acc + yearData[m], 0);
      historicalMonthlyAverage[m] = sum / historicalYears.length;
    }
  }

  const annualBudget = item.period === 'annual' ? item.amount : item.amount * 12;
  const budgetUsedRatio = annualBudget > 0 ? currentYearTotal / annualBudget : 0;

  return {
    item,
    currentYearTotal,
    previousYearTotal,
    historicalAverage,
    currentYearMonthly,
    previousYearMonthly,
    historicalMonthlyAverage,
    budgetUsedRatio,
  };
}

// ==================== Reconcile (opt-in) ====================

/**
 * Reconciles the user's saved budget items against the live categories.
 *
 * Budgets are opt-in: this function never auto-creates an item per category.
 * It keeps only the items the user explicitly created whose target still exists,
 * refreshes denormalized names and `kind` from the live category, and drops
 * orphans (category/subcategory deleted). Type-scope items are always kept.
 * User-set `amount`, `period` and `order` are preserved.
 */
export function reconcileBudgetItems(
  categories: ExpenseCategory[],
  existingItems: BudgetItem[]
): BudgetItem[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const reconciled: BudgetItem[] = [];
  for (const item of existingItems) {
    if (item.scope === 'type') {
      reconciled.push(item);
      continue;
    }

    const category = item.categoryId ? categoryById.get(item.categoryId) : undefined;
    if (!category) continue; // orphan — category deleted

    if (item.scope === 'subcategory') {
      const sub = category.subCategories.find((s) => s.id === item.subCategoryId);
      if (!sub) continue; // orphan — subcategory deleted
      reconciled.push({
        ...item,
        kind: categoryKind(category),
        categoryName: category.name,
        subCategoryName: sub.name,
      });
      continue;
    }

    reconciled.push({
      ...item,
      kind: categoryKind(category),
      categoryName: category.name,
    });
  }

  return reconciled;
}

// ==================== Overall Budget Validation ====================

export interface BudgetAllocationValidation {
  valid: boolean;
  overall: number;
  // Sum of top-level expense budgets (type + category scope; subcategory excluded
  // to avoid double-counting a slice already covered by its parent category).
  allocated: number;
  available: number; // overall − allocated (negative when over-allocated)
}

/**
 * Validates that the sum of expense budgets does not exceed the overall budget.
 * Income budgets are never counted — the overall budget is a spending ceiling.
 * When no overall budget is set, the allocation is always valid.
 */
export function validateBudgetAllocation(
  items: BudgetItem[],
  overallMonthlyAmount: number | undefined
): BudgetAllocationValidation {
  const overall = overallMonthlyAmount ?? 0;
  // Only monthly expense ceilings consume the monthly overall budget. Annual
  // budgets are a different unit; subcategory budgets are slices of a category.
  const allocated = items
    .filter((i) => i.kind === 'expense' && i.scope !== 'subcategory' && i.period === 'monthly')
    .reduce((sum, i) => sum + i.amount, 0);
  const available = overall - allocated;
  return {
    valid: overall <= 0 || allocated <= overall,
    overall,
    allocated,
    available,
  };
}

// ==================== Spending Forecast ====================

// Below this many elapsed days the linear projection is too noisy to flag a
// budget as "at risk" / forecast-overrun (one early purchase dominates).
export const MIN_FORECAST_DAYS = 4;

/** Number of days in the calendar month of `date` (Italy timezone). */
function daysInMonthFor(date: Date): number {
  const italy = getItalyDate(date);
  return new Date(italy.getFullYear(), italy.getMonth() + 1, 0).getDate();
}

/** Day of month (1-31) for `date` in Italy timezone, clamped to the month length. */
function dayOfMonthFor(date: Date): number {
  return Math.min(getItalyDate(date).getDate(), daysInMonthFor(date));
}

export interface BudgetCalendar {
  dayOfMonth: number;
  daysInMonth: number;
  daysLeft: number;
  /** False in the first days of the month, when a pace is not yet a pace. */
  canForecast: boolean;
}

/** The month's calendar as the budget layer reads it: day, length, days left. */
export function resolveBudgetCalendar(now: Date): BudgetCalendar {
  const daysInMonth = daysInMonthFor(now);
  const dayOfMonth = dayOfMonthFor(now);
  return { dayOfMonth, daysInMonth, daysLeft: Math.max(0, daysInMonth - dayOfMonth), canForecast: dayOfMonth >= MIN_FORECAST_DAYS };
}

const FIXED_TYPES: ReadonlySet<string> = new Set(['fixed', 'debt']);

/** The category fields the pace rule needs — the server can pass a slimmer record. */
export type CategoryTypeRef = Pick<ExpenseCategory, 'id' | 'type'>;

/**
 * How a budget item is projected. A type-scope item declares its own type; a category or
 * subcategory item takes the live category's. A category the list no longer holds (an
 * orphan about to be reconciled away, or a server call without categories) is treated as
 * variable — the conservative reading, it can only over-project.
 */
export function resolveItemPace(item: BudgetItem, categories: ReadonlyArray<CategoryTypeRef>): BudgetPace {
  const type = item.scope === 'type' ? item.expenseType : categories.find((c) => c.id === item.categoryId)?.type;
  return type && FIXED_TYPES.has(type) ? 'fixed' : 'variable';
}

/**
 * Projects the month-end total of a budget scope from what is booked in the month, split
 * at today. Pure numeric core: callers compute the split for the scope
 * (splitMonthActualForItem / splitMonthlyTotalExpenses). `now` drives days elapsed and
 * days in month, both in Italy timezone.
 *
 * 'variable' → the app's one projection rule: the pace on spentToDate plus the scheduled
 * rows as they are. 'fixed' → no pace: the figure is what is booked, nothing more.
 */
export function buildSpendingForecast(
  split: SpendingSplit,
  budgetAmount: number,
  now: Date = new Date(),
  pace: BudgetPace = 'variable'
): SpendingForecast {
  const { dayOfMonth: daysElapsed, daysInMonth, daysLeft } = resolveBudgetCalendar(now);
  const spentSoFar = split.spentToDate + split.scheduled;

  const projectedTotal =
    pace === 'fixed'
      ? spentSoFar
      : (projectMonthEndWithScheduled(split.spentToDate, split.scheduled, daysElapsed, daysInMonth) ?? spentSoFar);
  const remainingBudget = budgetAmount - projectedTotal;
  const estimatedOverspend = Math.max(0, projectedTotal - budgetAmount);

  const budgetLeftNow = Math.max(0, budgetAmount - spentSoFar);
  const dailyAllowance = daysLeft > 0 ? budgetLeftNow / daysLeft : 0;

  return {
    spentSoFar,
    spentToDate: split.spentToDate,
    scheduled: split.scheduled,
    budgetAmount,
    projectedTotal,
    remainingBudget,
    estimatedOverspend,
    dailyAllowance,
    daysElapsed,
    daysInMonth,
  };
}

// ==================== The day a limit is crossed ====================

/** A dated amount of the month, the unit the crossing-day scan works on. */
export interface DatedAmount {
  /** Day of the month (1-31), Italy timezone. */
  day: number;
  amount: number;
}

/** The month's spending rows as dated amounts (income and transfers out), unsorted. */
export function collectMonthSpending(expenses: Expense[], year: number, month: number): DatedAmount[] {
  const out: DatedAmount[] = [];
  for (const expense of expenses) {
    if (expense.type === 'transfer' || expense.amount >= 0) continue;
    const date = toDate(expense.date);
    const { month: expMonth, year: expYear } = getItalyMonthYear(date);
    if (expYear !== year || expMonth !== month) continue;
    out.push({ day: getItalyDate(date).getDate(), amount: Math.abs(expense.amount) });
  }
  return out;
}

/** A budget item's month rows as dated amounts (see collectMonthSpending). */
export function collectMonthItemSpending(item: BudgetItem, expenses: Expense[], year: number, month: number): DatedAmount[] {
  const out: DatedAmount[] = [];
  for (const expense of expenses) {
    const date = toDate(expense.date);
    const { month: expMonth, year: expYear } = getItalyMonthYear(date);
    if (expYear !== year || expMonth !== month) continue;
    if (!expenseMatchesItem(expense, item)) continue;
    out.push({ day: getItalyDate(date).getDate(), amount: Math.abs(expense.amount) });
  }
  return out;
}

/**
 * The first day of the month on which the running total of `entries` exceeds `limit`, or
 * null when it never does. Rows are summed by calendar day (two coffees on the 13th cross
 * together), so the answer is a day, never a row: «hai superato il tetto il 13». A row dated
 * after today (an instalment already in the calendar) can put the crossing in the future —
 * the caller reads the day against today and says «supererai» instead of «hai superato».
 */
export function findCrossingDay(entries: DatedAmount[], limit: number): number | null {
  if (limit <= 0) return null;
  const byDay = new Map<number, number>();
  for (const entry of entries) byDay.set(entry.day, (byDay.get(entry.day) ?? 0) + entry.amount);
  let running = 0;
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    running += byDay.get(day)!;
    if (running > limit) return day;
  }
  return null;
}

/**
 * The day the month-end pace crosses `limit`, if it does before the month ends: from tomorrow
 * on, what is booked to date grows by the daily pace, and each scheduled row lands on its own
 * day. Null when the limit holds to the last day (or is already over — that is a fact for
 * findCrossingDay, not a projection), and before MIN_FORECAST_DAYS like every projection.
 */
export function projectCrossingDay(spentToDate: number, scheduled: DatedAmount[], limit: number, calendar: BudgetCalendar): number | null {
  if (!calendar.canForecast || limit <= 0 || calendar.dayOfMonth >= calendar.daysInMonth) return null;
  const pace = spentToDate / calendar.dayOfMonth;
  for (let day = calendar.dayOfMonth + 1; day <= calendar.daysInMonth; day++) {
    const landed = scheduled.filter((row) => row.day <= day).reduce((sum, row) => sum + row.amount, 0);
    if (spentToDate + pace * (day - calendar.dayOfMonth) + landed > limit) return day;
  }
  return null;
}

// ==================== Categories at Risk ====================

/** Display label for a budget item (denormalized names; no live-category lookup). */
export function budgetItemLabel(item: BudgetItem): string {
  if (item.scope === 'subcategory') {
    return `${item.categoryName ?? ''} › ${item.subCategoryName ?? ''}`;
  }
  return item.categoryName ?? item.expenseType ?? '';
}

/** A monthly expense budget's forecast for the current month, with its pace resolved. */
export function forecastMonthlyItem(
  item: BudgetItem,
  expenses: Expense[],
  now: Date,
  categories: ReadonlyArray<CategoryTypeRef>
): SpendingForecast {
  const split = splitMonthActualForItem(item, expenses, getItalyYear(now), getItalyMonth(now), now);
  return buildSpendingForecast(split, item.amount, now, resolveItemPace(item, categories));
}

/**
 * The monthly expense budgets whose month-end projection exceeds their amount, largest
 * overrun first. Subcategory slices are skipped (their parent already covers them), annual
 * budgets are not paced (they are spiky by nature), and the first days of the month flag
 * nothing: a pace measured on two days is not a pace. A budget ALREADY over is not a risk but
 * a fact — it belongs to the alerts («Superato») and is left out here, so no row sits in two
 * tiles. Scope: only the categories the user gave a budget to — the opt-in focus set — never
 * all of the month's spending.
 */
export function rankCategoriesAtRisk(
  expenseItems: BudgetItem[],
  expenses: Expense[],
  now: Date = new Date(),
  categories: ReadonlyArray<CategoryTypeRef> = []
): BudgetRiskSummary {
  const { canForecast } = resolveBudgetCalendar(now);
  const monthly = expenseItems.filter((item) => item.period === 'monthly' && item.scope !== 'subcategory' && item.amount > 0);
  if (!canForecast) return { atRisk: [], evaluated: monthly.length, canForecast };

  const atRisk: BudgetRiskSummary['atRisk'] = [];
  for (const item of monthly) {
    const forecast = forecastMonthlyItem(item, expenses, now, categories);
    if (forecast.spentSoFar <= item.amount && forecast.projectedTotal > item.amount) {
      atRisk.push({
        key: budgetItemKey(item),
        label: budgetItemLabel(item),
        projectedTotal: forecast.projectedTotal,
        budgetAmount: item.amount,
        overBy: forecast.projectedTotal - item.amount,
      });
    }
  }
  atRisk.sort((a, b) => b.overBy - a.overBy);
  return { atRisk, evaluated: monthly.length, canForecast };
}

// ==================== Budget Alerts ====================

/** Highest configured threshold (%) that `ratioPct` has crossed, or null. */
function highestCrossedThreshold(ratioPct: number, thresholds: number[]): number | null {
  const crossed = thresholds.filter((t) => ratioPct >= t).sort((a, b) => b - a);
  return crossed.length > 0 ? crossed[0] : null;
}

/**
 * Evaluates threshold alerts across expense budgets and the overall budget.
 * Each budget is measured over its own period (monthly → current month, annual →
 * year-to-date). An alert fires when current spend crosses a configured threshold
 * OR — for monthly budgets only — the end-of-month projection is set to exceed
 * the budget (forecastedOverrun, `thresholdCrossed: false`). Annual budgets are
 * spiky, so no forecast; and the projection follows the item's pace (a fixed
 * category never extrapolates).
 *
 * Sorted by used ratio descending so the most urgent alert is first.
 */
export function evaluateBudgetAlerts(
  expenseItems: BudgetItem[],
  overallMonthlyAmount: number | undefined,
  expenses: Expense[],
  thresholds: number[] = DEFAULT_ALERT_THRESHOLDS,
  now: Date = new Date(),
  categories: ReadonlyArray<CategoryTypeRef> = []
): BudgetAlert[] {
  const year = getItalyYear(now);
  const month = getItalyMonth(now);
  const alerts: BudgetAlert[] = [];

  const evaluate = (key: string, label: string, spent: number, budgetAmount: number, forecastedOverrun: boolean, crossedOn: number | null) => {
    if (budgetAmount <= 0) return;
    const usedRatio = spent / budgetAmount;
    const crossed = highestCrossedThreshold(usedRatio * 100, thresholds);
    if (crossed === null && !forecastedOverrun) return;
    alerts.push({
      key,
      label,
      level: usedRatio >= 1 ? 'exceeded' : 'warning',
      threshold: crossed ?? 100,
      thresholdCrossed: crossed !== null,
      spent,
      budgetAmount,
      usedRatio,
      forecastedOverrun,
      crossedOn,
    });
  };

  // Forecast-overrun only fires once enough days have passed to trust the pace;
  // threshold alerts on actual spend fire regardless.
  const { canForecast } = resolveBudgetCalendar(now);

  // Per-category expense budgets (skip subcategory to avoid double alerts)
  for (const item of expenseItems) {
    if (item.scope === 'subcategory') continue;
    const spent = getPeriodActual(item, expenses, now);
    const forecastedOverrun =
      item.period === 'monthly' && canForecast && forecastMonthlyItem(item, expenses, now, categories).projectedTotal > item.amount;
    // The day the budget went over — monthly budgets only: an annual one crosses on a date of
    // the year, which is a different sentence the alerts do not tell yet.
    const crossedOn = item.period === 'monthly' ? findCrossingDay(collectMonthItemSpending(item, expenses, year, month), item.amount) : null;
    evaluate(budgetItemKey(item), budgetItemLabel(item), spent, item.amount, forecastedOverrun, crossedOn);
  }

  // Overall spending ceiling — measured against ALL month spending, not just
  // the budgeted categories (issue #148: "applies to all expenses combined").
  if (overallMonthlyAmount && overallMonthlyAmount > 0) {
    const split = splitMonthlyTotalExpenses(expenses, year, month, now);
    const forecast = buildSpendingForecast(split, overallMonthlyAmount, now);
    const overrun = canForecast && forecast.projectedTotal > overallMonthlyAmount;
    const crossedOn = findCrossingDay(collectMonthSpending(expenses, year, month), overallMonthlyAmount);
    evaluate(OVERALL_BUDGET_KEY, 'Budget complessivo', forecast.spentSoFar, overallMonthlyAmount, overrun, crossedOn);
  }

  return alerts.sort((a, b) => b.usedRatio - a.usedRatio);
}

// ==================== Section Ordering ====================

/** Numeric sort weight for a budget item's section (fixed → variable → debt → income). */
export function sectionWeight(item: BudgetItem, categories: ExpenseCategory[]): number {
  if (item.kind === 'income') return SECTION_ORDER.income;
  if (item.scope === 'type') return SECTION_ORDER[item.expenseType ?? ''] ?? 9;
  const category = categories.find((c) => c.id === item.categoryId);
  return SECTION_ORDER[category?.type ?? ''] ?? 9;
}
