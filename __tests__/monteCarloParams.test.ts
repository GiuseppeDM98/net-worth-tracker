import { describe, it, expect } from 'vitest';

import { deriveMonteCarloAllocation } from '@/lib/utils/monteCarloParams';

/**
 * The util is an EXTRACTION of the normalization that lived inline in MonteCarloTab.tsx —
 * these tests pin the exact behaviour so the two call sites (MonteCarloTab and the FIRE
 * Ventaglio view) can never diverge from what the MC tab always did:
 *   - only equity/bonds/realestate/commodity enter the 4 MC classes (crypto/cash excluded);
 *   - percentages are rounded per class, sorted descending, and the rounding residual goes
 *     to the SMALLEST class so the total is exactly 100;
 *   - a portfolio with none of the 4 classes yields null ("leave the previous allocation").
 */
describe('deriveMonteCarloAllocation', () => {
  it('normalizes a two-class portfolio to percentages summing to 100', () => {
    const result = deriveMonteCarloAllocation({ equity: 60_000, bonds: 40_000 });

    expect(result).toEqual({
      equityPercentage: 60,
      bondsPercentage: 40,
      realEstatePercentage: 0,
      commoditiesPercentage: 0,
    });
  });

  it('maps all four MC classes and ignores crypto and cash', () => {
    const result = deriveMonteCarloAllocation({
      equity: 70_000,
      bonds: 20_000,
      realestate: 5_000,
      commodity: 5_000,
      crypto: 50_000,
      cash: 10_000,
    });

    expect(result).toEqual({
      equityPercentage: 70,
      bondsPercentage: 20,
      realEstatePercentage: 5,
      commoditiesPercentage: 5,
    });
  });

  it('always sums to exactly 100: the rounding residual lands on the smallest class', () => {
    // Raw shares 33.5 / 33.5 / 22 / 11 round to 34+34+22 = 90, so the smallest class
    // closes at 10 instead of its rounded 11 — the total stays exactly 100.
    const result = deriveMonteCarloAllocation({
      equity: 335,
      bonds: 335,
      commodity: 220,
      realestate: 110,
    });

    expect(result).toEqual({
      equityPercentage: 34,
      bondsPercentage: 34,
      realEstatePercentage: 10,
      commoditiesPercentage: 22,
    });
  });

  it('sums to 100 even when the residual falls on a zero-value class (inherited behaviour)', () => {
    // Three equal classes round to 33+33+33; the absent 4th class absorbs the missing 1%.
    // This is exactly what the inline MonteCarloTab code did — documented, not endorsed.
    const result = deriveMonteCarloAllocation({ equity: 1, bonds: 1, realestate: 1 });

    expect(result).toEqual({
      equityPercentage: 33,
      bondsPercentage: 33,
      realEstatePercentage: 33,
      commoditiesPercentage: 1,
    });
  });

  it('returns null when none of the 4 MC classes hold value (crypto/cash-only portfolio)', () => {
    expect(deriveMonteCarloAllocation({ crypto: 50_000, cash: 8_000 })).toBeNull();
    expect(deriveMonteCarloAllocation({})).toBeNull();
  });
});
