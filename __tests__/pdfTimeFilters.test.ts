import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  filterExpensesByTime,
  validateTimeFilterData,
} from '@/lib/utils/pdfTimeFilters';
import type { MonthlySnapshot } from '@/types/assets';

const snapshot = (year: number, month: number): MonthlySnapshot => ({
  userId: 'user-1',
  year,
  month,
  totalNetWorth: 1000,
  liquidNetWorth: 1000,
  illiquidNetWorth: 0,
  byAssetClass: {},
  byAsset: [],
  assetAllocation: {},
  createdAt: new Date(),
});

describe('pdfTimeFilters', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters expenses by Italy month at UTC month boundaries', () => {
    const boundaryExpense = {
      id: 'expense-1',
      date: new Date('2026-02-28T23:30:00.000Z'),
      amount: -50,
    };
    const previousMonthExpense = {
      id: 'expense-2',
      date: new Date('2026-02-28T20:30:00.000Z'),
      amount: -25,
    };

    const result = filterExpensesByTime(
      [boundaryExpense, previousMonthExpense],
      'monthly',
      2026,
      3
    );

    expect(result).toEqual([boundaryExpense]);
  });

  it('uses Italy current month and year in validation metadata', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-28T23:30:00.000Z'));

    const result = validateTimeFilterData([
      snapshot(2026, 1),
      snapshot(2026, 2),
    ]);

    expect(result.currentYear).toBe(2026);
    expect(result.currentMonth).toBe(3);
  });
});
