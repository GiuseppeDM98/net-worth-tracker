import { Timestamp } from 'firebase/firestore';

export type AssetType = 'stock' | 'etf' | 'bond' | 'crypto' | 'commodity' | 'cash' | 'realestate';
export type AssetClass = 'equity' | 'bonds' | 'crypto' | 'realestate' | 'cash' | 'commodity';

export interface AssetComposition {
  assetClass: AssetClass;
  percentage: number;
  subCategory?: string; // Specific sub-category for this component of the composite asset
}

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
  currentPrice: number;
  isLiquid?: boolean; // Default: true - indicates whether the asset is liquid or illiquid
  autoUpdatePrice?: boolean; // Default: true - indicates whether price should be automatically updated via Yahoo Finance
  composition?: AssetComposition[]; // For composite assets (e.g., pension funds)
  outstandingDebt?: number; // Outstanding debt for real estate (e.g., mortgage). Net value = value - outstanding debt
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
  currentPrice: number;
  isLiquid?: boolean;
  autoUpdatePrice?: boolean;
  composition?: AssetComposition[];
  outstandingDebt?: number;
}

export interface SubCategoryConfig {
  enabled: boolean;
  categories: string[];
}

export interface AssetAllocationTarget {
  [assetClass: string]: {
    targetPercentage: number;
    useFixedAmount?: boolean;
    fixedAmount?: number;
    subCategoryConfig?: SubCategoryConfig;
    subTargets?: {
      [subCategory: string]: number;
    };
  };
}

export interface AssetAllocationSettings {
  userAge?: number;
  riskFreeRate?: number;
  withdrawalRate?: number; // Safe withdrawal rate for FIRE calculations (e.g., 4.0 for 4%)
  plannedAnnualExpenses?: number; // Planned annual expenses for FIRE projections
  targets: AssetAllocationTarget;
}

export interface AllocationResult {
  byAssetClass: {
    [assetClass: string]: {
      currentPercentage: number;
      currentValue: number;
      targetPercentage: number;
      targetValue: number;
      difference: number;
      differenceValue: number;
      action: 'COMPRA' | 'VENDI' | 'OK';
    };
  };
  bySubCategory: {
    [subCategory: string]: {
      currentPercentage: number;
      currentValue: number;
      targetPercentage: number;
      targetValue: number;
      difference: number;
      differenceValue: number;
      action: 'COMPRA' | 'VENDI' | 'OK';
    };
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
