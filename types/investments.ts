import { Timestamp } from 'firebase/firestore';

export type InvestmentOperationType = 'buy' | 'sell' | 'contribution' | 'withdrawal' | 'fee' | 'tax';

export interface InvestmentOperation {
  id: string;
  userId: string;
  assetId: string;
  assetName: string;
  assetTicker: string;
  type: InvestmentOperationType;
  date: Date | Timestamp;
  quantity: number;
  pricePerUnit: number;
  grossAmount: number;
  fees: number;
  taxes: number;
  currency: string;
  cashAssetId?: string;
  cashAssetName?: string;
  linkedExpenseId?: string;
  notes?: string;
  previousQuantity: number;
  previousAverageCost?: number;
  resultingQuantity: number;
  resultingAverageCost?: number;
  realizedGain?: number;
  realizedGainTax?: number;
  netCashEffect: number;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface InvestmentOperationFormData {
  assetId: string;
  type: InvestmentOperationType;
  date: Date;
  quantity: number;
  pricePerUnit: number;
  fees?: number;
  taxes?: number;
  currency?: string;
  cashAssetId?: string;
  cashAssetName?: string;
  linkedExpenseId?: string;
  notes?: string;
}

export interface RealizedInvestmentSummary {
  totalRealizedGain: number;
  totalRealizedTaxes: number;
  totalNetRealizedGain: number;
  sellsCount: number;
  byAsset: Array<{
    assetId: string;
    assetName: string;
    assetTicker: string;
    realizedGain: number;
    realizedTaxes: number;
    netRealizedGain: number;
    sellsCount: number;
  }>;
}

export interface InternalTransfer {
  id: string;
  userId: string;
  fromCashAssetId: string;
  fromCashAssetName: string;
  toCashAssetId: string;
  toCashAssetName: string;
  amount: number;
  currency: string;
  date: Date | Timestamp;
  fees?: number;
  notes?: string;
  linkedExpenseId?: string;
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
}

export interface InternalTransferFormData {
  fromCashAssetId: string;
  toCashAssetId: string;
  amount: number;
  currency?: string;
  date: Date;
  fees?: number;
  notes?: string;
  linkedExpenseId?: string;
}
