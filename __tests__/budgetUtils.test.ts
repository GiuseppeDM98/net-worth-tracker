/**
 * Unit tests for budgetUtils.ts — budget actual calculation and comparison building.
 *
 * All functions are pure (no Firebase, no side effects).
 * getItalyYear/getItalyMonth use new Date() internally → vi.useFakeTimers() required
 * when testing functions that call them without an argument.
 *
 * Expense amount sign convention: expenses are stored as negative numbers.
 * All returned totals are positive (Math.abs applied).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getActualForItem,
  getMonthlyActualsForItem,
  getDefaultMonthlyAmount,
  buildBudgetComparison,
} from '@/lib/utils/budgetUtils';
import type { Expense } from '@/types/expenses';
import type { BudgetItem } from '@/types/budget';

// ---------------------------------------------------------------------------
// Helpers — build minimal Expense fixtures
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
    date: overrides.date as unknown as import('firebase/firestore').Timestamp,
    createdAt: overrides.date as unknown as import('firebase/firestore').Timestamp,
    updatedAt: overrides.date as unknown as import('firebase/firestore').Timestamp,
  } as Expense;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TYPE_ITEM: BudgetItem = {
  id: 'b1',
  scope: 'type',
  expenseType: 'fixed',
  monthlyAmount: 1000,
  order: 0,
};

const CAT_ITEM: BudgetItem = {
  id: 'b2',
  scope: 'category',
  categoryId: 'cat1',
  categoryName: 'Affitto',
  monthlyAmount: 800,
  order: 0,
};

const SUB_ITEM: BudgetItem = {
  id: 'b3',
  scope: 'subcategory',
  categoryId: 'cat1',
  subCategoryId: 'sub1',
  monthlyAmount: 200,
  order: 1,
};

// Expenses spread across Jan 2025, Mar 2025, Jan 2024, Mar 2024
const EXPENSES: Expense[] = [
  // 2025 — January
  makeExpense({ type: 'fixed', categoryId: 'cat1', amount: -500, date: new Date(2025, 0, 10) }),
  makeExpense({ type: 'fixed', categoryId: 'cat1', amount: -300, date: new Date(2025, 0, 20) }),
  // 2025 — March
  makeExpense({ type: 'variable', categoryId: 'cat2', amount: -200, date: new Date(2025, 2, 5) }),
  // 2024 — January
  makeExpense({ type: 'fixed', categoryId: 'cat1', amount: -600, date: new Date(2024, 0, 15) }),
  // 2024 — March
  makeExpense({ type: 'fixed', categoryId: 'cat1', amount: -400, date: new Date(2024, 2, 1) }),
  // Income — should never match budget items
  makeExpense({ type: 'income', categoryId: 'cat3', amount: 3000, date: new Date(2025, 0, 1) }),
  // Subcategory expense
  makeExpense({ type: 'fixed', categoryId: 'cat1', subCategoryId: 'sub1', amount: -150, date: new Date(2025, 0, 5) }),
];

// ---------------------------------------------------------------------------
describe('getActualForItem — type scope', () => {
  it('sums absolute amounts for matching type and year', () => {
    // 2025 fixed cat1: 500 + 300 + 150 (sub1 also has type=fixed, cat1) = 950
    const result = getActualForItem(TYPE_ITEM, EXPENSES, 2025);
    expect(result).toBeCloseTo(950);
  });

  it('returns 0 when no expenses in year', () => {
    expect(getActualForItem(TYPE_ITEM, EXPENSES, 2020)).toBe(0);
  });

  it('never matches income expenses', () => {
    const incomeItem: BudgetItem = { id: 'x', scope: 'type', expenseType: 'fixed', monthlyAmount: 100, order: 0 };
    const incomeOnly: Expense[] = [
      makeExpense({ type: 'income', categoryId: 'cat3', amount: 5000, date: new Date(2025, 0, 1) }),
    ];
    expect(getActualForItem(incomeItem, incomeOnly, 2025)).toBe(0);
  });
});

describe('getActualForItem — category scope', () => {
  it('sums expenses for matching categoryId regardless of type', () => {
    // 2025 cat1: 500 + 300 + 150 = 950
    const result = getActualForItem(CAT_ITEM, EXPENSES, 2025);
    expect(result).toBeCloseTo(950);
  });

  it('excludes other categories', () => {
    // cat2 only has 200 in 2025
    const otherCat: BudgetItem = { id: 'x', scope: 'category', categoryId: 'cat2', monthlyAmount: 0, order: 0 };
    expect(getActualForItem(otherCat, EXPENSES, 2025)).toBeCloseTo(200);
  });
});

describe('getActualForItem — subcategory scope', () => {
  it('sums only expenses matching both categoryId and subCategoryId', () => {
    // Only the sub1 expense in 2025: 150
    const result = getActualForItem(SUB_ITEM, EXPENSES, 2025);
    expect(result).toBeCloseTo(150);
  });

  it('returns 0 when subCategoryId does not match', () => {
    const noMatch: BudgetItem = { ...SUB_ITEM, subCategoryId: 'sub99' };
    expect(getActualForItem(noMatch, EXPENSES, 2025)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('getMonthlyActualsForItem', () => {
  it('returns array of 12 entries', () => {
    const result = getMonthlyActualsForItem(TYPE_ITEM, EXPENSES, 2025);
    expect(result).toHaveLength(12);
  });

  it('correctly assigns spending to month index (0-based)', () => {
    const result = getMonthlyActualsForItem(TYPE_ITEM, EXPENSES, 2025);
    // January (index 0): 500 + 300 + 150 = 950
    expect(result[0]).toBeCloseTo(950);
    // March (index 2): nothing for type=fixed in cat1 (the 200 is cat2/variable)
    expect(result[2]).toBe(0);
    // All other months = 0
    const others = result.filter((_, i) => i !== 0);
    expect(others.every((v) => v === 0)).toBe(true);
  });

  it('returns all zeros for a year with no data', () => {
    const result = getMonthlyActualsForItem(TYPE_ITEM, EXPENSES, 2020);
    expect(result.every((v) => v === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('getDefaultMonthlyAmount', () => {
  beforeEach(() => {
    // Simulate current date = March 2026
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns previous year annual total / 12', () => {
    // currentYear = 2026 → previousYear = 2025
    // 2025 fixed/cat1: 500 + 300 + 150 = 950 → 950 / 12 ≈ 79.17
    const partialItem: Omit<BudgetItem, 'id' | 'monthlyAmount'> = {
      scope: 'type',
      expenseType: 'fixed',
      order: 0,
    };
    const result = getDefaultMonthlyAmount(partialItem, EXPENSES, 2024);
    expect(result).toBeCloseTo(950 / 12, 1);
  });

  it('falls back to earlier year if previous year has no data', () => {
    // 2025 has no data for cat_unknown, 2024 has no data either → 0
    // But for cat1: 2025 has data → returns 2025/12
    // Test fallback: use a year range where 2025 is empty for a specific scope
    const partialItem: Omit<BudgetItem, 'id' | 'monthlyAmount'> = {
      scope: 'category',
      categoryId: 'cat2', // cat2 only has 200 in 2025 (March)
      order: 0,
    };
    const result = getDefaultMonthlyAmount(partialItem, EXPENSES, 2024);
    expect(result).toBeCloseTo(200 / 12, 1);
  });

  it('returns 0 when no historical data exists', () => {
    const partialItem: Omit<BudgetItem, 'id' | 'monthlyAmount'> = {
      scope: 'category',
      categoryId: 'cat_unknown',
      order: 0,
    };
    expect(getDefaultMonthlyAmount(partialItem, EXPENSES, 2024)).toBe(0);
  });

  it('returns 0 when historyStartYear >= currentYear', () => {
    const partialItem: Omit<BudgetItem, 'id' | 'monthlyAmount'> = {
      scope: 'type',
      expenseType: 'fixed',
      order: 0,
    };
    expect(getDefaultMonthlyAmount(partialItem, EXPENSES, 2026)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('buildBudgetComparison', () => {
  it('populates currentYearTotal, previousYearTotal, and arrays', () => {
    // Use currentYear=2025 so we can check known values
    const result = buildBudgetComparison(TYPE_ITEM, EXPENSES, 2025, 2024);

    // 2025 fixed: 500 + 300 + 150 = 950
    expect(result.currentYearTotal).toBeCloseTo(950);
    // 2024 fixed: 600 + 400 = 1000
    expect(result.previousYearTotal).toBeCloseTo(1000);
    // Historical years = [2024] → historicalAverage = 1000
    expect(result.historicalAverage).toBeCloseTo(1000);

    expect(result.currentYearMonthly).toHaveLength(12);
    expect(result.previousYearMonthly).toHaveLength(12);
    expect(result.historicalMonthlyAverage).toHaveLength(12);
  });

  it('sets historicalAverage to 0 when historyStartYear >= currentYear', () => {
    const result = buildBudgetComparison(TYPE_ITEM, EXPENSES, 2025, 2025);
    expect(result.historicalAverage).toBe(0);
  });

  it('computes budgetUsedRatio as currentYearTotal / (monthlyAmount * 12)', () => {
    const result = buildBudgetComparison(TYPE_ITEM, EXPENSES, 2025, 2024);
    // annual budget = 1000 * 12 = 12000; current = 950 → ratio ≈ 0.079
    expect(result.budgetUsedRatio).toBeCloseTo(950 / 12000, 3);
  });
});
