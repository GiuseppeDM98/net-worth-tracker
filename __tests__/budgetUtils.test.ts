/**
 * Unit tests for budgetUtils.ts — budget actuals, comparison, reconcile,
 * overall-budget validation, period actuals, spending forecast, insights and alerts.
 *
 * All functions are pure (no Firebase, no side effects).
 * getItalyYear/getItalyMonth use new Date() internally → vi.useFakeTimers() required
 * when testing functions that call them without an argument.
 *
 * Expense amount sign convention: expenses are stored as negative numbers,
 * income as positive. All returned spending totals are positive (Math.abs applied).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getActualForItem,
  getMonthlyActualsForItem,
  getMonthActualForItem,
  getMonthlyTotalExpenses,
  getPeriodActual,
  getDefaultAmount,
  buildBudgetComparison,
  reconcileBudgetItems,
  validateBudgetAllocation,
  buildSpendingForecast,
  buildBudgetInsights,
  evaluateBudgetAlerts,
  OVERALL_BUDGET_KEY,
} from '@/lib/utils/budgetUtils';
import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { BudgetItem } from '@/types/budget';

// ---------------------------------------------------------------------------
// Helpers — build minimal fixtures
// ---------------------------------------------------------------------------

function makeExpense(overrides: Partial<Expense> & { amount: number; date: Date }): Expense {
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    type: 'fixed',
    categoryId: 'cat1',
    categoryName: 'Affitto',
    ...overrides,
    amount: overrides.amount,
    currency: 'EUR',
    date: overrides.date as Date,
    createdAt: overrides.date as Date,
    updatedAt: overrides.date as Date,
  } as Expense;
}

function makeCategory(overrides: Partial<ExpenseCategory> & { id: string; name: string }): ExpenseCategory {
  return {
    userId: 'u1',
    type: 'fixed',
    subCategories: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ExpenseCategory;
}

// Build a monthly expense budget item with sensible defaults.
function makeItem(overrides: Partial<BudgetItem> & { id: string }): BudgetItem {
  return {
    kind: 'expense',
    scope: 'category',
    period: 'monthly',
    amount: 0,
    order: 0,
    ...overrides,
  } as BudgetItem;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TYPE_ITEM = makeItem({ id: 'b1', scope: 'type', expenseType: 'fixed', amount: 1000 });
const CAT_ITEM = makeItem({ id: 'b2', categoryId: 'cat1', categoryName: 'Affitto', amount: 800 });
const SUB_ITEM = makeItem({ id: 'b3', scope: 'subcategory', categoryId: 'cat1', subCategoryId: 'sub1', amount: 200, order: 1 });

// Expenses spread across Jan 2025, Mar 2025, Jan 2024, Mar 2024
const EXPENSES: Expense[] = [
  makeExpense({ type: 'fixed', categoryId: 'cat1', amount: -500, date: new Date(2025, 0, 10) }),
  makeExpense({ type: 'fixed', categoryId: 'cat1', amount: -300, date: new Date(2025, 0, 20) }),
  makeExpense({ type: 'variable', categoryId: 'cat2', amount: -200, date: new Date(2025, 2, 5) }),
  makeExpense({ type: 'fixed', categoryId: 'cat1', amount: -600, date: new Date(2024, 0, 15) }),
  makeExpense({ type: 'fixed', categoryId: 'cat1', amount: -400, date: new Date(2024, 2, 1) }),
  makeExpense({ type: 'income', categoryId: 'cat3', amount: 3000, date: new Date(2025, 0, 1) }),
  makeExpense({ type: 'fixed', categoryId: 'cat1', subCategoryId: 'sub1', amount: -150, date: new Date(2025, 0, 5) }),
];

// ---------------------------------------------------------------------------
describe('getActualForItem — type scope', () => {
  it('sums absolute amounts for matching type and year', () => {
    // 2025 fixed cat1: 500 + 300 + 150 (sub1 also has type=fixed, cat1) = 950
    expect(getActualForItem(TYPE_ITEM, EXPENSES, 2025)).toBeCloseTo(950);
  });

  it('returns 0 when no expenses in year', () => {
    expect(getActualForItem(TYPE_ITEM, EXPENSES, 2020)).toBe(0);
  });

  it('never matches income expenses for an expense item', () => {
    const incomeOnly: Expense[] = [
      makeExpense({ type: 'income', categoryId: 'cat3', amount: 5000, date: new Date(2025, 0, 1) }),
    ];
    expect(getActualForItem(TYPE_ITEM, incomeOnly, 2025)).toBe(0);
  });
});

describe('getActualForItem — income type scope', () => {
  it('matches only positive income transactions', () => {
    const incomeItem = makeItem({ id: 'i1', kind: 'income', scope: 'type', expenseType: 'income', amount: 2500 });
    expect(getActualForItem(incomeItem, EXPENSES, 2025)).toBeCloseTo(3000);
  });
});

describe('getActualForItem — category scope', () => {
  it('sums expenses for matching categoryId regardless of type', () => {
    expect(getActualForItem(CAT_ITEM, EXPENSES, 2025)).toBeCloseTo(950);
  });

  it('excludes other categories', () => {
    const otherCat = makeItem({ id: 'x', categoryId: 'cat2' });
    expect(getActualForItem(otherCat, EXPENSES, 2025)).toBeCloseTo(200);
  });
});

describe('getActualForItem — subcategory scope', () => {
  it('sums only expenses matching both categoryId and subCategoryId', () => {
    expect(getActualForItem(SUB_ITEM, EXPENSES, 2025)).toBeCloseTo(150);
  });

  it('returns 0 when subCategoryId does not match', () => {
    expect(getActualForItem({ ...SUB_ITEM, subCategoryId: 'sub99' }, EXPENSES, 2025)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('getMonthlyActualsForItem', () => {
  it('returns array of 12 entries', () => {
    expect(getMonthlyActualsForItem(TYPE_ITEM, EXPENSES, 2025)).toHaveLength(12);
  });

  it('correctly assigns spending to month index (0-based)', () => {
    const result = getMonthlyActualsForItem(TYPE_ITEM, EXPENSES, 2025);
    expect(result[0]).toBeCloseTo(950); // January
    expect(result[2]).toBe(0); // March (the 200 is cat2/variable)
    expect(result.filter((_, i) => i !== 0).every((v) => v === 0)).toBe(true);
  });
});

describe('getMonthActualForItem', () => {
  it('returns the total for a single month/year', () => {
    expect(getMonthActualForItem(CAT_ITEM, EXPENSES, 2025, 1)).toBeCloseTo(950);
    expect(getMonthActualForItem(CAT_ITEM, EXPENSES, 2025, 2)).toBe(0);
  });
});

describe('getMonthlyTotalExpenses', () => {
  it('sums all spending in a month, excluding income and transfers', () => {
    // Jan 2025: 500 + 300 + 150 (sub) = 950; the +3000 income is excluded
    expect(getMonthlyTotalExpenses(EXPENSES, 2025, 1)).toBeCloseTo(950);
    // March 2025: only the cat2 variable expense
    expect(getMonthlyTotalExpenses(EXPENSES, 2025, 3)).toBeCloseTo(200);
  });
});

describe('getPeriodActual', () => {
  it('uses the current month for a monthly budget', () => {
    const monthly = makeItem({ id: 'm', categoryId: 'cat1', period: 'monthly' });
    expect(getPeriodActual(monthly, EXPENSES, new Date(2025, 0, 15, 12))).toBeCloseTo(950); // Jan
    expect(getPeriodActual(monthly, EXPENSES, new Date(2025, 5, 15, 12))).toBe(0); // June
  });

  it('uses the whole year (YTD) for an annual budget', () => {
    const annual = makeItem({ id: 'a', categoryId: 'cat1', period: 'annual' });
    expect(getPeriodActual(annual, EXPENSES, new Date(2025, 5, 15, 12))).toBeCloseTo(950); // full 2025
  });
});

// ---------------------------------------------------------------------------
describe('getDefaultAmount', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns previous year annual total / 12 for a monthly budget', () => {
    const partial = { kind: 'expense', scope: 'type', expenseType: 'fixed' } as const;
    expect(getDefaultAmount(partial, EXPENSES, 2024)).toBeCloseTo(950 / 12, 1);
  });

  it('returns the full previous-year total for an annual budget', () => {
    const partial = { kind: 'expense', scope: 'type', expenseType: 'fixed' } as const;
    expect(getDefaultAmount(partial, EXPENSES, 2024, 'annual')).toBeCloseTo(950, 1);
  });

  it('falls back to earlier year if previous year has no data', () => {
    const partial = { kind: 'expense', scope: 'category', categoryId: 'cat2' } as const;
    expect(getDefaultAmount(partial, EXPENSES, 2024)).toBeCloseTo(200 / 12, 1);
  });

  it('returns 0 when no historical data exists', () => {
    const partial = { kind: 'expense', scope: 'category', categoryId: 'cat_unknown' } as const;
    expect(getDefaultAmount(partial, EXPENSES, 2024)).toBe(0);
  });

  it('returns 0 when historyStartYear >= currentYear', () => {
    const partial = { kind: 'expense', scope: 'type', expenseType: 'fixed' } as const;
    expect(getDefaultAmount(partial, EXPENSES, 2026)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('buildBudgetComparison', () => {
  it('populates totals and arrays', () => {
    const result = buildBudgetComparison(TYPE_ITEM, EXPENSES, 2025, 2024);
    expect(result.currentYearTotal).toBeCloseTo(950);
    expect(result.previousYearTotal).toBeCloseTo(1000);
    expect(result.historicalAverage).toBeCloseTo(1000);
    expect(result.currentYearMonthly).toHaveLength(12);
  });

  it('computes budgetUsedRatio against the annual budget (monthly amount × 12)', () => {
    const result = buildBudgetComparison(TYPE_ITEM, EXPENSES, 2025, 2024);
    expect(result.budgetUsedRatio).toBeCloseTo(950 / 12000, 3);
  });

  it('uses the amount directly for an annual budget', () => {
    const annual = makeItem({ id: 'a', scope: 'type', expenseType: 'fixed', amount: 12000, period: 'annual' });
    const result = buildBudgetComparison(annual, EXPENSES, 2025, 2024);
    expect(result.budgetUsedRatio).toBeCloseTo(950 / 12000, 3);
  });
});

// ---------------------------------------------------------------------------
describe('reconcileBudgetItems', () => {
  const categories: ExpenseCategory[] = [
    makeCategory({ id: 'cat1', name: 'Affitto', type: 'fixed', subCategories: [{ id: 'sub1', name: 'Garage' }] }),
    makeCategory({ id: 'cat3', name: 'Stipendio', type: 'income' }),
  ];

  it('keeps a category item and refreshes its denormalized name', () => {
    const stale: BudgetItem = { ...CAT_ITEM, categoryName: 'Vecchio nome' };
    const result = reconcileBudgetItems(categories, [stale]);
    expect(result).toHaveLength(1);
    expect(result[0].categoryName).toBe('Affitto');
    expect(result[0].kind).toBe('expense');
  });

  it('derives income kind from an income category', () => {
    const incomeCat = makeItem({ id: 'i', categoryId: 'cat3', amount: 2000 });
    expect(reconcileBudgetItems(categories, [incomeCat])[0].kind).toBe('income');
  });

  it('drops items whose category was deleted', () => {
    const orphan = makeItem({ id: 'o', categoryId: 'gone', amount: 100 });
    expect(reconcileBudgetItems(categories, [orphan])).toHaveLength(0);
  });

  it('drops a subcategory item whose subcategory was deleted but keeps a valid one', () => {
    const orphanSub: BudgetItem = { ...SUB_ITEM, id: 'os', subCategoryId: 'gone' };
    const result = reconcileBudgetItems(categories, [{ ...SUB_ITEM }, orphanSub]);
    expect(result).toHaveLength(1);
    expect(result[0].subCategoryName).toBe('Garage');
  });

  it('never auto-creates items for categories without a budget', () => {
    expect(reconcileBudgetItems(categories, [])).toHaveLength(0);
  });

  it('always keeps type-scope items', () => {
    expect(reconcileBudgetItems(categories, [TYPE_ITEM])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe('validateBudgetAllocation', () => {
  const groceries = makeItem({ id: 'g', categoryId: 'c1', amount: 700 });
  const dining = makeItem({ id: 'd', categoryId: 'c2', amount: 500, order: 1 });
  const transport = makeItem({ id: 't', categoryId: 'c3', amount: 300, order: 2 });
  const salary = makeItem({ id: 's', kind: 'income', categoryId: 'c4', amount: 2500 });
  const vacationsAnnual = makeItem({ id: 'v', categoryId: 'c5', amount: 2000, period: 'annual' });

  it('is valid when allocation is within the overall budget', () => {
    const result = validateBudgetAllocation([groceries, dining, transport], 2000);
    expect(result.valid).toBe(true);
    expect(result.allocated).toBe(1500);
    expect(result.available).toBe(500);
  });

  it('is invalid when category budgets exceed the overall budget', () => {
    const result = validateBudgetAllocation([groceries, dining, transport], 1000);
    expect(result.valid).toBe(false);
    expect(result.available).toBe(-500);
  });

  it('ignores income budgets in the allocation', () => {
    expect(validateBudgetAllocation([groceries, salary], 2000).allocated).toBe(700);
  });

  it('excludes subcategory budgets from the allocation sum', () => {
    expect(validateBudgetAllocation([groceries, SUB_ITEM], 1000).allocated).toBe(700);
  });

  it('excludes annual budgets from the monthly allocation sum', () => {
    expect(validateBudgetAllocation([groceries, vacationsAnnual], 1000).allocated).toBe(700);
  });

  it('is always valid when no overall budget is set', () => {
    expect(validateBudgetAllocation([groceries, dining], undefined).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('buildSpendingForecast', () => {
  // March 2026 has 31 days; mid-day on the 15th avoids timezone day-boundary drift.
  const now = new Date(2026, 2, 15, 12);

  it('projects end-of-month total at the current daily pace', () => {
    const forecast = buildSpendingForecast(1500, 2000, now);
    expect(forecast.daysInMonth).toBe(31);
    expect(forecast.daysElapsed).toBe(15);
    expect(forecast.projectedTotal).toBeCloseTo((1500 / 15) * 31); // 3100
    expect(forecast.remainingBudget).toBeCloseTo(2000 - 3100); // -1100
    expect(forecast.estimatedOverspend).toBeCloseTo(1100);
  });

  it('computes a daily allowance from the budget left over remaining days', () => {
    const forecast = buildSpendingForecast(1500, 2000, now);
    expect(forecast.dailyAllowance).toBeCloseTo(500 / 16);
  });

  it('reports zero daily allowance when the budget is already exhausted', () => {
    const forecast = buildSpendingForecast(2500, 2000, now);
    expect(forecast.dailyAllowance).toBe(0);
    expect(forecast.estimatedOverspend).toBeGreaterThan(0);
  });

  it('shrinks the projection toward the historical pace early in the month', () => {
    const early = new Date(2026, 2, 5, 12); // day 5 of 31
    const naive = buildSpendingForecast(500, 2000, early).projectedTotal; // 100/day × 31 = 3100
    const blended = buildSpendingForecast(500, 2000, early, 1200).projectedTotal;
    expect(naive).toBeCloseTo(3100);
    expect(blended).toBeLessThan(naive);
    expect(blended).toBeGreaterThan(500);
    // confidence = 5/31; blended daily = 5/31·100 + 26/31·(1200/31)
    expect(blended).toBeCloseTo(500 + ((5 / 31) * 100 + (26 / 31) * (1200 / 31)) * 26, 0);
  });
});

// ---------------------------------------------------------------------------
describe('buildBudgetInsights and evaluateBudgetAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 12)); // March 15 2026
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const groceries = makeItem({ id: 'g', categoryId: 'c1', categoryName: 'Spesa', amount: 400 });
  const dining = makeItem({ id: 'd', categoryId: 'c2', categoryName: 'Ristoranti', amount: 300, order: 1 });

  // March 2026: groceries 600 (over pace), dining 90 (on track), 110 in a NON-budgeted
  // category and 2000 income (must be excluded from the overall total).
  const marchExpenses: Expense[] = [
    makeExpense({ categoryId: 'c1', amount: -600, date: new Date(2026, 2, 10) }),
    makeExpense({ categoryId: 'c2', amount: -90, date: new Date(2026, 2, 8) }),
    makeExpense({ categoryId: 'c3', amount: -110, date: new Date(2026, 2, 12) }),
    makeExpense({ type: 'income', categoryId: 'inc', amount: 2000, date: new Date(2026, 2, 3) }),
    // prior month (Feb) spending for the trailing average
    makeExpense({ categoryId: 'c1', amount: -300, date: new Date(2026, 1, 5) }),
    makeExpense({ categoryId: 'c2', amount: -100, date: new Date(2026, 1, 5) }),
  ];

  it('identifies the top spending category this month', () => {
    const insights = buildBudgetInsights([groceries, dining], marchExpenses);
    expect(insights.topCategory?.label).toBe('Spesa');
    expect(insights.topCategory?.amount).toBeCloseTo(600);
  });

  it('flags categories whose projection exceeds their budget', () => {
    const insights = buildBudgetInsights([groceries, dining], marchExpenses);
    const labels = insights.categoriesAtRisk.map((c) => c.label);
    expect(labels).toContain('Spesa');
    expect(labels).not.toContain('Ristoranti');
  });

  it('computes the trailing prior-months average', () => {
    const insights = buildBudgetInsights([groceries, dining], marchExpenses);
    expect(insights.priorMonthsAverage).toBeCloseTo(200); // Jan 0 + Feb 400 over 2 months
  });

  it('prorates the prior-months average to the current day for the comparison', () => {
    const insights = buildBudgetInsights([groceries, dining], marchExpenses);
    expect(insights.expectedSpendToDate).toBeCloseTo(200 * (15 / 31), 1);
  });

  it('does not flag categories at risk in the first few days of the month', () => {
    const day3 = new Date(2026, 2, 3, 12); // before MIN_FORECAST_DAYS
    const expenses: Expense[] = [makeExpense({ categoryId: 'c1', amount: -600, date: new Date(2026, 2, 1) })];
    const insights = buildBudgetInsights([groceries], expenses, day3);
    expect(insights.categoriesAtRisk).toHaveLength(0);
  });

  it('fires an exceeded alert for an over-budget monthly category', () => {
    const alerts = evaluateBudgetAlerts([groceries, dining], undefined, marchExpenses);
    const grocery = alerts.find((a) => a.label === 'Spesa');
    expect(grocery?.level).toBe('exceeded');
    expect(grocery?.threshold).toBe(100);
  });

  it('fires a forecasted-overrun alert before a monthly budget is actually exceeded', () => {
    const fast: Expense[] = [makeExpense({ categoryId: 'c2', amount: -200, date: new Date(2026, 2, 14) })];
    const alerts = evaluateBudgetAlerts([dining], undefined, fast);
    const dinner = alerts.find((a) => a.label === 'Ristoranti');
    expect(dinner?.forecastedOverrun).toBe(true);
    expect(dinner?.level).toBe('warning');
  });

  it('evaluates an annual budget against year-to-date spend without a linear forecast', () => {
    // Annual Spesa budget 1000; YTD 2026 c1 = 600 (Mar) + 300 (Feb) = 900 → 90% warning
    const annualGroceries = makeItem({ id: 'ga', categoryId: 'c1', categoryName: 'Spesa', amount: 1000, period: 'annual' });
    const alerts = evaluateBudgetAlerts([annualGroceries], undefined, marchExpenses);
    const alert = alerts.find((a) => a.label === 'Spesa');
    expect(alert?.level).toBe('warning');
    expect(alert?.threshold).toBe(90);
    expect(alert?.forecastedOverrun).toBe(false);
    expect(alert?.spent).toBeCloseTo(900);
  });

  it('measures the overall budget against ALL month spending, not just budgeted categories', () => {
    const alerts = evaluateBudgetAlerts([groceries, dining], 500, marchExpenses);
    const overall = alerts.find((a) => a.key === OVERALL_BUDGET_KEY);
    expect(overall?.spent).toBeCloseTo(800); // 600 + 90 + 110; income excluded
    expect(overall?.level).toBe('exceeded');
  });
});
