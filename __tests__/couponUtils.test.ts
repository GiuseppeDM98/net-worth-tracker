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
  couponFrequencyLabel,
  findAnnouncedInflationRate,
  upsertAnnouncedInflationRate,
  resolveCoupon,
  buildCouponNote,
} from '@/lib/utils/couponUtils';
import type { CouponRateTier, BondDetails } from '@/types/assets';

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

// ---------------------------------------------------------------------------
// Inflation-linked bonds (BTP Italia Sì)
// ---------------------------------------------------------------------------

// BTP Italia Sì-style fixture: fixed minimum 1.50% annual, semiannual, nominal 1000.
const INFLATION_BOND: BondDetails = {
  couponRate: 1.5,
  couponFrequency: 'semiannual',
  issueDate: new Date(2026, 5, 17),    // 17/06/2026
  maturityDate: new Date(2031, 5, 17), // 17/06/2031
  nominalValue: 1000,
  isInflationLinked: true,
  finalPremiumRate: 0.6,
};
// First coupon falls 6 months after issue → 17/12/2026.
const FIRST_COUPON = new Date(2026, 11, 17);

describe('couponFrequencyLabel', () => {
  it('maps frequencies to Italian adjectives', () => {
    expect(couponFrequencyLabel('monthly')).toBe('mensile');
    expect(couponFrequencyLabel('quarterly')).toBe('trimestrale');
    expect(couponFrequencyLabel('semiannual')).toBe('semestrale');
    expect(couponFrequencyLabel('annual')).toBe('annuale');
  });
});

describe('findAnnouncedInflationRate', () => {
  it('returns null for undefined or empty schedules', () => {
    expect(findAnnouncedInflationRate(undefined, FIRST_COUPON)).toBeNull();
    expect(findAnnouncedInflationRate([], FIRST_COUPON)).toBeNull();
  });

  it('matches by year+month, ignoring day-of-month drift', () => {
    const rates = [{ couponDate: new Date(2026, 11, 17), periodRate: 1.3 }];
    // Same year+month, different day → still matches (robust to date drift).
    expect(findAnnouncedInflationRate(rates, new Date(2026, 11, 5))).toBe(1.3);
  });

  it('returns null when no entry shares the coupon year+month', () => {
    const rates = [{ couponDate: new Date(2027, 5, 17), periodRate: 0.9 }];
    expect(findAnnouncedInflationRate(rates, FIRST_COUPON)).toBeNull();
  });
});

describe('upsertAnnouncedInflationRate', () => {
  it('appends to an undefined/empty schedule', () => {
    expect(upsertAnnouncedInflationRate(undefined, FIRST_COUPON, 1.3)).toEqual([
      { couponDate: FIRST_COUPON, periodRate: 1.3 },
    ]);
  });

  it('replaces an existing entry for the same year+month', () => {
    const existing = [{ couponDate: new Date(2026, 11, 1), periodRate: 0.9 }];
    const result = upsertAnnouncedInflationRate(existing, FIRST_COUPON, 1.3);
    expect(result).toHaveLength(1);
    expect(result[0].periodRate).toBe(1.3);
  });

  it('keeps entries for other coupon periods', () => {
    const existing = [{ couponDate: new Date(2026, 5, 17), periodRate: 0.8 }];
    const result = upsertAnnouncedInflationRate(existing, FIRST_COUPON, 1.3);
    expect(result).toHaveLength(2);
  });
});

describe('resolveCoupon', () => {
  it('returns the fixed coupon and not provisional for a plain (non-inflation) bond', () => {
    const plain: BondDetails = { ...INFLATION_BOND, isInflationLinked: false };
    const resolved = resolveCoupon(FIRST_COUPON, plain, 1000);
    expect(resolved.perShare).toBeCloseTo(7.5, 8); // (1.5/100/2)*1000
    expect(resolved.isProvisional).toBe(false);
    expect(resolved.inflationPeriodRate).toBeNull();
  });

  it('is provisional at the fixed floor when the inflation rate is not yet announced', () => {
    const resolved = resolveCoupon(FIRST_COUPON, INFLATION_BOND, 1000);
    expect(resolved.perShare).toBeCloseTo(7.5, 8); // only the fixed part
    expect(resolved.isProvisional).toBe(true);
    expect(resolved.inflationPeriodRate).toBeNull();
    expect(resolved.fixedAnnualRate).toBe(1.5);
  });

  it('adds the announced FOI inflation to the fixed part (official 205€ example)', () => {
    // fixed 1.50% annual + FOI 1.30% semester on nominal 1000:
    // (1.5/100/2)*1000 + (1.3/100)*1000 = 7.5 + 13 = 20.5 per unit → 205€ on 10 units.
    const withRate: BondDetails = {
      ...INFLATION_BOND,
      announcedInflationRates: [{ couponDate: FIRST_COUPON, periodRate: 1.3 }],
    };
    const resolved = resolveCoupon(FIRST_COUPON, withRate, 1000);
    expect(resolved.perShare).toBeCloseTo(20.5, 6);
    expect(resolved.perShare * 10).toBeCloseTo(205, 4);
    expect(resolved.isProvisional).toBe(false);
    expect(resolved.inflationPeriodRate).toBe(1.3);
  });

  it('floors a negative (deflation) announced rate to 0 — fixed stays guaranteed', () => {
    const withDeflation: BondDetails = {
      ...INFLATION_BOND,
      announcedInflationRates: [{ couponDate: FIRST_COUPON, periodRate: -0.5 }],
    };
    const resolved = resolveCoupon(FIRST_COUPON, withDeflation, 1000);
    expect(resolved.perShare).toBeCloseTo(7.5, 8); // only the fixed part
    expect(resolved.inflationPeriodRate).toBe(0);   // known (not provisional), but floored
    expect(resolved.isProvisional).toBe(false);
  });
});

describe('buildCouponNote', () => {
  it('keeps the annual-rate phrasing for a plain bond', () => {
    const plain: BondDetails = { ...INFLATION_BOND, isInflationLinked: false, couponRate: 2.8 };
    const note = buildCouponNote(resolveCoupon(FIRST_COUPON, plain, 1000), 'semiannual');
    expect(note).toBe('Cedola semestrale — tasso annuo 2,8%');
  });

  it('labels a provisional coupon with the fixed-only floor', () => {
    const note = buildCouponNote(resolveCoupon(FIRST_COUPON, INFLATION_BOND, 1000), 'semiannual');
    expect(note).toContain('Cedola provvisoria semestrale');
    expect(note).toContain('solo tasso fisso 0,75%');
    expect(note).toContain('in attesa');
  });

  it('shows the fixed + inflation split for a finalized coupon', () => {
    const withRate: BondDetails = {
      ...INFLATION_BOND,
      announcedInflationRates: [{ couponDate: FIRST_COUPON, periodRate: 1.3 }],
    };
    const note = buildCouponNote(resolveCoupon(FIRST_COUPON, withRate, 1000), 'semiannual');
    expect(note).toBe('Cedola semestrale — fisso 0,75% + inflazione FOI 1,3% = 2,05% del nominale');
  });
});
