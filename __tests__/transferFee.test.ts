/**
 * Tests for lib/utils/transferFee.ts — the fee of a transfer is a spending row of its own, in the
 * category chosen in Impostazioni, linked to its transfer: created, updated and deleted with it.
 */

import { describe, expect, it } from 'vitest';

import {
  buildTransferFeeFormData,
  describeTransferFeeNote,
  normalizeTransferFee,
  planTransferFee,
  resolveTransferFeeCategory,
  rowsDeletedWith,
  transferFeeCategoryLabel,
} from '@/lib/utils/transferFee';
import type { ExpenseCategory, ExpenseType } from '@/types/expenses';

const category = (id: string, type: ExpenseType, subCategories: { id: string; name: string }[] = []): ExpenseCategory => ({
  id,
  userId: 'u1',
  name: `Categoria ${id}`,
  type,
  subCategories,
  createdAt: new Date(2026, 0, 1, 12),
  updatedAt: new Date(2026, 0, 1, 12),
});

const CATEGORIES = [
  category('fees', 'variable', [{ id: 'wire', name: 'Bonifici' }]),
  category('bank', 'fixed'),
  category('salary', 'income'),
  category('moves', 'transfer'),
];

describe('resolveTransferFeeCategory', () => {
  it('should take the chosen spending category, its type and its subcategory', () => {
    expect(resolveTransferFeeCategory(CATEGORIES, { transferFeeCategoryId: 'fees', transferFeeSubCategoryId: 'wire' })).toEqual({
      type: 'variable',
      categoryId: 'fees',
      categoryName: 'Categoria fees',
      subCategoryId: 'wire',
      subCategoryName: 'Bonifici',
    });
  });

  it('should follow the category type, a fixed category making a fixed fee', () => {
    expect(resolveTransferFeeCategory(CATEGORIES, { transferFeeCategoryId: 'bank' })?.type).toBe('fixed');
  });

  it('should return null when nothing is chosen, or the choice no longer exists', () => {
    expect(resolveTransferFeeCategory(CATEGORIES, {})).toBeNull();
    expect(resolveTransferFeeCategory(CATEGORIES, null)).toBeNull();
    expect(resolveTransferFeeCategory(CATEGORIES, { transferFeeCategoryId: 'deleted' })).toBeNull();
  });

  it('should refuse an income or a transfer category: neither is a cost', () => {
    expect(resolveTransferFeeCategory(CATEGORIES, { transferFeeCategoryId: 'salary' })).toBeNull();
    expect(resolveTransferFeeCategory(CATEGORIES, { transferFeeCategoryId: 'moves' })).toBeNull();
  });

  it('should drop a deleted subcategory but keep the category', () => {
    const resolved = resolveTransferFeeCategory(CATEGORIES, { transferFeeCategoryId: 'fees', transferFeeSubCategoryId: 'gone' });
    expect(resolved?.categoryId).toBe('fees');
    expect(resolved?.subCategoryId).toBeUndefined();
  });
});

describe('normalizeTransferFee', () => {
  it('should keep a positive fee, rounded to the cent', () => {
    expect(normalizeTransferFee(1.5)).toBe(1.5);
    expect(normalizeTransferFee(0.999)).toBe(1);
    expect(normalizeTransferFee(2.345)).toBe(2.35);
  });

  it('should read an empty field, zero or less than a cent as no fee', () => {
    expect(normalizeTransferFee(Number.NaN)).toBeNull();
    expect(normalizeTransferFee(undefined)).toBeNull();
    expect(normalizeTransferFee(null)).toBeNull();
    expect(normalizeTransferFee(0)).toBeNull();
    expect(normalizeTransferFee(0.004)).toBeNull();
    expect(normalizeTransferFee(-3)).toBeNull();
    expect(normalizeTransferFee(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('planTransferFee', () => {
  const saved = { id: 'fee-1' };

  it('should create a fee on a transfer that has none', () => {
    expect(planTransferFee(null, 1.5, true)).toEqual({ kind: 'create', amount: 1.5 });
  });

  it('should update the saved fee, whatever changed', () => {
    expect(planTransferFee(saved, 2, true)).toEqual({ kind: 'update', amount: 2 });
  });

  it('should delete the saved fee when the field is cleared', () => {
    expect(planTransferFee(saved, null, true)).toEqual({ kind: 'delete' });
  });

  it('should delete the saved fee when the row stops being a transfer, whatever the field held', () => {
    expect(planTransferFee(saved, 2, false)).toEqual({ kind: 'delete' });
  });

  it('should do nothing without a saved fee or a new one, and never create one off a transfer', () => {
    expect(planTransferFee(null, null, true)).toEqual({ kind: 'none' });
    expect(planTransferFee(null, 2, false)).toEqual({ kind: 'none' });
  });
});

describe('buildTransferFeeFormData', () => {
  it('should debit the transfer origin on the transfer date, in the fee category', () => {
    const date = new Date(2026, 8, 25);
    const fee = buildTransferFeeFormData(
      { date, currency: 'EUR', linkedCashAssetId: 'origin' },
      1.5,
      { type: 'variable', categoryId: 'fees', categoryName: 'Commissioni', subCategoryId: 'wire', subCategoryName: 'Bonifici' },
      'Commissione sul trasferimento a Risparmio'
    );
    expect(fee).toEqual({
      type: 'variable',
      categoryId: 'fees',
      subCategoryId: 'wire',
      amount: 1.5,
      currency: 'EUR',
      date,
      notes: 'Commissione sul trasferimento a Risparmio',
      linkedCashAssetId: 'origin',
    });
  });
});

describe('describeTransferFeeNote and transferFeeCategoryLabel', () => {
  it('should name the destination when it is known', () => {
    expect(describeTransferFeeNote('Conto Ornitorinco')).toBe('Commissione sul trasferimento a Conto Ornitorinco');
    expect(describeTransferFeeNote(undefined)).toBe('Commissione sul trasferimento');
  });

  it('should name the landing place with its subcategory', () => {
    expect(transferFeeCategoryLabel({ categoryName: 'Commissioni', subCategoryName: 'Bonifici' })).toBe('Commissioni › Bonifici');
    expect(transferFeeCategoryLabel({ categoryName: 'Commissioni' })).toBe('Commissioni');
  });
});

describe('rowsDeletedWith', () => {
  it('should delete a transfer together with its fee', () => {
    expect(rowsDeletedWith({ id: 't1' }, { id: 'f1' }).map((row) => row.id)).toEqual(['t1', 'f1']);
  });

  it('should delete the row alone when it has no fee (or the fee was deleted by hand)', () => {
    expect(rowsDeletedWith({ id: 't1' }, null).map((row) => row.id)).toEqual(['t1']);
  });
});
