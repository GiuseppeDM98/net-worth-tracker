import { PieChartData } from '@/types/assets';

export interface DashboardOverviewSparklinePoint {
  month: number;
  year: number;
  totalNetWorth: number;
}

export interface DashboardOverviewVariation {
  value: number;
  percentage: number;
}

// Single category amount used in the cashflow breakdown (top-5 spese/entrate per categoria).
export interface DashboardOverviewCategoryAmount {
  category: string;
  amount: number;
  // Percentage of the total expenses (or total income) for the current month.
  percentage: number;
}

// Compact asset summary used in the "N Asset in Portafoglio" overview card.
export interface DashboardOverviewTopAsset {
  id: string;
  name: string;
  // Raw AssetType value ('stock' | 'etf' | 'bond' | ...) — mapped to Italian labels in UI.
  assetType: string;
  // Raw AssetClass value ('equity' | 'bonds' | ...) — used to derive the icon color.
  assetClass: string;
  totalValue: number;
  portfolioPercent: number;
  // Null when the asset has no cost basis (cash, imported positions).
  returnPercent: number | null;
}

// One asset class that moved the portfolio this month, most-significant first
// (see computeTopMovers in lib/utils/dashboardOverviewUtils.ts).
export interface DashboardOverviewMover {
  assetClass: string;
  label: string;
  delta: number;
}

// The single most relevant in-progress Goal-Based Investing goal, surfaced on the
// companion card footer (see pickFeaturedGoalProgress in lib/utils/dashboardOverviewUtils.ts).
export interface DashboardOverviewGoalProgress {
  goalId: string;
  goalName: string;
  goalColor: string;
  currentValue: number;
  targetAmount: number;
  progressPercentage: number;
}

export interface DashboardOverviewExpenseStats {
  currentMonth: {
    income: number;
    expenses: number;
    net: number;
  };
  previousMonth: {
    income: number;
    expenses: number;
    net: number;
  };
  delta: {
    income: number;
    expenses: number;
    net: number;
  };
  // Top-5 expense categories for the current month, sorted by amount desc.
  topExpenseCategories: DashboardOverviewCategoryAmount[];
  // Top-5 income categories for the current month, sorted by amount desc.
  topIncomeCategories: DashboardOverviewCategoryAmount[];
}

export interface DashboardOverviewPayload {
  metrics: {
    totalValue: number;
    liquidNetWorth: number;
    illiquidNetWorth: number;
    // Liquid sub-breakdown for the redesigned Liquid card.
    cashNetWorth: number;              // assets where assetClass === 'cash'
    liquidInvestmentsNetWorth: number; // liquid assets that are not cash
    netTotal: number;
    liquidNetTotal: number;
    unrealizedGains: number;
    estimatedTaxes: number;
    liquidEstimatedTaxes: number;
    portfolioTER: number;
    annualPortfolioCost: number;
    annualStampDuty: number;
  };
  variations: {
    monthly: DashboardOverviewVariation | null;
    yearly: DashboardOverviewVariation | null;
  };
  expenseStats: DashboardOverviewExpenseStats | null;
  charts: {
    assetClassData: PieChartData[];
    assetData: PieChartData[];
    liquidityData: PieChartData[];
  };
  flags: {
    assetCount: number;
    hasCostBasisTracking: boolean;
    hasTERTracking: boolean;
    hasStampDuty: boolean;
    currentMonthSnapshotExists: boolean;
  };
  freshness: {
    source: 'materialized_summary' | 'live_recompute';
    updatedAt: string;
    computedAt: string;
    sourceVersion: number;
    stale: boolean;
  };
  // Top assets sorted by totalValue desc (up to 15 active assets) for the
  // portfolio list card. Optional so old cached docs degrade gracefully.
  topAssets?: DashboardOverviewTopAsset[];
  // Last 3 historical snapshots for the hero sparkline — optional so old cached
  // docs degrade gracefully (no sparkline shown until next recompute).
  sparklineData?: DashboardOverviewSparklinePoint[];
  // All-time-high check for the "Nuovo massimo storico" chip next to the hero
  // variation chips. Optional so old cached docs degrade gracefully (no badge
  // until next recompute). previousAllTimeHigh is null when there's no prior
  // snapshot to compare against (first-ever snapshot).
  ath?: {
    previousAllTimeHigh: number | null;
    isNewATH: boolean;
  };
  // Top 1-2 asset classes that moved the most this month vs the previous
  // snapshot — the "Guidato da" digest under the hero sparkline. Optional so
  // old cached docs degrade gracefully (line simply doesn't render).
  topMovers?: DashboardOverviewMover[];
  // Single most relevant in-progress goal (Goal-Based Investing), only present
  // when the user has the feature enabled and at least one goal in progress.
  goalProgress?: DashboardOverviewGoalProgress | null;
}
