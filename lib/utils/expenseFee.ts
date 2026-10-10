/**
 * The fee of a cashflow row — the ONE rule, shared by the expense form, the service that writes
 * the rows and the delete paths.
 *
 * What the bank charges to execute a payment is a COST of its own: a wire's commission, the
 * «spese incasso rata» of an instalment, the penalty of an early repayment. It cannot ride on the
 * row it belongs to — a transfer is net-zero and in no total, and on any other row it would be
 * mixed into the category of the thing paid for. So the fee is a row of its own (owner,
 * 2026-09-25 for a transfer; every row, and every occurrence of a series, since 2026-10-10):
 *
 *   - a spending row, in the category chosen in Impostazioni › Spese (`transferFeeCategoryId`,
 *     the key kept from the transfer-only days), typed by that category — categories are
 *     type-scoped;
 *   - on the SAME date as its parent row, debiting the parent's account (`linkedCashAssetId` —
 *     for a transfer its origin: whoever orders the payment pays for it), and moving that
 *     account on its own date like any linked row;
 *   - LINKED both ways: the parent names its fee (`transferFeeExpenseId`), the fee names its
 *     parent (`feeOfTransferId`) — the stored names say «transfer» because they were born on
 *     one, and renaming them would have meant rewriting every row. The fee is edited from the
 *     parent — clearing the field deletes it — and deleting the parent deletes it, giving back
 *     only what was applied. A fee row carries no fee of its own.
 *
 * SDK-free: plain values in, plans out. The words live in dialogNarrative.ts.
 */

import type { Expense, ExpenseCategory, ExpenseFormData, ExpenseType } from '@/types/expenses';

/** The types a fee row can take: any spending type. An income or a transfer is not a cost. */
export type ExpenseFeeType = Exclude<ExpenseType, 'income' | 'transfer'>;

/** Where a new fee row lands: the category (and optional subcategory) chosen in Impostazioni. */
export interface ExpenseFeeCategory {
  type: ExpenseFeeType;
  categoryId: string;
  categoryName: string;
  subCategoryId?: string;
  subCategoryName?: string;
}

/** The ids stored in the settings document, both optional. */
export interface ExpenseFeeSettings {
  transferFeeCategoryId?: string;
  transferFeeSubCategoryId?: string;
}

function isFeeType(type: ExpenseType): type is ExpenseFeeType {
  return type !== 'income' && type !== 'transfer';
}

/** A row that IS a fee (it names the row it was charged for): it takes no fee of its own. */
export function isFeeRow(row: Pick<Expense, 'feeOfTransferId'>): boolean {
  return !!row.feeOfTransferId;
}

/**
 * The category a new fee row lands in, or null when there is none to use: nothing chosen, the
 * chosen category deleted since, or one that is not a spending category. A subcategory that no
 * longer exists is dropped, not the whole category — the fee still has somewhere to go.
 */
export function resolveExpenseFeeCategory(categories: ExpenseCategory[], settings: ExpenseFeeSettings | null | undefined): ExpenseFeeCategory | null {
  const categoryId = settings?.transferFeeCategoryId;
  if (!categoryId) return null;
  const category = categories.find((candidate) => candidate.id === categoryId);
  if (!category || !isFeeType(category.type)) return null;
  const subCategory = settings?.transferFeeSubCategoryId
    ? category.subCategories.find((sub) => sub.id === settings.transferFeeSubCategoryId)
    : undefined;
  return {
    type: category.type,
    categoryId: category.id,
    categoryName: category.name,
    subCategoryId: subCategory?.id,
    subCategoryName: subCategory?.name,
  };
}

/** How a fee's landing place is named in a sentence: «Commissioni bancarie › Bonifici». */
export function expenseFeeCategoryLabel(category: { categoryName: string; subCategoryName?: string }): string {
  return category.subCategoryName ? `${category.categoryName} › ${category.subCategoryName}` : category.categoryName;
}

/**
 * The fee the form asks for, as money: a positive amount rounded to the cent, or null for «no
 * fee» — an empty field (NaN from `valueAsNumber`), zero, or anything that is not a finite
 * positive number. Zero means none: a fee of 0 € would be a row that says nothing happened.
 */
export function normalizeExpenseFee(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  return cents > 0 ? cents / 100 : null;
}

/**
 * The note a new fee row is born with, so the row reads as what it is in every list that shows
 * notes: «Commissione sul trasferimento a Conto Risparmio», «Commissione su Rata mutuo». Written
 * once, at creation — an edit of the parent never overwrites a note the owner may have rewritten
 * on the fee row.
 */
export function describeExpenseFeeNote(parent: { type: ExpenseType; destinationName?: string; label?: string }): string {
  if (parent.type === 'transfer') {
    return parent.destinationName ? `Commissione sul trasferimento a ${parent.destinationName}` : 'Commissione sul trasferimento';
  }
  const label = parent.label?.trim();
  return label ? `Commissione su ${label}` : 'Commissione';
}

/**
 * The form data of a NEW fee row: the category's type and ids, the parent's date, currency and
 * account, the fee as a positive amount (the service signs it by type, like every row).
 */
export function buildExpenseFeeFormData(
  parent: Pick<ExpenseFormData, 'date' | 'currency' | 'linkedCashAssetId'>,
  amount: number,
  category: ExpenseFeeCategory,
  notes: string,
): ExpenseFormData {
  return {
    type: category.type,
    categoryId: category.categoryId,
    subCategoryId: category.subCategoryId,
    amount,
    currency: parent.currency,
    date: parent.date,
    notes,
    linkedCashAssetId: parent.linkedCashAssetId,
  };
}

/** What saving a row does to its fee row. */
export type ExpenseFeePlan =
  | { kind: 'none' }
  | { kind: 'create'; amount: number }
  | { kind: 'update'; amount: number }
  | { kind: 'delete' };

/**
 * What a save does to the fee, given the fee row the parent already has (null when none) and
 * the fee the form now asks for (already through `normalizeExpenseFee`). An update is planned
 * even when only the parent changed (its date or its account), since the fee row follows both —
 * the caller compares nothing.
 */
export function planExpenseFee(existingFee: Pick<Expense, 'id'> | null, requested: number | null): ExpenseFeePlan {
  if (existingFee) return requested === null ? { kind: 'delete' } : { kind: 'update', amount: requested };
  return requested === null ? { kind: 'none' } : { kind: 'create', amount: requested };
}

/**
 * The rows a single delete removes: the row itself and the fee row it created — never a fee left
 * behind still debiting its account. `fee` is the fee row as read (null when the row has none, or
 * it was already deleted by hand).
 */
export function rowsDeletedWith<T extends Pick<Expense, 'id'>>(row: T, fee: T | null): T[] {
  return fee && fee.id !== row.id ? [row, fee] : [row];
}
