import {
  MonteCarloParams,
  MonteCarloResults,
  MonteCarloCapitalInflow,
  SingleSimulationResult,
  PercentilesData,
  MonteCarloScenarios,
  MonteCarloScenarioParams,
} from '@/types/assets';
import { formatCurrencyCompact } from './chartService';

/**
 * Generate a random number from a normal distribution using Box-Muller transform
 *
 * The Box-Muller transform converts two independent uniform random variables (0,1)
 * into two independent standard normal random variables. This is essential for
 * Monte Carlo simulations that require normally distributed returns.
 *
 * Algorithm: z = √(-2 * ln(u1)) * cos(2π * u2)
 * where u1, u2 are uniform random variables [0,1]
 *
 * @param mean - Mean of the distribution
 * @param stdDev - Standard deviation of the distribution
 * @returns Random number from normal distribution
 *
 * @see https://en.wikipedia.org/wiki/Box%E2%80%93Muller_transform
 */
function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}

/**
 * Calculate mean of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Run a single Monte Carlo simulation
 */
function runSingleSimulation(
  params: MonteCarloParams,
  simulationId: number
): SingleSimulationResult {
  let portfolio = params.initialPortfolio;

  // Capital inflows: defined order is inflow → market return → withdrawal, so an
  // inflow earns its own year's return before that year's withdrawal. Inflows at year <= 0
  // are simply part of the starting portfolio.
  const inflows = params.capitalInflows ?? [];
  for (const inflow of inflows) {
    if (inflow.year <= 0) portfolio += inflow.amount;
  }

  const path: { year: number; value: number }[] = [{ year: 0, value: portfolio }];

  for (let year = 1; year <= params.retirementYears; year++) {
    // Add the inflows landing this year BEFORE applying the market return
    for (const inflow of inflows) {
      if (inflow.year === year) portfolio += inflow.amount;
    }

    // Generate random returns for each asset class
    const equityReturn = randomNormal(params.equityReturn, params.equityVolatility);
    const bondsReturn = randomNormal(params.bondsReturn, params.bondsVolatility);
    const realEstateReturn = randomNormal(params.realEstateReturn, params.realEstateVolatility);
    const commoditiesReturn = randomNormal(params.commoditiesReturn, params.commoditiesVolatility);

    // Calculate weighted portfolio return across all 4 asset classes
    const portfolioReturn =
      (equityReturn * params.equityPercentage) / 100 +
      (bondsReturn * params.bondsPercentage) / 100 +
      (realEstateReturn * params.realEstatePercentage) / 100 +
      (commoditiesReturn * params.commoditiesPercentage) / 100;

    // Apply return to portfolio
    portfolio *= 1 + portfolioReturn / 100;

    // Calculate withdrawal (adjusted for inflation if needed)
    let withdrawal = params.annualWithdrawal;
    if (params.withdrawalAdjustment === 'inflation') {
      withdrawal *= Math.pow(1 + params.inflationRate / 100, year);
    }

    // Subtract withdrawal
    portfolio -= withdrawal;

    // Check for failure
    if (portfolio <= 0) {
      return {
        simulationId,
        success: false,
        failureYear: year,
        finalValue: 0,
        path,
      };
    }

    path.push({ year, value: portfolio });
  }

  return {
    simulationId,
    success: true,
    finalValue: portfolio,
    path,
  };
}

/**
 * Calculate percentiles for each year across all simulations
 */
function calculatePercentiles(
  simulations: SingleSimulationResult[],
  years: number
): PercentilesData[] {
  const percentiles: PercentilesData[] = [];

  for (let year = 0; year <= years; year++) {
    const valuesAtYear: number[] = simulations
      .map((sim) => {
        // Find value at this year, or use 0 if simulation failed before this year
        const pathEntry = sim.path.find((p) => p.year === year);
        return pathEntry ? pathEntry.value : 0;
      })
      .sort((a, b) => a - b);

    const p10Index = Math.floor(valuesAtYear.length * 0.1);
    const p25Index = Math.floor(valuesAtYear.length * 0.25);
    const p50Index = Math.floor(valuesAtYear.length * 0.5);
    const p75Index = Math.floor(valuesAtYear.length * 0.75);
    const p90Index = Math.floor(valuesAtYear.length * 0.9);

    percentiles.push({
      year,
      p10: valuesAtYear[p10Index],
      p25: valuesAtYear[p25Index],
      p50: valuesAtYear[p50Index],
      p75: valuesAtYear[p75Index],
      p90: valuesAtYear[p90Index],
    });
  }

  return percentiles;
}

/**
 * Create distribution bins for final portfolio values.
 *
 * Equal-width bins from the smallest final value up to the 95TH PERCENTILE, the last bin taking
 * the tail up to the maximum (2026-08-26): a thirty-year run has a heavy right tail, and bins
 * stretched to an outlier of ten times the median left nine of ten bins empty. The last bin is
 * therefore wider than the others and the surface says so (the Distribuzione footer).
 */
function createDistribution(
  simulations: SingleSimulationResult[],
  bins: number = 10
): MonteCarloResults['distribution'] {
  const finalValues = simulations.map((sim) => sim.finalValue);
  const sorted = [...finalValues].sort((a, b) => a - b);
  const maxValue = sorted[sorted.length - 1];
  const minValue = sorted[0];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const cap = p95 > minValue ? p95 : maxValue;
  // A flat distribution (every path identical) still needs a positive width.
  const binSize = cap > minValue ? (cap - minValue) / bins : 1;

  const distribution: MonteCarloResults['distribution'] = [];

  for (let i = 0; i < bins; i++) {
    const isLast = i === bins - 1;
    const rangeStart = minValue + i * binSize;
    const rangeEnd = isLast ? Math.max(maxValue, minValue + bins * binSize) : minValue + (i + 1) * binSize;
    const count = finalValues.filter((val) => val >= rangeStart && (isLast ? val <= rangeEnd : val < rangeEnd)).length;

    const rangeLabel =
      rangeStart === 0 && rangeEnd === 0
        ? '€0'
        : `${formatCurrencyCompact(rangeStart)}-${formatCurrencyCompact(rangeEnd)}`;

    distribution.push({
      range: rangeLabel,
      count,
      percentage: (count / simulations.length) * 100,
      from: rangeStart,
      to: rangeEnd,
    });
  }

  return distribution;
}

/**
 * Run Monte Carlo simulation with given parameters
 *
 * Performs multiple simulations of portfolio performance over retirement years.
 * Each simulation:
 * 1. Generates random returns for equity and bonds using normal distribution
 * 2. Applies weighted portfolio returns
 * 3. Withdraws annual amount (optionally adjusted for inflation)
 * 4. Tracks success/failure and portfolio path
 *
 * @param params - Simulation parameters (portfolio size, allocation, withdrawal, returns, etc.)
 * @returns Aggregated results with success rate, percentiles, and distribution
 */
export function runMonteCarloSimulation(params: MonteCarloParams): MonteCarloResults {
  const simulations: SingleSimulationResult[] = [];

  // Run all simulations
  for (let i = 0; i < params.numberOfSimulations; i++) {
    simulations.push(runSingleSimulation(params, i));
  }

  // Analyze results
  const successfulSims = simulations.filter((sim) => sim.success);
  const failedSims = simulations.filter((sim) => !sim.success);

  const successRate = (successfulSims.length / simulations.length) * 100;

  // Calculate median final value (only from successful simulations)
  const finalValues = successfulSims.map((sim) => sim.finalValue).sort((a, b) => a - b);
  const medianFinalValue =
    finalValues.length > 0
      ? finalValues[Math.floor(finalValues.length / 2)]
      : 0;

  // Calculate failure analysis
  let failureAnalysis = null;
  if (failedSims.length > 0) {
    const failureYears = failedSims.map((sim) => sim.failureYear || 0);
    const avgFailureYear = mean(failureYears);
    const sortedFailureYears = [...failureYears].sort((a, b) => a - b);
    const medianFailureYear = sortedFailureYears[Math.floor(sortedFailureYears.length / 2)];

    failureAnalysis = {
      averageFailureYear: avgFailureYear,
      medianFailureYear,
    };
  }

  // Calculate percentiles
  const percentiles = calculatePercentiles(simulations, params.retirementYears);

  // Create distribution
  const distribution = createDistribution(simulations, 10);

  return {
    successRate,
    successCount: successfulSims.length,
    failureCount: failedSims.length,
    medianFinalValue,
    percentiles,
    failureAnalysis,
    distribution,
    simulations,
  };
}

// ===== Accumulation simulation (Ventaglio view on the FIRE tab) =====

export interface AccumulationSimulationParams {
  initialPortfolio: number;
  /** Added each year until that path reaches FIRE — same rule as calculateFIREProjection. */
  annualSavings: number;
  /** Today's annual expenses; inflated each year to build the moving FIRE target. */
  annualExpenses: number;
  withdrawalRate: number; // %
  /** % — the moving target's inflation, matching the deterministic base scenario's. */
  expenseInflationRate: number;
  /** Simulation horizon in years (the caller caps it — the Ventaglio uses min(deterministic, 40)). */
  years: number;

  // 4-class allocation (summing to 100) + per-class market parameters, as in MonteCarloParams.
  equityPercentage: number;
  bondsPercentage: number;
  realEstatePercentage: number;
  commoditiesPercentage: number;
  equityReturn: number;
  equityVolatility: number;
  bondsReturn: number;
  bondsVolatility: number;
  realEstateReturn: number;
  realEstateVolatility: number;
  commoditiesReturn: number;
  commoditiesVolatility: number;

  numberOfSimulations: number;

  // Pension inflows at TODAY's value (no deterministic fund growth inside a stochastic
  // run — doc/guide/fire.md § FIRE, What If and Goals). Order per year: inflow → return → savings.
  capitalInflows?: MonteCarloCapitalInflow[];
}

export interface AccumulationPercentilePoint extends PercentilesData {
  /** Moving FIRE number at this year (deterministic — inflation only, no randomness). */
  fireTarget: number;
  /** Cumulative % of paths that have reached FIRE by this year. */
  fireProbability: number;
}

export interface AccumulationSimulationResult {
  /** One full path per simulation, year 0..years — no path ever fails (accumulation only). */
  paths: { year: number; value: number }[][];
  percentiles: AccumulationPercentilePoint[];
  /** Per path, the first year its portfolio met the moving FIRE target (null = never). */
  fireYears: (number | null)[];
}

/**
 * Accumulation-phase Monte Carlo for the FIRE Ventaglio view.
 *
 * Per year, per path: capital inflows land first (at today's value), the portfolio takes one
 * random weighted market return, savings are added while the path has not yet reached FIRE,
 * expenses inflate, and the path is checked against the moving FIRE target
 * (inflatedExpenses ÷ withdrawalRate) — the same formula as the deterministic projection.
 * At zero volatility every step degenerates to calculateFIREProjection's base-scenario float
 * chain, which is the coherence property the tests pin.
 *
 * No withdrawals and no failures: decumulation stays with runMonteCarloSimulation (MC tab).
 * The new number this engine adds is `fireProbability`: the cumulative share of paths that
 * have reached FIRE by each year, which the deterministic projection cannot express.
 */
export function runAccumulationSimulation(
  params: AccumulationSimulationParams
): AccumulationSimulationResult {
  const wrDecimal = params.withdrawalRate / 100;
  const inflows = params.capitalInflows ?? [];
  const startingInflow = inflows
    .filter((inflow) => inflow.year <= 0)
    .reduce((sum, inflow) => sum + inflow.amount, 0);

  // The moving target is deterministic (inflation only) — computed once, shared by all paths.
  const fireTargets: number[] = [];
  let targetExpenses = params.annualExpenses;
  fireTargets.push(wrDecimal > 0 ? targetExpenses / wrDecimal : 0);
  for (let year = 1; year <= params.years; year++) {
    targetExpenses *= 1 + params.expenseInflationRate / 100;
    fireTargets.push(wrDecimal > 0 ? targetExpenses / wrDecimal : 0);
  }

  const paths: { year: number; value: number }[][] = [];
  const fireYears: (number | null)[] = [];

  for (let sim = 0; sim < params.numberOfSimulations; sim++) {
    let portfolio = params.initialPortfolio + startingInflow;
    const path: { year: number; value: number }[] = [{ year: 0, value: portfolio }];
    let fireYear: number | null = null;

    for (let year = 1; year <= params.years; year++) {
      for (const inflow of inflows) {
        if (inflow.year === year) portfolio += inflow.amount;
      }

      const equityReturn = randomNormal(params.equityReturn, params.equityVolatility);
      const bondsReturn = randomNormal(params.bondsReturn, params.bondsVolatility);
      const realEstateReturn = randomNormal(params.realEstateReturn, params.realEstateVolatility);
      const commoditiesReturn = randomNormal(
        params.commoditiesReturn,
        params.commoditiesVolatility
      );
      const portfolioReturn =
        (equityReturn * params.equityPercentage) / 100 +
        (bondsReturn * params.bondsPercentage) / 100 +
        (realEstateReturn * params.realEstatePercentage) / 100 +
        (commoditiesReturn * params.commoditiesPercentage) / 100;

      portfolio *= 1 + portfolioReturn / 100;

      // Savings stop once the path retires — same rule as the deterministic projection.
      if (fireYear === null) portfolio += params.annualSavings;

      if (fireYear === null && wrDecimal > 0 && portfolio >= fireTargets[year]) {
        fireYear = year;
      }

      path.push({ year, value: portfolio });
    }

    paths.push(path);
    fireYears.push(fireYear);
  }

  // Percentiles per year. Every path has full length, so the values array is always complete
  // and the sort makes p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 hold by construction.
  const percentiles: AccumulationPercentilePoint[] = [];
  for (let year = 0; year <= params.years; year++) {
    const valuesAtYear = paths.map((path) => path[year].value).sort((a, b) => a - b);
    const at = (fraction: number) => valuesAtYear[Math.floor(valuesAtYear.length * fraction)];
    const reachedCount = fireYears.filter(
      (fireYear) => fireYear !== null && fireYear <= year
    ).length;

    percentiles.push({
      year,
      p10: at(0.1),
      p25: at(0.25),
      p50: at(0.5),
      p75: at(0.75),
      p90: at(0.9),
      fireTarget: fireTargets[year],
      fireProbability: (reachedCount / paths.length) * 100,
    });
  }

  return { paths, percentiles, fireYears };
}

/**
 * Get default market parameters for Monte Carlo simulations
 *
 * These defaults represent long-term historical averages for global markets:
 * - Equity: 7% return, 18% volatility (global stock index)
 * - Bonds: 3% return, 6% volatility (investment grade)
 * - Real Estate: 5% return, 12% volatility (REITs/residential)
 * - Commodities: 3.5% return, 20% volatility (broad commodity index)
 * - Inflation: 2.5%
 *
 * @returns Default market parameter object
 */
export function getDefaultMarketParameters() {
  return {
    equityReturn: 7.0,
    equityVolatility: 18.0,
    bondsReturn: 3.0,
    bondsVolatility: 6.0,
    realEstateReturn: 5.0,
    realEstateVolatility: 12.0,
    commoditiesReturn: 3.5,
    commoditiesVolatility: 20.0,
    inflationRate: 2.5,
  };
}

/**
 * Get default Bear/Base/Bull scenario parameters for Monte Carlo
 *
 * Bear: low growth, high volatility, high inflation (stagflation-like)
 * Base: historical averages
 * Bull: strong growth, low volatility, low inflation
 */
export function getDefaultMonteCarloScenarios(): MonteCarloScenarios {
  return {
    bear: {
      equityReturn: 4.0, equityVolatility: 20.0,
      bondsReturn: 2.0, bondsVolatility: 7.0,
      realEstateReturn: 2.0, realEstateVolatility: 14.0,
      commoditiesReturn: 1.0, commoditiesVolatility: 22.0,
      inflationRate: 3.5,
    },
    base: {
      equityReturn: 7.0, equityVolatility: 18.0,
      bondsReturn: 3.0, bondsVolatility: 6.0,
      realEstateReturn: 5.0, realEstateVolatility: 12.0,
      commoditiesReturn: 3.5, commoditiesVolatility: 20.0,
      inflationRate: 2.5,
    },
    bull: {
      equityReturn: 10.0, equityVolatility: 16.0,
      bondsReturn: 4.0, bondsVolatility: 5.0,
      realEstateReturn: 8.0, realEstateVolatility: 10.0,
      commoditiesReturn: 6.0, commoditiesVolatility: 18.0,
      inflationRate: 1.5,
    },
  };
}

/**
 * Build full MonteCarloParams from shared settings and a single scenario's market parameters.
 * Keeps portfolio allocation, withdrawal, and simulation count from base; overrides market params from scenario.
 */
export function buildParamsFromScenario(
  baseParams: MonteCarloParams,
  scenario: MonteCarloScenarioParams
): MonteCarloParams {
  return {
    ...baseParams,
    equityReturn: scenario.equityReturn,
    equityVolatility: scenario.equityVolatility,
    bondsReturn: scenario.bondsReturn,
    bondsVolatility: scenario.bondsVolatility,
    realEstateReturn: scenario.realEstateReturn,
    realEstateVolatility: scenario.realEstateVolatility,
    commoditiesReturn: scenario.commoditiesReturn,
    commoditiesVolatility: scenario.commoditiesVolatility,
    inflationRate: scenario.inflationRate,
  };
}
