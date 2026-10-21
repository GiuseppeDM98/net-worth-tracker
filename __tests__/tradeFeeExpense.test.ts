import { describe, it, expect } from 'vitest';
import { buildTradeFeeExpenseDoc, describeTradeFeeNote, planTradeFee } from '@/lib/utils/tradeFeeExpense';

describe('planTradeFee', () => {
  it('creates a row for a fee on a trade with none, when a category is there', () => {
    expect(planTradeFee(5, false, true)).toEqual({ kind: 'create', amount: 5 });
  });
  it('writes nothing for a new fee without a category', () => {
    expect(planTradeFee(5, false, false)).toEqual({ kind: 'none' });
  });
  it('updates an existing row even without a category', () => {
    expect(planTradeFee(8.456, true, false)).toEqual({ kind: 'update', amount: 8.46 });
  });
  it('removes the row when the fee goes away, and ignores zero and NaN', () => {
    expect(planTradeFee(undefined, true, true)).toEqual({ kind: 'delete' });
    expect(planTradeFee(0, true, true)).toEqual({ kind: 'delete' });
    expect(planTradeFee(NaN, false, true)).toEqual({ kind: 'none' });
  });
});

describe('trade fee row', () => {
  it('words the note by trade type', () => {
    expect(describeTradeFeeNote('buy', 'VWCE')).toBe('Commissione su acquisto di VWCE');
    expect(describeTradeFeeNote('sell', undefined)).toBe('Commissione su vendita');
  });
  it('is a negative spending row with no account, pointing at its trade', () => {
    const date = new Date(2026, 9, 21, 12);
    const doc = buildTradeFeeExpenseDoc({
      userId: 'u', tradeId: 't1', amount: 5, date, notes: 'n', now: date,
      category: { type: 'variable', categoryId: 'c', categoryName: 'Commissioni' },
    });
    expect(doc).toMatchObject({ userId: 'u', type: 'variable', amount: -5, feeOfTradeId: 't1', currency: 'EUR' });
    expect(doc.linkedCashAssetId).toBeUndefined();
  });
});
