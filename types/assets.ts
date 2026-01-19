import { Timestamp } from 'firebase/firestore';

// AssetType: Granular classification used in UI (stock, ETF, bond, crypto, etc.)
// AssetClass: Broad financial categories for allocation analysis (equity, bonds, etc.)
//
// Mapping examples:
// - stock -> equity
// - etf -> equity (usually) OR bonds (for bond ETFs) - determined by assetClass field
// - bond -> bonds
// - crypto -> crypto
// - cash -> cash
// - realestate -> realestate
export type AssetType = 'stock' | 'etf' | 'bond' | 'crypto' | 'commodity' | 'cash' | 'realestate';
export type AssetClass = 'equity' | 'bonds' | 'crypto' | 'realestate' | 'cash' | 'commodity';

export interface AssetComposition {
  assetClass: AssetClass;
  percentage: number;
  subCategory?: string; // Specific sub-category for this component of the composite asset
}

// Core asset model representing a single financial holding.
// Supports stocks, ETFs, bonds, crypto, real estate, cash, commodities.
// Includes automatic price updates via Yahoo Finance (unless autoUpdatePrice=false).
export interface Asset {
  id: string;
  userId: string;
  ticker: string;
  name: string;
  type: AssetType;
  assetClass: AssetClass;
  subCategory?: string;
  currency: string;
  quantity: number;
  averageCost?: number;
  taxRate?: number; // Tax rate percentage for unrealized gains (e.g., 26 for 26%)
  totalExpenseRatio?: number; // Total Expense Ratio (TER) as a percentage (e.g., 0.20 for 0.20%)
  currentPrice: number;
  isLiquid?: boolean; // Default: true - indicates whether the asset is liquid or illiquid
  autoUpdatePrice?: boolean; // Default: true - indicates whether price should be automatically updated via Yahoo Finance
  composition?: AssetComposition[]; // For composite assets (e.g., pension funds with mixed allocation: 60% equity, 40% bonds)
  outstandingDebt?: number; // Outstanding mortgage/loan for real estate. Net value calculation: value - outstandingDebt
  isPrimaryResidence?: boolean; // Indicates if this real estate is the primary residence (excluded from FIRE calculations based on user setting)
  isin?: string; // ISIN code for dividend scraping (optional)
  lastPriceUpdate: Date | Timestamp;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface AssetFormData {
  ticker: string;
  name: string;
  type: AssetType;
  assetClass: AssetClass;
  subCategory?: string;
  currency: string;
  quantity: number;
  averageCost?: number;
  taxRate?: number; // Tax rate percentage for unrealized gains (e.g., 26 for 26%)
  totalExpenseRatio?: number; // Total Expense Ratio (TER) as a percentage (e.g., 0.20 for 0.20%)
  currentPrice: number;
  isLiquid?: boolean;
  autoUpdatePrice?: boolean;
  composition?: AssetComposition[];
  outstandingDebt?: number;
  isPrimaryResidence?: boolean;
  isin?: string; // ISIN code for dividend scraping (optional)
}

export interface SubCategoryConfig {
  enabled: boolean;
  categories: string[];
}

export interface SpecificAssetAllocation {
  name: string; // Ticker or asset name (e.g., "AAPL", "MSFT")
  targetPercentage: number; // Percentage relative to the subcategory
}

export interface SubCategoryTarget {
  targetPercentage: number;
  specificAssetsEnabled?: boolean;
  specificAssets?: SpecificAssetAllocation[];
}

// Asset allocation target structure for portfolio rebalancing.
//
// Structure: assetClass -> targetPercentage / subTargets
// - Top level: asset class (equity, bonds, etc.) with target %
// - Second level: sub-categories (e.g., "US Stocks", "Emerging Markets") with target % relative to asset class
// - Third level: specific assets (e.g., "AAPL", "MSFT") with target % relative to sub-category
//
// Example:
// {
//   "equity": {
//     targetPercentage: 60,
//     subTargets: {
//       "US Stocks": { targetPercentage: 70 },  // 70% of equity = 42% of total portfolio
//       "Emerging Markets": { targetPercentage: 30 }  // 30% of equity = 18% of total
//     }
//   }
// }
export interface AssetAllocationTarget {
  [assetClass: string]: {
    targetPercentage: number;
    useFixedAmount?: boolean;
    fixedAmount?: number;
    subCategoryConfig?: SubCategoryConfig;
    subTargets?: {
      [subCategory: string]: number | SubCategoryTarget; // Support both old (number) and new (SubCategoryTarget) format for backward compatibility. Migrate to SubCategoryTarget when possible.
    };
  };
}

export interface AssetAllocationSettings {
  userAge?: number;
  riskFreeRate?: number;
  withdrawalRate?: number; // Safe withdrawal rate for FIRE calculations (e.g., 4.0 for 4%)
  plannedAnnualExpenses?: number; // Planned annual expenses for FIRE projections
  includePrimaryResidenceInFIRE?: boolean; // If true, include primary residences in FIRE calculations; if false, exclude them (FIRE standard)
  dividendIncomeCategoryId?: string; // Category ID for automatic dividend income entries
  dividendIncomeSubCategoryId?: string; // Subcategory ID for automatic dividend income entries
  targets: AssetAllocationTarget;
}

export interface AllocationData {
  currentPercentage: number;
  currentValue: number;
  targetPercentage: number;
  targetValue: number;
  difference: number;
  differenceValue: number;
  action: 'COMPRA' | 'VENDI' | 'OK';
}

export interface AllocationResult {
  byAssetClass: {
    [assetClass: string]: AllocationData;
  };
  bySubCategory: {
    [subCategory: string]: AllocationData; // Key format: "assetClass:subCategory"
  };
  bySpecificAsset: {
    [specificAsset: string]: AllocationData; // Key format: "assetClass:subCategory:assetName"
  };
  totalValue: number;
}

export interface PieChartData {
  name: string;
  value: number;
  percentage: number;
  color: string;
  [key: string]: any; // Index signature for Recharts compatibility
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface MonthlySnapshot {
  userId: string;
  year: number;
  month: number;
  isDummy?: boolean; // Indicates if this is a test/dummy snapshot
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number; // New field to track illiquid assets separately
  byAssetClass: {
    [assetClass: string]: number;
  };
  byAsset: Array<{
    assetId: string;
    ticker: string;
    name: string;
    quantity: number;
    price: number;
    totalValue: number;
  }>;
  assetAllocation: {
    [assetClass: string]: number;
  };
  createdAt: Date | Timestamp;
  note?: string; // Optional note to document significant financial events (max 500 characters)
}

export interface PriceHistory {
  ticker: string;
  price: number;
  date: Date | Timestamp;
  currency: string;
}

// Monte Carlo Simulation Types
export type PortfolioSource = 'total' | 'liquid' | 'custom';
export type WithdrawalAdjustment = 'inflation' | 'fixed' | 'percentage';
export type ParameterSource = 'market' | 'historical';

export interface MonteCarloParams {
  // Portfolio settings
  portfolioSource: PortfolioSource;
  initialPortfolio: number;

  // Retirement duration
  retirementYears: number;

  // Asset allocation
  equityPercentage: number;
  bondsPercentage: number;

  // Withdrawal settings
  annualWithdrawal: number;
  withdrawalAdjustment: WithdrawalAdjustment;

  // Market parameters
  parameterSource: ParameterSource;
  equityReturn: number;
  equityVolatility: number;
  bondsReturn: number;
  bondsVolatility: number;
  inflationRate: number;

  // Simulation settings
  numberOfSimulations: number;
}

export interface SimulationPath {
  year: number;
  value: number;
}

export interface SingleSimulationResult {
  simulationId: number;
  success: boolean;
  failureYear?: number;
  finalValue: number;
  path: SimulationPath[];
}

export interface PercentilesData {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloResults {
  successRate: number;
  successCount: number;
  failureCount: number;
  medianFinalValue: number;
  percentiles: PercentilesData[];
  failureAnalysis: {
    averageFailureYear: number;
    medianFailureYear: number;
  } | null;
  distribution: {
    range: string;
    count: number;
    percentage: number;
  }[];
  simulations: SingleSimulationResult[];
}

export interface HistoricalReturnsData {
  equity: {
    mean: number;
    volatility: number;
    monthlyReturns: number[];
  };
  bonds: {
    mean: number;
    volatility: number;
    monthlyReturns: number[];
  };
  availableMonths: number;
  startDate: string;
  endDate: string;
}

// Asset Price History Types
export type AssetHistoryDisplayMode = 'price' | 'totalValue';

export interface AssetHistoryDateFilter {
  year: number;
  month: number; // 1-12
}

export interface AssetHistoryTotalRow {
  monthColumns: string[];
  totals: {
    [monthKey: string]: number;
  };
  // Optional percentage fields for total row
  monthlyChanges?: {
    [monthKey: string]: number | undefined;  // undefined = first month (no previous)
  };
  ytd?: number;       // Year-to-date % (undefined if <2 months in current year)
  fromStart?: number; // From start % (undefined if <2 months total)
}
