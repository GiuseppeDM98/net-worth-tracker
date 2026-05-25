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
}
