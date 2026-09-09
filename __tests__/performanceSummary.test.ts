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
  deannualizeReturn,
  resolveHeroReturn,
  resolvePeriodReturnChip,
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
    expect(c.best).toEqual({ label: 'Mag 25', year: 2025, month: 5, return: 8.1 });
    expect(c.worst).toEqual({ label: 'Feb 25', year: 2025, month: 2, return: -1.2 });
  });

  it('should handle an empty heatmap', () => {
    expect(computeReturnConsistency([])).toEqual({
      positiveMonths: 0,
      totalMonths: 0,
      positiveShare: null,
      best: null,
      worst: null,
    });
  });

  it('withholds the share on a sample too small to express one', () => {
    // Un mese solo darebbe 0% o 100% secchi: sembra una statistica, non lo è. I conteggi restano —
    // sono fatti — e la striscia mostra "1/1 mesi positivi" senza percentuale.
    const single: MonthlyReturnHeatmapData[] = [
      { year: 2026, months: [{ month: 1, return: 2.4 }] },
    ];
    const c = computeReturnConsistency(single);

    expect(c.totalMonths).toBe(1);
    expect(c.positiveMonths).toBe(1);
    expect(c.positiveShare).toBeNull();
    // Con un mese solo, migliore e peggiore sono lo stesso mese: chi renderizza deve mostrarlo una volta.
    expect(c.best).toEqual(c.worst);
  });

  it('reports the share from the third month on', () => {
    const three: MonthlyReturnHeatmapData[] = [
      {
        year: 2026,
        months: [
          { month: 1, return: 2.4 },
          { month: 2, return: -1 },
          { month: 3, return: 1 },
        ],
      },
    ];
    expect(computeReturnConsistency(three).positiveShare).toBeCloseTo(66.667, 3);
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

describe('resolveHeroReturn', () => {
  // A7: annualizzare su due mesi trasforma una misura in una previsione. Sotto i 6 mesi l'hero
  // mostra il rendimento del periodo, con l'etichetta che dice quale dei due sta guardando.

  it('keeps the annualized figure from 6 months on', () => {
    const result = resolveHeroReturn(12.68, 6);

    expect(result.value).toBe(12.68);
    expect(result.isPeriodReturn).toBe(false);
    expect(result.label).toBe('annualizzato');
  });

  it('de-annualizes below the threshold and says so', () => {
    // Un +4% in due mesi annualizza a 1,04^6 − 1 = 26,5319%: è quel numero che l'hero mostrava,
    // una previsione a dodici mesi ricavata da due. Sotto soglia torna a dire +4%.
    const result = resolveHeroReturn(26.5319, 2);

    expect(result.isPeriodReturn).toBe(true);
    expect(result.value!).toBeCloseTo(4, 4);
    expect(result.label).toBe('nei 2 mesi');
  });

  it('uses the singular label for a single month', () => {
    expect(resolveHeroReturn(12.68, 1).label).toBe('nel mese');
  });

  it('is the exact inverse of the annualization, so nothing is invented', () => {
    const annualized = 15.93;
    const months = 3;
    const result = resolveHeroReturn(annualized, months);

    // Ri-annualizzando si torna al punto di partenza.
    const reAnnualized = (Math.pow(1 + result.value! / 100, 12 / months) - 1) * 100;
    expect(reAnnualized).toBeCloseTo(annualized, 6);
  });

  it('handles a negative short-period return', () => {
    const result = resolveHeroReturn(-30, 3);

    expect(result.isPeriodReturn).toBe(true);
    expect(result.value!).toBeLessThan(0);
    expect(result.value!).toBeGreaterThan(-30); // la perdita di periodo è meno profonda dell'annualizzata
  });

  it('passes a missing return through without inventing a label', () => {
    const result = resolveHeroReturn(null, 2);

    expect(result.value).toBeNull();
    expect(result.isPeriodReturn).toBe(false);
  });
});

describe('deannualizeReturn / resolvePeriodReturnChip', () => {
  it('is the exact inverse of the annualisation, and the step the hero takes below six months', () => {
    // +26,05% a year over 44 months is +133,7% cumulative (the real account's «Storico» window).
    expect(deannualizeReturn(26.05, 44)).toBeCloseTo(133.72, 1);
    expect(deannualizeReturn(12, 12)).toBeCloseTo(12, 9);
    expect(deannualizeReturn(26.5319, 2)).toBeCloseTo(resolveHeroReturn(26.5319, 2).value!, 9);
  });

  it('offers the cumulative TWR as the second chip when the hero is annualised, and nothing when the hero already is the period return', () => {
    const annualised = resolveHeroReturn(26.05, 44);
    expect(resolvePeriodReturnChip(26.05, 44, annualised)).toEqual({ value: expect.closeTo(133.72, 1), label: 'cumulato in 44 mesi' });
    // Below six months the hero IS the period return: a second copy would answer the same question twice.
    expect(resolvePeriodReturnChip(26.5319, 2, resolveHeroReturn(26.5319, 2))).toBeNull();
    // Over exactly twelve months the two figures coincide.
    expect(resolvePeriodReturnChip(12.63, 12, resolveHeroReturn(12.63, 12))).toBeNull();
    expect(resolvePeriodReturnChip(null, 9, resolveHeroReturn(null, 9))).toBeNull();
    expect(resolvePeriodReturnChip(11.47, 0, annualised)).toBeNull();
  });
});
