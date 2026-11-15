/**
 * The fee of a trade in the cashflow — the ONE rule, shared by the trade use case, the cashflow
 * surfaces and the Driver.
 *
 * What a broker charges to execute an order is a cost of its own (owner, 2026-11-12), so it does
 * not ride on the position's cost: the PMC stands on price × quantity alone
 * (`assetTransactionUtils`; the fiscal cost keeps the purchase fees for the tax estimates) and the
 * commission is a spending row in the category chosen in Impostazioni › Spese for fees
 * (`transferFeeCategoryId`, shared with `expenseFee.ts`). The row counts in Budget like any
 * expense; in Rendimenti it is no withdrawal (the return stays net of it).
 *
 * The row moves NO account: the trade's own cash settlement already debits the account for the
 * fees (`computeCashDelta`), and a second debit would pay them twice. It is on the trade's date,
 * linked both ways — the trade names the row (`AssetTransaction.feeExpenseId`), the row names the
 * trade (`Expense.feeOfTradeId`) — and follows the trade: an edit moves its amount and date, a
 * delete (or a cleared fee) removes it. The plan is decided INSIDE the trade's transaction
 * (`commitTradeMutation`), on the stored trade and the category it reads there.
 *
 * A fee saved before fees became rows (a stored trade with `fees > 0` and no `feeExpenseId`) keeps
 * none on any later edit: re-saving an old trade never backfills a past month (owner, 2026-11-12).
 *
 * SDK-free: plain values in, plans and documents out.
 */

import { normalizeExpenseFee, type ExpenseFeeCategory } from '@/lib/utils/expenseFee';
import type { Asset } from '@/types/assets';
import type { AssetTransaction, AssetTransactionType } from '@/types/assetTransactions';
import type { Expense } from '@/types/expenses';

/** What saving a trade does to its fee row. */
export type TradeFeePlan =
  | { kind: 'none' }
  | { kind: 'create'; amount: number }
  | { kind: 'update'; amount: number }
  | { kind: 'delete' };

export interface TradeFeeFacts {
  /** The fee the trade carries after the mutation (absent on a delete). */
  fees: number | null | undefined;
  /** The trade as stored before the mutation, read in the transaction; absent on a create. */
  stored?: Pick<AssetTransaction, 'fees' | 'feeExpenseId'>;
  /** The row `stored.feeExpenseId` names exists (read in the transaction). */
  storedRowExists: boolean;
  /** A fee category exists to land a NEW row in (read in the transaction). */
  canCreate: boolean;
}

/**
 * The plan of one save. A row the stored trade names and that still exists follows the fee
 * (moved, or deleted when the fee is cleared) even with no category: it already has one. A named
 * row that is gone is created again at its id when a category exists.
 */
export function planTradeFee(facts: TradeFeeFacts): TradeFeePlan {
  const amount = normalizeExpenseFee(facts.fees);
  if (facts.stored?.feeExpenseId && facts.storedRowExists) {
    return amount === null ? { kind: 'delete' } : { kind: 'update', amount };
  }
  if (amount === null) return { kind: 'none' };
  // A fee saved before fees became rows keeps none: re-saving an old trade never backfills a month (owner, 2026-11-12).
  const legacyFee = !!facts.stored && !facts.stored.feeExpenseId && normalizeExpenseFee(facts.stored.fees) !== null;
  if (legacyFee) return { kind: 'none' };
  return facts.canCreate ? { kind: 'create', amount } : { kind: 'none' };
}

/** A row written for a trade's fee: its trade owns amount, date and account. */
export function isTradeFeeRow(row: Pick<Expense, 'feeOfTradeId'>): boolean {
  return !!row.feeOfTradeId;
}

/** The part of a trade's fee the cashflow does NOT carry: all of it without a row, nothing with one. */
export function feeOutsideCashflow(trade: Pick<AssetTransaction, 'fees' | 'feeExpenseId'>): number {
  return trade.feeExpenseId ? 0 : (trade.fees ?? 0);
}

type Holder = Pick<Asset, 'ownerMemberId' | 'ownerShares'> | null | undefined;

/** The one member a whole asset belongs to: `ownerMemberId` with no typed quota (assetOwnership.ts). */
const soleHolder = (asset: Holder) =>
  asset?.ownerMemberId && !(asset.ownerShares?.length) ? asset.ownerMemberId : undefined;

/**
 * Whose spending a trade's fee is (owner, 2026-11-12): the traded asset's sole holder, else the
 * settlement account's, else in comune (`undefined`). Written once, at the row's creation.
 */
export function tradeFeeOwner(asset: Holder, settlementAccount: Holder): string | undefined {
  return soleHolder(asset) ?? soleHolder(settlementAccount);
}

/** «Commissione su acquisto di ORNI» — written once, at creation. */
export function describeTradeFeeNote(type: AssetTransactionType, assetLabel: string | undefined): string {
  const what = type === 'sell' ? 'vendita' : 'acquisto';
  const label = assetLabel?.trim();
  return label ? `Commissione su ${what} di ${label}` : `Commissione su ${what}`;
}

/** The document of a NEW fee row: a negative spending amount, no account, pointing at its trade. */
export function buildTradeFeeExpenseDoc(input: {
  userId: string;
  tradeId: string;
  amount: number;
  date: Date;
  category: ExpenseFeeCategory;
  notes: string;
  now: Date;
  /** The member the fee belongs to (`tradeFeeOwner`); absent = in comune. */
  personalMemberId?: string;
}): Record<string, unknown> {
  const { category } = input;
  return {
    userId: input.userId,
    type: category.type,
    categoryId: category.categoryId,
    categoryName: category.categoryName,
    ...(category.subCategoryId ? { subCategoryId: category.subCategoryId } : {}),
    ...(category.subCategoryName ? { subCategoryName: category.subCategoryName } : {}),
    amount: -Math.abs(input.amount),
    currency: 'EUR',
    date: input.date,
    notes: input.notes,
    isRecurring: false,
    feeOfTradeId: input.tradeId,
    ...(input.personalMemberId ? { personalMemberId: input.personalMemberId } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  };
}
