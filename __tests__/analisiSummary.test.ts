/**
 * Tests for lib/utils/analisiSummary.ts — every number the Analisi page prints that is not
 * already born in comparisonDeltas / cashflowComposition / expenseEntityStats: the period's
 * month count and single-month context, the top expenses, the spending series (per month
 * against the previous year, per year), the flow summary and the year-over-year movers.
 */

import { describe, expect, it } from 'vitest';
import type { Expense, ExpenseType } from '@/types/expenses';
import type { CategoryDeltaRow } from '@/lib/utils/comparisonDeltas';
import {
  buildMonthlySpending,
  buildYearlySpending,
  isPeriodOngoing,
  rankTopExpenses,
  resolveCategoryMovers,
  resolvePeriodThroughMonth,
  resolveSingleMonth,
  summarizeFlow,
  type AnalisiPeriod,
} from '@/lib/utils/analisiSummary';

function makeExpense(overrides: Partial<Expense> & { type: ExpenseType; amount: number; date: Date }): Expense {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    userId: 'u1',
    categoryId: 'cat-cibo',
    categoryName: 'Cibo',
    currency: 'EUR',
    createdAt: new Date(2025, 0, 1),
    updatedAt: new Date(2025, 0, 1),
    ...overrides,
  } as Expense;
}

/** A row on `day` (default 15) of `month` (1-12) in `year`. */
function on(year: number, month: number, overrides: Partial<Expense> & { type: ExpenseType; amount: number }, day = 15): Expense {
  return makeExpense({ ...overrides, date: new Date(year, month - 1, day, 12) });
}

// Fixtures are local-time dates at noon, so the local getters are TZ-safe here.
const monthOf = (expense: Expense) => {
  const date = expense.date as Date;
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
};
const dayOf = (expense: Expense) => {
  const date = expense.date as Date;
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
};

const TODAY = { year: 2026, month: 8 };
const CURRENT: AnalisiPeriod = { mode: 'current', year: 2026, month: null };
const CURRENT_MONTH: AnalisiPeriod = { mode: 'current', year: 2026, month: 8 };
const PAST_MONTH: AnalisiPeriod = { mode: 'current', year: 2026, month: 3 };
const PAST_YEAR: AnalisiPeriod = { mode: 'year', year: 2025, month: null };
const HISTORY: AnalisiPeriod = { mode: 'history', year: null, month: null };

describe('resolveSingleMonth', () => {
  it('should fall back to the running month for the bare current year', () => {
    expect(resolveSingleMonth(CURRENT, TODAY)).toEqual({ year: 2026, month: 8 });
  });

  it('should take an explicitly picked month, in either year mode', () => {
    expect(resolveSingleMonth(PAST_MONTH, TODAY)).toEqual({ year: 2026, month: 3 });
    expect(resolveSingleMonth({ mode: 'year', year: 2025, month: 11 }, TODAY)).toEqual({ year: 2025, month: 11 });
  });

  it('should return null for a past year without a month and for the history', () => {
    expect(resolveSingleMonth(PAST_YEAR, TODAY)).toBeNull();
    expect(resolveSingleMonth(HISTORY, TODAY)).toBeNull();
  });
});

describe('resolvePeriodThroughMonth', () => {
  it('should stop «da inizio anno» at the current month and leave a whole year open', () => {
    expect(resolvePeriodThroughMonth({ mode: 'ytd', year: 2026, month: null }, TODAY)).toBe(8);
    // A whole year has no upper month: it runs to December, scheduled rows included.
    expect(resolvePeriodThroughMonth(CURRENT, TODAY)).toBeNull();
    expect(resolvePeriodThroughMonth(PAST_YEAR, TODAY)).toBeNull();
  });

  it('should let a picked month win over the mode, and have none for the history', () => {
    expect(resolvePeriodThroughMonth(PAST_MONTH, TODAY)).toBe(PAST_MONTH.month);
    expect(resolvePeriodThroughMonth(HISTORY, TODAY)).toBeNull();
  });
});

describe('isPeriodOngoing', () => {
  it('should be ongoing for the running year, the running month and the history', () => {
    expect(isPeriodOngoing(CURRENT, TODAY)).toBe(true);
    expect(isPeriodOngoing(CURRENT_MONTH, TODAY)).toBe(true);
    expect(isPeriodOngoing(HISTORY, TODAY)).toBe(true);
  });

  it('should be closed for a past month and a past year', () => {
    expect(isPeriodOngoing(PAST_MONTH, TODAY)).toBe(false);
    expect(isPeriodOngoing(PAST_YEAR, TODAY)).toBe(false);
  });
});

describe('rankTopExpenses', () => {
  const rows = [
    on(2026, 8, { type: 'variable', amount: -1180, categoryId: 'cat-vac', categoryName: 'Vacanze', subCategoryId: 'sub-volo', subCategoryName: 'Volo' }, 12),
    on(2026, 3, { type: 'fixed', amount: -940, categoryId: 'cat-auto', categoryName: 'Auto', subCategoryId: 'sub-ass', subCategoryName: 'Assicurazione' }, 3),
    on(2026, 7, { type: 'fixed', amount: -860, categoryId: 'cat-casa', categoryName: 'Casa' }),
    on(2026, 5, { type: 'variable', amount: -720, categoryId: 'cat-vac', categoryName: 'Vacanze', subCategoryId: 'sub-hotel', subCategoryName: 'Hotel' }, 22),
    on(2026, 1, { type: 'variable', amount: -650, categoryId: 'cat-sal', categoryName: 'Salute' }, 8),
    on(2026, 2, { type: 'variable', amount: -50, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    on(2026, 2, { type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    on(2026, 2, { type: 'transfer', amount: 500, categoryId: 'cat-giro', categoryName: 'Giroconto' }),
  ];

  it('should rank spending rows by magnitude, capped, with the share of the period spending', () => {
    // Act
    const top = rankTopExpenses(rows, dayOf, 5);

    // Assert
    expect(top.count).toBe(6);
    expect(top.total).toBe(4400);
    expect(top.rows).toHaveLength(5);
    expect(top.rows[0]).toMatchObject({
      label: 'Vacanze',
      subCategoryLabel: 'Volo',
      caption: '12 ago · Volo',
      amount: 1180,
      expenseType: 'variable',
      categoryKey: 'cat-vac',
      subCategoryKey: 'sub-volo',
    });
    expect(top.rows[0].percentage).toBeCloseTo((1180 / 4400) * 100, 5);
    expect(top.rows[2]).toMatchObject({ label: 'Casa', caption: '15 lug', subCategoryLabel: null, subCategoryKey: null });
    expect(top.shownTotal).toBe(4350);
  });

  it('should treat a subcategory name without an id as no subcategory', () => {
    const top = rankTopExpenses([on(2026, 2, { type: 'variable', amount: -90, categoryId: 'cat-x', categoryName: 'Extra', subCategoryName: 'Orfana' })], dayOf);
    expect(top.rows[0]).toMatchObject({ caption: '15 feb', subCategoryLabel: null, subCategoryKey: null });
  });

  it('should never rank income or transfers', () => {
    const top = rankTopExpenses(rows, dayOf, 10);
    expect(top.rows.map((row) => row.label)).not.toContain('Stipendio');
    expect(top.rows.map((row) => row.label)).not.toContain('Giroconto');
  });

  it('should return an empty ranking without spending', () => {
    expect(rankTopExpenses([on(2026, 1, { type: 'income', amount: 100 })], dayOf)).toEqual({ rows: [], shownTotal: 0, total: 0, count: 0 });
  });
});

describe('buildMonthlySpending', () => {
  const rows = [
    on(2026, 1, { type: 'variable', amount: -300 }),
    on(2026, 1, { type: 'fixed', amount: -100 }),
    on(2026, 3, { type: 'variable', amount: -250 }),
    on(2026, 3, { type: 'income', amount: 2000 }),
    on(2025, 1, { type: 'variable', amount: -350 }),
    on(2025, 2, { type: 'variable', amount: -120 }),
  ];

  it('should give one point per month up to the cut, with the same month of the previous year', () => {
    // Act
    const points = buildMonthlySpending(rows, 2026, 3, 2024, monthOf, TODAY);

    // Assert
    expect(points.map((p) => p.key)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(points.map((p) => p.label)).toEqual(['Gen', 'Feb', 'Mar']);
    expect(points.map((p) => p.value)).toEqual([400, 0, 250]);
    // A tracked previous year with no rows in a month is a real 0, not a gap.
    expect(points.map((p) => p.prevYearValue)).toEqual([350, 120, 0]);
    expect(points.every((p) => !p.ongoing)).toBe(true);
  });

  it('should mark the running month and leave the previous year null below the history floor', () => {
    const points = buildMonthlySpending(rows, 2026, 8, 2026, monthOf, TODAY);
    expect(points).toHaveLength(8);
    expect(points[7]).toMatchObject({ key: '2026-08', ongoing: true, prevYearValue: null });
    expect(points.every((p) => p.prevYearValue === null)).toBe(true);
  });

  it('should leave the previous year null when that year has no rows at all', () => {
    const onlyThisYear = rows.filter((row) => monthOf(row).year === 2026);
    const points = buildMonthlySpending(onlyThisYear, 2026, 3, 2024, monthOf, TODAY);
    expect(points.every((p) => p.prevYearValue === null)).toBe(true);
  });
});

describe('buildYearlySpending', () => {
  it('should give one point per year from the first tracked year to today, gap-free, flagging the running year', () => {
    const rows = [
      on(2024, 5, { type: 'variable', amount: -100 }),
      on(2026, 2, { type: 'fixed', amount: -40 }),
      on(2023, 2, { type: 'fixed', amount: -999 }),
    ];

    const points = buildYearlySpending(rows, 2024, monthOf, TODAY);

    expect(points.map((p) => p.key)).toEqual(['2024', '2025', '2026']);
    expect(points.map((p) => p.value)).toEqual([100, 0, 40]);
    expect(points.map((p) => p.ongoing)).toEqual([false, false, true]);
    expect(points.every((p) => p.prevYearValue === null)).toBe(true);
  });

  it('should start at the first year with data when the floor is older', () => {
    const points = buildYearlySpending([on(2025, 5, { type: 'variable', amount: -10 })], 2020, monthOf, TODAY);
    expect(points.map((p) => p.key)).toEqual(['2025', '2026']);
  });
});

describe('summarizeFlow', () => {
  const rows = [
    on(2026, 1, { type: 'income', amount: 3000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    on(2026, 2, { type: 'income', amount: 200, categoryId: 'cat-div', categoryName: 'Dividendi' }),
    on(2026, 1, { type: 'fixed', amount: -1160, categoryId: 'cat-casa', categoryName: 'Casa' }),
    on(2026, 1, { type: 'variable', amount: -740, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    on(2026, 1, { type: 'variable', amount: -50, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    on(2026, 1, { type: 'debt', amount: -100, categoryId: 'cat-mutuo', categoryName: 'Mutuo' }),
    on(2026, 1, { type: 'transfer', amount: 400, categoryId: 'cat-giro', categoryName: 'Giroconto' }),
  ];

  it('should count sources, categories and the type shares of the spending', () => {
    const flow = summarizeFlow(rows);

    expect(flow.incomeTotal).toBe(3200);
    expect(flow.incomeSources).toBe(2);
    expect(flow.expensesTotal).toBe(2050);
    expect(flow.categoryCount).toBe(3);
    expect(flow.typeShares.map((share) => share.label)).toEqual(['Fisse', 'Variabili', 'Debiti']);
    expect(flow.typeShares.map((share) => share.amount)).toEqual([1160, 790, 100]);
    expect(flow.typeShares[0].percentage).toBeCloseTo((1160 / 2050) * 100, 5);
  });

  it('should omit a type with no spending and count a same-named category under two types twice', () => {
    const flow = summarizeFlow([
      on(2026, 1, { type: 'fixed', amount: -10, categoryId: 'cat-a', categoryName: 'Casa' }),
      on(2026, 1, { type: 'variable', amount: -10, categoryId: 'cat-b', categoryName: 'Casa' }),
    ]);
    expect(flow.typeShares.map((share) => share.type)).toEqual(['fixed', 'variable']);
    expect(flow.categoryCount).toBe(2);
    expect(flow.incomeSources).toBe(0);
  });
});

describe('resolveCategoryMovers', () => {
  const row = (label: string, delta: number, previous = 100): CategoryDeltaRow => ({
    key: `variable:${label}`,
    expenseType: 'variable',
    categoryKey: label,
    label,
    current: previous + delta,
    previous,
    delta,
    deltaPercent: previous === 0 ? null : (delta / previous) * 100,
    status: previous === 0 ? 'new' : 'ongoing',
  });

  it('should pick the largest rise and the largest fall', () => {
    const movers = resolveCategoryMovers([row('Alimentari', -400), row('Vacanze', 1100), row('Auto', 300), row('Sport', -30)]);
    expect(movers.grown).toMatchObject({ label: 'Vacanze', delta: 1100 });
    expect(movers.shrunk).toMatchObject({ label: 'Alimentari', delta: -400 });
  });

  it('should return null on a side with no mover', () => {
    expect(resolveCategoryMovers([row('Auto', 300)])).toMatchObject({ grown: { label: 'Auto' }, shrunk: null });
    expect(resolveCategoryMovers([])).toEqual({ grown: null, shrunk: null });
  });
});
