/* eslint-disable no-console */
import {
  Timestamp,
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/config';
import {
  calculateTotalExpenses,
  calculateTotalIncome,
  getExpensesByDateRange,
} from '@/lib/services/expenseService';
import { Expense } from '@/types/expenses';
import { MonthlySnapshot } from '@/types/assets';
import {
  PerformanceMetrics,
  TimePeriod,
  CashFlowData,
  PerformanceData,
  RollingPeriodPerformance,
  PerformanceChartData,
} from '@/types/performance';

import { getSettings } from './assetAllocationService';
import {
  getYear,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  getMonth,
  getDaysInMonth,
} from 'date-fns';

// -----------------------------------------------------------------------------
// 1. Core Calculation Functions
// -----------------------------------------------------------------------------

export function calculateROI(
  startNW: number,
  endNW: number,
  netCashFlow: number
): number | null {
  if (startNW === 0) {
    return null;
  }
  const growth = endNW - startNW - netCashFlow;
  return (growth / startNW) * 100;
}

export function calculateCAGR(
  startNW: number,
  endNW: number,
  netCashFlow: number,
  numberOfMonths: number
): number | null {
  if (numberOfMonths === 0) {
    return null;
  }
  const years = numberOfMonths / 12;
  const adjustedStartNW = startNW + netCashFlow;

  if (adjustedStartNW <= 0) {
    return null;
  }

  const cagr = (endNW / adjustedStartNW) ** (1 / years) - 1;
  return cagr * 100;
}

export function calculateTimeWeightedReturn(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): number | null {
  if (snapshots.length < 2) {
    return null;
  }

  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach((cf) => {
    const key = `${cf.date.getFullYear()}-${cf.date.getMonth()}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  let linkedReturn = 1;
  let monthsWithReturn = 0;

  for (let i = 1; i < snapshots.length; i++) {
    const startSnapshot = snapshots[i - 1];
    const endSnapshot = snapshots[i];

    const startNW = startSnapshot.totalNetWorth;
    const endNW = endSnapshot.totalNetWorth;

    if (startNW === 0) {
      continue;
    }

    const key = `${endSnapshot.year}-${endSnapshot.month - 1}`;
    const cashFlow = cashFlowMap.get(key) || 0;

    const subPeriodReturn = (endNW - cashFlow) / startNW - 1;
    linkedReturn *= 1 + subPeriodReturn;
    monthsWithReturn++;
  }

  if (monthsWithReturn === 0) {
    return null;
  }

  const totalMonths = calculateMonthsDifference(
    new Date(snapshots[snapshots.length - 1].year, snapshots[snapshots.length - 1].month - 1),
    new Date(snapshots[0].year, snapshots[0].month - 1)
  );

  if (totalMonths === 0) return null;

  const annualizedTWR = linkedReturn ** (12 / totalMonths) - 1;
  return annualizedTWR * 100;
}

export function calculateIRR(
  startNW: number,
  endNW: number,
  cashFlows: CashFlowData[],
  startDate: Date,
  numberOfMonths: number
): number | null {
  const cashFlowItems = [
    { amount: -startNW, months: 0 },
    ...cashFlows.map(cf => ({
      amount: cf.netCashFlow,
      months: calculateMonthsDifference(cf.date, startDate) + 1,
    })),
    { amount: endNW, months: numberOfMonths },
  ];

  const MAX_ITERATIONS = 100;
  const TOLERANCE = 1e-7;
  let r = 0.1; // Initial guess

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let npv = 0;
    let npv_prime = 0;
    cashFlowItems.forEach(({ amount, months }) => {
      const years = months / 12;
      npv += amount / (1 + r) ** years;
      if (years > 0) {
        npv_prime -= (amount * years) / (1 + r) ** (years + 1);
      }
    });

    if (Math.abs(npv) < TOLERANCE) {
      return r * 100;
    }

    if (npv_prime === 0) {
      return null;
    }

    r -= npv / npv_prime;
  }

  return null;
}

export function calculateSharpeRatio(
  portfolioReturn: number,
  riskFreeRate: number,
  volatility: number
): number | null {
  if (volatility === 0) {
    return null;
  }
  return (portfolioReturn - riskFreeRate) / volatility;
}

export function calculateVolatility(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): number | null {
  if (snapshots.length < 3) {
    return null;
  }

  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach((cf) => {
    const key = `${cf.date.getFullYear()}-${cf.date.getMonth()}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  const monthlyReturns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prevSnapshot = snapshots[i - 1];
    const currSnapshot = snapshots[i];

    const prevNW = prevSnapshot.totalNetWorth;
    if (prevNW === 0) continue;

    const key = `${currSnapshot.year}-${currSnapshot.month - 1}`;
    const cashFlow = cashFlowMap.get(key) || 0;
    const monthlyReturn = (currSnapshot.totalNetWorth - cashFlow) / prevNW - 1;

    // Filter extreme values
    if (Math.abs(monthlyReturn) < 0.5) {
      monthlyReturns.push(monthlyReturn);
    }
  }

  if (monthlyReturns.length < 2) {
    return null;
  }

  const mean =
    monthlyReturns.reduce((sum, r) => sum + r, 0) / monthlyReturns.length;
  const variance =
    monthlyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (monthlyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  const annualizedVolatility = stdDev * Math.sqrt(12);
  return annualizedVolatility * 100;
}

// -----------------------------------------------------------------------------
// 2. Data Aggregation Functions
// -----------------------------------------------------------------------------

export function getSnapshotsForPeriod(
  allSnapshots: MonthlySnapshot[],
  timePeriod: TimePeriod,
  customStartDate?: Date,
  customEndDate?: Date
): MonthlySnapshot[] {
  const now = new Date();
  let start: Date;
  let end: Date = now;

  switch (timePeriod) {
    case 'YTD':
      start = startOfYear(now);
      break;
    case '1Y':
      start = subMonths(now, 12);
      break;
    case '3Y':
      start = subMonths(now, 36);
      break;
    case '5Y':
      start = subMonths(now, 60);
      break;
    case 'ALL':
      return allSnapshots.filter((s) => !s.isDummy);
    case 'CUSTOM':
      if (!customStartDate || !customEndDate) return [];
      start = customStartDate;
      end = customEndDate;
      break;
    default:
      return [];
  }

  return allSnapshots.filter((s) => {
    if (s.isDummy) return false;
    const snapshotDate = new Date(s.year, s.month - 1, getDaysInMonth(new Date(s.year, s.month - 1)));
    return snapshotDate >= start && snapshotDate <= end;
  });
}

export async function getCashFlowsForPeriod(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<CashFlowData[]> {
  const expenses = await getExpensesByDateRange(userId, startDate, endDate);

  const monthlyFlows: { [key: string]: { income: number; expenses: number } } = {};

  expenses.forEach((expense) => {
    const date = (expense.date as Timestamp).toDate();
    const key = `${getYear(date)}-${getMonth(date)}`;

    if (!monthlyFlows[key]) {
      monthlyFlows[key] = { income: 0, expenses: 0 };
    }

    if (expense.type === 'income') {
      monthlyFlows[key].income += expense.amount;
    } else {
      monthlyFlows[key].expenses += expense.amount;
    }
  });

  return Object.entries(monthlyFlows).map(([key, value]) => {
    const [year, month] = key.split('-').map(Number);
    return {
      date: new Date(year, month),
      income: value.income,
      expenses: value.expenses,
      netCashFlow: value.income - value.expenses,
    };
  }).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function calculatePerformanceForPeriod(
  userId: string,
  allSnapshots: MonthlySnapshot[],
  timePeriod: TimePeriod,
  riskFreeRate: number,
  customStartDate?: Date,
  customEndDate?: Date
): Promise<PerformanceMetrics> {
  const snapshots = getSnapshotsForPeriod(
    allSnapshots,
    timePeriod,
    customStartDate,
    customEndDate
  ).sort((a, b) => new Date(a.year, a.month - 1).getTime() - new Date(b.year, b.month - 1).getTime());

  const emptyMetrics = (
    startDate: Date,
    endDate: Date,
    errorMessage: string
  ): PerformanceMetrics => ({
    timePeriod,
    startDate,
    endDate,
    startNetWorth: 0,
    endNetWorth: 0,
    cashFlows: [],
    roi: null,
    cagr: null,
    timeWeightedReturn: null,
    moneyWeightedReturn: null,
    sharpeRatio: null,
    volatility: null,
    riskFreeRate,
    totalContributions: 0,
    totalWithdrawals: 0,
    netCashFlow: 0,
    numberOfMonths: 0,
    hasInsufficientData: true,
    errorMessage,
  });

  if (snapshots.length < 2) {
    const now = new Date();
    return emptyMetrics(now, now, 'Servono almeno 2 snapshot mensili per calcolare le metriche');
  }

  const firstSnapshot = snapshots[0];
  const lastSnapshot = snapshots[snapshots.length - 1];
  const startDate = new Date(firstSnapshot.year, firstSnapshot.month - 1);
  const endDate = new Date(lastSnapshot.year, lastSnapshot.month - 1);
  const startNetWorth = firstSnapshot.totalNetWorth;
  const endNetWorth = lastSnapshot.totalNetWorth;

  const cashFlows = await getCashFlowsForPeriod(userId, startDate, endDate);
  const netCashFlow = cashFlows.reduce((sum, cf) => sum + cf.netCashFlow, 0);
  const totalContributions = cashFlows.reduce((sum, cf) => sum + (cf.netCashFlow > 0 ? cf.netCashFlow : 0), 0);
  const totalWithdrawals = cashFlows.reduce((sum, cf) => sum + (cf.netCashFlow < 0 ? cf.netCashFlow : 0), 0);

  const numberOfMonths = calculateMonthsDifference(endDate, startDate);

  const roi = calculateROI(startNetWorth, endNetWorth, netCashFlow);
  const cagr = calculateCAGR(startNetWorth, endNetWorth, netCashFlow, numberOfMonths);
  const timeWeightedReturn = calculateTimeWeightedReturn(snapshots, cashFlows);
  const moneyWeightedReturn = calculateIRR(startNetWorth, endNetWorth, cashFlows, startDate, numberOfMonths);
  const volatility = calculateVolatility(snapshots, cashFlows);

  const sharpeRatio =
    timeWeightedReturn && volatility
      ? calculateSharpeRatio(timeWeightedReturn, riskFreeRate, volatility)
      : null;

  return {
    timePeriod,
    startDate,
    endDate,
    startNetWorth,
    endNetWorth,
    cashFlows,
    roi,
    cagr,
    timeWeightedReturn,
    moneyWeightedReturn,
    sharpeRatio,
    volatility,
    riskFreeRate,
    totalContributions,
    totalWithdrawals,
    netCashFlow,
    numberOfMonths,
    hasInsufficientData: false,
  };
}

export async function getAllPerformanceData(
  userId: string
): Promise<PerformanceData> {
  const allSnapshots = await getDocs(
    query(collection(db, 'monthly-snapshots'), where('userId', '==', userId))
  ).then((snapshot) =>
    snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as MonthlySnapshot))
  );

  const settings = await getSettings(userId);
  const riskFreeRate = settings?.riskFreeRate ?? 2.5;

  const [ytd, oneYear, threeYear, fiveYear, allTime, rolling12M, rolling36M] =
    await Promise.all([
      calculatePerformanceForPeriod(userId, allSnapshots, 'YTD', riskFreeRate),
      calculatePerformanceForPeriod(userId, allSnapshots, '1Y', riskFreeRate),
      calculatePerformanceForPeriod(userId, allSnapshots, '3Y', riskFreeRate),
      calculatePerformanceForPeriod(userId, allSnapshots, '5Y', riskFreeRate),
      calculatePerformanceForPeriod(userId, allSnapshots, 'ALL', riskFreeRate),
      calculateRollingPeriods(userId, allSnapshots, 12, riskFreeRate),
      calculateRollingPeriods(userId, allSnapshots, 36, riskFreeRate),
    ]);

  return {
    ytd,
    oneYear,
    threeYear,
    fiveYear,
    allTime,
    custom: null,
    rolling12M,
    rolling36M,
    allSnapshots,
    riskFreeRate,
    lastUpdated: new Date(),
    snapshotCount: allSnapshots.filter(s => !s.isDummy).length,
  };
}

export async function calculateRollingPeriods(
  userId: string,
  allSnapshots: MonthlySnapshot[],
  windowMonths: number,
  riskFreeRate: number
): Promise<RollingPeriodPerformance[]> {
  const sortedSnapshots = allSnapshots
    .filter((s) => !s.isDummy)
    .sort((a, b) => new Date(a.year, a.month - 1).getTime() - new Date(b.year, b.month - 1).getTime());

  if (sortedSnapshots.length < windowMonths + 1) {
    return [];
  }

  const overallStartDate = new Date(sortedSnapshots[0].year, sortedSnapshots[0].month - 1);
  const overallEndDate = new Date(sortedSnapshots[sortedSnapshots.length - 1].year, sortedSnapshots[sortedSnapshots.length - 1].month - 1);
  const allCashFlows = await getCashFlowsForPeriod(userId, overallStartDate, overallEndDate);

  const results: RollingPeriodPerformance[] = [];
  for (let i = 0; i <= sortedSnapshots.length - windowMonths; i++) {
    const windowSnapshots = sortedSnapshots.slice(i, i + windowMonths + 1);
    const startDate = new Date(windowSnapshots[0].year, windowSnapshots[0].month - 1);
    const endDate = new Date(windowSnapshots[windowMonths].year, windowSnapshots[windowMonths].month - 1);

    const windowCashFlows = allCashFlows.filter(cf => {
      const cfDate = cf.date;
      return cfDate >= startDate && cfDate <= endDate;
    });

    const netCashFlow = windowCashFlows.reduce((sum, cf) => sum + cf.netCashFlow, 0);

    const startNW = windowSnapshots[0].totalNetWorth;
    const endNW = windowSnapshots[windowMonths].totalNetWorth;

    const cagr = calculateCAGR(startNW, endNW, netCashFlow, windowMonths);
    const volatility = calculateVolatility(windowSnapshots, windowCashFlows);

    // Using CAGR for rolling Sharpe Ratio is a performance trade-off,
    // as calculating TWR for each window would be too slow.
    const sharpeRatio = cagr && volatility ? calculateSharpeRatio(cagr, riskFreeRate, volatility) : null;

    if (cagr !== null) {
      results.push({
        periodStartDate: startDate,
        periodEndDate: endDate,
        cagr,
        sharpeRatio,
        volatility,
      });
    }
  }

  return results;
}

export function preparePerformanceChartData(
  snapshots: MonthlySnapshot[],
  cashFlows: CashFlowData[]
): PerformanceChartData[] {
  const cashFlowMap = new Map<string, number>();
  cashFlows.forEach((cf) => {
    const key = `${cf.date.getFullYear()}-${cf.date.getMonth()}`;
    cashFlowMap.set(key, cf.netCashFlow);
  });

  let cumulativeContributions = 0;
  return snapshots.map((snapshot) => {
    const date = new Date(snapshot.year, snapshot.month - 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const cashFlow = cashFlowMap.get(key) || 0;

    cumulativeContributions += cashFlow;

    return {
      date: date.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }),
      netWorth: snapshot.totalNetWorth,
      contributions: cumulativeContributions,
      returns: snapshot.totalNetWorth - cumulativeContributions,
    };
  });
}

// -----------------------------------------------------------------------------
// 3. Helper Functions
// -----------------------------------------------------------------------------

export function calculateMonthsDifference(date1: Date, date2: Date): number {
  let years = date1.getFullYear() - date2.getFullYear();
  let months = date1.getMonth() - date2.getMonth();

  if (months < 0) {
    years--;
    months += 12;
  }

  return years * 12 + months;
}
