/**
 * Tests for lib/utils/performanceSummary.ts — the pure layer behind the Rendimenti
 * redesign's hero. Covers the verdict (B1), the benchmark delta, return consistency
 * read from the heatmap (B2), and the current drawdown status (B3).
 */

import { describe, it, expect } from 'vitest';
import type {
  MonthlyReturnHeatmapData,
  UnderwaterDrawdownData,
} from '@/types/performance';
import {
  summarizePerformance,
  computeBenchmarkDelta,
  computeReturnConsistency,
  computeDrawdownStatus,
} from '@/lib/utils/performanceSummary';

// ---------------------------------------------------------------------------
// summarizePerformance (B1)
// ---------------------------------------------------------------------------

describe('summarizePerformance', () => {
  it('should report neutral / insufficient when TWR is null', () => {
    const v = summarizePerformance({ timeWeightedReturn: null, sharpeRatio: 1.5, riskFreeRate: 3 });
    expect(v.tone).toBe('neutral');
  });

  it('should rate strong when Sharpe is excellent and return beats risk-free', () => {
    const v = summarizePerformance({ timeWeightedReturn: 12, sharpeRatio: 2.3, riskFreeRate: 3 });
    expect(v.tone).toBe('strong');
    expect(v.headline).toBe('Eccellente');
  });

  it('should rate solid when Sharpe is good and return beats risk-free', () => {
    const v = summarizePerformance({ timeWeightedReturn: 8, sharpeRatio: 1.3, riskFreeRate: 3 });
    expect(v.tone).toBe('solid');
  });

  it('should rate fragile when return is positive but Sharpe is low', () => {
    const v = summarizePerformance({ timeWeightedReturn: 4, sharpeRatio: 0.4, riskFreeRate: 3 });
    expect(v.tone).toBe('fragile');
  });

  it('should rate weak when Sharpe is negative', () => {
    const v = summarizePerformance({ timeWeightedReturn: -2, sharpeRatio: -0.5, riskFreeRate: 3 });
    expect(v.tone).toBe('weak');
  });

  it('should fall back to excess-return sign when Sharpe is null', () => {
    expect(summarizePerformance({ timeWeightedReturn: 6, sharpeRatio: null, riskFreeRate: 3 }).tone).toBe('solid');
    expect(summarizePerformance({ timeWeightedReturn: 2, sharpeRatio: null, riskFreeRate: 3 }).tone).toBe('fragile');
    expect(summarizePerformance({ timeWeightedReturn: -1, sharpeRatio: null, riskFreeRate: 3 }).tone).toBe('weak');
  });
});

// ---------------------------------------------------------------------------
// computeBenchmarkDelta
// ---------------------------------------------------------------------------

describe('computeBenchmarkDelta', () => {
  it('should return the signed gap in percentage points', () => {
    expect(computeBenchmarkDelta(7.2, 6)).toBeCloseTo(1.2, 5);
    expect(computeBenchmarkDelta(5, 8)).toBeCloseTo(-3, 5);
  });

  it('should return null when either side is missing', () => {
    expect(computeBenchmarkDelta(null, 6)).toBeNull();
    expect(computeBenchmarkDelta(7, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeReturnConsistency (B2)
// ---------------------------------------------------------------------------

describe('computeReturnConsistency', () => {
  const heatmap: MonthlyReturnHeatmapData[] = [
    {
      year: 2025,
      months: [
        { month: 1, return: 3.5 },
        { month: 2, return: -1.2 },
        { month: 3, return: null }, // no data — skipped
        { month: 4, return: 0 }, // flat — counted as non-positive
        { month: 5, return: 8.1 },
      ],
    },
  ];

  it('should count positive months and skip null months', () => {
    const c = computeReturnConsistency(heatmap);
    expect(c.totalMonths).toBe(4); // null skipped
    expect(c.positiveMonths).toBe(2); // 3.5 and 8.1; flat 0 not positive
    expect(c.positiveShare).toBeCloseTo(50, 5);
  });

  it('should surface the best and worst month with labels', () => {
    const c = computeReturnConsistency(heatmap);
    expect(c.best).toEqual({ label: 'Mag 25', return: 8.1 });
    expect(c.worst).toEqual({ label: 'Feb 25', return: -1.2 });
  });

  it('should handle an empty heatmap', () => {
    expect(computeReturnConsistency([])).toEqual({
      positiveMonths: 0,
      totalMonths: 0,
      positiveShare: 0,
      best: null,
      worst: null,
    });
  });
});

// ---------------------------------------------------------------------------
// computeDrawdownStatus (B3)
// ---------------------------------------------------------------------------

describe('computeDrawdownStatus', () => {
  const u = (drawdown: number): UnderwaterDrawdownData => ({
    date: '01/25',
    drawdown,
    year: 2025,
    month: 1,
  });

  it('should report the latest drawdown as the current distance from peak', () => {
    const s = computeDrawdownStatus([u(0), u(-5), u(-3.2)]);
    expect(s).not.toBeNull();
    expect(s!.current).toBeCloseTo(-3.2, 5);
    expect(s!.atPeak).toBe(false);
  });

  it('should report atPeak when the latest point is ~0', () => {
    const s = computeDrawdownStatus([u(-5), u(0)]);
    expect(s!.atPeak).toBe(true);
  });

  it('should return null for an empty series', () => {
    expect(computeDrawdownStatus([])).toBeNull();
  });
});
