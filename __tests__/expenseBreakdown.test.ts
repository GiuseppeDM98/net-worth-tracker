import { describe, expect, it } from 'vitest';
import { buildCashflowBreakdown } from '@/lib/utils/expenseBreakdown';
import { Expense, ExpenseType } from '@/types/expenses';

/**
 * Builds an expense doc with only the fields the aggregator reads.
 *
 * `type` is an explicit parameter with no default derived from the sign of `amount` —
 * deriving it would bake the very assumption under test (classify by type, not by sign)
 * into the fixture.
 */
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

const sum = (values: number[]) => values.reduce((acc, v) => acc + v, 0);

describe('buildCashflowBreakdown', () => {
  describe('category and subcategory nesting', () => {
    it('should nest each subcategory under its own parent category', () => {
      // Arrange
      const expenses = [
        makeExpense({ type: 'fixed', amount: -100, subCategoryId: 'sub-luce', subCategoryName: 'Elettricità' }),
        makeExpense({ type: 'fixed', amount: -60, subCategoryId: 'sub-gas', subCategoryName: 'Gas' }),
        makeExpense({
          type: 'variable',
          amount: -40,
          categoryId: 'cat-cibo',
          categoryName: 'Cibo',
          subCategoryId: 'sub-super',
          subCategoryName: 'Supermercato',
        }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      const casa = result.expensesByCategory.find((c) => c.categoryName === 'Casa');
      const cibo = result.expensesByCategory.find((c) => c.categoryName === 'Cibo');
      expect(casa?.subCategories.map((s) => s.subCategoryName)).toEqual(['Elettricità', 'Gas']);
      expect(cibo?.subCategories.map((s) => s.subCategoryName)).toEqual(['Supermercato']);
    });

    it('should collapse expenses without a subcategory into a single labelled row', () => {
      // Arrange
      const expenses = [
        makeExpense({ type: 'fixed', amount: -30 }),
        makeExpense({ type: 'fixed', amount: -20, subCategoryId: '   ' }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.expensesByCategory[0].subCategories).toEqual([
        { subCategoryName: 'Senza sottocategoria', total: -50, transactionCount: 2 },
      ]);
    });

    it('should keep same-named subcategories distinct when they sit under different categories', () => {
      // Arrange — two "Assicurazione" subcategories with different ids
      const expenses = [
        makeExpense({ type: 'fixed', amount: -300, subCategoryId: 'sub-assic-casa', subCategoryName: 'Assicurazione' }),
        makeExpense({
          type: 'fixed',
          amount: -500,
          categoryId: 'cat-auto',
          categoryName: 'Auto',
          subCategoryId: 'sub-assic-auto',
          subCategoryName: 'Assicurazione',
        }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.expensesByCategory).toHaveLength(2);
      expect(result.expensesByCategory.every((c) => c.subCategories.length === 1)).toBe(true);
    });

    it('should keep same-named subcategories distinct within one category when ids differ', () => {
      // Arrange
      const expenses = [
        makeExpense({ type: 'fixed', amount: -10, subCategoryId: 'sub-a', subCategoryName: 'Utenze' }),
        makeExpense({ type: 'fixed', amount: -20, subCategoryId: 'sub-b', subCategoryName: 'Utenze' }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.expensesByCategory[0].subCategories).toHaveLength(2);
    });
  });

  describe('no cap', () => {
    it('should return every category, not just the top five', () => {
      // Arrange
      const expenses = Array.from({ length: 12 }, (_, i) =>
        makeExpense({ type: 'variable', amount: -(i + 1), categoryId: `cat-${i}`, categoryName: `Categoria ${i}` })
      );

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.expensesByCategory).toHaveLength(12);
    });

    it('should return every subcategory of a category, not just the top five', () => {
      // Arrange
      const expenses = Array.from({ length: 9 }, (_, i) =>
        makeExpense({ type: 'fixed', amount: -(i + 1), subCategoryId: `sub-${i}`, subCategoryName: `Voce ${i}` })
      );

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.expensesByCategory[0].subCategories).toHaveLength(9);
    });
  });

  describe('classification by type, not by sign', () => {
    it('should count a refund booked on a spending category as spending', () => {
      // Arrange — positive amount on a `variable` row: a refund, not income
      const expenses = [
        makeExpense({ type: 'variable', amount: -200 }),
        makeExpense({ type: 'variable', amount: 50 }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.totals.totalIncome).toBe(0);
      expect(result.totals.totalExpenses).toBe(-250);
    });

    it('should count a negative income row as income', () => {
      // Arrange
      const expenses = [makeExpense({ type: 'income', amount: -100, categoryId: 'cat-stip', categoryName: 'Stipendio' })];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.totals.totalIncome).toBe(-100);
      expect(result.totals.totalExpenses).toBe(0);
    });

    it('should bucket rows with no type under "Non classificate" rather than dropping them', () => {
      // Arrange — legacy row that reached Firestore without a type
      const expenses = [
        makeExpense({ type: 'fixed', amount: -100 }),
        makeExpense({ type: undefined as unknown as ExpenseType, amount: -40 }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.totals.totalExpenses).toBe(-140);
      expect(result.expensesByType).toEqual([
        { type: 'fixed', label: 'Spese Necessarie', total: -100 },
        { type: 'unclassified', label: 'Non classificate', total: -40 },
      ]);
    });
  });

  describe('transfers', () => {
    it('should exclude transfers from every total, count and breakdown', () => {
      // Arrange
      const expenses = [
        makeExpense({ type: 'variable', amount: -100 }),
        makeExpense({ type: 'transfer', amount: 5000, categoryId: 'cat-giro', categoryName: 'Giroconto' }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.totals.totalExpenses).toBe(-100);
      expect(result.totals.totalIncome).toBe(0);
      expect(result.totals.transactionCount).toBe(1);
      expect(result.expensesByCategory.map((c) => c.categoryName)).toEqual(['Casa']);
      expect(result.incomeByCategory).toEqual([]);
    });
  });

  describe('income and dividends', () => {
    it('should report the dividend category separately and keep it out of incomeByCategory', () => {
      // Arrange
      const expenses = [
        makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
        makeExpense({ type: 'income', amount: 150, categoryId: 'cat-div', categoryName: 'Dividendi' }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses, { dividendCategoryId: 'cat-div' });

      // Assert
      expect(result.totals.totalIncome).toBe(2000);
      expect(result.totals.totalDividends).toBe(150);
      expect(result.incomeByCategory).toEqual([{ categoryName: 'Stipendio', total: 2000, transactionCount: 1 }]);
    });

    it('should treat dividend rows as ordinary income when no dividend category is configured', () => {
      // Arrange
      const expenses = [makeExpense({ type: 'income', amount: 150, categoryId: 'cat-div', categoryName: 'Dividendi' })];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.totals.totalDividends).toBe(0);
      expect(result.totals.totalIncome).toBe(150);
    });
  });

  describe('invariants', () => {
    // The whole point of a single-pass aggregator: these must hold on any input.
    const expenses = [
      makeExpense({ type: 'fixed', amount: -900, subCategoryId: 'sub-mutuo', subCategoryName: 'Mutuo' }),
      makeExpense({ type: 'fixed', amount: -120, subCategoryId: 'sub-luce', subCategoryName: 'Elettricità' }),
      makeExpense({ type: 'fixed', amount: -80 }), // no subcategory
      makeExpense({ type: 'variable', amount: 45, categoryId: 'cat-cibo', categoryName: 'Cibo' }), // refund
      makeExpense({
        type: 'variable',
        amount: -310,
        categoryId: 'cat-cibo',
        categoryName: 'Cibo',
        subCategoryId: 'sub-super',
        subCategoryName: 'Supermercato',
      }),
      makeExpense({ type: 'debt', amount: -200, categoryId: 'cat-prestito', categoryName: 'Prestito' }),
      makeExpense({ type: undefined as unknown as ExpenseType, amount: -15, categoryId: 'cat-x', categoryName: 'Legacy' }),
      makeExpense({ type: 'transfer', amount: 1000, categoryId: 'cat-giro', categoryName: 'Giroconto' }),
      makeExpense({ type: 'income', amount: 3000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      makeExpense({ type: 'income', amount: 90, categoryId: 'cat-div', categoryName: 'Dividendi' }),
    ];
    const result = buildCashflowBreakdown(expenses, { dividendCategoryId: 'cat-div' });

    it('should have category totals summing to the expense total', () => {
      expect(sum(result.expensesByCategory.map((c) => c.total))).toBeCloseTo(result.totals.totalExpenses);
    });

    it('should have subcategory totals summing to their category total', () => {
      for (const category of result.expensesByCategory) {
        expect(sum(category.subCategories.map((s) => s.total))).toBeCloseTo(category.total);
        expect(sum(category.subCategories.map((s) => s.transactionCount))).toBe(category.transactionCount);
      }
    });

    it('should have per-type totals summing to the expense total', () => {
      expect(sum(result.expensesByType.map((t) => t.total))).toBeCloseTo(result.totals.totalExpenses);
    });

    it('should have income category totals summing to the income total', () => {
      expect(sum(result.incomeByCategory.map((c) => c.total))).toBeCloseTo(result.totals.totalIncome);
    });

    it('should have category transaction counts summing to the expense transaction count', () => {
      expect(sum(result.expensesByCategory.map((c) => c.transactionCount))).toBe(
        result.totals.expenseTransactionCount
      );
    });

    it('should have a net cash flow equal to income plus dividends minus spending', () => {
      expect(result.totals.netCashFlow).toBeCloseTo(
        result.totals.totalIncome + result.totals.totalDividends + result.totals.totalExpenses
      );
    });

    it('should exclude transfers from the transaction count', () => {
      expect(result.totals.transactionCount).toBe(expenses.length - 1);
    });
  });

  describe('signs and ordering', () => {
    const expenses = [
      makeExpense({ type: 'variable', amount: -50, categoryId: 'cat-b', categoryName: 'Piccola' }),
      makeExpense({ type: 'variable', amount: -500, categoryId: 'cat-a', categoryName: 'Grande' }),
      makeExpense({ type: 'income', amount: 100, categoryId: 'cat-i2', categoryName: 'Extra' }),
      makeExpense({ type: 'income', amount: 900, categoryId: 'cat-i1', categoryName: 'Stipendio' }),
    ];
    const result = buildCashflowBreakdown(expenses);

    it('should report expense totals as negative and income totals as positive', () => {
      expect(result.expensesByCategory.every((c) => c.total < 0)).toBe(true);
      expect(result.expensesByType.every((t) => t.total < 0)).toBe(true);
      expect(result.incomeByCategory.every((c) => c.total > 0)).toBe(true);
      expect(result.topIndividualExpenses.every((e) => e.amount < 0)).toBe(true);
    });

    it('should sort categories by magnitude descending', () => {
      expect(result.expensesByCategory.map((c) => c.categoryName)).toEqual(['Grande', 'Piccola']);
      expect(result.incomeByCategory.map((c) => c.categoryName)).toEqual(['Stipendio', 'Extra']);
    });

    it('should sort subcategories by magnitude descending', () => {
      // Arrange
      const nested = [
        makeExpense({ type: 'fixed', amount: -10, subCategoryId: 's1', subCategoryName: 'Piccola' }),
        makeExpense({ type: 'fixed', amount: -90, subCategoryId: 's2', subCategoryName: 'Grande' }),
      ];

      // Act
      const sorted = buildCashflowBreakdown(nested);

      // Assert
      expect(sorted.expensesByCategory[0].subCategories.map((s) => s.subCategoryName)).toEqual(['Grande', 'Piccola']);
    });
  });

  describe('top individual expenses', () => {
    it('should honour the requested limit and carry subcategory, notes and date', () => {
      // Arrange
      const expenses = [
        makeExpense({
          type: 'fixed',
          amount: -900,
          subCategoryId: 'sub-bon',
          subCategoryName: 'Bonifica',
          notes: 'Bonifica cisterna',
          date: new Date('2025-03-12T10:00:00Z'),
        }),
        makeExpense({ type: 'variable', amount: -500 }),
        makeExpense({ type: 'variable', amount: -10 }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses, { topIndividualLimit: 2 });

      // Assert
      expect(result.topIndividualExpenses).toEqual([
        {
          categoryName: 'Casa',
          subCategoryName: 'Bonifica',
          amount: -900,
          notes: 'Bonifica cisterna',
          date: '2025-03-12',
        },
        { categoryName: 'Casa', subCategoryName: undefined, amount: -500, notes: undefined, date: '2025-06-15' },
      ]);
    });

    it('should default to five when no limit is given', () => {
      // Arrange
      const expenses = Array.from({ length: 8 }, (_, i) => makeExpense({ type: 'variable', amount: -(i + 1) }));

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.topIndividualExpenses).toHaveLength(5);
    });

    it('should rank a refund by magnitude like any other spending row', () => {
      // Arrange
      const expenses = [
        makeExpense({ type: 'variable', amount: 700 }), // refund, largest magnitude
        makeExpense({ type: 'variable', amount: -100 }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses, { topIndividualLimit: 1 });

      // Assert
      expect(result.topIndividualExpenses[0].amount).toBe(-700);
    });
  });

  describe('unclassified subcategory share', () => {
    it('should report the share of spending with no subcategory', () => {
      // Arrange
      const expenses = [
        makeExpense({ type: 'fixed', amount: -300 }),
        makeExpense({ type: 'fixed', amount: -100, subCategoryId: 'sub-luce', subCategoryName: 'Elettricità' }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.unclassifiedSubCategoryShare).toBeCloseTo(0.75);
    });

    it('should report zero when there is no spending at all', () => {
      // Arrange
      const expenses = [makeExpense({ type: 'income', amount: 1000, categoryId: 'cat-s', categoryName: 'Stipendio' })];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.unclassifiedSubCategoryShare).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should return empty breakdowns and zero totals for an empty period', () => {
      // Act
      const result = buildCashflowBreakdown([]);

      // Assert
      expect(result).toEqual({
        totals: {
          totalIncome: 0,
          totalDividends: 0,
          totalExpenses: 0,
          netCashFlow: 0,
          transactionCount: 0,
          expenseTransactionCount: 0,
        },
        expensesByCategory: [],
        incomeByCategory: [],
        expensesByType: [],
        topIndividualExpenses: [],
        unclassifiedSubCategoryShare: 0,
      });
    });

    it('should label rows with a blank category name rather than dropping them', () => {
      // Arrange
      const expenses = [makeExpense({ type: 'variable', amount: -25, categoryId: '', categoryName: '  ' })];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert
      expect(result.expensesByCategory[0].categoryName).toBe('Senza categoria');
      expect(result.totals.totalExpenses).toBe(-25);
    });

    it('should group rows of the same category under one entry even after a rename', () => {
      // Arrange — same categoryId, stale denormalized name on the older row
      const expenses = [
        makeExpense({ type: 'fixed', amount: -100, categoryName: 'Casa' }),
        makeExpense({ type: 'fixed', amount: -50, categoryName: 'Abitazione' }),
      ];

      // Act
      const result = buildCashflowBreakdown(expenses);

      // Assert — one row, keyed by id; the label is whichever name was seen first
      expect(result.expensesByCategory).toHaveLength(1);
      expect(result.expensesByCategory[0].total).toBe(-150);
    });
  });
});
