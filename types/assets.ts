import { Timestamp } from 'firebase/firestore';

export type AssetType = 'stock' | 'etf' | 'bond' | 'crypto' | 'commodity' | 'cash' | 'realestate';
export type AssetClass = 'equity' | 'bonds' | 'crypto' | 'realestate' | 'cash' | 'commodity';

export interface Asset {
  id: string;
  userId: string;
  ticker: string;
  name: string;
  type: AssetType;
  assetClass: AssetClass;
  subCategory?: string;
  exchange?: string;
  currency: string;
  quantity: number;
  averageCost?: number;
  currentPrice: number;
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
  exchange?: string;
  currency: string;
  quantity: number;
  averageCost?: number;
  currentPrice: number;
}

export interface SubCategoryConfig {
  enabled: boolean;
  categories: string[];
}

export interface AssetAllocationTarget {
  [assetClass: string]: {
    targetPercentage: number;
    subCategoryConfig?: SubCategoryConfig;
    subTargets?: {
      [subCategory: string]: number;
    };
  };
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
