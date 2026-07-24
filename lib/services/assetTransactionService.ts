'use client';

/**
 * ASSET TRANSACTION SERVICE (client)
 *
 * Reads go through the client SDK directly (Firestore rules allow owner/member reads); every WRITE
 * goes through the Admin API via authenticatedFetch, because a trade must atomically rewrite the
 * asset's derived fields from a full replay (docs/specs/1-asset-transactions/03-service-and-api.md).
 *
 * Query shape: equality filters only (where userId, optionally where assetId) with NO orderBy — the
 * result is sorted in memory. This avoids a composite index (same reasoning as getUserSnapshotsAdmin).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { toDate } from '@/lib/utils/dateHelpers';
import { sortTransactionsForReplay } from '@/lib/utils/assetTransactionUtils';
import {
  ASSET_TRANSACTIONS_COLLECTION,
  ASSET_TRANSACTIONS_META_COLLECTION,
  type AssetTransaction,
  type AssetTransactionFormData,
  type AssetTransactionsMeta,
} from '@/types/assetTransactions';

/** Server response for a create/edit/delete (mirrors TradeMutationResult in the use case). */
export interface AssetTransactionMutationResult {
  transactionId: string;
  derived: { quantity: number; averageCost?: number };
  realizedPnlEur?: number;
}

export type AssetLedgerMigrationResult =
  | { alreadyMigrated: true }
  | { alreadyMigrated?: false; migratedAssetCount: number; baselineDate: string };

// ---------------------------------------------------------------------------
// Reads (client SDK)
// ---------------------------------------------------------------------------

/** Convert a Firestore trade doc into the domain shape (Timestamp → Date at the boundary). */
function docToAssetTransaction(id: string, data: Record<string, unknown>): AssetTransaction {
  return {
    id,
    userId: data.userId as string,
    assetId: data.assetId as string,
    type: data.type as AssetTransaction['type'],
    date: toDate(data.date as never),
    quantity: data.quantity as number,
    pricePerUnit: data.pricePerUnit as number,
    priceEur: data.priceEur as number,
    fees: data.fees as number | undefined,
    linkedCashAssetId: data.linkedCashAssetId as string | undefined,
    isBaseline: data.isBaseline as boolean | undefined,
    note: data.note as string | undefined,
    createdAt: toDate(data.createdAt as never),
    updatedAt: toDate(data.updatedAt as never),
  };
}

/**
 * All ledger trades for an owner, optionally scoped to one asset. Sorted into deterministic replay
 * order (date → same-day rank → createdAt → id) via the pure engine sorter.
 */
export async function getAssetTransactions(
  ownerId: string,
  assetId?: string
): Promise<AssetTransaction[]> {
  const constraints = [where('userId', '==', ownerId)];
  if (assetId) constraints.push(where('assetId', '==', assetId));

  const snapshot = await getDocs(query(collection(db, ASSET_TRANSACTIONS_COLLECTION), ...constraints));
  const transactions = snapshot.docs.map((d) =>
    docToAssetTransaction(d.id, d.data() as Record<string, unknown>)
  );
  return sortTransactionsForReplay(transactions);
}

/** The per-user ledger metadata doc, or null when migration has not run yet. */
export async function getAssetLedgerMeta(ownerId: string): Promise<AssetTransactionsMeta | null> {
  const snapshot = await getDoc(doc(db, ASSET_TRANSACTIONS_META_COLLECTION, ownerId));
  if (!snapshot.exists()) return null;

  const data = snapshot.data() as Record<string, unknown>;
  return {
    userId: data.userId as string,
    migratedAt: toDate(data.migratedAt as never),
    baselineDate: toDate(data.baselineDate as never),
    migratedAssetCount: data.migratedAssetCount as number,
    createdAt: toDate(data.createdAt as never),
    updatedAt: toDate(data.updatedAt as never),
  };
}

// ---------------------------------------------------------------------------
// Writes (Admin API via authenticatedFetch)
// ---------------------------------------------------------------------------

/** Parse a write response, forwarding the server's Italian error message on failure. */
async function parseWriteResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : fallbackMessage;
    throw new Error(message);
  }

  return body as T;
}

export async function createAssetTransaction(
  ownerId: string,
  data: AssetTransactionFormData
): Promise<AssetTransactionMutationResult> {
  const response = await authenticatedFetch('/api/asset-transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ownerId, transaction: data }),
  });
  return parseWriteResponse(response, "Errore durante la registrazione dell'operazione.");
}

export async function updateAssetTransaction(
  ownerId: string,
  transactionId: string,
  updates: Partial<AssetTransactionFormData>
): Promise<AssetTransactionMutationResult> {
  const response = await authenticatedFetch(`/api/asset-transactions/${transactionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ownerId, updates }),
  });
  return parseWriteResponse(response, "Errore durante la modifica dell'operazione.");
}

export async function deleteAssetTransaction(
  ownerId: string,
  transactionId: string
): Promise<AssetTransactionMutationResult> {
  const response = await authenticatedFetch(
    `/api/asset-transactions/${transactionId}?userId=${encodeURIComponent(ownerId)}`,
    { method: 'DELETE' }
  );
  return parseWriteResponse(response, "Errore durante l'eliminazione dell'operazione.");
}

/**
 * Delete every trade for one asset, no replay. Only path this exists for: converting a ledger asset
 * to `pensionFund` in AssetDialog (docs/specs/2-pension-fund/04-ui-and-views.md §1.1) — the asset is
 * leaving the ledger for good, so there is nothing left to reconcile.
 */
export async function deleteAllAssetTransactionsForAsset(
  ownerId: string,
  assetId: string
): Promise<{ deletedCount: number }> {
  const response = await authenticatedFetch(
    `/api/asset-transactions/by-asset/${assetId}?userId=${encodeURIComponent(ownerId)}`,
    { method: 'DELETE' }
  );
  return parseWriteResponse(response, "Errore durante la pulizia del registro operazioni.");
}

/** Idempotent ledger migration for the owner. Silent no-op when already migrated. */
export async function migrateAssetLedger(ownerId: string): Promise<AssetLedgerMigrationResult> {
  const response = await authenticatedFetch('/api/asset-transactions/migrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: ownerId }),
  });
  return parseWriteResponse(response, 'Errore durante la migrazione del registro operazioni.');
}
