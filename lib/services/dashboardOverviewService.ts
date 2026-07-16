import 'server-only';

import { fromZonedTime } from 'date-fns-tz';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { Asset, AssetAllocationSettings, MonthlySnapshot } from '@/types/assets';
import { Expense } from '@/types/expenses';
import { GoalAssetAssignment, GoalBasedInvestingData, InvestmentGoal } from '@/types/goals';
import {
  DashboardOverviewPayload,
  DashboardOverviewExpenseStats,
  DashboardOverviewTopAsset,
  DashboardOverviewCategoryAmount,
} from '@/types/dashboardOverview';
import {
  computeAllTimeHigh,
  computeTopMovers,
  pickFeaturedGoalProgress,
} from '@/lib/utils/dashboardOverviewUtils';
import {
  calculateAnnualPortfolioCost,
  calculateAssetValue,
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

async function getGoalDataForUser(userId: string): Promise<GoalBasedInvestingData | null> {
  const goalDoc = await adminDb.collection('goalBasedInvesting').doc(userId).get();

  if (!goalDoc.exists) {
    return null;
  }

  const data = goalDoc.data();

  if (!data) {
    return null;
  }

  return {
    goals: (data.goals ?? []) as InvestmentGoal[],
    assignments: (data.assignments ?? []) as GoalAssetAssignment[],
  };
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

interface ExpenseSummary {
  income: number;
  expenses: number;
  net: number;
  // Aggregated totals per category name (denormalized on Expense docs).
  incomeByCategory: Map<string, number>;
  expensesByCategory: Map<string, number>;
}

function summarizeExpenses(expenses: Expense[]): ExpenseSummary {
  let income = 0;
  let totalExpenses = 0;
  const incomeByCategory = new Map<string, number>();
  const expensesByCategory = new Map<string, number>();

  for (const expense of expenses) {
    const category = expense.categoryName ?? 'Altro';
    // Transfers are net-zero — skip entirely
    if (expense.type === 'transfer') continue;
    if (expense.type === 'income') {
      income += expense.amount;
      incomeByCategory.set(category, (incomeByCategory.get(category) ?? 0) + expense.amount);
    } else {
      const abs = Math.abs(expense.amount);
      totalExpenses += abs;
      expensesByCategory.set(category, (expensesByCategory.get(category) ?? 0) + abs);
    }
  }

  return {
    income,
    expenses: totalExpenses,
    net: income - totalExpenses,
    incomeByCategory,
    expensesByCategory,
  };
}

// Build a sorted top-5 category list from a category→amount map.
function buildTopCategories(
  categoryMap: Map<string, number>,
  total: number,
  limit = 5
): DashboardOverviewCategoryAmount[] {
  return [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: total > 0 ? (amount / total) * 100 : 0,
    }));
}

function buildExpenseStats(
  currentExpenses: Expense[],
  previousExpenses: Expense[]
): DashboardOverviewExpenseStats {
  const current = summarizeExpenses(currentExpenses);
  const previous = summarizeExpenses(previousExpenses);

  // Expose only the plain totals on currentMonth/previousMonth (no Maps on the wire).
  const currentMonth = { income: current.income, expenses: current.expenses, net: current.net };
  const previousMonth = { income: previous.income, expenses: previous.expenses, net: previous.net };

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
    topExpenseCategories: buildTopCategories(current.expensesByCategory, currentMonth.expenses),
    topIncomeCategories: buildTopCategories(current.incomeByCategory, currentMonth.income),
  };
}

function buildLiveOverviewPayload(
  assets: Asset[],
  snapshots: MonthlySnapshot[],
  settings: AssetAllocationSettings | null,
  expenseStats: DashboardOverviewExpenseStats | null,
  goalData: GoalBasedInvestingData | null
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

  // Cash sub-breakdown: pure cash accounts vs investable liquid assets.
  // This splits liquidNetWorth into two sub-buckets shown on the Liquid card.
  const cashNetWorth = assets
    .filter(a => a.quantity > 0 && a.assetClass === 'cash')
    .reduce((sum, a) => sum + calculateAssetValue(a), 0);
  const liquidInvestmentsNetWorth = liquidNetWorth - cashNetWorth;
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
  // Hoisted out of the block below so computeTopMovers can compare against the
  // same "previous month" snapshot the monthly variation chip uses.
  let previousSnapshot: MonthlySnapshot | null = null;

  if (snapshots.length > 0) {
    const currentNetWorth = currentMonthSnapshot
      ? currentMonthSnapshot.totalNetWorth
      : totalValue;
    previousSnapshot = currentMonthSnapshot
      ? (snapshots.length > 1 ? snapshots[snapshots.length - 2] : null)
      : snapshots[snapshots.length - 1];

    monthlyVariation = previousSnapshot
      ? calculateMonthlyChange(currentNetWorth, previousSnapshot)
      : null;
    yearlyVariation = calculateYearlyChange(currentNetWorth, snapshots);
  }

  const { previousAllTimeHigh, isNewATH } = computeAllTimeHigh(
    snapshots,
    currentMonth,
    currentYear,
    totalValue
  );
  const topMovers = computeTopMovers(assets, previousSnapshot, totalValue);
  const goalProgress =
    settings?.goalBasedInvestingEnabled && goalData
      ? pickFeaturedGoalProgress(goalData.goals, goalData.assignments, assets)
      : null;

  // Top assets for the portfolio list card — active assets sorted by value desc, capped at 15.
  const topAssets: DashboardOverviewTopAsset[] = assets
    .filter(a => a.quantity > 0)
    .map(a => {
      const value = calculateAssetValue(a);
      // Use null instead of undefined — Firestore rejects undefined values.
      let returnPercent: number | null = null;
      if (a.averageCost && a.averageCost > 0) {
        const costBasis = a.quantity * a.averageCost;
        returnPercent = costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : null;
      }
      return {
        id: a.id,
        name: a.name,
        assetType: a.type,
        assetClass: a.assetClass,
        totalValue: value,
        portfolioPercent: totalValue > 0 ? (value / totalValue) * 100 : 0,
        returnPercent,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 15);

  return {
    metrics: {
      totalValue,
      liquidNetWorth,
      illiquidNetWorth,
      cashNetWorth,
      liquidInvestmentsNetWorth,
      netTotal: calculateNetTotal(assets),
      liquidNetTotal: liquidNetWorth - liquidEstimatedTaxes,
      unrealizedGains: calculateTotalUnrealizedGains(assets),
      estimatedTaxes,
      liquidEstimatedTaxes,
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
    topAssets,
    // Up to 40 historical snapshots + current live value for the hero sparkline.
    // 40 covers the 3A period selector (36 months) plus a baseline point.
    // The current-month snapshot (if it exists) is excluded because totalValue
    // already reflects the live state and avoids duplicating the last point.
    // Appending totalValue ensures the line always ends at today's actual net worth,
    // not at the previous month's snapshot (which would lag by weeks mid-month).
    // Each point is tiny ({month, year, totalNetWorth}) so expanding from 11→40 is
    // negligible on payload size.
    sparklineData: [
      ...snapshots
        .filter((s) => !(s.year === currentYear && s.month === currentMonth))
        .slice(-40)
        .map((s) => ({ month: s.month, year: s.year, totalNetWorth: s.totalNetWorth })),
      { month: currentMonth, year: currentYear, totalNetWorth: totalValue },
    ],
    ath: {
      previousAllTimeHigh,
      isNewATH,
    },
    topMovers,
    goalProgress,
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

  const [assets, snapshots, settings, goalData] = await Promise.all([
    getAssetsForUser(userId),
    getSnapshotsForUser(userId),
    getSettingsForUser(userId),
    getGoalDataForUser(userId),
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

  const payloadWithoutFreshness = buildLiveOverviewPayload(
    assets,
    snapshots,
    settings,
    expenseStats,
    goalData
  );
  const now = new Date();

  const summaryDoc: StoredDashboardOverviewSummary = {
    userId,
    payload: payloadWithoutFreshness,
    updatedAt: new Date(),
    computedAt: new Date(),
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
