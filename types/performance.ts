import { MonthlySnapshot } from './assets';

// Time period types
export type TimePeriod =
  | 'YTD'       // Year-to-date (Jan 1 to today)
  | '1Y'        // Last 12 months
  | '3Y'        // Last 36 months
  | '5Y'        // Last 60 months
  | 'ALL'       // All available data
  | 'ROLLING_12M'  // Rolling 12-month periods
  | 'ROLLING_36M'  // Rolling 36-month periods
  | 'CUSTOM';   // User-defined date range

// Cash flow data for a specific period
export interface CashFlowData {
  date: Date;
  income: number;           // Solo entrate ESTERNE (stipendi, bonus, regali) - NO dividendi
  expenses: number;         // Tutte le uscite
  dividendIncome: number;   // Solo dividendi (rendimento del portafoglio)
  netCashFlow: number;      // income - expenses (SENZA dividendi)
}

// Performance metrics for a single time period
export interface PerformanceMetrics {
  // Input data
  timePeriod: TimePeriod;
  startDate: Date;
  endDate: Date;
  startNetWorth: number;
  endNetWorth: number;
  cashFlows: CashFlowData[];

  // Calculated metrics
  roi: number | null;                // Simple ROI (%)
  cagr: number | null;               // Compound Annual Growth Rate (%)
  timeWeightedReturn: number | null; // Time-weighted return (%) - preferred metric
  moneyWeightedReturn: number | null; // IRR / Money-weighted return (%)
  sharpeRatio: number | null;        // Risk-adjusted return
  volatility: number | null;         // Annualized volatility (%)
  maxDrawdown: number | null;        // Maximum drawdown (%)
  drawdownDuration: number | null;   // Max drawdown recovery time (months)
  recoveryTime: number | null;       // Recovery time from trough (months)

  // Temporal context for drawdown metrics
  maxDrawdownDate?: string;          // Trough month (e.g., "04/25")
  drawdownPeriod?: string;           // Peak to recovery range (e.g., "01/25 - 12/25" or "01/25 - Presente")
  recoveryPeriod?: string;           // Trough to recovery range (e.g., "04/25 - 12/25" or "04/25 - Presente")

  // Supporting data
  riskFreeRate: number;              // From user settings
  dividendCategoryId?: string;       // Category ID for dividend income (from settings)
  totalContributions: number;        // Sum of positive net cash flows
  totalWithdrawals: number;          // Sum of negative net cash flows
  netCashFlow: number;               // Total contributions - withdrawals
  totalIncome: number;               // Sum of all income in period (NO dividendi)
  totalExpenses: number;             // Sum of all expenses in period
  totalDividendIncome: number;       // Sum of all dividend income (rendimento portafoglio)
  numberOfMonths: number;            // Number of months in period

  // Data availability flags
  hasInsufficientData: boolean;      // Less than 2 snapshots
  errorMessage?: string;             // Error details if calculation failed
}

// Rolling period performance (for trend analysis)
export interface RollingPeriodPerformance {
  periodEndDate: Date;
  periodStartDate: Date;
  cagr: number;
  sharpeRatio: number | null;
  volatility: number | null;
}

// Complete performance data for the page
export interface PerformanceData {
  // Individual period metrics
  ytd: PerformanceMetrics;
  oneYear: PerformanceMetrics;
  threeYear: PerformanceMetrics;
  fiveYear: PerformanceMetrics;
  allTime: PerformanceMetrics;
  custom: PerformanceMetrics | null;

  // Rolling period trends
  rolling12M: RollingPeriodPerformance[];
  rolling36M: RollingPeriodPerformance[];

  // Metadata
  lastUpdated: Date;
  snapshotCount: number;
}

// Chart data for visualizations
export interface PerformanceChartData {
  date: string;           // MM/YYYY format
  netWorth: number;
  contributions: number;  // Cumulative
  returns: number;        // Returns portion (netWorth - contributions)
  [key: string]: any;     // For Recharts compatibility
}

// Monthly returns heatmap data
export interface MonthlyReturnHeatmapData {
  year: number;
  months: {
    month: number;           // 1-12 (Gen to Dic)
    return: number | null;   // % return for that month (null if no data)
  }[];
}

// Underwater drawdown chart data
export interface UnderwaterDrawdownData {
  date: string;              // MM/YY format
  drawdown: number;          // Always ≤ 0 (e.g., -15.5 for -15.5% drawdown)
  year: number;
  month: number;
}
