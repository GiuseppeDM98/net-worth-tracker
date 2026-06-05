// Budget Utility Functions
//
// Pure functions for computing budget actuals, comparisons, forecasts, insights
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
  BudgetInsights,
  BudgetItem,
  DEFAULT_ALERT_THRESHOLDS,
  SpendingForecast,
} from '@/types/budget';
import { getItalyDate, getItalyMonth, getItalyMonthYear, getItalyYear, toDate } from './dateHelpers';

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
 * Average monthly total spending in the previous year — the historical baseline
 * the overall-budget forecast shrinks toward early in the month. 0 if no prior data.
 */
export function getOverallMonthlyBaseline(expenses: Expense[], year: number): number {
  let total = 0;
  for (let m = 1; m <= 12; m++) {
    total += getMonthlyTotalExpenses(expenses, year - 1, m);
  }
  return total > 0 ? total / 12 : 0;
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

/**
 * Projects end-of-month total from the current daily pace.
 *
 * Pure numeric core: callers compute `spentSoFar` for the budget scope via
 * getMonthActualForItem (or by summing several items). `now` drives days elapsed
 * and days in month, both in Italy timezone.
 *
 * When `referenceMonthlyAverage` (the scope's historical monthly spend) is given,
 * the projection shrinks toward that pace early in the month and converges to the
 * pure actual pace as the month progresses — so a single front-loaded purchase
 * doesn't blow the projection up on day 3. Pass 0 for the naive linear projection.
 */
export function buildSpendingForecast(
  spentSoFar: number,
  budgetAmount: number,
  now: Date = new Date(),
  referenceMonthlyAverage = 0
): SpendingForecast {
  const daysInMonth = daysInMonthFor(now);
  const daysElapsed = dayOfMonthFor(now);
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  const actualDailyPace = daysElapsed > 0 ? spentSoFar / daysElapsed : 0;
  let projectedTotal: number;
  if (referenceMonthlyAverage > 0 && daysElapsed > 0) {
    // Confidence in the actual pace grows with the fraction of the month elapsed.
    const confidence = daysElapsed / daysInMonth;
    const referenceDailyPace = referenceMonthlyAverage / daysInMonth;
    const blendedDailyPace = confidence * actualDailyPace + (1 - confidence) * referenceDailyPace;
    projectedTotal = spentSoFar + blendedDailyPace * daysRemaining;
  } else {
    projectedTotal = actualDailyPace * daysInMonth;
  }
  const remainingBudget = budgetAmount - projectedTotal;
  const estimatedOverspend = Math.max(0, projectedTotal - budgetAmount);

  const budgetLeftNow = Math.max(0, budgetAmount - spentSoFar);
  const dailyAllowance = daysRemaining > 0 ? budgetLeftNow / daysRemaining : 0;

  return {
    spentSoFar,
    budgetAmount,
    projectedTotal,
    remainingBudget,
    estimatedOverspend,
    dailyAllowance,
    daysElapsed,
    daysInMonth,
  };
}

// ==================== Budget Insights ====================

/** Display label for a budget item (denormalized names; no live-category lookup). */
function itemLabel(item: BudgetItem): string {
  if (item.scope === 'subcategory') {
    return `${item.categoryName ?? ''} › ${item.subCategoryName ?? ''}`;
  }
  return item.categoryName ?? item.expenseType ?? '';
}

/**
 * Builds actionable insights for the current month from the expense budget items.
 *
 * Insights are computed over budgeted expense items (the categories the user
 * chose to track), which the opt-in design treats as the user's focus set.
 */
export function buildBudgetInsights(
  expenseItems: BudgetItem[],
  expenses: Expense[],
  now: Date = new Date()
): BudgetInsights {
  const year = getItalyYear(now);
  const month = getItalyMonth(now);
  const daysInMonth = daysInMonthFor(now);
  const daysElapsed = dayOfMonthFor(now);

  // Top spending category this month (category-scope expense items only)
  let topCategory: BudgetInsights['topCategory'] = null;
  for (const item of expenseItems) {
    if (item.scope === 'subcategory') continue;
    const amount = getMonthActualForItem(item, expenses, year, month);
    if (amount > 0 && (!topCategory || amount > topCategory.amount)) {
      topCategory = { label: itemLabel(item), amount };
    }
  }

  // Categories whose end-of-month projection exceeds their budget
  const categoriesAtRisk: BudgetInsights['categoriesAtRisk'] = [];
  let currentMonthExpenses = 0;
  for (const item of expenseItems) {
    if (item.scope === 'subcategory') continue;
    const spent = getMonthActualForItem(item, expenses, year, month);
    currentMonthExpenses += spent;
    // "At risk" is a monthly-pace projection — annual budgets are spiky and not
    // evaluated this way. Skip the noisy first days, and dampen the projection
    // with the category's previous-year monthly average.
    if (item.period !== 'monthly' || item.amount <= 0 || daysElapsed < MIN_FORECAST_DAYS) continue;
    const reference = getActualForItem(item, expenses, year - 1) / 12;
    const forecast = buildSpendingForecast(spent, item.amount, now, reference);
    if (forecast.projectedTotal > item.amount) {
      categoriesAtRisk.push({
        label: itemLabel(item),
        projectedTotal: forecast.projectedTotal,
        budgetAmount: item.amount,
      });
    }
  }
  categoriesAtRisk.sort((a, b) => b.projectedTotal - a.projectedTotal);

  // Trailing average of prior completed months this year
  let priorMonthsAverage = 0;
  if (month > 1) {
    let sum = 0;
    for (let m = 1; m < month; m++) {
      for (const item of expenseItems) {
        if (item.scope === 'subcategory') continue;
        sum += getMonthActualForItem(item, expenses, year, m);
      }
    }
    priorMonthsAverage = sum / (month - 1);
  }

  // What you'd typically have spent by today, for an apples-to-apples comparison
  // with the partial current month (prorate the prior-months average to the day).
  const expectedSpendToDate = daysInMonth > 0 ? priorMonthsAverage * (daysElapsed / daysInMonth) : 0;

  const averageDailySpend = daysElapsed > 0 ? currentMonthExpenses / daysElapsed : 0;

  return {
    topCategory,
    categoriesAtRisk,
    currentMonthExpenses,
    priorMonthsAverage,
    expectedSpendToDate,
    averageDailySpend,
  };
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
 * the budget (forecastedOverrun). Annual budgets are spiky, so no linear forecast.
 *
 * Sorted by used ratio descending so the most urgent alert is first.
 */
export function evaluateBudgetAlerts(
  expenseItems: BudgetItem[],
  overallMonthlyAmount: number | undefined,
  expenses: Expense[],
  thresholds: number[] = DEFAULT_ALERT_THRESHOLDS,
  now: Date = new Date()
): BudgetAlert[] {
  const year = getItalyYear(now);
  const month = getItalyMonth(now);
  const daysElapsed = dayOfMonthFor(now);
  const alerts: BudgetAlert[] = [];

  const evaluate = (key: string, label: string, spent: number, budgetAmount: number, forecastedOverrun: boolean) => {
    if (budgetAmount <= 0) return;
    const usedRatio = spent / budgetAmount;
    const crossed = highestCrossedThreshold(usedRatio * 100, thresholds);
    if (crossed === null && !forecastedOverrun) return;
    alerts.push({
      key,
      label,
      level: usedRatio >= 1 ? 'exceeded' : 'warning',
      threshold: crossed ?? 100,
      spent,
      budgetAmount,
      usedRatio,
      forecastedOverrun,
    });
  };

  // Forecast-overrun only fires once enough days have passed to trust the pace;
  // threshold alerts on actual spend fire regardless.
  const canForecast = daysElapsed >= MIN_FORECAST_DAYS;

  // Per-category expense budgets (skip subcategory to avoid double alerts)
  for (const item of expenseItems) {
    if (item.scope === 'subcategory') continue;
    const spent = getPeriodActual(item, expenses, now);
    const reference = getActualForItem(item, expenses, year - 1) / 12;
    const forecastedOverrun =
      item.period === 'monthly' &&
      canForecast &&
      buildSpendingForecast(spent, item.amount, now, reference).projectedTotal > item.amount;
    evaluate(budgetItemKey(item), itemLabel(item), spent, item.amount, forecastedOverrun);
  }

  // Overall spending ceiling — measured against ALL month spending, not just
  // the budgeted categories (issue #148: "applies to all expenses combined").
  if (overallMonthlyAmount && overallMonthlyAmount > 0) {
    const overallSpent = getMonthlyTotalExpenses(expenses, year, month);
    const reference = getOverallMonthlyBaseline(expenses, year);
    const overrun =
      canForecast && buildSpendingForecast(overallSpent, overallMonthlyAmount, now, reference).projectedTotal > overallMonthlyAmount;
    evaluate(OVERALL_BUDGET_KEY, 'Budget complessivo', overallSpent, overallMonthlyAmount, overrun);
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
