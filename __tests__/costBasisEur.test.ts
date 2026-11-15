/**
 * costBasisEur — which euro figure stands against which (lib/utils/costBasisEur.ts).
 *
 * The rule every G/P, yield on cost and PMC cell shares since 2026-09-07: the EUR PMC when the
 * ledger has projected it (fee-free since 2026-11-12), the native PMC only for a EUR-native asset,
 * NOTHING for a foreign asset without a EUR PMC — never dollars against euros. Every tax estimate
 * reads the fiscal cost instead (`fiscalCostPerUnitEur`, purchase fees included).
 */
import { describe, it, expect } from 'vitest';
import { costBasisPerUnitEur, fiscalCostPerUnitEur, isEurNative, unitPriceEur } from '@/lib/utils/costBasisEur';

describe('isEurNative', () => {
  it('reads EUR in any case, and a missing currency as EUR', () => {
    expect(isEurNative({ currency: 'EUR' })).toBe(true);
    expect(isEurNative({ currency: 'eur' })).toBe(true);
    expect(isEurNative({})).toBe(true);
    expect(isEurNative({ currency: 'USD' })).toBe(false);
    expect(isEurNative({ currency: 'GBp' })).toBe(false);
  });
});

describe('costBasisPerUnitEur', () => {
  it('prefers the EUR PMC over the native one on a EUR asset too', () => {
    // A stored EUR PMC wins even where it differs from the native one (a document the one-shot
    // re-projection has not reached yet still carries the fees in it).
    expect(costBasisPerUnitEur({ currency: 'EUR', averageCost: 100, averageCostEur: 101 })).toBe(101);
  });

  it('stands the native PMC in for a EUR asset the backfill has not reached', () => {
    expect(costBasisPerUnitEur({ currency: 'EUR', averageCost: 100 })).toBe(100);
    expect(costBasisPerUnitEur({ averageCost: 100 })).toBe(100); // pre-2024 document without currency
  });

  it('has NO basis for a foreign asset without a EUR PMC — the native one would be a currency mix', () => {
    expect(costBasisPerUnitEur({ currency: 'USD', averageCost: 100 })).toBeUndefined();
    expect(costBasisPerUnitEur({ currency: 'USD', averageCost: 100, averageCostEur: 90 })).toBe(90);
  });

  it('treats a zero or missing PMC as no basis', () => {
    expect(costBasisPerUnitEur({ currency: 'EUR', averageCost: 0 })).toBeUndefined();
    expect(costBasisPerUnitEur({ currency: 'EUR' })).toBeUndefined();
    expect(costBasisPerUnitEur({ currency: 'EUR', averageCost: 100, averageCostEur: 0 })).toBe(100);
  });
});

describe('fiscalCostPerUnitEur', () => {
  it('prefers the fiscal cost, purchase fees included, over the fee-free PMC', () => {
    // 10 units at 100 € with 10 € of fees: PMC 100, fiscal cost 101.
    expect(fiscalCostPerUnitEur({ currency: 'EUR', averageCost: 100, averageCostEur: 100, fiscalAverageCostEur: 101 })).toBe(101);
  });

  it('falls back to the PMC until the re-projection reaches the asset, and has no basis where the PMC has none', () => {
    expect(fiscalCostPerUnitEur({ currency: 'EUR', averageCost: 100, averageCostEur: 101 })).toBe(101);
    expect(fiscalCostPerUnitEur({ currency: 'EUR', averageCost: 100, averageCostEur: 100, fiscalAverageCostEur: 0 })).toBe(100);
    expect(fiscalCostPerUnitEur({ currency: 'USD', averageCost: 100 })).toBeUndefined();
  });
});

describe('unitPriceEur', () => {
  it('is the stored EUR price for a foreign asset, the native price for a EUR one', () => {
    expect(unitPriceEur({ currency: 'USD', currentPrice: 145, currentPriceEur: 130 })).toBe(130);
    expect(unitPriceEur({ currency: 'EUR', currentPrice: 120, currentPriceEur: 999 })).toBe(120);
    expect(unitPriceEur({ currentPrice: 120 })).toBe(120);
  });

  it('falls back to the native price for a foreign asset never refreshed, with the pence guard', () => {
    expect(unitPriceEur({ currency: 'USD', currentPrice: 145 })).toBe(145);
    expect(unitPriceEur({ currency: 'GBp', currentPrice: 1250 })).toBe(12.5);
  });
});
