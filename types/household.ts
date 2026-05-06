import type { Timestamp } from 'firebase/firestore';
import type { ExpenseType } from './expenses';

export const DEFAULT_PARTICIPANT_SELF_ID = 'self';

export const DEFAULT_PROFILE_SELF_ID = 'self-100';

export interface HouseholdParticipant {
  id: string;
  userId?: string;
  name: string;
  role: 'self' | 'partner' | 'other';
  sortOrder: number;
  active: boolean;
  isDefault?: boolean;
}

export interface OwnershipSplit {
  participantId: string;
  participantName: string;
  percentage: number;
}

export type OwnershipProfileType = 'personal' | 'shared' | 'custom';

export interface OwnershipProfile {
  id: string;
  userId?: string;
  name: string;
  type: OwnershipProfileType;
  splits: OwnershipSplit[];
  sortOrder: number;
  active: boolean;
  isDefault?: boolean;
}

export interface AttributionRule {
  id: string;
  userId?: string;
  name: string;
  active: boolean;
  sortOrder: number;
  expenseType?: ExpenseType;
  categoryId?: string;
  categoryName?: string;
  subCategoryId?: string;
  subCategoryName?: string;
  linkedCashAssetId?: string;
  ownershipProfileId: string;
  ownershipProfileName: string;
  ownershipSplits: OwnershipSplit[];
}

export interface HouseholdConfig {
  userId: string;
  enabled: boolean;
  participants: HouseholdParticipant[];
  profiles: OwnershipProfile[];
  attributionRules: AttributionRule[];
  defaultAssetProfileId: string;
  defaultExpenseProfileId: string;
  defaultIncomeProfileId: string;
  createdAt?: Date | Timestamp;
  updatedAt?: Date | Timestamp;
}

export type HouseholdAuditEntityType =
  | 'asset'
  | 'expense'
  | 'internalTransfer'
  | 'budget'
  | 'householdConfig'
  | 'snapshot';

export type HouseholdAuditAction = 'create' | 'update' | 'delete' | 'snapshot';

export interface HouseholdAuditEntry {
  id?: string;
  userId: string;
  entityType: HouseholdAuditEntityType;
  entityId: string;
  action: HouseholdAuditAction;
  summary: string;
  before?: unknown;
  after?: unknown;
  createdAt: Date | Timestamp;
}

export type InternalTransferPurpose =
  | 'neutral_transfer'
  | 'shared_funding'
  | 'reimbursement'
  | 'settlement'
  | 'ownership_adjustment';

export const INTERNAL_TRANSFER_PURPOSE_LABELS: Record<InternalTransferPurpose, string> = {
  neutral_transfer: 'Trasferimento neutro',
  shared_funding: 'Alimentazione conto comune',
  reimbursement: 'Rimborso',
  settlement: 'Compensazione',
  ownership_adjustment: 'Riallineamento proprietà',
};
