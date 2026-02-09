import {
  MonteCarloParams,
  MonteCarloResults,
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
export function randomNormal(mean: number, stdDev: number): number {
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
  const path: { year: number; value: number }[] = [{ year: 0, value: portfolio }];

  for (let year = 1; year <= params.retirementYears; year++) {
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
 * Create distribution bins for final portfolio values
 */
function createDistribution(
  simulations: SingleSimulationResult[],
  bins: number = 10
): { range: string; count: number; percentage: number }[] {
  const finalValues = simulations.map((sim) => sim.finalValue);
  const maxValue = Math.max(...finalValues);
  const minValue = Math.min(...finalValues);
  const binSize = (maxValue - minValue) / bins;

  const distribution: { range: string; count: number; percentage: number }[] = [];

  for (let i = 0; i < bins; i++) {
    const rangeStart = minValue + i * binSize;
    const rangeEnd = minValue + (i + 1) * binSize;
    const count = finalValues.filter(
      (val) => val >= rangeStart && (i === bins - 1 ? val <= rangeEnd : val < rangeEnd)
    ).length;

    const rangeLabel =
      rangeStart === 0 && rangeEnd === 0
        ? '€0'
        : `${formatCurrencyCompact(rangeStart)}-${formatCurrencyCompact(rangeEnd)}`;

    distribution.push({
      range: rangeLabel,
      count,
      percentage: (count / simulations.length) * 100,
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
