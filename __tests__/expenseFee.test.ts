/**
 * Tests for lib/utils/expenseFee.ts — the fee of a cashflow row is a spending row of its own, in
 * the category chosen in Impostazioni, linked to the row it was charged for: created, updated and
 * deleted with it. A transfer's fee until 2026-10-10, any row's since.
 */

import { describe, expect, it } from 'vitest';

import {
  buildExpenseFeeFormData,
  describeExpenseFeeNote,
  expenseFeeCategoryLabel,
  isFeeRow,
  normalizeExpenseFee,
  planExpenseFee,
  resolveExpenseFeeCategory,
  rowsDeletedWith,
} from '@/lib/utils/expenseFee';
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

describe('resolveExpenseFeeCategory', () => {
  it('should take the chosen spending category, its type and its subcategory', () => {
    expect(resolveExpenseFeeCategory(CATEGORIES, { transferFeeCategoryId: 'fees', transferFeeSubCategoryId: 'wire' })).toEqual({
      type: 'variable',
      categoryId: 'fees',
      categoryName: 'Categoria fees',
      subCategoryId: 'wire',
      subCategoryName: 'Bonifici',
    });
  });

  it('should follow the category type, a fixed category making a fixed fee', () => {
    expect(resolveExpenseFeeCategory(CATEGORIES, { transferFeeCategoryId: 'bank' })?.type).toBe('fixed');
  });

  it('should return null when nothing is chosen, or the choice no longer exists', () => {
    expect(resolveExpenseFeeCategory(CATEGORIES, null)).toBeNull();
    expect(resolveExpenseFeeCategory(CATEGORIES, {})).toBeNull();
    expect(resolveExpenseFeeCategory(CATEGORIES, { transferFeeCategoryId: 'gone' })).toBeNull();
  });

  it('should refuse an income or a transfer category: neither is a cost', () => {
    expect(resolveExpenseFeeCategory(CATEGORIES, { transferFeeCategoryId: 'salary' })).toBeNull();
    expect(resolveExpenseFeeCategory(CATEGORIES, { transferFeeCategoryId: 'moves' })).toBeNull();
  });

  it('should drop a deleted subcategory but keep the category', () => {
    const resolved = resolveExpenseFeeCategory(CATEGORIES, { transferFeeCategoryId: 'fees', transferFeeSubCategoryId: 'gone' });
    expect(resolved?.categoryId).toBe('fees');
    expect(resolved?.subCategoryId).toBeUndefined();
  });
});

describe('normalizeExpenseFee', () => {
  it('should keep a positive fee, rounded to the cent', () => {
    expect(normalizeExpenseFee(1.5)).toBe(1.5);
    expect(normalizeExpenseFee(0.999)).toBe(1);
    expect(normalizeExpenseFee(2.345)).toBe(2.35);
    expect(normalizeExpenseFee(0.3 + 0.6)).toBe(0.9);
  });

  it('should read an empty field, zero or less than a cent as no fee', () => {
    expect(normalizeExpenseFee(Number.NaN)).toBeNull();
    expect(normalizeExpenseFee(undefined)).toBeNull();
    expect(normalizeExpenseFee(null)).toBeNull();
    expect(normalizeExpenseFee(0)).toBeNull();
    expect(normalizeExpenseFee(-2)).toBeNull();
    expect(normalizeExpenseFee(0.004)).toBeNull();
    expect(normalizeExpenseFee(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('planExpenseFee', () => {
  const saved = { id: 'fee-1' };

  it('should create a fee on a row that has none', () => {
    expect(planExpenseFee(null, 1.5)).toEqual({ kind: 'create', amount: 1.5 });
  });

  it('should update the saved fee, whatever changed', () => {
    expect(planExpenseFee(saved, 2)).toEqual({ kind: 'update', amount: 2 });
  });

  it('should delete the saved fee when the field is cleared', () => {
    expect(planExpenseFee(saved, null)).toEqual({ kind: 'delete' });
  });

  it('should do nothing without a saved fee or a new one', () => {
    expect(planExpenseFee(null, null)).toEqual({ kind: 'none' });
  });
});

describe('isFeeRow', () => {
  it('should recognise a fee by the row it names, so a fee never carries a fee of its own', () => {
    expect(isFeeRow({ feeOfTransferId: 'parent' })).toBe(true);
    expect(isFeeRow({})).toBe(false);
  });
});

describe('buildExpenseFeeFormData', () => {
  it('should debit the parent account on the parent date, in the fee category', () => {
    const date = new Date(2026, 8, 25);
    const fee = buildExpenseFeeFormData(
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

describe('describeExpenseFeeNote and expenseFeeCategoryLabel', () => {
  it('should name the destination of a transfer when it is known', () => {
    expect(describeExpenseFeeNote({ type: 'transfer', destinationName: 'Conto Ornitorinco' })).toBe('Commissione sul trasferimento a Conto Ornitorinco');
    expect(describeExpenseFeeNote({ type: 'transfer' })).toBe('Commissione sul trasferimento');
  });

  it('should name what any other row paid for, or say only that it is a fee', () => {
    expect(describeExpenseFeeNote({ type: 'debt', label: 'Rata mutuo' })).toBe('Commissione su Rata mutuo');
    expect(describeExpenseFeeNote({ type: 'variable', label: '  ' })).toBe('Commissione');
    expect(describeExpenseFeeNote({ type: 'income' })).toBe('Commissione');
  });

  it('should name the landing place with its subcategory', () => {
    expect(expenseFeeCategoryLabel({ categoryName: 'Commissioni', subCategoryName: 'Bonifici' })).toBe('Commissioni › Bonifici');
    expect(expenseFeeCategoryLabel({ categoryName: 'Commissioni' })).toBe('Commissioni');
  });
});

describe('rowsDeletedWith', () => {
  it('should delete a row together with its fee', () => {
    expect(rowsDeletedWith({ id: 't1' }, { id: 'f1' }).map((row) => row.id)).toEqual(['t1', 'f1']);
  });

  it('should delete the row alone when it has no fee (or the fee was deleted by hand)', () => {
    expect(rowsDeletedWith({ id: 't1' }, null).map((row) => row.id)).toEqual(['t1']);
  });
});
