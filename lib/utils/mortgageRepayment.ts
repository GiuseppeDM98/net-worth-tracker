/**
 * An instalment that pays down a loan — the ONE rule, shared by the expense form, the deletes,
 * «Collega la serie» and the server job that settles what came due.
 *
 * A `debt` row may name a loan (`debtAssetId`; owner 2026-09-25, a property's own debt until
 * 2026-10-10 — types/assets.ts → LOAN_ASSET_TYPE): on the row's own date — the same boundary as
 * its account (lib/utils/cashSettlement.ts), `balancePending` until then — the loan's outstanding
 * principal falls by the instalment's PRINCIPAL, never by the whole instalment. An instalment is
 * principal + interest, and only the principal repays the debt: with the whole instalment the net
 * worth would gain the interest every month, an error that only grows.
 *
 * Teacher's note — the French amortisation (ammortamento alla francese), the plan of nearly every
 * Italian mortgage: the instalment is constant, and each month
 *
 *   interest  = outstanding debt × TAN / 12
 *   principal = instalment − interest
 *
 * so early instalments are mostly interest and late ones mostly principal. Computed on the debt
 * as it stands when the row settles, rows applied together are applied IN DATE ORDER, each on the
 * debt the previous one left. A variable rate is followed by updating the TAN on the loan; a loan
 * without a TAN is read as a 0% loan (the whole instalment is principal), and the form says so
 * before the save.
 *
 * «Estinzione anticipata» (`isDebtPayoff`, 2026-10-10): an early repayment, partial or total, is
 * ALL principal — the bank asks for the principal, plus a penalty and the period's interest that
 * are costs on the row's fee, never in the principal. A payoff of the whole debt leaves the loan at
 * zero: it stays in the list as «Estinto», like a sold position.
 *
 * What a row repaid is STORED on it (`debtPrincipalRepaid`) when it settles, because the interest
 * depends on the debt of that day: an edit or a delete gives back exactly that figure, never a
 * recomputation on today's debt. Absent on a pending row, like its account effect.
 *
 * Where the debt LIVES on the asset is this module's knowledge alone (`debtBalanceOf`,
 * `debtBalanceField`): a loan keeps it in `quantity` (its value is minus that), a property not yet
 * migrated in the legacy `outstandingDebt`. Every writer asks here instead of spelling a field.
 *
 * SDK-free: plain rows in, plans out.
 */

import type { Asset } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import { repaysDebt, settlesLater } from '@/lib/utils/cashSettlement';

/** The fields that decide what a row does to a loan's debt. */
export type DebtRow = Pick<Expense, 'type' | 'amount' | 'debtAssetId' | 'isDebtPayoff' | 'debtPrincipalRepaid' | 'debtInterestPaid' | 'balancePending'> & {
  id: string;
  date: Date;
};

/** A loan's debt as the settlement reads it. */
export interface LoanDebt {
  debt: number;
  /** TAN in percent (3.2 = 3,2%); absent = a 0% loan. */
  annualRatePct?: number;
}

/** What one instalment is made of, in euro rounded to the cent. */
export interface InstalmentSplit {
  interest: number;
  principal: number;
}

const toCents = (value: number) => Math.round(value * 100) / 100;

/** The asset fields the debt readers and writers need. */
export type DebtAssetFields = Pick<Asset, 'type' | 'assetClass' | 'quantity' | 'outstandingDebt' | 'debtInterestRate'>;

/** Which field of the asset document holds the debt: a loan's principal, or a legacy property's debt. */
export function debtBalanceField(asset: Pick<Asset, 'type'>): 'quantity' | 'outstandingDebt' {
  return asset.type === 'loan' ? 'quantity' : 'outstandingDebt';
}

/** The debt an asset carries today: a loan's outstanding principal, a legacy property's debt, else 0. */
export function debtBalanceOf(asset: Pick<Asset, 'type' | 'quantity' | 'outstandingDebt'>): number {
  if (asset.type === 'loan') return Math.max(0, asset.quantity);
  return Math.max(0, asset.outstandingDebt ?? 0);
}

/** The debt and the TAN of an asset, as `planDebtRepayments` reads them. */
export function loanDebtOf(asset: Pick<Asset, 'type' | 'quantity' | 'outstandingDebt' | 'debtInterestRate'>): LoanDebt {
  return { debt: debtBalanceOf(asset), annualRatePct: asset.debtInterestRate };
}

/**
 * Split an instalment into interest and principal on the debt it is paid against. The principal
 * never goes below zero (an instalment smaller than the month's interest repays nothing) nor
 * above the debt (the last instalment cannot push the debt negative); the interest is never more
 * than the instalment — what was PAID, not what accrued. A payoff is all principal, capped at the
 * debt, with no interest.
 */
export function splitInstalment(instalment: number, debt: number, annualRatePct?: number, isPayoff: boolean = false): InstalmentSplit {
  const outstanding = Math.max(0, debt);
  const paid = Math.abs(instalment);
  if (isPayoff) return { interest: 0, principal: toCents(Math.min(outstanding, paid)) };
  const rate = annualRatePct && annualRatePct > 0 ? annualRatePct : 0;
  const accrued = toCents((outstanding * rate) / 100 / 12);
  const principal = toCents(Math.min(outstanding, Math.max(0, paid - accrued)));
  return { interest: Math.min(accrued, toCents(paid)), principal };
}

/** The result of applying rows to their loans: each loan's new debt, each row's principal and interest. */
export interface DebtRepaymentPlan {
  debts: Map<string, number>;
  principals: Map<string, number>;
  interests: Map<string, number>;
}

/**
 * Apply the given rows (all due NOW) to their loans' debts, in date order per loan. A row whose
 * loan is not in `debts` (deleted, or not the owner's) repays nothing — it is still settled, or it
 * would wait forever — and records 0.
 */
export function planDebtRepayments(rows: DebtRow[], debts: Map<string, LoanDebt>): DebtRepaymentPlan {
  const running = new Map<string, number>();
  const principals = new Map<string, number>();
  const interests = new Map<string, number>();
  const ordered = rows.filter(repaysDebt).sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  for (const row of ordered) {
    const loan = debts.get(row.debtAssetId!);
    if (!loan) {
      principals.set(row.id, 0);
      interests.set(row.id, 0);
      continue;
    }
    const debt = running.get(row.debtAssetId!) ?? loan.debt;
    const { principal, interest } = splitInstalment(row.amount, debt, loan.annualRatePct, row.isDebtPayoff === true);
    principals.set(row.id, principal);
    interests.set(row.id, interest);
    running.set(row.debtAssetId!, toCents(debt - principal));
  }
  return { debts: running, principals, interests };
}

/** What a row HAS repaid on its loan: nothing while it waits for its date. */
export function appliedDebtRepaymentOf(row: Pick<Expense, 'debtAssetId' | 'debtPrincipalRepaid' | 'balancePending'>): { assetId: string; principal: number } | null {
  if (row.balancePending || !row.debtAssetId || !row.debtPrincipalRepaid || row.debtPrincipalRepaid <= 0) return null;
  return { assetId: row.debtAssetId, principal: row.debtPrincipalRepaid };
}

/** What deleting the rows gives back to each loan's debt: the principal each had repaid. */
export function debtGivenBackBy(rows: Pick<Expense, 'debtAssetId' | 'debtPrincipalRepaid' | 'balancePending'>[]): Map<string, number> {
  const byAsset = new Map<string, number>();
  for (const row of rows) {
    const applied = appliedDebtRepaymentOf(row);
    if (applied) byAsset.set(applied.assetId, toCents((byAsset.get(applied.assetId) ?? 0) + applied.principal));
  }
  return byAsset;
}

/** What an edit does to the debt. */
export interface DebtEditPlan {
  /** The principal the row had repaid, to add back to its (old) loan's debt; null if none. */
  giveBack: { assetId: string; principal: number } | null;
  /** The edited row repays its loan now (happened, linked): recompute and stamp it. */
  applyNow: boolean;
  /** Nothing that decides the repayment changed: leave the debt and the stamp alone. */
  unchanged: boolean;
}

/**
 * What an edit does to the debt: the old row's APPLIED principal given back, the new row applied
 * unless its new date is still to come. An edit that leaves the loan, the amount, the payoff flag
 * and the happened/pending side untouched (a note, a category) changes nothing — recomputing it on
 * today's debt would move a repayment that already happened.
 */
export function planDebtEdit(
  before: Pick<Expense, 'type' | 'amount' | 'debtAssetId' | 'isDebtPayoff' | 'debtPrincipalRepaid' | 'balancePending'>,
  after: Pick<Expense, 'type' | 'amount' | 'debtAssetId' | 'isDebtPayoff'> & { date: Date },
  now: Date
): DebtEditPlan {
  const giveBack = appliedDebtRepaymentOf(before);
  const applyNow = repaysDebt(after) && !settlesLater(after.date, now);
  const wasApplied = repaysDebt(before) && !before.balancePending;
  const unchanged =
    wasApplied &&
    applyNow &&
    before.debtAssetId === after.debtAssetId &&
    Math.abs(before.amount) === Math.abs(after.amount) &&
    (before.isDebtPayoff === true) === (after.isDebtPayoff === true);
  return { giveBack, applyNow, unchanged };
}

/**
 * «Collega la serie al mutuo»: the occurrences that can still take a loan — dated after today,
 * not linked to one yet, and whose account (if any) has not moved yet. A future row linked to an
 * account and ALREADY applied (a series written before 2026-09-19 moved its first row at save) is
 * left out: flagging it pending would debit its account a second time on the day.
 */
export function selectDebtLinkableOccurrences<T extends Pick<Expense, 'type' | 'debtAssetId' | 'linkedCashAssetId' | 'balancePending'> & { date: Date }>(rows: T[], now: Date): T[] {
  return rows.filter((row) => row.type === 'debt' && settlesLater(row.date, now) && !row.debtAssetId && (!row.linkedCashAssetId || row.balancePending === true));
}

/**
 * An asset an instalment can repay: a loan with a principal left, or — until the migration
 * reaches it — a property still carrying a legacy debt.
 */
export function isRepayableDebt(asset: DebtAssetFields): boolean {
  if (asset.type === 'loan') return asset.quantity > 0;
  return asset.type === 'realestate' && asset.assetClass === 'realestate' && (asset.outstandingDebt ?? 0) > 0;
}
