// types/pdf.ts
// TypeScript interfaces for PDF export functionality

import type { Asset, MonthlySnapshot, AssetAllocationTarget } from '@/types/assets';
import type { PerformanceMetrics } from '@/types/performance';

// ============================================
// Core PDF Data Types
// ============================================

export interface PDFDataContext {
  userId: string;
  userName: string;
  generatedAt: Date;
  snapshots: MonthlySnapshot[];
  assets: Asset[];
  allocationTargets: AssetAllocationTarget;
  timeFilter?: TimeFilter;
}

export interface SectionSelection {
  portfolio: boolean;
  allocation: boolean;
  history: boolean;
  cashflow: boolean;
  performance: boolean;
  fire: boolean;
  summary: boolean;
}

// ============================================
// Time Filter Types
// ============================================

// Time period filters for PDF report generation.
// - 'total': All available historical data
// - 'yearly': Full year data (12 months)
// - 'monthly': Single month data
export type TimeFilter = 'total' | 'yearly' | 'monthly';

export interface TimeFilterValidation {
  hasMonthlyData: boolean;     // true if at least 1 snapshot in current month
  hasYearlyData: boolean;      // true if at least 2 snapshots in current year
  hasTotalData: boolean;       // true if at least 2 snapshots total
  currentMonth: number;        // 1-12
  currentYear: number;         // e.g., 2025
}

export interface PDFSectionData {
  portfolio?: PortfolioData;
  allocation?: AllocationData;
  history?: HistoryData;
  cashflow?: CashflowData;
  performance?: PerformanceData;
  fire?: FireData;
  summary?: SummaryData;
}

// ============================================
// Section-Specific Data Types
// ============================================

export interface PortfolioData {
  assets: AssetRow[];
  totalValue: number;
  liquidValue: number;
  illiquidValue: number;
  weightedTER: number;
  totalUnrealizedGains: number;
  totalUnrealizedGainsPercent: number;
  annualCost: number;
}

export interface AssetRow {
  ticker: string;
  name: string;
  assetClass: string;
  assetType: string;
  quantity: number;
  currentPrice: number;
  totalValue: number;
  weight: number;              // % of total portfolio
  unrealizedGain?: number;
  unrealizedGainPercent?: number;
  ter?: number;
  isLiquid: boolean;
}

export interface AllocationData {
  byAssetClass: AssetClassAllocation[];
  rebalancingNeeded: boolean;
  rebalancingActions: RebalancingAction[];
  hasTargets: boolean;
}

export interface AssetClassAllocation {
  assetClass: string;
  displayName: string;
  currentValue: number;
  currentPercent: number;
  targetPercent?: number;
  difference?: number;          // Absolute EUR difference
  differencePercent?: number;   // Percentage point difference
}

export interface RebalancingAction {
  assetClass: string;
  action: 'buy' | 'sell';
  amount: number;
}

export interface HistoryData {
  netWorthEvolution: NetWorthDataPoint[];
  assetClassEvolution: AssetClassEvolutionPoint[];
  yoyComparison: YoYDataPoint[];
  latestSnapshot?: MonthlySnapshot;
  oldestSnapshot?: MonthlySnapshot;
  totalGrowth?: number;         // % growth from oldest to latest
  totalGrowthAbsolute?: number; // EUR growth
}

export interface NetWorthDataPoint {
  date: string;                 // 'YYYY-MM'
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number;
  note?: string;
}

export interface AssetClassEvolutionPoint {
  date: string;
  equity: number;
  bonds: number;
  crypto: number;
  realestate: number;
  commodity: number;
  cash: number;
}

export interface YoYDataPoint {
  year: number;
  startValue: number;
  endValue: number;
  growth: number;               // Absolute EUR
  growthPercent: number;
}

export interface CashflowData {
  totalIncome: number;
  totalExpenses: number;
  netCashflow: number;
  incomeToExpenseRatio: number;
  byCategory: CategoryBreakdown[];
  monthlyTrend: MonthlyTrendPoint[];
  numberOfMonthsTracked: number;  // Number of unique months with tracked expenses
  averageMonthlySavings: number;  // netCashflow / numberOfMonthsTracked
}

export interface CategoryBreakdown {
  categoryName: string;
  subCategoryName?: string;
  amount: number;
  percent: number;              // % of total expenses
  transactionCount: number;
}

export interface MonthlyTrendPoint {
  month: string;                // 'YYYY-MM'
  income: number;
  expenses: number;
  net: number;
}

export interface FireData {
  fireNumber: number;
  currentNetWorth: number;
  progressToFI: number;         // % (0-100+)
  annualExpenses: number;
  annualIncome: number;
  monthlyAllowance: number;
  dailyAllowance: number;
  safeWithdrawalRate: number;   // Default 4%
  yearsOfExpensesCovered: number;
  currentWithdrawalRate?: number;
  historicalData?: FireHistoricalPoint[];
}

export interface FireHistoricalPoint {
  month: string;
  netWorth: number;
  expenses: number;
  income: number;
  sustainableWithdrawal: number;
}

export interface SummaryData {
  totalNetWorth: number;
  liquidNetWorth: number;
  assetCount: number;
  topAssetClass: string;
  weightedTER: number;
  unrealizedGains: number;
  allocationScore: number;      // 0-100 (how close to targets)
  fireProgress: number;
  incomeToExpenseRatio: number;
  generatedAt: Date;
  sectionsIncluded: string[];
  dataCompleteness: {
    snapshotCount: number;
    assetCount: number;
    expenseCount: number;
  };
}

/**
 * Performance data for PDF export.
 * Contains performance metrics and period label for display.
 */
export interface PerformanceData {
  metrics: PerformanceMetrics;
  periodLabel: string;  // "YTD 2026" or "Storico Totale"
}

// ============================================
// Chart Image Types
// ============================================

export interface ChartImage {
  id: string;
  dataUrl: string;              // base64 PNG
  width: number;
  height: number;
}

export interface ChartCaptureOptions {
  chartId: string;
  width?: number;
  height?: number;
  scale?: number;               // Chart rendering scale for high-DPI displays. Default: 2 (Retina). Use 1 for standard displays.
}

export const CHART_IDS = {
  NET_WORTH_EVOLUTION: 'chart-net-worth-evolution',
  ASSET_CLASS_EVOLUTION: 'chart-asset-class-evolution',
  LIQUIDITY: 'chart-liquidity',
  YOY_VARIATION: 'chart-yoy-variation',
} as const;

export type ChartId = typeof CHART_IDS[keyof typeof CHART_IDS];

// ============================================
// PDF Generation Types
// ============================================

export interface PDFGenerateOptions {
  userId: string;
  userName: string;
  sections: SectionSelection;
  snapshots: MonthlySnapshot[];
  assets: Asset[];
  allocationTargets: AssetAllocationTarget;
  timeFilter?: TimeFilter;     // Optional: default 'total'
}

export interface PDFGenerationResult {
  success: boolean;
  fileName?: string;
  error?: string;
}
