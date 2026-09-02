import { describe, it, expect, vi } from 'vitest';

// monteCarloService only imports chartService for a currency label; mocking it keeps the
// Firebase client SDK (loaded by chartService at module level) out of the test.
vi.mock('@/lib/services/chartService', () => ({
  formatCurrencyCompact: (value: number) => String(Math.round(value)),
}));

// fireService is imported only for the Ventaglio coherence test below; these two mocks keep its
// Firestore-coupled imports (expense/snapshot fetchers) out of the test, same as fireService.test.ts.
vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

import {
  runMonteCarloSimulation,
  runAccumulationSimulation,
  type AccumulationSimulationParams,
} from '@/lib/services/monteCarloService';
import { calculateFIREProjection, getDefaultScenarios } from '@/lib/services/fireService';
import type { MonteCarloParams } from '@/types/assets';

/**
 * Zero-volatility params make every path deterministic (randomNormal(mean, 0) === mean),
 * so the inflow ordering (inflow → market return → withdrawal) can be asserted exactly.
 * There is no seedable RNG in the service, hence structure-by-determinism per the spec.
 */
function makeDeterministicParams(overrides: Partial<MonteCarloParams> = {}): MonteCarloParams {
  return {
    portfolioSource: 'custom',
    initialPortfolio: 1_000_000,
    retirementYears: 5,
    equityPercentage: 100,
    bondsPercentage: 0,
    realEstatePercentage: 0,
    commoditiesPercentage: 0,
    annualWithdrawal: 50_000,
    withdrawalAdjustment: 'fixed',
    equityReturn: 5,
    equityVolatility: 0,
    bondsReturn: 0,
    bondsVolatility: 0,
    realEstateReturn: 0,
    realEstateVolatility: 0,
    commoditiesReturn: 0,
    commoditiesVolatility: 0,
    inflationRate: 0,
    numberOfSimulations: 10,
    ...overrides,
  };
}

function pathValues(result: ReturnType<typeof runMonteCarloSimulation>): number[] {
  return result.simulations[0].path.map((point) => point.value);
}

/**
 * Independent replica of the DOCUMENTED order (inflow at start of year → return → withdrawal),
 * written here so the test does not import anything from the service under test.
 */
function expectedPath(
  initial: number,
  years: number,
  growthRate: number,
  withdrawal: number,
  inflows: { year: number; amount: number }[] = []
): number[] {
  let portfolio = initial + inflows
    .filter((inflow) => inflow.year <= 0)
    .reduce((sum, inflow) => sum + inflow.amount, 0);
  const path = [portfolio];
  for (let year = 1; year <= years; year++) {
    for (const inflow of inflows) {
      if (inflow.year === year) portfolio += inflow.amount;
    }
    portfolio *= 1 + growthRate / 100;
    portfolio -= withdrawal;
    path.push(portfolio);
  }
  return path;
}

describe('runMonteCarloSimulation — capital inflows', () => {
  it('baseline: at zero volatility the path is deterministic (5% growth, 50k withdrawal)', () => {
    const result = runMonteCarloSimulation(makeDeterministicParams());
    const expected = expectedPath(1_000_000, 5, 5, 50_000);

    expect(result.successRate).toBe(100);
    const actual = pathValues(result);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));
    // Sanity on the arithmetic itself: 1M·1.05 − 50k = 1M, the path is flat.
    expect(actual[5]).toBeCloseTo(1_000_000, 4);
  });

  it('regression: an empty capitalInflows array produces the same paths as omitting it', () => {
    const withoutInflows = runMonteCarloSimulation(makeDeterministicParams());
    const withEmpty = runMonteCarloSimulation(makeDeterministicParams({ capitalInflows: [] }));

    expect(pathValues(withEmpty)).toEqual(pathValues(withoutInflows));
    expect(withEmpty.successRate).toBe(withoutInflows.successRate);
  });

  it('applies an inflow at the START of its year: inflow → market return → withdrawal', () => {
    const inflows = [{ year: 3, amount: 100_000 }];
    const result = runMonteCarloSimulation(makeDeterministicParams({ capitalInflows: inflows }));
    const expected = expectedPath(1_000_000, 5, 5, 50_000, inflows);

    // Years 1-2 unchanged; year 3: (1M + 100k)·1.05 − 50k = 1_105_000, then the surplus compounds.
    const actual = pathValues(result);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 6));
    expect(actual[3]).toBeCloseTo(1_105_000, 4);
    expect(actual[4]).toBeCloseTo(1_110_250, 4);
  });

  it('an inflow can rescue an otherwise failing plan (failure year moves later or disappears)', () => {
    const failing = runMonteCarloSimulation(
      makeDeterministicParams({ annualWithdrawal: 120_000, retirementYears: 30 })
    );
    const rescuedLater = runMonteCarloSimulation(
      makeDeterministicParams({
        annualWithdrawal: 120_000,
        retirementYears: 30,
        capitalInflows: [{ year: 5, amount: 500_000 }],
      })
    );

    expect(failing.successRate).toBe(0);
    expect(rescuedLater.simulations[0].failureYear ?? Infinity).toBeGreaterThan(
      failing.simulations[0].failureYear ?? Infinity
    );
  });

  it('treats an inflow at year 0 (or earlier) as part of the initial portfolio', () => {
    const result = runMonteCarloSimulation(
      makeDeterministicParams({ capitalInflows: [{ year: 0, amount: 100_000 }] })
    );

    expect(result.simulations[0].path[0].value).toBe(1_100_000);
    expect(result.simulations[0].path[1].value).toBeCloseTo(1_105_000, 4);
  });
});

/**
 * Accumulation engine for the FIRE Ventaglio view.
 *
 * Zero volatility makes randomNormal(mean, 0) === mean, so every path is deterministic and can
 * be compared FLOAT-FOR-FLOAT against calculateFIREProjection's base scenario — the spec's key
 * coherence requirement ("a volatilità 0 il ventaglio collassa sulla proiezione deterministica").
 * The comparison deliberately runs WITHOUT capital inflows: the deterministic bridge grows the
 * pension compartment while a Monte Carlo run adds inflows at TODAY's value (doc/guide/fire.md § FIRE, What If and Goals),
 * so identity only holds — and only must hold — on the shared, inflow-free model.
 */
function makeAccumulationParams(
  overrides: Partial<AccumulationSimulationParams> = {}
): AccumulationSimulationParams {
  return {
    initialPortfolio: 100_000,
    annualSavings: 20_000,
    annualExpenses: 30_000,
    withdrawalRate: 4,
    expenseInflationRate: 2.5,
    years: 40,
    equityPercentage: 100,
    bondsPercentage: 0,
    realEstatePercentage: 0,
    commoditiesPercentage: 0,
    equityReturn: 7,
    equityVolatility: 0,
    bondsReturn: 0,
    bondsVolatility: 0,
    realEstateReturn: 0,
    realEstateVolatility: 0,
    commoditiesReturn: 0,
    commoditiesVolatility: 0,
    numberOfSimulations: 10,
    ...overrides,
  };
}

describe('runAccumulationSimulation — Ventaglio engine', () => {
  it('at zero volatility every path collapses onto the deterministic base projection', () => {
    // Same rates as the engine fixture: base scenario 7% growth / 2.5% inflation.
    const projection = calculateFIREProjection(
      100_000,
      30_000,
      20_000,
      4,
      getDefaultScenarios(),
      50
    );
    const years = Math.min(projection.yearlyData.length, 40);
    const result = runAccumulationSimulation(makeAccumulationParams({ years }));

    expect(result.paths).toHaveLength(10);
    for (const path of result.paths) {
      expect(path).toHaveLength(years + 1);
      expect(path[0].value).toBe(100_000);
      for (let year = 1; year <= years; year++) {
        // yearlyData is 0-indexed from year 1 and stores Math.round of the same float chain.
        expect(Math.round(path[year].value)).toBe(projection.yearlyData[year - 1].baseNetWorth);
      }
    }

    // FIRE year per path === deterministic base FIRE year, savings stop included (the
    // yearlyData series continues past the FIRE year with savings already stopped, so the
    // per-year identity above would break if the engine kept adding them).
    expect(projection.baseYearsToFIRE).not.toBeNull();
    for (const fireYear of result.fireYears) {
      expect(fireYear).toBe(projection.baseYearsToFIRE);
    }

    // The moving FIRE target is the deterministic one (same inflation chain).
    for (let year = 1; year <= years; year++) {
      expect(Math.round(result.percentiles[year].fireTarget)).toBe(
        projection.yearlyData[year - 1].baseFireNumber
      );
    }

    // Cumulative FIRE probability is a step: 0 before the deterministic year, 100 from it on.
    const fireYear = projection.baseYearsToFIRE!;
    expect(result.percentiles[fireYear - 1].fireProbability).toBe(0);
    expect(result.percentiles[fireYear].fireProbability).toBe(100);
  });

  it('keeps percentiles monotone (p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90) under real volatility', () => {
    const result = runAccumulationSimulation(
      makeAccumulationParams({
        years: 25,
        equityVolatility: 18,
        numberOfSimulations: 300,
      })
    );

    expect(result.percentiles).toHaveLength(26);
    for (const point of result.percentiles) {
      expect(point.p10).toBeLessThanOrEqual(point.p25);
      expect(point.p25).toBeLessThanOrEqual(point.p50);
      expect(point.p50).toBeLessThanOrEqual(point.p75);
      expect(point.p75).toBeLessThanOrEqual(point.p90);
    }
  });

  it('keeps the cumulative FIRE probability non-decreasing and within [0, 100]', () => {
    const result = runAccumulationSimulation(
      makeAccumulationParams({
        years: 30,
        equityVolatility: 18,
        numberOfSimulations: 300,
      })
    );

    let previous = 0;
    for (const point of result.percentiles) {
      expect(point.fireProbability).toBeGreaterThanOrEqual(previous);
      expect(point.fireProbability).toBeLessThanOrEqual(100);
      previous = point.fireProbability;
    }
  });

  it('applies a capital inflow at the START of its year, at today\'s value (inflow → return → savings)', () => {
    const withInflow = runAccumulationSimulation(
      makeAccumulationParams({ capitalInflows: [{ year: 3, amount: 100_000 }] })
    );
    const without = runAccumulationSimulation(makeAccumulationParams());

    const path = withInflow.paths[0];
    const basePath = without.paths[0];
    // Years 1-2 untouched.
    expect(path[1].value).toBeCloseTo(basePath[1].value, 6);
    expect(path[2].value).toBeCloseTo(basePath[2].value, 6);
    // Year 3: (previous + 100k)·1.07 + savings — the inflow earns its own year's return.
    expect(path[3].value).toBeCloseTo((path[2].value + 100_000) * 1.07 + 20_000, 6);
  });

  it('folds an inflow at year 0 into the starting portfolio', () => {
    const result = runAccumulationSimulation(
      makeAccumulationParams({ capitalInflows: [{ year: 0, amount: 50_000 }] })
    );

    expect(result.paths[0][0].value).toBe(150_000);
  });

  it('an empty capitalInflows array behaves exactly like omitting it', () => {
    const without = runAccumulationSimulation(makeAccumulationParams());
    const withEmpty = runAccumulationSimulation(makeAccumulationParams({ capitalInflows: [] }));

    expect(withEmpty.paths[0].map((p) => p.value)).toEqual(without.paths[0].map((p) => p.value));
    expect(withEmpty.fireYears).toEqual(without.fireYears);
  });
});

describe('createDistribution (through runMonteCarloSimulation)', () => {
  it('caps the equal-width bins at the 95th percentile and lets the last bin take the tail', () => {
    const results = runMonteCarloSimulation({
      portfolioSource: 'total',
      initialPortfolio: 500000,
      retirementYears: 30,
      equityPercentage: 60,
      bondsPercentage: 40,
      realEstatePercentage: 0,
      commoditiesPercentage: 0,
      annualWithdrawal: 20000,
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
      numberOfSimulations: 600,
    });
    const bins = results.distribution;
    const finals = results.simulations.map((sim) => sim.finalValue).sort((a, b) => a - b);
    const p95 = finals[Math.floor(finals.length * 0.95)];
    const max = finals[finals.length - 1];

    expect(bins).toHaveLength(10);
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(600);
    // Nine equal bins up to the 95th percentile, the tenth from there to the maximum.
    expect(bins[8].to).toBeCloseTo(finals[0] + ((p95 - finals[0]) / 10) * 9, 3);
    expect(bins[9].from).toBeCloseTo(bins[8].to, 6);
    expect(bins[9].to).toBe(max);
    for (let i = 1; i < bins.length; i++) expect(bins[i].from).toBeCloseTo(bins[i - 1].to, 6);
    // With a heavy right tail the last bin is the widest — never nine empty bins under one outlier.
    expect(bins[9].to - bins[9].from).toBeGreaterThan(bins[0].to - bins[0].from);
  });
});
