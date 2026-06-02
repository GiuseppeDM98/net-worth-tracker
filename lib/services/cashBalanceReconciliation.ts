/**
 * Cash Balance Reconciliation Service
 *
 * Handles cash asset balance updates when expenses are created, edited, or deleted.
 * Transfer operations are executed atomically via a single Firestore transaction
 * to prevent partial-update corruption on network failure.
 */

import { updateCashAssetBalance, updateCashAssetBalancesAtomic } from '@/lib/services/assetService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransferReconcileParams {
  oldOriginId?: string;
  oldDestId?: string;
  newOriginId?: string;
  newDestId?: string;
  oldAmount: number;
  newAmount: number;
}

export interface SingleReconcileEditParams {
  oldLinkedAssetId?: string;
  newLinkedAssetId?: string;
  oldSignedAmount: number;
  newSignedAmount: number;
}

export interface TransferCreateParams {
  originId?: string;
  destId?: string;
  amount: number;
}

export interface SingleCreateParams {
  linkedAssetId: string;
  signedAmount: number;
}

export interface TransferDeleteParams {
  originId?: string;
  destId?: string;
  amount: number;
}

export interface SingleDeleteParams {
  linkedAssetId: string;
  signedAmount: number;
}

// ─── Reconciliation Functions ─────────────────────────────────────────────────

/**
 * Reconcile cash balances when editing a transfer.
 * All 4 balance updates (reverse old pair + apply new pair) execute atomically
 * in a single Firestore transaction.
 */
export async function reconcileTransferEdit(params: TransferReconcileParams): Promise<boolean> {
  const { oldOriginId, oldDestId, newOriginId, newDestId, oldAmount, newAmount } = params;

  // Aggregate net deltas per asset (handles the case where old and new IDs overlap)
  const deltas = new Map<string, number>();
  const apply = (id: string | undefined, delta: number) => {
    if (!id) return;
    deltas.set(id, (deltas.get(id) ?? 0) + delta);
  };

  apply(oldOriginId, +oldAmount);   // reverse old origin debit
  apply(oldDestId, -oldAmount);     // reverse old destination credit
  apply(newOriginId, -newAmount);   // apply new origin debit
  apply(newDestId, +newAmount);     // apply new destination credit

  const updates = Array.from(deltas.entries()).map(([assetId, signedDelta]) => ({ assetId, signedDelta }));
  if (updates.length === 0) return false;

  await updateCashAssetBalancesAtomic(updates);
  return true;
}

/**
 * Reconcile cash balance when editing a non-transfer expense.
 * Handles same-asset delta optimization and cross-asset swaps.
 * Returns true if any asset was updated.
 */
export async function reconcileSingleEdit(params: SingleReconcileEditParams): Promise<boolean> {
  const { oldLinkedAssetId, newLinkedAssetId, oldSignedAmount, newSignedAmount } = params;

  if (oldLinkedAssetId && newLinkedAssetId && oldLinkedAssetId === newLinkedAssetId) {
    const delta = newSignedAmount - oldSignedAmount;
    if (Math.abs(delta) > 0.001) {
      await updateCashAssetBalance(oldLinkedAssetId, delta);
      return true;
    }
    return false;
  }

  let updated = false;
  if (oldLinkedAssetId) {
    await updateCashAssetBalance(oldLinkedAssetId, -oldSignedAmount);
    updated = true;
  }
  if (newLinkedAssetId) {
    await updateCashAssetBalance(newLinkedAssetId, newSignedAmount);
    updated = true;
  }
  return updated;
}

/**
 * Apply cash balance changes when creating a transfer.
 * Origin debit and destination credit execute atomically.
 */
export async function reconcileTransferCreate(params: TransferCreateParams): Promise<boolean> {
  const { originId, destId, amount } = params;

  const updates: { assetId: string; signedDelta: number }[] = [];
  if (originId) updates.push({ assetId: originId, signedDelta: -amount });
  if (destId) updates.push({ assetId: destId, signedDelta: amount });

  if (updates.length === 0) return false;

  await updateCashAssetBalancesAtomic(updates);
  return true;
}

/**
 * Apply cash balance changes when creating a single (non-transfer) expense.
 */
export async function reconcileSingleCreate(params: SingleCreateParams): Promise<void> {
  await updateCashAssetBalance(params.linkedAssetId, params.signedAmount);
}

/**
 * Reverse cash balance changes when deleting a transfer.
 * Origin credit and destination debit execute atomically.
 */
export async function reconcileTransferDelete(params: TransferDeleteParams): Promise<boolean> {
  const { originId, destId, amount } = params;

  const updates: { assetId: string; signedDelta: number }[] = [];
  if (originId) updates.push({ assetId: originId, signedDelta: +amount });
  if (destId) updates.push({ assetId: destId, signedDelta: -amount });

  if (updates.length === 0) return false;

  await updateCashAssetBalancesAtomic(updates);
  return true;
}
