import { describe, expect, it } from 'vitest';
import {
  buildExpenseComposition,
  buildIncomeComposition,
  buildSubCategoryComposition,
  detectSpendingAnomalies,
} from '@/lib/utils/cashflowComposition';
import { Expense, ExpenseType, NO_SUBCATEGORY_KEY, NO_SUBCATEGORY_LABEL } from '@/types/expenses';

function makeExpense(overrides: Partial<Expense> & { type: ExpenseType; amount: number }): Expense {
  return {
    id: 'e1',
    userId: 'u1',
    categoryId: 'cat-casa',
    categoryName: 'Casa',
    currency: 'EUR',
    date: new Date('2025-06-15T12:00:00Z'),
    createdAt: new Date('2025-06-15T12:00:00Z'),
    updatedAt: new Date('2025-06-15T12:00:00Z'),
    ...overrides,
  } as Expense;
}

/** The month resolver the component injects, simplified to plain UTC for the tests. */
const monthOf = (expense: Expense) => {
  const date = expense.date as Date;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
};

/** A row in `month` of 2025, so anomaly fixtures stay readable. */
function inMonth(month: number, overrides: Partial<Expense> & { type: ExpenseType; amount: number }): Expense {
  return makeExpense({ ...overrides, date: new Date(Date.UTC(2025, month - 1, 15)) });
}

describe('buildExpenseComposition', () => {
  it('should give two same-named categories of different types two rows', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'fixed', amount: -800, categoryId: 'cat-casa-fixed', categoryName: 'Casa' }),
      makeExpense({ type: 'variable', amount: -400, categoryId: 'cat-casa-var', categoryName: 'Casa' }),
    ];

    // Act
    const slices = buildExpenseComposition(expenses);

    // Assert — one merged 1.200 € row is what this replaces
    expect(slices).toHaveLength(2);
    expect(slices.map((slice) => [slice.name, slice.value])).toEqual([
      ['Casa (Spese Necessarie)', 800],
      ['Casa (Spese Non Necessarie)', 400],
    ]);
  });

  it('should carry the identity a drill-down needs on every slice', () => {
    // Arrange
    const expenses = [makeExpense({ type: 'fixed', amount: -800, categoryId: 'cat-casa-fixed', categoryName: 'Casa' })];

    // Act
    const [slice] = buildExpenseComposition(expenses);

    // Assert
    expect(slice.expenseType).toBe('fixed');
    expect(slice.categoryKey).toBe('cat-casa-fixed');
    expect(slice.key).toBe('fixed:cat-casa-fixed');
  });

  it('should leave a name that does not collide unqualified', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'fixed', amount: -800, categoryId: 'cat-casa', categoryName: 'Casa' }),
      makeExpense({ type: 'variable', amount: -400, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    ];

    // Act
    const slices = buildExpenseComposition(expenses);

    // Assert
    expect(slices.map((slice) => slice.name)).toEqual(['Casa', 'Cibo']);
  });

  it('should rank descending and have the shares add up', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'variable', amount: -100, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      makeExpense({ type: 'fixed', amount: -300, categoryId: 'cat-casa', categoryName: 'Casa' }),
    ];

    // Act
    const slices = buildExpenseComposition(expenses);

    // Assert
    expect(slices.map((slice) => slice.value)).toEqual([300, 100]);
    expect(slices.reduce((sum, slice) => sum + slice.percentage, 0)).toBeCloseTo(100, 6);
  });

  it('should exclude income and transfers', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'fixed', amount: -300, categoryId: 'cat-casa', categoryName: 'Casa' }),
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      makeExpense({ type: 'transfer', amount: 500, categoryId: 'cat-giro', categoryName: 'Trasferimenti' }),
    ];

    // Act
    const slices = buildExpenseComposition(expenses);

    // Assert
    expect(slices.map((slice) => slice.name)).toEqual(['Casa']);
  });

  it('should count a refund toward its category gross rather than netting it off', () => {
    // Arrange — same rule as expenseService.calculateTotalExpenses
    const expenses = [
      makeExpense({ type: 'variable', amount: -100, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      makeExpense({ type: 'variable', amount: 30, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    ];

    // Act
    const [slice] = buildExpenseComposition(expenses);

    // Assert
    expect(slice.value).toBe(130);
  });
});

describe('buildIncomeComposition', () => {
  it('should aggregate income by category document', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      makeExpense({ type: 'income', amount: 500, categoryId: 'cat-bonus', categoryName: 'Bonus' }),
      makeExpense({ type: 'fixed', amount: -300, categoryId: 'cat-casa', categoryName: 'Casa' }),
    ];

    // Act
    const slices = buildIncomeComposition(expenses);

    // Assert
    expect(slices.map((slice) => [slice.name, slice.value])).toEqual([
      ['Stipendio', 2000],
      ['Bonus', 500],
    ]);
  });

  it('should not qualify income labels with the type', () => {
    // Arrange — every row is income, so the qualifier would say nothing
    const expenses = [
      makeExpense({ type: 'income', amount: 900, categoryId: 'cat-a', categoryName: 'Affitto' }),
      makeExpense({ type: 'income', amount: 400, categoryId: 'cat-b', categoryName: 'Affitto' }),
    ];

    // Act
    const slices = buildIncomeComposition(expenses);

    // Assert
    expect(slices.map((slice) => slice.name)).toEqual(['Affitto', 'Affitto']);
    expect(new Set(slices.map((slice) => slice.key)).size).toBe(2);
  });
});

describe('buildSubCategoryComposition', () => {
  const expenses = [
    makeExpense({
      type: 'fixed',
      amount: -200,
      categoryId: 'cat-casa-fixed',
      categoryName: 'Casa',
      subCategoryId: 'sub-luce',
      subCategoryName: 'Elettricità',
    }),
    makeExpense({ type: 'fixed', amount: -50, categoryId: 'cat-casa-fixed', categoryName: 'Casa' }),
    makeExpense({
      type: 'variable',
      amount: -999,
      categoryId: 'cat-casa-var',
      categoryName: 'Casa',
      subCategoryId: 'sub-arredo',
      subCategoryName: 'Arredamento',
    }),
  ];

  it('should break down only the asked category, not its namesake', () => {
    // Act
    const slices = buildSubCategoryComposition(expenses, { expenseType: 'fixed', key: 'cat-casa-fixed' });

    // Assert
    expect(slices.map((slice) => [slice.name, slice.value])).toEqual([
      ['Elettricità', 200],
      [NO_SUBCATEGORY_LABEL, 50],
    ]);
  });

  it('should key the rows without a subcategory on the shared sentinel', () => {
    // Act
    const slices = buildSubCategoryComposition(expenses, { expenseType: 'fixed', key: 'cat-casa-fixed' });

    // Assert
    expect(slices.find((slice) => slice.name === NO_SUBCATEGORY_LABEL)?.key).toBe(NO_SUBCATEGORY_KEY);
  });

  it('should return nothing for a category with no rows of that type', () => {
    // Act
    const slices = buildSubCategoryComposition(expenses, { expenseType: 'debt', key: 'cat-casa-fixed' });

    // Assert
    expect(slices).toEqual([]);
  });
});

describe('detectSpendingAnomalies', () => {
  /** Six months of steady 100 € spending, then a spike, in one category. */
  function history(categoryId: string, categoryName: string, type: ExpenseType, spike: number): Expense[] {
    const baseline = [1, 2, 3, 4, 5, 6].map((month) =>
      inMonth(month, { id: `${categoryId}-${month}`, type, amount: -100, categoryId, categoryName })
    );
    return [...baseline, inMonth(7, { id: `${categoryId}-spike`, type, amount: -spike, categoryId, categoryName })];
  }

  it('should flag a category that ran well above its own average', () => {
    // Act
    const anomalies = detectSpendingAnomalies(history('cat-casa', 'Casa', 'fixed', 400), 2025, 7, monthOf);

    // Assert
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].categoryLabel).toBe('Casa');
    expect(anomalies[0].currentTotal).toBe(400);
    expect(anomalies[0].referenceAverage).toBe(100);
    expect(anomalies[0].deltaPercent).toBeCloseTo(300, 6);
  });

  it('should give two same-named categories independent baselines and distinct chips', () => {
    // Arrange — the fixed Casa spikes, the variable one does not
    const expenses = [
      ...history('cat-casa-fixed', 'Casa', 'fixed', 400),
      ...history('cat-casa-var', 'Casa', 'variable', 100),
    ];

    // Act
    const anomalies = detectSpendingAnomalies(expenses, 2025, 7, monthOf);

    // Assert
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].categoryLabel).toBe('Casa (Spese Necessarie)');
    expect(anomalies[0].categoryKey).toBe('cat-casa-fixed');
    expect(anomalies[0].expenseType).toBe('fixed');
  });

  it('should give every anomaly a unique key', () => {
    // Arrange — both spike, so both are flagged and both chips must be addressable
    const expenses = [
      ...history('cat-casa-fixed', 'Casa', 'fixed', 400),
      ...history('cat-casa-var', 'Casa', 'variable', 500),
    ];

    // Act
    const anomalies = detectSpendingAnomalies(expenses, 2025, 7, monthOf);

    // Assert
    expect(anomalies).toHaveLength(2);
    expect(new Set(anomalies.map((a) => a.key)).size).toBe(2);
  });

  it('should skip a category with too little history to have a baseline', () => {
    // Arrange — only two prior months
    const expenses = [
      inMonth(5, { type: 'fixed', amount: -100, categoryId: 'cat-new', categoryName: 'Nuova' }),
      inMonth(6, { type: 'fixed', amount: -100, categoryId: 'cat-new', categoryName: 'Nuova' }),
      inMonth(7, { type: 'fixed', amount: -900, categoryId: 'cat-new', categoryName: 'Nuova' }),
    ];

    // Act
    const anomalies = detectSpendingAnomalies(expenses, 2025, 7, monthOf);

    // Assert
    expect(anomalies).toEqual([]);
  });

  it('should not flag an increase that is large in percent but small in euros', () => {
    // Act — 100 → 140 is +40%, but only +40 €
    const anomalies = detectSpendingAnomalies(history('cat-casa', 'Casa', 'fixed', 140), 2025, 7, monthOf);

    // Assert
    expect(anomalies).toEqual([]);
  });

  it('should not flag a reduction', () => {
    // Act
    const anomalies = detectSpendingAnomalies(history('cat-casa', 'Casa', 'fixed', 10), 2025, 7, monthOf);

    // Assert
    expect(anomalies).toEqual([]);
  });

  it('should walk the reference window across a year boundary', () => {
    // Arrange — the six months before January 2025 are July-December 2024
    const baseline = [7, 8, 9, 10, 11, 12].map((month) =>
      makeExpense({
        id: `prev-${month}`,
        type: 'fixed',
        amount: -100,
        categoryId: 'cat-casa',
        categoryName: 'Casa',
        date: new Date(Date.UTC(2024, month - 1, 15)),
      })
    );
    const spike = makeExpense({
      id: 'spike',
      type: 'fixed',
      amount: -400,
      categoryId: 'cat-casa',
      categoryName: 'Casa',
      date: new Date(Date.UTC(2025, 0, 15)),
    });

    // Act
    const anomalies = detectSpendingAnomalies([...baseline, spike], 2025, 1, monthOf);

    // Assert
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].referenceAverage).toBe(100);
  });

  it('should ignore income and transfers entirely', () => {
    // Arrange
    const expenses = [
      ...history('cat-casa', 'Casa', 'fixed', 400),
      inMonth(7, { type: 'income', amount: 9000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      inMonth(7, { type: 'transfer', amount: 9000, categoryId: 'cat-giro', categoryName: 'Giroconto' }),
    ];

    // Act
    const anomalies = detectSpendingAnomalies(expenses, 2025, 7, monthOf);

    // Assert
    expect(anomalies.map((a) => a.categoryKey)).toEqual(['cat-casa']);
  });

  it('should return nothing when the month under test has no spending', () => {
    // Act
    const anomalies = detectSpendingAnomalies(history('cat-casa', 'Casa', 'fixed', 400), 2025, 9, monthOf);

    // Assert
    expect(anomalies).toEqual([]);
  });
});
