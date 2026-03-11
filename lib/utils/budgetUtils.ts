// Budget Utility Functions
//
// Pure functions for computing budget actuals and comparisons from the
// allExpenses array. No Firestore dependency — fully testable with Vitest.
//
// Amount sign convention (same as expenseService):
//   Expenses are stored as negative numbers, income as positive.
//   We take Math.abs() when returning totals so callers get positive values.

import { Expense, ExpenseCategory } from '@/types/expenses';
import { BudgetComparison, BudgetItem } from '@/types/budget';
import { getItalyMonth, getItalyMonthYear, getItalyYear } from './dateHelpers';
import { toDate } from './dateHelpers';

// Section display order: fixed → variable → debt → income
const SECTION_ORDER: Record<string, number> = { fixed: 0, variable: 1, debt: 2, income: 3 };

// ==================== Key Helpers ====================

/**
 * Stable composite key for a budget item used for deduplication and lookups.
 * Exported so both the component and autoInit can use the same key logic.
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

// ==================== Core Matching ====================

/**
 * Returns true if an expense matches the budget item's scope and identifiers.
 *
 * Type-scope items only match spending types (never income).
 * Category/subcategory items match by ID regardless of income/expense type,
 * so income categories are tracked correctly alongside spending categories.
 */
function expenseMatchesItem(expense: Expense, item: BudgetItem): boolean {
  switch (item.scope) {
    case 'type':
      // Type-scope budgets are spending-only: skip income and positive amounts
      if (expense.type === 'income' || expense.amount > 0) return false;
      return expense.type === item.expenseType;
    case 'category':
      // Match by categoryId — works for both income and expense categories
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
 * Returns the total absolute EUR spending for a budget item in a given year.
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
 * with no matching expenses.
 * Index 0 = January, index 11 = December.
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

// ==================== Default Pre-fill ====================

/**
 * Computes the suggested default monthly amount for a new budget item.
 *
 * Uses the previous year's total spending divided by 12 — a stable, seasonality-
 * independent estimate of "how much you spend on average per month".
 * Falls back to the most recent prior year with data if the previous year has none.
 *
 * Returns 0 when no historical data exists (so the input field starts empty).
 */
export function getDefaultMonthlyAmount(
  item: Omit<BudgetItem, 'id' | 'monthlyAmount'>,
  expenses: Expense[],
  historyStartYear: number
): number {
  const currentYear = getItalyYear();
  const previousYear = currentYear - 1;

  // Try previous year first, then walk back to historyStartYear
  const yearsToTry: number[] = [];
  for (let y = previousYear; y >= historyStartYear; y--) {
    yearsToTry.push(y);
  }
  if (yearsToTry.length === 0) return 0;

  for (const year of yearsToTry) {
    const annual = getActualForItem({ ...item, id: '', monthlyAmount: 0, order: 0 } as BudgetItem, expenses, year);
    // Store as monthly amount (annual / 12); the caller multiplies back by 12 for display
    if (annual > 0) return annual / 12;
  }

  return 0;
}

// ==================== Comparison Builder ====================

/**
 * Builds the full BudgetComparison object for a single budget item.
 *
 * Computes current year, previous year, and historical averages (both annual
 * and per calendar month) from the allExpenses array.
 *
 * budgetUsedRatio = currentYearTotal / (monthlyAmount × monthsElapsed).
 * Uses months elapsed up to current month so January doesn't look artificially
 * on-track for the wrong reasons.
 */
export function buildBudgetComparison(
  item: BudgetItem,
  expenses: Expense[],
  currentYear: number,
  historyStartYear: number
): BudgetComparison {
  const currentMonth = getItalyMonth();
  const previousYear = currentYear - 1;

  // Annual totals
  const currentYearTotal = getActualForItem(item, expenses, currentYear);
  const previousYearTotal = getActualForItem(item, expenses, previousYear);

  // Monthly breakdowns
  const currentYearMonthly = getMonthlyActualsForItem(item, expenses, currentYear);
  const previousYearMonthly = getMonthlyActualsForItem(item, expenses, previousYear);

  // Historical average (annual and monthly) from historyStartYear to currentYear-1
  const historicalYears: number[] = [];
  for (let y = historyStartYear; y < currentYear; y++) {
    historicalYears.push(y);
  }

  let historicalAverage = 0;
  const historicalMonthlyAverage = new Array<number>(12).fill(0);

  if (historicalYears.length > 0) {
    const annualTotals = historicalYears.map((y) => getActualForItem(item, expenses, y));
    historicalAverage =
      annualTotals.reduce((a, b) => a + b, 0) / historicalYears.length;

    // Per-month average across historical years
    const monthlyTotals = historicalYears.map((y) =>
      getMonthlyActualsForItem(item, expenses, y)
    );
    for (let m = 0; m < 12; m++) {
      const sum = monthlyTotals.reduce((acc, yearData) => acc + yearData[m], 0);
      historicalMonthlyAverage[m] = sum / historicalYears.length;
    }
  }

  // Progress ratio: spending vs full annual budget (monthlyAmount × 12)
  const annualBudget = item.monthlyAmount * 12;
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

// ==================== Auto-Init ====================

/**
 * Builds the canonical list of budget items from the user's categories.
 *
 * Strategy:
 *   1. One category-scope item per non-income category, grouped by expense type
 *      (fixed → variable → debt) and sorted alphabetically within each group.
 *   2. Monthly amounts are taken from existingItems when available (preserves
 *      user customizations), otherwise pre-filled via getDefaultMonthlyAmount.
 *   3. Existing subcategory items are preserved at the end of their section,
 *      keeping any customized order. Orphaned subcategory items (whose parent
 *      category no longer exists) are silently dropped.
 *   4. `order` is reassigned sequentially within each section so it stays
 *      contiguous after categories are added/removed.
 *
 * Called on every BudgetTab mount so new categories appear automatically
 * without requiring an explicit save.
 */
export function autoInitBudgetItems(
  categories: ExpenseCategory[],
  expenses: Expense[],
  historyStartYear: number,
  existingItems: BudgetItem[]
): BudgetItem[] {
  // Build lookup of existing items by key for fast amount retrieval
  const existingByKey = new Map<string, BudgetItem>();
  for (const item of existingItems) {
    existingByKey.set(budgetItemKey(item), item);
  }

  // All categories (including income) sorted by section order then alphabetically
  const spendingCategories = categories
    .filter((c) => c.type !== undefined)
    .sort((a, b) => {
      const typeDiff =
        (SECTION_ORDER[a.type] ?? 9) - (SECTION_ORDER[b.type] ?? 9);
      if (typeDiff !== 0) return typeDiff;
      return a.name.localeCompare(b.name, 'it');
    });

  // Order counter per section
  const orderCounter: Record<string, number> = {};

  const categoryItems: BudgetItem[] = spendingCategories.map((cat) => {
    const key = `cat-${cat.id}`;
    const existing = existingByKey.get(key);
    const sectionOrder = (orderCounter[cat.type] ?? 0);
    orderCounter[cat.type] = sectionOrder + 1;

    const monthlyAmount = existing?.monthlyAmount ??
      getDefaultMonthlyAmount(
        { scope: 'category', categoryId: cat.id, categoryName: cat.name, order: 0 },
        expenses,
        historyStartYear
      );

    return {
      id: existing?.id ?? crypto.randomUUID(),
      scope: 'category',
      categoryId: cat.id,
      categoryName: cat.name,
      monthlyAmount,
      order: sectionOrder,
    };
  });

  // Preserve existing subcategory items, filtering out orphans (covers all category types)
  const validCategoryIds = new Set(spendingCategories.map((c) => c.id));
  const subItems = existingItems
    .filter(
      (item) =>
        item.scope === 'subcategory' &&
        item.categoryId != null &&
        validCategoryIds.has(item.categoryId)
    )
    .map((item) => ({ ...item, order: item.order ?? 0 }));

  return [...categoryItems, ...subItems];
}
