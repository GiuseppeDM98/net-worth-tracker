/**
 * The fee of a transfer — the ONE rule, shared by the expense form, the service that writes the
 * two rows and the delete paths.
 *
 * A transfer moves money between two of the household's own accounts, so it is net-zero and
 * belongs to no total (lib/utils/cashSettlement.ts). What the bank charges to execute it is not:
 * it is a COST, and a cost the transfer row cannot carry — a field on the transfer would never
 * reach Tracciamento, Analisi or Budget, which classify by `type` and skip every transfer. So the
 * fee is a row of its own (owner, 2026-09-25):
 *
 *   - a spending row, in the category chosen in Impostazioni › Spese (`transferFeeCategoryId`),
 *     typed by that category — categories are type-scoped;
 *   - on the SAME date as the transfer, debiting the transfer's ORIGIN account (whoever orders
 *     the payment pays for it), and moving that account on its own date like any linked row;
 *   - LINKED both ways: the transfer names its fee (`transferFeeExpenseId`), the fee names its
 *     transfer (`feeOfTransferId`). The fee is edited from the transfer — clearing the field
 *     deletes it — and deleting the transfer deletes it, giving back only what was applied.
 *
 * SDK-free: plain values in, plans out. The words live in dialogNarrative.ts.
 */

import type { Expense, ExpenseCategory, ExpenseFormData, ExpenseType } from '@/types/expenses';

/** The types a fee row can take: any spending type. An income or a transfer is not a cost. */
export type TransferFeeType = Exclude<ExpenseType, 'income' | 'transfer'>;

/** Where a new fee row lands: the category (and optional subcategory) chosen in Impostazioni. */
export interface TransferFeeCategory {
  type: TransferFeeType;
  categoryId: string;
  categoryName: string;
  subCategoryId?: string;
  subCategoryName?: string;
}

/** The ids stored in the settings document, both optional. */
export interface TransferFeeSettings {
  transferFeeCategoryId?: string;
  transferFeeSubCategoryId?: string;
}

function isFeeType(type: ExpenseType): type is TransferFeeType {
  return type !== 'income' && type !== 'transfer';
}

/**
 * The category a new fee row lands in, or null when there is none to use: nothing chosen, the
 * chosen category deleted since, or one that is not a spending category. A subcategory that no
 * longer exists is dropped, not the whole category — the fee still has somewhere to go.
 */
export function resolveTransferFeeCategory(categories: ExpenseCategory[], settings: TransferFeeSettings | null | undefined): TransferFeeCategory | null {
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
export function transferFeeCategoryLabel(category: { categoryName: string; subCategoryName?: string }): string {
  return category.subCategoryName ? `${category.categoryName} › ${category.subCategoryName}` : category.categoryName;
}

/**
 * The fee the form asks for, as money: a positive amount rounded to the cent, or null for «no
 * fee» — an empty field (NaN from `valueAsNumber`), zero, or anything that is not a finite
 * positive number. Zero means none: a fee of 0 € would be a row that says nothing happened.
 */
export function normalizeTransferFee(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  return cents > 0 ? cents / 100 : null;
}

/**
 * The note a new fee row is born with, so the row reads as what it is in every list that shows
 * notes: «Commissione sul trasferimento a Conto Risparmio». Written once, at creation — an edit
 * of the transfer never overwrites a note the owner may have rewritten on the fee row.
 */
export function describeTransferFeeNote(destinationName: string | undefined): string {
  return destinationName ? `Commissione sul trasferimento a ${destinationName}` : 'Commissione sul trasferimento';
}

/**
 * The form data of a NEW fee row: the category's type and ids, the transfer's date, currency and
 * origin account, the fee as a positive amount (the service signs it by type, like every row).
 */
export function buildTransferFeeFormData(
  transfer: Pick<ExpenseFormData, 'date' | 'currency' | 'linkedCashAssetId'>,
  amount: number,
  category: TransferFeeCategory,
  notes: string,
): ExpenseFormData {
  return {
    type: category.type,
    categoryId: category.categoryId,
    subCategoryId: category.subCategoryId,
    amount,
    currency: transfer.currency,
    date: transfer.date,
    notes,
    linkedCashAssetId: transfer.linkedCashAssetId,
  };
}

/** What saving a transfer does to its fee row. */
export type TransferFeePlan =
  | { kind: 'none' }
  | { kind: 'create'; amount: number }
  | { kind: 'update'; amount: number }
  | { kind: 'delete' };

/**
 * What a save does to the fee, given the fee row the transfer already has (null when none) and
 * the fee the form now asks for (already through `normalizeTransferFee`).
 *
 * A row that is no longer a transfer has no fee: the field is gone from the form, so its fee row
 * is deleted like a cleared field. An update is planned even when only the transfer changed (its
 * date or its origin), since the fee row follows both — the caller compares nothing.
 */
export function planTransferFee(existingFee: Pick<Expense, 'id'> | null, requested: number | null, isTransfer: boolean): TransferFeePlan {
  const amount = isTransfer ? requested : null;
  if (existingFee) return amount === null ? { kind: 'delete' } : { kind: 'update', amount };
  return amount === null ? { kind: 'none' } : { kind: 'create', amount };
}

/**
 * The rows a single delete removes: the row itself and, for a transfer, the fee row it created —
 * never a fee left behind still debiting its account. `fee` is the fee row as read (null when
 * the transfer has none, or it was already deleted by hand).
 */
export function rowsDeletedWith<T extends Pick<Expense, 'id'>>(row: T, fee: T | null): T[] {
  return fee && fee.id !== row.id ? [row, fee] : [row];
}
