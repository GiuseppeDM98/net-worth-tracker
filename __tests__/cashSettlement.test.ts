/**
 * Tests for lib/utils/cashSettlement.ts — when a cashflow row moves its account: on its own date.
 *
 * The edit cases are the ones the retired `reconcile*Edit` functions pinned (same account, account
 * swapped, unlinked, re-typed across the transfer boundary, a change that cancels out), now read
 * through ONE function, plus what the date adds: a row waiting for its date gave nothing and gives
 * nothing back, and an edit that moves the date across today applies or reverses.
 */

import { describe, expect, it } from 'vitest';

import {
  appliedBalanceEffectsOf,
  balanceEffectsOf,
  editBalanceEffects,
  hasDatedEffects,
  netBalanceEffects,
  selectLinkableOccurrences,
  settlesLater,
  type SettlementRow,
} from '@/lib/utils/cashSettlement';

const TODAY = new Date(2026, 8, 19, 12);
const PAST = new Date(2026, 8, 10, 12);
const FUTURE = new Date(2026, 8, 28, 12);

const spend = (amount: number, account?: string, extra: Partial<SettlementRow> = {}): SettlementRow => ({ type: 'fixed', amount: -Math.abs(amount), linkedCashAssetId: account, ...extra });
const transfer = (amount: number, origin?: string, destination?: string, extra: Partial<SettlementRow> = {}): SettlementRow => ({ type: 'transfer', amount, linkedCashAssetId: origin, transferCashAssetId: destination, ...extra });

describe('settlesLater', () => {
  it('should wait only for a day after today, by the Italian calendar', () => {
    expect(settlesLater(TODAY, TODAY)).toBe(false);
    expect(settlesLater(PAST, TODAY)).toBe(false);
    expect(settlesLater(FUTURE, TODAY)).toBe(true);
  });

  it('should read a row stamped at local midnight on the Italian day it belongs to', () => {
    // 22:30 UTC on the 19th is already the 20th in Rome (CEST, +2): tomorrow, so it waits.
    expect(settlesLater(new Date(Date.UTC(2026, 8, 19, 22, 30)), new Date(Date.UTC(2026, 8, 19, 10)))).toBe(true);
    // 21:30 UTC on the 19th is 23:30 in Rome: still today.
    expect(settlesLater(new Date(Date.UTC(2026, 8, 19, 21, 30)), new Date(Date.UTC(2026, 8, 19, 10)))).toBe(false);
  });
});

describe('balanceEffectsOf', () => {
  it('should debit the origin and credit the destination of a transfer, and add a row signed amount to its account', () => {
    expect(balanceEffectsOf(transfer(300, 'bnl', 'carta'))).toEqual([{ assetId: 'bnl', delta: -300 }, { assetId: 'carta', delta: 300 }]);
    expect(balanceEffectsOf(spend(559, 'bnl'))).toEqual([{ assetId: 'bnl', delta: -559 }]);
    expect(balanceEffectsOf({ type: 'income', amount: 2456, linkedCashAssetId: 'bnl' })).toEqual([{ assetId: 'bnl', delta: 2456 }]);
    expect(balanceEffectsOf(spend(559))).toEqual([]);
  });

  it('should give no applied effect for a row still waiting for its date', () => {
    expect(appliedBalanceEffectsOf(spend(559, 'bnl', { balancePending: true }))).toEqual([]);
    expect(appliedBalanceEffectsOf(spend(559, 'bnl'))).toEqual([{ assetId: 'bnl', delta: -559 }]);
  });

  it('should net the effects per account and drop the ones that cancel out', () => {
    expect(netBalanceEffects([{ assetId: 'a', delta: -100 }, { assetId: 'a', delta: 100 }, { assetId: 'b', delta: 5 }])).toEqual([{ assetId: 'b', delta: 5 }]);
  });
});

describe('editBalanceEffects', () => {
  const after = (row: SettlementRow, date = PAST) => ({ ...row, date });

  it('should move only the difference when the account stays the same', () => {
    expect(editBalanceEffects(spend(100, 'bnl'), after(spend(130, 'bnl')), TODAY)).toEqual({ effects: [{ assetId: 'bnl', delta: -30 }], pending: false });
  });

  it('should give back the old account and debit the new one when the account changes, or only give back when it is unlinked', () => {
    expect(editBalanceEffects(spend(100, 'bnl'), after(spend(100, 'carta')), TODAY).effects).toEqual([{ assetId: 'bnl', delta: 100 }, { assetId: 'carta', delta: -100 }]);
    expect(editBalanceEffects(spend(100, 'bnl'), after(spend(100)), TODAY).effects).toEqual([{ assetId: 'bnl', delta: 100 }]);
    expect(editBalanceEffects(spend(100), after(spend(100, 'bnl')), TODAY).effects).toEqual([{ assetId: 'bnl', delta: -100 }]);
  });

  it('should net out an origin that becomes the linked account when a transfer is re-typed into a spend', () => {
    // Old: bnl −300, carta +300. New: bnl −300. Net: carta gives back its 300.
    expect(editBalanceEffects(transfer(300, 'bnl', 'carta'), after(spend(300, 'bnl')), TODAY).effects).toEqual([{ assetId: 'carta', delta: -300 }]);
  });

  it('should debit back a former income re-typed into a transfer, never re-credit it', () => {
    const income: SettlementRow = { type: 'income', amount: 500, linkedCashAssetId: 'bnl' };
    expect(editBalanceEffects(income, after(transfer(500, 'bnl', 'carta')), TODAY).effects).toEqual([{ assetId: 'bnl', delta: -1000 }, { assetId: 'carta', delta: 500 }]);
  });

  it('should write nothing when the edit changes nothing on the accounts', () => {
    expect(editBalanceEffects(spend(100, 'bnl'), after(spend(100, 'bnl')), TODAY)).toEqual({ effects: [], pending: false });
  });

  it('should give nothing back for a row that was waiting, and apply it when its new date is today or past', () => {
    expect(editBalanceEffects(spend(100, 'bnl', { balancePending: true }), after(spend(100, 'bnl'), PAST), TODAY)).toEqual({ effects: [{ assetId: 'bnl', delta: -100 }], pending: false });
  });

  it('should reverse an applied row whose date moves into the future, and leave it waiting', () => {
    expect(editBalanceEffects(spend(100, 'bnl'), after(spend(100, 'bnl'), FUTURE), TODAY)).toEqual({ effects: [{ assetId: 'bnl', delta: 100 }], pending: true });
  });

  it('should keep a future row waiting with no effect, and a row without account never pending', () => {
    expect(editBalanceEffects(spend(100, 'bnl', { balancePending: true }), after(spend(150, 'carta'), FUTURE), TODAY)).toEqual({ effects: [], pending: true });
    expect(editBalanceEffects(spend(100), after(spend(150), FUTURE), TODAY)).toEqual({ effects: [], pending: false });
  });
});

describe('hasDatedEffects — a mortgage instalment waits for its date like an account', () => {
  it('should wait for a debt row linked to a property even without an account', () => {
    expect(hasDatedEffects({ type: 'debt', amount: -1012, debtAssetId: 'casa' })).toBe(true);
    expect(editBalanceEffects({ type: 'debt', amount: -1012 }, { type: 'debt', amount: -1012, debtAssetId: 'casa', date: FUTURE }, TODAY).pending).toBe(true);
  });

  it('should not wait for a property on a row that is not a debt, nor for nothing', () => {
    expect(hasDatedEffects({ type: 'fixed', amount: -40, debtAssetId: 'casa' })).toBe(false);
    expect(hasDatedEffects({ type: 'debt', amount: -1012 })).toBe(false);
  });
});

describe('selectLinkableOccurrences', () => {
  it('should link only the occurrences still to come that have not moved an account', () => {
    const rows = [
      { id: 'past', ...spend(559, 'bnl'), date: PAST },
      { id: 'past-unlinked', ...spend(559), date: PAST },
      { id: 'future-unlinked', ...spend(559), date: FUTURE },
      { id: 'future-waiting', ...spend(559, 'carta', { balancePending: true }), date: FUTURE },
      // A legacy first occurrence dated ahead moved its account at save: never re-pointed.
      { id: 'future-applied', ...spend(559, 'bnl'), date: FUTURE },
    ];
    expect(selectLinkableOccurrences(rows, TODAY).map((row) => row.id)).toEqual(['future-unlinked', 'future-waiting']);
  });
});
