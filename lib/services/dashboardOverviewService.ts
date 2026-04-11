import 'server-only';

import { fromZonedTime } from 'date-fns-tz';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { Asset, AssetAllocationSettings, MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import { DashboardOverviewPayload, DashboardOverviewExpenseStats } from '@/types/dashboardOverview';
import {
  calculateAnnualPortfolioCost,
  calculateIlliquidNetWorth,
  calculateLiquidEstimatedTaxes,
  calculateLiquidNetWorth,
  calculateNetTotal,
  calculatePortfolioWeightedTER,
  calculateStampDuty,
  calculateTotalEstimatedTaxes,
  calculateTotalUnrealizedGains,
  calculateTotalValue,
} from '@/lib/services/assetService';
import {
  prepareAssetClassDistributionData,
  prepareAssetDistributionData,
} from '@/lib/services/chartService';
import { calculateMonthlyChange, calculateYearlyChange } from '@/lib/services/snapshotService';
import { getItalyMonthYear, ITALY_TIMEZONE, toDate } from '@/lib/utils/dateHelpers';
import {
  DASHBOARD_OVERVIEW_SOURCE_VERSION,
  DASHBOARD_OVERVIEW_SUMMARY_COLLECTION,
  DASHBOARD_OVERVIEW_SUMMARY_TTL_MS,
} from '@/lib/services/dashboardOverviewConstants';

interface StoredDashboardOverviewSummary {
  userId: string;
  payload: Omit<DashboardOverviewPayload, 'freshness'>;
  updatedAt: FirebaseFirestore.Timestamp | Date | string;
  computedAt: FirebaseFirestore.Timestamp | Date | string;
  sourceVersion: number;
  invalidatedAt?: FirebaseFirestore.Timestamp | Date | string | null;
  lastInvalidationReason?: string | null;
  debug?: {
    assetCount: number;
    snapshotCount: number;
  };
}

function normalizeDate(value: unknown): Date {
  return toDate(value as any);
}

function getMonthDateRangeInItaly(year: number, month: number) {
  const monthLabel = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  const lastDayLabel = String(lastDay).padStart(2, '0');

  return {
    start: fromZonedTime(`${year}-${monthLabel}-01T00:00:00.000`, ITALY_TIMEZONE),
    end: fromZonedTime(`${year}-${monthLabel}-${lastDayLabel}T23:59:59.999`, ITALY_TIMEZONE),
  };
}

async function getAssetsForUser(userId: string): Promise<Asset[]> {
  const snapshot = await adminDb.collection('assets').where('userId', '==', userId).get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      ...data,
      lastPriceUpdate: toDate(data.lastPriceUpdate),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  }) as Asset[];
}

async function getSnapshotsForUser(userId: string): Promise<MonthlySnapshot[]> {
  const snapshot = await adminDb
    .collection('monthly-snapshots')
    .where('userId', '==', userId)
    .orderBy('year', 'asc')
    .orderBy('month', 'asc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      ...data,
      createdAt: toDate(data.createdAt),
    };
  }) as MonthlySnapshot[];
}

async function getSettingsForUser(userId: string): Promise<AssetAllocationSettings | null> {
  const settingsDoc = await adminDb.collection('assetAllocationTargets').doc(userId).get();

  if (!settingsDoc.exists) {
    return null;
  }

  const data = settingsDoc.data();

  if (!data) {
    return null;
  }

  return {
    userAge: data.userAge,
    riskFreeRate: data.riskFreeRate,
    withdrawalRate: data.withdrawalRate,
    plannedAnnualExpenses: data.plannedAnnualExpenses,
    coastFireRetirementAge: data.coastFireRetirementAge,
    includePrimaryResidenceInFIRE: data.includePrimaryResidenceInFIRE,
    dividendIncomeCategoryId: data.dividendIncomeCategoryId,
    dividendIncomeSubCategoryId: data.dividendIncomeSubCategoryId,
    fireProjectionScenarios: data.fireProjectionScenarios,
    monteCarloScenarios: data.monteCarloScenarios,
    goalBasedInvestingEnabled: data.goalBasedInvestingEnabled,
    goalDrivenAllocationEnabled: data.goalDrivenAllocationEnabled,
    defaultDebitCashAssetId: data.defaultDebitCashAssetId,
    defaultCreditCashAssetId: data.defaultCreditCashAssetId,
    stampDutyEnabled: data.stampDutyEnabled,
    stampDutyRate: data.stampDutyRate,
    checkingAccountSubCategory: data.checkingAccountSubCategory,
    cashflowHistoryStartYear: data.cashflowHistoryStartYear,
    laborIncomeCategoryIds: data.laborIncomeCategoryIds ?? [],
    assistantResponseStyle: data.assistantResponseStyle,
    assistantMacroContextEnabled: data.assistantMacroContextEnabled,
    assistantMemoryEnabled: data.assistantMemoryEnabled,
    targets: data.targets,
  } as AssetAllocationSettings;
}

async function getExpensesForMonth(userId: string, year: number, month: number): Promise<Expense[]> {
  const { start, end } = getMonthDateRangeInItaly(year, month);
  const snapshot = await adminDb
    .collection('expenses')
    .where('userId', '==', userId)
    .where('date', '>=', Timestamp.fromDate(start))
    .where('date', '<=', Timestamp.fromDate(end))
    .orderBy('date', 'desc')
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();

    return {
      id: doc.id,
      ...data,
      date: toDate(data.date),
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    };
  }) as Expense[];
}

function summarizeExpenses(expenses: Expense[]) {
  let income = 0;
  let totalExpenses = 0;

  for (const expense of expenses) {
    if (expense.type === 'income') {
      income += expense.amount;
    } else {
      totalExpenses += Math.abs(expense.amount);
    }
  }

  return {
    income,
    expenses: totalExpenses,
    net: income - totalExpenses,
  };
}

function buildExpenseStats(
  currentExpenses: Expense[],
  previousExpenses: Expense[]
): DashboardOverviewExpenseStats {
  const currentMonth = summarizeExpenses(currentExpenses);
  const previousMonth = summarizeExpenses(previousExpenses);

  return {
    currentMonth,
    previousMonth,
    delta: {
      income: previousMonth.income > 0
        ? ((currentMonth.income - previousMonth.income) / previousMonth.income) * 100
        : 0,
      expenses: previousMonth.expenses > 0
        ? ((currentMonth.expenses - previousMonth.expenses) / previousMonth.expenses) * 100
        : 0,
      net: previousMonth.net !== 0
        ? ((currentMonth.net - previousMonth.net) / Math.abs(previousMonth.net)) * 100
        : 0,
    },
  };
}

function buildLiveOverviewPayload(
  assets: Asset[],
  snapshots: MonthlySnapshot[],
  settings: AssetAllocationSettings | null,
  expenseStats: DashboardOverviewExpenseStats | null
): Omit<DashboardOverviewPayload, 'freshness'> {
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();
  const currentMonthSnapshot = snapshots.find(
    (snapshot) => snapshot.year === currentYear && snapshot.month === currentMonth
  ) ?? null;

  const totalValue = calculateTotalValue(assets);
  const liquidNetWorth = calculateLiquidNetWorth(assets);
  const illiquidNetWorth = calculateIlliquidNetWorth(assets);
  const estimatedTaxes = calculateTotalEstimatedTaxes(assets);
  const liquidEstimatedTaxes = calculateLiquidEstimatedTaxes(assets);
  const annualStampDuty = (settings?.stampDutyEnabled && settings?.stampDutyRate)
    ? calculateStampDuty(
        assets,
        settings.stampDutyRate,
        settings.checkingAccountSubCategory !== '__none__'
          ? settings.checkingAccountSubCategory
          : undefined
      )
    : 0;

  let monthlyVariation = null;
  let yearlyVariation = null;

  if (snapshots.length > 0) {
    const currentNetWorth = currentMonthSnapshot
      ? currentMonthSnapshot.totalNetWorth
      : totalValue;
    const previousSnapshot = currentMonthSnapshot
      ? (snapshots.length > 1 ? snapshots[snapshots.length - 2] : null)
      : snapshots[snapshots.length - 1];

    monthlyVariation = previousSnapshot
      ? calculateMonthlyChange(currentNetWorth, previousSnapshot)
      : null;
    yearlyVariation = calculateYearlyChange(currentNetWorth, snapshots);
  }

  return {
    metrics: {
      totalValue,
      liquidNetWorth,
      illiquidNetWorth,
      netTotal: calculateNetTotal(assets),
      liquidNetTotal: liquidNetWorth - liquidEstimatedTaxes,
      unrealizedGains: calculateTotalUnrealizedGains(assets),
      estimatedTaxes,
      portfolioTER: calculatePortfolioWeightedTER(assets),
      annualPortfolioCost: calculateAnnualPortfolioCost(assets),
      annualStampDuty,
    },
    variations: {
      monthly: monthlyVariation,
      yearly: yearlyVariation,
    },
    expenseStats,
    charts: {
      assetClassData: prepareAssetClassDistributionData(assets),
      assetData: prepareAssetDistributionData(assets),
      liquidityData: [
        {
          name: 'Liquido',
          value: liquidNetWorth,
          percentage: totalValue > 0 ? (liquidNetWorth / totalValue) * 100 : 0,
          color: '#10b981',
        },
        {
          name: 'Illiquido',
          value: illiquidNetWorth,
          percentage: totalValue > 0 ? (illiquidNetWorth / totalValue) * 100 : 0,
          color: '#f59e0b',
        },
      ],
    },
    flags: {
      assetCount: assets.filter((asset) => asset.quantity > 0).length,
      hasCostBasisTracking: assets.some(
        (asset) => (asset.averageCost && asset.averageCost > 0) || (asset.taxRate && asset.taxRate > 0)
      ),
      hasTERTracking: assets.some((asset) => !!(asset.totalExpenseRatio && asset.totalExpenseRatio > 0)),
      hasStampDuty: !!(settings?.stampDutyEnabled && annualStampDuty > 0),
      currentMonthSnapshotExists: !!currentMonthSnapshot,
    },
  };
}

function isSummaryStale(summary: StoredDashboardOverviewSummary): boolean {
  if (!summary.payload) {
    return true;
  }

  if (summary.sourceVersion !== DASHBOARD_OVERVIEW_SOURCE_VERSION) {
    return true;
  }

  if (summary.invalidatedAt) {
    return true;
  }

  const updatedAt = normalizeDate(summary.updatedAt);
  return (Date.now() - updatedAt.getTime()) > DASHBOARD_OVERVIEW_SUMMARY_TTL_MS;
}

function toResponsePayload(
  payload: Omit<DashboardOverviewPayload, 'freshness'>,
  metadata: {
    source: DashboardOverviewPayload['freshness']['source'];
    updatedAt: Date;
    computedAt: Date;
    stale: boolean;
  }
): DashboardOverviewPayload {
  return {
    ...payload,
    freshness: {
      source: metadata.source,
      updatedAt: metadata.updatedAt.toISOString(),
      computedAt: metadata.computedAt.toISOString(),
      sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
      stale: metadata.stale,
    },
  };
}

async function recomputeDashboardOverview(userId: string): Promise<DashboardOverviewPayload> {
  const { month: currentMonth, year: currentYear } = getItalyMonthYear();
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const [assets, snapshots, settings] = await Promise.all([
    getAssetsForUser(userId),
    getSnapshotsForUser(userId),
    getSettingsForUser(userId),
  ]);

  let expenseStats: DashboardOverviewExpenseStats | null = null;

  try {
    const [currentMonthExpenses, previousMonthExpenses] = await Promise.all([
      getExpensesForMonth(userId, currentYear, currentMonth),
      getExpensesForMonth(userId, previousYear, previousMonth),
    ]);

    expenseStats = buildExpenseStats(currentMonthExpenses, previousMonthExpenses);
  } catch (error) {
    console.warn('[dashboardOverviewService] Failed to compute expense stats, falling back to null:', error);
  }

  const payloadWithoutFreshness = buildLiveOverviewPayload(assets, snapshots, settings, expenseStats);
  const now = new Date();

  const summaryDoc: StoredDashboardOverviewSummary = {
    userId,
    payload: payloadWithoutFreshness,
    updatedAt: Timestamp.now(),
    computedAt: Timestamp.now(),
    sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
    invalidatedAt: null,
    lastInvalidationReason: null,
    debug: {
      assetCount: payloadWithoutFreshness.flags.assetCount,
      snapshotCount: snapshots.length,
    },
  };

  try {
    await adminDb.collection(DASHBOARD_OVERVIEW_SUMMARY_COLLECTION).doc(userId).set(summaryDoc);
  } catch (error) {
    console.warn('[dashboardOverviewService] Failed to persist materialized summary:', error);
  }

  return toResponsePayload(payloadWithoutFreshness, {
    source: 'live_recompute',
    updatedAt: now,
    computedAt: now,
    stale: false,
  });
}

export async function getDashboardOverview(userId: string): Promise<DashboardOverviewPayload> {
  const summaryDoc = await adminDb.collection(DASHBOARD_OVERVIEW_SUMMARY_COLLECTION).doc(userId).get();

  if (summaryDoc.exists) {
    const summary = summaryDoc.data() as StoredDashboardOverviewSummary;

    if (summary && !isSummaryStale(summary)) {
      return toResponsePayload(summary.payload, {
        source: 'materialized_summary',
        updatedAt: normalizeDate(summary.updatedAt),
        computedAt: normalizeDate(summary.computedAt),
        stale: false,
      });
    }
  }

  return recomputeDashboardOverview(userId);
}
