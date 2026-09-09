import { describe, expect, it } from 'vitest';
import {
  buildEntityMonthlySeries,
  buildEntitySubCategoryDeltas,
  buildEntityYearRows,
  computeEntityRunRate,
  resolveYearRowWindows,
  type EntityScope,
} from '@/lib/utils/expenseEntityStats';
import { Expense, ExpenseType, NO_SUBCATEGORY_KEY } from '@/types/expenses';

let nextId = 0;

/** Type is always explicit — classification is by type, never derived from the sign. */
function makeExpense(overrides: Partial<Expense> & { type: ExpenseType; amount: number; date: Date }): Expense {
  return {
    id: `e${nextId++}`,
    userId: 'u1',
    categoryId: 'cat-casa-fixed',
    categoryName: 'Casa',
    currency: 'EUR',
    createdAt: overrides.date,
    updatedAt: overrides.date,
    ...overrides,
  } as Expense;
}

// Fixtures are built with new Date(year, monthIndex, day) in the local timezone and read
// back with the matching local getters, so the pair is TZ-safe by construction — no
// Italy-timezone helper is needed here.
const monthOf = (expense: Expense) => ({
  year: expense.date.getFullYear(),
  month: expense.date.getMonth() + 1,
});

/** A fixed-type entity row of the "Casa (Spese Fisse)" category. */
function casaFixed(year: number, month: number, amount: number): Expense {
  return makeExpense({ type: 'fixed', amount, date: new Date(year, month - 1, 15) });
}

const casaFixedScope: EntityScope = { category: { expenseType: 'fixed', key: 'cat-casa-fixed' } };

describe('buildEntityYearRows', () => {
  it('should compare the partial year to the same months of the previous year, not the full year', () => {
    // Arrange — 2025 has heavy spending after March, which must NOT enter the baseline
    const expenses = [
      casaFixed(2026, 1, -100),
      casaFixed(2026, 2, -200),
      casaFixed(2025, 1, -100),
      casaFixed(2025, 2, -50),
      casaFixed(2025, 3, -50),
      casaFixed(2025, 12, -800),
    ];

    // Act
    const rows = buildEntityYearRows(expenses, casaFixedScope, 2025, { year: 2026, month: 3 }, monthOf);

    // Assert — newest first; partial delta against 200 (Jan-Mar 2025), not 1000
    expect(rows.map((row) => row.year)).toEqual([2026, 2025]);
    expect(rows[0].isPartial).toBe(true);
    expect(rows[0].total).toBeCloseTo(300);
    expect(rows[0].prevSameMonthsTotal).toBeCloseTo(200);
    expect(rows[0].delta).toBeCloseTo(100);
    expect(rows[0].deltaPercent).toBeCloseTo(50);
    expect(rows[1].isPartial).toBe(false);
    expect(rows[1].total).toBeCloseTo(1000);
  });

  it('should give the oldest row a null delta', () => {
    // Arrange
    const expenses = [casaFixed(2025, 6, -400), casaFixed(2026, 1, -100)];

    // Act
    const rows = buildEntityYearRows(expenses, casaFixedScope, 2025, { year: 2026, month: 3 }, monthOf);

    // Assert
    const oldest = rows[rows.length - 1];
    expect(oldest.year).toBe(2025);
    expect(oldest.delta).toBeNull();
    expect(oldest.deltaPercent).toBeNull();
    expect(oldest.prevSameMonthsTotal).toBeNull();
  });

  it('should include a zero year between two years with data', () => {
    // Arrange — nothing in 2025, but the silence is information, not a gap
    const expenses = [casaFixed(2024, 5, -500), casaFixed(2026, 1, -100)];

    // Act
    const rows = buildEntityYearRows(expenses, casaFixedScope, 2023, { year: 2026, month: 3 }, monthOf);

    // Assert — 2025 appears with total 0 and a full -100% delta; no 2023 row (no data that far back)
    expect(rows.map((row) => row.year)).toEqual([2026, 2025, 2024]);
    expect(rows[1].total).toBe(0);
    expect(rows[1].delta).toBeCloseTo(-500);
    expect(rows[1].deltaPercent).toBeCloseTo(-100);
  });

  it('should null the partial baseline when the previous year falls before the history floor', () => {
    // Arrange — history starts in the current year, so 2025 is not comparable
    const expenses = [casaFixed(2026, 1, -100), casaFixed(2025, 1, -999)];

    // Act
    const rows = buildEntityYearRows(expenses, casaFixedScope, 2026, { year: 2026, month: 3 }, monthOf);

    // Assert — a single partial row with no baseline at all
    expect(rows).toHaveLength(1);
    expect(rows[0].prevSameMonthsTotal).toBeNull();
    expect(rows[0].delta).toBeNull();
    expect(rows[0].deltaPercent).toBeNull();
  });

  it('should treat a previous year inside history but without entity data as a zero baseline', () => {
    // Arrange — 2025 is within history, the entity just spent nothing then
    const expenses = [casaFixed(2026, 2, -100)];

    // Act
    const rows = buildEntityYearRows(expenses, casaFixedScope, 2025, { year: 2026, month: 3 }, monthOf);

    // Assert — baseline 0 yields a delta but no percentage
    expect(rows[0].prevSameMonthsTotal).toBe(0);
    expect(rows[0].delta).toBeCloseTo(100);
    expect(rows[0].deltaPercent).toBeNull();
  });

  it('should clamp at the history floor even when older entity data exists', () => {
    // Arrange — 2024 data exists but the floor is 2025
    const expenses = [casaFixed(2024, 3, -999), casaFixed(2025, 3, -200), casaFixed(2026, 1, -100)];

    // Act
    const rows = buildEntityYearRows(expenses, casaFixedScope, 2025, { year: 2026, month: 3 }, monthOf);

    // Assert — no 2024 row, and 2025 gets no baseline from the pre-floor year
    expect(rows.map((row) => row.year)).toEqual([2026, 2025]);
    expect(rows[1].delta).toBeNull();
  });

  it('should return no rows when the entity has no data at or after the floor', () => {
    // Arrange
    const expenses = [casaFixed(2023, 3, -999)];

    // Act
    const rows = buildEntityYearRows(expenses, casaFixedScope, 2025, { year: 2026, month: 3 }, monthOf);

    // Assert
    expect(rows).toEqual([]);
  });

  it('should keep a same-named category of another type out of the totals', () => {
    // Arrange — two distinct "Casa" documents under different types; scope is the fixed one
    const expenses = [
      casaFixed(2026, 1, -100),
      makeExpense({
        type: 'variable',
        amount: -999,
        categoryId: 'cat-casa-var',
        categoryName: 'Casa',
        date: new Date(2026, 0, 15),
      }),
    ];

    // Act
    const rows = buildEntityYearRows(expenses, casaFixedScope, 2025, { year: 2026, month: 3 }, monthOf);

    // Assert — id-keying: the variable Casa never bleeds into the fixed Casa's dossier
    expect(rows[0].total).toBeCloseTo(100);
  });

  it('should select exactly the rows without a subcategory when the scope uses the sentinel key', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'fixed', amount: -100, subCategoryId: 'sub-affitto', date: new Date(2026, 0, 15) }),
      makeExpense({ type: 'fixed', amount: -40, date: new Date(2026, 0, 20) }),
    ];
    const scope: EntityScope = { category: casaFixedScope.category, subCategory: { key: NO_SUBCATEGORY_KEY } };

    // Act
    const rows = buildEntityYearRows(expenses, scope, 2026, { year: 2026, month: 3 }, monthOf);

    // Assert
    expect(rows[0].total).toBeCloseTo(40);
  });
});

describe('computeEntityRunRate', () => {
  it('should average the current-year period over the elapsed months and project it to twelve', () => {
    // Arrange
    const expenses = [casaFixed(2026, 1, -300), casaFixed(2026, 3, -100)];

    // Act
    const runRate = computeEntityRunRate(expenses, casaFixedScope, { year: 2026, month: null }, 2025, { year: 2026, month: 4 }, monthOf);

    // Assert
    expect(runRate.periodTotal).toBeCloseTo(400);
    expect(runRate.periodMonthlyAverage).toBeCloseTo(100);
    expect(runRate.currentYearProjection).toBeCloseTo(1200);
  });

  it('should divide a completed year by twelve months and skip the projection', () => {
    // Arrange
    const expenses = [casaFixed(2025, 2, -600), casaFixed(2025, 11, -600)];

    // Act
    const runRate = computeEntityRunRate(expenses, casaFixedScope, { year: 2025, month: null }, 2025, { year: 2026, month: 4 }, monthOf);

    // Assert — a full trailing window also reports all twelve months observed
    expect(runRate.periodTotal).toBeCloseTo(1200);
    expect(runRate.periodMonthlyAverage).toBeCloseTo(100);
    expect(runRate.currentYearProjection).toBeNull();
    expect(runRate.observedMonths).toBe(12);
  });

  it('should treat a single-month period as one elapsed month', () => {
    // Arrange
    const expenses = [casaFixed(2026, 3, -150), casaFixed(2026, 2, -999)];

    // Act
    const runRate = computeEntityRunRate(expenses, casaFixedScope, { year: 2026, month: 3 }, 2025, { year: 2026, month: 4 }, monthOf);

    // Assert
    expect(runRate.periodTotal).toBeCloseTo(150);
    expect(runRate.periodMonthlyAverage).toBeCloseTo(150);
    expect(runRate.currentYearProjection).toBeNull();
  });

  it('should floor the all-history period and leave the monthly average null', () => {
    // Arrange — 2024 spending sits below the floor
    const expenses = [casaFixed(2024, 6, -999), casaFixed(2025, 6, -100), casaFixed(2026, 1, -200)];

    // Act
    const runRate = computeEntityRunRate(expenses, casaFixedScope, { year: null, month: null }, 2025, { year: 2026, month: 4 }, monthOf);

    // Assert
    expect(runRate.periodTotal).toBeCloseTo(300);
    expect(runRate.periodMonthlyAverage).toBeNull();
    expect(runRate.currentYearProjection).toBeNull();
  });

  it('should shrink the trailing window and its average denominator when it crosses the floor', () => {
    // Arrange — window May 2024..Apr 2025, but history starts in 2025: only 4 observed months
    const expenses = [casaFixed(2024, 12, -999), casaFixed(2025, 1, -100), casaFixed(2025, 3, -100)];

    // Act
    const runRate = computeEntityRunRate(expenses, casaFixedScope, { year: 2025, month: null }, 2025, { year: 2025, month: 4 }, monthOf);

    // Assert — the pre-floor December row is invisible, and the average divides by 4, not 12
    expect(runRate.observedMonths).toBe(4);
    expect(runRate.trailing12Total).toBeCloseTo(200);
    expect(runRate.trailing12MonthlyAverage).toBeCloseTo(50);
  });

  it('should compute the share against the spending side for a spending entity', () => {
    // Arrange — income and transfers must stay out of the denominator
    const expenses = [
      casaFixed(2026, 3, -100),
      makeExpense({ type: 'variable', amount: -300, categoryId: 'cat-cibo', categoryName: 'Cibo', date: new Date(2026, 2, 10) }),
      makeExpense({ type: 'income', amount: 5000, categoryId: 'cat-stip', categoryName: 'Stipendio', date: new Date(2026, 2, 27) }),
      makeExpense({ type: 'transfer', amount: 400, categoryId: 'cat-giro', categoryName: 'Giroconto', date: new Date(2026, 2, 5) }),
    ];

    // Act
    const runRate = computeEntityRunRate(expenses, casaFixedScope, { year: 2026, month: 3 }, 2025, { year: 2026, month: 4 }, monthOf);

    // Assert — 100 of 400 spending
    expect(runRate.shareOfPeriodTotal).toBeCloseTo(0.25);
  });

  it('should compute the share against the income side for an income entity', () => {
    // Arrange — income rows are stored positive; spending must stay out of the denominator
    const expenses = [
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio', date: new Date(2026, 2, 27) }),
      makeExpense({ type: 'income', amount: 500, categoryId: 'cat-bonus', categoryName: 'Bonus', date: new Date(2026, 2, 15) }),
      makeExpense({ type: 'variable', amount: -10000, categoryId: 'cat-cibo', categoryName: 'Cibo', date: new Date(2026, 2, 10) }),
    ];
    const incomeScope: EntityScope = { category: { expenseType: 'income', key: 'cat-stip' } };

    // Act
    const runRate = computeEntityRunRate(expenses, incomeScope, { year: 2026, month: 3 }, 2025, { year: 2026, month: 4 }, monthOf);

    // Assert — magnitudes work on the income side too: 2000 of 2500
    expect(runRate.periodTotal).toBeCloseTo(2000);
    expect(runRate.shareOfPeriodTotal).toBeCloseTo(0.8);
  });

  it('should declare a null share when the period has no same-side rows', () => {
    // Arrange — only income in the period, and the entity is a spending one
    const expenses = [
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio', date: new Date(2026, 2, 27) }),
    ];

    // Act
    const runRate = computeEntityRunRate(expenses, casaFixedScope, { year: 2026, month: 3 }, 2025, { year: 2026, month: 4 }, monthOf);

    // Assert
    expect(runRate.periodTotal).toBe(0);
    expect(runRate.shareOfPeriodTotal).toBeNull();
  });
});

describe('buildEntityMonthlySeries', () => {
  it('should produce a gap-free chronological window ending at the current month', () => {
    // Arrange — a single row in January; the other months are real zero points
    const expenses = [casaFixed(2026, 1, -150)];

    // Act
    const points = buildEntityMonthlySeries(expenses, casaFixedScope, 4, 2024, { year: 2026, month: 3 }, monthOf);

    // Assert
    expect(points.map((point) => point.key)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03']);
    expect(points.map((point) => point.value)).toEqual([0, 150, 0, 0]);
  });

  it('should label points with the three-letter Italian month and two-digit year', () => {
    // Arrange
    const expenses: Expense[] = [];

    // Act
    const points = buildEntityMonthlySeries(expenses, casaFixedScope, 4, 2024, { year: 2026, month: 3 }, monthOf);

    // Assert
    expect(points.map((point) => point.label)).toEqual(['Dic 25', 'Gen 26', 'Feb 26', 'Mar 26']);
  });

  it('should fill prevYearValue from the same month one year earlier', () => {
    // Arrange
    const expenses = [casaFixed(2025, 2, -100), casaFixed(2026, 2, -80)];

    // Act
    const points = buildEntityMonthlySeries(expenses, casaFixedScope, 3, 2024, { year: 2026, month: 3 }, monthOf);

    // Assert
    const february = points.find((point) => point.key === '2026-02');
    expect(february?.value).toBeCloseTo(80);
    expect(february?.prevYearValue).toBeCloseTo(100);
  });

  it('should clamp the window at the history floor instead of padding it', () => {
    // Arrange — 24 months requested, but history only starts in January 2026
    const expenses = [casaFixed(2026, 1, -150)];

    // Act
    const points = buildEntityMonthlySeries(expenses, casaFixedScope, 24, 2026, { year: 2026, month: 3 }, monthOf);

    // Assert
    expect(points.map((point) => point.key)).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('should report a NULL prevYearValue when the baseline month predates the floor', () => {
    // Arrange — the 2025 row exists but sits below the floor: the baseline is
    // unknowable, not zero, and the chart must render a gap rather than a flat 0
    const expenses = [casaFixed(2025, 2, -500), casaFixed(2026, 2, -80)];

    // Act
    const points = buildEntityMonthlySeries(expenses, casaFixedScope, 3, 2026, { year: 2026, month: 3 }, monthOf);

    // Assert
    const february = points.find((point) => point.key === '2026-02');
    expect(february?.prevYearValue).toBeNull();
  });

  it('should keep a real zero prevYearValue for an in-history baseline month with no data', () => {
    // Arrange — floor 2024, so February 2025 is tracked; the entity simply spent nothing then
    const expenses = [casaFixed(2026, 2, -80)];

    // Act
    const points = buildEntityMonthlySeries(expenses, casaFixedScope, 3, 2024, { year: 2026, month: 3 }, monthOf);

    // Assert — within history, silence is data: 0, not null
    const february = points.find((point) => point.key === '2026-02');
    expect(february?.prevYearValue).toBe(0);
  });

  it('should narrow the series to one subcategory when the scope carries one', () => {
    // Arrange — same category, two subcategories, scope on one of them
    const expenses = [
      makeExpense({ type: 'fixed', amount: -100, subCategoryId: 'sub-affitto', date: new Date(2026, 1, 10) }),
      makeExpense({ type: 'fixed', amount: -60, subCategoryId: 'sub-bollette', date: new Date(2026, 1, 12) }),
    ];
    const scope: EntityScope = { category: casaFixedScope.category, subCategory: { key: 'sub-affitto' } };

    // Act
    const points = buildEntityMonthlySeries(expenses, scope, 2, 2025, { year: 2026, month: 2 }, monthOf);

    // Assert
    expect(points.map((point) => point.value)).toEqual([0, 100]);
  });
});

// ── resolveYearRowWindows ────────────────────────────────────────────────────

describe('resolveYearRowWindows', () => {
  it('should cut BOTH sides of a partial row at the current month', () => {
    // Arrange — the YTD row of the running year
    const expenses = [casaFixed(2026, 1, -100), casaFixed(2025, 1, -80)];
    const [partial] = buildEntityYearRows(expenses, casaFixedScope, 2025, { year: 2026, month: 3 }, monthOf);

    // Act
    const windows = resolveYearRowWindows(partial, 3);

    // Assert — same cut on both years, or the baseline would include months 2026 has not lived
    expect(windows.current).toEqual({ year: 2026, upToMonth: 3 });
    expect(windows.baseline).toEqual({ year: 2025, upToMonth: 3 });
  });

  it('should compare a completed row against the whole previous year', () => {
    // Arrange
    const expenses = [casaFixed(2026, 1, -100), casaFixed(2025, 6, -80), casaFixed(2024, 6, -50)];
    const rows = buildEntityYearRows(expenses, casaFixedScope, 2024, { year: 2026, month: 3 }, monthOf);
    const completed = rows.find((row) => row.year === 2025)!;

    // Act
    const windows = resolveYearRowWindows(completed, 3);

    // Assert
    expect(windows.current).toEqual({ year: 2025, upToMonth: null });
    expect(windows.baseline).toEqual({ year: 2024, upToMonth: null });
  });

  it('should return no baseline wherever the row itself has no delta', () => {
    // Arrange — the oldest row, plus a partial row whose previous year is pre-floor
    const expenses = [casaFixed(2026, 1, -100), casaFixed(2025, 6, -80)];
    const chained = buildEntityYearRows(expenses, casaFixedScope, 2025, { year: 2026, month: 3 }, monthOf);
    const [flooredPartial] = buildEntityYearRows(
      [casaFixed(2026, 1, -100)],
      casaFixedScope,
      2026,
      { year: 2026, month: 3 },
      monthOf
    );

    // Act
    const oldestWindows = resolveYearRowWindows(chained[chained.length - 1], 3);
    const flooredWindows = resolveYearRowWindows(flooredPartial, 3);

    // Assert
    expect(oldestWindows.baseline).toBeNull();
    expect(flooredWindows.baseline).toBeNull();
  });
});

// ── buildEntitySubCategoryDeltas ─────────────────────────────────────────────

/** Casa (Spese Fisse) row on a named subcategory. */
function casaSub(year: number, month: number, amount: number, subId: string, subName: string): Expense {
  return makeExpense({
    type: 'fixed',
    amount,
    date: new Date(year, month - 1, 15),
    subCategoryId: subId,
    subCategoryName: subName,
  });
}

describe('buildEntitySubCategoryDeltas', () => {
  it('should compare each subcategory across the two windows and rank the biggest movers first', () => {
    // Arrange — condominio grew, bollette shrank by less
    const expenses = [
      casaSub(2026, 1, -600, 'sub-condominio', 'Condominio'),
      casaSub(2026, 2, -100, 'sub-bollette', 'Bollette'),
      casaSub(2025, 1, -400, 'sub-condominio', 'Condominio'),
      casaSub(2025, 2, -180, 'sub-bollette', 'Bollette'),
    ];

    // Act
    const rows = buildEntitySubCategoryDeltas(
      expenses,
      casaFixedScope.category,
      { year: 2026, upToMonth: 3 },
      { year: 2025, upToMonth: 3 },
      2025,
      monthOf
    );

    // Assert
    expect(rows.map((row) => row.label)).toEqual(['Condominio', 'Bollette']);
    expect(rows[0]).toMatchObject({ current: 600, previous: 400, delta: 200, status: 'ongoing' });
    expect(rows[0].deltaPercent).toBeCloseTo(50);
    expect(rows[1]).toMatchObject({ current: 100, previous: 180, delta: -80 });
    expect(rows[1].deltaPercent).toBeCloseTo(-44.44, 1);
  });

  it('should sum its deltas back to the delta of the year row the windows came from', () => {
    // Arrange — the invariant the UI leans on: the nested rows explain the row above them
    const expenses = [
      casaSub(2026, 1, -600, 'sub-condominio', 'Condominio'),
      casaSub(2026, 2, -100, 'sub-bollette', 'Bollette'),
      casaSub(2026, 2, -55, 'sub-manutenzione', 'Manutenzione'),
      casaSub(2025, 1, -400, 'sub-condominio', 'Condominio'),
      casaSub(2025, 3, -180, 'sub-bollette', 'Bollette'),
      casaFixed(2025, 2, -70), // no subcategory at all — must still be accounted for
    ];
    const [partial] = buildEntityYearRows(expenses, casaFixedScope, 2025, { year: 2026, month: 3 }, monthOf);
    const { current, baseline } = resolveYearRowWindows(partial, 3);

    // Act
    const rows = buildEntitySubCategoryDeltas(
      expenses,
      casaFixedScope.category,
      current,
      baseline,
      2025,
      monthOf
    );

    // Assert
    const summed = rows.reduce((total, row) => total + (row.delta ?? 0), 0);
    expect(summed).toBeCloseTo(partial.delta!);
    expect(rows.reduce((total, row) => total + row.current, 0)).toBeCloseTo(partial.total);
  });

  it('should keep a subcategory that stopped, flagged as gone', () => {
    // Arrange — dropping it would make the surviving rows read as the whole story
    const expenses = [
      casaSub(2026, 1, -300, 'sub-condominio', 'Condominio'),
      casaSub(2025, 1, -300, 'sub-condominio', 'Condominio'),
      casaSub(2025, 2, -120, 'sub-giardino', 'Giardino'),
    ];

    // Act
    const rows = buildEntitySubCategoryDeltas(
      expenses,
      casaFixedScope.category,
      { year: 2026, upToMonth: 3 },
      { year: 2025, upToMonth: 3 },
      2025,
      monthOf
    );

    // Assert
    const giardino = rows.find((row) => row.label === 'Giardino');
    expect(giardino).toMatchObject({ current: 0, previous: 120, delta: -120, status: 'gone' });
  });

  it('should flag a subcategory with no baseline spending as new, with no percentage', () => {
    // Arrange
    const expenses = [
      casaSub(2026, 1, -250, 'sub-mutuo', 'Mutuo'),
      casaSub(2025, 1, -100, 'sub-condominio', 'Condominio'),
    ];

    // Act
    const rows = buildEntitySubCategoryDeltas(
      expenses,
      casaFixedScope.category,
      { year: 2026, upToMonth: 3 },
      { year: 2025, upToMonth: 3 },
      2025,
      monthOf
    );

    // Assert
    const mutuo = rows.find((row) => row.label === 'Mutuo');
    expect(mutuo).toMatchObject({ current: 250, previous: 0, delta: 250, status: 'new' });
    expect(mutuo?.deltaPercent).toBeNull();
  });

  it('should bucket rows without a subcategory under the sentinel key', () => {
    // Arrange
    const expenses = [casaFixed(2026, 1, -90), casaFixed(2025, 1, -40)];

    // Act
    const rows = buildEntitySubCategoryDeltas(
      expenses,
      casaFixedScope.category,
      { year: 2026, upToMonth: 3 },
      { year: 2025, upToMonth: 3 },
      2025,
      monthOf
    );

    // Assert
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe(NO_SUBCATEGORY_KEY);
    expect(rows[0]).toMatchObject({ current: 90, previous: 40, delta: 50 });
  });

  it('should report totals only, ranked by magnitude, when there is no baseline window', () => {
    // Arrange — the oldest year row: no previous year to compare against
    const expenses = [
      casaSub(2025, 1, -100, 'sub-bollette', 'Bollette'),
      casaSub(2025, 2, -700, 'sub-condominio', 'Condominio'),
    ];

    // Act
    const rows = buildEntitySubCategoryDeltas(
      expenses,
      casaFixedScope.category,
      { year: 2025, upToMonth: null },
      null,
      2025,
      monthOf
    );

    // Assert — no delta means no status claim either
    expect(rows.map((row) => row.label)).toEqual(['Condominio', 'Bollette']);
    expect(rows.every((row) => row.delta === null && row.deltaPercent === null)).toBe(true);
    expect(rows.every((row) => row.status === 'ongoing')).toBe(true);
    expect(rows.every((row) => row.previous === 0)).toBe(true);
  });

  it('should ignore rows of another type or another category with the same name', () => {
    // Arrange — a variable "Casa" and an income row must not leak into the fixed one
    const expenses = [
      casaSub(2026, 1, -300, 'sub-condominio', 'Condominio'),
      makeExpense({
        type: 'variable',
        amount: -999,
        categoryId: 'cat-casa-variable',
        categoryName: 'Casa',
        subCategoryId: 'sub-condominio',
        subCategoryName: 'Condominio',
        date: new Date(2026, 0, 20),
      }),
    ];

    // Act
    const rows = buildEntitySubCategoryDeltas(
      expenses,
      casaFixedScope.category,
      { year: 2026, upToMonth: 3 },
      { year: 2025, upToMonth: 3 },
      2025,
      monthOf
    );

    // Assert
    expect(rows).toHaveLength(1);
    expect(rows[0].current).toBeCloseTo(300);
  });

  it('should ignore rows below the history floor on either side', () => {
    // Arrange — the baseline window sits before the floor, so it contributes nothing
    const expenses = [
      casaSub(2026, 1, -300, 'sub-condominio', 'Condominio'),
      casaSub(2025, 1, -900, 'sub-condominio', 'Condominio'),
    ];

    // Act
    const rows = buildEntitySubCategoryDeltas(
      expenses,
      casaFixedScope.category,
      { year: 2026, upToMonth: 3 },
      { year: 2025, upToMonth: 3 },
      2026,
      monthOf
    );

    // Assert
    expect(rows[0]).toMatchObject({ current: 300, previous: 0, delta: 300, status: 'new' });
  });
});
