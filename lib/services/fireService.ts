import { Expense } from '@/types/expenses';
import { MonthlySnapshot, FIREProjectionScenarios, FIREProjectionYearData, FIREProjectionResult } from '@/types/assets';
import { getExpensesByDateRange, calculateTotalExpenses, calculateTotalIncome } from './expenseService';
import { getUserSnapshots } from './snapshotService';

export interface FIREMetrics {
  // Input values
  currentNetWorth: number;
  annualExpenses: number;
  withdrawalRate: number;

  // Calculated values
  fireNumber: number;
  progressToFI: number; // Percentage
  annualAllowance: number; // Annual withdrawal allowance based on safe withdrawal rate
  monthlyAllowance: number; // Monthly withdrawal allowance (annualAllowance / 12)
  dailyAllowance: number; // Daily withdrawal allowance (annualAllowance / 365)
  currentWR: number; // Current withdrawal rate
  yearsOfExpenses: number; // Years of expenses covered by current net worth
}

export interface PlannedFIREMetrics {
  // Input values
  plannedAnnualExpenses: number;
  withdrawalRate: number;

  // Calculated values
  plannedFireNumber: number;
  plannedProgressToFI: number; // Percentage
}

export interface MonthlyFIREData {
  year: number;
  month: number;
  monthLabel: string;
  income: number;
  expenses: number;
  monthlyAllowance: number;
  netWorth: number;
}

/**
 * Calculate annual expenses for current year (January 1st to December 31st)
 */
export async function getAnnualExpenses(userId: string): Promise<number> {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startDate = new Date(currentYear, 0, 1); // January 1st
    const endDate = new Date(currentYear, 11, 31, 23, 59, 59, 999); // December 31st

    const expenses = await getExpensesByDateRange(userId, startDate, endDate);
    return calculateTotalExpenses(expenses);
  } catch (error) {
    console.error('Error calculating annual expenses:', error);
    throw new Error('Failed to calculate annual expenses');
  }
}

/**
 * Calculate annual income for current year (January 1st to today)
 */
export async function getAnnualIncome(userId: string): Promise<number> {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const startDate = new Date(currentYear, 0, 1); // January 1st
    const endDate = now;

    const expenses = await getExpensesByDateRange(userId, startDate, endDate);
    return calculateTotalIncome(expenses);
  } catch (error) {
    console.error('Error calculating annual income:', error);
    throw new Error('Failed to calculate annual income');
  }
}

/**
 * Calculate FIRE metrics based on current data
 */
export function calculateFIREMetrics(
  currentNetWorth: number,
  annualExpenses: number,
  withdrawalRate: number
): FIREMetrics {
  // FIRE Number = Annual Expenses / Withdrawal Rate (as decimal)
  const wrDecimal = withdrawalRate / 100;
  const fireNumber = wrDecimal > 0 ? annualExpenses / wrDecimal : 0;

  // Progress to FI = (Current Net Worth / FIRE Number) * 100
  const progressToFI = fireNumber > 0 ? (currentNetWorth / fireNumber) * 100 : 0;

  // Annual Allowance = Current Net Worth * Withdrawal Rate
  const annualAllowance = currentNetWorth * wrDecimal;

  // Monthly Allowance = Annual Allowance / 12
  const monthlyAllowance = annualAllowance / 12;

  // Daily Allowance = Annual Allowance / 365
  const dailyAllowance = annualAllowance / 365;

  // Current WR = (Annual Expenses / Current Net Worth) * 100
  const currentWR = currentNetWorth > 0 ? (annualExpenses / currentNetWorth) * 100 : 0;

  // Years of Expenses = 1 / Current WR (as decimal)
  const currentWRDecimal = currentWR / 100;
  const yearsOfExpenses = currentWRDecimal > 0 ? 1 / currentWRDecimal : 0;

  return {
    currentNetWorth,
    annualExpenses,
    withdrawalRate,
    fireNumber,
    progressToFI,
    annualAllowance,
    monthlyAllowance,
    dailyAllowance,
    currentWR,
    yearsOfExpenses,
  };
}

/**
 * Calculate planned FIRE metrics based on user-provided planned annual expenses
 */
export function calculatePlannedFIREMetrics(
  currentNetWorth: number,
  plannedAnnualExpenses: number,
  withdrawalRate: number
): PlannedFIREMetrics {
  // Planned FIRE Number = Planned Annual Expenses / Withdrawal Rate (as decimal)
  const wrDecimal = withdrawalRate / 100;
  const plannedFireNumber = wrDecimal > 0 ? plannedAnnualExpenses / wrDecimal : 0;

  // Planned Progress to FI = (Current Net Worth / Planned FIRE Number) * 100
  const plannedProgressToFI = plannedFireNumber > 0 ? (currentNetWorth / plannedFireNumber) * 100 : 0;

  return {
    plannedAnnualExpenses,
    withdrawalRate,
    plannedFireNumber,
    plannedProgressToFI,
  };
}

/**
 * Get expenses for a specific month
 */
async function getMonthlyExpenses(userId: string, year: number, month: number): Promise<{ income: number; expenses: number }> {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const expensesList = await getExpensesByDateRange(userId, startDate, endDate);
    const income = calculateTotalIncome(expensesList);
    const expenses = calculateTotalExpenses(expensesList);

    return { income, expenses };
  } catch (error) {
    console.error(`Error getting monthly expenses for ${year}-${month}:`, error);
    return { income: 0, expenses: 0 };
  }
}

/**
 * Prepare data for FIRE chart (income, expenses, monthly allowance evolution)
 */
export async function prepareFIREChartData(
  userId: string,
  snapshots: MonthlySnapshot[],
  withdrawalRate: number
): Promise<MonthlyFIREData[]> {
  try {
    const wrDecimal = withdrawalRate / 100;
    const chartData: MonthlyFIREData[] = [];

    // Sort snapshots by date
    const sortedSnapshots = [...snapshots].sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    // For each snapshot, get the corresponding month's expenses and income
    for (const snapshot of sortedSnapshots) {
      const { income, expenses } = await getMonthlyExpenses(userId, snapshot.year, snapshot.month);

      // Calculate monthly allowance based on snapshot net worth
      const monthlyAllowance = (snapshot.totalNetWorth * wrDecimal) / 12;

      const monthLabel = `${snapshot.month.toString().padStart(2, '0')}/${snapshot.year}`;

      chartData.push({
        year: snapshot.year,
        month: snapshot.month,
        monthLabel,
        income,
        expenses,
        monthlyAllowance,
        netWorth: snapshot.totalNetWorth,
      });
    }

    return chartData;
  } catch (error) {
    console.error('Error preparing FIRE chart data:', error);
    throw new Error('Failed to prepare FIRE chart data');
  }
}

/**
 * Get all FIRE data for the user (metrics + chart data)
 */
export async function getFIREData(
  userId: string,
  currentNetWorth: number,
  withdrawalRate: number
): Promise<{
  metrics: FIREMetrics;
  chartData: MonthlyFIREData[];
}> {
  try {
    // Get annual expenses
    const annualExpenses = await getAnnualExpenses(userId);

    // Calculate metrics
    const metrics = calculateFIREMetrics(currentNetWorth, annualExpenses, withdrawalRate);

    // Get snapshots for chart
    const snapshots = await getUserSnapshots(userId);

    // Prepare chart data
    const chartData = await prepareFIREChartData(userId, snapshots, withdrawalRate);

    return {
      metrics,
      chartData,
    };
  } catch (error) {
    console.error('Error getting FIRE data:', error);
    throw new Error('Failed to get FIRE data');
  }
}

/**
 * Calculate annual cashflow data for FIRE projections.
 *
 * Returns both annual savings and annual expenses from the same data source
 * for consistency. Uses the most recent complete calendar year (e.g., 2025
 * if current year is 2026). Falls back to current year annualized if no
 * prior year data exists.
 *
 * Why both from the same source: savings and expenses must come from the same
 * period to avoid inconsistencies (e.g., current year expenses with last year savings).
 */
export interface AnnualCashflowData {
  annualSavings: number;  // Net savings (income - expenses), clamped to 0 minimum
  annualExpensesFromCashflow: number; // Total expenses from the reference year
  referenceYear: number;  // Which year the data comes from
  isAnnualized: boolean;  // True if current year data was scaled to full year
}

export async function getAnnualCashflowData(userId: string): Promise<AnnualCashflowData> {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const lastYear = currentYear - 1;

    // Try last complete calendar year first
    const lastYearStart = new Date(lastYear, 0, 1);
    const lastYearEnd = new Date(lastYear, 11, 31, 23, 59, 59, 999);
    const lastYearExpenses = await getExpensesByDateRange(userId, lastYearStart, lastYearEnd);

    if (lastYearExpenses.length > 0) {
      const income = calculateTotalIncome(lastYearExpenses);
      const expenses = calculateTotalExpenses(lastYearExpenses);
      return {
        annualSavings: Math.max(income - expenses, 0),
        annualExpensesFromCashflow: expenses,
        referenceYear: lastYear,
        isAnnualized: false,
      };
    }

    // Fallback: annualize current year data
    const currentYearStart = new Date(currentYear, 0, 1);
    const currentYearExpenses = await getExpensesByDateRange(userId, currentYearStart, now);

    if (currentYearExpenses.length === 0) {
      return { annualSavings: 0, annualExpensesFromCashflow: 0, referenceYear: currentYear, isAnnualized: true };
    }

    const income = calculateTotalIncome(currentYearExpenses);
    const expenses = calculateTotalExpenses(currentYearExpenses);
    const savings = income - expenses;

    // Annualize: scale partial year to full year
    const monthsElapsed = now.getMonth() + 1;
    return {
      annualSavings: Math.max((savings / monthsElapsed) * 12, 0),
      annualExpensesFromCashflow: (expenses / monthsElapsed) * 12,
      referenceYear: currentYear,
      isAnnualized: true,
    };
  } catch (error) {
    console.error('Error calculating annual cashflow data:', error);
    return { annualSavings: 0, annualExpensesFromCashflow: 0, referenceYear: new Date().getFullYear(), isAnnualized: true };
  }
}

/**
 * Default scenario parameters for FIRE projections.
 * Bear: conservative growth with higher inflation (stagflation-like).
 * Base: historical average returns with moderate inflation.
 * Bull: strong growth with low inflation (Goldilocks economy).
 */
export function getDefaultScenarios(): FIREProjectionScenarios {
  return {
    bear: { growthRate: 4.0, inflationRate: 3.5 },
    base: { growthRate: 7.0, inflationRate: 2.5 },
    bull: { growthRate: 10.0, inflationRate: 1.5 },
  };
}

/**
 * Project portfolio growth under three market scenarios (Bear/Base/Bull).
 *
 * Each scenario applies its own growth rate and inflation rate yearly.
 * Expenses grow with each scenario's inflation, making the FIRE Number
 * a moving target. Annual savings are added nominally (not inflation-adjusted)
 * as a conservative assumption.
 *
 * Algorithm per year per scenario:
 *   1. Apply growth:    portfolio *= (1 + growthRate)
 *   2. Add savings:     portfolio += annualSavings
 *   3. Inflate expenses: expenses *= (1 + inflationRate)
 *   4. FIRE Number:     expenses / (withdrawalRate / 100)
 *   5. Check:           portfolio >= FIRE Number → FIRE reached
 *
 * The chart shows base scenario's FIRE Number as single reference line.
 */
export function calculateFIREProjection(
  initialNetWorth: number,
  annualExpenses: number,
  annualSavings: number,
  withdrawalRate: number,
  scenarios: FIREProjectionScenarios,
  maxYears: number = 50
): FIREProjectionResult {
  const wrDecimal = withdrawalRate / 100;
  const currentYear = new Date().getFullYear();

  const yearlyData: FIREProjectionYearData[] = [];
  let bearYearsToFIRE: number | null = null;
  let baseYearsToFIRE: number | null = null;
  let bullYearsToFIRE: number | null = null;

  // Track portfolio and expenses per scenario independently
  let bearNW = initialNetWorth;
  let baseNW = initialNetWorth;
  let bullNW = initialNetWorth;
  let bearExpenses = annualExpenses;
  let baseExpenses = annualExpenses;
  let bullExpenses = annualExpenses;

  for (let year = 1; year <= maxYears; year++) {
    // Step 1: Apply market growth
    bearNW *= (1 + scenarios.bear.growthRate / 100);
    baseNW *= (1 + scenarios.base.growthRate / 100);
    bullNW *= (1 + scenarios.bull.growthRate / 100);

    // Step 2: Add annual savings
    bearNW += annualSavings;
    baseNW += annualSavings;
    bullNW += annualSavings;

    // Step 3: Inflate expenses per scenario
    bearExpenses *= (1 + scenarios.bear.inflationRate / 100);
    baseExpenses *= (1 + scenarios.base.inflationRate / 100);
    bullExpenses *= (1 + scenarios.bull.inflationRate / 100);

    // Step 4: Calculate FIRE Number per scenario
    const bearFireNumber = wrDecimal > 0 ? bearExpenses / wrDecimal : 0;
    const baseFireNumber = wrDecimal > 0 ? baseExpenses / wrDecimal : 0;
    const bullFireNumber = wrDecimal > 0 ? bullExpenses / wrDecimal : 0;

    // Step 5: Check FIRE reached
    const bearReached = bearNW >= bearFireNumber;
    const baseReached = baseNW >= baseFireNumber;
    const bullReached = bullNW >= bullFireNumber;

    if (bearReached && bearYearsToFIRE === null) bearYearsToFIRE = year;
    if (baseReached && baseYearsToFIRE === null) baseYearsToFIRE = year;
    if (bullReached && bullYearsToFIRE === null) bullYearsToFIRE = year;

    yearlyData.push({
      year,
      calendarYear: currentYear + year,
      bearNetWorth: Math.round(bearNW),
      baseNetWorth: Math.round(baseNW),
      bullNetWorth: Math.round(bullNW),
      baseExpenses: Math.round(baseExpenses),
      baseFireNumber: Math.round(baseFireNumber),
      bearFireReached: bearReached,
      baseFireReached: baseReached,
      bullFireReached: bullReached,
    });

    // Stop early if all scenarios reached FIRE
    if (bearYearsToFIRE !== null && baseYearsToFIRE !== null && bullYearsToFIRE !== null) {
      // Add a few more years to show post-FIRE growth in chart
      if (year >= Math.max(bearYearsToFIRE, baseYearsToFIRE, bullYearsToFIRE) + 5) break;
    }
  }

  return {
    yearlyData,
    bearYearsToFIRE,
    baseYearsToFIRE,
    bullYearsToFIRE,
    annualSavings,
    initialNetWorth,
    initialExpenses: annualExpenses,
    scenarios,
  };
}
