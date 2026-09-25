/**
 * Broker connection metadata — what the last Scalable sync brought in, per account.
 *
 * This stores ONLY sync metadata (when, how many positions, cash residual): never tokens,
 * never credentials, never raw broker output. The CLI session stays in the OS keyring where
 * `sc login` put it. Document id == ownerUid, same posture as `budgets/{userId}`.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';

const BROKER_CONNECTIONS_COLLECTION = 'brokerConnections';

export interface BrokerConnection {
  userId: string;
  broker: 'scalable';
  lastSyncAt: Date;
  holdingsCount: number;
  skippedCount?: number;
  cashBalance?: number;
  cashAssetId?: string;
  /** The overnight «Deposito non vincolato» — a SEPARATE balance from `cashBalance`. */
  depositBalance?: number;
  depositAssetId?: string;
  /** Annual rate as a fraction (0.026 = 2,6%), as last read. Declared, never accrued locally. */
  depositInterestRate?: number;
  createdAssets?: number;
  updatedPrices?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type BrokerConnectionSave = Pick<
  BrokerConnection,
  'holdingsCount' | 'cashBalance' | 'cashAssetId' | 'depositBalance' | 'depositAssetId' | 'depositInterestRate' | 'createdAssets' | 'updatedPrices'
> &
  Partial<Pick<BrokerConnection, 'skippedCount' | 'lastSyncAt'>>;

function toBrokerConnection(userId: string, data: Record<string, unknown>): BrokerConnection {
  const toDate = (value: unknown, fallback: Date): Date => {
    if (value instanceof Date) return value;
    if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    return fallback;
  };
  const now = new Date();
  return {
    userId,
    broker: 'scalable',
    lastSyncAt: toDate(data['lastSyncAt'], now),
    holdingsCount: typeof data['holdingsCount'] === 'number' ? data['holdingsCount'] : 0,
    skippedCount: typeof data['skippedCount'] === 'number' ? data['skippedCount'] : undefined,
    cashBalance: typeof data['cashBalance'] === 'number' ? data['cashBalance'] : undefined,
    cashAssetId: typeof data['cashAssetId'] === 'string' ? data['cashAssetId'] : undefined,
    depositBalance: typeof data['depositBalance'] === 'number' ? data['depositBalance'] : undefined,
    depositAssetId: typeof data['depositAssetId'] === 'string' ? data['depositAssetId'] : undefined,
    depositInterestRate:
      typeof data['depositInterestRate'] === 'number' ? data['depositInterestRate'] : undefined,
    createdAt: toDate(data['createdAt'], now),
    updatedAt: toDate(data['updatedAt'], now),
  };
}

export async function getBrokerConnection(ownerId: string): Promise<BrokerConnection | null> {
  const ref = doc(db, BROKER_CONNECTIONS_COLLECTION, ownerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return toBrokerConnection(ownerId, snap.data());
}

export async function saveBrokerConnection(ownerId: string, data: BrokerConnectionSave): Promise<void> {
  const ref = doc(db, BROKER_CONNECTIONS_COLLECTION, ownerId);
  const now = new Date();
  const payload = removeUndefinedDeep({
    userId: ownerId,
    broker: 'scalable',
    ...data,
    lastSyncAt: data.lastSyncAt ?? now,
    updatedAt: now,
  });
  const existing = await getDoc(ref);
  await setDoc(
    ref,
    existing.exists() ? payload : { ...payload, createdAt: now },
    { merge: true }
  );
}