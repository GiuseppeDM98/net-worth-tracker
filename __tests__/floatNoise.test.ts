import { describe, expect, it } from 'vitest';
import { stripFloatNoise } from '@/lib/utils/floatNoise';
import { calculateCouponPerShare } from '@/lib/utils/couponUtils';

describe('stripFloatNoise', () => {
  it('should drop the binary residue of a coupon computed as rate / 100 / periods × nominal', () => {
    // The owner's BTP Valore: 1,3% semiannual on a 1.000 € lot. The anchor: the raw product IS noisy.
    expect((1.3 / 100 / 2) * 1000).toBe(6.500000000000001);
    expect(stripFloatNoise((1.3 / 100 / 2) * 1000)).toBe(6.5);
  });

  it('should keep every meaningful decimal of an indexed coupon per 1 € of nominal', () => {
    expect(stripFloatNoise(0.0065 * 1.12345)).toBe(0.007302425);
    expect(stripFloatNoise(0.8125)).toBe(0.8125);
  });

  it('should leave zero, negatives and non-finite values alone', () => {
    expect(stripFloatNoise(0)).toBe(0);
    expect(stripFloatNoise(-0.1 - 0.2)).toBe(-0.3);
    expect(stripFloatNoise(Number.NaN)).toBeNaN();
    expect(stripFloatNoise(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('calculateCouponPerShare', () => {
  it('should store the decimal coupon, not its binary neighbour (2026-10-07)', () => {
    expect(calculateCouponPerShare(1.3, 1000, 'semiannual')).toBe(6.5);
  });
});
