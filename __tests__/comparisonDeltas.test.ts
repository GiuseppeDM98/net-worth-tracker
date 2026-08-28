import { describe, expect, it } from 'vitest';
import {
  buildCategoryComparison,
  computeTotalsPacing,
  resolveComparisonScope,
  type ComparisonMonthScope,
} from '@/lib/utils/comparisonDeltas';
import { Expense, ExpenseType } from '@/types/expenses';

function makeExpense(
  overrides: Partial<Expense> & { type: ExpenseType; amount: number; date: Date }
): Expense {
  return {
    id: 'e1',
    userId: 'u1',
    categoryId: 'cat-cibo',
    categoryName: 'Cibo',
    currency: 'EUR',
    createdAt: new Date(2025, 0, 1),
    updatedAt: new Date(2025, 0, 1),
    ...overrides,
  } as Expense;
}

/** A row on the 15th of `month` (1-12) in `year`, so fixtures stay readable. */
function on(
  year: number,
  month: number,
  overrides: Partial<Expense> & { type: ExpenseType; amount: number }
): Expense {
  return makeExpense({ ...overrides, date: new Date(year, month - 1, 15) });
}

// Fixtures are built with new Date(year, monthIndex, day) in the local timezone, so
// reading them back with the local getters is TZ-safe by construction — no Italy
// timezone resolution needed here.
const monthOf = (expense: Expense) => {
  const date = expense.date as Date;
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
};

const fullYear: ComparisonMonthScope = { kind: 'fullYear' };

describe('buildCategoryComparison', () => {
  it('should compute current, previous, delta and percent for an ongoing category', () => {
    // Arrange
    const expenses = [
      on(2025, 3, { type: 'variable', amount: -300, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2024, 5, { type: 'variable', amount: -200, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    ];

    // Act
    const [row] = buildCategoryComparison(expenses, 2025, 2024, fullYear, monthOf);

    // Assert
    expect(row.key).toBe('variable:cat-cibo');
    expect(row.label).toBe('Cibo');
    expect(row.current).toBe(300);
    expect(row.previous).toBe(200);
    expect(row.delta).toBe(100);
    expect(row.deltaPercent).toBeCloseTo(50, 6);
    expect(row.status).toBe('ongoing');
  });

  it('should keep two same-named categories of different types as two qualified rows', () => {
    // Arrange — two distinct documents that only share the name "Casa"
    const expenses = [
      on(2025, 2, { type: 'fixed', amount: -800, categoryId: 'cat-casa-fixed', categoryName: 'Casa' }),
      on(2024, 2, { type: 'fixed', amount: -500, categoryId: 'cat-casa-fixed', categoryName: 'Casa' }),
      on(2025, 4, { type: 'variable', amount: -400, categoryId: 'cat-casa-var', categoryName: 'Casa' }),
    ];

    // Act
    const rows = buildCategoryComparison(expenses, 2025, 2024, fullYear, monthOf);

    // Assert — a name-keyed comparison would merge them into one 1.200 € row
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => [row.label, row.current])).toEqual([
      ['Casa (Spese Variabili)', 400],
      ['Casa (Spese Fisse)', 800],
    ]);
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });

  it('should include a category present only in the comparison year with status gone', () => {
    // Arrange
    const expenses = [
      on(2025, 1, { type: 'variable', amount: -100, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2024, 6, { type: 'fixed', amount: -240, categoryId: 'cat-palestra', categoryName: 'Palestra' }),
    ];

    // Act
    const rows = buildCategoryComparison(expenses, 2025, 2024, fullYear, monthOf);
    const gone = rows.find((row) => row.categoryKey === 'cat-palestra');

    // Assert — dropping it would overstate how well the year is going
    expect(gone?.status).toBe('gone');
    expect(gone?.current).toBe(0);
    expect(gone?.previous).toBe(240);
    expect(gone?.delta).toBe(-240);
    expect(gone?.deltaPercent).toBeCloseTo(-100, 6);
  });

  it('should mark a category new this year with a null delta percent', () => {
    // Arrange
    const expenses = [
      on(2025, 7, { type: 'variable', amount: -350, categoryId: 'cat-viaggi', categoryName: 'Viaggi' }),
    ];

    // Act
    const [row] = buildCategoryComparison(expenses, 2025, 2024, fullYear, monthOf);

    // Assert — there is no baseline to divide by, so no percentage is claimed
    expect(row.status).toBe('new');
    expect(row.current).toBe(350);
    expect(row.previous).toBe(0);
    expect(row.delta).toBe(350);
    expect(row.deltaPercent).toBeNull();
  });

  it('should ignore months beyond upToMonth in both years under sameMonths', () => {
    // Arrange — September and October rows must not count on either side
    const expenses = [
      on(2025, 5, { type: 'variable', amount: -100, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2025, 9, { type: 'variable', amount: -999, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2024, 3, { type: 'variable', amount: -80, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2024, 10, { type: 'variable', amount: -777, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    ];

    // Act
    const [row] = buildCategoryComparison(expenses, 2025, 2024, { kind: 'sameMonths', upToMonth: 8 }, monthOf);

    // Assert
    expect(row.current).toBe(100);
    expect(row.previous).toBe(80);
  });

  it('should compare only the selected month under singleMonth', () => {
    // Arrange
    const expenses = [
      on(2025, 8, { type: 'variable', amount: -120, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2025, 7, { type: 'variable', amount: -999, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2024, 8, { type: 'variable', amount: -90, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2024, 9, { type: 'variable', amount: -888, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    ];

    // Act
    const [row] = buildCategoryComparison(expenses, 2025, 2024, { kind: 'singleMonth', month: 8 }, monthOf);

    // Assert
    expect(row.current).toBe(120);
    expect(row.previous).toBe(90);
  });

  it('should sort rows by absolute delta descending', () => {
    // Arrange — deltas: Cibo +100, Palestra −300, Sport +50
    const expenses = [
      on(2025, 1, { type: 'variable', amount: -300, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2024, 1, { type: 'variable', amount: -200, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2024, 2, { type: 'fixed', amount: -300, categoryId: 'cat-palestra', categoryName: 'Palestra' }),
      on(2025, 3, { type: 'variable', amount: -50, categoryId: 'cat-sport', categoryName: 'Sport' }),
    ];

    // Act
    const rows = buildCategoryComparison(expenses, 2025, 2024, fullYear, monthOf);

    // Assert — biggest mover in either direction leads
    expect(rows.map((row) => row.categoryKey)).toEqual(['cat-palestra', 'cat-cibo', 'cat-sport']);
  });

  it('should exclude income and transfer rows', () => {
    // Arrange
    const expenses = [
      on(2025, 1, { type: 'fixed', amount: -300, categoryId: 'cat-casa', categoryName: 'Casa' }),
      on(2025, 1, { type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      on(2024, 1, { type: 'transfer', amount: 500, categoryId: 'cat-giro', categoryName: 'Giroconto' }),
    ];

    // Act
    const rows = buildCategoryComparison(expenses, 2025, 2024, fullYear, monthOf);

    // Assert
    expect(rows.map((row) => row.categoryKey)).toEqual(['cat-casa']);
  });

  it('should count a refund by its type into spending magnitude', () => {
    // Arrange — a positive amount on a variable row is still classified as spending
    const expenses = [
      on(2025, 4, { type: 'variable', amount: -100, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2025, 4, { type: 'variable', amount: 30, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    ];

    // Act
    const [row] = buildCategoryComparison(expenses, 2025, 2024, fullYear, monthOf);

    // Assert — gross, same rule as buildExpenseComposition
    expect(row.current).toBe(130);
  });

  it('should drop a category at zero on both sides', () => {
    // Arrange
    const expenses = [
      on(2025, 1, { type: 'fixed', amount: 0, categoryId: 'cat-fantasma', categoryName: 'Fantasma' }),
      on(2024, 1, { type: 'fixed', amount: 0, categoryId: 'cat-fantasma', categoryName: 'Fantasma' }),
      on(2025, 1, { type: 'variable', amount: -100, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    ];

    // Act
    const rows = buildCategoryComparison(expenses, 2025, 2024, fullYear, monthOf);

    // Assert
    expect(rows.map((row) => row.categoryKey)).toEqual(['cat-cibo']);
  });

  it('should ignore rows from years outside the pair being compared', () => {
    // Arrange
    const expenses = [
      on(2025, 1, { type: 'variable', amount: -100, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      on(2023, 1, { type: 'variable', amount: -500, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    ];

    // Act
    const [row] = buildCategoryComparison(expenses, 2025, 2024, fullYear, monthOf);

    // Assert — the 2023 row must not leak into the 2024 baseline
    expect(row.previous).toBe(0);
    expect(row.status).toBe('new');
  });
});

describe('computeTotalsPacing', () => {
  it('should compute spending and income pacing over the same months in both years', () => {
    // Arrange — rows beyond August must be ignored on both sides
    const expenses = [
      on(2025, 3, { type: 'variable', amount: -500 }),
      on(2025, 4, { type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      on(2025, 9, { type: 'variable', amount: -300 }),
      on(2024, 2, { type: 'variable', amount: -400 }),
      on(2024, 5, { type: 'income', amount: 1800, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      on(2024, 12, { type: 'income', amount: 999, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const pacing = computeTotalsPacing(expenses, 2025, 2024, { kind: 'sameMonths', upToMonth: 8 }, monthOf);

    // Assert
    expect(pacing?.expenses.current).toBe(500);
    expect(pacing?.expenses.previous).toBe(400);
    expect(pacing?.expenses.delta).toBe(100);
    expect(pacing?.expenses.deltaPercent).toBeCloseTo(25, 6);
    expect(pacing?.income.current).toBe(2000);
    expect(pacing?.income.previous).toBe(1800);
    expect(pacing?.income.delta).toBe(200);
    expect(pacing?.income.deltaPercent).toBeCloseTo(11.1111, 3);
    expect(pacing?.baselineLabel).toBe('vs 2024 (stessi mesi, gen–ago)');
  });

  it('should return null when the comparison year window has no rows at all', () => {
    // Arrange — only current-year data: no baseline exists
    const expenses = [
      on(2025, 3, { type: 'variable', amount: -500 }),
      on(2025, 4, { type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const pacing = computeTotalsPacing(expenses, 2025, 2024, fullYear, monthOf);

    // Assert — callers hide the row instead of pacing against a fake zero
    expect(pacing).toBeNull();
  });

  it('should treat a comparison window with only transfers as empty', () => {
    // Arrange — transfers are excluded everywhere, including the emptiness check
    const expenses = [
      on(2025, 3, { type: 'variable', amount: -500 }),
      on(2024, 3, { type: 'transfer', amount: 900, categoryId: 'cat-giro', categoryName: 'Giroconto' }),
    ];

    // Act
    const pacing = computeTotalsPacing(expenses, 2025, 2024, fullYear, monthOf);

    // Assert
    expect(pacing).toBeNull();
  });

  it('should keep the pacing when the comparison window has only income', () => {
    // Arrange
    const expenses = [
      on(2025, 3, { type: 'variable', amount: -500 }),
      on(2024, 5, { type: 'income', amount: 1800, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const pacing = computeTotalsPacing(expenses, 2025, 2024, fullYear, monthOf);

    // Assert — the spending side has no baseline, so its percent stays null
    expect(pacing).not.toBeNull();
    expect(pacing?.expenses.previous).toBe(0);
    expect(pacing?.expenses.deltaPercent).toBeNull();
    expect(pacing?.income.previous).toBe(1800);
  });

  it('should count a refund into spending magnitude, not income', () => {
    // Arrange — classification is by type, never by sign
    const expenses = [
      on(2025, 4, { type: 'variable', amount: -100 }),
      on(2025, 4, { type: 'variable', amount: 30 }),
      on(2024, 4, { type: 'variable', amount: -50 }),
    ];

    // Act
    const pacing = computeTotalsPacing(expenses, 2025, 2024, fullYear, monthOf);

    // Assert
    expect(pacing?.expenses.current).toBe(130);
    expect(pacing?.income.current).toBe(0);
  });

  it('should say plain vs-year when the same-months cut reaches December', () => {
    // Arrange
    const expenses = [
      on(2025, 1, { type: 'variable', amount: -100 }),
      on(2024, 1, { type: 'variable', amount: -100 }),
    ];

    // Act
    const pacing = computeTotalsPacing(expenses, 2025, 2024, { kind: 'sameMonths', upToMonth: 12 }, monthOf);

    // Assert — "stessi mesi" at December would only make the reader wonder what was cut
    expect(pacing?.baselineLabel).toBe('vs 2024');
  });

  it('should label a single month comparison with the full month name and window it', () => {
    // Arrange — the July rows must not count
    const expenses = [
      on(2025, 8, { type: 'variable', amount: -120 }),
      on(2025, 7, { type: 'variable', amount: -999 }),
      on(2024, 8, { type: 'variable', amount: -90 }),
    ];

    // Act
    const pacing = computeTotalsPacing(expenses, 2025, 2024, { kind: 'singleMonth', month: 8 }, monthOf);

    // Assert
    expect(pacing?.baselineLabel).toBe('vs Agosto 2024');
    expect(pacing?.expenses.current).toBe(120);
    expect(pacing?.expenses.previous).toBe(90);
  });

  it('should label a full year comparison with just the year', () => {
    // Arrange
    const expenses = [
      on(2025, 1, { type: 'variable', amount: -100 }),
      on(2024, 1, { type: 'variable', amount: -100 }),
    ];

    // Act
    const pacing = computeTotalsPacing(expenses, 2025, 2024, fullYear, monthOf);

    // Assert
    expect(pacing?.baselineLabel).toBe('vs 2024');
  });
});

describe('resolveComparisonScope', () => {
  it('should return null in history mode — no single year is under review', () => {
    expect(resolveComparisonScope('history', null, 8)).toBeNull();
    expect(resolveComparisonScope('history', 3, 8)).toBeNull();
  });

  it('should map Anno Corrente without a month to same-months pacing up to today', () => {
    expect(resolveComparisonScope('current', null, 8)).toEqual({ kind: 'sameMonths', upToMonth: 8 });
  });

  it('should treat «da inizio anno» exactly like the running year — same months, same rules', () => {
    // Both windows can only be matched on the months already lived, whatever they span.
    expect(resolveComparisonScope('ytd', null, 8)).toEqual({ kind: 'sameMonths', upToMonth: 8 });
    expect(resolveComparisonScope('ytd', 8, 8)).toEqual({ kind: 'singleMonth', month: 8, inProgress: true });
    // A month the running year has not reached has nothing to compare.
    expect(resolveComparisonScope('ytd', 11, 8)).toBeNull();
  });

  it('should map a past year without a month to a full-year comparison', () => {
    expect(resolveComparisonScope('year', null, 8)).toEqual({ kind: 'fullYear' });
  });

  it('should mark the running calendar month as in progress', () => {
    expect(resolveComparisonScope('current', 8, 8)).toEqual({
      kind: 'singleMonth',
      month: 8,
      inProgress: true,
    });
  });

  it('should return null for a month that has not started yet', () => {
    // Comparing a month of zeros against a full baseline would print "-100%"
    // for a month that simply has not happened.
    expect(resolveComparisonScope('current', 12, 8)).toBeNull();
  });

  it('should treat a past-year single month as complete, never in progress', () => {
    expect(resolveComparisonScope('year', 12, 8)).toEqual({
      kind: 'singleMonth',
      month: 12,
      inProgress: false,
    });
  });

  it('should declare the running month in the baseline caption', () => {
    // Arrange
    const expenses = [
      on(2026, 8, { type: 'variable', amount: -100 }),
      on(2025, 8, { type: 'variable', amount: -200 }),
    ];
    const scope = resolveComparisonScope('current', 8, 8);

    // Act
    const pacing = computeTotalsPacing(expenses, 2026, 2025, scope!, monthOf);

    // Assert
    expect(pacing?.baselineLabel).toBe('vs Agosto 2025 (mese in corso)');
  });
});
