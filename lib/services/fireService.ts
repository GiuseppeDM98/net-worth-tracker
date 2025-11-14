import { Expense } from '@/types/expenses';
import { MonthlySnapshot } from '@/types/assets';
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
  annualAllowance: number; // Indennità annuale
  monthlyAllowance: number; // Indennità mensile
  dailyAllowance: number; // Indennità giornaliera
  currentWR: number; // Current withdrawal rate
  yearsOfExpenses: number; // Anni di spesa
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
