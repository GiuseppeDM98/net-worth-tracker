import { MonthlySnapshot, FIREProjectionScenarios, FIREProjectionYearData, FIREProjectionResult } from '@/types/assets';
import { Expense } from '@/types/expenses';
import { MONTH_NAMES } from '@/lib/constants/months';
import { getItalyMonth, getItalyMonthYear, getItalyYear } from '@/lib/utils/dateHelpers';
import { calculateTotalExpenses, calculateTotalIncome, getExpensesByDateRange } from './expenseService';
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

  // Liquid/illiquid breakdown (0 when not provided)
  liquidNetWorth: number;
  illiquidNetWorth: number;
  liquidAnnualAllowance: number;
  illiquidAnnualAllowance: number;
  liquidYearsOfExpenses: number; // Years covered by liquid assets only (most actionable — no asset sales needed)
  illiquidYearsOfExpenses: number; // Years covered by illiquid assets only
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

export interface HistoricalFIRERunwayPoint {
  year: number;
  month: number;
  monthLabel: string;
  trailing12mExpenses: number;
  fireNetWorthUsed: number;
  liquidNetWorth: number;
  yearsOfExpenses: number | null;
  liquidYearsOfExpenses: number | null;
  fireProgressToFI: number | null;
  targetYearsOfExpenses: number | null;
}

export interface HistoricalFIRERunwaySummary {
  currentMonthLabel: string | null;
  currentYearsOfExpenses: number | null;
  currentLiquidYearsOfExpenses: number | null;
  totalDeltaVs12Months: number | null;
  liquidDeltaVs12Months: number | null;
  currentProgressToFI: number | null;
  targetYearsOfExpenses: number | null;
}

export interface FIRESensitivityCell {
  annualExpenses: number;
  annualSavings: number;
  yearsToFIRE: number | null;
  isBaseline: boolean;
  relationToBaseline: 'baseline' | 'better' | 'worse' | 'neutral';
}

export interface FIRESensitivityColumn {
  annualSavings: number;
  label: string;
  isBaseline: boolean;
}

export interface FIRESensitivityRow {
  annualExpenses: number;
  multiplier: number;
  label: string;
  cells: FIRESensitivityCell[];
}

export interface FIRESensitivityMatrix {
  columns: FIRESensitivityColumn[];
  rows: FIRESensitivityRow[];
  baselineAnnualExpenses: number;
  baselineAnnualSavings: number;
  baselineYearsToFIRE: number | null;
}

export interface CoastFIREMetrics {
  yearsToRetirement: number;
  fireNumberAtRetirement: number;
  coastFireNumberToday: number;
  progressToCoastFI: number;
  gapToCoastFI: number;
  futureValueAtRetirementWithoutNewContributions: number;
  isCoastReached: boolean;
}

export interface CoastFIREScenarioMetrics extends CoastFIREMetrics {
  scenarioKey: 'bear' | 'base' | 'bull';
  label: string;
  realReturnRate: number;
}

export interface CoastFIREProjectionPoint {
  yearOffset: number;
  calendarYear: number;
  age: number;
  bearPortfolioValue: number;
  basePortfolioValue: number;
  bullPortfolioValue: number;
  fireNumberTarget: number;
}

export interface CoastFIREProjectionResult {
  currentAge: number;
  retirementAge: number;
  annualExpenses: number;
  withdrawalRate: number;
  currentNetWorth: number;
  scenarios: {
    bear: CoastFIREScenarioMetrics;
    base: CoastFIREScenarioMetrics;
    bull: CoastFIREScenarioMetrics;
  };
  projectionData: CoastFIREProjectionPoint[];
}

interface MonthlyExpenseAggregate {
  income: number;
  expenses: number;
}

const EXPENSE_MULTIPLIERS = [0.8, 0.9, 1.0, 1.1, 1.2] as const;
const SAVINGS_MULTIPLIERS = [0.75, 1.0, 1.25, 1.5] as const;
const SAVINGS_FALLBACK_VALUES = [0, 5000, 10000, 20000] as const;

function getYearMonthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function formatSnapshotMonthLabel(year: number, month: number): string {
  return `${month.toString().padStart(2, '0')}/${year}`;
}

function formatMonthMultiplier(multiplier: number): string {
  const percentage = Math.round((multiplier - 1) * 100);
  if (percentage === 0) return 'Base';
  return percentage > 0 ? `+${percentage}%` : `${percentage}%`;
}

function formatSavingsColumnLabel(amount: number): string {
  if (amount === 0) return '€0';
  if (amount % 1000 === 0) return `€${amount / 1000}k`;
  return `€${Math.round(amount)}`;
}

function growValueByRealReturn(value: number, realReturnRate: number, years: number): number {
  if (years <= 0) return value;
  return value * Math.pow(1 + (realReturnRate / 100), years);
}

function roundRunwayYears(value: number): number {
  return Math.round(value * 10) / 10;
}

function calculateRunwayDelta(
  latestValue: number | null | undefined,
  comparisonValue: number | null | undefined
): number | null {
  if (
    latestValue === null ||
    latestValue === undefined ||
    comparisonValue === null ||
    comparisonValue === undefined
  ) {
    return null;
  }

  // Keep the summary delta consistent with the one-decimal values shown in the cards/chart tooltips.
  return roundRunwayYears(roundRunwayYears(latestValue) - roundRunwayYears(comparisonValue));
}

function getMonthStartDate(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

function getMonthEndDate(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function shiftMonth(year: number, month: number, deltaMonths: number): { year: number; month: number } {
  const shifted = new Date(year, month - 1 + deltaMonths, 1);
  return {
    year: shifted.getFullYear(),
    month: shifted.getMonth() + 1,
  };
}

function getFireNetWorthForSnapshot(snapshot: MonthlySnapshot, includePrimaryResidence: boolean): number {
  return includePrimaryResidence
    ? snapshot.totalNetWorth
    : (snapshot.fireNetWorth ?? snapshot.totalNetWorth);
}

function buildMonthlyExpenseBuckets(expenses: Expense[]): Map<string, MonthlyExpenseAggregate> {
  const buckets = new Map<string, MonthlyExpenseAggregate>();

  expenses.forEach((expense) => {
    const year = getItalyYear(expense.date);
    const month = getItalyMonth(expense.date);
    const key = getYearMonthKey(year, month);
    const current = buckets.get(key) ?? { income: 0, expenses: 0 };

    if (expense.type === 'income') {
      current.income += expense.amount;
    } else {
      current.expenses += expense.amount;
    }

    buckets.set(key, current);
  });

  return buckets;
}

function prepareFIREChartData(
  snapshots: MonthlySnapshot[],
  monthlyExpenseBuckets: Map<string, MonthlyExpenseAggregate>,
  withdrawalRate: number,
  includePrimaryResidence: boolean = false
): MonthlyFIREData[] {
  const wrDecimal = withdrawalRate / 100;
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  return sortedSnapshots.map((snapshot) => {
    const bucket = monthlyExpenseBuckets.get(getYearMonthKey(snapshot.year, snapshot.month));
    const netWorthForAllowance = getFireNetWorthForSnapshot(snapshot, includePrimaryResidence);

    return {
      year: snapshot.year,
      month: snapshot.month,
      monthLabel: formatSnapshotMonthLabel(snapshot.year, snapshot.month),
      income: bucket?.income ?? 0,
      expenses: Math.abs(bucket?.expenses ?? 0),
      monthlyAllowance: (netWorthForAllowance * wrDecimal) / 12,
      netWorth: netWorthForAllowance,
    };
  });
}

export function calculateHistoricalFIRERunway(
  snapshots: MonthlySnapshot[],
  monthlyExpenseBuckets: Map<string, MonthlyExpenseAggregate>,
  withdrawalRate: number,
  includePrimaryResidence: boolean = false
): {
  runwayData: HistoricalFIRERunwayPoint[];
  runwaySummary: HistoricalFIRERunwaySummary;
} {
  const sortedSnapshots = [...snapshots].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  const targetYearsOfExpenses = withdrawalRate > 0 ? 100 / withdrawalRate : null;
  const runwayData: HistoricalFIRERunwayPoint[] = [];

  for (const [index, snapshot] of sortedSnapshots.entries()) {
    if (index < 11) {
      continue;
    }

    const trailingMonths: number[] = [];

    for (let offset = 0; offset < 12; offset++) {
      const targetMonth = shiftMonth(snapshot.year, snapshot.month, -offset);
      const bucket = monthlyExpenseBuckets.get(getYearMonthKey(targetMonth.year, targetMonth.month));
      trailingMonths.push(Math.abs(bucket?.expenses ?? 0));
    }

    if (trailingMonths.length !== 12) {
      continue;
    }

    const trailing12mExpenses = trailingMonths.reduce((sum, value) => sum + value, 0);
    const fireNetWorthUsed = getFireNetWorthForSnapshot(snapshot, includePrimaryResidence);
    const yearsOfExpenses = trailing12mExpenses > 0 ? fireNetWorthUsed / trailing12mExpenses : null;
    const liquidYearsOfExpenses = trailing12mExpenses > 0 ? snapshot.liquidNetWorth / trailing12mExpenses : null;
    const fireProgressToFI =
      trailing12mExpenses > 0 && withdrawalRate > 0
        ? (fireNetWorthUsed / (trailing12mExpenses / (withdrawalRate / 100))) * 100
        : null;

    runwayData.push({
      year: snapshot.year,
      month: snapshot.month,
      monthLabel: formatSnapshotMonthLabel(snapshot.year, snapshot.month),
      trailing12mExpenses,
      fireNetWorthUsed,
      liquidNetWorth: snapshot.liquidNetWorth,
      yearsOfExpenses,
      liquidYearsOfExpenses,
      fireProgressToFI,
      targetYearsOfExpenses,
    });
  }

  const latestPoint = runwayData[runwayData.length - 1] ?? null;
  const comparisonPoint = latestPoint
    ? runwayData.find((point) => point.year === latestPoint.year - 1 && point.month === latestPoint.month) ?? null
    : null;

  return {
    runwayData,
    runwaySummary: {
      currentMonthLabel: latestPoint?.monthLabel ?? null,
      currentYearsOfExpenses: latestPoint?.yearsOfExpenses ?? null,
      currentLiquidYearsOfExpenses: latestPoint?.liquidYearsOfExpenses ?? null,
      totalDeltaVs12Months: calculateRunwayDelta(
        latestPoint?.yearsOfExpenses,
        comparisonPoint?.yearsOfExpenses
      ),
      liquidDeltaVs12Months: calculateRunwayDelta(
        latestPoint?.liquidYearsOfExpenses,
        comparisonPoint?.liquidYearsOfExpenses
      ),
      currentProgressToFI: latestPoint?.fireProgressToFI ?? null,
      targetYearsOfExpenses: latestPoint?.targetYearsOfExpenses ?? targetYearsOfExpenses,
    },
  };
}

/**
 * Calculate annual expenses for the last fully completed year.
 *
 * Why last year instead of current year? Using the current year mid-period (e.g., March)
 * gives only 3 months of data, which dramatically understates annual spending and makes
 * FIRE metrics like "years of expenses" misleading. The last full year is the most
 * representative baseline for planning purposes.
 */
export async function getAnnualExpenses(userId: string): Promise<number> {
  try {
    const { year: currentYear } = getItalyMonthYear();
    const lastYear = currentYear - 1;
    const startDate = new Date(lastYear, 0, 1);
    const endDate = new Date(lastYear, 11, 31, 23, 59, 59, 999);

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
    const { year: currentYear } = getItalyMonthYear(now);
    const startDate = new Date(currentYear, 0, 1);

    const expenses = await getExpensesByDateRange(userId, startDate, now);
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
  withdrawalRate: number,
  liquidNetWorth: number = 0,
  illiquidNetWorth: number = 0
): FIREMetrics {
  const wrDecimal = withdrawalRate / 100;
  const fireNumber = wrDecimal > 0 ? annualExpenses / wrDecimal : 0;
  const progressToFI = fireNumber > 0 ? (currentNetWorth / fireNumber) * 100 : 0;
  const annualAllowance = currentNetWorth * wrDecimal;
  const monthlyAllowance = annualAllowance / 12;
  const dailyAllowance = annualAllowance / 365;
  const currentWR = currentNetWorth > 0 ? (annualExpenses / currentNetWorth) * 100 : 0;
  const currentWRDecimal = currentWR / 100;
  const yearsOfExpenses = currentWRDecimal > 0 ? 1 / currentWRDecimal : 0;
  const liquidAnnualAllowance = liquidNetWorth * wrDecimal;
  const illiquidAnnualAllowance = illiquidNetWorth * wrDecimal;
  const liquidYearsOfExpenses = liquidNetWorth > 0 && annualExpenses > 0 ? liquidNetWorth / annualExpenses : 0;
  const illiquidYearsOfExpenses = illiquidNetWorth > 0 && annualExpenses > 0 ? illiquidNetWorth / annualExpenses : 0;

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
    liquidNetWorth,
    illiquidNetWorth,
    liquidAnnualAllowance,
    illiquidAnnualAllowance,
    liquidYearsOfExpenses,
    illiquidYearsOfExpenses,
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
  const wrDecimal = withdrawalRate / 100;
  const plannedFireNumber = wrDecimal > 0 ? plannedAnnualExpenses / wrDecimal : 0;
  const plannedProgressToFI = plannedFireNumber > 0 ? (currentNetWorth / plannedFireNumber) * 100 : 0;

  return {
    plannedAnnualExpenses,
    withdrawalRate,
    plannedFireNumber,
    plannedProgressToFI,
  };
}

/**
 * Get all FIRE data for the user (metrics + chart data + runway data)
 */
export async function getFIREData(
  userId: string,
  currentNetWorth: number,
  withdrawalRate: number,
  includePrimaryResidence: boolean = false
): Promise<{
  metrics: FIREMetrics;
  chartData: MonthlyFIREData[];
  runwayData: HistoricalFIRERunwayPoint[];
  runwaySummary: HistoricalFIRERunwaySummary;
}> {
  try {
    const [annualExpenses, snapshots] = await Promise.all([
      getAnnualExpenses(userId),
      getUserSnapshots(userId),
    ]);

    const metrics = calculateFIREMetrics(currentNetWorth, annualExpenses, withdrawalRate);

    if (snapshots.length === 0) {
      return {
        metrics,
        chartData: [],
        runwayData: [],
        runwaySummary: {
          currentMonthLabel: null,
          currentYearsOfExpenses: null,
          currentLiquidYearsOfExpenses: null,
          totalDeltaVs12Months: null,
          liquidDeltaVs12Months: null,
          currentProgressToFI: null,
          targetYearsOfExpenses: withdrawalRate > 0 ? 100 / withdrawalRate : null,
        },
      };
    }

    const firstSnapshot = snapshots[0];
    const lastSnapshot = snapshots[snapshots.length - 1];
    const expenseWindowStart = shiftMonth(firstSnapshot.year, firstSnapshot.month, -11);
    const expenseRangeStart = getMonthStartDate(expenseWindowStart.year, expenseWindowStart.month);
    const expenseRangeEnd = getMonthEndDate(lastSnapshot.year, lastSnapshot.month);
    const expenses = await getExpensesByDateRange(userId, expenseRangeStart, expenseRangeEnd);
    const monthlyExpenseBuckets = buildMonthlyExpenseBuckets(expenses);

    const chartData = prepareFIREChartData(snapshots, monthlyExpenseBuckets, withdrawalRate, includePrimaryResidence);
    const { runwayData, runwaySummary } = calculateHistoricalFIRERunway(
      snapshots,
      monthlyExpenseBuckets,
      withdrawalRate,
      includePrimaryResidence
    );

    return {
      metrics,
      chartData,
      runwayData,
      runwaySummary,
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
  annualSavings: number; // Net savings (income - expenses), clamped to 0 minimum
  annualExpensesFromCashflow: number; // Total expenses from the reference year
  referenceYear: number; // Which year the data comes from
  isAnnualized: boolean; // True if current year data was scaled to full year
}

export async function getAnnualCashflowData(userId: string): Promise<AnnualCashflowData> {
  try {
    const now = new Date();
    const { year: currentYear } = getItalyMonthYear(now);
    const lastYear = currentYear - 1;

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

    const currentYearStart = new Date(currentYear, 0, 1);
    const currentYearExpenses = await getExpensesByDateRange(userId, currentYearStart, now);

    if (currentYearExpenses.length === 0) {
      return { annualSavings: 0, annualExpensesFromCashflow: 0, referenceYear: currentYear, isAnnualized: true };
    }

    const income = calculateTotalIncome(currentYearExpenses);
    const expenses = calculateTotalExpenses(currentYearExpenses);
    const savings = income - expenses;
    const monthsElapsed = Math.max(getItalyMonth(now), 1);

    return {
      annualSavings: Math.max((savings / monthsElapsed) * 12, 0),
      annualExpensesFromCashflow: (expenses / monthsElapsed) * 12,
      referenceYear: currentYear,
      isAnnualized: true,
    };
  } catch (error) {
    console.error('Error calculating annual cashflow data:', error);
    return { annualSavings: 0, annualExpensesFromCashflow: 0, referenceYear: getItalyYear(), isAnnualized: true };
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
 * Calculates the Coast FIRE threshold for one scenario using real returns.
 *
 * Coast FIRE answers a specific question: if the user stopped making new
 * retirement contributions today, would the current FIRE-eligible patrimonio
 * still compound enough to reach the full retirement FIRE number by the target
 * retirement age?
 */
export function calculateCoastFIREMetrics(
  currentNetWorth: number,
  annualExpenses: number,
  withdrawalRate: number,
  currentAge: number,
  retirementAge: number,
  realReturnRate: number
): CoastFIREMetrics {
  const yearsToRetirement = Math.max(retirementAge - currentAge, 0);
  const wrDecimal = withdrawalRate / 100;
  const fireNumberAtRetirement = wrDecimal > 0 ? annualExpenses / wrDecimal : 0;
  const coastFireNumberToday =
    yearsToRetirement === 0
      ? fireNumberAtRetirement
      : fireNumberAtRetirement / Math.pow(1 + (realReturnRate / 100), yearsToRetirement);
  const futureValueAtRetirementWithoutNewContributions = growValueByRealReturn(
    currentNetWorth,
    realReturnRate,
    yearsToRetirement
  );
  const progressToCoastFI =
    coastFireNumberToday > 0 ? (currentNetWorth / coastFireNumberToday) * 100 : 0;
  const gapToCoastFI = Math.max(coastFireNumberToday - currentNetWorth, 0);

  return {
    yearsToRetirement,
    fireNumberAtRetirement,
    coastFireNumberToday,
    progressToCoastFI,
    gapToCoastFI,
    futureValueAtRetirementWithoutNewContributions,
    isCoastReached: currentNetWorth >= coastFireNumberToday,
  };
}

/**
 * Builds the 3-scenario Coast FIRE summary from the existing FIRE scenario settings.
 *
 * Reusing Bear/Base/Bull keeps Coast FIRE aligned with the deterministic
 * projection model the user already configures elsewhere in the FIRE area.
 * Each scenario converts nominal growth and inflation into a single real-return
 * assumption because the Coast FIRE math is expressed in today's money.
 */
export function calculateCoastFIREProjection(
  currentNetWorth: number,
  annualExpenses: number,
  withdrawalRate: number,
  currentAge: number,
  retirementAge: number,
  scenarios: FIREProjectionScenarios
): CoastFIREProjectionResult {
  const currentYear = getItalyYear();
  const bearRealReturn = scenarios.bear.growthRate - scenarios.bear.inflationRate;
  const baseRealReturn = scenarios.base.growthRate - scenarios.base.inflationRate;
  const bullRealReturn = scenarios.bull.growthRate - scenarios.bull.inflationRate;

  const result = {
    bear: {
      scenarioKey: 'bear' as const,
      label: 'Scenario Orso',
      realReturnRate: bearRealReturn,
      ...calculateCoastFIREMetrics(
        currentNetWorth,
        annualExpenses,
        withdrawalRate,
        currentAge,
        retirementAge,
        bearRealReturn
      ),
    },
    base: {
      scenarioKey: 'base' as const,
      label: 'Scenario Base',
      realReturnRate: baseRealReturn,
      ...calculateCoastFIREMetrics(
        currentNetWorth,
        annualExpenses,
        withdrawalRate,
        currentAge,
        retirementAge,
        baseRealReturn
      ),
    },
    bull: {
      scenarioKey: 'bull' as const,
      label: 'Scenario Toro',
      realReturnRate: bullRealReturn,
      ...calculateCoastFIREMetrics(
        currentNetWorth,
        annualExpenses,
        withdrawalRate,
        currentAge,
        retirementAge,
        bullRealReturn
      ),
    },
  };

  const maxYears = Math.max(retirementAge - currentAge, 0);
  const fireNumberTarget = result.base.fireNumberAtRetirement;
  const projectionData: CoastFIREProjectionPoint[] = Array.from(
    { length: maxYears + 1 },
    (_, index) => ({
      yearOffset: index,
      calendarYear: currentYear + index,
      age: currentAge + index,
      bearPortfolioValue: growValueByRealReturn(currentNetWorth, bearRealReturn, index),
      basePortfolioValue: growValueByRealReturn(currentNetWorth, baseRealReturn, index),
      bullPortfolioValue: growValueByRealReturn(currentNetWorth, bullRealReturn, index),
      fireNumberTarget,
    })
  );

  return {
    currentAge,
    retirementAge,
    annualExpenses,
    withdrawalRate,
    currentNetWorth,
    scenarios: result,
    projectionData,
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
 * All 3 scenarios' FIRE Numbers are tracked and displayed in chart/table.
 * Savings stop for a scenario once it reaches FIRE (retirement = no more income).
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
  const currentYear = getItalyYear();

  const yearlyData: FIREProjectionYearData[] = [];
  let bearYearsToFIRE: number | null = null;
  let baseYearsToFIRE: number | null = null;
  let bullYearsToFIRE: number | null = null;

  let bearNW = initialNetWorth;
  let baseNW = initialNetWorth;
  let bullNW = initialNetWorth;
  let bearExpenses = annualExpenses;
  let baseExpenses = annualExpenses;
  let bullExpenses = annualExpenses;

  for (let year = 1; year <= maxYears; year++) {
    bearNW *= (1 + scenarios.bear.growthRate / 100);
    baseNW *= (1 + scenarios.base.growthRate / 100);
    bullNW *= (1 + scenarios.bull.growthRate / 100);

    if (bearYearsToFIRE === null) bearNW += annualSavings;
    if (baseYearsToFIRE === null) baseNW += annualSavings;
    if (bullYearsToFIRE === null) bullNW += annualSavings;

    bearExpenses *= (1 + scenarios.bear.inflationRate / 100);
    baseExpenses *= (1 + scenarios.base.inflationRate / 100);
    bullExpenses *= (1 + scenarios.bull.inflationRate / 100);

    const bearFireNumber = wrDecimal > 0 ? bearExpenses / wrDecimal : 0;
    const baseFireNumber = wrDecimal > 0 ? baseExpenses / wrDecimal : 0;
    const bullFireNumber = wrDecimal > 0 ? bullExpenses / wrDecimal : 0;

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
      bearExpenses: Math.round(bearExpenses),
      baseExpenses: Math.round(baseExpenses),
      bullExpenses: Math.round(bullExpenses),
      bearFireNumber: Math.round(bearFireNumber),
      baseFireNumber: Math.round(baseFireNumber),
      bullFireNumber: Math.round(bullFireNumber),
      bearFireReached: bearReached,
      baseFireReached: baseReached,
      bullFireReached: bullReached,
    });

    if (bearYearsToFIRE !== null && baseYearsToFIRE !== null && bullYearsToFIRE !== null) {
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

export function calculateFIRESensitivityMatrix(
  initialNetWorth: number,
  baselineAnnualExpenses: number,
  baselineAnnualSavings: number,
  withdrawalRate: number,
  scenarios: FIREProjectionScenarios
): FIRESensitivityMatrix {
  const baselineProjection =
    initialNetWorth > 0 && baselineAnnualExpenses > 0 && withdrawalRate > 0
      ? calculateFIREProjection(
          initialNetWorth,
          baselineAnnualExpenses,
          baselineAnnualSavings,
          withdrawalRate,
          scenarios
        )
      : null;
  const baselineYearsToFIRE = baselineProjection?.baseYearsToFIRE ?? null;

  const columns = baselineAnnualSavings > 0
    ? SAVINGS_MULTIPLIERS.map((multiplier) => {
        const annualSavings = baselineAnnualSavings * multiplier;
        return {
          annualSavings,
          label: formatMonthMultiplier(multiplier),
          isBaseline: multiplier === 1,
        };
      })
    : SAVINGS_FALLBACK_VALUES.map((amount) => ({
        annualSavings: amount,
        label: formatSavingsColumnLabel(amount),
        isBaseline: amount === 0,
      }));

  const rows = EXPENSE_MULTIPLIERS.map((multiplier) => {
    const annualExpenses = baselineAnnualExpenses * multiplier;

    const cells = columns.map((column) => {
      const projection =
        initialNetWorth > 0 && annualExpenses > 0 && withdrawalRate > 0
          ? calculateFIREProjection(
              initialNetWorth,
              annualExpenses,
              column.annualSavings,
              withdrawalRate,
              scenarios
            )
          : null;
      const yearsToFIRE = projection?.baseYearsToFIRE ?? null;
      let relationToBaseline: FIRESensitivityCell['relationToBaseline'] = 'neutral';
      const isBaseline = multiplier === 1 && column.isBaseline;

      if (isBaseline) {
        relationToBaseline = 'baseline';
      } else if (baselineYearsToFIRE !== null && yearsToFIRE !== null) {
        if (yearsToFIRE < baselineYearsToFIRE) {
          relationToBaseline = 'better';
        } else if (yearsToFIRE > baselineYearsToFIRE) {
          relationToBaseline = 'worse';
        }
      }

      return {
        annualExpenses,
        annualSavings: column.annualSavings,
        yearsToFIRE,
        isBaseline,
        relationToBaseline,
      };
    });

    return {
      annualExpenses,
      multiplier,
      label: formatMonthMultiplier(multiplier),
      cells,
    };
  });

  return {
    columns,
    rows,
    baselineAnnualExpenses,
    baselineAnnualSavings,
    baselineYearsToFIRE,
  };
}

export function prepareRunwaySummaryLabel(monthLabel: string | null): string {
  if (!monthLabel) return 'Nessun dato storico';

  const [monthText, yearText] = monthLabel.split('/');
  const monthIndex = Number.parseInt(monthText, 10) - 1;
  const year = Number.parseInt(yearText, 10);

  if (!Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex >= MONTH_NAMES.length || !Number.isFinite(year)) {
    return monthLabel;
  }

  return `${MONTH_NAMES[monthIndex]} ${year}`;
}
