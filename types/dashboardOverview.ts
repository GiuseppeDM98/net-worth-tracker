import { PieChartData } from '@/types/assets';

export interface DashboardOverviewVariation {
  value: number;
  percentage: number;
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
}

export interface DashboardOverviewPayload {
  metrics: {
    totalValue: number;
    liquidNetWorth: number;
    illiquidNetWorth: number;
    netTotal: number;
    liquidNetTotal: number;
    unrealizedGains: number;
    estimatedTaxes: number;
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
}
