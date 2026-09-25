/**
 * The server half of «a linked row moves its account on its own date» (lib/utils/cashSettlement.ts):
 * every row of a user still `balancePending` whose Italian date has arrived moves its account(s)
 * now, and the flag goes away — absent means applied.
 *
 * Called at the top of the snapshot route (`/api/portfolio/snapshot`), which the daily cron and the
 * «Crea snapshot» button both reach: the photo of the month is always taken AFTER the day's
 * instalments have left the account, whatever order the two crons run in (both are `0 18 * * *`).
 *
 * Idempotent by construction: each row is re-read inside the transaction and settled only while
 * it is still pending, so a second run (or two snapshots racing) moves nothing twice. A row whose
 * account no longer exists — or belongs to someone else — is marked settled without moving
 * anything, or it would wait forever.
 *
 * A `debt` row linked to a property also pays down its debt here (lib/utils/mortgageRepayment.ts):
 * the principal of each due instalment, in date order on the debt as it stands, stamped on the row
 * (`debtPrincipalRepaid`) in the same transaction — so the snapshot that follows photographs the
 * property net of the month's principal, and Storico's «mutuo» measures it.
 */

import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { toDate } from '@/lib/utils/dateHelpers';
import { balanceEffectsOf, netBalanceEffects, repaysDebt, settlesLater, type SettlementRow } from '@/lib/utils/cashSettlement';
import { planDebtRepayments, type DebtRow, type PropertyDebt } from '@/lib/utils/mortgageRepayment';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';

/** Rows per transaction: each costs a read and a write, plus one read and write per account. */
const ROWS_PER_TRANSACTION = 150;

export interface SettlementResult {
  /** Rows that moved (or were cleared) in this run. */
  settled: number;
}

/**
 * Settle the user's pending rows dated on or before `now` (Italian calendar day). Non-throwing for
 * the caller's sake would hide a real failure, so it throws; the snapshot route logs and goes on.
 */
export async function settleDueBalances(userId: string, now: Date): Promise<SettlementResult> {
  const pending = await adminDb.collection('expenses').where('userId', '==', userId).where('balancePending', '==', true).get();
  const due = pending.docs.filter((doc) => !settlesLater(toDate(doc.data().date), now)).map((doc) => doc.ref);
  if (due.length === 0) return { settled: 0 };

  let settled = 0;
  for (let i = 0; i < due.length; i += ROWS_PER_TRANSACTION) {
    settled += await settleChunk(userId, due.slice(i, i + ROWS_PER_TRANSACTION), now);
  }
  if (settled > 0) await invalidateDashboardOverviewSummaryServer(userId, 'scheduled_balances_settled');
  return { settled };
}

async function settleChunk(userId: string, refs: DocumentReference[], now: Date): Promise<number> {
  return adminDb.runTransaction(async (tx) => {
    // ALL reads before ANY write (Firestore transactions): the rows, then the accounts and the
    // properties they move.
    const rowSnaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const rows = rowSnaps.filter((snap) => {
      const data = snap.data();
      return snap.exists && data?.userId === userId && data.balancePending === true && !settlesLater(toDate(data.date), now);
    });
    const effects = netBalanceEffects(rows.flatMap((snap) => balanceEffectsOf(snap.data() as SettlementRow)));
    const assetRefs = effects.map((effect) => adminDb.collection('assets').doc(effect.assetId));
    const assetSnaps = await Promise.all(assetRefs.map((ref) => tx.get(ref)));

    const debtRows: DebtRow[] = rows
      .map((snap) => ({ ...(snap.data() as Omit<DebtRow, 'id' | 'date'>), id: snap.id, date: toDate(snap.data()!.date) }))
      .filter(repaysDebt);
    const propertyIds = [...new Set(debtRows.map((row) => row.debtAssetId!))];
    const propertySnaps = await Promise.all(propertyIds.map((id) => tx.get(adminDb.collection('assets').doc(id))));

    effects.forEach((effect, index) => {
      const asset = assetSnaps[index];
      if (!asset.exists || asset.data()?.userId !== userId) {
        console.warn('[cashSettlement] Skipping an account that is missing or not the user\'s', { userId, assetId: effect.assetId });
        return;
      }
      tx.update(assetRefs[index], { quantity: (asset.data()!.quantity as number) + effect.delta, updatedAt: new Date() });
    });

    // A property missing or someone else's is left out of `debts`: its rows repay 0 and settle.
    const debts = new Map<string, PropertyDebt>();
    propertySnaps.forEach((snap, index) => {
      const data = snap.data();
      if (!snap.exists || data?.userId !== userId) {
        console.warn('[cashSettlement] Skipping a property that is missing or not the user\'s', { userId, assetId: propertyIds[index] });
        return;
      }
      debts.set(propertyIds[index], { debt: (data.outstandingDebt as number | undefined) ?? 0, annualRatePct: data.debtInterestRate as number | undefined });
    });
    const plan = planDebtRepayments(debtRows, debts);
    for (const [assetId, debt] of plan.debts) {
      tx.update(adminDb.collection('assets').doc(assetId), { outstandingDebt: debt, updatedAt: new Date() });
    }

    for (const snap of rows) {
      const principal = plan.principals.get(snap.id);
      tx.update(snap.ref, {
        balancePending: FieldValue.delete(),
        ...(principal !== undefined ? { debtPrincipalRepaid: principal, debtInterestPaid: plan.interests.get(snap.id) ?? 0 } : {}),
        updatedAt: new Date(),
      });
    }
    return rows.length;
  });
}
