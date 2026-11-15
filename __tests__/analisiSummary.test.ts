/**
 * Tests for lib/utils/analisiSummary.ts — every number the Analisi page prints that is not
 * already born in comparisonDeltas / cashflowComposition / expenseEntityStats: the period's
 * month count and single-month context, the top expenses, the spending series (per month
 * against the previous year, per year), the flow summary and the year-over-year movers; since
 * 2026-10-14 the phone's strip, whose identity with the Flusso reads analisiNarrative — so
 * chartService's Firebase chain is mocked as in analisiNarrative.test.ts.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));
import type { Expense, ExpenseType } from '@/types/expenses';
import type { CategoryDeltaRow } from '@/lib/utils/comparisonDeltas';
import { cachedFormatCurrencyEUR, formatEuroMinus } from '@/lib/utils/formatters';
import { narrativeToText } from '@/lib/utils/narrative';
import { formatFlowAmount } from '@/lib/utils/analisiNarrative';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { summarizePeriodCashflow } from '@/lib/utils/tracciamentoSummary';
import { formatStripFigure, liftedBlocks, validateStrip, type StripFigure } from '@/lib/utils/verdictStrip';
import { RING_REST_KEY } from '@/lib/utils/ringChart';
import {
  ANALISI_SAVINGS_BLOCK,
  ANALISI_SECTION_IDS,
  ANALISI_TRIO_BLOCK,
  SPENDING_TYPE_LABELS,
  TOP_EXPENSES_MORE,
  TOP_EXPENSES_SHOWN,
  selectAnalisiStrip,
  buildMonthlySpending,
  buildRingShares,
  buildSubCategoryRanking,
  limitTopExpenses,
  noteLabel,
  summarizeCategoryChanges,
  buildTypeFlowBreakdown,
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

  it('should mean no month for a month that has not started — its calendar has no average to run hot against', () => {
    expect(resolveSingleMonth({ mode: 'current', year: 2026, month: 12 }, TODAY)).toBeNull();
    expect(resolveSingleMonth({ mode: 'year', year: 2027, month: 1 }, TODAY)).toBeNull();
    expect(resolveSingleMonth(CURRENT_MONTH, TODAY)).toEqual({ year: 2026, month: 8 });
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
      caption: 'Volo · 12 ago',
      amount: 1180,
      expenseType: 'variable',
      categoryKey: 'cat-vac',
      subCategoryKey: 'sub-volo',
    });
    expect(top.rows[0].percentage).toBeCloseTo((1180 / 4400) * 100, 5);
    expect(top.rows[2]).toMatchObject({ label: 'Casa', caption: '15 lug', subCategoryLabel: null, subCategoryKey: null });
    expect(top.shownTotal).toBe(4350);
  });

  it('should say in the caption when a ranked row is still in the calendar', () => {
    // The Scheduled-Is-Not-Spent Rule: a row dated ahead ranks (it is in the total) and says so.
    const top = rankTopExpenses(rows, dayOf, 5, (expense) => monthOf(expense).month >= 8);
    expect(top.rows[0]).toMatchObject({ caption: 'Volo · 12 ago · in calendario', scheduled: true });
    expect(top.rows[2]).toMatchObject({ caption: '15 lug', scheduled: false });
    // The default is nothing scheduled.
    expect(rankTopExpenses(rows, dayOf, 5).rows.every((row) => !row.scheduled)).toBe(true);
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

  // Spese maggiori shows ten and unfolds to twenty (2026-11-12): the page ranks twenty, the tile cuts.
  // Seen red with the `limit` default left at five and with `limitTopExpenses` keeping the whole sum.
  it('should rank up to twenty rows and let the tile sum the ten it shows', () => {
    const many = Array.from({ length: 25 }, (_, index) => on(2026, 1, { type: 'variable', amount: -(100 + index * 10), categoryId: 'cat-x', categoryName: 'Extra' }));
    const top = rankTopExpenses(many, dayOf, TOP_EXPENSES_MORE);
    expect(top.rows).toHaveLength(20);
    expect(top.count).toBe(25);
    const shown = limitTopExpenses(top, TOP_EXPENSES_SHOWN);
    expect(shown.rows).toHaveLength(10);
    // The ten largest: 340, 330 … 250.
    expect(shown.shownTotal).toBe(2950);
    expect(shown.total).toBe(top.total);
    expect(shown.count).toBe(25);
  });

  // A row with a note is named by what it was (2026-11-12): the note's first line, the category in
  // the caption. Seen red with `note` dropped from the row and with the cut removed.
  it('should label a row by the first line of its note, the category moving to the caption', () => {
    const top = rankTopExpenses(
      [on(2026, 3, { type: 'fixed', amount: -1800, categoryId: 'cat-casa', categoryName: 'Casa', notes: 'Caldaia nuova\nfattura 12' }, 14)],
      dayOf,
    );
    expect(top.rows[0]).toMatchObject({ note: 'Caldaia nuova', label: 'Casa', caption: 'Casa · 14 mar' });
    const plain = rankTopExpenses([on(2026, 3, { type: 'fixed', amount: -50, categoryId: 'cat-casa', categoryName: 'Casa', notes: '   ' }, 14)], dayOf);
    expect(plain.rows[0]).toMatchObject({ note: null, caption: '14 mar' });
  });

  // The caption reads from the widest fact to the narrowest (owner, 2026-11-15, the mirror tour): the
  // category, the subcategory, then the day — «Casa · Arredamento · 12 mar». Seen red with the day
  // left before the subcategory.
  it('should caption a noted row category, subcategory, day', () => {
    const top = rankTopExpenses(
      [on(2026, 3, { type: 'fixed', amount: -1000, categoryId: 'cat-casa', categoryName: 'Casa', subCategoryId: 'sub-ar', subCategoryName: 'Arredamento', notes: 'Divano nuovo' }, 12)],
      dayOf,
    );
    expect(top.rows[0]).toMatchObject({ note: 'Divano nuovo', caption: 'Casa · Arredamento · 12 mar' });
  });

  it('should cut a long note at 48 characters with an ellipsis', () => {
    const long = 'Manutenzione straordinaria della caldaia a condensazione del piano terra';
    expect(long.length).toBeGreaterThan(60);
    const label = noteLabel(on(2026, 1, { type: 'fixed', amount: -10, notes: long }));
    expect(label).toHaveLength(48);
    expect(label!.endsWith('…')).toBe(true);
    expect(noteLabel(on(2026, 1, { type: 'fixed', amount: -10, notes: 'x'.repeat(48) }))).toBe('x'.repeat(48));
    expect(noteLabel(on(2026, 1, { type: 'fixed', amount: -10 }))).toBeNull();
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
    expect(flow.typeShares.map((share) => share.label)).toEqual(['Necessarie', 'Non necessarie', 'Debiti']);
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

  it('should round the printed shares once, so three equal types print 34 + 33 + 33', () => {
    const flow = summarizeFlow([
      on(2026, 1, { type: 'fixed', amount: -1000, categoryId: 'cat-a', categoryName: 'Casa' }),
      on(2026, 1, { type: 'variable', amount: -1000, categoryId: 'cat-b', categoryName: 'Cibo' }),
      on(2026, 1, { type: 'debt', amount: -1000, categoryId: 'cat-c', categoryName: 'Mutuo' }),
    ]);
    expect(flow.typeShares.map((share) => share.printedPercentage)).toEqual([34, 33, 33]);
  });

  it('should take a negative drift off the largest share: 16.6 + 16.6 + 66.8 rounds to 101', () => {
    // 166 + 166 + 668 of 1000: 17 + 17 + 67 = 101, so the largest prints 66.
    const flow = summarizeFlow([
      on(2026, 1, { type: 'fixed', amount: -166, categoryId: 'cat-a', categoryName: 'Casa' }),
      on(2026, 1, { type: 'variable', amount: -668, categoryId: 'cat-b', categoryName: 'Cibo' }),
      on(2026, 1, { type: 'debt', amount: -166, categoryId: 'cat-c', categoryName: 'Mutuo' }),
    ]);
    expect(flow.typeShares.map((share) => [share.type, share.printedPercentage])).toEqual([
      ['variable', 66],
      ['fixed', 17],
      ['debt', 17],
    ]);
  });

  it('should hand the drift of an uneven period to the largest share too', () => {
    const flow = summarizeFlow(rows);
    // 1160 / 790 / 100 of 2050: 56.6 + 38.5 + 4.9 → 57 + 39 + 5 = 101, the largest takes it back.
    expect(flow.typeShares.map((share) => share.printedPercentage)).toEqual([56, 39, 5]);
    expect(flow.typeShares.reduce((sum, share) => sum + share.printedPercentage, 0)).toBe(100);
  });
});

describe('buildTypeFlowBreakdown', () => {
  const rows = [
    on(2026, 1, { type: 'income', amount: 3000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    on(2026, 1, { type: 'fixed', amount: -1000, categoryId: 'cat-casa', categoryName: 'Casa' }),
    on(2026, 1, { type: 'fixed', amount: -200, categoryId: 'cat-luce', categoryName: 'Bollette' }),
    on(2026, 1, { type: 'variable', amount: -500, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    on(2026, 2, { type: 'variable', amount: -300, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    on(2026, 1, { type: 'variable', amount: -900, categoryId: 'cat-casa-v', categoryName: 'Casa' }),
    on(2026, 1, { type: 'transfer', amount: 400, categoryId: 'cat-giro', categoryName: 'Giroconto' }),
  ];

  it('should give the bar the very type shares the reading prints, in its order', () => {
    const flow = summarizeFlow(rows);
    const breakdown = buildTypeFlowBreakdown(rows, flow);

    expect(breakdown.blocks.map((block) => [block.type, block.amount, block.percentage])).toEqual(
      flow.typeShares.map((share) => [share.type, share.amount, share.percentage])
    );
    expect(breakdown.blocks.map((block) => block.type)).toEqual(['variable', 'fixed']);
  });

  // Two «Casa» documents with their own ids: the key already tells them apart. The case the
  // per-type map exists for — the same name-derived key under two types — is the legacy test below.
  it("should rank each type's categories and sum them to the type", () => {
    const breakdown = buildTypeFlowBreakdown(rows, summarizeFlow(rows));
    const [variable, fixed] = breakdown.blocks;

    expect(variable.categories).toEqual([
      { categoryKey: 'cat-casa-v', categoryName: 'Casa', value: 900 },
      { categoryKey: 'cat-cibo', categoryName: 'Cibo', value: 800 },
    ]);
    expect(fixed.categories.map((category) => category.categoryKey)).toEqual(['cat-casa', 'cat-luce']);
    for (const block of breakdown.blocks) {
      expect(block.categories.reduce((sum, category) => sum + category.value, 0)).toBe(block.amount);
    }
  });

  it('should put the surplus outside the bar, and the deficit when spending runs past income', () => {
    expect(buildTypeFlowBreakdown(rows, summarizeFlow(rows))).toMatchObject({ spending: 2900, income: 3000, surplus: 100, deficit: 0, incomeEdge: null, noIncome: false, absence: null });

    const short = [...rows, on(2026, 3, { type: 'debt', amount: -600, categoryId: 'cat-mutuo', categoryName: 'Mutuo' })];
    const breakdown = buildTypeFlowBreakdown(short, summarizeFlow(short));
    expect(breakdown).toMatchObject({ surplus: 0, deficit: 500 });
    expect(breakdown.blocks.map((block) => block.type)).toEqual(['variable', 'fixed', 'debt']);
  });

  it('should keep two legacy rows named «Casa», one fixed and one variable, in their own type blocks', () => {
    // No categoryId: both fall back to the name, so the key alone is «Casa» for both.
    const legacy = [
      on(2026, 1, { type: 'fixed', amount: -700, categoryId: undefined, categoryName: 'Casa' }),
      on(2026, 1, { type: 'variable', amount: -300, categoryId: undefined, categoryName: 'Casa' }),
    ];
    const breakdown = buildTypeFlowBreakdown(legacy, summarizeFlow(legacy));

    expect(breakdown.blocks.map((block) => [block.type, block.categories])).toEqual([
      ['fixed', [{ categoryKey: 'Casa', categoryName: 'Casa', value: 700 }]],
      ['variable', [{ categoryKey: 'Casa', categoryName: 'Casa', value: 300 }]],
    ]);
  });

  it('should place the income line where the income ends when spending runs past it', () => {
    const over = [
      on(2026, 1, { type: 'income', amount: 1000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      on(2026, 1, { type: 'fixed', amount: -1250, categoryId: 'cat-casa', categoryName: 'Casa' }),
    ];
    expect(buildTypeFlowBreakdown(over, summarizeFlow(over))).toMatchObject({ deficit: 250, incomeEdge: 80, noIncome: false });
  });

  it('should draw no income line in a month with no income yet, and say so', () => {
    const beforePayday = [on(2026, 1, { type: 'variable', amount: -400, categoryId: 'cat-cibo', categoryName: 'Cibo' })];
    expect(buildTypeFlowBreakdown(beforePayday, summarizeFlow(beforePayday))).toMatchObject({
      income: 0,
      deficit: 400,
      incomeEdge: null,
      noIncome: true,
    });
  });

  it('should read a net reversal of income as signed, with no line left of the bar', () => {
    const reversed = [
      on(2026, 1, { type: 'income', amount: -200, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      on(2026, 1, { type: 'variable', amount: -400, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
    ];
    expect(buildTypeFlowBreakdown(reversed, summarizeFlow(reversed))).toMatchObject({
      income: -200,
      spending: 400,
      deficit: 600,
      incomeEdge: null,
      noIncome: true,
    });
  });

  it('should name the absence when nothing flows: no row, or rows that come to nothing', () => {
    expect(buildTypeFlowBreakdown([], summarizeFlow([]))).toMatchObject({ blocks: [], absence: 'missing' });
    const cancelled = [
      on(2026, 1, { type: 'income', amount: 500, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      on(2026, 1, { type: 'income', amount: -500, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      on(2026, 1, { type: 'transfer', amount: 400, categoryId: 'cat-giro', categoryName: 'Giroconto' }),
    ];
    expect(buildTypeFlowBreakdown(cancelled, summarizeFlow(cancelled))).toMatchObject({ absence: 'zero' });
    // Only a transfer: nothing the flow counts was recorded.
    const onlyTransfer = [on(2026, 1, { type: 'transfer', amount: 400, categoryId: 'cat-giro', categoryName: 'Giroconto' })];
    expect(buildTypeFlowBreakdown(onlyTransfer, summarizeFlow(onlyTransfer))).toMatchObject({ absence: 'missing' });
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

/**
 * The phone's two cells (2026-10-14). Each prints EXACTLY what the tile it lifts prints:
 * «Entrate» the trio's value (`cachedFormatCurrencyEUR(v, true)`), «Risparmio» the trio's net
 * (`formatEuroMinus`: «−» only on a negative, a printed zero unsigned) AND the header of the
 * Flusso's «Risparmio» block on a phone (`FlowShareMobile`'s header, `formatFlowAmount` of the
 * surplus, which is the net on this fixture). Seen red: `signed-currency` on
 * «Risparmio» («+1150 €» against the trio's «1150 €»); the block's header printed with the cents.
 */
describe('selectAnalisiStrip', () => {
  const plain = (text: string) => text.replace(/[  ]/g, ' ');
  const cellText = (figure: StripFigure) => plain(narrativeToText([formatStripFigure(figure)!]));
  const KNOWN = [...Object.values(ANALISI_SECTION_IDS), VERDICT_REST_SECTION];
  const rows = [
    on(2026, 1, { type: 'income', amount: 3000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    on(2026, 1, { type: 'fixed', amount: -1200, categoryId: 'cat-casa', categoryName: 'Casa' }),
    on(2026, 1, { type: 'variable', amount: -650, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
  ];

  // «Risparmio» opens the Periodo, the tile whose reading is the savings (2026-11-12); seen red with
  // `opens` left on the Flusso, which is no row any more.
  it('should open the Entrate and Periodo rows, lift the trio and the Flusso block, and pass the strip rules', () => {
    const strip = selectAnalisiStrip(summarizePeriodCashflow(rows));
    expect(strip.map((figure) => figure.label)).toEqual(['Entrate', 'Risparmio']);
    expect(strip.map((figure) => figure.opens)).toEqual([ANALISI_SECTION_IDS.entrate, ANALISI_SECTION_IDS.periodo]);
    expect(validateStrip(strip, KNOWN)).toEqual([]);
    expect(liftedBlocks(strip, ANALISI_SECTION_IDS.periodo)).toEqual([ANALISI_TRIO_BLOCK]);
    expect(liftedBlocks(strip, ANALISI_SECTION_IDS.flusso)).toEqual([ANALISI_SAVINGS_BLOCK]);
  });

  it('should print each cell as the trio prints it — positive, negative with the U+2212, zero unsigned', () => {
    const totals = summarizePeriodCashflow(rows);
    const [income, net] = selectAnalisiStrip(totals);
    expect(cellText(income)).toBe(plain(cachedFormatCurrencyEUR(totals.income, true)));
    expect(cellText(net)).toBe(plain(formatEuroMinus(totals.net)));
    for (const value of [-430, -0.3, 0]) {
      const [, cell] = selectAnalisiStrip({ income: 1000, expenses: 1000 - value, net: value });
      expect(cellText(cell)).toBe(plain(formatEuroMinus(value)));
    }
  });

  it('should print «Risparmio» as the Flusso block on a phone prints what was put aside', () => {
    const totals = summarizePeriodCashflow(rows);
    const breakdown = buildTypeFlowBreakdown(rows, summarizeFlow(rows));
    expect(breakdown.surplus).toBe(totals.net);
    const [, net] = selectAnalisiStrip(totals);
    expect(cellText(net)).toBe(plain(formatFlowAmount(breakdown.surplus)));
  });

  it('should have no strip with nothing flowed or before the period starts', () => {
    expect(selectAnalisiStrip({ income: 0, expenses: 0, net: 0 })).toEqual([]);
    expect(selectAnalisiStrip(summarizePeriodCashflow(rows), { notStarted: true })).toEqual([]);
    expect(selectAnalisiStrip({ income: 0, expenses: 300, net: -300 })).toHaveLength(2);
  });
});

describe('SPENDING_TYPE_LABELS', () => {
  // The types read «Spese Necessarie» / «Spese Non Necessarie» since 2026-10-20 (ids unchanged).
  it('should name the types as the rest of the app does', () => {
    expect(Object.values(SPENDING_TYPE_LABELS)).toEqual(['Necessarie', 'Non necessarie', 'Debiti']);
  });
});

/**
 * «Dove vanno i soldi» in its «Sottocategorie» view (2026-11-12): one row per (type, category,
 * subcategory), a row without a subcategory under its category's own name. Seen red with the key
 * built without the category (S1) and with the type qualifier never applied (S1b).
 */
describe('buildSubCategoryRanking', () => {
  it('should keep one subcategory name under two categories as two rows', () => {
    const ranking = buildSubCategoryRanking([
      on(2026, 1, { type: 'fixed', amount: -300, categoryId: 'cat-casa', categoryName: 'Casa', subCategoryId: 'sub-cond', subCategoryName: 'Condominio' }),
      on(2026, 1, { type: 'fixed', amount: -50, categoryId: 'cat-box', categoryName: 'Box', subCategoryId: 'sub-cond', subCategoryName: 'Condominio' }),
      on(2026, 1, { type: 'fixed', amount: -150, categoryId: 'cat-casa', categoryName: 'Casa' }),
      on(2026, 1, { type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ]);
    expect(ranking.map((row) => [row.name, row.caption, row.value])).toEqual([
      ['Condominio', 'Casa', 300],
      ['Casa', 'senza sottocategoria', 150],
      ['Condominio', 'Box', 50],
    ]);
    expect(ranking[0]).toMatchObject({ expenseType: 'fixed', categoryKey: 'cat-casa', subCategoryKey: 'sub-cond' });
    expect(ranking[0].percentage).toBe(60);
  });

  it('should name the type when two categories share a name across types', () => {
    const shared = buildSubCategoryRanking([
      on(2026, 1, { type: 'fixed', amount: -200, categoryId: 'cat-casa-n', categoryName: 'Casa' }),
      on(2026, 1, { type: 'variable', amount: -100, categoryId: 'cat-casa-v', categoryName: 'Casa' }),
    ]);
    expect(shared.map((row) => row.caption)).toEqual(['senza sottocategoria · necessarie', 'senza sottocategoria · non necessarie']);
    const alone = buildSubCategoryRanking([on(2026, 1, { type: 'fixed', amount: -200, categoryId: 'cat-casa', categoryName: 'Casa' })]);
    expect(alone.map((row) => row.caption)).toEqual(['senza sottocategoria']);
  });
});

/**
 * The legend of a ring adds up to 100 ON SCREEN (AGENTS.md): the drift goes on «Altre», the row that
 * is a remainder by definition. Seen red with the drift dropped and with the drift on the largest.
 */
describe('buildRingShares', () => {
  const slice = (key: string, value: number) => ({ key, name: key, value, percentage: 0 });

  it('should name the first three and fold the rest into ONE row carrying the drift', () => {
    const shares = buildRingShares([slice('A', 700), slice('B', 700), slice('C', 700), slice('D', 100), slice('E', 100)], 3);
    expect(shares.map((share) => [share.label, share.printedPercentage, share.rest])).toEqual([
      ['A', 30, false],
      ['B', 30, false],
      ['C', 30, false],
      ['Altre 2 categorie', 10, true],
    ]);
    expect(shares[3].key).toBe(RING_REST_KEY);
    expect(shares[3].value).toBe(200);
  });

  it('should keep a single leftover by its name, the drift then on the largest', () => {
    const shares = buildRingShares([slice('A', 700), slice('B', 700), slice('C', 700), slice('D', 100)], 3);
    expect(shares.map((share) => share.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(shares.some((share) => share.rest)).toBe(false);
    expect(shares.reduce((sum, share) => sum + share.printedPercentage, 0)).toBe(100);
  });

  it('should return nothing for an empty whole', () => {
    expect(buildRingShares([], 3)).toEqual([]);
  });
});

/**
 * «Cosa è cambiato» (2026-11-12): the six largest movers ordered by signed delta, the fewest movers
 * in the total's direction that explain it. Seen red ordered by magnitude (C1) and without the
 * `break` once the total is reached (C4).
 */
describe('summarizeCategoryChanges', () => {
  const row = (label: string, delta: number, status: CategoryDeltaRow['status'] = 'ongoing'): CategoryDeltaRow => ({
    key: `variable:${label}`,
    expenseType: 'variable',
    categoryKey: label,
    label,
    current: status === 'gone' ? 0 : 100 + delta,
    previous: status === 'new' ? 0 : 100,
    delta,
    deltaPercent: status === 'new' ? null : delta,
    status,
  });

  it('should order the movers by signed delta and find the fewest that explain a fall', () => {
    const changes = summarizeCategoryChanges([row('Casa', 40), row('Palestra', -60, 'gone'), row('Alimentari', -100)], -120);
    expect(changes.rows.map((r) => [r.label, r.delta])).toEqual([
      ['Casa', 40],
      ['Palestra', -60],
      ['Alimentari', -100],
    ]);
    expect(changes.explainedBy.map((r) => r.label)).toEqual(['Alimentari', 'Palestra']);
    expect(changes.explainedShare).toBeNull();
    expect(changes.goneLabels).toEqual(['Palestra']);
    expect(changes.newLabels).toEqual([]);
    // A rise right of the centre, a fall left of it, the largest filling its half.
    expect(changes.rows[0].bar).toEqual({ left: 50, width: 20 });
    expect(changes.rows[2].bar).toEqual({ left: 0, width: 50 });
  });

  it('should give the share of a total three movers do not reach', () => {
    const changes = summarizeCategoryChanges([row('Viaggi', 500), row('Casa', 400), row('Cibo', 300), row('Auto', 100)], 1300);
    expect(changes.explainedBy.map((r) => r.label)).toEqual(['Viaggi', 'Casa', 'Cibo']);
    expect(changes.explainedShare).toBeCloseTo((1200 / 1300) * 100, 5);
  });

  it('should explain nothing when the total is zero', () => {
    const changes = summarizeCategoryChanges([row('Casa', 40), row('Cibo', -40)], 0);
    expect(changes.explainedBy).toEqual([]);
    expect(changes.explainedShare).toBeNull();
    expect(changes.rows).toHaveLength(2);
  });

  it('should stop at the first mover that reaches the total', () => {
    const changes = summarizeCategoryChanges([row('Alimentari', -150), row('Palestra', -30), row('Casa', 60)], -120);
    expect(changes.explainedBy.map((r) => r.label)).toEqual(['Alimentari']);
    expect(changes.explainedShare).toBeNull();
  });

  it('should keep the six largest and drop the rows that print zero', () => {
    const many = [10, -20, 30, -40, 50, -60, 70, 0.3].map((delta, index) => row(`C${index}`, delta));
    const changes = summarizeCategoryChanges(many, 40);
    expect(changes.rows).toHaveLength(6);
    expect(changes.rows.map((r) => r.label)).not.toContain('C0');
    expect(changes.rows.map((r) => r.label)).not.toContain('C7');
  });
});
