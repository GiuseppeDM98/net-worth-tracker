/**
 * Cash Balance Reconciliation Service
 *
 * Moves cash balances when expenses are created, edited or deleted, always in ONE Firestore
 * transaction per save so a network failure cannot leave half of a transfer written. WHICH
 * rows move an account, and when, is decided by the pure rule in lib/utils/cashSettlement.ts
 * (a linked row moves it on its own date); this module only commits the effects.
 */

import { updateCashAssetBalancesAtomic } from '@/lib/services/assetService';
import { appliedBalanceEffectsOf, netBalanceEffects, reverseBalanceEffects, type BalanceEffect, type SettlementRow } from '@/lib/utils/cashSettlement';
import { reverseDebtRepayments } from '@/lib/services/debtRepaymentService';
import type { Expense } from '@/types/expenses';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransferCreateParams {
  originId?: string;
  destId?: string;
  amount: number;
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
 * Apply a list of balance effects (lib/utils/cashSettlement.ts) in ONE transaction, netted per
 * account. The expense form's create and edit paths go through here: the effects already say
 * which rows move now and which wait for their date. Returns true if any balance was written.
 */
export async function applyBalanceEffects(effects: BalanceEffect[]): Promise<boolean> {
  return commitNetDeltas(netBalanceEffects(effects).map(({ assetId, delta }) => [assetId, delta]));
}

/**
 * Give back what the given rows have APPLIED to their accounts, in one transaction — a row still
 * waiting for its date (`balancePending`) moved nothing and gives back nothing. Every delete path
 * (a single row, a whole series) calls this before removing the documents. A mortgage instalment
 * linked to a property also gives back the principal it repaid (lib/utils/mortgageRepayment.ts):
 * the property's debt is a balance the row moved, like the account. Returns true when anything moved.
 */
export async function reverseAppliedBalances(rows: (SettlementRow & Pick<Expense, 'debtPrincipalRepaid'>)[]): Promise<boolean> {
  const balancesMoved = await applyBalanceEffects(reverseBalanceEffects(rows.flatMap(appliedBalanceEffectsOf)));
  const debtsMoved = await reverseDebtRepayments(rows);
  return balancesMoved || debtsMoved;
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
