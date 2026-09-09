/**
 * Tests for the tile-side additions to lib/utils/performanceSummary.ts (Rendimenti redesign,
 * 2026-08-25): the drawdown story with its months, the Sortino ratio with the volatility floor,
 * the growth-of-100 series, the benchmark ranking and the realized-gains summary — every number
 * a tile shows that the payload did not already carry.
 */

import { describe, expect, it } from 'vitest';
import type { MonthlySnapshot } from '@/types/assets';
import type { CashFlowData, MonthlyReturnHeatmapData } from '@/types/performance';
import {
  buildGrowthOfHundred,
  computeBenchmarkRanking,
  computeDownsideDeviation,
  computeReturnConsistency,
  computeSortinoRatio,
  flattenHeatmapReturns,
  resolveDrawdownStory,
  summarizeRealizedGains,
} from '@/lib/utils/performanceSummary';

const heat = (rows: Array<[number, Array<number | null>]>): MonthlyReturnHeatmapData[] =>
  rows.map(([year, months]) => ({ year, months: months.map((r, i) => ({ month: i + 1, return: r })) }));

const snap = (year: number, month: number, totalNetWorth: number): MonthlySnapshot =>
  ({ id: `${year}-${month}`, userId: 'u', year, month, totalNetWorth, byAssetClass: {}, createdAt: new Date(year, month - 1, 28, 12) } as unknown as MonthlySnapshot);

describe('flattenHeatmapReturns', () => {
  it('turns the heatmap into a sorted decimal series and skips empty months', () => {
    const flat = flattenHeatmapReturns(heat([[2026, [1.2, null, -3]], [2025, [null, null, null, null, null, null, null, 0.9]]]));
    expect(flat.map((p) => [p.year, p.month])).toEqual([[2025, 8], [2026, 1], [2026, 3]]);
    expect(flat.map((p) => p.return)[0]).toBeCloseTo(0.009, 12);
    expect(flat.map((p) => p.return)[1]).toBeCloseTo(0.012, 12);
    expect(flat.map((p) => p.return)[2]).toBeCloseTo(-0.03, 12);
  });
});

describe('computeDownsideDeviation / computeSortinoRatio', () => {
  it('needs three months, like volatility', () => {
    expect(computeDownsideDeviation([1, -2])).toBeNull();
    expect(computeSortinoRatio(heat([[2026, [1, -2]]]), 5, 2)).toBeNull();
  });

  it('measures only the negative months, annualised', () => {
    // squared downside: 0, 4, 0, 1 → mean 1.25 → monthly 1.118 → × √12 = 3.873
    expect(computeDownsideDeviation([2, -2, 3, -1])).toBeCloseTo(3.873, 3);
  });

  it('is null when no month is negative (a zero denominator is not an infinite ratio)', () => {
    expect(computeSortinoRatio(heat([[2026, [1, 2, 3]]]), 9, 2)).toBeNull();
  });

  it('divides the excess return by the downside deviation', () => {
    const sortino = computeSortinoRatio(heat([[2026, [2, -2, 3, -1]]]), 9.873, 2);
    expect(sortino).toBeCloseTo((9.873 - 2) / 3.873, 2);
  });
});

describe('resolveDrawdownStory', () => {
  const flows: CashFlowData[] = [];

  it('names peak, trough and recovery months and counts the months to recover', () => {
    const story = resolveDrawdownStory(
      [snap(2026, 1, 100), snap(2026, 2, 110), snap(2026, 3, 99), snap(2026, 4, 105), snap(2026, 5, 112)],
      flows,
    );
    expect(story).toEqual({
      value: -10,
      peak: { year: 2026, month: 2 },
      trough: { year: 2026, month: 3 },
      recovery: { year: 2026, month: 5 },
      monthsToRecover: 2,
      durationMonths: 3,
    });
  });

  it('an unrecovered drawdown has no recovery month and counts to the last snapshot', () => {
    const story = resolveDrawdownStory([snap(2026, 1, 100), snap(2026, 2, 90), snap(2026, 3, 95)], flows);
    expect(story).toEqual({
      value: -10,
      peak: { year: 2026, month: 1 },
      trough: { year: 2026, month: 2 },
      recovery: null,
      monthsToRecover: null,
      durationMonths: 2,
    });
  });

  it('is null when the portfolio never fell, or with one snapshot', () => {
    expect(resolveDrawdownStory([snap(2026, 1, 100), snap(2026, 2, 101)], flows)).toBeNull();
    expect(resolveDrawdownStory([snap(2026, 1, 100)], flows)).toBeNull();
  });

  it('a dip shallower than the at-peak threshold is no story (a −0,0% drawdown is noise)', () => {
    expect(resolveDrawdownStory([snap(2026, 1, 100000), snap(2026, 2, 99980), snap(2026, 3, 100100)], flows)).toBeNull();
  });

  it('counts calendar months across a missing snapshot, not index steps', () => {
    const story = resolveDrawdownStory([snap(2026, 1, 100), snap(2026, 2, 110), snap(2026, 3, 99), snap(2026, 5, 112)], flows);
    expect(story?.monthsToRecover).toBe(2);
    expect(story?.durationMonths).toBe(3);
    expect(story?.recovery).toEqual({ year: 2026, month: 5 });
  });

  it('neutralises a contribution before measuring the fall', () => {
    const story = resolveDrawdownStory(
      [snap(2026, 1, 100), snap(2026, 2, 100), snap(2026, 3, 100)],
      [{ date: new Date(2026, 1, 15, 12), income: 20, expenses: 0, dividendIncome: 0, netCashFlow: 20 }],
    );
    // February: (100 − 20) / 100 − 1 = −20% — a withdrawal-shaped month, not a flat one.
    expect(story?.value).toBeCloseTo(-20, 5);
    expect(story?.trough).toEqual({ year: 2026, month: 2 });
  });
});

describe('buildGrowthOfHundred', () => {
  const start = new Date(2026, 0, 1, 12);
  const end = new Date(2026, 2, 31, 12);

  it('starts both series at 100 on the base month and compounds the window', () => {
    const series = buildGrowthOfHundred({
      heatmap: heat([[2026, [10, -5, 2]]]),
      benchmarkReturns: [{ year: 2026, month: 1, return: 0.05 }, { year: 2026, month: 2, return: 0.05 }, { year: 2026, month: 3, return: 0 }],
      startDate: start,
      endDate: end,
    });
    expect(series.baseMonth).toEqual({ year: 2025, month: 12 });
    expect(series.points.map((p) => [p.year, p.month, p.portfolio, p.benchmark])).toEqual([
      [2025, 12, 100, 100],
      [2026, 1, 110, 105],
      [2026, 2, 104.5, 110.25],
      [2026, 3, 106.59, 110.25],
    ]);
    expect(series.portfolioEnd).toBe(106.59);
    expect(series.benchmarkEnd).toBe(110.25);
  });

  it('leaves a benchmark gap null and reports no benchmark end without data', () => {
    const series = buildGrowthOfHundred({ heatmap: heat([[2026, [1, 1, 1]]]), benchmarkReturns: [{ year: 2026, month: 1, return: 0.01 }], startDate: start, endDate: end });
    expect(series.points.map((p) => p.benchmark)).toEqual([100, 101, null, null]);
    expect(series.benchmarkEnd).toBe(101);
    const none = buildGrowthOfHundred({ heatmap: heat([[2026, [1, 1, 1]]]), benchmarkReturns: null, startDate: start, endDate: end });
    expect(none.benchmarkEnd).toBeNull();
    // No benchmark at all: not even a base point, or the chart would draw a lone dot at 100.
    expect(none.points.map((p) => p.benchmark)).toEqual([null, null, null, null]);
  });

  it('is empty without a measured month', () => {
    expect(buildGrowthOfHundred({ heatmap: [], benchmarkReturns: null, startDate: start, endDate: end }).points).toEqual([]);
  });
});

describe('computeBenchmarkRanking', () => {
  const start = new Date(2026, 0, 1, 12);
  const end = new Date(2026, 11, 31, 12);
  const flat = (r: number, months = 12) => Array.from({ length: months }, (_, i) => ({ year: 2026, month: i + 1, return: r }));

  it('ranks the models by annualised return, keeps each one its own last month, and counts the beaten', () => {
    const ranking = computeBenchmarkRanking({
      portfolioTWR: 7.3,
      numberOfMonths: 12,
      startDate: start,
      endDate: end,
      benchmarks: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      returnsById: { a: flat(0.005), b: flat(0.01, 11), c: undefined },
    });
    expect(ranking.rows.map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(ranking.rows[0].annualized).toBeCloseTo((Math.pow(1.01, 11) - 1) * 100, 1);
    expect(ranking.rows[0].lastMonth).toEqual({ year: 2026, month: 11 });
    expect(ranking.rows[0].delta).toBeCloseTo(7.3 - (ranking.rows[0].annualized ?? 0), 6);
    expect(ranking.rows[1].annualized).toBeCloseTo((Math.pow(1.005, 12) - 1) * 100, 1);
    expect(ranking.rows[2]).toEqual({ id: 'c', name: 'C', annualized: null, delta: null, lastMonth: null });
    expect(ranking.measured).toBe(2);
    expect(ranking.beaten).toBe(1);
    expect(ranking.tied).toBe(0);
  });

  it('counts no beaten model without a portfolio return', () => {
    const ranking = computeBenchmarkRanking({ portfolioTWR: null, numberOfMonths: 12, startDate: start, endDate: end, benchmarks: [{ id: 'a', name: 'A' }], returnsById: { a: flat(0.01) } });
    expect(ranking.beaten).toBe(0);
    expect(ranking.tied).toBe(0);
    expect(ranking.rows[0].delta).toBeNull();
  });

  it('a gap that prints as 0,0 points is a tie, neither beaten nor above', () => {
    const annualized = (Math.pow(1.005, 12) - 1) * 100;
    const ranking = computeBenchmarkRanking({ portfolioTWR: annualized + 0.03, numberOfMonths: 12, startDate: start, endDate: end, benchmarks: [{ id: 'a', name: 'A' }], returnsById: { a: flat(0.005) } });
    expect(ranking.tied).toBe(1);
    expect(ranking.beaten).toBe(0);
  });
});

describe('summarizeRealizedGains', () => {
  it('orders the years newest first and totals them', () => {
    expect(summarizeRealizedGains({ 2024: 1312, 2026: -412, 2025: 2845 })).toEqual({
      total: 3745,
      years: [{ year: 2026, amount: -412 }, { year: 2025, amount: 2845 }, { year: 2024, amount: 1312 }],
    });
  });

  it('is null without a closed sale', () => {
    expect(summarizeRealizedGains({})).toBeNull();
  });
});

describe('computeReturnConsistency (redesign)', () => {
  it('carries the year and the month of the best and the worst month', () => {
    const c = computeReturnConsistency(heat([[2026, [1.2, -0.4, -3, 3.1]]]));
    expect(c.best).toEqual({ label: 'Apr 26', year: 2026, month: 4, return: 3.1 });
    expect(c.worst).toEqual({ label: 'Mar 26', year: 2026, month: 3, return: -3 });
  });
});
