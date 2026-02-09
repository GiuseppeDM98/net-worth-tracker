/**
 * Chart Service
 *
 * Transforms portfolio and snapshot data into chart-ready formats for visualization.
 *
 * Features:
 * - Asset distribution charts (by asset class and by individual asset)
 * - Net worth history charts with proper date formatting
 * - Currency formatting utilities for compact display (K, M, B suffixes)
 * - Color mapping for consistent visualization across charts
 *
 * Used by: Dashboard overview, assets page, performance charts
 */

import {
  Asset,
  PieChartData,
  MonthlySnapshot,
  DoublingMilestone,
  DoublingTimeSummary,
  DoublingMode
} from '@/types/assets';
import { Expense } from '@/types/expenses';
import { calculateAssetValue, calculateTotalValue } from './assetService';
import { calculateCurrentAllocation } from './assetAllocationService';
import { getAssetClassColor, getChartColor } from '@/lib/constants/colors';
import { getItalyYear } from '@/lib/utils/dateHelpers';

/**
 * Prepare data for asset class distribution pie chart
 *
 * Uses calculateCurrentAllocation to properly handle composite assets
 * (e.g., pension funds distributed across multiple asset classes).
 *
 * @param assets - All user assets
 * @returns Array of pie chart data points with percentages and colors
 */
export function prepareAssetClassDistributionData(
  assets: Asset[]
): PieChartData[] {
  const allocation = calculateCurrentAllocation(assets);
  const totalValue = allocation.totalValue;

  if (totalValue === 0) {
    return [];
  }

  // Convert to chart data format
  const chartData: PieChartData[] = [];

  Object.entries(allocation.byAssetClass).forEach(([assetClass, value]) => {
    const percentage = (value / totalValue) * 100;
    chartData.push({
      name: getAssetClassName(assetClass),
      value,
      percentage,
      color: getAssetClassColor(assetClass),
    });
  });

  // Sort by value descending
  return chartData.sort((a, b) => b.value - a.value);
}

/**
 * Prepare data for individual asset distribution pie chart
 */
export function prepareAssetDistributionData(assets: Asset[]): PieChartData[] {
  const totalValue = calculateTotalValue(assets);

  if (totalValue === 0) {
    return [];
  }

  // Calculate value for each asset
  const assetValues = assets.map((asset) => ({
    name: asset.name,
    ticker: asset.ticker,
    value: calculateAssetValue(asset),
  }));

  // Sort by value descending
  assetValues.sort((a, b) => b.value - a.value);

  // Take top 10 and aggregate the rest as "Others"
  const top10 = assetValues.slice(0, 10);
  const others = assetValues.slice(10);

  const chartData: PieChartData[] = top10.map((asset, index) => ({
    name: asset.ticker,
    value: asset.value,
    percentage: (asset.value / totalValue) * 100,
    color: getChartColor(index),
  }));

  // Add "Others" if there are more than 10 assets
  if (others.length > 0) {
    const othersValue = others.reduce((sum, asset) => sum + asset.value, 0);
    chartData.push({
      name: 'Altri',
      value: othersValue,
      percentage: (othersValue / totalValue) * 100,
      color: '#9CA3AF', // gray
    });
  }

  return chartData;
}

/**
 * Prepare data for net worth history line chart
 */
export function prepareNetWorthHistoryData(snapshots: MonthlySnapshot[]): {
  date: string;
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  month: number;
  year: number;
  note?: string;
}[] {
  return snapshots.map((snapshot) => ({
    date: `${String(snapshot.month).padStart(2, '0')}/${String(snapshot.year).slice(-2)}`,
    totalNetWorth: snapshot.totalNetWorth,
    liquidNetWorth: snapshot.liquidNetWorth,
    illiquidNetWorth: snapshot.illiquidNetWorth || 0, // Default to 0 for backward compatibility with older snapshots
    month: snapshot.month,
    year: snapshot.year,
    note: snapshot.note,
  }));
}

/**
 * Prepare data for asset class history chart
 */
export function prepareAssetClassHistoryData(snapshots: MonthlySnapshot[]): {
  date: string;
  equity: number;
  bonds: number;
  crypto: number;
  realestate: number;
  cash: number;
  commodity: number;
  equityPercentage: number;
  bondsPercentage: number;
  cryptoPercentage: number;
  realestatePercentage: number;
  cashPercentage: number;
  commodityPercentage: number;
  month: number;
  year: number;
}[] {
  return snapshots.map((snapshot) => {
    const total = snapshot.totalNetWorth;
    const byAssetClass = snapshot.byAssetClass || {};

    const equity = byAssetClass.equity || 0;
    const bonds = byAssetClass.bonds || 0;
    const crypto = byAssetClass.crypto || 0;
    const realestate = byAssetClass.realestate || 0;
    const cash = byAssetClass.cash || 0;
    const commodity = byAssetClass.commodity || 0;

    return {
      date: `${String(snapshot.month).padStart(2, '0')}/${String(snapshot.year).slice(-2)}`,
      equity,
      bonds,
      crypto,
      realestate,
      cash,
      commodity,
      equityPercentage: total > 0 ? (equity / total) * 100 : 0,
      bondsPercentage: total > 0 ? (bonds / total) * 100 : 0,
      cryptoPercentage: total > 0 ? (crypto / total) * 100 : 0,
      realestatePercentage: total > 0 ? (realestate / total) * 100 : 0,
      cashPercentage: total > 0 ? (cash / total) * 100 : 0,
      commodityPercentage: total > 0 ? (commodity / total) * 100 : 0,
      month: snapshot.month,
      year: snapshot.year,
    };
  });
}

/**
 * Get Italian name for asset class
 */
function getAssetClassName(assetClass: string): string {
  const names: Record<string, string> = {
    equity: 'Azioni',
    bonds: 'Obbligazioni',
    crypto: 'Criptovalute',
    realestate: 'Immobili',
    cash: 'Liquidità',
    commodity: 'Materie Prime',
  };

  return names[assetClass] || assetClass;
}

/**
 * Format currency value in Italian format
 * @param value - The amount to format
 * @param currency - The currency code (default: EUR)
 * @param decimals - Optional number of decimal places (default: currency default, typically 2)
 * @returns Formatted currency string
 */
export function formatCurrency(
  value: number,
  currency: string = 'EUR',
  decimals?: number
): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
    ...(decimals !== undefined && {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
  }).format(value);
}

/**
 * Format currency value for Sankey diagrams with fixed decimal places.
 * Prevents floating-point artifacts by explicitly limiting to 2 decimal places.
 *
 * @param value - The numeric value to format
 * @returns Formatted currency string (e.g., "€1.234,56")
 */
export function formatCurrencyForSankey(value: number): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Format percentage in Italian format
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * Format number in Italian format
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format currency value in compact format for chart axes
 * Examples: €1,5 Mln, €850k, €250
 */
export function formatCurrencyCompact(value: number): string {
  const absValue = Math.abs(value);

  if (absValue >= 1_000_000) {
    // Millions: €1,5 Mln
    const millions = value / 1_000_000;
    return `€${millions.toLocaleString('it-IT', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    })} Mln`;
  } else if (absValue >= 1_000) {
    // Thousands: €850k
    const thousands = value / 1_000;
    return `€${Math.round(thousands)}k`;
  } else {
    // Below 1000: €250
    return `€${Math.round(value)}`;
  }
}

/**
 * Prepare data for YoY (Year over Year) variation chart
 * Compares first snapshot of each year with last snapshot of the same year
 */
export function prepareYoYVariationData(snapshots: MonthlySnapshot[]): {
  year: string;
  variation: number;
  variationPercentage: number;
  startValue: number;
  endValue: number;
}[] {
  if (snapshots.length === 0) {
    return [];
  }

  // Group snapshots by year
  const snapshotsByYear = new Map<number, MonthlySnapshot[]>();

  snapshots.forEach((snapshot) => {
    if (!snapshotsByYear.has(snapshot.year)) {
      snapshotsByYear.set(snapshot.year, []);
    }
    snapshotsByYear.get(snapshot.year)!.push(snapshot);
  });

  // Calculate YoY variation for each year
  const yoyData: {
    year: string;
    variation: number;
    variationPercentage: number;
    startValue: number;
    endValue: number;
  }[] = [];

  Array.from(snapshotsByYear.entries())
    .sort((a, b) => a[0] - b[0]) // Sort by year
    .forEach(([year, yearSnapshots]) => {
      // Sort snapshots by month to get first and last
      yearSnapshots.sort((a, b) => a.month - b.month);

      const firstSnapshot = yearSnapshots[0];
      const lastSnapshot = yearSnapshots[yearSnapshots.length - 1];

      const startValue = firstSnapshot.totalNetWorth;
      const endValue = lastSnapshot.totalNetWorth;
      const variation = endValue - startValue;
      const variationPercentage = startValue > 0 ? (variation / startValue) * 100 : 0;

      yoyData.push({
        year: year.toString(),
        variation,
        variationPercentage,
        startValue,
        endValue,
      });
    });

  return yoyData;
}

/**
 * Prepare yearly data showing breakdown of net worth growth into savings vs investment returns.
 *
 * For each year:
 * - Net Savings = Income - Expenses (cashflows from user)
 * - Net Worth Growth = End NW - Start NW (total portfolio change)
 * - Investment Growth = Net Worth Growth - Net Savings (market performance)
 *
 * This separates wealth growth from disciplined saving (user control)
 * vs market performance (external factors).
 *
 * @param snapshots - Monthly snapshots with net worth data
 * @param expenses - All expense records (income and expenses)
 * @returns Array of yearly data sorted by year
 */
export function prepareSavingsVsInvestmentData(
  snapshots: MonthlySnapshot[],
  expenses: Expense[]
): {
  year: string;
  netSavings: number;
  investmentGrowth: number;
  netWorthGrowth: number;
}[] {
  // Return empty array if missing data
  if (snapshots.length === 0 || expenses.length === 0) {
    return [];
  }

  // Group snapshots by year
  const snapshotsByYear = new Map<number, MonthlySnapshot[]>();
  snapshots.forEach((snapshot) => {
    if (!snapshotsByYear.has(snapshot.year)) {
      snapshotsByYear.set(snapshot.year, []);
    }
    snapshotsByYear.get(snapshot.year)!.push(snapshot);
  });

  // Group expenses by year using Italy timezone for consistency
  const expensesByYear = new Map<number, { income: number; expenses: number }>();
  expenses.forEach((expense) => {
    const year = getItalyYear(expense.date);
    const current = expensesByYear.get(year) || { income: 0, expenses: 0 };

    // Income is positive, expenses are stored as negative values
    if (expense.type === 'income') {
      current.income += expense.amount;
    } else {
      current.expenses += expense.amount; // Already negative
    }

    expensesByYear.set(year, current);
  });

  // Calculate yearly breakdown data
  const yearlyData: {
    year: string;
    netSavings: number;
    investmentGrowth: number;
    netWorthGrowth: number;
  }[] = [];

  Array.from(snapshotsByYear.entries())
    .sort((a, b) => a[0] - b[0]) // Sort by year ascending
    .forEach(([year, yearSnapshots]) => {
      // Skip years with less than 2 snapshots (can't calculate YoY growth)
      if (yearSnapshots.length < 2) return;

      // Skip years with no expense data (can't calculate net savings)
      if (!expensesByYear.has(year)) return;

      // Sort snapshots by month to get first and last
      yearSnapshots.sort((a, b) => a.month - b.month);

      const firstSnapshot = yearSnapshots[0];
      const lastSnapshot = yearSnapshots[yearSnapshots.length - 1];
      const expenseData = expensesByYear.get(year)!;

      // Calculate Net Worth Growth (end - start)
      const netWorthGrowth = lastSnapshot.totalNetWorth - firstSnapshot.totalNetWorth;

      // Calculate Net Savings (income + expenses, expenses already negative)
      const netSavings = expenseData.income + expenseData.expenses;

      // Calculate Investment Growth (total growth - savings)
      // This isolates market performance from cashflow contributions
      const investmentGrowth = netWorthGrowth - netSavings;

      yearlyData.push({
        year: year.toString(),
        netSavings,
        investmentGrowth,
        netWorthGrowth,
      });
    });

  return yearlyData;
}

/**
 * Doubling Time Calculation Functions
 *
 * These functions calculate how long it takes for net worth to double over time.
 * Supports two modes:
 * - 'geometric': Tracks exponential doubling (2x, 4x, 8x, 16x...)
 * - 'threshold': Tracks fixed milestones (€100k, €200k, €500k, €1M...)
 *
 * WHY TWO MODES:
 * - Geometric: Mathematically consistent, reflects compound growth nature
 * - Threshold: Psychologically meaningful round numbers, easier goal-setting
 *
 * Used by: History page to visualize wealth accumulation velocity
 */

// Fixed thresholds for threshold mode (€100k, €200k, €500k, €1M, €2M)
const FIXED_THRESHOLDS = [100000, 200000, 500000, 1000000, 2000000];

/**
 * Calculate the difference in months between two dates (inclusive).
 *
 * Includes both the start and end month in the count.
 * Example: Jan 2020 to Dec 2020 = 12 months (not 11)
 *
 * @param startYear - Starting year
 * @param startMonth - Starting month (1-12)
 * @param endYear - Ending year
 * @param endMonth - Ending month (1-12)
 * @returns Number of months between the two dates (inclusive)
 */
function calculateMonthDifference(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): number {
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

/**
 * Format a period label in MM/YY - MM/YY format.
 *
 * Converts year/month pairs into a readable period string.
 * Example: (2020, 1, 2022, 6) → "01/20 - 06/22"
 *
 * @param startYear - Starting year
 * @param startMonth - Starting month (1-12)
 * @param endYear - Ending year
 * @param endMonth - Ending month (1-12)
 * @returns Formatted period string
 */
function formatPeriodLabel(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): string {
  const startLabel = `${String(startMonth).padStart(2, '0')}/${String(startYear).slice(-2)}`;
  const endLabel = `${String(endMonth).padStart(2, '0')}/${String(endYear).slice(-2)}`;
  return `${startLabel} - ${endLabel}`;
}

/**
 * Calculate geometric doubling milestones (2x, 4x, 8x, 16x...).
 *
 * ALGORITHM:
 * 1. Find first positive net worth snapshot (baseline)
 * 2. Identify each doubling point (2x, 4x, 8x, etc. of baseline)
 * 3. Calculate duration between consecutive doublings
 * 4. Track current doubling in progress if not yet complete
 *
 * EDGE CASES:
 * - Negative periods: Skipped entirely when searching for milestones
 * - Insufficient data: Returns empty array if < 2 snapshots
 * - In-progress: Tracked separately with progress percentage
 *
 * @param snapshots - Monthly snapshots sorted by date (oldest first)
 * @returns Array of geometric doubling milestones
 */
function calculateGeometricDoublings(snapshots: MonthlySnapshot[]): DoublingMilestone[] {
  if (snapshots.length < 2) {
    return [];
  }

  // Find first positive snapshot to establish baseline.
  // Negative net worth periods are excluded from doubling calculations
  // because they represent debt scenarios where "doubling" is not meaningful.
  const firstPositive = snapshots.find((s) => s.totalNetWorth > 0);
  if (!firstPositive) {
    return [];
  }

  const milestones: DoublingMilestone[] = [];
  const baselineValue = firstPositive.totalNetWorth;
  let currentMilestoneNumber = 1;
  let previousMilestoneSnapshot = firstPositive;
  let targetValue = baselineValue * 2; // First doubling target (2x)

  // Start from snapshot after baseline
  const startIndex = snapshots.indexOf(firstPositive) + 1;

  for (let i = startIndex; i < snapshots.length; i++) {
    const snapshot = snapshots[i];

    // Skip negative periods
    if (snapshot.totalNetWorth <= 0) continue;

    // Check if we reached the doubling target
    if (snapshot.totalNetWorth >= targetValue) {
      const durationMonths = calculateMonthDifference(
        previousMilestoneSnapshot.year,
        previousMilestoneSnapshot.month,
        snapshot.year,
        snapshot.month
      );

      milestones.push({
        milestoneNumber: currentMilestoneNumber,
        startValue: previousMilestoneSnapshot.totalNetWorth,
        endValue: snapshot.totalNetWorth,
        startDate: {
          year: previousMilestoneSnapshot.year,
          month: previousMilestoneSnapshot.month,
        },
        endDate: {
          year: snapshot.year,
          month: snapshot.month,
        },
        durationMonths,
        periodLabel: formatPeriodLabel(
          previousMilestoneSnapshot.year,
          previousMilestoneSnapshot.month,
          snapshot.year,
          snapshot.month
        ),
        isComplete: true,
        milestoneType: 'geometric',
      });

      // Update for next doubling
      currentMilestoneNumber++;
      previousMilestoneSnapshot = snapshot;
      targetValue = snapshot.totalNetWorth * 2; // Next doubling target
    }
  }

  // Handle current doubling in progress
  const latestSnapshot = snapshots[snapshots.length - 1];
  if (
    latestSnapshot.totalNetWorth < targetValue &&
    latestSnapshot.totalNetWorth > 0 &&
    latestSnapshot !== previousMilestoneSnapshot
  ) {
    // Calculate progress toward next milestone for engagement.
    // Shows user how close they are to next target (e.g., "45% complete").
    // Uses linear interpolation: (current - start) / (target - start) * 100
    const progressPercentage =
      ((latestSnapshot.totalNetWorth - previousMilestoneSnapshot.totalNetWorth) /
        (targetValue - previousMilestoneSnapshot.totalNetWorth)) *
      100;

    const durationSoFar = calculateMonthDifference(
      previousMilestoneSnapshot.year,
      previousMilestoneSnapshot.month,
      latestSnapshot.year,
      latestSnapshot.month
    );

    milestones.push({
      milestoneNumber: currentMilestoneNumber,
      startValue: previousMilestoneSnapshot.totalNetWorth,
      endValue: targetValue,
      startDate: {
        year: previousMilestoneSnapshot.year,
        month: previousMilestoneSnapshot.month,
      },
      endDate: {
        year: latestSnapshot.year,
        month: latestSnapshot.month,
      },
      durationMonths: durationSoFar,
      periodLabel:
        formatPeriodLabel(
          previousMilestoneSnapshot.year,
          previousMilestoneSnapshot.month,
          latestSnapshot.year,
          latestSnapshot.month
        ) + ' - In corso',
      isComplete: false,
      progressPercentage: Math.min(progressPercentage, 99), // Cap at 99% to avoid showing 100% when incomplete
      milestoneType: 'geometric',
    });
  }

  return milestones;
}

/**
 * Calculate threshold milestones (€100k, €200k, €500k, €1M, €2M).
 *
 * ALGORITHM:
 * 1. For each fixed threshold (€100k, €200k, etc.):
 * 2. Find first snapshot crossing threshold
 * 3. Calculate duration from previous threshold (or start)
 * 4. Track progress toward next threshold
 *
 * @param snapshots - Monthly snapshots sorted by date (oldest first)
 * @returns Array of threshold milestones
 */
function calculateThresholdMilestones(snapshots: MonthlySnapshot[]): DoublingMilestone[] {
  if (snapshots.length < 2) {
    return [];
  }

  // Find first positive snapshot
  const firstPositive = snapshots.find((s) => s.totalNetWorth > 0);
  if (!firstPositive) {
    return [];
  }

  const milestones: DoublingMilestone[] = [];
  let previousSnapshot = firstPositive;
  let milestoneNumber = 1;

  for (const threshold of FIXED_THRESHOLDS) {
    // Skip thresholds already exceeded by the first snapshot.
    // These would result in 0-month duration which falsely inflates "fastest doubling"
    // metric when user started tracking with portfolio already above threshold.
    if (threshold <= firstPositive.totalNetWorth) {
      continue;
    }

    // Find first snapshot crossing this threshold
    const crossingSnapshot = snapshots.find(
      (s) => s.totalNetWorth >= threshold && s.totalNetWorth > 0
    );

    if (!crossingSnapshot) {
      // Haven't reached this threshold yet - check if we're making progress toward it
      const latestSnapshot = snapshots[snapshots.length - 1];
      if (
        latestSnapshot.totalNetWorth > previousSnapshot.totalNetWorth &&
        latestSnapshot.totalNetWorth < threshold
      ) {
        const progressPercentage =
          ((latestSnapshot.totalNetWorth - previousSnapshot.totalNetWorth) /
            (threshold - previousSnapshot.totalNetWorth)) *
          100;

        const durationSoFar = calculateMonthDifference(
          previousSnapshot.year,
          previousSnapshot.month,
          latestSnapshot.year,
          latestSnapshot.month
        );

        milestones.push({
          milestoneNumber,
          startValue: previousSnapshot.totalNetWorth,
          endValue: threshold,
          startDate: {
            year: previousSnapshot.year,
            month: previousSnapshot.month,
          },
          endDate: {
            year: latestSnapshot.year,
            month: latestSnapshot.month,
          },
          durationMonths: durationSoFar,
          periodLabel:
            formatPeriodLabel(
              previousSnapshot.year,
              previousSnapshot.month,
              latestSnapshot.year,
              latestSnapshot.month
            ) + ' - In corso',
          isComplete: false,
          progressPercentage: Math.min(progressPercentage, 99),
          milestoneType: 'threshold',
          thresholdValue: threshold,
        });
      }
      break; // Stop checking higher thresholds
    }

    // Calculate duration
    const durationMonths = calculateMonthDifference(
      previousSnapshot.year,
      previousSnapshot.month,
      crossingSnapshot.year,
      crossingSnapshot.month
    );

    milestones.push({
      milestoneNumber,
      startValue: previousSnapshot.totalNetWorth,
      endValue: crossingSnapshot.totalNetWorth,
      startDate: {
        year: previousSnapshot.year,
        month: previousSnapshot.month,
      },
      endDate: {
        year: crossingSnapshot.year,
        month: crossingSnapshot.month,
      },
      durationMonths,
      periodLabel: formatPeriodLabel(
        previousSnapshot.year,
        previousSnapshot.month,
        crossingSnapshot.year,
        crossingSnapshot.month
      ),
      isComplete: true,
      milestoneType: 'threshold',
      thresholdValue: threshold,
    });

    // Update for next threshold
    previousSnapshot = crossingSnapshot;
    milestoneNumber++;
  }

  return milestones;
}

/**
 * Prepare doubling time data for visualization on History page.
 *
 * Calculates milestones based on selected mode and computes summary statistics.
 * Returns both individual milestone data and aggregate metrics for display.
 *
 * @param snapshots - Monthly snapshots sorted by date (oldest first)
 * @param mode - Calculation mode: 'geometric' (2x, 4x...) or 'threshold' (€100k, €200k...)
 * @returns Summary object with milestones and statistics
 */
export function prepareDoublingTimeData(
  snapshots: MonthlySnapshot[],
  mode: DoublingMode = 'geometric'
): DoublingTimeSummary {
  // Calculate milestones based on mode
  const milestones =
    mode === 'geometric'
      ? calculateGeometricDoublings(snapshots)
      : calculateThresholdMilestones(snapshots);

  // Separate complete and in-progress milestones
  const completedMilestones = milestones.filter((m) => m.isComplete);
  const currentInProgress = milestones.find((m) => !m.isComplete) || null;

  // Calculate summary statistics
  const fastestDoubling =
    completedMilestones.length > 0
      ? completedMilestones.reduce((fastest, current) =>
          current.durationMonths < fastest.durationMonths ? current : fastest
        )
      : null;

  const averageMonths =
    completedMilestones.length > 0
      ? completedMilestones.reduce((sum, m) => sum + m.durationMonths, 0) /
        completedMilestones.length
      : null;

  return {
    milestones: completedMilestones,
    fastestDoubling,
    averageMonths,
    totalDoublings: completedMilestones.length,
    currentDoublingInProgress: currentInProgress,
  };
}
