import {
  MonteCarloParams,
  MonteCarloResults,
  SingleSimulationResult,
  PercentilesData,
  HistoricalReturnsData,
  MonthlySnapshot,
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
 * Calculate standard deviation of an array of numbers
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squareDiffs = values.map((value) => Math.pow(value - avg, 2));
  const avgSquareDiff = mean(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}

/**
 * Calculate monthly returns from snapshots for a specific asset class
 */
function calculateAssetClassReturns(
  snapshots: MonthlySnapshot[],
  assetClass: string
): number[] {
  const returns: number[] = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prevValue = snapshots[i - 1].byAssetClass[assetClass] || 0;
    const currentValue = snapshots[i].byAssetClass[assetClass] || 0;

    // Skip if either value is 0 (asset class didn't exist yet)
    if (prevValue === 0 || currentValue === 0) continue;

    // Calculate monthly return as percentage
    const monthlyReturn = ((currentValue - prevValue) / prevValue) * 100;

    // Filter out extreme values >±50% which are likely due to large contributions/withdrawals
    // rather than actual investment performance. These outliers would distort the historical
    // return distribution used for Monte Carlo simulations.
    if (Math.abs(monthlyReturn) < 50) {
      returns.push(monthlyReturn);
    }
  }

  return returns;
}

/**
 * Annualize monthly returns using compound formula
 *
 * Converts average monthly return to annualized equivalent using geometric compounding.
 * Formula: (1 + r_monthly)^12 - 1
 * This accounts for compounding effects over 12 months.
 *
 * @param monthlyReturns - Array of monthly return percentages
 * @returns Annualized return percentage
 */
function annualizeReturns(monthlyReturns: number[]): number {
  if (monthlyReturns.length === 0) return 0;
  const avgMonthlyReturn = mean(monthlyReturns);
  // Compound monthly returns to annual: (1 + r)^12 - 1
  return ((Math.pow(1 + avgMonthlyReturn / 100, 12) - 1) * 100);
}

/**
 * Annualize monthly volatility using square-root-of-time scaling
 *
 * Converts monthly standard deviation to annualized equivalent.
 * Formula: σ_annual = σ_monthly × √12
 * This assumes returns are independent and identically distributed (i.i.d.).
 *
 * @param monthlyReturns - Array of monthly return percentages
 * @returns Annualized volatility percentage
 */
function annualizeVolatility(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;
  const monthlyStdDev = standardDeviation(monthlyReturns);
  // Annualize volatility: σ_annual = σ_monthly * √12
  return monthlyStdDev * Math.sqrt(12);
}

/**
 * Calculate historical returns from user's monthly snapshots
 *
 * Analyzes the user's historical portfolio performance by asset class (equity, bonds)
 * to derive mean returns and volatility. These parameters feed into Monte Carlo simulations.
 *
 * @param snapshots - User's monthly snapshots (including dummy data)
 * @returns Historical returns data with equity/bonds statistics, or null if insufficient data
 */
export function calculateHistoricalReturns(
  snapshots: MonthlySnapshot[]
): HistoricalReturnsData | null {
  // Filter out dummy/test snapshots
  const realSnapshots = snapshots.filter((s) => !s.isDummy);

  // Require at least 24 months (2 years) of data for meaningful statistical analysis
  if (realSnapshots.length < 24) {
    return null;
  }

  // Sort snapshots by date (oldest first)
  const sortedSnapshots = [...realSnapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // Calculate returns for equity and bonds
  const equityReturns = calculateAssetClassReturns(sortedSnapshots, 'equity');
  const bondsReturns = calculateAssetClassReturns(sortedSnapshots, 'bonds');

  // If we don't have enough data points, return null
  if (equityReturns.length < 12 && bondsReturns.length < 12) {
    return null;
  }

  // Use market defaults if specific asset class has insufficient data (<12 months)
  // This ensures Monte Carlo can run with reasonable assumptions even for new portfolios
  // or portfolios heavily concentrated in one asset class
  const equityMean = equityReturns.length >= 12 ? annualizeReturns(equityReturns) : 7.0;
  const equityVol = equityReturns.length >= 12 ? annualizeVolatility(equityReturns) : 18.0;
  const bondsMean = bondsReturns.length >= 12 ? annualizeReturns(bondsReturns) : 3.0;
  const bondsVol = bondsReturns.length >= 12 ? annualizeVolatility(bondsReturns) : 6.0;

  const startDate = `${sortedSnapshots[0].year}-${String(sortedSnapshots[0].month).padStart(2, '0')}`;
  const lastSnapshot = sortedSnapshots[sortedSnapshots.length - 1];
  const endDate = `${lastSnapshot.year}-${String(lastSnapshot.month).padStart(2, '0')}`;

  return {
    equity: {
      mean: equityMean,
      volatility: equityVol,
      monthlyReturns: equityReturns,
    },
    bonds: {
      mean: bondsMean,
      volatility: bondsVol,
      monthlyReturns: bondsReturns,
    },
    availableMonths: sortedSnapshots.length,
    startDate,
    endDate,
  };
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
    // Generate random returns for equity and bonds
    const equityReturn = randomNormal(params.equityReturn, params.equityVolatility);
    const bondsReturn = randomNormal(params.bondsReturn, params.bondsVolatility);

    // Calculate weighted portfolio return
    const portfolioReturn =
      (equityReturn * params.equityPercentage) / 100 +
      (bondsReturn * params.bondsPercentage) / 100;

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
 * - Equity: 7% return, 18% volatility
 * - Bonds: 3% return, 6% volatility
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
    inflationRate: 2.5,
  };
}
