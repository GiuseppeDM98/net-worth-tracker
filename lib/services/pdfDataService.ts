/**
 * PDF Data Service
 *
 * Aggregates and transforms portfolio data for PDF report generation.
 *
 * Features:
 * - Modular data fetching: Only fetch data for selected PDF sections
 * - Performance optimization: Caches expenses to avoid duplicate fetches
 * - Time filtering: Support for YTD, 1Y, 3Y, 5Y, All time views
 * - Section types: Portfolio, allocation, rebalancing, history, cashflow, FIRE metrics
 *
 * Architecture:
 * - Main orchestrator: fetchPDFData() routes to section-specific functions
 * - Each section function returns typed data matching PDF templates
 * - Expense caching per user: Reset when userId changes
 *
 * Used by: PDF export feature (/api/pdf/generate)
 */

import type {
  PDFDataContext,
  PDFSectionData,
  SectionSelection,
  PortfolioData,
  AssetRow,
  AllocationData,
  AssetClassAllocation,
  RebalancingAction,
  HistoryData,
  NetWorthDataPoint,
  YoYDataPoint,
  CashflowData,
  CategoryBreakdown,
  FireData,
  SummaryData,
  TimeFilter,
} from '@/types/pdf';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateUnrealizedGains,
  calculateLiquidNetWorth,
  calculateIlliquidNetWorth,
  calculatePortfolioWeightedTER,
  calculateAnnualPortfolioCost,
} from './assetService';
import {
  compareAllocations,
  getSettings,
} from './assetAllocationService';
import { getAllExpenses } from './expenseService';
import { getAnnualExpenses, getAnnualIncome, calculateFIREMetrics } from './fireService';
import { formatCurrency, formatPercentage } from './chartService';
import { filterExpensesByTime } from '@/lib/utils/pdfTimeFilters';

// Cached expenses to avoid duplicate fetching
let cachedExpenses: any[] | null = null;
let cachedUserId: string | null = null;

/**
 * Main orchestrator: fetch and prepare data for selected PDF sections
 */
export async function fetchPDFData(
  userId: string,
  context: PDFDataContext,
  sections: SectionSelection,
  timeFilter?: TimeFilter
): Promise<PDFSectionData> {
  const data: PDFSectionData = {};

  // Reset cache if different user
  if (cachedUserId !== userId) {
    cachedExpenses = null;
    cachedUserId = userId;
  }

  try {
    // Portfolio: uses existing assets from context
    if (sections.portfolio) {
      data.portfolio = preparePortfolioData(context.assets);
    }

    // Allocation: uses existing assets + targets
    if (sections.allocation) {
      data.allocation = prepareAllocationData(context.assets, context.allocationTargets);
    }

    // History: uses existing snapshots
    if (sections.history) {
      data.history = prepareHistoryData(context.snapshots);
    }

    // Cashflow: fetch expenses if not cached, then filter by timeFilter
    if (sections.cashflow || sections.fire) {
      if (!cachedExpenses) {
        cachedExpenses = await getAllExpenses(userId);
      }
    }

    if (sections.cashflow) {
      // Filter expenses for cashflow section based on timeFilter
      const filteredExpenses = timeFilter
        ? filterExpensesByTime(cachedExpenses!, timeFilter)
        : cachedExpenses!;
      data.cashflow = prepareCashflowData(filteredExpenses);
    }

    // FIRE: uses all expenses (not filtered) - FIRE needs complete annual data
    if (sections.fire) {
      const totalNetWorth = calculateTotalValue(context.assets);
      data.fire = await prepareFireData(userId, cachedExpenses!, totalNetWorth);
    }

    // Summary: aggregates all available data
    if (sections.summary) {
      data.summary = prepareSummaryData(data, context, sections);
    }

  } catch (error) {
    console.error('Error fetching PDF data:', error);
    throw new Error('Impossibile recuperare i dati per il PDF');
  }

  return data;
}

/**
 * Prepare portfolio data with asset details and totals
 */
export function preparePortfolioData(assets: Asset[]): PortfolioData {
  if (assets.length === 0) {
    return {
      assets: [],
      totalValue: 0,
      liquidValue: 0,
      illiquidValue: 0,
      weightedTER: 0,
      totalUnrealizedGains: 0,
      totalUnrealizedGainsPercent: 0,
      annualCost: 0,
    };
  }

  const totalValue = calculateTotalValue(assets);
  const liquidValue = calculateLiquidNetWorth(assets);
  const illiquidValue = calculateIlliquidNetWorth(assets);
  const weightedTER = calculatePortfolioWeightedTER(assets);
  const annualCost = calculateAnnualPortfolioCost(assets);

  let totalUnrealizedGains = 0;
  const assetRows: AssetRow[] = assets.map(asset => {
    const value = calculateAssetValue(asset);
    const unrealizedGain = calculateUnrealizedGains(asset);
    totalUnrealizedGains += unrealizedGain;

    return {
      ticker: asset.ticker,
      name: asset.name,
      assetClass: asset.assetClass,
      assetType: asset.type,
      quantity: asset.quantity,
      currentPrice: asset.currentPrice,
      totalValue: value,
      weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
      unrealizedGain: asset.averageCost ? unrealizedGain : undefined,
      unrealizedGainPercent: asset.averageCost && asset.averageCost > 0
        ? ((asset.currentPrice - asset.averageCost) / asset.averageCost) * 100
        : undefined,
      ter: asset.totalExpenseRatio,
      isLiquid: asset.isLiquid !== false,
    };
  });

  // Sort by value descending
  assetRows.sort((a, b) => b.totalValue - a.totalValue);

  return {
    assets: assetRows,
    totalValue,
    liquidValue,
    illiquidValue,
    weightedTER,
    totalUnrealizedGains,
    totalUnrealizedGainsPercent: totalValue > 0 ? (totalUnrealizedGains / totalValue) * 100 : 0,
    annualCost,
  };
}

/**
 * Prepare allocation data comparing current vs target
 * Uses compareAllocations() to ensure consistency with allocation page
 */
export function prepareAllocationData(
  assets: Asset[],
  targets: any
): AllocationData {
  // Use compareAllocations() which handles all complex logic including fixed cash
  const comparisonResult = compareAllocations(assets, targets);
  const totalValue = comparisonResult.totalValue;

  if (totalValue === 0) {
    return {
      byAssetClass: [],
      rebalancingNeeded: false,
      rebalancingActions: [],
      hasTargets: false,
    };
  }

  const hasTargets = targets && Object.keys(targets).length > 0;

  // Transform compareAllocations output to PDF format
  const assetClassData: AssetClassAllocation[] = [];
  const assetClasses = ['equity', 'bonds', 'crypto', 'realestate', 'commodity', 'cash'];

  assetClasses.forEach(assetClass => {
    const comparisonData = comparisonResult.byAssetClass[assetClass];

    // Skip if not in comparison result (means no current value and no target)
    if (!comparisonData) return;

    const allocationItem: AssetClassAllocation = {
      assetClass,
      displayName: getAssetClassName(assetClass),
      currentValue: comparisonData.currentValue,
      currentPercent: comparisonData.currentPercentage,
      targetPercent: comparisonData.targetPercentage,
      difference: comparisonData.differenceValue,
      differencePercent: comparisonData.difference,
    };

    // Only include asset classes with non-zero current value or target
    if (comparisonData.currentValue > 0 || comparisonData.targetPercentage > 0) {
      assetClassData.push(allocationItem);
    }
  });

  // Extract rebalancing actions from compareAllocations (uses threshold logic from service)
  // Iterate directly on comparisonResult to ensure all asset classes with action !== 'OK' appear
  const rebalancingActions: RebalancingAction[] = [];
  assetClasses.forEach(assetClass => {
    const comparisonData = comparisonResult.byAssetClass[assetClass];
    if (comparisonData && comparisonData.action !== 'OK') {
      rebalancingActions.push({
        assetClass: getAssetClassName(assetClass),
        action: comparisonData.action === 'COMPRA' ? 'buy' : 'sell',
        amount: Math.abs(comparisonData.differenceValue),
      });
    }
  });

  return {
    byAssetClass: assetClassData,
    rebalancingNeeded: rebalancingActions.length > 0,
    rebalancingActions,
    hasTargets,
  };
}

/**
 * Prepare historical data from snapshots
 */
export function prepareHistoryData(snapshots: MonthlySnapshot[]): HistoryData {
  if (snapshots.length === 0) {
    return {
      netWorthEvolution: [],
      assetClassEvolution: [],
      yoyComparison: [],
    };
  }

  // Sort snapshots by date
  const sorted = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const latestSnapshot = sorted[sorted.length - 1];
  const oldestSnapshot = sorted[0];

  // Net worth evolution
  const netWorthEvolution: NetWorthDataPoint[] = sorted.map(s => ({
    date: `${s.year}-${String(s.month).padStart(2, '0')}`,
    totalNetWorth: s.totalNetWorth,
    liquidNetWorth: s.liquidNetWorth,
    illiquidNetWorth: s.illiquidNetWorth || 0,
    note: s.note,
  }));

  // Asset class evolution
  const assetClassEvolution = sorted.map(s => ({
    date: `${s.year}-${String(s.month).padStart(2, '0')}`,
    equity: s.byAssetClass?.equity || 0,
    bonds: s.byAssetClass?.bonds || 0,
    crypto: s.byAssetClass?.crypto || 0,
    realestate: s.byAssetClass?.realestate || 0,
    commodity: s.byAssetClass?.commodity || 0,
    cash: s.byAssetClass?.cash || 0,
  }));

  // YoY comparison
  const yoyComparison = calculateYoYComparison(sorted);

  // Total growth calculation
  const totalGrowthAbsolute = latestSnapshot.totalNetWorth - oldestSnapshot.totalNetWorth;
  const totalGrowth = oldestSnapshot.totalNetWorth > 0
    ? (totalGrowthAbsolute / oldestSnapshot.totalNetWorth) * 100
    : 0;

  return {
    netWorthEvolution,
    assetClassEvolution,
    yoyComparison,
    latestSnapshot,
    oldestSnapshot,
    totalGrowth,
    totalGrowthAbsolute,
  };
}

/**
 * Calculate year-over-year comparison from snapshots
 */
function calculateYoYComparison(snapshots: MonthlySnapshot[]): YoYDataPoint[] {
  const yearlyData: Record<number, MonthlySnapshot[]> = {};

  snapshots.forEach(snapshot => {
    if (!yearlyData[snapshot.year]) {
      yearlyData[snapshot.year] = [];
    }
    yearlyData[snapshot.year].push(snapshot);
  });

  const years = Object.keys(yearlyData).map(Number).sort();
  const yoyData: YoYDataPoint[] = [];

  years.forEach(year => {
    const yearSnapshots = yearlyData[year].sort((a, b) => a.month - b.month);
    const startValue = yearSnapshots[0].totalNetWorth;
    const endValue = yearSnapshots[yearSnapshots.length - 1].totalNetWorth;
    const growth = endValue - startValue;
    const growthPercent = startValue > 0 ? (growth / startValue) * 100 : 0;

    yoyData.push({
      year,
      startValue,
      endValue,
      growth,
      growthPercent,
    });
  });

  return yoyData;
}

/**
 * Prepare cashflow data from expenses
 */
export function prepareCashflowData(expenses: any[]): CashflowData {
  if (expenses.length === 0) {
    return {
      totalIncome: 0,
      totalExpenses: 0,
      netCashflow: 0,
      incomeToExpenseRatio: 0,
      byCategory: [],
      monthlyTrend: [],
      numberOfMonthsTracked: 0,
      averageMonthlySavings: 0,
    };
  }

  let totalIncome = 0;
  let totalExpenses = 0;

  const categoryMap: Record<string, CategoryBreakdown> = {};
  const monthsSet = new Set<string>();

  expenses.forEach(expense => {
    const amount = Math.abs(expense.amount);

    // Track unique months
    const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
    const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
    monthsSet.add(monthKey);

    if (expense.type === 'income') {
      totalIncome += amount;
    } else {
      totalExpenses += amount;

      // Aggregate by category
      const key = expense.categoryName;
      if (!categoryMap[key]) {
        categoryMap[key] = {
          categoryName: expense.categoryName,
          amount: 0,
          percent: 0,
          transactionCount: 0,
        };
      }
      categoryMap[key].amount += amount;
      categoryMap[key].transactionCount += 1;
    }
  });

  // Calculate percentages and sort by amount
  const byCategory = Object.values(categoryMap);
  byCategory.forEach(cat => {
    cat.percent = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
  });
  byCategory.sort((a, b) => b.amount - a.amount);

  // Take top 5 categories
  const topCategories = byCategory.slice(0, 5);

  const netCashflow = totalIncome - totalExpenses;
  const incomeToExpenseRatio = totalExpenses > 0 ? totalIncome / totalExpenses : 0;

  // Calculate number of months tracked and average monthly savings
  const numberOfMonthsTracked = monthsSet.size;
  const averageMonthlySavings = numberOfMonthsTracked > 0 ? netCashflow / numberOfMonthsTracked : 0;

  return {
    totalIncome,
    totalExpenses,
    netCashflow,
    incomeToExpenseRatio,
    byCategory: topCategories,
    monthlyTrend: [],
    numberOfMonthsTracked,
    averageMonthlySavings,
  };
}

/**
 * Prepare FIRE data with metrics
 */
export async function prepareFireData(
  userId: string,
  expenses: any[],
  currentNetWorth: number
): Promise<FireData> {
  const annualExpenses = await getAnnualExpenses(userId);
  const annualIncome = await getAnnualIncome(userId);

  // Get user settings for safe withdrawal rate
  const settings = await getSettings(userId);
  const safeWithdrawalRate = settings?.withdrawalRate ?? 4.0; // Default 4% if not set
  const fireMetrics = calculateFIREMetrics(currentNetWorth, annualExpenses, safeWithdrawalRate);

  return {
    fireNumber: fireMetrics.fireNumber,
    currentNetWorth,
    progressToFI: fireMetrics.progressToFI,
    annualExpenses,
    annualIncome,
    monthlyAllowance: fireMetrics.monthlyAllowance,
    dailyAllowance: fireMetrics.dailyAllowance,
    safeWithdrawalRate,
    yearsOfExpensesCovered: fireMetrics.yearsOfExpenses,
    currentWithdrawalRate: fireMetrics.currentWR,
  };
}

/**
 * Prepare summary data aggregating key metrics
 */
export function prepareSummaryData(
  data: PDFSectionData,
  context: PDFDataContext,
  sections: SectionSelection
): SummaryData {
  const portfolio = data.portfolio;
  const allocation = data.allocation;
  const fire = data.fire;
  const cashflow = data.cashflow;

  // Determine top asset class
  let topAssetClass = 'N/A';
  if (allocation && allocation.byAssetClass.length > 0) {
    const sorted = [...allocation.byAssetClass].sort((a, b) => b.currentValue - a.currentValue);
    topAssetClass = sorted[0].displayName;
  }

  // Calculate allocation score (how close to targets)
  let allocationScore = 100;
  if (allocation && allocation.hasTargets) {
    const deviations = allocation.byAssetClass
      .filter(a => a.differencePercent !== undefined)
      .map(a => Math.abs(a.differencePercent!));

    if (deviations.length > 0) {
      const avgDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;
      allocationScore = Math.max(0, 100 - avgDeviation * 5); // Each 1% deviation reduces score by 5 points
    }
  }

  // Build sections included list
  const sectionsIncluded: string[] = [];
  if (sections.portfolio) sectionsIncluded.push('Portfolio Assets');
  if (sections.allocation) sectionsIncluded.push('Asset Allocation');
  if (sections.history) sectionsIncluded.push('Storico Patrimonio');
  if (sections.cashflow) sectionsIncluded.push('Entrate e Uscite');
  if (sections.fire) sectionsIncluded.push('FIRE Calculator');
  if (sections.summary) sectionsIncluded.push('Riepilogo');

  return {
    totalNetWorth: portfolio?.totalValue || 0,
    liquidNetWorth: portfolio?.liquidValue || 0,
    assetCount: portfolio?.assets.length || 0,
    topAssetClass,
    weightedTER: portfolio?.weightedTER || 0,
    unrealizedGains: portfolio?.totalUnrealizedGains || 0,
    allocationScore,
    fireProgress: fire?.progressToFI || 0,
    incomeToExpenseRatio: cashflow?.incomeToExpenseRatio || 0,
    generatedAt: context.generatedAt,
    sectionsIncluded,
    dataCompleteness: {
      snapshotCount: context.snapshots.length,
      assetCount: context.assets.length,
      expenseCount: cachedExpenses?.length || 0,
    },
  };
}

/**
 * Helper: Get Italian display name for asset class
 */
function getAssetClassName(assetClass: string): string {
  const names: Record<string, string> = {
    equity: 'Azionario',
    bonds: 'Obbligazionario',
    crypto: 'Criptovalute',
    realestate: 'Immobiliare',
    commodity: 'Materie Prime',
    cash: 'Liquidità',
  };
  return names[assetClass] || assetClass;
}

/**
 * Clear cached expenses (call when switching users)
 */
export function clearPDFDataCache(): void {
  cachedExpenses = null;
  cachedUserId = null;
}
