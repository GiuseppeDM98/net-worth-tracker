/**
 * Tests for lib/utils/storicoSummary.ts — the numbers behind Storico's verdict and tiles: the
 * growth since the first snapshot (wealth growth, contributions INCLUDED), the best and worst
 * month, the all-time high, the pace of the last twelve months against the lifetime average,
 * and the next-doubling projection at that pace. Pure: no Firebase, no clock.
 */

import { describe, expect, it } from 'vitest';
import type { DoublingMilestone, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import {
  addMonths,
  CAGR_MIN_MONTHS,
  laborWindowsOf,
  monthSpan,
  PACE_MIN_HISTORY_MONTHS,
  projectNextDoubling,
  resolveDriverShares,
  resolveFeaturedDriverYear,
  runningSinceMonth,
  selectDriverYears,
  selectTrailingMonths,
  summarizeAllTimeHigh,
  summarizeGrowth,
  summarizeGrowthPace,
  summarizeMonthlyMoves,
  sumDriverYears,
  summarizeLaborMetrics,
  withMonthDeltas,
} from '@/lib/utils/storicoSummary';

/** A minimal snapshot: only the fields the module reads. */
function snap(year: number, month: number, totalNetWorth: number): MonthlySnapshot {
  return {
    userId: 'u',
    year,
    month,
    totalNetWorth,
    liquidNetWorth: totalNetWorth,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28, 12),
  };
}

/** `count` consecutive months from (year, month), values from `values` or a linear ramp. */
function series(year: number, month: number, values: number[]): MonthlySnapshot[] {
  return values.map((v, i) => {
    const m = month - 1 + i;
    return snap(year + Math.floor(m / 12), (m % 12) + 1, v);
  });
}

describe('monthSpan / addMonths', () => {
  it('should count calendar months between two periods', () => {
    expect(monthSpan({ year: 2019, month: 9 }, { year: 2026, month: 7 })).toBe(82);
    expect(monthSpan({ year: 2024, month: 3 }, { year: 2024, month: 3 })).toBe(0);
  });

  it('should add months across a year boundary', () => {
    expect(addMonths({ year: 2026, month: 7 }, 18)).toEqual({ year: 2028, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe('summarizeGrowth', () => {
  it('should return null without snapshots', () => {
    expect(summarizeGrowth([])).toBeNull();
  });

  it('should measure the growth from the first to the latest snapshot, unsorted input included', () => {
    const shuffled = [snap(2026, 7, 248900), snap(2019, 9, 74000), snap(2022, 10, 149600)];
    const growth = summarizeGrowth(shuffled)!;
    expect(growth.first).toEqual({ year: 2019, month: 9, value: 74000 });
    expect(growth.latest).toEqual({ year: 2026, month: 7, value: 248900 });
    expect(growth.snapshotCount).toBe(3);
    expect(growth.monthsElapsed).toBe(82);
    expect(growth.delta).toBe(174900);
    expect(growth.growthPct).toBeCloseTo(236.35, 1);
    // Wealth CAGR: (248900 / 74000) ^ (12 / 82) − 1 — contributions included, NOT Rendimenti's.
    expect(growth.cagr).toBeCloseTo(19.4, 0);
  });

  it(`should give no CAGR below ${CAGR_MIN_MONTHS} months`, () => {
    const growth = summarizeGrowth(series(2026, 1, [100, 110, 120, 130, 140, 150]))!;
    expect(growth.monthsElapsed).toBe(5);
    expect(growth.cagr).toBeNull();
    expect(growth.growthPct).toBeCloseTo(50, 5);
  });

  it('should give no percentage nor CAGR when the first snapshot is not positive', () => {
    const growth = summarizeGrowth(series(2024, 1, [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200]))!;
    expect(growth.growthPct).toBeNull();
    expect(growth.cagr).toBeNull();
    expect(growth.delta).toBe(1200);
  });

  it('should report a single snapshot with zero months elapsed', () => {
    const growth = summarizeGrowth([snap(2026, 3, 50000)])!;
    expect(growth.snapshotCount).toBe(1);
    expect(growth.monthsElapsed).toBe(0);
    expect(growth.delta).toBe(0);
    expect(growth.cagr).toBeNull();
  });
});

describe('summarizeMonthlyMoves', () => {
  it('should measure only consecutive calendar months and pick the best and worst', () => {
    const moves = summarizeMonthlyMoves([
      snap(2024, 1, 100),
      snap(2024, 2, 110), // +10
      snap(2024, 3, 105), // −5
      snap(2024, 5, 200), // gap: April is missing, not a month
      snap(2024, 6, 200), // 0: neither rising nor falling
      snap(2024, 7, 215), // +15
    ]);
    expect(moves.measuredMonths).toBe(4);
    expect(moves.risingMonths).toBe(2);
    expect(moves.best).toEqual({ year: 2024, month: 7, value: 215, delta: 15 });
    expect(moves.worst).toEqual({ year: 2024, month: 3, value: 105, delta: -5 });
  });

  it('should leave best and worst null when no month rose or fell', () => {
    expect(summarizeMonthlyMoves([snap(2024, 1, 100)])).toEqual({ best: null, worst: null, risingMonths: 0, measuredMonths: 0 });
    const flat = summarizeMonthlyMoves(series(2024, 1, [100, 100, 100]));
    expect(flat.best).toBeNull();
    expect(flat.worst).toBeNull();
    expect(flat.measuredMonths).toBe(2);
  });
});

describe('summarizeAllTimeHigh', () => {
  it('should say the latest snapshot is the high when nothing was higher', () => {
    const ath = summarizeAllTimeHigh(series(2024, 1, [100, 120, 110, 130]))!;
    expect(ath.peak).toEqual({ year: 2024, month: 4, value: 130 });
    expect(ath.isAtHigh).toBe(true);
    expect(ath.gap).toBe(0);
  });

  it('should measure the gap below an earlier peak, as a negative amount and percentage', () => {
    const ath = summarizeAllTimeHigh(series(2024, 1, [100, 150, 120, 140]))!;
    expect(ath.peak).toEqual({ year: 2024, month: 2, value: 150 });
    expect(ath.isAtHigh).toBe(false);
    expect(ath.gap).toBe(-10);
    expect(ath.gapPct).toBeCloseTo(-6.67, 1);
  });

  it('should treat a latest snapshot equal to the peak as at the high (the first occurrence is the peak)', () => {
    const ath = summarizeAllTimeHigh(series(2024, 1, [100, 150, 150]))!;
    expect(ath.isAtHigh).toBe(true);
    expect(ath.peak).toEqual({ year: 2024, month: 2, value: 150 });
  });

  it('should return null without snapshots', () => {
    expect(summarizeAllTimeHigh([])).toBeNull();
  });
});

describe('summarizeGrowthPace', () => {
  /** 36 months: +1000/month for two years, then +2000/month — clearly accelerating. */
  const accelerating = series(2023, 8, Array.from({ length: 37 }, (_, i) => 100000 + (i <= 24 ? i * 1000 : 24000 + (i - 24) * 2000)));

  it('should compare the last twelve months with the lifetime monthly average', () => {
    const pace = summarizeGrowthPace(accelerating);
    expect(pace.trailingDelta).toBe(24000);
    expect(pace.trailingPct).toBeCloseTo((24000 / 124000) * 100, 5);
    expect(pace.trailingMonthly).toBe(2000);
    expect(pace.lifetimeMonthly).toBeCloseTo(48000 / 36, 5);
    expect(pace.verdict).toBe('accelerating');
  });

  it('should call a pace within ten percent of the average steady', () => {
    const steady = series(2023, 1, Array.from({ length: 37 }, (_, i) => 100000 + i * 1000));
    expect(summarizeGrowthPace(steady).verdict).toBe('steady');
  });

  it('should call a rising last year accelerating even when the whole history fell', () => {
    const fallThenRecover = series(2022, 1, Array.from({ length: 37 }, (_, i) => (i <= 24 ? 100000 - i * (40000 / 24) : 60000 + (i - 24) * (20000 / 12))));
    const pace = summarizeGrowthPace(fallThenRecover);
    expect(pace.lifetimeMonthly).toBeLessThan(0);
    expect(pace.trailingDelta).toBeCloseTo(20000, 3);
    expect(pace.verdict).toBe('accelerating');
  });

  it('should call a slower last year slowing, and a negative one losing', () => {
    const slowing = series(2023, 1, Array.from({ length: 37 }, (_, i) => 100000 + (i <= 24 ? i * 2000 : 48000 + (i - 24) * 500)));
    expect(summarizeGrowthPace(slowing).verdict).toBe('slowing');
    const losing = series(2023, 1, Array.from({ length: 37 }, (_, i) => 100000 + (i <= 24 ? i * 2000 : 48000 - (i - 24) * 500)));
    const pace = summarizeGrowthPace(losing);
    expect(pace.trailingDelta).toBe(-6000);
    expect(pace.verdict).toBe('losing');
  });

  it(`should give no verdict below ${PACE_MIN_HISTORY_MONTHS} months of history, but still the trailing figures`, () => {
    const short = series(2025, 1, Array.from({ length: 19 }, (_, i) => 100000 + i * 1000));
    const pace = summarizeGrowthPace(short);
    expect(pace.trailingDelta).toBe(12000);
    expect(pace.verdict).toBeNull();
  });

  it('should give no trailing figure when the snapshot twelve months earlier is missing', () => {
    const withGap = accelerating.filter((s) => !(s.year === 2025 && s.month === 8));
    const pace = summarizeGrowthPace(withGap);
    expect(pace.trailingDelta).toBeNull();
    expect(pace.trailingMonthly).toBeNull();
    expect(pace.verdict).toBeNull();
    expect(pace.lifetimeMonthly).not.toBeNull();
  });

  it('should return all-null on an empty history', () => {
    expect(summarizeGrowthPace([])).toEqual({ trailingDelta: null, trailingPct: null, trailingMonthly: null, lifetimeMonthly: null, verdict: null });
  });
});

describe('withMonthDeltas', () => {
  it("should attach each month's change, null on the first point and after a gap", () => {
    const points = withMonthDeltas([
      { year: 2024, month: 3, totalNetWorth: 105 },
      { year: 2024, month: 1, totalNetWorth: 100 },
      { year: 2024, month: 2, totalNetWorth: 110 },
      { year: 2024, month: 5, totalNetWorth: 120 },
    ]);
    expect(points.map((p) => p.month)).toEqual([1, 2, 3, 5]);
    expect(points.map((p) => p.delta)).toEqual([null, 10, -5, null]);
  });
});

describe('projectNextDoubling', () => {
  const inProgress: DoublingMilestone = {
    milestoneNumber: 2,
    startValue: 149600,
    endValue: 299200,
    startDate: { year: 2022, month: 10 },
    endDate: { year: 2026, month: 7 },
    durationMonths: 45,
    periodLabel: '10/22 - 07/26 - In corso',
    isComplete: false,
    progressPercentage: 66,
    milestoneType: 'geometric',
  };
  const latest = { year: 2026, month: 7, value: 248900 };

  it('should project the target at the monthly pace, linearly, rounding the months up', () => {
    const projection = projectNextDoubling(inProgress, latest, 34000 / 12)!;
    expect(projection.target).toBe(299200);
    expect(projection.remaining).toBe(50300);
    expect(projection.monthsToTarget).toBe(18); // 50300 / 2833.3 = 17.75 → 18
    expect(projection.eta).toEqual({ year: 2028, month: 1 });
  });

  it('should give no projection without a milestone in progress, without a pace, or with a non-positive one', () => {
    expect(projectNextDoubling(null, latest, 2000)).toBeNull();
    expect(projectNextDoubling(inProgress, latest, null)).toBeNull();
    expect(projectNextDoubling(inProgress, latest, 0)).toBeNull();
    expect(projectNextDoubling(inProgress, latest, -500)).toBeNull();
  });

  it('should give no projection beyond fifty years — a pace that never gets there is not a date', () => {
    expect(projectNextDoubling(inProgress, latest, 10)).toBeNull();
  });

  it('should give no projection when the target is already reached', () => {
    expect(projectNextDoubling({ ...inProgress, endValue: 200000 }, latest, 2000)).toBeNull();
  });
});

describe('driver helpers', () => {
  const rows = [
    { year: '2023', netSavings: 9000, investmentGrowth: 3000, netWorthGrowth: 12000, growthPct: 12, latest: { year: 2023, month: 12 } },
    { year: '2024', netSavings: 12000, investmentGrowth: -1000, netWorthGrowth: 11000, growthPct: 9.8, latest: { year: 2024, month: 12 } },
    { year: '2025', netSavings: 22800, investmentGrowth: 6900, netWorthGrowth: 29700, growthPct: 24.1, latest: { year: 2025, month: 12 } },
    { year: '2026', netSavings: 14100, investmentGrowth: 7300, netWorthGrowth: 21400, growthPct: 14, latest: { year: 2026, month: 8 } },
  ];

  it('should split a year between its drivers as shares that sum to 100, or refuse a mixed-sign split', () => {
    expect(resolveDriverShares(rows[2])).toEqual({ savings: 77, market: 23 });
    expect(resolveDriverShares({ netSavings: 23678, investmentGrowth: 21288 })).toEqual({ savings: 53, market: 47 });
    expect(resolveDriverShares(rows[1])).toBeNull();
    expect(resolveDriverShares({ netSavings: 0, investmentGrowth: 0 })).toBeNull();
    expect(resolveDriverShares({ netSavings: 0, investmentGrowth: 500 })).toEqual({ savings: 0, market: 100 });
  });

  it('should keep only the years from the cashflow floor, newest first', () => {
    expect(selectDriverYears(rows, 2025).map((r) => r.year)).toEqual(['2026', '2025']);
    expect(selectDriverYears(rows, 2030)).toEqual([]);
  });

  it('should sum the selected years, and give null for none', () => {
    expect(sumDriverYears(selectDriverYears(rows, 2025))).toEqual({ netSavings: 36900, investmentGrowth: 14200, netWorthGrowth: 51100 });
    expect(sumDriverYears([])).toBeNull();
  });

  it('should feature the running year when present, else the newest closed one', () => {
    expect(resolveFeaturedDriverYear(selectDriverYears(rows, 2025), 2026)).toEqual({ row: rows[3], isRunning: true });
    expect(resolveFeaturedDriverYear(selectDriverYears(rows, 2025), 2027)).toEqual({ row: rows[3], isRunning: false });
    expect(resolveFeaturedDriverYear([], 2026)).toBeNull();
  });

  it('should take the rows inside the last N CALENDAR months, chronological, a missing month staying a gap', () => {
    const months = Array.from({ length: 15 }, (_, i) => ({ year: 2025 + Math.floor(i / 12), month: (i % 12) + 1, v: i }));
    const last = selectTrailingMonths(months, 12);
    expect(last).toHaveLength(12);
    expect(last[0]).toMatchObject({ year: 2025, month: 4 });
    expect(last[11]).toMatchObject({ year: 2026, month: 3 });
    expect(selectTrailingMonths(months.slice(0, 3), 12)).toHaveLength(3);
    const withGap = months.filter((m) => !(m.year === 2025 && m.month === 10));
    const trailing = selectTrailingMonths([...withGap].reverse(), 12);
    expect(trailing).toHaveLength(11);
    expect(trailing[0]).toMatchObject({ year: 2025, month: 4 });
    expect(selectTrailingMonths([], 12)).toEqual([]);
  });

  it('should name the month a running year is measured from', () => {
    expect(runningSinceMonth({ baseline: { year: 2025, month: 12 } })).toBe(1);
    expect(runningSinceMonth({ baseline: { year: 2026, month: 3 } })).toBe(4);
    expect(runningSinceMonth({})).toBe(1);
  });
});

describe('summarizeLaborMetrics', () => {
  const expense = (id: string, type: Expense['type'], categoryId: string, amount: number, date: Date): Expense =>
    ({ id, userId: 'u', type, categoryId, categoryName: categoryId, amount, currency: 'EUR', date, createdAt: new Date(), updatedAt: new Date() }) as Expense;
  const snapshots = [snap(2024, 12, 100000), snap(2025, 6, 120000), snap(2026, 6, 151100)];
  // The Driver's windows: 2025 from December 2024 to June 2025, 2026 from June 2025 to June 2026.
  const windows = laborWindowsOf([
    { year: '2026', baseline: { year: 2025, month: 6 }, latest: { year: 2026, month: 6 } },
    { year: '2025', baseline: { year: 2024, month: 12 }, latest: { year: 2025, month: 6 } },
  ]);
  const expenses = [
    expense('a', 'income', 'stipendio', 78400, new Date(2025, 5, 5, 12)),
    expense('b', 'income', 'dividendi', 1000, new Date(2025, 5, 5, 12)),
    expense('c', 'fixed', 'casa', -41500, new Date(2025, 5, 5, 12)),
    expense('d', 'transfer', 'giroconto', 10000, new Date(2025, 5, 5, 12)),
    expense('e', 'income', 'stipendio', 50000, new Date(2023, 5, 5, 12)), // before the floor
    // The rows the OLD recap counted and the Driver never did: a materialised instalment after the
    // last snapshot, and a row in the baseline's own month (the window opens the month AFTER it).
    expense('f', 'fixed', 'rata', -800, new Date(2026, 10, 5, 12)),
    expense('g', 'income', 'stipendio', 5000, new Date(2024, 11, 5, 12)),
    // Local midnight on the last day of the last counted month — the way the dialog stamps a row.
    expense('h', 'variable', 'spesa', -100, new Date(2026, 5, 30)),
  ];

  it('should count the rows of the Driver windows only: three causes that add up to the growth of the same windows', () => {
    const m = summarizeLaborMetrics(snapshots, expenses, ['stipendio'], 2025, windows, 2300)!;
    expect(m).toEqual({
      startYear: 2025,
      since: { year: 2025, month: 1 },
      until: { year: 2026, month: 6 },
      totalLaborIncome: 78400,
      totalSavedFromWork: 36800,
      totalExpensesSum: -41600,
      otherIncome: 1000,
      otherIncomeByCategory: [{ categoryId: 'dividendi', name: 'dividendi', amount: 1000 }],
      // (120000 − 100000) + (151100 − 120000): the two windows, never a snapshot counted twice.
      netWorthGrowth: 51100,
      // 51100 − (78400 + 1000 − 41600) = 13300: the transfer, the future instalment and the baseline-month salary change nothing.
      totalInvestmentGrowthGross: 13300,
      totalInvestmentGrowthNet: 11000,
      coverage: 78400 / 41600,
    });
    expect(m.totalSavedFromWork + m.otherIncome + m.totalInvestmentGrowthGross).toBeCloseTo(m.netWorthGrowth, 6);
    expect(summarizeLaborMetrics(snapshots, expenses.filter((e) => e.type !== 'transfer'), ['stipendio'], 2025, windows, 2300)).toEqual(m);
  });

  it('should measure one year on its own window, and the cumulative recap is the sum of the years', () => {
    const y2025 = summarizeLaborMetrics(snapshots, expenses, ['stipendio'], 2025, [windows[1]], 0)!;
    const y2026 = summarizeLaborMetrics(snapshots, expenses, ['stipendio'], 2025, [windows[0]], 0)!;
    expect(y2025).toMatchObject({ since: { year: 2025, month: 1 }, until: { year: 2025, month: 6 }, totalLaborIncome: 78400, totalExpensesSum: -41500, otherIncome: 1000, netWorthGrowth: 20000, totalInvestmentGrowthGross: 20000 - 37900 });
    expect(y2026).toMatchObject({ since: { year: 2025, month: 7 }, until: { year: 2026, month: 6 }, totalLaborIncome: 0, totalExpensesSum: -100, otherIncome: 0, otherIncomeByCategory: [], netWorthGrowth: 31100, totalInvestmentGrowthGross: 31200, coverage: null });
    const all = summarizeLaborMetrics(snapshots, expenses, ['stipendio'], 2025, windows, 0)!;
    expect(all.netWorthGrowth).toBe(y2025.netWorthGrowth + y2026.netWorthGrowth);
    expect(all.totalInvestmentGrowthGross).toBe(y2025.totalInvestmentGrowthGross + y2026.totalInvestmentGrowthGross);
  });

  it('should rank the other income categories by weight and drop the coverage without spending or without labor income', () => {
    const rows = [
      expense('a', 'income', 'stipendio', 3000, new Date(2025, 2, 5, 12)),
      expense('b', 'income', 'rimborsi', 200, new Date(2025, 2, 5, 12)),
      expense('c', 'income', 'dividendi', 900, new Date(2025, 3, 5, 12)),
      expense('d', 'income', 'rimborsi', 300, new Date(2025, 4, 5, 12)),
    ];
    const m = summarizeLaborMetrics(snapshots, rows, ['stipendio'], 2025, [windows[1]], 0)!;
    expect(m.otherIncomeByCategory).toEqual([
      { categoryId: 'dividendi', name: 'dividendi', amount: 900 },
      { categoryId: 'rimborsi', name: 'rimborsi', amount: 500 },
    ]);
    expect(m.coverage).toBeNull();
    expect(summarizeLaborMetrics(snapshots, rows, ['affitti'], 2025, [windows[1]], 0)!.coverage).toBeNull();
  });

  it('should give null without categories, expenses, windows or the windows\' snapshots', () => {
    expect(summarizeLaborMetrics(snapshots, expenses, [], 2025, windows, 0)).toBeNull();
    expect(summarizeLaborMetrics(snapshots, [], ['stipendio'], 2025, windows, 0)).toBeNull();
    expect(summarizeLaborMetrics(snapshots, expenses, ['stipendio'], 2025, [], 0)).toBeNull();
    expect(summarizeLaborMetrics(snapshots, expenses, ['stipendio'], 2025, [{ baseline: { year: 2022, month: 12 }, latest: { year: 2023, month: 6 } }], 0)).toBeNull();
  });

  it('should read a legacy Driver row without a baseline as a December-based window', () => {
    expect(laborWindowsOf([{ year: '2026', latest: { year: 2026, month: 8 } }])).toEqual([{ baseline: { year: 2025, month: 12 }, latest: { year: 2026, month: 8 } }]);
  });
});
