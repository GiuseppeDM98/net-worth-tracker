/**
 * Tests for lib/utils/tradeFeeExpense.ts — a trade's fee as a spending row: the plan a save
 * makes of it, the row's document and note, whose spending it is, and how the cashflow and the
 * Driver recognise it. Invented ids and round figures.
 */
import { describe, it, expect } from 'vitest';
import {
  buildTradeFeeExpenseDoc,
  describeTradeFeeNote,
  feeOutsideCashflow,
  isTradeFeeRow,
  planTradeFee,
  tradeFeeOwner,
} from '@/lib/utils/tradeFeeExpense';

describe('planTradeFee', () => {
  it('creates a row for a fee on a new trade, when a category is there', () => {
    expect(planTradeFee({ fees: 5, storedRowExists: false, canCreate: true })).toEqual({ kind: 'create', amount: 5 });
  });

  it('writes nothing for a fee without a category', () => {
    expect(planTradeFee({ fees: 5, storedRowExists: false, canCreate: false })).toEqual({ kind: 'none' });
  });

  it('updates the row the trade names even without a category, to the cent', () => {
    const stored = { fees: 5, feeExpenseId: 'fee-1' };
    expect(planTradeFee({ fees: 8.456, stored, storedRowExists: true, canCreate: false })).toEqual({ kind: 'update', amount: 8.46 });
  });

  it('deletes the row when the fee is cleared or the trade deleted, and reads 0 and NaN as no fee', () => {
    const stored = { fees: 5, feeExpenseId: 'fee-1' };
    expect(planTradeFee({ fees: undefined, stored, storedRowExists: true, canCreate: true })).toEqual({ kind: 'delete' });
    expect(planTradeFee({ fees: 0, stored, storedRowExists: true, canCreate: true })).toEqual({ kind: 'delete' });
    expect(planTradeFee({ fees: NaN, storedRowExists: false, canCreate: true })).toEqual({ kind: 'none' });
  });

  it('never backfills a row for a fee saved before fees became rows', () => {
    const legacy = { fees: 5 };
    expect(planTradeFee({ fees: 5, stored: legacy, storedRowExists: false, canCreate: true })).toEqual({ kind: 'none' });
    expect(planTradeFee({ fees: 8, stored: legacy, storedRowExists: false, canCreate: true })).toEqual({ kind: 'none' });
  });

  it('creates the row again when the one the trade names is gone, and gives a fee to a trade that had none', () => {
    const named = { fees: 5, feeExpenseId: 'fee-1' };
    expect(planTradeFee({ fees: 5, stored: named, storedRowExists: false, canCreate: true })).toEqual({ kind: 'create', amount: 5 });
    expect(planTradeFee({ fees: 3, stored: {}, storedRowExists: false, canCreate: true })).toEqual({ kind: 'create', amount: 3 });
  });
});

describe('isTradeFeeRow and feeOutsideCashflow', () => {
  it('recognises a trade fee row by its link to the trade', () => {
    expect(isTradeFeeRow({ feeOfTradeId: 't1' })).toBe(true);
    expect(isTradeFeeRow({})).toBe(false);
  });

  it('leaves to the cashflow all of a fee with a row and none of one without', () => {
    expect(feeOutsideCashflow({ fees: 5, feeExpenseId: 'fee-1' })).toBe(0);
    expect(feeOutsideCashflow({ fees: 5 })).toBe(5);
    expect(feeOutsideCashflow({})).toBe(0);
  });
});

describe('tradeFeeOwner', () => {
  it('is the sole holder of the traded asset, whatever the account', () => {
    expect(tradeFeeOwner({ ownerMemberId: 'm1' }, { ownerMemberId: 'm2' })).toBe('m1');
  });

  it('is the account’s sole holder when the asset is in comune', () => {
    expect(tradeFeeOwner({}, { ownerMemberId: 'm2' })).toBe('m2');
  });

  it('is in comune when the asset is split by quota and the account has no sole holder', () => {
    const split = { ownerMemberId: 'm1', ownerShares: [{ memberId: 'm2', percent: 50 }] };
    expect(tradeFeeOwner(split, {})).toBeUndefined();
  });

  it('answers by the asset alone when the trade names no account', () => {
    expect(tradeFeeOwner({ ownerMemberId: 'm1' }, undefined)).toBe('m1');
    expect(tradeFeeOwner({}, undefined)).toBeUndefined();
  });
});

describe('trade fee row', () => {
  it('words the note by trade type', () => {
    expect(describeTradeFeeNote('buy', 'ORNI')).toBe('Commissione su acquisto di ORNI');
    expect(describeTradeFeeNote('sell', undefined)).toBe('Commissione su vendita');
  });

  it('is a negative spending row with no account, pointing at its trade', () => {
    const date = new Date(2026, 10, 12, 12);
    const doc = buildTradeFeeExpenseDoc({
      userId: 'u', tradeId: 't1', amount: 5, date, notes: 'n', now: date,
      category: { type: 'variable', categoryId: 'c', categoryName: 'Commissioni' },
    });
    expect(doc).toMatchObject({ userId: 'u', type: 'variable', amount: -5, feeOfTradeId: 't1', currency: 'EUR' });
    expect(doc.linkedCashAssetId).toBeUndefined();
    expect('personalMemberId' in doc).toBe(false); // written only when someone owns it
  });

  it('carries the member it belongs to when there is one', () => {
    const date = new Date(2026, 10, 12, 12);
    const doc = buildTradeFeeExpenseDoc({
      userId: 'u', tradeId: 't1', amount: 5, date, notes: 'n', now: date, personalMemberId: 'm1',
      category: { type: 'variable', categoryId: 'c', categoryName: 'Commissioni' },
    });
    expect(doc.personalMemberId).toBe('m1');
  });
});
