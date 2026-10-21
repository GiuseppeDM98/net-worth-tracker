/**
 * Tests for lib/utils/propertyTransfer.ts — a transfer that starts or lands on a property, and the
 * one refusal it carries: a property never gives more than it is worth (owner, 2026-10-21).
 */

import { describe, expect, it } from 'vitest';

import { exceedsPropertyValue, isTransferableProperty, propertyValueAvailable } from '@/lib/utils/propertyTransfer';
import { balanceEffectsOf, type SettlementRow } from '@/lib/utils/cashSettlement';

const HOUSE = { id: 'house', quantity: 200000 };
const sale = (amount: number, extra: Partial<SettlementRow> = {}): SettlementRow => ({ type: 'transfer', amount, linkedCashAssetId: 'house', transferCashAssetId: 'account', ...extra });

describe('isTransferableProperty', () => {
  it('should take a property valued in quantity at price 1', () => {
    expect(isTransferableProperty({ type: 'realestate', assetClass: 'realestate', currentPrice: 1 })).toBe(true);
  });

  it('should refuse a property priced otherwise, and any other asset at price 1', () => {
    expect(isTransferableProperty({ type: 'realestate', assetClass: 'realestate', currentPrice: 250000 })).toBe(false);
    expect(isTransferableProperty({ type: 'cash', assetClass: 'cash', currentPrice: 1 })).toBe(false);
    expect(isTransferableProperty({ type: 'pensionFund', assetClass: 'realestate', currentPrice: 1 })).toBe(false);
  });
});

describe('a transfer out of a property', () => {
  it('should lower the property and raise the account by the same amount', () => {
    expect(balanceEffectsOf(sale(50000))).toEqual([
      { assetId: 'house', delta: -50000 },
      { assetId: 'account', delta: 50000 },
    ]);
  });
});

describe('propertyValueAvailable', () => {
  it('should be the value today for a new row', () => {
    expect(propertyValueAvailable(HOUSE, null)).toBe(200000);
  });

  it('should give back what the edited row already took from the property', () => {
    // The house reads 150.000 after a 50.000 sale applied: editing that sale may take up to 200.000.
    expect(propertyValueAvailable({ id: 'house', quantity: 150000 }, sale(50000))).toBe(200000);
  });

  it('should give back nothing for an edited row still in calendar', () => {
    expect(propertyValueAvailable(HOUSE, sale(50000, { balancePending: true }))).toBe(200000);
  });

  it('should take away what the edited row had put INTO the property', () => {
    // A 20.000 deposit landed on the house (230.000 now): re-pointed as a sale, only 210.000 is the house's own.
    const deposit: SettlementRow = { type: 'transfer', amount: 20000, linkedCashAssetId: 'account', transferCashAssetId: 'house' };
    expect(propertyValueAvailable({ id: 'house', quantity: 230000 }, deposit)).toBe(210000);
  });

  it('should ignore an edited row on another asset', () => {
    expect(propertyValueAvailable(HOUSE, { type: 'fixed', amount: -100, linkedCashAssetId: 'account' })).toBe(200000);
  });
});

describe('exceedsPropertyValue', () => {
  it('should refuse a sale above the value and accept one equal to it', () => {
    expect(exceedsPropertyValue(200000.01, 200000)).toBe(true);
    expect(exceedsPropertyValue(200000, 200000)).toBe(false);
    expect(exceedsPropertyValue(150000, 200000)).toBe(false);
  });

  it('should not refuse on float noise under a cent', () => {
    expect(exceedsPropertyValue(0.1 + 0.2, 0.3)).toBe(false);
  });
});
