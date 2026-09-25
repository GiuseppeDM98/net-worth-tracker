/**
 * Tests for lib/utils/cents.ts — the one rounding applied where an amount becomes a balance
 * movement or a cashflow row.
 */

import { describe, expect, it } from 'vitest';

import { roundToCents } from '@/lib/utils/cents';

describe('roundToCents', () => {
  it('should round to two decimals', () => {
    expect(roundToCents(12.3456)).toBe(12.35);
    expect(roundToCents(12.344)).toBe(12.34);
    expect(roundToCents(1197)).toBe(1197);
  });

  it('should round a half cent up even when binary noise puts it just below the half', () => {
    // 1.005 × 100 is 100.49999999999999: a bare Math.round gives 1.00.
    expect(roundToCents(1.005)).toBe(1.01);
    expect(roundToCents(8.325)).toBe(8.33);
  });

  it('should be symmetric in sign, so a reversal cancels its application exactly', () => {
    expect(roundToCents(-1.005)).toBe(-1.01);
    expect(roundToCents(-12.3456) + roundToCents(12.3456)).toBe(0);
  });

  it('should never return a negative zero', () => {
    expect(Object.is(roundToCents(-0.001), 0)).toBe(true);
  });

  it('should leave a non-finite input alone instead of inventing a number', () => {
    expect(roundToCents(NaN)).toBeNaN();
    expect(roundToCents(Infinity)).toBe(Infinity);
  });
});
