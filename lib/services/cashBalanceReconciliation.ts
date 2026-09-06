/**
 * Cash Balance Reconciliation Service
 *
 * Handles cash asset balance updates when expenses are created, edited, or deleted.
 * Transfer operations — including edits that re-type a row across the transfer
 * boundary (transfer ↔ spesa/entrata) — are executed atomically via a single
 * Firestore transaction to prevent partial-update corruption on network failure.
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

export interface TransferToSingleParams {
  oldOriginId?: string;
  oldDestId?: string;
  /** Absolute amount of the old transfer (transfers are stored positive). */
  oldAmount: number;
  newLinkedAssetId?: string;
  /** Signed per convention: income positive, expenses negative. */
  newSignedAmount: number;
}

export interface SingleToTransferParams {
  oldLinkedAssetId?: string;
  /** Signed as stored: income positive, expenses negative. */
  oldSignedAmount: number;
  newOriginId?: string;
  newDestId?: string;
  /** Absolute amount of the new transfer. */
  newAmount: number;
}

export interface TransferCreateParams {
  originId?: string;
  destId?: string;
  amount: number;
}

interface SingleCreateParams {
  linkedAssetId: string;
  signedAmount: number;
}

export interface TransferDeleteParams {
  originId?: string;
  destId?: string;
  amount: number;
}

// ─── Reconciliation Functions ─────────────────────────────────────────────────

/**
 * Aggregate per-asset deltas (old and new sides may share an account), drop the
 * ones that cancel out, and commit the rest in a single Firestore transaction.
 * Returns true if any balance was written.
 */
async function commitNetDeltas(entries: Array<[id: string | undefined, delta: number]>): Promise<boolean> {
  const deltas = new Map<string, number>();
  for (const [id, delta] of entries) {
    if (!id) continue;
    deltas.set(id, (deltas.get(id) ?? 0) + delta);
  }

  const updates = Array.from(deltas.entries())
    .filter(([, signedDelta]) => Math.abs(signedDelta) > 0.001)
    .map(([assetId, signedDelta]) => ({ assetId, signedDelta }));
  if (updates.length === 0) return false;

  await updateCashAssetBalancesAtomic(updates);
  return true;
}

/**
 * Reconcile cash balances when editing a transfer.
 * All 4 balance updates (reverse old pair + apply new pair) execute atomically
 * in a single Firestore transaction.
 */
export async function reconcileTransferEdit(params: TransferReconcileParams): Promise<boolean> {
  const { oldOriginId, oldDestId, newOriginId, newDestId, oldAmount, newAmount } = params;

  return commitNetDeltas([
    [oldOriginId, +oldAmount],  // reverse old origin debit
    [oldDestId, -oldAmount],    // reverse old destination credit
    [newOriginId, -newAmount],  // apply new origin debit
    [newDestId, +newAmount],    // apply new destination credit
  ]);
}

/**
 * Reconcile cash balances when an edit re-types a transfer into a single-account
 * entry (spesa/entrata): reverse the old origin/destination pair, then apply the
 * new signed amount to the linked account. Atomic, so a same-account re-type
 * (origin becomes the linked account) nets out instead of double-writing.
 */
export async function reconcileTransferToSingleEdit(params: TransferToSingleParams): Promise<boolean> {
  const { oldOriginId, oldDestId, oldAmount, newLinkedAssetId, newSignedAmount } = params;

  return commitNetDeltas([
    [oldOriginId, +oldAmount],            // reverse old origin debit
    [oldDestId, -oldAmount],              // reverse old destination credit
    [newLinkedAssetId, newSignedAmount],  // apply new single-account effect
  ]);
}

/**
 * Reconcile cash balances when an edit re-types a single-account entry
 * (spesa/entrata) into a transfer: reverse the old signed effect, then apply the
 * new origin debit / destination credit pair. The reversal is -oldSignedAmount,
 * so a former income (stored positive) is debited back — not re-credited.
 */
export async function reconcileSingleToTransferEdit(params: SingleToTransferParams): Promise<boolean> {
  const { oldLinkedAssetId, oldSignedAmount, newOriginId, newDestId, newAmount } = params;

  return commitNetDeltas([
    [oldLinkedAssetId, -oldSignedAmount],  // reverse old single-account effect
    [newOriginId, -newAmount],             // apply new origin debit
    [newDestId, +newAmount],               // apply new destination credit
  ]);
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
