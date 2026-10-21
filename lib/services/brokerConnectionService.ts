/**
 * Broker connection metadata — what the last sync brought in, per account AND per broker.
 *
 * This stores ONLY sync metadata (when, how many positions, cash, savings plans): never tokens,
 * never credentials, never raw broker output. A Trade Republic session is a live credential and
 * lives in `brokerSessions/{ownerId}` through the Admin SDK instead — see
 * `lib/server/tradeRepublicClient.ts`. The Scalable session is in the OS keyring of the machine
 * running `sc login`, and never was here.
 *
 * DOC ID IS THE BROKER, NOT THE OWNER. With one broker the document id was the owner uid, which
 * the Firestore rules read as `canAccess(userId)`. Two brokers need two documents per owner, and a
 * flat id cannot carry both without the rules having to parse a composite key — Firestore rules
 * cannot substring, so the id became a SUBCOLLECTION: the parent keeps the owner uid (the rules
 * above it are untouched) and `brokers/{broker}` is the per-broker leaf.
 *
 * A pre-existing `brokerConnections/{ownerId}` document from the single-broker era is superseded
 * and NOT migrated, on purpose: every field it holds (`lastSyncAt`, the counts, the asset ids) is
 * rewritten by the next sync, so the only thing lost is the «quando» of a past read. A migration
 * would be code that exists to move a timestamp.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';

const BROKER_CONNECTIONS_COLLECTION = 'brokerConnections';

/**
 * The providers with a read-only bridge. The id is the subcollection leaf, so it must be stable.
 * `intesa` is a file import (its `.xlsx` export), not a live session: the metadata shape is the
 * same, and the tile reads the file the user chooses.
 */
export const BROKERS = ['scalable', 'traderepublic', 'intesa', 'azimut'] as const;
export type BrokerId = (typeof BROKERS)[number];

export function isBrokerId(value: string): value is BrokerId {
  return (BROKERS as readonly string[]).includes(value);
}

export interface BrokerConnection {
  userId: string;
  broker: BrokerId;
  lastSyncAt: Date;
  holdingsCount: number;
  skippedCount?: number;
  cashBalance?: number;
  cashAssetId?: string;
  /** The overnight «Deposito non vincolato» — a Scalable SEPARATE balance from `cashBalance`. */
  depositBalance?: number;
  depositAssetId?: string;
  /** Annual rate as a fraction (0.026 = 2,6%), as last read. Declared, never accrued locally. */
  depositInterestRate?: number;
  /** Trade Republic savings plans («Sparpläne») as last read. DECLARED, never written. */
  savingsPlanCount?: number;
  createdAssets?: number;
  updatedPrices?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type BrokerConnectionSave = Pick<
  BrokerConnection,
  'holdingsCount' | 'cashBalance' | 'cashAssetId' | 'depositBalance' | 'depositAssetId' | 'depositInterestRate' | 'createdAssets' | 'updatedPrices'
> &
  Partial<
    Pick<
      BrokerConnection,
      'skippedCount' | 'lastSyncAt' | 'depositAssetId' | 'savingsPlanCount'
    >
  >;

function connectionRef(ownerId: string, broker: BrokerId) {
  return doc(db, BROKER_CONNECTIONS_COLLECTION, ownerId, 'brokers', broker);
}

function toBrokerConnection(
  ownerId: string,
  broker: BrokerId,
  data: Record<string, unknown>
): BrokerConnection {
  const toDate = (value: unknown, fallback: Date): Date => {
    if (value instanceof Date) return value;
    if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate();
    }
    return fallback;
  };
  const now = new Date();
  return {
    userId: ownerId,
    broker,
    lastSyncAt: toDate(data['lastSyncAt'], now),
    holdingsCount: typeof data['holdingsCount'] === 'number' ? data['holdingsCount'] : 0,
    skippedCount: typeof data['skippedCount'] === 'number' ? data['skippedCount'] : undefined,
    cashBalance: typeof data['cashBalance'] === 'number' ? data['cashBalance'] : undefined,
    cashAssetId: typeof data['cashAssetId'] === 'string' ? data['cashAssetId'] : undefined,
    depositBalance: typeof data['depositBalance'] === 'number' ? data['depositBalance'] : undefined,
    depositAssetId: typeof data['depositAssetId'] === 'string' ? data['depositAssetId'] : undefined,
    depositInterestRate:
      typeof data['depositInterestRate'] === 'number' ? data['depositInterestRate'] : undefined,
    savingsPlanCount:
      typeof data['savingsPlanCount'] === 'number' ? data['savingsPlanCount'] : undefined,
    createdAssets: typeof data['createdAssets'] === 'number' ? data['createdAssets'] : undefined,
    updatedPrices: typeof data['updatedPrices'] === 'number' ? data['updatedPrices'] : undefined,
    createdAt: toDate(data['createdAt'], now),
    updatedAt: toDate(data['updatedAt'], now),
  };
}

export async function getBrokerConnection(
  ownerId: string,
  broker: BrokerId = 'scalable'
): Promise<BrokerConnection | null> {
  const snap = await getDoc(connectionRef(ownerId, broker));
  if (!snap.exists()) return null;
  return toBrokerConnection(ownerId, broker, snap.data());
}

export async function saveBrokerConnection(
  ownerId: string,
  data: BrokerConnectionSave,
  broker: BrokerId = 'scalable'
): Promise<void> {
  const ref = connectionRef(ownerId, broker);
  const now = new Date();
  const payload = removeUndefinedDeep({
    userId: ownerId,
    broker,
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

export async function getAllBrokerConnections(
  ownerId: string
): Promise<Record<BrokerId, BrokerConnection | null>> {
  const result: Record<BrokerId, BrokerConnection | null> = {
    scalable: null,
    traderepublic: null,
    intesa: null,
    azimut: null,
  };
  await Promise.all(
    BROKERS.map(async (broker) => {
      const conn = await getBrokerConnection(ownerId, broker);
      result[broker] = conn;
    })
  );
  return result;
}
