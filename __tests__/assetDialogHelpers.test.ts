/**
 * Tests for the pure helpers behind AssetDialog.tsx's onSubmit.
 *
 * `buildBondDetailsFromForm` is imported from its own module (lib/utils/bondDetailsForm.ts): the
 * local copy this file used to keep pinned `!bondCouponRate` as correct and therefore never saw a
 * zero-coupon bond lose its whole details block (issue #340). The price conversion moved to
 * `__tests__/bondPricing.test.ts` with the module it now lives in.
 */

import { describe, it, expect } from 'vitest';
import type { CouponRateTier } from '@/types/assets';
import { buildBondDetailsFromForm, type BondDetailsFormInput } from '@/lib/utils/bondDetailsForm';

const TODAY = new Date(2026, 8, 11); // 11/09/2026

// Mirrors the taxRate branch of `buildAssetFormDataFromValues` in AssetDialog.tsx —
// A saved taxRate of 0 must survive the submit round-trip (0 is falsy — `||` would erase it).
function resolveTaxRateForPersist(taxRate: number | undefined): number | undefined {
  return taxRate !== undefined && !isNaN(taxRate) && taxRate >= 0 ? taxRate : undefined;
}

// ---------------------------------------------------------------------------

describe('buildBondDetailsFromForm', () => {
  const validData: BondDetailsFormInput = {
    bondCouponRate: 3.5,
    bondCouponFrequency: 'semiannual',
    bondIssueDate: '2023-09-01',
    bondMaturityDate: '2027-09-01',
    bondNominalValue: 1000,
  };

  it('should return undefined when showBondDetails is false', () => {
    expect(buildBondDetailsFromForm(validData, false, false, undefined, TODAY)).toBeUndefined();
  });

  it('should return undefined when couponRate is EMPTY (undefined or NaN from an empty input)', () => {
    expect(buildBondDetailsFromForm({ ...validData, bondCouponRate: undefined }, true, false, undefined, TODAY)).toBeUndefined();
    expect(buildBondDetailsFromForm({ ...validData, bondCouponRate: NaN }, true, false, undefined, TODAY)).toBeUndefined();
  });

  it('should keep the details of a ZERO-coupon bond — 0 is a rate, not a missing field (issue #340)', () => {
    const result = buildBondDetailsFromForm({ ...validData, bondCouponRate: 0 }, true, false, undefined, TODAY);
    expect(result).not.toBeUndefined();
    expect(result?.couponRate).toBe(0);
    expect(result?.nominalValue).toBe(1000);
    expect(result?.maturityDate).toBeInstanceOf(Date);
  });

  it('should return undefined when couponFrequency is missing', () => {
    const data = { ...validData, bondCouponFrequency: undefined };
    expect(buildBondDetailsFromForm(data, true, false, undefined, TODAY)).toBeUndefined();
  });

  it('should return undefined when issueDate is missing', () => {
    const data = { ...validData, bondIssueDate: undefined };
    expect(buildBondDetailsFromForm(data, true, false, undefined, TODAY)).toBeUndefined();
  });

  it('should return undefined when maturityDate is missing', () => {
    const data = { ...validData, bondMaturityDate: undefined };
    expect(buildBondDetailsFromForm(data, true, false, undefined, TODAY)).toBeUndefined();
  });

  it('should return a BondDetails object with all required fields', () => {
    const result = buildBondDetailsFromForm(validData, true, false, undefined, TODAY);
    expect(result).not.toBeUndefined();
    expect(result?.couponRate).toBe(3.5);
    expect(result?.couponFrequency).toBe('semiannual');
    expect(result?.issueDate).toBeInstanceOf(Date);
    expect(result?.maturityDate).toBeInstanceOf(Date);
    expect(result?.nominalValue).toBe(1000);
  });

  it('should omit nominalValue when not provided (one unit is then 1 € of nominal)', () => {
    const data = { ...validData, bondNominalValue: undefined };
    const result = buildBondDetailsFromForm(data, true, false, undefined, TODAY);
    expect(result).not.toBeUndefined();
    expect('nominalValue' in (result ?? {})).toBe(false);
  });

  it('should include step-up schedule when showStepUp is true', () => {
    const schedule: CouponRateTier[] = [
      { yearFrom: 1, yearTo: 2, rate: 2.5 },
      { yearFrom: 3, yearTo: 4, rate: 3.0 },
    ];
    const data = { ...validData, bondCouponRateSchedule: schedule };
    const result = buildBondDetailsFromForm(data, true, true, undefined, TODAY);
    expect(result?.couponRateSchedule).toEqual(schedule);
  });

  it('should not include step-up schedule when showStepUp is false', () => {
    const schedule: CouponRateTier[] = [{ yearFrom: 1, yearTo: 2, rate: 2.5 }];
    const data = { ...validData, bondCouponRateSchedule: schedule };
    const result = buildBondDetailsFromForm(data, true, false, undefined, TODAY);
    expect('couponRateSchedule' in (result ?? {})).toBe(false);
  });

  it('should include finalPremiumRate when provided', () => {
    const data = { ...validData, bondFinalPremiumRate: 0.8 };
    const result = buildBondDetailsFromForm(data, true, false, undefined, TODAY);
    expect(result?.finalPremiumRate).toBe(0.8);
  });

  it('should omit finalPremiumRate when not provided', () => {
    const result = buildBondDetailsFromForm(validData, true, false, undefined, TODAY);
    expect('finalPremiumRate' in (result ?? {})).toBe(false);
  });

  describe('inflation indexation', () => {
    it('writes no mechanism and never the legacy flag for a plain bond', () => {
      const result = buildBondDetailsFromForm({ ...validData, bondInflationIndexation: 'none' }, true, false, undefined, TODAY);
      expect('inflationIndexation' in (result ?? {})).toBe(false);
      expect('isInflationLinked' in (result ?? {})).toBe(false);
    });

    it('keeps the announced FOI rates of a BTP Italia across an edit, and drops them when the mechanism changes', () => {
      const existing = { announcedInflationRates: [{ couponDate: new Date(2026, 11, 17), periodRate: 1.3 }] };
      const kept = buildBondDetailsFromForm({ ...validData, bondInflationIndexation: 'italia' }, true, false, existing, TODAY);
      expect(kept?.inflationIndexation).toBe('italia');
      expect(kept?.announcedInflationRates).toHaveLength(1);

      const dropped = buildBondDetailsFromForm({ ...validData, bondInflationIndexation: 'euro' }, true, false, existing, TODAY);
      expect(dropped?.inflationIndexation).toBe('euro');
      expect('announcedInflationRates' in (dropped ?? {})).toBe(false);
    });

    it('stores today’s coefficient for a BTP€i when it is news, keeping the earlier entries', () => {
      const existing = { indexationCoefficients: [{ date: new Date(2026, 4, 15), coefficient: 1.2 }] };
      const result = buildBondDetailsFromForm(
        { ...validData, bondInflationIndexation: 'euro', bondIndexationCoefficient: 1.25 },
        true, false, existing, TODAY
      );
      expect(result?.indexationCoefficients).toEqual([
        { date: new Date(2026, 4, 15), coefficient: 1.2 },
        { date: TODAY, coefficient: 1.25 },
      ]);
    });

    it('adds nothing when the typed coefficient equals the latest known one', () => {
      const existing = { indexationCoefficients: [{ date: new Date(2026, 4, 15), coefficient: 1.25 }] };
      const result = buildBondDetailsFromForm(
        { ...validData, bondInflationIndexation: 'euro', bondIndexationCoefficient: 1.25 },
        true, false, existing, TODAY
      );
      expect(result?.indexationCoefficients).toHaveLength(1);
    });

    it('saves a BTP€i without any coefficient when the field is empty', () => {
      const result = buildBondDetailsFromForm(
        { ...validData, bondInflationIndexation: 'euro', bondIndexationCoefficient: NaN },
        true, false, undefined, TODAY
      );
      expect(result?.inflationIndexation).toBe('euro');
      expect('indexationCoefficients' in (result ?? {})).toBe(false);
    });
  });
});

describe('resolveTaxRateForPersist', () => {
  it('should preserve an explicit 0 (not treat it as empty)', () => {
    expect(resolveTaxRateForPersist(0)).toBe(0);
  });

  it('should preserve a positive tax rate', () => {
    expect(resolveTaxRateForPersist(26)).toBe(26);
  });

  it('should preserve the BTP shortcut rate', () => {
    expect(resolveTaxRateForPersist(12.5)).toBe(12.5);
  });

  it('should convert an empty field (NaN from valueAsNumber) to undefined', () => {
    expect(resolveTaxRateForPersist(NaN)).toBeUndefined();
  });

  it('should convert undefined to undefined', () => {
    expect(resolveTaxRateForPersist(undefined)).toBeUndefined();
  });

  it('should reject a negative tax rate', () => {
    expect(resolveTaxRateForPersist(-5)).toBeUndefined();
  });
});
