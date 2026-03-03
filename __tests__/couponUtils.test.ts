/**
 * Unit tests for couponUtils.ts — bond coupon scheduling and step-up rate selection.
 *
 * All functions tested here are pure (no Firebase, no side effects).
 * getNextCouponDate uses new Date() internally → vi.useFakeTimers() required.
 *
 * Test scenario for manual UI verification (today = 2026-03-03):
 *   Bond issued 2023-09-09, semiannual, step-up 2.5%→2.8%→3.0% (tiers 1-2/3-4/5-6)
 *   → next coupon: 2026-03-09 @ 2.8% (fascia 2, bond-year 3)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPeriodsPerYear,
  getApplicableCouponRate,
  getNextCouponDate,
  getFollowingCouponDate,
  calculateCouponPerShare,
} from '@/lib/utils/couponUtils';
import type { CouponRateTier } from '@/types/assets';

// ---------------------------------------------------------------------------
// Shared fixture for step-up schedule tests
// ---------------------------------------------------------------------------
const STEP_UP_SCHEDULE: CouponRateTier[] = [
  { yearFrom: 1, yearTo: 2, rate: 2.5 },
  { yearFrom: 3, yearTo: 4, rate: 2.8 },
  { yearFrom: 5, yearTo: 6, rate: 3.0 },
];
// Issue date used in getApplicableCouponRate tests: Sep 9, 2023
const ISSUE_SEP_2023 = new Date(2023, 8, 9);
const BASE_RATE = 2.5;

// ---------------------------------------------------------------------------
describe('getPeriodsPerYear', () => {
  it('returns 12 for monthly', () => {
    expect(getPeriodsPerYear('monthly')).toBe(12);
  });

  it('returns 4 for quarterly', () => {
    expect(getPeriodsPerYear('quarterly')).toBe(4);
  });

  it('returns 2 for semiannual', () => {
    expect(getPeriodsPerYear('semiannual')).toBe(2);
  });

  it('returns 1 for annual', () => {
    expect(getPeriodsPerYear('annual')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('getApplicableCouponRate', () => {
  it('returns baseRate when schedule is undefined', () => {
    const payment = new Date(2025, 2, 9);
    expect(getApplicableCouponRate(payment, ISSUE_SEP_2023, BASE_RATE, undefined)).toBe(2.5);
  });

  it('returns baseRate when schedule is empty array', () => {
    const payment = new Date(2025, 2, 9);
    expect(getApplicableCouponRate(payment, ISSUE_SEP_2023, BASE_RATE, [])).toBe(2.5);
  });

  it('returns fascia-1 rate for bondYear=1 (6 months elapsed)', () => {
    // 2024-03-09: elapsed=6, bondYear=ceil(6/12)=1 → fascia {1,2} → 2.5%
    const payment = new Date(2024, 2, 9);
    expect(getApplicableCouponRate(payment, ISSUE_SEP_2023, BASE_RATE, STEP_UP_SCHEDULE)).toBe(2.5);
  });

  it('returns fascia-1 rate for bondYear=2 (18 months elapsed)', () => {
    // 2025-03-09: elapsed=18, bondYear=ceil(18/12)=2 → fascia {1,2} → 2.5%
    const payment = new Date(2025, 2, 9);
    expect(getApplicableCouponRate(payment, ISSUE_SEP_2023, BASE_RATE, STEP_UP_SCHEDULE)).toBe(2.5);
  });

  it('returns fascia-2 rate for bondYear=3 (30 months elapsed) — scenario principale', () => {
    // 2026-03-09: elapsed=(2026-2023)*12+(3-9)=30, bondYear=ceil(30/12)=3
    // → fascia {3,4} → 2.8%
    // Questo è il caso verificabile OGGI (2026-03-03): il bond emesso 09/09/2023
    // ha la prossima cedola il 09/03/2026 che cade in bond-year 3, fascia 2.
    const payment = new Date(2026, 2, 9);
    expect(getApplicableCouponRate(payment, ISSUE_SEP_2023, BASE_RATE, STEP_UP_SCHEDULE)).toBe(2.8);
  });

  it('returns fascia-3 rate for bondYear=5 (54 months elapsed)', () => {
    // 2028-03-09: elapsed=54, bondYear=ceil(54/12)=5 → fascia {5,6} → 3.0%
    const payment = new Date(2028, 2, 9);
    expect(getApplicableCouponRate(payment, ISSUE_SEP_2023, BASE_RATE, STEP_UP_SCHEDULE)).toBe(3.0);
  });

  it('falls back to baseRate when bondYear exceeds all tiers', () => {
    // 2030-09-09: elapsed=84, bondYear=7 → nessuna fascia → baseRate 2.5%
    const payment = new Date(2030, 8, 9);
    expect(getApplicableCouponRate(payment, ISSUE_SEP_2023, BASE_RATE, STEP_UP_SCHEDULE)).toBe(2.5);
  });
});

// ---------------------------------------------------------------------------
describe('getNextCouponDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the next upcoming coupon for a backdated semiannual bond', () => {
    // Simula today = 2026-03-03 (scenario manuale di test per fascia 2)
    vi.setSystemTime(new Date(2026, 2, 3));
    const issue = new Date(2023, 8, 9);    // 09/09/2023
    const maturity = new Date(2029, 8, 9); // 09/09/2029
    // Walk: 2024-03-09, 2024-09-09, 2025-03-09, 2025-09-09 → tutti ≤ oggi
    // 2026-03-09 > 2026-03-03 → si ferma
    const result = getNextCouponDate(issue, 'semiannual', maturity);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(2);  // Marzo (0-indexed)
    expect(result!.getDate()).toBe(9);
  });

  it('returns null when bond has matured', () => {
    vi.setSystemTime(new Date(2026, 2, 3));
    const issue = new Date(2020, 0, 1);
    const maturity = new Date(2023, 0, 1); // scaduto nel passato
    expect(getNextCouponDate(issue, 'annual', maturity)).toBeNull();
  });

  it('skips a coupon falling exactly on today and returns the following period', () => {
    // today = 09/03/2026; cedola su 09/03/2026 è <= oggi → saltata
    vi.setSystemTime(new Date(2026, 2, 9));
    const issue = new Date(2025, 8, 9);    // 09/09/2025
    const maturity = new Date(2030, 8, 9);
    const result = getNextCouponDate(issue, 'semiannual', maturity);
    expect(result).not.toBeNull();
    // Prossima: 09/09/2026
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(8); // Settembre
    expect(result!.getDate()).toBe(9);
  });

  it('returns a coupon date that falls exactly on maturity (inclusive)', () => {
    // Cedola coincide con scadenza → valida (la condizione è > maturity, non >=)
    vi.setSystemTime(new Date(2025, 0, 1));
    const issue = new Date(2024, 0, 1);    // 01/01/2024
    const maturity = new Date(2026, 0, 1); // 01/01/2026
    const result = getNextCouponDate(issue, 'annual', maturity);
    // Cedola 01/01/2025 ≤ oggi → saltata; 01/01/2026 = maturity → valida
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(0);
    expect(result!.getDate()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('getFollowingCouponDate', () => {
  it('advances a quarterly coupon by 3 months', () => {
    const paid = new Date(2026, 2, 9);     // 09/03/2026
    const maturity = new Date(2030, 0, 1);
    const result = getFollowingCouponDate(paid, 'quarterly', maturity);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2026);
    expect(result!.getMonth()).toBe(5); // Giugno
    expect(result!.getDate()).toBe(9);
  });

  it('advances a semiannual coupon by 6 months', () => {
    const paid = new Date(2026, 8, 9);     // 09/09/2026
    const maturity = new Date(2029, 8, 9);
    const result = getFollowingCouponDate(paid, 'semiannual', maturity);
    expect(result).not.toBeNull();
    expect(result!.getFullYear()).toBe(2027);
    expect(result!.getMonth()).toBe(2); // Marzo
    expect(result!.getDate()).toBe(9);
  });

  it('returns null when the next period would exceed maturity', () => {
    const paid = new Date(2029, 2, 9);     // 09/03/2029
    const maturity = new Date(2029, 8, 9); // 09/09/2029
    // +12 mesi = 09/03/2030 > scadenza → null
    expect(getFollowingCouponDate(paid, 'annual', maturity)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('calculateCouponPerShare', () => {
  it('calculates semiannual coupon at 2.8% on €1000 nominal', () => {
    // (2.8 / 100 / 2) * 1000 = 14 (ma IEEE 754 → toBeCloseTo)
    const result = calculateCouponPerShare(2.8, 1000, 'semiannual');
    expect(result).toBeCloseTo(14, 8);
  });

  it('calculates quarterly coupon at 3.0% on €500 nominal', () => {
    // (3.0 / 100 / 4) * 500 = 3.75 (esatto in float)
    const result = calculateCouponPerShare(3.0, 500, 'quarterly');
    expect(result).toBe(3.75);
  });

  it('calculates annual coupon at 4.0% on €1000 nominal', () => {
    // (4.0 / 100 / 1) * 1000 = 40
    const result = calculateCouponPerShare(4.0, 1000, 'annual');
    expect(result).toBe(40);
  });

  it('calculates with nominalValue=1 (default bond unit)', () => {
    // (2.5 / 100 / 2) * 1 = 0.0125
    const result = calculateCouponPerShare(2.5, 1, 'semiannual');
    expect(result).toBeCloseTo(0.0125, 10);
  });
});
