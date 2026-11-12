/**
 * The fee of a trade in the cashflow — the ONE rule, shared by the trade use case and its tests.
 *
 * What a broker charges to execute an order is a cost of its own (owner, 2026-10-21), so it does
 * not ride on the position's cost: the EUR PMC stands on price × quantity alone
 * (`assetTransactionUtils`) and the commission is a spending row in the category chosen in
 * Impostazioni › Spese for fees (`transferFeeCategoryId`, shared with `expenseFee.ts`).
 *
 * The row moves NO account: the trade's own cash settlement already debits the account for the
 * fees (`computeCashDelta`), and a second debit would pay them twice. It is on the trade's date,
 * linked both ways — the trade names the row (`AssetTransaction.feeExpenseId`), the row names the
 * trade (`Expense.feeOfTradeId`) — and follows the trade: an edit moves its amount and date, a
 * delete (or a cleared fee) removes it.
 *
 * SDK-free: plain values in, plans and documents out.
 */

import { normalizeExpenseFee, type ExpenseFeeCategory } from '@/lib/utils/expenseFee';
import type { AssetTransactionType } from '@/types/assetTransactions';

/** What saving a trade does to its fee row. */
export type TradeFeePlan =
  | { kind: 'none' }
  | { kind: 'create'; amount: number }
  | { kind: 'update'; amount: number }
  | { kind: 'delete' };

/**
 * `fees` is what the trade now carries (`normalizeExpenseFee` reads «no fee» from 0, NaN and
 * absent); `hasRow` whether the trade already names a fee row; `canCreate` whether a category is
 * there to land a NEW row in. An existing row is updated even with no category: it already has one.
 */
export function planTradeFee(fees: number | null | undefined, hasRow: boolean, canCreate: boolean): TradeFeePlan {
  const amount = normalizeExpenseFee(fees);
  if (amount === null) return hasRow ? { kind: 'delete' } : { kind: 'none' };
  if (hasRow) return { kind: 'update', amount };
  return canCreate ? { kind: 'create', amount } : { kind: 'none' };
}

/** «Commissione su acquisto di VWCE» — written once, at creation. */
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
    createdAt: input.now,
    updatedAt: input.now,
  };
}
