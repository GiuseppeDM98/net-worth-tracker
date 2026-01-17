import { MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import {
  PerformanceMetrics,
  CashFlowData,
  TimePeriod,
  PerformanceData,
  RollingPeriodPerformance,
  PerformanceChartData,
  MonthlyReturnHeatmapData,
  UnderwaterDrawdownData
} from '@/types/performance';
import { getExpensesByDateRange } from './expenseService';
import { getUserSnapshots } from './snapshotService';
import { getSettings } from './assetAllocationService';

/**
 * Format month and year to MM/YY format (e.g., "04/25")
 * @param year - Full year (e.g., 2025)
 * @param month - Month (1-12)
 */
function formatMonthYear(year: number, month: number): string {
  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year).slice(-2);  // Last 2 digits
  return `${monthStr}/${yearStr}`;
}

/**
 * Format a period from start to end (or "Presente" if ongoing)
 * @param startYear - Start year
 * @param startMonth - Start month (1-12)
 * @param endYear - End year (null if ongoing)
 * @param endMonth - End month (1-12, null if ongoing)
 */
function formatPeriod(
  startYear: number,
  startMonth: number,
  endYear: number | null,
  endMonth: number | null
): string {
  const start = formatMonthYear(startYear, startMonth);

  if (endYear === null || endMonth === null) {
    return `${start} - Presente`;
  }

  const end = formatMonthYear(endYear, endMonth);
  return `${start} - ${end}`;
}

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
  // This numerical method finds the rate where NPV = 0 by iteratively refining an initial guess.
  // Each iteration calculates NPV and its derivative at the current rate, then updates:
  // new_rate = old_rate - (NPV / derivative)
  // Convergence is achieved when |NPV| < tolerance
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

    // Prevent extremely negative rates (< -99%) which are unrealistic for portfolio returns
    // and can cause numerical instability in the next iteration
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

    // Filter extreme values >±50% to exclude spikes from large contributions/withdrawals
    // These outliers would distort volatility calculations, making them unrepresentative
    // of actual investment performance
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
 * @returns Object with maximum drawdown percentage and trough date, or null values if portfolio never declined
 */
export function calculateMaxDrawdown(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): { value: number | null; troughDate: string | null } {
  if (snapshots.length < 2) return { value: null, troughDate: null };

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
  let maxDrawdownTroughIndex = 0; // Track trough index for max drawdown

  for (let i = 0; i < adjustedValues.length; i++) {
    const currentValue = adjustedValues[i];

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
        maxDrawdownTroughIndex = i; // Save index of trough
      }
    }
  }

  // STEP 9: Extract trough date if drawdown occurred
  if (maxDrawdown === 0) {
    return { value: null, troughDate: null };
  }

  const troughSnapshot = snapshots[maxDrawdownTroughIndex];
  const troughDate = formatMonthYear(troughSnapshot.year, troughSnapshot.month);

  return {
    value: maxDrawdown,  // Negative percentage (e.g., -15.5)
    troughDate          // MM/YY format (e.g., "04/25")
  };
}

/**
 * Calculate Drawdown Duration (cash flow adjusted)
 * Measures the time (in months) from the initial peak to complete recovery of the deepest Max Drawdown
 * Uses TWR-style adjustment to isolate investment performance
 *
 * @param snapshots - Monthly snapshots (sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Object with duration in months and period range, or null values if portfolio never declined
 *
 * @example
 * Portfolio drops 15% from Jan (index 0) to Apr (index 3), recovers to new peak on Dec (index 11)
 * Duration = 11 months (from Jan peak to Dec recovery)
 */
export function calculateDrawdownDuration(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): { duration: number | null; period: string | null } {
  // STEP 1: Early exit for insufficient data
  if (snapshots.length < 2) return { duration: null, period: null };

  // STEP 2: Create cash flow adjustment map (identical to Max Drawdown)
  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach(cf => {
    const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  // STEP 3: Calculate TWR-adjusted values (identical to Max Drawdown)
  let cumulativeCashFlow = 0;
  const adjustedValues: number[] = [];

  for (const snapshot of snapshots) {
    const cfKey = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`;
    cumulativeCashFlow += cashFlowMap.get(cfKey) || 0;
    const adjustedValue = snapshot.totalNetWorth - cumulativeCashFlow;
    adjustedValues.push(adjustedValue);
  }

  // STEP 4: Track drawdown periods and identify Max Drawdown period
  let runningPeak = adjustedValues[0];
  let peakIndex = 0;                    // Index of current running peak
  let maxDrawdown = 0;                  // Most negative drawdown percentage
  let maxDrawdownPeakIndex = 0;         // Index where Max Drawdown period started
  let maxDrawdownTroughIndex = 0;       // Index where Max Drawdown bottomed

  for (let i = 0; i < adjustedValues.length; i++) {
    const currentValue = adjustedValues[i];

    // Update peak if new high reached
    if (currentValue > runningPeak) {
      runningPeak = currentValue;
      peakIndex = i;
    }

    // Calculate current drawdown percentage
    if (runningPeak > 0) {
      const currentDrawdown = ((currentValue - runningPeak) / runningPeak) * 100;

      // Track the most negative drawdown (Max Drawdown)
      if (currentDrawdown < maxDrawdown) {
        maxDrawdown = currentDrawdown;
        maxDrawdownPeakIndex = peakIndex;      // Save peak index for this drawdown
        maxDrawdownTroughIndex = i;            // Save trough index
      }
    }
  }

  // STEP 5: If no drawdown occurred, return null
  if (maxDrawdown === 0) {
    return { duration: null, period: null };
  }

  // STEP 6: Find recovery point (when adjustedValue >= peak value)
  const peakValue = adjustedValues[maxDrawdownPeakIndex];
  let recoveryIndex: number | null = null;

  for (let i = maxDrawdownTroughIndex + 1; i < adjustedValues.length; i++) {
    if (adjustedValues[i] >= peakValue) {
      recoveryIndex = i;
      break;  // Found first recovery point
    }
  }

  // STEP 7: Calculate duration (inclusive of both peak and recovery months)
  let duration: number;

  if (recoveryIndex === null) {
    // Still in drawdown - calculate duration from peak to present (inclusive)
    duration = (adjustedValues.length - 1) - maxDrawdownPeakIndex + 1;
  } else {
    // Recovered - calculate duration from peak to recovery (inclusive)
    duration = recoveryIndex - maxDrawdownPeakIndex + 1;  // +1 for inclusive count
  }

  // STEP 9: Extract peak and recovery dates for period label
  const peakSnapshot = snapshots[maxDrawdownPeakIndex];
  let recoverySnapshot: MonthlySnapshot | null = null;

  if (recoveryIndex !== null) {
    recoverySnapshot = snapshots[recoveryIndex];
  }

  const period = formatPeriod(
    peakSnapshot.year,
    peakSnapshot.month,
    recoverySnapshot?.year ?? null,
    recoverySnapshot?.month ?? null
  );

  return {
    duration: Math.max(1, duration),  // Duration in months (≥1)
    period                            // Range (e.g., "01/25 - 12/25" or "01/25 - Presente")
  };
}

/**
 * Calculate Recovery Time (cash flow adjusted)
 * Measures the time (in months) from the trough (lowest point) to complete recovery
 * Uses TWR-style adjustment to isolate investment performance
 *
 * @param snapshots - Monthly snapshots (sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Object with duration in months and period range, or null values if portfolio never declined
 *
 * @example
 * Portfolio drops 15% from Jan (index 0) to Apr (index 3), recovers to peak on Dec (index 11)
 * Drawdown Duration = 11 months (Jan peak → Dec recovery)
 * Recovery Time = 8 months (Apr trough → Dec recovery)
 */
export function calculateRecoveryTime(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): { duration: number | null; period: string | null } {
  // STEP 1: Early exit for insufficient data
  if (snapshots.length < 2) return { duration: null, period: null };

  // STEP 2: Create cash flow adjustment map (IDENTICAL to Max Drawdown & Drawdown Duration)
  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach(cf => {
    const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  // STEP 3: Calculate TWR-adjusted values (IDENTICAL to Max Drawdown & Drawdown Duration)
  let cumulativeCashFlow = 0;
  const adjustedValues: number[] = [];

  for (const snapshot of snapshots) {
    const cfKey = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`;
    cumulativeCashFlow += cashFlowMap.get(cfKey) || 0;
    const adjustedValue = snapshot.totalNetWorth - cumulativeCashFlow;
    adjustedValues.push(adjustedValue);
  }

  // STEP 4: Track drawdown periods and identify Max Drawdown period (IDENTICAL to Drawdown Duration)
  let runningPeak = adjustedValues[0];
  let peakIndex = 0;                    // Index of current running peak
  let maxDrawdown = 0;                  // Most negative drawdown percentage
  let maxDrawdownPeakIndex = 0;         // Index where Max Drawdown period started
  let maxDrawdownTroughIndex = 0;       // Index where Max Drawdown bottomed

  for (let i = 0; i < adjustedValues.length; i++) {
    const currentValue = adjustedValues[i];

    // Update peak if new high reached
    if (currentValue > runningPeak) {
      runningPeak = currentValue;
      peakIndex = i;
    }

    // Calculate current drawdown percentage
    if (runningPeak > 0) {
      const currentDrawdown = ((currentValue - runningPeak) / runningPeak) * 100;

      // Track the most negative drawdown (Max Drawdown)
      if (currentDrawdown < maxDrawdown) {
        maxDrawdown = currentDrawdown;
        maxDrawdownPeakIndex = peakIndex;      // Save peak index for this drawdown
        maxDrawdownTroughIndex = i;            // Save trough index
      }
    }
  }

  // STEP 5: If no drawdown occurred, return null
  if (maxDrawdown === 0) {
    return { duration: null, period: null };
  }

  // STEP 6: Find recovery point (when adjustedValue >= peak value)
  const peakValue = adjustedValues[maxDrawdownPeakIndex];
  let recoveryIndex: number | null = null;

  for (let i = maxDrawdownTroughIndex + 1; i < adjustedValues.length; i++) {
    if (adjustedValues[i] >= peakValue) {
      recoveryIndex = i;
      break;  // Found first recovery point
    }
  }

  // STEP 7: Calculate Recovery Time (from TROUGH to recovery, inclusive)
  let recoveryTime: number;

  if (recoveryIndex === null) {
    // Still in drawdown - calculate duration from trough to present (inclusive)
    recoveryTime = (adjustedValues.length - 1) - maxDrawdownTroughIndex + 1;
  } else {
    // Recovered - calculate duration from TROUGH to recovery (inclusive)
    // KEY DIFFERENCE: Drawdown Duration uses maxDrawdownPeakIndex, Recovery Time uses maxDrawdownTroughIndex
    recoveryTime = recoveryIndex - maxDrawdownTroughIndex + 1;  // +1 for inclusive count
  }

  // STEP 9: Extract trough and recovery dates for period label
  const troughSnapshot = snapshots[maxDrawdownTroughIndex];
  let recoverySnapshot: MonthlySnapshot | null = null;

  if (recoveryIndex !== null) {
    recoverySnapshot = snapshots[recoveryIndex];
  }

  const period = formatPeriod(
    troughSnapshot.year,
    troughSnapshot.month,
    recoverySnapshot?.year ?? null,
    recoverySnapshot?.month ?? null
  );

  return {
    duration: Math.max(1, recoveryTime),  // Duration in months (≥1)
    period                                // Range (e.g., "04/25 - 12/25" or "04/25 - Presente")
  };
}

/**
 * Calculate Yield on Cost (YOC) metrics for a period
 *
 * YOC measures annualized dividend yield based on original cost basis (not current market value).
 * This metric shows the return on your initial investment, making it useful for evaluating
 * dividend growth over time.
 *
 * ANNUALIZATION STRATEGY:
 * - Periods < 12 months: Scale up to annual rate (totalDividends / months × 12)
 * - Periods >= 12 months: Average annual dividends (totalDividends / years)
 * - This ensures comparability across different time periods
 *
 * FORMULA:
 * YOC% = (Annualized Dividends / Cost Basis) × 100
 *
 * Where:
 * - Annualized Dividends = Dividends adjusted to annual rate based on period length
 * - Cost Basis = Sum of (quantity × averageCost) for assets that paid dividends
 *
 * FILTERING:
 * - Dividends filtered by payment date (when money actually received)
 * - Only assets with quantity > 0 and averageCost > 0 included in cost basis
 * - Multi-currency dividends use EUR conversion if available
 *
 * @param dividends - All user dividends (will be filtered by period internally)
 * @param assets - All user assets (for cost basis calculation)
 * @param startDate - Period start date (inclusive)
 * @param endDate - Period end date (inclusive)
 * @param numberOfMonths - Duration in months (used for annualization)
 * @returns Object with YOC metrics or null values if insufficient data
 */
export function calculateYocMetrics(
  dividends: any[],
  assets: any[],
  startDate: Date,
  endDate: Date,
  numberOfMonths: number
): {
  yocGross: number | null;
  yocNet: number | null;
  yocDividendsGross: number;
  yocDividendsNet: number;
  yocCostBasis: number;
  yocAssetCount: number;
} {
  // STEP 1: Filter dividends by payment date (coerente con calendar view)
  // Use payment date rather than ex-date because we care about when money was received
  const periodDividends = dividends.filter(div => {
    const paymentDate = div.paymentDate instanceof Date
      ? div.paymentDate
      : div.paymentDate.toDate();
    return paymentDate >= startDate && paymentDate <= endDate;
  });

  // Early return if no dividends in period
  if (periodDividends.length === 0) {
    return {
      yocGross: null,
      yocNet: null,
      yocDividendsGross: 0,
      yocDividendsNet: 0,
      yocCostBasis: 0,
      yocAssetCount: 0,
    };
  }

  // STEP 2: Calculate total dividends in period
  // Prefer EUR-converted amounts for multi-currency consistency
  const totalGross = periodDividends.reduce((sum, div) =>
    sum + (div.grossAmountEur ?? div.grossAmount), 0
  );
  const totalNet = periodDividends.reduce((sum, div) =>
    sum + (div.netAmountEur ?? div.netAmount), 0
  );

  // STEP 3: Annualize dividends based on period length
  // This allows meaningful comparison between different time periods
  let annualizedGross: number;
  let annualizedNet: number;

  if (numberOfMonths >= 12) {
    // For multi-year periods: calculate average annual dividends
    const years = numberOfMonths / 12;
    annualizedGross = totalGross / years;
    annualizedNet = totalNet / years;
  } else if (numberOfMonths > 0) {
    // For periods < 1 year: scale up to annual rate
    annualizedGross = (totalGross / numberOfMonths) * 12;
    annualizedNet = (totalNet / numberOfMonths) * 12;
  } else {
    // Edge case: invalid period (zero months)
    return {
      yocGross: null,
      yocNet: null,
      yocDividendsGross: totalGross,
      yocDividendsNet: totalNet,
      yocCostBasis: 0,
      yocAssetCount: 0,
    };
  }

  // STEP 4: Calculate cost basis for assets that paid dividends in this period
  // Only include assets currently owned (quantity > 0) with known cost basis
  const assetIdsWithDividends = new Set(periodDividends.map(d => d.assetId));
  const assetsMap = new Map(assets.map(a => [a.id, a]));

  let costBasis = 0;
  let assetCount = 0;

  assetIdsWithDividends.forEach(assetId => {
    const asset = assetsMap.get(assetId);
    // Include only assets that:
    // 1. Still exist in portfolio
    // 2. Have valid average cost
    // 3. Have positive quantity (currently owned)
    if (asset && asset.averageCost && asset.averageCost > 0 && asset.quantity > 0) {
      costBasis += asset.quantity * asset.averageCost;
      assetCount++;
    }
  });

  // STEP 5: Calculate YOC percentages
  // Return null if no valid cost basis (prevents division by zero)
  if (costBasis === 0) {
    return {
      yocGross: null,
      yocNet: null,
      yocDividendsGross: totalGross,
      yocDividendsNet: totalNet,
      yocCostBasis: 0,
      yocAssetCount: 0,
    };
  }

  // Calculate YOC as percentage
  // YOC = (Annualized Dividends / Cost Basis) × 100
  return {
    yocGross: (annualizedGross / costBasis) * 100,
    yocNet: (annualizedNet / costBasis) * 100,
    yocDividendsGross: totalGross,
    yocDividendsNet: totalNet,
    yocCostBasis: costBasis,
    yocAssetCount: assetCount,
  };
}

/**
 * Calculate number of months between two dates (inclusive)
 *
 * @param date1 - End date
 * @param date2 - Start date
 * @returns Number of months including both start and end months
 *
 * @example
 * calculateMonthsDifference(new Date(2025, 11), new Date(2025, 0)) // 12 months (Jan to Dec inclusive)
 */
function calculateMonthsDifference(date1: Date, date2: Date): number {
  const years = date1.getFullYear() - date2.getFullYear();
  const months = date1.getMonth() - date2.getMonth();
  return years * 12 + months + 1; // +1 to include both start and end month
}

/**
 * Get snapshots for a specific time period
 *
 * @param allSnapshots - All available snapshots (including dummy data)
 * @param timePeriod - Time period selector (YTD, 1Y, 3Y, 5Y, ALL, CUSTOM)
 * @param customStartDate - Start date for CUSTOM period
 * @param customEndDate - End date for CUSTOM period
 * @returns Filtered snapshots for the period (excludes dummy data)
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
      // Normalize to first day of month in local timezone to align with snapshot storage format
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
 * Separates dividend income from other income for accurate performance calculations.
 *
 * Dividend income is excluded from netCashFlow because it represents portfolio returns,
 * not external contributions. Including it would distort ROI, CAGR, and TWR calculations.
 *
 * @param userId - User ID for fetching expenses
 * @param startDate - Start date for expense range
 * @param endDate - End date for expense range
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 * @returns Array of monthly cash flow data with separated dividend income
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
      netCashFlow: value.income - value.expenses, // Excludes dividends (they are portfolio returns, not contributions)
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
      netCashFlow: value.income - value.expenses, // Excludes dividends (they are portfolio returns, not contributions)
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
    drawdownDuration: null,
    recoveryTime: null,
    maxDrawdownDate: undefined,
    drawdownPeriod: undefined,
    recoveryPeriod: undefined,
    riskFreeRate,
    dividendCategoryId,
    totalContributions: 0,
    totalWithdrawals: 0,
    netCashFlow: 0,
    totalIncome: 0,
    totalExpenses: 0,
    totalDividendIncome: 0,
    numberOfMonths: 0,
    yocGross: null,
    yocNet: null,
    yocDividendsGross: 0,
    yocDividendsNet: 0,
    yocCostBasis: 0,
    yocAssetCount: 0,
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

  const maxDrawdownResult = calculateMaxDrawdown(sortedSnapshots, cashFlows);

  const drawdownDurationResult = calculateDrawdownDuration(sortedSnapshots, cashFlows);

  const recoveryTimeResult = calculateRecoveryTime(sortedSnapshots, cashFlows);

  const sharpeRatio = timeWeightedReturn !== null && volatility !== null
    ? calculateSharpeRatio(timeWeightedReturn, riskFreeRate, volatility)
    : null;

  // YOC metrics are calculated server-side via API route
  // These fields are populated by the client after fetching from /api/performance/yoc
  const yocMetrics = {
    yocGross: null as number | null,
    yocNet: null as number | null,
    yocDividendsGross: 0,
    yocDividendsNet: 0,
    yocCostBasis: 0,
    yocAssetCount: 0,
  };

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
    maxDrawdown: maxDrawdownResult.value,
    drawdownDuration: drawdownDurationResult.duration,
    recoveryTime: recoveryTimeResult.duration,
    maxDrawdownDate: maxDrawdownResult.troughDate ?? undefined,
    drawdownPeriod: drawdownDurationResult.period ?? undefined,
    recoveryPeriod: recoveryTimeResult.period ?? undefined,
    riskFreeRate,
    dividendCategoryId, // Store for reuse in custom date ranges
    totalContributions,
    totalWithdrawals,
    netCashFlow,
    totalIncome,
    totalExpenses,
    totalDividendIncome,
    numberOfMonths,
    ...yocMetrics,  // Spread YOC fields (will be populated by client via API)
    hasInsufficientData: false,
  };
}

/**
 * Get all performance data for the page
 *
 * Calculates performance metrics for multiple time periods:
 * - YTD, 1Y, 3Y, 5Y, ALL time periods
 * - Rolling 12M and 36M periods
 *
 * @param userId - User ID for fetching data
 * @returns Complete performance data for all periods
 */
export async function getAllPerformanceData(userId: string): Promise<PerformanceData> {
  // ==== STEP 1: Fetch all required data ====
  const [snapshots, settings] = await Promise.all([
    getUserSnapshots(userId),
    getSettings(userId),
  ]);

  const riskFreeRate = settings?.riskFreeRate || 2.5; // Default to 2.5%
  const dividendCategoryId = settings?.dividendIncomeCategoryId; // For separating dividend income

  // ==== STEP 2: Pre-fetch optimization ====
  // Fetch ALL expenses once for the entire history to avoid N Firestore queries
  // This single query is then filtered in-memory for each period calculation
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

  // ==== STEP 3: Calculate metrics for all time periods ====
  const [ytd, oneYear, threeYear, fiveYear, allTime] = await Promise.all([
    calculatePerformanceForPeriod(userId, snapshots, 'YTD', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
    calculatePerformanceForPeriod(userId, snapshots, '1Y', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
    calculatePerformanceForPeriod(userId, snapshots, '3Y', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
    calculatePerformanceForPeriod(userId, snapshots, '5Y', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
    calculatePerformanceForPeriod(userId, snapshots, 'ALL', riskFreeRate, undefined, undefined, allExpenses, dividendCategoryId),
  ]);

  // ==== STEP 4: Calculate rolling periods ====
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
 * Calculates performance metrics for sliding windows of fixed length
 * (e.g., 12-month windows sliding through the entire history).
 *
 * Uses in-memory filtering of pre-fetched expenses to avoid N Firestore queries.
 *
 * @param userId - User ID for data fetching
 * @param allSnapshots - All snapshots (will be filtered for non-dummy data)
 * @param windowMonths - Size of the rolling window in months
 * @param riskFreeRate - Risk-free rate for Sharpe ratio calculation
 * @param dividendCategoryId - Category ID for dividend income (from user settings)
 * @returns Array of rolling period performance data
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

/**
 * Prepare monthly returns heatmap data
 * Calculates month-over-month returns adjusted for cash flows
 *
 * Formula: monthlyReturn = ((current NW - cash flow) / previous NW - 1) × 100
 *
 * @param snapshots - Monthly snapshots (will be sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Array of yearly data with monthly returns
 */
export function prepareMonthlyReturnsHeatmap(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): MonthlyReturnHeatmapData[] {
  if (snapshots.length < 2) return [];

  // Sort snapshots chronologically
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // Create cash flow lookup map (by YYYY-MM)
  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach(cf => {
    const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  // Calculate monthly returns
  const monthlyReturnsMap = new Map<string, number>(); // key: "YYYY-MM", value: return %

  for (let i = 1; i < sortedSnapshots.length; i++) {
    const prevSnapshot = sortedSnapshots[i - 1];
    const currSnapshot = sortedSnapshots[i];

    const startNW = prevSnapshot.totalNetWorth;
    const endNW = currSnapshot.totalNetWorth;

    if (startNW === 0) continue; // Skip if zero starting value

    // Get cash flow for current month
    const cfKey = `${currSnapshot.year}-${String(currSnapshot.month).padStart(2, '0')}`;
    const cashFlow = cashFlowMap.get(cfKey) || 0;

    // Calculate monthly return: (End NW - Cash Flow) / Start NW - 1
    const monthlyReturn = ((endNW - cashFlow) / startNW - 1) * 100;

    monthlyReturnsMap.set(cfKey, monthlyReturn);
  }

  // Group by year and organize by month
  const yearMap = new Map<number, Map<number, number | null>>();

  // Initialize all years found in snapshots
  sortedSnapshots.forEach(snapshot => {
    if (!yearMap.has(snapshot.year)) {
      yearMap.set(snapshot.year, new Map());
    }
  });

  // Populate monthly returns
  monthlyReturnsMap.forEach((returnValue, key) => {
    const [year, month] = key.split('-').map(Number);
    const yearData = yearMap.get(year);
    if (yearData) {
      yearData.set(month, returnValue);
    }
  });

  // Convert to output format
  const heatmapData: MonthlyReturnHeatmapData[] = [];

  Array.from(yearMap.entries())
    .sort((a, b) => a[0] - b[0]) // Sort by year ascending
    .forEach(([year, monthsMap]) => {
      const months = [];
      for (let month = 1; month <= 12; month++) {
        months.push({
          month,
          return: monthsMap.get(month) ?? null, // null if no data for that month
        });
      }

      heatmapData.push({ year, months });
    });

  return heatmapData;
}

/**
 * Prepare underwater drawdown chart data
 * Shows current drawdown from running peak (cash flow adjusted)
 *
 * - Value is 0% when portfolio is at all-time high
 * - Value is negative when portfolio is below previous peak
 *
 * Uses TWR-style adjustment to isolate investment performance
 *
 * @param snapshots - Monthly snapshots (will be sorted chronologically)
 * @param cashFlows - Monthly cash flows
 * @returns Array of underwater drawdown data points
 */
export function prepareUnderwaterDrawdownData(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): UnderwaterDrawdownData[] {
  if (snapshots.length < 1) return [];

  // Sort snapshots chronologically
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  // Create cash flow lookup map (by YYYY-MM) - IDENTICAL to Max Drawdown calculation
  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach(cf => {
    const key = `${cf.date.getFullYear()}-${String(cf.date.getMonth() + 1).padStart(2, '0')}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  // Calculate adjusted portfolio values (subtract cumulative contributions)
  let cumulativeCashFlow = 0;
  const adjustedValues: { value: number; snapshot: MonthlySnapshot }[] = [];

  for (const snapshot of sortedSnapshots) {
    const cfKey = `${snapshot.year}-${String(snapshot.month).padStart(2, '0')}`;
    cumulativeCashFlow += cashFlowMap.get(cfKey) || 0;

    // TWR-style adjustment: isolate investment performance
    const adjustedValue = snapshot.totalNetWorth - cumulativeCashFlow;
    adjustedValues.push({ value: adjustedValue, snapshot });
  }

  // Track running peak and calculate drawdown at each point
  let runningPeak = adjustedValues[0].value;
  const underwaterData: UnderwaterDrawdownData[] = [];

  for (const { value, snapshot } of adjustedValues) {
    // Update peak if new high is reached
    if (value > runningPeak) {
      runningPeak = value;
    }

    // Calculate current drawdown from peak
    let drawdown = 0; // Default to 0% (at peak)
    if (runningPeak > 0 && value < runningPeak) {
      drawdown = ((value - runningPeak) / runningPeak) * 100; // Negative value
    }

    underwaterData.push({
      date: `${String(snapshot.month).padStart(2, '0')}/${String(snapshot.year).slice(-2)}`,
      drawdown: Math.min(0, drawdown), // Ensure ≤ 0
      year: snapshot.year,
      month: snapshot.month,
    });
  }

  return underwaterData;
}
