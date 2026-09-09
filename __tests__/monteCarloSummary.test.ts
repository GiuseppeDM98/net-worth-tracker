/**
 * Tests for lib/utils/monteCarloSummary.ts — the numbers of FIRE › Monte Carlo, read from the
 * results the service already computed: the base run (probability, the year the 10th percentile
 * touches zero, the final percentiles, the histogram with the median's bin), the three scenarios
 * side by side, the overlay and percentile rows of the Dettaglio, the plan as typed, and the
 * «parameters changed since the last run» comparison.
 */

import { describe, expect, it, vi } from 'vitest';

// `getDefaultMonteCarloScenarios` lives beside the service's chartService import, which drags the
// Firebase chain in — mocked away as in every other pure-layer suite.
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import type { MonteCarloParams, MonteCarloResults, PercentilesData } from '@/types/assets';
import {
  buildOverlaySeries,
  buildPercentileRows,
  formatInputAmount,
  haveRunInputsChanged,
  parseItalianNumber,
  resolveP10DepletionYear,
  resolveSuccessTone,
  summarizeMonteCarloPlan,
  summarizeMonteCarloRun,
  summarizeScenarios,
  type MonteCarloRunInputs,
} from '@/lib/utils/monteCarloSummary';
import { getDefaultMonteCarloScenarios } from '@/lib/services/monteCarloService';

const CTX = { startCalendarYear: 2026, currentAge: 46 };

function makeParams(overrides: Partial<MonteCarloParams> = {}): MonteCarloParams {
  return {
    portfolioSource: 'total',
    initialPortfolio: 488600,
    retirementYears: 35,
    equityPercentage: 58,
    bondsPercentage: 27,
    realEstatePercentage: 10,
    commoditiesPercentage: 5,
    annualWithdrawal: 22000,
    withdrawalAdjustment: 'inflation',
    equityReturn: 7,
    equityVolatility: 18,
    bondsReturn: 3,
    bondsVolatility: 6,
    realEstateReturn: 5,
    realEstateVolatility: 12,
    commoditiesReturn: 3.5,
    commoditiesVolatility: 20,
    inflationRate: 2.5,
    numberOfSimulations: 10000,
    ...overrides,
  };
}

/** Percentiles for years 0..years; `p10ZeroFrom` = first year the 10th percentile is 0 (null = never). */
function makePercentiles(years: number, p10ZeroFrom: number | null): PercentilesData[] {
  const rows: PercentilesData[] = [];
  for (let year = 0; year <= years; year++) {
    const depleted = p10ZeroFrom !== null && year >= p10ZeroFrom;
    rows.push({ year, p10: depleted ? 0 : 400000 - year * 1000, p25: 450000, p50: 500000 + year * 3000, p75: 700000, p90: 900000 });
  }
  return rows;
}

function makeResults(overrides: Partial<MonteCarloResults> = {}): MonteCarloResults {
  return {
    successRate: 84.21,
    successCount: 8421,
    failureCount: 1579,
    medianFinalValue: 640000,
    percentiles: makePercentiles(35, 27),
    failureAnalysis: { averageFailureYear: 24.4, medianFailureYear: 26 },
    distribution: [
      { range: '€0-€420k', count: 1579, percentage: 15.79, from: 0, to: 420000 },
      { range: '€420k-€840k', count: 2210, percentage: 22.1, from: 420000, to: 840000 },
      { range: '€840k-€1,3 Mln', count: 6211, percentage: 62.11, from: 840000, to: 1260000 },
    ],
    simulations: [],
    ...overrides,
  };
}

describe('resolveP10DepletionYear', () => {
  it('returns the first simulation year (from 1) at which the 10th percentile is zero', () => {
    expect(resolveP10DepletionYear(makePercentiles(35, 27))).toBe(27);
  });

  it('returns null when the 10th percentile never touches zero', () => {
    expect(resolveP10DepletionYear(makePercentiles(35, null))).toBeNull();
  });

  it('ignores year 0 (the starting capital is never "depleted")', () => {
    const rows = makePercentiles(5, null);
    rows[0] = { ...rows[0], p10: 0 };
    expect(resolveP10DepletionYear(rows)).toBeNull();
  });
});

describe('summarizeMonteCarloRun', () => {
  it('reads the probability, the horizon and the age at its end from the saved age', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), CTX);
    expect(run.successRate).toBeCloseTo(84.21);
    expect(run.successCount).toBe(8421);
    expect(run.failureCount).toBe(1579);
    expect(run.simulations).toBe(10000);
    expect(run.years).toBe(35);
    expect(run.endCalendarYear).toBe(2061);
    expect(run.endAge).toBe(81);
  });

  it('has no end age without a saved age', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), { ...CTX, currentAge: null });
    expect(run.endAge).toBeNull();
  });

  it('takes the median of ALL simulations from the last percentile row, never the survivors-only figure', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), CTX);
    expect(run.medianFinal).toBe(500000 + 35 * 3000);
    expect(run.finalPercentiles).toEqual({ p10: 0, p25: 450000, p50: 605000, p75: 700000, p90: 900000 });
  });

  it('dates the 10th-percentile depletion in calendar years and in age', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), CTX);
    expect(run.p10DepletionYear).toBe(27);
    expect(run.p10DepletionCalendarYear).toBe(2053);
    expect(run.p10DepletionAge).toBe(73);
  });

  it('leaves the depletion null when the 10th percentile survives', () => {
    const run = summarizeMonteCarloRun(makeResults({ percentiles: makePercentiles(35, null) }), makeParams(), CTX);
    expect(run.p10DepletionYear).toBeNull();
    expect(run.p10DepletionCalendarYear).toBeNull();
    expect(run.p10DepletionAge).toBeNull();
  });

  it('rounds the average failure year and dates both failure figures', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), CTX);
    expect(run.failureAverageYear).toBe(24);
    expect(run.failureAverageCalendarYear).toBe(2050);
    expect(run.failureMedianYear).toBe(26);
    expect(run.failureMedianCalendarYear).toBe(2052);
  });

  it('has no failure figures when nothing failed', () => {
    const run = summarizeMonteCarloRun(makeResults({ failureAnalysis: null, failureCount: 0, successCount: 10000, successRate: 100 }), makeParams(), CTX);
    expect(run.failureAverageYear).toBeNull();
    expect(run.failureMedianCalendarYear).toBeNull();
  });

  it('builds the histogram with each bin share and marks the bin holding the median', () => {
    const run = summarizeMonteCarloRun(makeResults(), makeParams(), CTX);
    expect(run.histogram).toHaveLength(3);
    expect(run.histogram[0]).toMatchObject({ from: 0, to: 420000, count: 1579, containsMedian: false });
    expect(run.histogram[1]).toMatchObject({ from: 420000, to: 840000, count: 2210, containsMedian: true });
    expect(run.histogram[1].sharePct).toBeCloseTo(22.1);
    expect(run.histogramCap).toBe(840000);
    expect(run.histogramMax).toBe(1260000);
  });

  it('puts a zero median in the first bin (the failed simulations live there too)', () => {
    const percentiles = makePercentiles(35, 27).map((row) => ({ ...row, p50: 0 }));
    const run = summarizeMonteCarloRun(makeResults({ percentiles }), makeParams(), CTX);
    expect(run.histogram[0].containsMedian).toBe(true);
  });

  it('puts a median equal to the last bin upper bound in the last bin', () => {
    const percentiles = makePercentiles(35, 27).map((row) => ({ ...row, p50: 1260000 }));
    const run = summarizeMonteCarloRun(makeResults({ percentiles }), makeParams(), CTX);
    expect(run.histogram[2].containsMedian).toBe(true);
  });
});

describe('summarizeScenarios', () => {
  it('lists bear, base and bull in that order with their probability, median and depletion year', () => {
    const bear = makeResults({ successRate: 61.5, successCount: 6150, failureCount: 3850, percentiles: makePercentiles(35, 19) });
    const base = makeResults();
    const bull = makeResults({ successRate: 96.8, successCount: 9680, failureCount: 320, percentiles: makePercentiles(35, null) });
    const comparison = summarizeScenarios({ bear, base, bull }, makeParams(), CTX);
    expect(comparison.rows.map((row) => row.key)).toEqual(['bear', 'base', 'bull']);
    expect(comparison.rows[0]).toMatchObject({ successRate: 61.5, p10DepletionCalendarYear: 2045, failureCount: 3850 });
    expect(comparison.rows[2]).toMatchObject({ successRate: 96.8, p10DepletionCalendarYear: null });
    expect(comparison.rows[1].medianFinal).toBe(605000);
    expect(comparison.spreadPoints).toBeCloseTo(35.3);
  });
});

describe('buildOverlaySeries / buildPercentileRows', () => {
  it('merges the three medians and the base band by calendar year', () => {
    const bear = makeResults({ percentiles: makePercentiles(2, null).map((r) => ({ ...r, p50: 100 })) });
    const base = makeResults({ percentiles: makePercentiles(2, null) });
    const bull = makeResults({ percentiles: makePercentiles(2, null).map((r) => ({ ...r, p50: 900 })) });
    const series = buildOverlaySeries({ bear, base, bull }, 2026);
    expect(series).toHaveLength(3);
    expect(series[1]).toEqual({ calendarYear: 2027, bearP50: 100, baseP50: 503000, bullP50: 900, baseBand: [399000, 900000] });
  });

  it('samples the percentiles every five years, first and last included', () => {
    const rows = buildPercentileRows(makePercentiles(35, 27), 2026);
    expect(rows.map((row) => row.calendarYear)).toEqual([2026, 2031, 2036, 2041, 2046, 2051, 2056, 2061]);
    expect(rows[7]).toMatchObject({ p10: 0, p50: 605000 });
  });

  it('keeps the last year even when the horizon is not a multiple of five', () => {
    const rows = buildPercentileRows(makePercentiles(12, null), 2026);
    expect(rows.map((row) => row.calendarYear)).toEqual([2026, 2031, 2036, 2038]);
  });
});

describe('summarizeMonteCarloPlan', () => {
  it('states the plan as typed, with the locked fund and its inflows dated', () => {
    const plan = summarizeMonteCarloPlan(makeParams(), [{ year: 19, amount: 31400 }], 31400, CTX);
    expect(plan).toMatchObject({
      initialPortfolio: 488600,
      lockedValue: 31400,
      annualWithdrawal: 22000,
      isIndexed: true,
      years: 35,
      endAge: 81,
      endCalendarYear: 2061,
      simulations: 10000,
    });
    expect(plan.allocation).toEqual([
      { key: 'equity', label: 'azioni', pct: 58 },
      { key: 'bonds', label: 'obbligazioni', pct: 27 },
      { key: 'realEstate', label: 'immobili', pct: 10 },
      { key: 'commodities', label: 'materie prime', pct: 5 },
    ]);
    expect(plan.inflows).toEqual([{ yearOffset: 19, calendarYear: 2045, amount: 31400 }]);
  });

  it('drops the classes at 0% and reads a fixed withdrawal', () => {
    const plan = summarizeMonteCarloPlan(makeParams({ realEstatePercentage: 0, commoditiesPercentage: 0, equityPercentage: 60, bondsPercentage: 40, withdrawalAdjustment: 'fixed' }), [], 0, CTX);
    expect(plan.allocation.map((a) => a.key)).toEqual(['equity', 'bonds']);
    expect(plan.isIndexed).toBe(false);
    expect(plan.lockedValue).toBe(0);
    expect(plan.inflows).toEqual([]);
  });
});

describe('haveRunInputsChanged', () => {
  const inputs = (): MonteCarloRunInputs => ({ params: makeParams(), scenarios: getDefaultMonteCarloScenarios(), inflows: [{ year: 19, amount: 31400 }] });

  it('is false for identical inputs', () => {
    expect(haveRunInputsChanged(inputs(), inputs())).toBe(false);
  });

  it('is true when a plan parameter, a scenario parameter or an inflow changes', () => {
    const a = inputs();
    expect(haveRunInputsChanged(a, { ...inputs(), params: makeParams({ annualWithdrawal: 23000 }) })).toBe(true);
    const scenarios = getDefaultMonteCarloScenarios();
    scenarios.bear.equityReturn = 3;
    expect(haveRunInputsChanged(a, { ...inputs(), scenarios })).toBe(true);
    expect(haveRunInputsChanged(a, { ...inputs(), inflows: [] })).toBe(true);
  });

  it('ignores the market fields of the single form (the scenarios carry them)', () => {
    expect(haveRunInputsChanged(inputs(), { ...inputs(), params: makeParams({ equityReturn: 9 }) })).toBe(false);
  });
});

describe('resolveSuccessTone', () => {
  it('is positive from 90, warning from 80, negative below', () => {
    expect(resolveSuccessTone(95)).toBe('positive');
    expect(resolveSuccessTone(90)).toBe('positive');
    expect(resolveSuccessTone(84.2)).toBe('warning');
    expect(resolveSuccessTone(80)).toBe('warning');
    expect(resolveSuccessTone(79.9)).toBe('negative');
  });
});

describe('parseItalianNumber / formatInputAmount', () => {
  it('reads it-IT amounts, plain numbers and hand-typed decimals', () => {
    expect(parseItalianNumber('488.600,00')).toBe(488600);
    expect(parseItalianNumber('488600')).toBe(488600);
    expect(parseItalianNumber('1.250.000')).toBe(1250000);
    expect(parseItalianNumber('12.5')).toBe(12.5);
    expect(parseItalianNumber('22000 €')).toBe(22000);
    expect(parseItalianNumber('')).toBeNull();
    expect(parseItalianNumber('abc')).toBeNull();
  });

  it('prints a committed amount grouped, without cents', () => {
    expect(formatInputAmount(488600.4)).toBe('488.600');
    expect(formatInputAmount(9500)).toBe('9500');
  });
});
