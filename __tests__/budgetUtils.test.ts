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
  getPeriodExpensesForItem,
  getDefaultAmount,
  buildBudgetComparison,
  reconcileBudgetItems,
  validateBudgetAllocation,
  buildSpendingForecast,
  collectMonthItemSpending,
  collectMonthSpending,
  findCrossingDay,
  projectCrossingDay,
  resolveBudgetCalendar,
  rankCategoriesAtRisk,
  resolveItemPace,
  splitMonthActualForItem,
  splitMonthlyTotalExpenses,
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
describe('getPeriodExpensesForItem', () => {
  it('returns the current-month matching expenses for a monthly budget, sorted by amount desc', () => {
    const monthly = makeItem({ id: 'm', categoryId: 'cat1', period: 'monthly' });
    const result = getPeriodExpensesForItem(monthly, EXPENSES, new Date(2025, 0, 15, 12)); // Jan
    expect(result.map((e) => Math.abs(e.amount))).toEqual([500, 300, 150]);
  });

  it('returns no expenses for a month with no matching spend', () => {
    const monthly = makeItem({ id: 'm', categoryId: 'cat1', period: 'monthly' });
    expect(getPeriodExpensesForItem(monthly, EXPENSES, new Date(2025, 5, 15, 12))).toEqual([]); // June
  });

  it('returns the whole year (YTD) matching expenses for an annual budget', () => {
    const annual = makeItem({ id: 'a', categoryId: 'cat1', period: 'annual' });
    const result = getPeriodExpensesForItem(annual, EXPENSES, new Date(2025, 5, 15, 12));
    expect(result.map((e) => Math.abs(e.amount))).toEqual([500, 300, 150]);
  });

  it('reconciles exactly with getPeriodActual for the same item and date', () => {
    const annual = makeItem({ id: 'a', categoryId: 'cat1', period: 'annual' });
    const now = new Date(2025, 5, 15, 12);
    const listed = getPeriodExpensesForItem(annual, EXPENSES, now).reduce(
      (sum, e) => sum + Math.abs(e.amount),
      0
    );
    expect(listed).toBeCloseTo(getPeriodActual(annual, EXPENSES, now));
  });

  it('excludes transfers', () => {
    const monthly = makeItem({ id: 'm', categoryId: 'cat1', period: 'monthly' });
    const withTransfer = [
      ...EXPENSES,
      makeExpense({ type: 'transfer', categoryId: 'cat1', amount: -999, date: new Date(2025, 0, 8) }),
    ];
    const result = getPeriodExpensesForItem(monthly, withTransfer, new Date(2025, 0, 15, 12));
    expect(result.some((e) => e.type === 'transfer')).toBe(false);
    expect(result.map((e) => Math.abs(e.amount))).toEqual([500, 300, 150]);
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
describe('splitMonthlyTotalExpenses and splitMonthActualForItem', () => {
  // March 15th 2026 at noon: rows up to today are booked, a row on the 27th is scheduled.
  const now = new Date(2026, 2, 15, 12);
  const groceries = makeItem({ id: 'g', categoryId: 'c1', categoryName: 'Spesa', amount: 400 });
  const expenses: Expense[] = [
    makeExpense({ categoryId: 'c1', amount: -300, date: new Date(2026, 2, 10) }),
    makeExpense({ categoryId: 'c1', amount: -50, date: new Date(2026, 2, 27) }), // recurring, still ahead
    makeExpense({ categoryId: 'c2', amount: -90, date: new Date(2026, 2, 8) }),
    makeExpense({ type: 'income', categoryId: 'inc', amount: 2000, date: new Date(2026, 2, 3) }),
    makeExpense({ type: 'transfer', categoryId: 'c1', amount: -500, date: new Date(2026, 2, 9) }),
  ];

  it('splits the month total at today, income and transfers out', () => {
    expect(splitMonthlyTotalExpenses(expenses, 2026, 3, now)).toEqual({ spentToDate: 390, scheduled: 50 });
  });

  it('splits one item the same way', () => {
    expect(splitMonthActualForItem(groceries, expenses, 2026, 3, now)).toEqual({ spentToDate: 300, scheduled: 50 });
  });

  it('a midnight row dated today is booked, not scheduled', () => {
    const today = [makeExpense({ categoryId: 'c1', amount: -20, date: new Date(2026, 2, 15) })];
    expect(splitMonthActualForItem(groceries, today, 2026, 3, now).spentToDate).toBe(20);
  });
});

// ---------------------------------------------------------------------------
describe('findCrossingDay and projectCrossingDay', () => {
  it('names the first day the running total exceeds the limit, rows summed by day', () => {
    const entries = [
      { day: 1, amount: 1150 },
      { day: 13, amount: 900 },
      { day: 13, amount: 1000 }, // the two of the 13th cross together
      { day: 20, amount: 50 },
    ];
    expect(findCrossingDay(entries, 3000)).toBe(13);
    expect(findCrossingDay(entries, 2050)).toBe(13); // 1150 + 1900 = 3050 > 2050 on the 13th
    expect(findCrossingDay(entries, 3100)).toBeNull();
    expect(findCrossingDay(entries, 0)).toBeNull();
  });

  it('crosses only when the total goes PAST the limit', () => {
    expect(findCrossingDay([{ day: 5, amount: 100 }], 100)).toBeNull();
    expect(findCrossingDay([{ day: 5, amount: 100.01 }], 100)).toBe(5);
  });

  it('collects the month spending rows by Italian calendar day, income and transfers out', () => {
    const expenses: Expense[] = [
      makeExpense({ categoryId: 'c1', amount: -300, date: new Date(2026, 2, 10) }),
      makeExpense({ categoryId: 'c2', amount: -90, date: new Date(2026, 2, 10, 23, 30) }),
      makeExpense({ type: 'income', categoryId: 'inc', amount: 2000, date: new Date(2026, 2, 3) }),
      makeExpense({ type: 'transfer', categoryId: 'c1', amount: -500, date: new Date(2026, 2, 9) }),
      makeExpense({ categoryId: 'c1', amount: -10, date: new Date(2026, 3, 1) }),
    ];
    expect(collectMonthSpending(expenses, 2026, 3)).toEqual([
      { day: 10, amount: 300 },
      { day: 10, amount: 90 },
    ]);
    const groceries = makeItem({ id: 'g', categoryId: 'c1', amount: 400 });
    expect(collectMonthItemSpending(groceries, expenses, 2026, 3)).toEqual([{ day: 10, amount: 300 }]);
  });

  it('projects the day the pace crosses the limit, scheduled rows landing on their own day', () => {
    const calendar = resolveBudgetCalendar(new Date(2026, 2, 15, 12)); // day 15 of 31
    // 1500 by the 15th → 100/day: 2000 is crossed on the 21st (2100 > 2000).
    expect(projectCrossingDay(1500, [], 2000, calendar)).toBe(21);
    // A 300 € instalment on the 18th brings the crossing forward to the 18th (1800 + 300).
    expect(projectCrossingDay(1500, [{ day: 18, amount: 300 }], 2000, calendar)).toBe(18);
    // A limit the pace never reaches this month: null.
    expect(projectCrossingDay(1500, [], 5000, calendar)).toBeNull();
  });

  it('has no projected crossing before the fourth day or on the last day', () => {
    expect(projectCrossingDay(900, [], 1000, resolveBudgetCalendar(new Date(2026, 2, 2, 12)))).toBeNull();
    expect(projectCrossingDay(900, [], 1000, resolveBudgetCalendar(new Date(2026, 2, 31, 12)))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('resolveItemPace', () => {
  const fixedCat = makeCategory({ id: 'c-home', name: 'Casa', type: 'fixed' });
  const variableCat = makeCategory({ id: 'c1', name: 'Spesa', type: 'variable' });

  it('a fixed or debt category does not follow the pace; a variable one does', () => {
    expect(resolveItemPace(makeItem({ id: 'h', categoryId: 'c-home' }), [fixedCat, variableCat])).toBe('fixed');
    expect(resolveItemPace(makeItem({ id: 'g', categoryId: 'c1' }), [fixedCat, variableCat])).toBe('variable');
    expect(resolveItemPace(makeItem({ id: 't', scope: 'type', expenseType: 'debt' }), [])).toBe('fixed');
    expect(resolveItemPace(makeItem({ id: 'v', scope: 'type', expenseType: 'variable' }), [])).toBe('variable');
  });

  it('an unknown category reads as variable — the conservative pace', () => {
    expect(resolveItemPace(makeItem({ id: 'x', categoryId: 'gone' }), [fixedCat])).toBe('variable');
  });
});

// ---------------------------------------------------------------------------
describe('buildSpendingForecast', () => {
  // March 2026 has 31 days; mid-day on the 15th avoids timezone day-boundary drift.
  const now = new Date(2026, 2, 15, 12);

  it('projects end-of-month total at the current daily pace on what is booked to date', () => {
    const forecast = buildSpendingForecast({ spentToDate: 1500, scheduled: 0 }, 2000, now);
    expect(forecast.daysInMonth).toBe(31);
    expect(forecast.daysElapsed).toBe(15);
    expect(forecast.spentSoFar).toBe(1500);
    expect(forecast.projectedTotal).toBeCloseTo((1500 / 15) * 31); // 3100
    expect(forecast.remainingBudget).toBeCloseTo(2000 - 3100); // -1100
    expect(forecast.estimatedOverspend).toBeCloseTo(1100);
  });

  it('adds a scheduled row as it is, never scaled by the days left (the app rule)', () => {
    const forecast = buildSpendingForecast({ spentToDate: 1500, scheduled: 200 }, 2000, now);
    expect(forecast.spentSoFar).toBe(1700);
    expect(forecast.projectedTotal).toBeCloseTo((1500 / 15) * 31 + 200);
  });

  it('a fixed pace projects nothing beyond what is booked', () => {
    const forecast = buildSpendingForecast({ spentToDate: 1150, scheduled: 100 }, 1300, now, 'fixed');
    expect(forecast.projectedTotal).toBe(1250);
    expect(forecast.estimatedOverspend).toBe(0);
  });

  it('computes a daily allowance from the budget left over remaining days', () => {
    const forecast = buildSpendingForecast({ spentToDate: 1500, scheduled: 0 }, 2000, now);
    expect(forecast.dailyAllowance).toBeCloseTo(500 / 16);
  });

  it('reports zero daily allowance when the budget is already exhausted', () => {
    const forecast = buildSpendingForecast({ spentToDate: 2500, scheduled: 0 }, 2000, now);
    expect(forecast.dailyAllowance).toBe(0);
    expect(forecast.estimatedOverspend).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe('rankCategoriesAtRisk and evaluateBudgetAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15, 12)); // March 15 2026
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const groceries = makeItem({ id: 'g', categoryId: 'c1', categoryName: 'Spesa', amount: 400 });
  const dining = makeItem({ id: 'd', categoryId: 'c2', categoryName: 'Ristoranti', amount: 300, order: 1 });
  const rent = makeItem({ id: 'r', categoryId: 'c-home', categoryName: 'Casa', amount: 1300, order: 2 });
  const categories = [
    makeCategory({ id: 'c1', name: 'Spesa', type: 'variable' }),
    makeCategory({ id: 'c2', name: 'Ristoranti', type: 'variable' }),
    makeCategory({ id: 'c-home', name: 'Casa', type: 'fixed' }),
  ];

  // March 2026: groceries 600 (over pace), dining 90 (on track), rent 1150 paid on the 1st
  // (a fixed charge), 110 in a NON-budgeted category and 2000 income (excluded from the total).
  const marchExpenses: Expense[] = [
    makeExpense({ categoryId: 'c1', amount: -600, date: new Date(2026, 2, 10) }),
    makeExpense({ categoryId: 'c2', amount: -90, date: new Date(2026, 2, 8) }),
    makeExpense({ categoryId: 'c-home', type: 'fixed', amount: -1150, date: new Date(2026, 2, 1) }),
    makeExpense({ categoryId: 'c3', amount: -110, date: new Date(2026, 2, 12) }),
    makeExpense({ type: 'income', categoryId: 'inc', amount: 2000, date: new Date(2026, 2, 3) }),
  ];

  it('flags categories whose projection exceeds their budget, largest overrun first', () => {
    // 600 spent on a 700 budget: not over yet, but 600/15×31 = 1240 by month end.
    const wideGroceries = { ...groceries, amount: 700 };
    const risk = rankCategoriesAtRisk([wideGroceries, dining, rent], marchExpenses, undefined, categories);
    expect(risk.atRisk.map((c) => c.label)).toEqual(['Spesa']);
    expect(risk.atRisk[0].overBy).toBeCloseTo((600 / 15) * 31 - 700);
    expect(risk.evaluated).toBe(3);
    expect(risk.canForecast).toBe(true);
  });

  it('never flags a fixed category by pace: rent paid on the 1st is not "at risk" all month', () => {
    const withPace = rankCategoriesAtRisk([rent], marchExpenses, undefined, []); // unknown category → variable
    expect(withPace.atRisk.map((c) => c.label)).toEqual(['Casa']);
    const fixed = rankCategoriesAtRisk([rent], marchExpenses, undefined, categories);
    expect(fixed.atRisk).toHaveLength(0);
  });

  it('a budget already exceeded is a fact for the alerts, not a risk', () => {
    const subs = makeItem({ id: 'a', categoryId: 'c2', categoryName: 'Abbonamenti', amount: 50 });
    const over: Expense[] = [makeExpense({ categoryId: 'c2', amount: -58, date: new Date(2026, 2, 2) })];
    const risk = rankCategoriesAtRisk([subs], over, undefined, categories);
    expect(risk.atRisk).toHaveLength(0);
    expect(evaluateBudgetAlerts([subs], undefined, over, [90, 100]).find((a) => a.label === 'Abbonamenti')?.level).toBe('exceeded');
  });

  it('does not flag categories at risk in the first few days of the month', () => {
    const day3 = new Date(2026, 2, 3, 12); // before MIN_FORECAST_DAYS
    const expenses: Expense[] = [makeExpense({ categoryId: 'c1', amount: -600, date: new Date(2026, 2, 1) })];
    const risk = rankCategoriesAtRisk([groceries], expenses, day3, categories);
    expect(risk.atRisk).toHaveLength(0);
    expect(risk.canForecast).toBe(false);
    expect(risk.evaluated).toBe(1);
  });

  it('skips subcategory slices and annual budgets', () => {
    const slice = makeItem({ id: 's', scope: 'subcategory', categoryId: 'c1', subCategoryId: 'x', amount: 10 });
    const annual = makeItem({ id: 'a', categoryId: 'c1', amount: 100, period: 'annual' });
    const risk = rankCategoriesAtRisk([slice, annual], marchExpenses, undefined, categories);
    expect(risk.evaluated).toBe(0);
    expect(risk.atRisk).toHaveLength(0);
  });

  it('fires an exceeded alert for an over-budget monthly category, with the day it went over', () => {
    const alerts = evaluateBudgetAlerts([groceries, dining], undefined, marchExpenses);
    const grocery = alerts.find((a) => a.label === 'Spesa');
    expect(grocery?.level).toBe('exceeded');
    expect(grocery?.threshold).toBe(100);
    expect(grocery?.thresholdCrossed).toBe(true);
    expect(grocery?.crossedOn).toBe(10);
  });

  it('fires a forecasted-overrun alert before a monthly budget is actually exceeded', () => {
    const fast: Expense[] = [makeExpense({ categoryId: 'c2', amount: -200, date: new Date(2026, 2, 14) })];
    const alerts = evaluateBudgetAlerts([dining], undefined, fast, [90, 100]);
    const dinner = alerts.find((a) => a.label === 'Ristoranti');
    expect(dinner?.forecastedOverrun).toBe(true);
    expect(dinner?.level).toBe('warning');
    expect(dinner?.thresholdCrossed).toBe(false);
  });

  it('a fixed category fires on its threshold, never on a pace', () => {
    const alerts = evaluateBudgetAlerts([rent], undefined, marchExpenses, [50, 75, 90, 100], undefined, categories);
    const casa = alerts.find((a) => a.label === 'Casa');
    expect(casa?.threshold).toBe(75); // 1150/1300 = 88%
    expect(casa?.forecastedOverrun).toBe(false);
  });

  it('evaluates an annual budget against year-to-date spend without a linear forecast', () => {
    // Annual Spesa budget 1000; YTD 2026 c1 = 600 (Mar) + 300 (Feb) = 900 → 90% warning
    const annualGroceries = makeItem({ id: 'ga', categoryId: 'c1', categoryName: 'Spesa', amount: 1000, period: 'annual' });
    const withFeb = [...marchExpenses, makeExpense({ categoryId: 'c1', amount: -300, date: new Date(2026, 1, 5) })];
    const alerts = evaluateBudgetAlerts([annualGroceries], undefined, withFeb);
    const alert = alerts.find((a) => a.label === 'Spesa');
    expect(alert?.level).toBe('warning');
    expect(alert?.threshold).toBe(90);
    expect(alert?.forecastedOverrun).toBe(false);
    expect(alert?.spent).toBeCloseTo(900);
  });

  it('measures the overall budget against ALL month spending, not just budgeted categories', () => {
    const alerts = evaluateBudgetAlerts([groceries, dining], 1500, marchExpenses);
    const overall = alerts.find((a) => a.key === OVERALL_BUDGET_KEY);
    expect(overall?.spent).toBeCloseTo(1950); // 600 + 90 + 1150 + 110; income excluded
    expect(overall?.level).toBe('exceeded');
    expect(overall?.crossedOn).toBe(10); // 1150 (1st) + 90 (8th) + 600 (10th) = 1840 > 1500
  });
});
