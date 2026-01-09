import { MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import {
  PerformanceMetrics,
  CashFlowData,
  TimePeriod,
  PerformanceData,
  RollingPeriodPerformance,
  PerformanceChartData
} from '@/types/performance';
import { getExpensesByDateRange } from './expenseService';
import { getUserSnapshots } from './snapshotService';
import { getSettings } from './assetAllocationService';

/**
 * Calculate ROI for a period
 * Formula: ((End NW - Start NW - Net Cash Flows) / Start NW) * 100
 *
 * @param startNW - Starting net worth
 * @param endNW - Ending net worth
 * @param netCashFlow - Total net cash flow (income - expenses)
 * @returns ROI percentage or null if calculation impossible
 */
export function calculateROI(
  startNW: number,
  endNW: number,
  netCashFlow: number
): number | null {
  if (startNW === 0) return null;

  const gain = endNW - startNW - netCashFlow;
  return (gain / startNW) * 100;
}

/**
 * Calculate CAGR (Compound Annual Growth Rate)
 * Formula: ((End NW / (Start NW + Net Cash Flows))^(1/Years) - 1) * 100
 *
 * This version adjusts for cash flows by adding them to the starting value.
 *
 * @param startNW - Starting net worth
 * @param endNW - Ending net worth
 * @param netCashFlow - Total net cash flow
 * @param numberOfMonths - Duration in months
 * @returns CAGR percentage or null if calculation impossible
 */
export function calculateCAGR(
  startNW: number,
  endNW: number,
  netCashFlow: number,
  numberOfMonths: number
): number | null {
  if (numberOfMonths < 1) return null;

  const adjustedStartValue = startNW + netCashFlow;
  if (adjustedStartValue <= 0) return null;

  const years = numberOfMonths / 12;
  const cagr = (Math.pow(endNW / adjustedStartValue, 1 / years) - 1) * 100;

  return isFinite(cagr) ? cagr : null;
}

/**
 * Calculate Time-Weighted Return (TWR)
 *
 * TWR eliminates the effect of cash flows by calculating returns for each sub-period
 * and geometrically linking them. This is the preferred metric for comparing
 * investment performance.
 *
 * Algorithm:
 * 1. For each month, calculate: R = (End NW - Cash Flow) / Start NW - 1
 * 2. Link returns: TWR = [(1 + R1) × (1 + R2) × ... × (1 + Rn)] - 1
 *
 * @param snapshots - Monthly snapshots for the period (sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Annualized TWR percentage or null if insufficient data
 */
export function calculateTimeWeightedReturn(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): number | null {
  if (snapshots.length < 2) return null;

  // Create cash flow lookup map (by YYYY-MM)
  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach(cf => {
    const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  let linkedReturn = 1.0;

  for (let i = 1; i < snapshots.length; i++) {
    const prevSnapshot = snapshots[i - 1];
    const currSnapshot = snapshots[i];

    const startNW = prevSnapshot.totalNetWorth;
    const endNW = currSnapshot.totalNetWorth;

    // Get cash flow for current month
    const cfKey = `${currSnapshot.year}-${String(currSnapshot.month).padStart(2, '0')}`;
    const cashFlow = cashFlowMap.get(cfKey) || 0;

    // Calculate sub-period return: (End NW - Cash Flow) / Start NW - 1
    if (startNW === 0) continue; // Skip if zero starting value
    const periodReturn = ((endNW - cashFlow) / startNW) - 1;

    // Link returns geometrically
    linkedReturn *= (1 + periodReturn);
  }

  // Annualize the return
  const totalMonths = snapshots.length - 1;
  if (totalMonths === 0) return null;

  const years = totalMonths / 12;
  const annualizedTWR = (Math.pow(linkedReturn, 1 / years) - 1) * 100;

  return isFinite(annualizedTWR) ? annualizedTWR : null;
}

/**
 * Calculate Money-Weighted Return (IRR) using Newton-Raphson method
 *
 * IRR is the discount rate that makes NPV = 0:
 * NPV = -Start NW + CF1/(1+r)^t1 + CF2/(1+r)^t2 + ... + (End NW)/(1+r)^tn
 *
 * @param startNW - Starting net worth (treated as negative cash flow at t=0)
 * @param endNW - Ending net worth (positive cash flow at t=end)
 * @param cashFlows - Cash flows during the period
 * @param numberOfMonths - Duration in months
 * @returns Annualized IRR percentage or null if calculation fails
 */
export function calculateIRR(
  startNW: number,
  endNW: number,
  cashFlows: CashFlowData[],
  numberOfMonths: number
): number | null {
  if (numberOfMonths < 1 || startNW === 0) return null;

  // Build cash flow array with dates
  const cfArray: { amount: number; monthsFromStart: number }[] = [];

  // Starting value (negative outflow)
  cfArray.push({ amount: -startNW, monthsFromStart: 0 });

  // Find the start date (first cash flow date or approximate from snapshots)
  const startDate = cashFlows.length > 0 ? cashFlows[0].date : new Date();

  // Intermediate cash flows
  cashFlows.forEach(cf => {
    const monthsFromStart = calculateMonthsDifference(cf.date, startDate);
    cfArray.push({ amount: cf.netCashFlow, monthsFromStart });
  });

  // Ending value (positive inflow)
  cfArray.push({ amount: endNW, monthsFromStart: numberOfMonths });

  // Newton-Raphson iterative solver
  let rate = 0.1; // Initial guess: 10%
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let derivative = 0;

    cfArray.forEach(cf => {
      const years = cf.monthsFromStart / 12;
      const discountFactor = Math.pow(1 + rate, -years);
      npv += cf.amount * discountFactor;
      derivative -= cf.amount * years * discountFactor / (1 + rate);
    });

    if (Math.abs(npv) < tolerance) {
      return rate * 100; // Convert to percentage
    }

    if (derivative === 0) break; // Avoid division by zero

    rate -= npv / derivative; // Newton-Raphson update

    // Prevent negative rates (unrealistic for portfolio returns)
    if (rate < -0.99) rate = -0.99;
  }

  return null; // Failed to converge
}

/**
 * Calculate Sharpe Ratio
 * Formula: (Portfolio Return - Risk-Free Rate) / Portfolio Volatility
 *
 * @param portfolioReturn - Annualized portfolio return (%)
 * @param riskFreeRate - Risk-free rate (%)
 * @param volatility - Annualized volatility (%)
 * @returns Sharpe Ratio or null if volatility is zero
 */
export function calculateSharpeRatio(
  portfolioReturn: number,
  riskFreeRate: number,
  volatility: number
): number | null {
  if (volatility === 0) return null;
  return (portfolioReturn - riskFreeRate) / volatility;
}

/**
 * Calculate annualized volatility from monthly snapshots
 * Uses month-over-month returns, filters extreme values (±50%)
 *
 * @param snapshots - Monthly snapshots
 * @param cashFlows - Cash flows to adjust for contributions/withdrawals
 * @returns Annualized volatility (%) or null if insufficient data
 */
export function calculateVolatility(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): number | null {
  if (snapshots.length < 2) return null;

  // Create cash flow lookup
  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach(cf => {
    const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  const monthlyReturns: number[] = [];

  for (let i = 1; i < snapshots.length; i++) {
    const prevNW = snapshots[i - 1].totalNetWorth;
    const currNW = snapshots[i].totalNetWorth;

    if (prevNW === 0) continue;

    const cfKey = `${snapshots[i].year}-${String(snapshots[i].month).padStart(2, '0')}`;
    const cashFlow = cashFlowMap.get(cfKey) || 0;

    // Monthly return = (End NW - Cash Flow) / Start NW - 1
    const monthlyReturn = ((currNW - cashFlow) / prevNW - 1) * 100;

    // Filter extreme values (likely due to large contributions/withdrawals)
    if (Math.abs(monthlyReturn) < 50) {
      monthlyReturns.push(monthlyReturn);
    }
  }

  if (monthlyReturns.length < 2) return null;

  // Calculate standard deviation
  const mean = monthlyReturns.reduce((sum, r) => sum + r, 0) / monthlyReturns.length;
  const variance = monthlyReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (monthlyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  // Annualize: σ_annual = σ_monthly × √12
  return stdDev * Math.sqrt(12);
}

/**
 * Calculate Maximum Drawdown (cash flow adjusted)
 * Measures the largest peak-to-trough decline in portfolio value
 * Uses TWR-style adjustment to isolate investment performance
 *
 * @param snapshots - Monthly snapshots (sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Maximum drawdown as negative percentage, or null if portfolio never declined
 */
export function calculateMaxDrawdown(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): number | null {
  if (snapshots.length < 2) return null;

  // Create cash flow lookup map (by YYYY-MM)
  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach(cf => {
    const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  // Calculate adjusted portfolio values (subtract cumulative contributions)
  let cumulativeCashFlow = 0;
  const adjustedValues: number[] = [];

  for (const snapshot of snapshots) {
    const cfKey = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`;
    cumulativeCashFlow += cashFlowMap.get(cfKey) || 0;

    // TWR-style adjustment: isolate investment performance
    const adjustedValue = snapshot.totalNetWorth - cumulativeCashFlow;
    adjustedValues.push(adjustedValue);
  }

  // Track running peak and maximum drawdown
  let runningPeak = adjustedValues[0];
  let maxDrawdown = 0; // Start at 0 (no drawdown)

  for (const currentValue of adjustedValues) {
    // Update peak if new high is reached
    if (currentValue > runningPeak) {
      runningPeak = currentValue;
    }

    // Calculate drawdown from peak (avoid division by zero)
    if (runningPeak > 0) {
      const drawdown = ((currentValue - runningPeak) / runningPeak) * 100;

      // Track the most negative drawdown (largest loss)
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  // Return null if portfolio never declined, otherwise return negative percentage
  return maxDrawdown === 0 ? null : maxDrawdown;
}

/**
 * Calculate number of months between two dates (inclusive)
 * Example: Jan 2025 to Dec 2025 = 12 months (not 11)
 */
function calculateMonthsDifference(date1: Date, date2: Date): number {
  const years = date1.getFullYear() - date2.getFullYear();
  const months = date1.getMonth() - date2.getMonth();
  return years * 12 + months + 1; // +1 to include both start and end month
}

/**
 * Get snapshots for a specific time period
 */
export function getSnapshotsForPeriod(
  allSnapshots: MonthlySnapshot[],
  timePeriod: TimePeriod,
  customStartDate?: Date,
  customEndDate?: Date
): MonthlySnapshot[] {
  const now = new Date();
  let startDate: Date;
  let endDate = now;

  switch (timePeriod) {
    case 'YTD':
      startDate = new Date(now.getFullYear(), 0, 1); // Jan 1
      break;
    case '1Y':
      startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1); // Last 12 months
      break;
    case '3Y':
      startDate = new Date(now.getFullYear(), now.getMonth() - 35, 1); // Last 36 months
      break;
    case '5Y':
      startDate = new Date(now.getFullYear(), now.getMonth() - 59, 1); // Last 60 months
      break;
    case 'ALL':
      return allSnapshots.filter(s => !s.isDummy); // Return all non-dummy snapshots
    case 'CUSTOM':
      if (!customStartDate || !customEndDate) return [];
      // Normalizza al primo giorno del mese in timezone locale per allineamento con snapshots
      startDate = new Date(customStartDate.getFullYear(), customStartDate.getMonth(), 1);
      endDate = customEndDate;
      break;
    default:
      return [];
  }

  // Filter snapshots by date range
  return allSnapshots.filter(snapshot => {
    if (snapshot.isDummy) return false; // Exclude test data

    const snapshotDate = new Date(snapshot.year, snapshot.month - 1, 1);
    return snapshotDate >= startDate && snapshotDate <= endDate;
  });
}

/**
 * Aggregate monthly cash flows from expenses
 * Separates dividend income from other income for accurate performance calculations
 *
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 */
export async function getCashFlowsForPeriod(
  userId: string,
  startDate: Date,
  endDate: Date,
  dividendCategoryId?: string
): Promise<CashFlowData[]> {
  const expenses = await getExpensesByDateRange(userId, startDate, endDate);

  // Group expenses by month
  const monthlyMap = new Map<string, { income: number; expenses: number; dividendIncome: number }>();

  expenses.forEach(expense => {
    const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { income: 0, expenses: 0, dividendIncome: 0 });
    }

    const entry = monthlyMap.get(key)!;

    // Separate dividend income from other income
    if (expense.type === 'income') {
      if (dividendCategoryId && expense.categoryId === dividendCategoryId) {
        // Dividend income (portfolio return)
        entry.dividendIncome += expense.amount;
      } else {
        // External income (salary, bonus, gifts)
        entry.income += expense.amount;
      }
    } else {
      entry.expenses += Math.abs(expense.amount);
    }
  });

  // Convert to CashFlowData array
  const cashFlows: CashFlowData[] = [];
  monthlyMap.forEach((value, key) => {
    const [year, month] = key.split('-').map(Number);
    cashFlows.push({
      date: new Date(year, month - 1, 1),
      income: value.income,
      expenses: value.expenses,
      dividendIncome: value.dividendIncome,
      netCashFlow: value.income - value.expenses, // SENZA dividendi!
    });
  });

  return cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Build cash flows from a pre-fetched expense array (in-memory filtering)
 * This eliminates N Firestore queries in rolling period calculations
 * Separates dividend income from other income for accurate performance calculations
 *
 * @param expenses - Pre-fetched expense array
 * @param startDate - Start date for filtering
 * @param endDate - End date for filtering
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 * @returns Array of monthly cash flow data
 */
export function getCashFlowsFromExpenses(
  expenses: Expense[],
  startDate: Date,
  endDate: Date,
  dividendCategoryId?: string
): CashFlowData[] {
  // Filter expenses by date range in-memory
  const filtered = expenses.filter(expense => {
    const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
    return date >= startDate && date <= endDate;
  });

  // Group expenses by month (same logic as getCashFlowsForPeriod)
  const monthlyMap = new Map<string, { income: number; expenses: number; dividendIncome: number }>();

  filtered.forEach(expense => {
    const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { income: 0, expenses: 0, dividendIncome: 0 });
    }

    const entry = monthlyMap.get(key)!;

    // Separate dividend income from other income
    if (expense.type === 'income') {
      if (dividendCategoryId && expense.categoryId === dividendCategoryId) {
        // Dividend income (portfolio return)
        entry.dividendIncome += expense.amount;
      } else {
        // External income (salary, bonus, gifts)
        entry.income += expense.amount;
      }
    } else {
      entry.expenses += Math.abs(expense.amount);
    }
  });

  // Convert to CashFlowData array
  const cashFlows: CashFlowData[] = [];
  monthlyMap.forEach((value, key) => {
    const [year, month] = key.split('-').map(Number);
    cashFlows.push({
      date: new Date(year, month - 1, 1),
      income: value.income,
      expenses: value.expenses,
      dividendIncome: value.dividendIncome,
      netCashFlow: value.income - value.expenses, // SENZA dividendi!
    });
  });

  return cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Calculate performance metrics for a specific time period
 *
 * @param preFetchedExpenses - Optional pre-fetched expenses array to avoid redundant Firestore queries
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 */
export async function calculatePerformanceForPeriod(
  userId: string,
  allSnapshots: MonthlySnapshot[],
  timePeriod: TimePeriod,
  riskFreeRate: number,
  customStartDate?: Date,
  customEndDate?: Date,
  preFetchedExpenses?: Expense[],
  dividendCategoryId?: string
): Promise<PerformanceMetrics> {
  // Get snapshots for period
  const snapshots = getSnapshotsForPeriod(
    allSnapshots,
    timePeriod,
    customStartDate,
    customEndDate
  );

  // Base metrics object (in case of errors)
  const baseMetrics: PerformanceMetrics = {
    timePeriod,
    startDate: customStartDate || new Date(),
    endDate: customEndDate || new Date(),
    startNetWorth: 0,
    endNetWorth: 0,
    cashFlows: [],
    roi: null,
    cagr: null,
    timeWeightedReturn: null,
    moneyWeightedReturn: null,
    sharpeRatio: null,
    volatility: null,
    maxDrawdown: null,
    riskFreeRate,
    dividendCategoryId,
    totalContributions: 0,
    totalWithdrawals: 0,
    netCashFlow: 0,
    totalIncome: 0,
    totalExpenses: 0,
    totalDividendIncome: 0,
    numberOfMonths: 0,
    hasInsufficientData: true,
  };

  if (snapshots.length < 2) {
    baseMetrics.errorMessage = 'Insufficient data: need at least 2 snapshots';
    return baseMetrics;
  }

  // Sort snapshots chronologically
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const startSnapshot = sortedSnapshots[0];
  const endSnapshot = sortedSnapshots[sortedSnapshots.length - 1];

  const startDate = new Date(startSnapshot.year, startSnapshot.month - 1, 1);
  const endDate = new Date(endSnapshot.year, endSnapshot.month, 0, 23, 59, 59, 999); // Last day of month
  const numberOfMonths = calculateMonthsDifference(endDate, startDate);

  // Get cash flows for period - use pre-fetched if available, otherwise fetch
  const cashFlows = preFetchedExpenses
    ? getCashFlowsFromExpenses(preFetchedExpenses, startDate, endDate, dividendCategoryId)
    : await getCashFlowsForPeriod(userId, startDate, endDate, dividendCategoryId);

  // Calculate net cash flow totals
  let totalContributions = 0;
  let totalWithdrawals = 0;
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalDividendIncome = 0;

  cashFlows.forEach(cf => {
    // Sum all income and expenses (dividends tracked separately)
    totalIncome += cf.income;
    totalExpenses += cf.expenses;
    totalDividendIncome += cf.dividendIncome;

    // Calculate contributions/withdrawals based on net cash flow (WITHOUT dividends)
    if (cf.netCashFlow > 0) {
      totalContributions += cf.netCashFlow;
    } else {
      totalWithdrawals += Math.abs(cf.netCashFlow);
    }
  });
  const netCashFlow = totalContributions - totalWithdrawals;

  // Calculate metrics
  const roi = calculateROI(
    startSnapshot.totalNetWorth,
    endSnapshot.totalNetWorth,
    netCashFlow
  );

  const cagr = calculateCAGR(
    startSnapshot.totalNetWorth,
    endSnapshot.totalNetWorth,
    netCashFlow,
    numberOfMonths
  );

  const timeWeightedReturn = calculateTimeWeightedReturn(
    sortedSnapshots,
    cashFlows
  );

  const moneyWeightedReturn = calculateIRR(
    startSnapshot.totalNetWorth,
    endSnapshot.totalNetWorth,
    cashFlows,
    numberOfMonths
  );

  const volatility = calculateVolatility(sortedSnapshots, cashFlows);

  const maxDrawdown = calculateMaxDrawdown(sortedSnapshots, cashFlows);

  const sharpeRatio = timeWeightedReturn !== null && volatility !== null
    ? calculateSharpeRatio(timeWeightedReturn, riskFreeRate, volatility)
    : null;

  return {
    timePeriod,
    startDate,
    endDate,
    startNetWorth: startSnapshot.totalNetWorth,
    endNetWorth: endSnapshot.totalNetWorth,
    cashFlows,
    roi,
    cagr,
    timeWeightedReturn,
    moneyWeightedReturn,
    sharpeRatio,
    volatility,
    maxDrawdown,
    riskFreeRate,
    dividendCategoryId, // Store for reuse in custom date ranges
    totalContributions,
    totalWithdrawals,
    netCashFlow,
    totalIncome,
    totalExpenses,
    totalDividendIncome,
    numberOfMonths,
    hasInsufficientData: false,
  };
}

/**
 * Get all performance data for the page
 */
export async function getAllPerformanceData(userId: string): Promise<PerformanceData> {
  // Fetch all required data
  const [snapshots, settings] = await Promise.all([
    getUserSnapshots(userId),
    getSettings(userId),
  ]);

  const riskFreeRate = settings?.riskFreeRate || 2.5; // Default to 2.5%
  const dividendCategoryId = settings?.dividendIncomeCategoryId; // For separating dividend income

  // OPTIMIZATION: Fetch ALL expenses once for the entire history
  const sortedSnapshots = snapshots.filter(s => !s.isDummy).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  let allExpenses: Expense[] = [];
  if (sortedSnapshots.length > 0) {
    const firstSnapshot = sortedSnapshots[0];
    const lastSnapshot = sortedSnapshots[sortedSnapshots.length - 1];
    const overallStartDate = new Date(firstSnapshot.year, firstSnapshot.month - 1, 1);
    const overallEndDate = new Date(lastSnapshot.year, lastSnapshot.month, 0, 23, 59, 59, 999); // Last day of month
    allExpenses = await getExpensesByDateRange(userId, overallStartDate, overallEndDate);
  }

  // Calculate metrics for each period (passing pre-fetched expenses and dividend category ID)
  const [ytd, oneYear, threeYear, fiveYear, allTime] = await Promise.all([
    calculatePerformanceForPeriod(userId, snapshots, 'YTD', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
    calculatePerformanceForPeriod(userId, snapshots, '1Y', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
    calculatePerformanceForPeriod(userId, snapshots, '3Y', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
    calculatePerformanceForPeriod(userId, snapshots, '5Y', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
    calculatePerformanceForPeriod(userId, snapshots, 'ALL', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
  ]);

  // Calculate rolling periods (with dividend category ID)
  const rolling12M = await calculateRollingPeriods(userId, snapshots, 12, riskFreeRate, dividendCategoryId);
  const rolling36M = await calculateRollingPeriods(userId, snapshots, 36, riskFreeRate, dividendCategoryId);

  return {
    ytd,
    oneYear,
    threeYear,
    fiveYear,
    allTime,
    custom: null, // User hasn't selected custom range yet
    rolling12M,
    rolling36M,
    lastUpdated: new Date(),
    snapshotCount: snapshots.filter(s => !s.isDummy).length,
  };
}

/**
 * Calculate rolling period performance
 *
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 */
async function calculateRollingPeriods(
  userId: string,
  allSnapshots: MonthlySnapshot[],
  windowMonths: number,
  riskFreeRate: number,
  dividendCategoryId?: string
): Promise<RollingPeriodPerformance[]> {
  const sortedSnapshots = allSnapshots
    .filter(s => !s.isDummy)
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

  if (sortedSnapshots.length < windowMonths + 1) {
    return [];
  }

  // OPTIMIZATION: Fetch ALL expenses once for the entire period range
  const firstSnapshot = sortedSnapshots[0];
  const lastSnapshot = sortedSnapshots[sortedSnapshots.length - 1];
  const overallStartDate = new Date(firstSnapshot.year, firstSnapshot.month - 1, 1);
  const overallEndDate = new Date(lastSnapshot.year, lastSnapshot.month, 0, 23, 59, 59, 999); // Last day of month

  const allExpenses = await getExpensesByDateRange(userId, overallStartDate, overallEndDate);

  const rollingPeriods: RollingPeriodPerformance[] = [];

  for (let i = windowMonths; i < sortedSnapshots.length; i++) {
    const endSnapshot = sortedSnapshots[i];
    const startSnapshot = sortedSnapshots[i - windowMonths];

    const periodEndDate = new Date(endSnapshot.year, endSnapshot.month - 1, 1);
    const periodStartDate = new Date(startSnapshot.year, startSnapshot.month - 1, 1);

    // Get snapshots and cash flows for this window
    const windowSnapshots = sortedSnapshots.slice(i - windowMonths, i + 1);
    // OPTIMIZATION: Use in-memory filtering instead of Firestore query
    const cashFlows = getCashFlowsFromExpenses(allExpenses, periodStartDate, periodEndDate, dividendCategoryId);

    // Calculate CAGR
    const netCashFlow = cashFlows.reduce((sum, cf) => sum + cf.netCashFlow, 0);
    const cagr = calculateCAGR(
      startSnapshot.totalNetWorth,
      endSnapshot.totalNetWorth,
      netCashFlow,
      windowMonths
    );

    // Calculate volatility and Sharpe
    const volatility = calculateVolatility(windowSnapshots, cashFlows);
    const twr = calculateTimeWeightedReturn(windowSnapshots, cashFlows);
    const sharpeRatio = twr !== null && volatility !== null
      ? calculateSharpeRatio(twr, riskFreeRate, volatility)
      : null;

    rollingPeriods.push({
      periodEndDate,
      periodStartDate,
      cagr: cagr || 0,
      sharpeRatio,
      volatility,
    });
  }

  return rollingPeriods;
}

/**
 * Prepare chart data for net worth evolution
 */
export function preparePerformanceChartData(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): PerformanceChartData[] {
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  let cumulativeContributions = 0;
  const cashFlowMap = new Map<string, number>();

  cashFlows.forEach(cf => {
    const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  return sortedSnapshots.map(snapshot => {
    const key = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`;
    const cashFlow = cashFlowMap.get(key) || 0;
    cumulativeContributions += cashFlow;

    return {
      date: `${String(snapshot.month).padStart(2, '0')}/${snapshot.year}`,
      netWorth: snapshot.totalNetWorth,
      contributions: cumulativeContributions,
      returns: snapshot.totalNetWorth - cumulativeContributions,
    };
  });
}
