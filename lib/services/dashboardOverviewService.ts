import 'server-only';

import { fromZonedTime } from 'date-fns-tz';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { Asset, AssetAllocationSettings, MonthlySnapshot } from '@/types/assets';
import { Expense, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { splitSpendingAtDate } from '@/lib/utils/tracciamentoSummary';
import { getCategoryKey, getCategoryName, resolveDisplayLabels } from '@/lib/utils/expenseGrouping';
import { GoalBasedInvestingData } from '@/types/goals';
import { getGoalDataAdmin } from '@/lib/server/goalData';
import {
  DashboardOverviewPayload,
  DashboardOverviewExpenseStats,
  DashboardOverviewTopAsset,
  DashboardOverviewCategoryAmount,
} from '@/types/dashboardOverview';
import {
  computeAllTimeHigh,
  computeMarketEffect,
  computeTopInstrumentMovers,
  computeTopMovers,
  rankCostDrivers,
  rankGoalProgress,
  type PensionMarketInput,
} from '@/lib/utils/dashboardOverviewUtils';
import { resolvePensionReturnStart } from '@/lib/utils/pensionReturn';
import type { PensionContribution } from '@/types/pension';
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
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { costBasisPerUnitEur } from '@/lib/utils/patrimonioSummary';
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
  return toDate(value as Parameters<typeof toDate>[0]);
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

/**
 * The owner's pension contributions — read only when a pension fund is held, because the digest
 * needs them to split a fund's growth into contributions and return (see `computeTopMovers`).
 */
async function getPensionContributionsForUser(userId: string): Promise<PensionContribution[]> {
  const snapshot = await adminDb
    // Literal on purpose: `pensionContributionService` exports the constant but top-level-imports
    // the CLIENT Firebase SDK (the same trap as goalService — AGENTS.md → Panoramica).
    .collection('pensionContributions')
    .where('userId', '==', userId)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      date: toDate(data.date),
      createdAt: data.createdAt ? toDate(data.createdAt) : undefined,
    };
  }) as PensionContribution[];
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
    respectPensionLockInFire: data.respectPensionLockInFire,
    pensionInpsRetirementAge: data.pensionInpsRetirementAge,
    pensionRitaLongUnemployment: data.pensionRitaLongUnemployment,
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
    pensionReturnStartMonth: data.pensionReturnStartMonth,
    checkingAccountSubCategory: data.checkingAccountSubCategory,
    cashflowHistoryStartYear: data.cashflowHistoryStartYear,
    laborIncomeCategoryIds: data.laborIncomeCategoryIds ?? [],
    familyMembers: data.familyMembers ?? [],
    expenseSplitEnabled: data.expenseSplitEnabled,
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

interface CategoryTotal {
  name: string;
  // Type label, appended to the name only when two same-named categories collide on screen.
  qualifier: string;
  amount: number;
}

interface ExpenseSummary {
  income: number;
  expenses: number;
  net: number;
  // Aggregated totals per category KEY (id, name-fallback — see getCategoryKey):
  // two same-named categories stay two buckets.
  incomeByCategory: Map<string, CategoryTotal>;
  expensesByCategory: Map<string, CategoryTotal>;
}

function summarizeExpenses(expenses: Expense[]): ExpenseSummary {
  let income = 0;
  let totalExpenses = 0;
  const incomeByCategory = new Map<string, CategoryTotal>();
  const expensesByCategory = new Map<string, CategoryTotal>();

  const add = (map: Map<string, CategoryTotal>, expense: Expense, amount: number) => {
    const key = getCategoryKey(expense);
    const entry = map.get(key) ?? {
      name: getCategoryName(expense),
      qualifier: EXPENSE_TYPE_LABELS[expense.type],
      amount: 0,
    };
    entry.amount += amount;
    map.set(key, entry);
  };

  for (const expense of expenses) {
    // Transfers are net-zero — skip entirely
    if (expense.type === 'transfer') continue;
    if (expense.type === 'income') {
      income += expense.amount;
      add(incomeByCategory, expense, expense.amount);
    } else {
      const abs = Math.abs(expense.amount);
      totalExpenses += abs;
      add(expensesByCategory, expense, abs);
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

// Build a sorted top-5 category list from a key→totals map. Labels are resolved over
// the rendered slice: a name shared by two keys in the top list gets its type qualifier.
function buildTopCategories(
  categoryMap: Map<string, CategoryTotal>,
  total: number,
  limit = 5
): DashboardOverviewCategoryAmount[] {
  const top = [...categoryMap.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, limit);

  const labels = resolveDisplayLabels(
    top.map(([key, totals]) => ({ key, name: totals.name, qualifier: totals.qualifier }))
  );

  return top.map(([key, totals]) => ({
    category: labels.get(key) ?? totals.name,
    categoryKey: key,
    amount: totals.amount,
    percentage: total > 0 ? (totals.amount / total) * 100 : 0,
  }));
}

function buildExpenseStats(
  currentExpenses: Expense[],
  previousExpenses: Expense[],
  now: Date
): DashboardOverviewExpenseStats {
  const current = summarizeExpenses(currentExpenses);
  const previous = summarizeExpenses(previousExpenses);

  // Expose only the plain totals on currentMonth/previousMonth (no Maps on the wire). The
  // scheduled share lets the Panoramica project the month the way Tracciamento does.
  const currentMonth = {
    income: current.income,
    expenses: current.expenses,
    net: current.net,
    expensesScheduled: splitSpendingAtDate(currentExpenses, now).scheduled,
  };
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
  goalData: GoalBasedInvestingData | null,
  pensionContributions: PensionContribution[]
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
  const pensionMarketInput: PensionMarketInput = {
    contributions: pensionContributions,
    startMonth: resolvePensionReturnStart(pensionContributions, settings?.pensionReturnStartMonth),
  };
  const topMovers = computeTopMovers(assets, previousSnapshot, totalValue, pensionMarketInput);
  const marketEffect = computeMarketEffect(assets, previousSnapshot, pensionMarketInput);
  const topInstrumentMovers = computeTopInstrumentMovers(assets, previousSnapshot, totalValue, pensionMarketInput);
  const goalProgressList =
    settings?.goalBasedInvestingEnabled && goalData
      ? rankGoalProgress(goalData.goals, goalData.assignments, assets)
      : [];
  const goalProgress = goalProgressList[0] ?? null;
  const costDrivers = rankCostDrivers(assets);

  // Top assets for the portfolio list card — active assets sorted by value desc, capped at 15.
  const topAssets: DashboardOverviewTopAsset[] = assets
    .filter(a => a.quantity > 0)
    .map(a => {
      const value = calculateAssetValue(a);
      // Use null instead of undefined — Firestore rejects undefined values. Compared in EUR on both
      // sides (costBasisPerUnitEur), never the native-currency averageCost against the EUR value.
      let returnPercent: number | null = null;
      const basisPerUnit = costBasisPerUnitEur(a);
      if (basisPerUnit && basisPerUnit > 0) {
        const costBasis = a.quantity * basisPerUnit;
        returnPercent = costBasis > 0 ? ((value - costBasis) / costBasis) * 100 : null;
      }
      return {
        id: a.id,
        name: getAssetDisplayTicker(a),
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
    // EVERY historical snapshot + the current live value for the hero sparkline, so «All»
    // is all (a 40-point cap used to start the line at the 41st-last month and call it All).
    // Each point is tiny ({month, year, totalNetWorth}): a decade of months is ~5 KB.
    // The current-month snapshot (if it exists) is excluded because totalValue
    // already reflects the live state and avoids duplicating the last point.
    // Appending totalValue ensures the line always ends at today's actual net worth,
    // not at the previous month's snapshot (which would lag by weeks mid-month).
    sparklineData: [
      ...snapshots
        .filter((s) => !(s.year === currentYear && s.month === currentMonth))
        .map((s) => ({ month: s.month, year: s.year, totalNetWorth: s.totalNetWorth })),
      { month: currentMonth, year: currentYear, totalNetWorth: totalValue },
    ],
    ath: {
      previousAllTimeHigh,
      isNewATH,
    },
    topMovers,
    marketEffect,
    topInstrumentMovers,
    goalProgress,
    goalProgressList,
    costDrivers,
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
    getGoalDataAdmin(userId),
  ]);
  // Only a holder of a pension fund pays for this read; the digest needs it to tell a fund's
  // return from its contributions.
  const holdsPensionFund = assets.some((a) => a.type === 'pensionFund' && a.quantity > 0);
  const pensionContributions = holdsPensionFund ? await getPensionContributionsForUser(userId) : [];

  let expenseStats: DashboardOverviewExpenseStats | null = null;

  try {
    const [currentMonthExpenses, previousMonthExpenses] = await Promise.all([
      getExpensesForMonth(userId, currentYear, currentMonth),
      getExpensesForMonth(userId, previousYear, previousMonth),
    ]);

    expenseStats = buildExpenseStats(currentMonthExpenses, previousMonthExpenses, new Date());
  } catch (error) {
    console.warn('[dashboardOverviewService] Failed to compute expense stats, falling back to null:', error);
  }

  const payloadWithoutFreshness = buildLiveOverviewPayload(
    assets,
    snapshots,
    settings,
    expenseStats,
    goalData,
    pensionContributions
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
