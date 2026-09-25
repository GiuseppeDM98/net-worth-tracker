/**
 * Tests for lib/utils/mortgageRepayment.ts — a mortgage instalment lowers its property's debt by
 * its PRINCIPAL only (French amortisation: interest = debt × TAN / 12), on its own date, and what
 * it repaid is given back exactly on an edit or a delete.
 *
 * The reference figures are a textbook plan: 200.000 € at 3,6% over 25 years has a constant
 * instalment of 1.012,00 € (rounded), 600,00 € of interest in the first month.
 */

import { describe, expect, it } from 'vitest';

import {
  appliedDebtRepaymentOf,
  debtGivenBackBy,
  isRepayableProperty,
  planDebtEdit,
  planDebtRepayments,
  selectDebtLinkableOccurrences,
  splitInstalment,
  type DebtRow,
} from '@/lib/utils/mortgageRepayment';

const TODAY = new Date(2026, 8, 25, 12);
const PAST = new Date(2026, 8, 10, 12);
const FUTURE = new Date(2026, 9, 10, 12);

const instalment = (id: string, date: Date, extra: Partial<DebtRow> = {}): DebtRow => ({
  id,
  type: 'debt',
  amount: -1012,
  date,
  debtAssetId: 'casa',
  ...extra,
});

describe('splitInstalment', () => {
  it('should take the month\'s interest off the instalment and repay the rest', () => {
    // 200.000 × 3,6% / 12 = 600,00 of interest; 1.012 − 600 = 412,00 of principal.
    expect(splitInstalment(1012, 200_000, 3.6)).toEqual({ interest: 600, principal: 412 });
  });

  it('should read the instalment by its size, whatever its sign', () => {
    expect(splitInstalment(-1012, 200_000, 3.6)).toEqual({ interest: 600, principal: 412 });
  });

  it('should round both parts to the cent', () => {
    // 123.456,78 × 2,95% / 12 = 303,4979… → 303,50.
    expect(splitInstalment(700, 123_456.78, 2.95)).toEqual({ interest: 303.5, principal: 396.5 });
  });

  it('should repay the whole instalment without a TAN (a 0% loan)', () => {
    expect(splitInstalment(500, 10_000, undefined)).toEqual({ interest: 0, principal: 500 });
    expect(splitInstalment(500, 10_000, 0)).toEqual({ interest: 0, principal: 500 });
  });

  it('should never repay more than the debt, nor less than nothing', () => {
    expect(splitInstalment(1012, 300, 3.6).principal).toBe(300);
    // An instalment below the month's interest repays nothing (negative amortisation is not modelled),
    // and pays as interest no more than itself.
    expect(splitInstalment(100, 200_000, 3.6)).toEqual({ interest: 100, principal: 0 });
    expect(splitInstalment(1012, 0, 3.6)).toEqual({ interest: 0, principal: 0 });
  });
});

describe('planDebtRepayments', () => {
  it('should apply instalments in date order, each on the debt the previous one left', () => {
    const debts = new Map([['casa', { debt: 200_000, annualRatePct: 3.6 }]]);
    // Handed in reverse: the order of application is the dates', not the array's.
    const plan = planDebtRepayments([instalment('b', new Date(2026, 8, 10, 12)), instalment('a', new Date(2026, 7, 10, 12))], debts);
    expect(plan.principals.get('a')).toBe(412);
    // Second month: 199.588 × 3,6% / 12 = 598,76 of interest → 413,24 of principal.
    expect(plan.principals.get('b')).toBe(413.24);
    expect(plan.debts.get('casa')).toBe(199_174.76);
    // The interest each instalment PAID, stored beside its principal for Patrimonio's «Mutuo» tile.
    expect(plan.interests.get('a')).toBe(600);
    expect(plan.interests.get('b')).toBe(598.76);
  });

  it('should keep each property on its own debt', () => {
    const debts = new Map([
      ['casa', { debt: 200_000, annualRatePct: 3.6 }],
      ['mare', { debt: 50_000 }],
    ]);
    const plan = planDebtRepayments([instalment('a', PAST), instalment('b', PAST, { debtAssetId: 'mare', amount: -300 })], debts);
    expect(plan.debts.get('casa')).toBe(199_588);
    expect(plan.debts.get('mare')).toBe(49_700);
  });

  it('should settle a row whose property is gone with nothing repaid, and move no debt', () => {
    const plan = planDebtRepayments([instalment('a', PAST, { debtAssetId: 'venduta' })], new Map());
    expect(plan.principals.get('a')).toBe(0);
    expect(plan.debts.size).toBe(0);
  });

  it('should ignore a row that repays no property', () => {
    const plan = planDebtRepayments([instalment('a', PAST, { debtAssetId: undefined }), instalment('b', PAST, { type: 'fixed' })], new Map([['casa', { debt: 1000 }]]));
    expect(plan.principals.size).toBe(0);
  });
});

describe('appliedDebtRepaymentOf and debtGivenBackBy', () => {
  it('should give back the principal stored on the row, never a recomputation', () => {
    expect(appliedDebtRepaymentOf({ debtAssetId: 'casa', debtPrincipalRepaid: 412 })).toEqual({ assetId: 'casa', principal: 412 });
  });

  it('should give back nothing for a row still waiting for its date, or that repaid nothing', () => {
    expect(appliedDebtRepaymentOf({ debtAssetId: 'casa', debtPrincipalRepaid: 412, balancePending: true })).toBeNull();
    expect(appliedDebtRepaymentOf({ debtAssetId: 'casa' })).toBeNull();
    expect(appliedDebtRepaymentOf({ debtAssetId: 'casa', debtPrincipalRepaid: 0 })).toBeNull();
  });

  it('should sum what a deleted series gives back, per property', () => {
    const givenBack = debtGivenBackBy([
      { debtAssetId: 'casa', debtPrincipalRepaid: 412 },
      { debtAssetId: 'casa', debtPrincipalRepaid: 413.24 },
      { debtAssetId: 'casa', balancePending: true },
      { debtAssetId: 'mare', debtPrincipalRepaid: 300 },
    ]);
    expect(givenBack.get('casa')).toBe(825.24);
    expect(givenBack.get('mare')).toBe(300);
  });
});

describe('planDebtEdit', () => {
  const applied = { type: 'debt' as const, amount: -1012, debtAssetId: 'casa', debtPrincipalRepaid: 412 };

  it('should change nothing when the edit touches neither the property, the amount nor the date side', () => {
    expect(planDebtEdit(applied, { type: 'debt', amount: -1012, debtAssetId: 'casa', date: PAST }, TODAY)).toMatchObject({ unchanged: true });
  });

  it('should give back and re-apply when the amount changes', () => {
    expect(planDebtEdit(applied, { type: 'debt', amount: -1100, debtAssetId: 'casa', date: PAST }, TODAY)).toEqual({
      giveBack: { assetId: 'casa', principal: 412 },
      applyNow: true,
      unchanged: false,
    });
  });

  it('should only give back when the row is unlinked, re-typed or moved into the future', () => {
    for (const after of [
      { type: 'debt' as const, amount: -1012, debtAssetId: undefined, date: PAST },
      { type: 'fixed' as const, amount: -1012, debtAssetId: 'casa', date: PAST },
      { type: 'debt' as const, amount: -1012, debtAssetId: 'casa', date: FUTURE },
    ]) {
      expect(planDebtEdit(applied, after, TODAY)).toEqual({ giveBack: { assetId: 'casa', principal: 412 }, applyNow: false, unchanged: false });
    }
  });

  it('should apply a row newly linked, with nothing to give back', () => {
    expect(planDebtEdit({ type: 'debt', amount: -1012 }, { type: 'debt', amount: -1012, debtAssetId: 'casa', date: TODAY }, TODAY)).toEqual({
      giveBack: null,
      applyNow: true,
      unchanged: false,
    });
  });

  it('should not treat a pending row as applied', () => {
    const pending = { ...applied, debtPrincipalRepaid: undefined, balancePending: true };
    expect(planDebtEdit(pending, { type: 'debt', amount: -1012, debtAssetId: 'casa', date: TODAY }, TODAY)).toEqual({ giveBack: null, applyNow: true, unchanged: false });
  });
});

describe('selectDebtLinkableOccurrences', () => {
  it('should take the future instalments not linked yet, whose account has not moved', () => {
    const rows = [
      { id: 'past', type: 'debt' as const, date: PAST },
      { id: 'free', type: 'debt' as const, date: FUTURE },
      { id: 'waiting', type: 'debt' as const, date: FUTURE, linkedCashAssetId: 'bnl', balancePending: true },
      { id: 'linked', type: 'debt' as const, date: FUTURE, debtAssetId: 'casa' },
      // A pre-2026-09-19 series moved its first row's account at save: flagging it pending would
      // debit the account a second time on the day.
      { id: 'legacy', type: 'debt' as const, date: FUTURE, linkedCashAssetId: 'bnl' },
      { id: 'fixed', type: 'fixed' as const, date: FUTURE },
    ];
    expect(selectDebtLinkableOccurrences(rows, TODAY).map((row) => row.id)).toEqual(['free', 'waiting']);
  });
});

describe('isRepayableProperty', () => {
  it('should offer real estate carrying a debt, and nothing else', () => {
    expect(isRepayableProperty({ type: 'realestate', assetClass: 'realestate', outstandingDebt: 180_000 })).toBe(true);
    expect(isRepayableProperty({ type: 'realestate', assetClass: 'realestate', outstandingDebt: 0 })).toBe(false);
    expect(isRepayableProperty({ type: 'realestate', assetClass: 'realestate' })).toBe(false);
    expect(isRepayableProperty({ type: 'etf', assetClass: 'realestate', outstandingDebt: 1 })).toBe(false);
  });
});
