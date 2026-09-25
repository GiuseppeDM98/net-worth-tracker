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
  resolveCompanionReturnChip,
  summarizeCapitalEntered,
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
  // A7: annualizzare su pochi mesi trasforma una misura in una previsione. Sotto l'anno l'hero
  // mostra il rendimento del periodo, con l'etichetta che dice quale dei due sta guardando
  // (la soglia era 6 mesi fino al 2026-09-20: un YTD di nove mesi stampava «+16,0%» a 54px).

  it('keeps the annualized figure from a year on', () => {
    const result = resolveHeroReturn(12.68, 12);

    expect(result.value).toBe(12.68);
    expect(result.isPeriodReturn).toBe(false);
    expect(result.label).toBe('annualizzato');
  });

  it('states the period return on the year-to-date of nine months, the real account\'s case', () => {
    const result = resolveHeroReturn(16.0, 9);

    expect(result.isPeriodReturn).toBe(true);
    expect(result.value!).toBeCloseTo(11.77, 1);
    expect(result.label).toBe('nei 9 mesi');
    // One month short of a year is still a period; the year itself is not.
    expect(resolveHeroReturn(16.0, 11).isPeriodReturn).toBe(true);
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

describe('deannualizeReturn / resolveCompanionReturnChip', () => {
  it('is the exact inverse of the annualisation, and the step the hero takes below a year', () => {
    // +26,05% a year over 44 months is +133,7% cumulative (the real account's «Storico» window).
    expect(deannualizeReturn(26.05, 44)).toBeCloseTo(133.72, 1);
    expect(deannualizeReturn(12, 12)).toBeCloseTo(12, 9);
    expect(deannualizeReturn(26.5319, 2)).toBeCloseTo(resolveHeroReturn(26.5319, 2).value!, 9);
  });

  it('offers the OTHER basis: cumulative beside an annualised hero, annualised beside a period hero', () => {
    const annualised = resolveHeroReturn(26.05, 44);
    expect(resolveCompanionReturnChip(26.05, 44, annualised)).toEqual({ value: expect.closeTo(133.72, 1), label: 'cumulato in 44 mesi' });
    // Nine months: the hero is what happened, the chip is the rate per year.
    expect(resolveCompanionReturnChip(16.0, 9, resolveHeroReturn(16.0, 9))).toEqual({ value: 16.0, label: 'annualizzato' });
    expect(resolveCompanionReturnChip(16.0, 6, resolveHeroReturn(16.0, 6))).toEqual({ value: 16.0, label: 'annualizzato' });
  });

  it('prints no chip where it would extrapolate or repeat the hero', () => {
    // Below six months not even a 12px chip annualises.
    expect(resolveCompanionReturnChip(26.5319, 2, resolveHeroReturn(26.5319, 2))).toBeNull();
    expect(resolveCompanionReturnChip(26.5319, 5, resolveHeroReturn(26.5319, 5))).toBeNull();
    // Over exactly twelve months the two figures coincide.
    expect(resolveCompanionReturnChip(12.63, 12, resolveHeroReturn(12.63, 12))).toBeNull();
    expect(resolveCompanionReturnChip(null, 9, resolveHeroReturn(null, 9))).toBeNull();
    expect(resolveCompanionReturnChip(11.47, 0, resolveHeroReturn(11.47, 44))).toBeNull();
  });
});

describe('summarizeCapitalEntered', () => {
  const month = (m: number, flows: { net?: number; portfolio?: number | null; pension?: number }) => ({
    date: new Date(2026, m - 1, 1),
    income: 0,
    expenses: 0,
    dividendIncome: 0,
    netCashFlow: flows.net ?? 0,
    ...(flows.portfolio !== undefined ? { portfolioFlow: flows.portfolio } : {}),
    ...(flows.pension !== undefined ? { pensionFlow: flows.pension } : {}),
  });

  it('splits what the formulas neutralised by channel, and a measured month never adds the savings too', () => {
    const summary = summarizeCapitalEntered(
      [month(1, { net: 900 }), month(2, { net: 500, portfolio: 1200 }), month(3, { net: 400, portfolio: 0, pension: 31852 })],
      3,
    );

    expect(summary.channels).toEqual([
      { key: 'measured', amount: 1200, months: 2 },
      { key: 'cashflow', amount: 900, months: 1 },
      { key: 'pension', amount: 31852, months: 1 },
    ]);
    expect(summary.total).toBe(33952);
  });

  it('adds up ON SCREEN: the total is the sum of the rounded channels, not the rounded sum', () => {
    // 100,4 + 200,4 + 300,4 = 601,2 → 601; the printed rows give 100 + 200 + 300 = 600.
    const summary = summarizeCapitalEntered([month(1, { net: 100.4 }), month(2, { portfolio: 200.4, pension: 300.4 })], 2);

    expect(summary.total).toBe(summary.channels.reduce((sum, channel) => sum + channel.amount, 0));
    expect(summary.total).toBe(600);
  });

  it('with the whole net worth as the base there is one channel, the cashflow, over every month — quiet months included', () => {
    // March has no row in the series (nothing moved): it is still a month the cashflow covered.
    const summary = summarizeCapitalEntered([month(1, { net: 900 }), month(2, { net: -300 })], 3);

    expect(summary.channels).toEqual([{ key: 'cashflow', amount: 600, months: 3 }]);
  });

  it('drops a channel that carried no month, and a null portfolio flow is NOT a measured month', () => {
    const summary = summarizeCapitalEntered([month(1, { net: 250, portfolio: null })], 1);

    expect(summary.channels).toEqual([{ key: 'cashflow', amount: 250, months: 1 }]);
  });
});
