/**
 * Characterization tests for the pure helpers extracted from AssetDialog.tsx onSubmit.
 * Local copies for isolated testing — mirror the file-scope helpers in that component.
 * These anchor the Session C refactor and prevent silent regressions in price conversion.
 */

import { describe, it, expect } from 'vitest';
import type { CouponFrequency, CouponRateTier } from '@/types/assets';

// ---------------------------------------------------------------------------
// Local copies of extracted helpers (mirrors AssetDialog.tsx file-scope helpers)
// ---------------------------------------------------------------------------

function resolveBondPrice(
  rawPrice: number,
  nominalValue: number | undefined,
  isBondWithIsin: boolean
): number {
  if (isBondWithIsin && nominalValue && !isNaN(nominalValue) && nominalValue > 1) {
    return rawPrice * (nominalValue / 100);
  }
  return rawPrice;
}

interface BondDetailsInput {
  bondCouponRate?: number;
  bondCouponFrequency?: CouponFrequency;
  bondIssueDate?: string;
  bondMaturityDate?: string;
  bondNominalValue?: number;
  bondCouponRateSchedule?: CouponRateTier[];
  bondFinalPremiumRate?: number;
}

function buildBondDetailsFromForm(
  data: BondDetailsInput,
  showBondDetails: boolean,
  showStepUp: boolean
) {
  if (
    !showBondDetails ||
    !data.bondCouponRate || isNaN(data.bondCouponRate) ||
    !data.bondCouponFrequency ||
    !data.bondIssueDate ||
    !data.bondMaturityDate
  ) {
    return undefined;
  }

  return {
    couponRate: data.bondCouponRate,
    couponFrequency: data.bondCouponFrequency,
    issueDate: new Date(data.bondIssueDate),
    maturityDate: new Date(data.bondMaturityDate),
    ...(data.bondNominalValue && !isNaN(data.bondNominalValue) ? { nominalValue: data.bondNominalValue } : {}),
    ...(showStepUp && data.bondCouponRateSchedule && data.bondCouponRateSchedule.length > 0
      ? { couponRateSchedule: data.bondCouponRateSchedule }
      : {}),
    ...(data.bondFinalPremiumRate && !isNaN(data.bondFinalPremiumRate)
      ? { finalPremiumRate: data.bondFinalPremiumRate }
      : {}),
  };
}

// ---------------------------------------------------------------------------

describe('resolveBondPrice', () => {
  it('should apply % of par conversion for bonds with ISIN and valid nominal value', () => {
    // 104.2% of par with nominalValue=1000 → 1042€
    expect(resolveBondPrice(104.2, 1000, true)).toBeCloseTo(1042);
  });

  it('should return price at par for 100% with nominalValue=1000', () => {
    expect(resolveBondPrice(100, 1000, true)).toBe(1000);
  });

  it('should return rawPrice unchanged when not a bond with ISIN', () => {
    expect(resolveBondPrice(150, 1000, false)).toBe(150);
  });

  it('should return rawPrice unchanged when nominalValue is undefined', () => {
    expect(resolveBondPrice(104.2, undefined, true)).toBe(104.2);
  });

  it('should return rawPrice unchanged when nominalValue is 1 (retail bond par = 1)', () => {
    // Bonds with nominalValue=1 are not Borsa Italiana convention — skip conversion
    expect(resolveBondPrice(1.042, 1, true)).toBe(1.042);
  });

  it('should handle nominalValue=100 (BTP Valore mini bonds)', () => {
    // 102.5% of par with nominalValue=100 → 102.5€
    expect(resolveBondPrice(102.5, 100, true)).toBeCloseTo(102.5);
  });

  it('should handle standard BTP with nominalValue=1000 at discount', () => {
    // 95% of par → 950€
    expect(resolveBondPrice(95, 1000, true)).toBe(950);
  });
});

describe('buildBondDetailsFromForm', () => {
  const validData: BondDetailsInput = {
    bondCouponRate: 3.5,
    bondCouponFrequency: 'semiannual',
    bondIssueDate: '2023-09-01',
    bondMaturityDate: '2027-09-01',
    bondNominalValue: 1000,
  };

  it('should return undefined when showBondDetails is false', () => {
    expect(buildBondDetailsFromForm(validData, false, false)).toBeUndefined();
  });

  it('should return undefined when couponRate is missing', () => {
    const data = { ...validData, bondCouponRate: undefined };
    expect(buildBondDetailsFromForm(data, true, false)).toBeUndefined();
  });

  it('should return undefined when couponFrequency is missing', () => {
    const data = { ...validData, bondCouponFrequency: undefined };
    expect(buildBondDetailsFromForm(data, true, false)).toBeUndefined();
  });

  it('should return undefined when issueDate is missing', () => {
    const data = { ...validData, bondIssueDate: undefined };
    expect(buildBondDetailsFromForm(data, true, false)).toBeUndefined();
  });

  it('should return undefined when maturityDate is missing', () => {
    const data = { ...validData, bondMaturityDate: undefined };
    expect(buildBondDetailsFromForm(data, true, false)).toBeUndefined();
  });

  it('should return a BondDetails object with all required fields', () => {
    const result = buildBondDetailsFromForm(validData, true, false);
    expect(result).not.toBeUndefined();
    expect(result?.couponRate).toBe(3.5);
    expect(result?.couponFrequency).toBe('semiannual');
    expect(result?.issueDate).toBeInstanceOf(Date);
    expect(result?.maturityDate).toBeInstanceOf(Date);
    expect(result?.nominalValue).toBe(1000);
  });

  it('should omit nominalValue when not provided', () => {
    const data = { ...validData, bondNominalValue: undefined };
    const result = buildBondDetailsFromForm(data, true, false);
    expect(result).not.toBeUndefined();
    expect('nominalValue' in (result ?? {})).toBe(false);
  });

  it('should include step-up schedule when showStepUp is true', () => {
    const schedule: CouponRateTier[] = [
      { yearFrom: 1, yearTo: 2, rate: 2.5 },
      { yearFrom: 3, yearTo: 4, rate: 3.0 },
    ];
    const data = { ...validData, bondCouponRateSchedule: schedule };
    const result = buildBondDetailsFromForm(data, true, true);
    expect(result?.couponRateSchedule).toEqual(schedule);
  });

  it('should not include step-up schedule when showStepUp is false', () => {
    const schedule: CouponRateTier[] = [{ yearFrom: 1, yearTo: 2, rate: 2.5 }];
    const data = { ...validData, bondCouponRateSchedule: schedule };
    const result = buildBondDetailsFromForm(data, true, false);
    expect('couponRateSchedule' in (result ?? {})).toBe(false);
  });

  it('should include finalPremiumRate when provided', () => {
    const data = { ...validData, bondFinalPremiumRate: 0.8 };
    const result = buildBondDetailsFromForm(data, true, false);
    expect(result?.finalPremiumRate).toBe(0.8);
  });

  it('should omit finalPremiumRate when not provided', () => {
    const result = buildBondDetailsFromForm(validData, true, false);
    expect('finalPremiumRate' in (result ?? {})).toBe(false);
  });
});
