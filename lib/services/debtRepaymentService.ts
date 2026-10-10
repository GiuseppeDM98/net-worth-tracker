/**
 * Debt Repayment Service — commits what lib/utils/mortgageRepayment.ts decides: a `debt` row linked
 * to a loan lowers its outstanding principal by the instalment's principal, on the row's date.
 *
 * The client half, for the rows that have ALREADY happened when they are saved, edited or deleted;
 * the rows still to come are settled on their day by the server (lib/server/cashSettlement.ts),
 * with the same pure plan. Every write is ONE transaction that reads the loans first, moves
 * their debt and stamps each row with the principal it repaid (`debtPrincipalRepaid`), so the
 * stamp and the debt can never disagree.
 *
 * Where the debt lives on the document (a loan's `quantity`, a legacy property's `outstandingDebt`)
 * is `debtBalanceField`'s knowledge, never spelled here.
 */

import { deleteField, doc, runTransaction, updateDoc, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import {
  debtBalanceField,
  debtGivenBackBy,
  loanDebtOf,
  planDebtEdit,
  planDebtRepayments,
  splitInstalment,
  type DebtAssetFields,
  type DebtRow,
  type LoanDebt,
} from '@/lib/utils/mortgageRepayment';
import type { Expense } from '@/types/expenses';

const ASSETS_COLLECTION = 'assets';
const EXPENSES_COLLECTION = 'expenses';

const toCents = (value: number) => Math.round(value * 100) / 100;

function debtFieldsOf(data: DocumentData): DebtAssetFields {
  return data as DebtAssetFields;
}

/** The update that sets an asset's debt to `debt`, on the field its type keeps it in. */
function debtUpdate(asset: DebtAssetFields, debt: number): Record<string, unknown> {
  return { [debtBalanceField(asset)]: debt, updatedAt: new Date() };
}

/**
 * Apply the principal of rows that have happened (already written, linked to a loan) to their
 * loans' debt, in date order, and stamp each row with what it repaid. Returns true when
 * anything was written.
 */
export async function applyDebtRepayments(rows: DebtRow[]): Promise<boolean> {
  if (rows.length === 0) return false;
  const assetIds = [...new Set(rows.map((row) => row.debtAssetId!))];
  let userId: string | undefined;

  await runTransaction(db, async (tx) => {
    // ALL reads before ANY write (Firestore transactions).
    const snaps = await Promise.all(assetIds.map((id) => tx.get(doc(db, ASSETS_COLLECTION, id))));
    const debts = new Map<string, LoanDebt>();
    const assets = new Map<string, DebtAssetFields>();
    snaps.forEach((snap, index) => {
      if (!snap.exists()) return;
      const fields = debtFieldsOf(snap.data());
      assets.set(assetIds[index], fields);
      debts.set(assetIds[index], loanDebtOf(fields));
      userId ??= snap.data().userId as string;
    });
    const plan = planDebtRepayments(rows, debts);
    for (const [assetId, debt] of plan.debts) {
      tx.update(doc(db, ASSETS_COLLECTION, assetId), debtUpdate(assets.get(assetId)!, debt));
    }
    for (const row of rows) {
      tx.update(doc(db, EXPENSES_COLLECTION, row.id), {
        debtPrincipalRepaid: plan.principals.get(row.id) ?? 0,
        debtInterestPaid: plan.interests.get(row.id) ?? 0,
        updatedAt: new Date(),
      });
    }
  });

  if (userId) await invalidateDashboardOverviewSummary(userId, 'debt_repaid');
  return true;
}

/**
 * Give back to each loan the principal the rows had repaid — every delete path calls this
 * (through `reverseAppliedBalances`) before removing the rows. A row still waiting for its date
 * repaid nothing and gives nothing back. Returns true when a debt moved.
 */
export async function reverseDebtRepayments(rows: Pick<Expense, 'debtAssetId' | 'debtPrincipalRepaid' | 'balancePending'>[]): Promise<boolean> {
  const givenBack = debtGivenBackBy(rows);
  if (givenBack.size === 0) return false;
  const assetIds = [...givenBack.keys()];
  let userId: string | undefined;

  await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(assetIds.map((id) => tx.get(doc(db, ASSETS_COLLECTION, id))));
    snaps.forEach((snap, index) => {
      if (!snap.exists()) return;
      userId ??= snap.data().userId as string;
      const fields = debtFieldsOf(snap.data());
      tx.update(snap.ref, debtUpdate(fields, toCents(loanDebtOf(fields).debt + givenBack.get(assetIds[index])!)));
    });
  });

  if (userId) await invalidateDashboardOverviewSummary(userId, 'debt_repayment_reversed');
  return true;
}

/**
 * What an edit does to the debt, in one transaction (`planDebtEdit`): the principal the old row
 * had repaid given back, and the edited row — when it has happened and still repays a loan —
 * split again on the debt as it now stands and stamped. An edit that touches nothing the
 * repayment depends on writes nothing. Returns true when a debt moved.
 */
export async function applyDebtRepaymentEdit(
  rowId: string,
  before: Pick<Expense, 'type' | 'amount' | 'debtAssetId' | 'isDebtPayoff' | 'debtPrincipalRepaid' | 'balancePending'>,
  after: Pick<Expense, 'type' | 'amount' | 'debtAssetId' | 'isDebtPayoff'> & { date: Date },
  now: Date
): Promise<boolean> {
  const plan = planDebtEdit(before, after, now);
  if (plan.unchanged) return false;
  if (!plan.giveBack && !plan.applyNow) {
    // Nothing to move; a stamp left on a row that no longer repays anything goes with it.
    if (before.debtPrincipalRepaid === undefined) return false;
    await updateDoc(doc(db, EXPENSES_COLLECTION, rowId), { debtPrincipalRepaid: deleteField(), debtInterestPaid: deleteField() });
    return false;
  }

  const assetIds = [...new Set([plan.giveBack?.assetId, plan.applyNow ? after.debtAssetId : undefined].filter((id): id is string => !!id))];
  let userId: string | undefined;

  await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(assetIds.map((id) => tx.get(doc(db, ASSETS_COLLECTION, id))));
    const debts = new Map<string, LoanDebt>();
    const assets = new Map<string, DebtAssetFields>();
    snaps.forEach((snap, index) => {
      if (!snap.exists()) return;
      const fields = debtFieldsOf(snap.data());
      assets.set(assetIds[index], fields);
      debts.set(assetIds[index], loanDebtOf(fields));
      userId ??= snap.data().userId as string;
    });

    // The old repayment given back first, so the new one is split on the debt it really faces.
    const newDebts = new Map<string, number>();
    if (plan.giveBack && debts.has(plan.giveBack.assetId)) {
      newDebts.set(plan.giveBack.assetId, toCents(debts.get(plan.giveBack.assetId)!.debt + plan.giveBack.principal));
    }
    let split: { principal: number; interest: number } | null = null;
    if (plan.applyNow && after.debtAssetId && debts.has(after.debtAssetId)) {
      const loan = debts.get(after.debtAssetId)!;
      const debt = newDebts.get(after.debtAssetId) ?? loan.debt;
      split = splitInstalment(after.amount, debt, loan.annualRatePct, after.isDebtPayoff === true);
      newDebts.set(after.debtAssetId, toCents(debt - split.principal));
    }

    for (const [assetId, debt] of newDebts) {
      tx.update(doc(db, ASSETS_COLLECTION, assetId), debtUpdate(assets.get(assetId)!, debt));
    }
    tx.update(doc(db, EXPENSES_COLLECTION, rowId), {
      debtPrincipalRepaid: split?.principal ?? deleteField(),
      debtInterestPaid: split?.interest ?? deleteField(),
      updatedAt: new Date(),
    });
  });

  if (userId) await invalidateDashboardOverviewSummary(userId, 'debt_repayment_edited');
  return true;
}
