/**
 * Unit tests for hallOfFameRecords.ts — pure record-building + period ranking.
 *
 * These functions power both the in-app Hall of Fame and the periodic email
 * mentions, so the ranking definition must match the in-app one exactly:
 * growth = position among positive-growth periods (desc); decline = position
 * among negative-growth periods (most negative first).
 *
 * expenseService is mocked at the firebase boundary (db) so the pure
 * calculateTotalIncome/Expenses can be imported without a live Firestore.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: null },
  db: {},
}));

import {
  calculateMonthlyRecords,
  calculateYearlyRecords,
  buildHallOfFameRankings,
  MAX_MONTHLY_RECORDS,
  periodSavings,
  rankBySavings,
  rankPeriodByNetWorthGrowth,
  summarizeRecordStats,
} from '@/lib/utils/hallOfFameRecords';
import type { MonthlySnapshot } from '@/types/assets';

function snap(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return {
    userId: 'u1',
    year,
    month,
    totalNetWorth,
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass: {},
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 1),
  } as MonthlySnapshot;
}

describe('calculateMonthlyRecords', () => {
  it('builds a record per consecutive snapshot pair (first snapshot has no baseline)', () => {
    const snapshots = [snap(2025, 1, 1000), snap(2025, 2, 1500), snap(2025, 3, 1400)];

    const records = calculateMonthlyRecords(snapshots, []);

    // 3 snapshots → 2 records (Feb vs Jan, Mar vs Feb).
    expect(records.map((r) => r.monthYear)).toEqual(['02/2025', '03/2025']);
    expect(records.map((r) => r.netWorthDiff)).toEqual([500, -100]);
  });

  it('returns no records when there is a single snapshot', () => {
    expect(calculateMonthlyRecords([snap(2025, 1, 1000)], [])).toEqual([]);
  });
});

describe('calculateYearlyRecords', () => {
  it('uses previous December as baseline so January is included in the delta', () => {
    const snapshots = [snap(2024, 12, 1000), snap(2025, 6, 1300), snap(2025, 12, 2000)];

    const records = calculateYearlyRecords(snapshots, []);
    const y2025 = records.find((r) => r.year === 2025)!;

    // 2000 (Dec 2025) − 1000 (Dec 2024 baseline) = 1000.
    expect(y2025.netWorthDiff).toBe(1000);
    expect(y2025.startOfYearNetWorth).toBe(1000);
  });
});

describe('rankPeriodByNetWorthGrowth', () => {
  // Four months with growth deltas 500, 300, 800, -200.
  const records = [
    { year: 2025, month: 1, netWorthDiff: 500 },
    { year: 2025, month: 2, netWorthDiff: 300 },
    { year: 2025, month: 3, netWorthDiff: 800 },
    { year: 2025, month: 4, netWorthDiff: -200 },
  ];

  it('ranks a positive month among growth months, strongest first', () => {
    // 800 (Mar) is #1, 500 (Jan) is #2, 300 (Feb) is #3 — out of 3 growth months.
    expect(rankPeriodByNetWorthGrowth(records, { year: 2025, month: 1 })).toEqual({
      rank: 2,
      total: 3,
      trend: 'growth',
    });
    expect(rankPeriodByNetWorthGrowth(records, { year: 2025, month: 3 })).toEqual({
      rank: 1,
      total: 3,
      trend: 'growth',
    });
  });

  it('ranks a negative month among decline months', () => {
    expect(rankPeriodByNetWorthGrowth(records, { year: 2025, month: 4 })).toEqual({
      rank: 1,
      total: 1,
      trend: 'decline',
    });
  });

  it('returns null for a period with no record (e.g. first month, no baseline)', () => {
    expect(rankPeriodByNetWorthGrowth(records, { year: 2025, month: 12 })).toBeNull();
  });

  it('returns null for a flat (zero-change) period — excluded from both rankings', () => {
    const flat = [{ year: 2025, month: 1, netWorthDiff: 0 }];
    expect(rankPeriodByNetWorthGrowth(flat, { year: 2025, month: 1 })).toBeNull();
  });

  it('ranks yearly periods when month is omitted', () => {
    const yearly = [
      { year: 2023, netWorthDiff: 10000 },
      { year: 2024, netWorthDiff: 25000 },
      { year: 2025, netWorthDiff: 18000 },
    ];
    expect(rankPeriodByNetWorthGrowth(yearly, { year: 2025 })).toEqual({
      rank: 2,
      total: 3,
      trend: 'growth',
    });
  });
});

describe('periodSavings', () => {
  it('is what came in minus what went out', () => {
    expect(periodSavings({ totalIncome: 5300, totalExpenses: 2120 })).toBe(3180);
  });

  it('is negative when a period spent more than it earned', () => {
    expect(periodSavings({ totalIncome: 1000, totalExpenses: 1400 })).toBe(-400);
  });
});

describe('rankBySavings', () => {
  const records = [
    { year: 2026, month: 3, totalIncome: 5300, totalExpenses: 2120 }, // +3180
    { year: 2025, month: 9, totalIncome: 5100, totalExpenses: 2690 }, // +2410
    { year: 2025, month: 5, totalIncome: 3000, totalExpenses: 3400 }, // -400
    { year: 2023, month: 1, totalIncome: 0, totalExpenses: 0 }, // untracked
  ];

  it('orders the periods from the one that kept the most', () => {
    expect(rankBySavings(records, 10).map((r) => r.month)).toEqual([3, 9, 5]);
  });

  it('leaves out a period with no income — a saving without income is not a record', () => {
    expect(rankBySavings(records, 10).some((r) => r.year === 2023)).toBe(false);
  });

  it('cuts the ranking at the limit', () => {
    expect(rankBySavings(records, 2).map((r) => r.month)).toEqual([3, 9]);
  });

  it('does not mutate its input', () => {
    const copy = [...records];
    rankBySavings(records, 2);
    expect(records).toEqual(copy);
  });
});

describe('summarizeRecordStats', () => {
  const monthly = [
    { year: 2025, month: 1, monthYear: '01/2025', netWorthDiff: 0, previousNetWorth: 0, totalIncome: 4000, totalExpenses: 2000 },
    { year: 2025, month: 2, monthYear: '02/2025', netWorthDiff: 0, previousNetWorth: 0, totalIncome: 5000, totalExpenses: 3000 },
    { year: 2026, month: 3, monthYear: '03/2026', netWorthDiff: 0, previousNetWorth: 0, totalIncome: 6000, totalExpenses: 4000 },
  ];
  const yearly = [
    { year: 2025, netWorthDiff: 0, startOfYearNetWorth: 0, totalIncome: 9000, totalExpenses: 5000 },
    { year: 2026, netWorthDiff: 0, startOfYearNetWorth: 0, totalIncome: 6000, totalExpenses: 4000 },
  ];

  it('counts the periods and averages the monthly flows over them', () => {
    const stats = summarizeRecordStats(monthly, yearly);

    expect(stats.monthCount).toBe(3);
    expect(stats.yearCount).toBe(2);
    expect(stats.averageMonthlyIncome).toBe(5000);
    expect(stats.averageMonthlyExpenses).toBe(3000);
  });

  it('names the first and the last month covered, oldest first', () => {
    const stats = summarizeRecordStats(monthly, yearly);

    expect(stats.firstMonth).toEqual({ year: 2025, month: 1 });
    expect(stats.lastMonth).toEqual({ year: 2026, month: 3 });
  });

  it('has no month to name and no average to give without records', () => {
    const stats = summarizeRecordStats([], []);

    expect(stats).toEqual({
      monthCount: 0,
      yearCount: 0,
      averageMonthlyIncome: 0,
      averageMonthlyExpenses: 0,
      firstMonth: null,
      lastMonth: null,
    });
  });
});

describe('buildHallOfFameRankings', () => {
  const monthly = [
    { year: 2025, month: 1, monthYear: '01/2025', netWorthDiff: 500, previousNetWorth: 10_000, totalIncome: 3000, totalExpenses: 2500 },
    { year: 2025, month: 2, monthYear: '02/2025', netWorthDiff: -300, previousNetWorth: 10_500, totalIncome: 3200, totalExpenses: 3900 },
    { year: 2025, month: 3, monthYear: '03/2025', netWorthDiff: 0, previousNetWorth: 10_200, totalIncome: 2800, totalExpenses: 1000 },
  ];
  const yearly = [
    { year: 2024, netWorthDiff: 4000, startOfYearNetWorth: 20_000, totalIncome: 30_000, totalExpenses: 24_000 },
    { year: 2025, netWorthDiff: -1000, startOfYearNetWorth: 24_000, totalIncome: 9000, totalExpenses: 11_000 },
  ];

  it('keeps a flat period out of both the growth and the decline ranking', () => {
    const rankings = buildHallOfFameRankings(monthly, yearly);

    expect(rankings.bestMonthsByNetWorthGrowth.map((r) => r.month)).toEqual([1]);
    expect(rankings.worstMonthsByNetWorthDecline.map((r) => r.month)).toEqual([2]);
  });

  it('ranks the savings months with the shared rule', () => {
    const rankings = buildHallOfFameRankings(monthly, yearly);

    // March kept 1800, January 500, February lost 700.
    expect(rankings.bestMonthsBySavings?.map((r) => r.month)).toEqual([3, 1, 2]);
    expect(rankings.bestYearsBySavings?.map((r) => r.year)).toEqual([2024, 2025]);
  });

  it('carries the stats alongside the rankings', () => {
    expect(buildHallOfFameRankings(monthly, yearly).stats.monthCount).toBe(3);
  });

  it('never mutates the records it was given', () => {
    const copy = monthly.map((r) => ({ ...r }));
    buildHallOfFameRankings(monthly, yearly);
    expect(monthly).toEqual(copy);
  });

  it('cuts every monthly ranking at the shared limit', () => {
    const many = Array.from({ length: MAX_MONTHLY_RECORDS + 5 }, (_, i) => ({
      year: 2020 + Math.floor(i / 12),
      month: (i % 12) + 1,
      monthYear: '',
      netWorthDiff: i + 1,
      previousNetWorth: 1000,
      totalIncome: 100,
      totalExpenses: 10,
    }));

    expect(buildHallOfFameRankings(many, []).bestMonthsByNetWorthGrowth).toHaveLength(MAX_MONTHLY_RECORDS);
  });
});
