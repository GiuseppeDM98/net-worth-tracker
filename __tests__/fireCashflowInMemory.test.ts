/**
 * The FIRE page's cashflow figures computed IN MEMORY from the account's whole expense list
 * (2026-09-29): `selectExpensesBetween` is the twin of `getExpensesByDateRange` (both
 * ends included, the same instants), `computeLastYearExpenses` the twin of `getAnnualExpenses`,
 * `computeAnnualCashflowData` the twin of the retired `getAnnualCashflowData`, and `buildFIREData`
 * the twin of the retired `getFIREData` (the snapshot window: eleven months before the first
 * snapshot to the end of the last). Pinned so a page reading `useExpenses` prints what the
 * range queries printed.
 */
import { describe, it, expect, vi } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({}));

import type { Expense } from '@/types/expenses';
import type { MonthlySnapshot } from '@/types/assets';
import { buildFIREData, computeAnnualCashflowData, computeLastYearExpenses, selectExpensesBetween } from '@/lib/services/fireService';

const NOW = new Date(2026, 8, 29, 12); // 29 September 2026, noon

function row(partial: Partial<Expense> & { date: Date; amount: number; type: Expense['type'] }): Expense {
  return {
    id: `${partial.date.getTime()}-${partial.amount}`,
    userId: 'owner',
    categoryId: partial.type === 'income' ? 'stipendio' : 'spesa',
    categoryName: partial.type === 'income' ? 'Stipendio' : 'Spesa',
    description: '',
    createdAt: partial.date,
    updatedAt: partial.date,
    ...partial,
  } as Expense;
}

const snapshot = (year: number, month: number, totalNetWorth: number): MonthlySnapshot =>
  ({ id: `owner-${year}-${month}`, userId: 'owner', year, month, totalNetWorth, liquidNetWorth: totalNetWorth, illiquidNetWorth: 0, createdAt: new Date(year, month - 1, 28) } as unknown as MonthlySnapshot);

describe('selectExpensesBetween', () => {
  it('keeps both ends of the range, like the Firestore query (>= start, <= end)', () => {
    const start = new Date(2025, 0, 1);
    const end = new Date(2025, 11, 31, 23, 59, 59, 999);
    const rows = [
      row({ date: new Date(2024, 11, 31, 23, 59, 59, 999), amount: -1, type: 'variable' }), // one ms before: out
      row({ date: start, amount: -2, type: 'variable' }), // the first instant: in
      row({ date: end, amount: -3, type: 'variable' }), // the last instant: in
      row({ date: new Date(2026, 0, 1), amount: -4, type: 'variable' }), // the next year: out
    ];
    expect(selectExpensesBetween(rows, start, end).map((r) => r.amount)).toEqual([-2, -3]);
  });
});

describe('computeLastYearExpenses', () => {
  it('sums the spending of the last full calendar year only', () => {
    const rows = [
      row({ date: new Date(2025, 2, 10), amount: -100, type: 'variable' }),
      row({ date: new Date(2025, 6, 10), amount: -50, type: 'fixed' }),
      row({ date: new Date(2025, 6, 11), amount: 3000, type: 'income' }), // income: not an expense
      row({ date: new Date(2026, 1, 1), amount: -999, type: 'variable' }), // the running year: out
      row({ date: new Date(2024, 1, 1), amount: -999, type: 'variable' }), // two years back: out
    ];
    expect(computeLastYearExpenses(rows, NOW)).toBe(150);
  });
});

describe('computeAnnualCashflowData', () => {
  it('reads the last full year when it has rows: not annualised, savings clamped at zero', () => {
    const rows = [
      row({ date: new Date(2025, 0, 15), amount: 2000, type: 'income' }),
      row({ date: new Date(2025, 5, 15), amount: -1500, type: 'variable' }),
      row({ date: new Date(2026, 3, 1), amount: -5000, type: 'variable' }), // running year: ignored
    ];
    const data = computeAnnualCashflowData(rows, NOW);
    expect(data.referenceYear).toBe(2025);
    expect(data.isAnnualized).toBe(false);
    expect(data.annualExpensesFromCashflow).toBe(1500);
    expect(data.annualSavings).toBe(500);
    expect(data.incomeSources.map((s) => s.categoryId)).toEqual(['stipendio']);
  });

  it('annualises the running year up to NOW when the last year is empty — a row after now is out', () => {
    const rows = [
      row({ date: new Date(2026, 0, 10), amount: 1000, type: 'income' }),
      row({ date: new Date(2026, 4, 10), amount: -300, type: 'variable' }),
      row({ date: new Date(2026, 10, 10), amount: -900, type: 'variable' }), // scheduled after now: out
    ];
    const data = computeAnnualCashflowData(rows, NOW);
    expect(data.referenceYear).toBe(2026);
    expect(data.isAnnualized).toBe(true);
    // September: nine months elapsed, scaled to twelve.
    expect(data.annualExpensesFromCashflow).toBeCloseTo((300 / 9) * 12, 6);
    expect(data.annualSavings).toBeCloseTo((700 / 9) * 12, 6);
  });

  it('is empty, annualised, when neither year has a row', () => {
    expect(computeAnnualCashflowData([], NOW)).toEqual({ annualSavings: 0, annualExpensesFromCashflow: 0, referenceYear: 2026, isAnnualized: true, incomeSources: [] });
  });
});

describe('buildFIREData', () => {
  it('reads the chart and the runway off the whole list, the metrics off the last full year', () => {
    // Twelve monthly snapshots, August 2025 → July 2026: the runway starts at the twelfth.
    const snapshots = Array.from({ length: 12 }, (_, i) => {
      const date = new Date(2025, 7 + i, 1);
      return snapshot(date.getFullYear(), date.getMonth() + 1, 100_000 + i * 1000);
    });
    const rows = [
      row({ date: new Date(2025, 2, 10), amount: -1, type: 'variable' }), // March 2025: the last full year (metrics), before the runway's window
      // The last day of July 2026 by the ITALIAN clock (the month is read in Rome; built from the
      // process zone this row was August when the suite ran in UTC, 2026-10-08): the last snapshot's month.
      row({ date: fromZonedTime('2026-07-31T23:59:00', 'Europe/Rome'), amount: -1000, type: 'variable' }),
      row({ date: new Date(2026, 7, 1), amount: -1000, type: 'variable' }), // August 2026: after the last snapshot, in no point
    ];
    const data = buildFIREData(snapshots, rows, 111_000, 4, false, NOW);
    expect(data.chartData).toHaveLength(12);
    expect(Math.abs(data.chartData[11].expenses)).toBe(1000);
    expect(data.runwayData).toHaveLength(1);
    expect(data.runwayData[0].trailing12mExpenses).toBe(1000);
    expect(data.metrics.annualExpenses).toBe(1);
  });

  it('answers with no history and null runway when there is no snapshot', () => {
    const data = buildFIREData([], [], 50_000, 4, false, NOW);
    expect(data.chartData).toEqual([]);
    expect(data.runwayData).toEqual([]);
    expect(data.runwaySummary.targetYearsOfExpenses).toBe(25);
  });
});
