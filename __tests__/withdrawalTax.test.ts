/**
 * Tests for lib/utils/withdrawalTax.ts — the one rule of the tax on withdrawals the FIRE
 * engines share: the gain share, the gross-up, the sale that consumes the basis in proportion,
 * and the portfolio's profile (cash and pension funds as basis, uncovered instruments declared).
 */

import { describe, expect, it } from 'vitest';
import type { Asset } from '@/types/assets';
import { DEFAULT_CAPITAL_GAINS_RATE, resolveGainShare, resolvePortfolioTaxProfile, resolveTaxMultiplier, withdrawGross } from '@/lib/utils/withdrawalTax';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    userId: 'u1',
    ticker: 'AST',
    name: 'Asset',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 10,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const valueOf = (asset: Asset) => asset.quantity * asset.currentPrice;

describe('resolveGainShare and resolveTaxMultiplier', () => {
  it('reads the unrealised gain as a share of the capital, floored at a loss', () => {
    expect(resolveGainShare(1000, 600)).toBeCloseTo(0.4);
    expect(resolveGainShare(1000, 1200)).toBe(0);
    expect(resolveGainShare(0, 100)).toBe(0);
  });

  it('grosses a net euro up by the tax on its gain share', () => {
    // 40% gain at 26%: every euro withdrawn carries 10,4 cents of tax → 1 / 0,896.
    expect(resolveTaxMultiplier(0.4, 26)).toBeCloseTo(1 / 0.896);
    expect(resolveTaxMultiplier(0, 26)).toBe(1);
    expect(resolveTaxMultiplier(0.4, 0)).toBe(1);
  });
});

describe('withdrawGross', () => {
  it('sells more than the net, pays the difference as tax, and consumes the basis in proportion', () => {
    const sale = withdrawGross(100_000, 60_000, 10_000, 26);
    expect(sale.gross).toBeCloseTo(10_000 / 0.896);
    expect(sale.tax).toBeCloseTo(sale.gross - 10_000);
    // The sold share of the capital takes the same share of the basis: the gain share is unchanged.
    expect(sale.basisAfter).toBeCloseTo(60_000 * (1 - sale.gross / 100_000));
    expect(resolveGainShare(100_000 - sale.gross, sale.basisAfter)).toBeCloseTo(0.4);
  });

  it('is a plain withdrawal without a gain, and nothing at all for a zero need', () => {
    expect(withdrawGross(100_000, 100_000, 10_000, 26)).toEqual({ gross: 10_000, tax: 0, basisAfter: 90_000 });
    expect(withdrawGross(100_000, 60_000, 0, 26)).toEqual({ gross: 0, tax: 0, basisAfter: 60_000 });
  });
});

describe('resolvePortfolioTaxProfile', () => {
  it('sums the basis, weights the rate on the positive gains, and counts cash as basis', () => {
    const profile = resolvePortfolioTaxProfile(
      [
        makeAsset({ id: 'etf', quantity: 10, currentPrice: 100, averageCost: 60, taxRate: 26 }), // 1000, gain 400
        makeAsset({ id: 'btp', type: 'bond', assetClass: 'bonds', quantity: 10, currentPrice: 100, averageCost: 90, taxRate: 12.5 }), // 1000, gain 100
        makeAsset({ id: 'cash', type: 'cash', assetClass: 'cash', quantity: 500, currentPrice: 1 }), // 500, basis
      ],
      valueOf,
    );
    expect(profile).not.toBeNull();
    expect(profile?.basisToday).toBe(600 + 900 + 500);
    expect(profile?.coveredValue).toBe(2500);
    expect(profile?.uncoveredValue).toBe(0);
    // (400 × 26 + 100 × 12,5) / 500 = 23,3.
    expect(profile?.rate).toBeCloseTo(23.3);
    expect(profile?.gainShare).toBeCloseTo(500 / 2500);
  });

  it('treats an instrument with no EUR cost basis as basis and declares it', () => {
    const profile = resolvePortfolioTaxProfile(
      [
        makeAsset({ id: 'etf', quantity: 10, currentPrice: 100, averageCost: 50 }),
        makeAsset({ id: 'usd', quantity: 10, currentPrice: 100, currency: 'USD', averageCost: 50 }), // no averageCostEur: uncovered
      ],
      valueOf,
    );
    expect(profile?.uncoveredCount).toBe(1);
    expect(profile?.uncoveredValue).toBe(1000);
    expect(profile?.basisToday).toBe(500 + 1000);
    // No rate on the one gaining instrument: the default.
    expect(profile?.rate).toBe(DEFAULT_CAPITAL_GAINS_RATE);
  });

  it('is null when no instrument carries a basis, and skips closed positions', () => {
    expect(resolvePortfolioTaxProfile([makeAsset({ id: 'usd', currency: 'USD', averageCost: 50 })], valueOf)).toBeNull();
    expect(resolvePortfolioTaxProfile([makeAsset({ id: 'cash', type: 'cash', assetClass: 'cash', quantity: 500, currentPrice: 1 })], valueOf)).toBeNull();
    const profile = resolvePortfolioTaxProfile([makeAsset({ id: 'sold', quantity: 0, averageCost: 50 }), makeAsset({ id: 'held', averageCost: 50 })], valueOf);
    expect(profile?.coveredValue).toBe(1000);
  });
});
