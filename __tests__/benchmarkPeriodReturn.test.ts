/**
 * Tests for lib/utils/benchmarkPeriodReturn.ts — the indexing + annualization shared
 * by the benchmark comparison table and the Rendimenti hero's "vs benchmark" delta.
 */

import { describe, it, expect } from 'vitest';
import {
  buildIndexedSeries,
  annualizeTWR,
  computeBenchmarkAnnualizedReturn,
  type MonthlyReturnPoint,
} from '@/lib/utils/benchmarkPeriodReturn';

const series: MonthlyReturnPoint[] = [
  { year: 2024, month: 11, return: 0.05 }, // outside a 2025 window
  { year: 2025, month: 1, return: 0.10 },
  { year: 2025, month: 2, return: -0.05 },
  { year: 2025, month: 3, return: 0.02 },
];

describe('buildIndexedSeries', () => {
  it('should filter to the window and index growth-of-100 from the first month', () => {
    const out = buildIndexedSeries(series, new Date(2025, 0, 1), new Date(2025, 2, 31));
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ year: 2025, month: 1, indexed: 110 }); // 100 * 1.10
    expect(out[1].indexed).toBeCloseTo(104.5, 5); // 110 * 0.95
    expect(out[2].indexed).toBeCloseTo(106.59, 2); // 104.5 * 1.02
  });

  it('should return [] when no month falls in the window', () => {
    expect(buildIndexedSeries(series, new Date(2030, 0, 1), new Date(2030, 11, 31))).toEqual([]);
  });
});

describe('annualizeTWR', () => {
  it('should leave a 12-month cumulative unchanged (1 year)', () => {
    expect(annualizeTWR(110, 12)).toBeCloseTo(10, 5);
  });

  it('should annualize a multi-year cumulative down', () => {
    // +21% over 24 months → ~10% annualized.
    expect(annualizeTWR(121, 24)).toBeCloseTo(10, 4);
  });

  it('should return null for non-positive months', () => {
    expect(annualizeTWR(110, 0)).toBeNull();
  });
});

describe('computeBenchmarkAnnualizedReturn', () => {
  it('should index the window then annualize over numberOfMonths', () => {
    // 3 months cumulative ≈ +6.59% → annualized over 3 months ≈ ((1.0659)^4 - 1).
    const out = computeBenchmarkAnnualizedReturn(series, new Date(2025, 0, 1), new Date(2025, 2, 31), 3);
    expect(out).not.toBeNull();
    expect(out!).toBeCloseTo((Math.pow(1.0659, 12 / 3) - 1) * 100, 1);
  });

  it('should return null when the window holds no months', () => {
    expect(computeBenchmarkAnnualizedReturn(series, new Date(2030, 0, 1), new Date(2030, 11, 31), 12)).toBeNull();
  });
});
