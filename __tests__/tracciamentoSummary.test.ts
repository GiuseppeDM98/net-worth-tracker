/**
 * Tests for lib/utils/tracciamentoSummary.ts — every number the Cashflow › Tracciamento
 * page shows that is not a raw expense: the period totals, the previous-period delta, the
 * anchored month series behind the two charts, the savings history, the category ranking
 * with its residual and the movements count. Pure: no React, no Firebase.
 *
 * Classification is ALWAYS by `type`, never by the sign of `amount` (AGENTS.md → Expense
 * Sign Convention): every fixture carries an explicit type, and one income row is negative
 * on purpose (a reversal) to prove the rule.
 */

import { describe, expect, it } from 'vitest';
import type { Expense } from '@/types/expenses';
import type { Period } from '@/lib/utils/period';
import { endOfMonthBound } from '@/lib/utils/dateHelpers';
import {
  buildTrailingMonthFlows,
  computePeriodDelta,
  currentComparisonWindow,
  filterExpensesByPeriod,
  isScheduledRow,
  previousPeriod,
  rankCategories,
  resolveAnchorMonth,
  resolveFlowWindow,
  resolvePeriodCalendar,
  splitSpendingAtDate,
  summarizeMovements,
  summarizePeriodCashflow,
  summarizeSavingsHistory,
  summarizeScheduled,
} from '@/lib/utils/tracciamentoSummary';

function makeExpense(overrides: Partial<Expense> & { amount: number; date: Date }): Expense {
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    type: 'variable',
    categoryId: 'cat-var',
    categoryName: 'Spesa',
    currency: 'EUR',
    ...overrides,
    createdAt: overrides.date,
    updatedAt: overrides.date,
  } as Expense;
}

/** Noon on the 15th: twelve hours clear of any DST edge, in every timezone the suite runs in. */
const d = (year: number, month: number, day = 15, hour = 12) => new Date(year, month - 1, day, hour);

const AUGUST: Period = { kind: 'month', year: 2026, month: 8 };
const NOW = d(2026, 8, 22);

const AUGUST_ROWS: Expense[] = [
  makeExpense({ type: 'income', amount: 4200, categoryId: 'cat-salary', categoryName: 'Stipendio', date: d(2026, 8, 3) }),
  makeExpense({ type: 'income', amount: 650, categoryId: 'cat-div', categoryName: 'Dividendi', date: d(2026, 8, 15) }),
  makeExpense({ type: 'fixed', amount: -1150, categoryId: 'cat-home', categoryName: 'Casa', date: d(2026, 8, 1) }),
  makeExpense({ type: 'variable', amount: -520, categoryId: 'cat-food', categoryName: 'Alimentari', date: d(2026, 8, 10) }),
  makeExpense({ type: 'variable', amount: -310, categoryId: 'cat-transport', categoryName: 'Trasporti', date: d(2026, 8, 12) }),
  makeExpense({ type: 'variable', amount: -265, categoryId: 'cat-rest', categoryName: 'Ristoranti', date: d(2026, 8, 20) }),
  makeExpense({ type: 'debt', amount: -180, categoryId: 'cat-health', categoryName: 'Salute', date: d(2026, 8, 19) }),
  makeExpense({ type: 'variable', amount: -300, categoryId: 'cat-other', categoryName: 'Tempo libero', date: d(2026, 8, 21) }),
  makeExpense({ type: 'variable', amount: -185, categoryId: 'cat-other2', categoryName: 'Regali', date: d(2026, 8, 21) }),
  // Net-zero between two accounts: never income, never spending, still a movement.
  makeExpense({ type: 'transfer', amount: 1200, categoryId: 'cat-transfer', categoryName: 'Trasferimento', date: d(2026, 8, 19) }),
  makeExpense({ type: 'transfer', amount: 300, categoryId: 'cat-transfer', categoryName: 'Trasferimento', date: d(2026, 8, 6) }),
];

describe('summarizePeriodCashflow', () => {
  it('should sum income and spending by type, transfers excluded, with rate and coverage', () => {
    const totals = summarizePeriodCashflow(AUGUST_ROWS);

    expect(totals.income).toBe(4850);
    expect(totals.expenses).toBe(2910);
    expect(totals.net).toBe(1940);
    expect(totals.savingsRate).toBeCloseTo(40, 5);
    expect(totals.coverageRatio).toBeCloseTo(1.6667, 3);
    expect(totals.transferCount).toBe(2);
  });

  it('should classify by type, not by sign: a negative income row lowers income, a positive spending row raises spending', () => {
    const totals = summarizePeriodCashflow([
      makeExpense({ type: 'income', amount: 1000, date: d(2026, 8) }),
      makeExpense({ type: 'income', amount: -100, date: d(2026, 8) }),
      makeExpense({ type: 'variable', amount: 50, date: d(2026, 8) }),
      makeExpense({ type: 'variable', amount: -400, date: d(2026, 8) }),
    ]);

    expect(totals.income).toBe(900);
    expect(totals.expenses).toBe(450);
  });

  it('should return a null rate without income and a null coverage without spending or without income', () => {
    const spendingOnly = summarizePeriodCashflow([makeExpense({ type: 'fixed', amount: -10, date: d(2026, 8) })]);
    expect(spendingOnly.savingsRate).toBeNull();
    // A ratio with a zero numerator says nothing: null, not 0.
    expect(spendingOnly.coverageRatio).toBeNull();
    expect(summarizePeriodCashflow([makeExpense({ type: 'income', amount: 10, date: d(2026, 8) })]).coverageRatio).toBeNull();
    expect(summarizePeriodCashflow([])).toEqual({ income: 0, expenses: 0, net: 0, savingsRate: null, coverageRatio: null, transferCount: 0 });
  });
});

describe('filterExpensesByPeriod', () => {
  it('should keep the rows inside the month, both ends inclusive, and drop the neighbours', () => {
    const rows = [
      makeExpense({ amount: -1, date: new Date(2026, 6, 31, 23, 59) }),
      makeExpense({ amount: -2, date: new Date(2026, 7, 1, 0, 0) }),
      makeExpense({ amount: -3, date: new Date(2026, 7, 31, 23, 30) }),
      makeExpense({ amount: -4, date: new Date(2026, 8, 1, 0, 0) }),
    ];

    expect(filterExpensesByPeriod(rows, AUGUST).map((e) => e.amount)).toEqual([-2, -3]);
  });

  it('should keep a year still running WHOLE — an instalment due in October is part of «il 2026»', () => {
    const rows = [
      makeExpense({ amount: -1, date: d(2026, 1) }),
      makeExpense({ amount: -2, date: new Date(2026, 7, 31, 23, 30) }),
      makeExpense({ amount: -3, date: d(2026, 9) }),
      makeExpense({ amount: -4, date: d(2026, 12) }),
      makeExpense({ amount: -5, date: d(2027, 1) }),
    ];
    expect(filterExpensesByPeriod(rows, { kind: 'year', year: 2026 }).map((e) => e.amount)).toEqual([-1, -2, -3, -4]);
    // A closed year keeps all twelve months, as it always did.
    expect(filterExpensesByPeriod(rows.map((e) => ({ ...e, date: new Date(2025, e.date.getMonth(), 15, 12) })), { kind: 'year', year: 2025 })).toHaveLength(5);
  });
});

describe('splitSpendingAtDate', () => {
  it('should separate what is booked up to today from what is already scheduled', () => {
    const rows = [
      makeExpense({ type: 'fixed', amount: -800, date: d(2026, 8, 1) }),
      makeExpense({ type: 'variable', amount: -200, date: d(2026, 8, 22, 9) }),
      makeExpense({ type: 'debt', amount: -300, date: d(2026, 8, 27) }),
      makeExpense({ type: 'income', amount: 4000, date: d(2026, 8, 27) }),
      makeExpense({ type: 'transfer', amount: 500, date: d(2026, 8, 27) }),
    ];
    expect(splitSpendingAtDate(rows, NOW)).toEqual({ spentToDate: 1000, scheduled: 300 });
  });
});

describe('previousPeriod', () => {
  it('should step a month back and wrap January into the previous December', () => {
    expect(previousPeriod(AUGUST, NOW)).toEqual({ kind: 'month', year: 2026, month: 7 });
    expect(previousPeriod({ kind: 'month', year: 2026, month: 1 }, NOW)).toEqual({ kind: 'month', year: 2025, month: 12 });
  });

  it('should step a closed year back and refuse a custom range — a same-length window is a guess', () => {
    expect(previousPeriod({ kind: 'year', year: 2025 }, NOW)).toEqual({ kind: 'year', year: 2024 });
    expect(previousPeriod({ kind: 'custom', from: d(2026, 3, 1), to: d(2026, 5, 20) }, NOW)).toBeNull();
  });

  it('should compare a year still running with the same months of the previous year', () => {
    const previous = previousPeriod({ kind: 'year', year: 2026 }, NOW);
    expect(previous?.kind).toBe('custom');
    if (previous?.kind !== 'custom') throw new Error('expected a custom range');
    expect(previous.from).toEqual(new Date(2025, 0, 1));
    expect(previous.to).toEqual(new Date(2025, 7, 31));
  });
});

describe('computePeriodDelta', () => {
  it('should measure each side against the previous period and return null on a zero base', () => {
    const current = summarizePeriodCashflow(AUGUST_ROWS);
    const previous = { income: 4700, expenses: 3110, net: 1590, savingsRate: 33.8, coverageRatio: 1.51, transferCount: 0 };

    const delta = computePeriodDelta(current, previous);

    expect(delta.income).toBeCloseTo(3.19, 2);
    expect(delta.expenses).toBeCloseTo(-6.43, 2);
    expect(computePeriodDelta(current, { ...previous, income: 0 }).income).toBeNull();
    expect(computePeriodDelta(current, { ...previous, expenses: 0 }).expenses).toBeNull();
  });
});

describe('resolveAnchorMonth and resolveFlowWindow', () => {
  it('should anchor a month on itself and look back the trailing count', () => {
    expect(resolveAnchorMonth(AUGUST, NOW)).toEqual({ year: 2026, month: 8 });
    expect(resolveFlowWindow(AUGUST, NOW)).toEqual({ endYear: 2026, endMonth: 8, count: 6 });
  });

  it('should span every year in full — the chart of a period draws the whole period', () => {
    expect(resolveFlowWindow({ kind: 'year', year: 2026 }, NOW)).toEqual({ endYear: 2026, endMonth: 12, count: 12 });
    expect(resolveFlowWindow({ kind: 'year', year: 2024 }, NOW)).toEqual({ endYear: 2024, endMonth: 12, count: 12 });
    // The savings history keeps its own anchor: today's month, never December.
    expect(resolveAnchorMonth({ kind: 'year', year: 2026 }, NOW)).toEqual({ year: 2026, month: 8 });
  });

  it('should mark as scheduled only the months that have not started', () => {
    const flows = buildTrailingMonthFlows([], 2026, 12, 12, NOW);
    expect(flows.filter((f) => f.scheduled).map((f) => f.month)).toEqual([9, 10, 11, 12]);
    // Without a clock nothing is marked: a window entirely in the past needs no mark.
    expect(buildTrailingMonthFlows([], 2026, 12, 12).some((f) => f.scheduled)).toBe(false);
  });

  it('should anchor a custom range on the month of its last day', () => {
    const custom: Period = { kind: 'custom', from: d(2026, 2, 10), to: d(2026, 5, 20) };
    expect(resolveAnchorMonth(custom, NOW)).toEqual({ year: 2026, month: 5 });
    expect(resolveFlowWindow(custom, NOW)).toEqual({ endYear: 2026, endMonth: 5, count: 6 });
  });
});

describe('buildTrailingMonthFlows', () => {
  it('should build a gap-free series ending at the anchor, oldest first, with a rate per month', () => {
    const rows = [
      makeExpense({ type: 'income', amount: 4900, date: d(2026, 4) }),
      makeExpense({ type: 'variable', amount: -2740, date: d(2026, 4) }),
      // May has income only; June has nothing; July has spending only.
      makeExpense({ type: 'income', amount: 1000, date: d(2026, 5) }),
      makeExpense({ type: 'fixed', amount: -800, date: d(2026, 7) }),
      makeExpense({ type: 'transfer', amount: 500, date: d(2026, 7) }),
      ...AUGUST_ROWS,
      // Outside the window on both sides.
      makeExpense({ type: 'income', amount: 99, date: d(2026, 2) }),
      makeExpense({ type: 'income', amount: 99, date: d(2026, 9) }),
    ];

    const flows = buildTrailingMonthFlows(rows, 2026, 8, 6);

    expect(flows.map((f) => f.key)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);
    expect(flows.map((f) => f.label)).toEqual(['Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago']);
    expect(flows[1]).toMatchObject({ year: 2026, month: 4, income: 4900, expenses: 2740, net: 2160 });
    expect(flows[1].savingsRate).toBeCloseTo(44.08, 2);
    expect(flows[2].savingsRate).toBe(100);
    expect(flows[3]).toMatchObject({ income: 0, expenses: 0, savingsRate: null });
    // Spending without income: the transfer never counts, the rate has no denominator.
    expect(flows[4]).toMatchObject({ income: 0, expenses: 800, savingsRate: null });
    expect(flows[5]).toMatchObject({ income: 4850, expenses: 2910 });
  });

  it('should wrap across the year boundary', () => {
    const flows = buildTrailingMonthFlows([], 2026, 2, 4);
    expect(flows.map((f) => f.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('summarizeSavingsHistory', () => {
  const flow = (month: number, savingsRate: number | null) => ({
    key: `2026-${String(month).padStart(2, '0')}`,
    year: 2026,
    month,
    label: 'x',
    income: savingsRate === null ? 0 : 100,
    expenses: 0,
    net: 0,
    savingsRate,
    scheduled: false,
  });

  it('should average only the measured months and name the best and the worst', () => {
    const history = summarizeSavingsHistory([flow(1, 35), flow(2, null), flow(3, 29), flow(4, 44), flow(5, -8)], NOW);

    expect(history.measuredCount).toBe(4);
    expect(history.closedCount).toBe(5);
    expect(history.ongoing).toBeNull();
    expect(history.average).toBeCloseTo(25, 5);
    expect(history.best?.month).toBe(4);
    expect(history.worst?.month).toBe(5);
    expect(history.deficitMonths.map((m) => m.month)).toEqual([5]);
  });

  it('should draw the running month but never rank it', () => {
    // August 2026 is today's month: its salary is in and most of its spending is not.
    const history = summarizeSavingsHistory([flow(6, 30), flow(7, 34), flow(8, 90)], NOW);

    expect(history.ongoing?.month).toBe(8);
    expect(history.closedCount).toBe(2);
    expect(history.measuredCount).toBe(2);
    expect(history.average).toBeCloseTo(32, 5);
    expect(history.best?.month).toBe(7);
    expect(history.months).toHaveLength(3);
  });

  it('should return an empty history when no month has income', () => {
    expect(summarizeSavingsHistory([flow(1, null), flow(2, null)], NOW)).toMatchObject({
      average: null,
      best: null,
      worst: null,
      deficitMonths: [],
      measuredCount: 0,
    });
  });
});

describe('rankCategories', () => {
  it('should rank spending categories by id, cap the list and close it with the residual', () => {
    const ranking = rankCategories(AUGUST_ROWS, 'expenses', 5);

    expect(ranking.total).toBe(2910);
    expect(ranking.rows.map((r) => r.category)).toEqual(['Casa', 'Alimentari', 'Trasporti', 'Tempo libero', 'Ristoranti']);
    expect(ranking.rows[0]).toMatchObject({ categoryKey: 'cat-home', amount: 1150 });
    expect(ranking.rows[0].percentage).toBeCloseTo(39.52, 2);
    // 180 + 185 did not make the cut: the residual is what makes the list add up.
    expect(ranking.remainder?.amount).toBe(365);
    expect(ranking.remainder?.percentage).toBeCloseTo(12.54, 2);
  });

  it('should rank income by category with no residual when every category is shown', () => {
    const ranking = rankCategories(AUGUST_ROWS, 'income');

    expect(ranking.total).toBe(4850);
    expect(ranking.rows.map((r) => [r.category, r.amount])).toEqual([
      ['Stipendio', 4200],
      ['Dividendi', 650],
    ]);
    expect(ranking.remainder).toBeNull();
  });

  it('should keep two same-named categories apart and qualify their labels by type', () => {
    const rows = [
      makeExpense({ type: 'fixed', amount: -900, categoryId: 'cat-home-fixed', categoryName: 'Casa', date: d(2026, 8) }),
      makeExpense({ type: 'variable', amount: -100, categoryId: 'cat-home-var', categoryName: 'Casa', date: d(2026, 8) }),
    ];

    const ranking = rankCategories(rows, 'expenses');

    expect(ranking.rows.map((r) => r.category)).toEqual(['Casa (Spese Fisse)', 'Casa (Spese Variabili)']);
  });

  it('should return an empty ranking with no rows of that kind', () => {
    expect(rankCategories([], 'expenses')).toEqual({ rows: [], total: 0, remainder: null });
  });

  it('should leave a net-negative category out of the shares — a reversal is not a source', () => {
    const rows = [
      makeExpense({ type: 'income', amount: 3000, categoryId: 'cat-salary', categoryName: 'Stipendio', date: d(2026, 8) }),
      makeExpense({ type: 'income', amount: -500, categoryId: 'cat-refund', categoryName: 'Storno', date: d(2026, 8) }),
    ];
    const ranking = rankCategories(rows, 'income');
    expect(ranking.rows.map((r) => [r.category, r.percentage])).toEqual([['Stipendio', 100]]);
    expect(ranking.total).toBe(3000);
    expect(ranking.remainder).toBeNull();
  });
});

describe('summarizeMovements', () => {
  it('should count every row by type and name the largest by absolute amount', () => {
    const summary = summarizeMovements(AUGUST_ROWS, NOW);

    expect(summary).toMatchObject({ count: 11, expenseCount: 7, incomeCount: 2, transferCount: 2 });
    expect(summary.largest).toEqual({ label: 'Stipendio', amount: 4200, type: 'income' });
  });

  it('should label the largest by its note when there is one', () => {
    const summary = summarizeMovements(
      [makeExpense({ type: 'fixed', amount: -820, categoryName: 'Casa', notes: 'Rata mutuo ', date: d(2026, 8) })],
      NOW,
    );

    expect(summary.largest).toEqual({ label: 'Rata mutuo', amount: 820, type: 'fixed' });
  });

  it('should count the rows dated after today apart, across every type', () => {
    const summary = summarizeMovements(
      [
        makeExpense({ type: 'variable', amount: -100, date: d(2026, 8, 20) }),
        makeExpense({ type: 'variable', amount: -203.18, date: d(2026, 9, 28) }),
        makeExpense({ type: 'variable', amount: -203.18, date: d(2026, 10, 28) }),
        // A scheduled income is as unspent as a scheduled instalment: the split is by date only.
        makeExpense({ type: 'income', amount: 500, date: d(2026, 12, 1) }),
      ],
      NOW,
    );

    expect(summary.scheduled).toEqual({ count: 3, total: 906.36 });
    // The largest is still the largest, scheduled or not — the list holds it either way.
    expect(summary.largest).toMatchObject({ amount: 500 });
  });

  it('should report no scheduled rows for a period entirely in the past', () => {
    expect(summarizeMovements(AUGUST_ROWS, d(2026, 12, 31)).scheduled).toEqual({ count: 0, total: 0 });
  });

  it('should report nothing on an empty list', () => {
    expect(summarizeMovements([], NOW)).toEqual({
      count: 0,
      expenseCount: 0,
      incomeCount: 0,
      transferCount: 0,
      largest: null,
      scheduled: { count: 0, total: 0 },
    });
  });
});

describe('currentComparisonWindow', () => {
  it('should scope a running year to the months the previous year can match', () => {
    const window = currentComparisonWindow({ kind: 'year', year: 2026 }, NOW);
    expect(window).toEqual({ kind: 'custom', from: new Date(2026, 0, 1), to: endOfMonthBound(2026, 8) });

    // Both sides of the delta now cover January → August, one year apart.
    const previous = previousPeriod({ kind: 'year', year: 2026 }, NOW);
    expect(previous).toEqual({ kind: 'custom', from: new Date(2025, 0, 1), to: new Date(2025, 8, 0) });
  });

  it('should be the period itself for a month and a closed year, and null for a custom range', () => {
    expect(currentComparisonWindow(AUGUST, NOW)).toEqual(AUGUST);
    expect(currentComparisonWindow({ kind: 'year', year: 2024 }, NOW)).toEqual({ kind: 'year', year: 2024 });
    // Null exactly where previousPeriod is null: nothing to scope against.
    const custom: Period = { kind: 'custom', from: d(2026, 2), to: d(2026, 5) };
    expect(currentComparisonWindow(custom, NOW)).toBeNull();
    expect(previousPeriod(custom, NOW)).toBeNull();
  });
});

describe('the ytd period', () => {
  const YTD: Period = { kind: 'ytd', year: 2026, throughMonth: 8 };

  it('should compare against the same months a year earlier, in the same shape', () => {
    expect(previousPeriod(YTD, NOW)).toEqual({ kind: 'ytd', year: 2025, throughMonth: 8 });
    // It already stops at today's month, so it IS its own comparable window.
    expect(currentComparisonWindow(YTD, NOW)).toEqual(YTD);
  });

  it('should anchor on its last month and draw exactly its own months', () => {
    expect(resolveAnchorMonth(YTD, NOW)).toEqual({ year: 2026, month: 8 });
    expect(resolveFlowWindow(YTD, NOW)).toEqual({ endYear: 2026, endMonth: 8, count: 8 });
  });

  it('should slice January to the end of its last month, dropping what a whole year would keep', () => {
    const rows = [
      makeExpense({ amount: -1, date: d(2026, 1) }),
      makeExpense({ amount: -2, date: new Date(2026, 7, 31, 23, 30) }),
      makeExpense({ amount: -3, date: d(2026, 9) }),
      makeExpense({ amount: -4, date: d(2026, 12) }),
    ];
    expect(filterExpensesByPeriod(rows, YTD).map((e) => e.amount)).toEqual([-1, -2]);
    // The whole year keeps all four — the two periods must differ, that is the point.
    expect(filterExpensesByPeriod(rows, { kind: 'year', year: 2026 })).toHaveLength(4);
  });

  it('should have nothing scheduled by construction', () => {
    const rows = [makeExpense({ amount: -3, date: d(2026, 9) }), makeExpense({ amount: -1, date: d(2026, 1) })];
    expect(summarizeScheduled(filterExpensesByPeriod(rows, YTD), NOW).count).toBe(0);
  });
});

describe('summarizeScheduled', () => {
  const ROWS = [
    makeExpense({ type: 'variable', amount: -100, date: d(2026, 8, 20) }),
    makeExpense({ type: 'variable', amount: -203.18, date: d(2026, 9, 28) }),
    makeExpense({ type: 'variable', amount: -203.18, date: d(2026, 10, 28) }),
    makeExpense({ type: 'income', amount: 500, date: d(2026, 12, 1) }),
    // A transfer is net-zero: counted as a row, never as a flow.
    makeExpense({ type: 'transfer', amount: 300, date: d(2026, 11, 5) }),
  ];

  it('should split the period at today, keeping spending and income apart', () => {
    expect(summarizeScheduled(ROWS, NOW)).toEqual({ count: 4, expenses: 406.36, income: 500, throughMonth: 12 });
  });

  it('should report an empty slice when nothing is ahead', () => {
    expect(summarizeScheduled(ROWS, d(2026, 12, 31))).toEqual({ count: 0, expenses: 0, income: 0, throughMonth: null });
  });
});

describe('isScheduledRow', () => {
  it('should call a row scheduled only when it is dated strictly after now', () => {
    expect(isScheduledRow(makeExpense({ amount: -1, date: d(2026, 9, 28) }), NOW)).toBe(true);
    expect(isScheduledRow(makeExpense({ amount: -1, date: d(2026, 8, 20) }), NOW)).toBe(false);
    // Now itself has happened.
    expect(isScheduledRow(makeExpense({ amount: -1, date: NOW }), NOW)).toBe(false);
  });
});

describe('resolvePeriodCalendar', () => {
  it('should expose the day and the length of the month only for the current month', () => {
    expect(resolvePeriodCalendar(AUGUST, NOW)).toEqual({ dayOfMonth: 22, daysInMonth: 31 });
    expect(resolvePeriodCalendar({ kind: 'month', year: 2026, month: 7 }, NOW)).toBeNull();
    expect(resolvePeriodCalendar({ kind: 'year', year: 2026 }, NOW)).toBeNull();
  });
});
