/**
 * Tests for the pure helpers in lib/utils/assetExposureUtils.ts.
 *
 * Covers `expandAssetExposure` (single-class leveraged ETF, composite with per-leg leverage,
 * a plain unleveraged asset, and the pensionFund look-through/fallback cases — see
 * docs/specs/3-leveraged-etf-allocation/02-exposure-and-planning-engine.md §1) and
 * `calculatePortfolioLeverage` (portfolio-wide aggregation).
 *
 * assetExposureUtils imports `calculateAssetValue` from assetService, which pulls in the
 * client Firebase SDK at module load time — mock it out so the suite doesn't need real
 * Firebase env vars (same convention as __tests__/dashboardOverviewUtils.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset } from '@/types/assets';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import { expandAssetExposure, calculatePortfolioLeverage } from '@/lib/utils/assetExposureUtils';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    userId: 'u1',
    ticker: 'VWCE',
    name: 'Vanguard All-World',
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

describe('expandAssetExposure', () => {
  it('normal (unleveraged) asset: notional equals market', () => {
    const asset = makeAsset({ quantity: 10, currentPrice: 100 }); // market = 1000
    const result = expandAssetExposure(asset);

    expect(result).toEqual([
      { assetClass: 'equity', subCategory: undefined, marketValue: 1000, notionalValue: 1000 },
    ]);
  });

  it('single-class leveraged ETF: notional = market × leverage', () => {
    const asset = makeAsset({ quantity: 10, currentPrice: 100, leverageRatio: 3 }); // market = 1000
    const result = expandAssetExposure(asset);

    expect(result).toEqual([
      { assetClass: 'equity', subCategory: undefined, marketValue: 1000, notionalValue: 3000 },
    ]);
  });

  it('leverageRatio of 1 behaves like no leverage', () => {
    const asset = makeAsset({ quantity: 10, currentPrice: 100, leverageRatio: 1 });
    const result = expandAssetExposure(asset);

    expect(result[0].notionalValue).toBe(result[0].marketValue);
  });

  it('composite asset: leverage applies per-leg, market split by percentage', () => {
    const asset = makeAsset({
      quantity: 1,
      currentPrice: 1000, // market = 1000
      leverageRatio: 2,
      composition: [
        { assetClass: 'equity', percentage: 70 },
        { assetClass: 'bonds', percentage: 30 },
      ],
    });
    const result = expandAssetExposure(asset);

    expect(result).toEqual([
      { assetClass: 'equity', subCategory: undefined, marketValue: 700, notionalValue: 1400 },
      { assetClass: 'bonds', subCategory: undefined, marketValue: 300, notionalValue: 600 },
    ]);
  });

  it('composite asset without leverageRatio: notional equals market per-leg', () => {
    const asset = makeAsset({
      quantity: 1,
      currentPrice: 1000,
      composition: [
        { assetClass: 'equity', percentage: 60 },
        { assetClass: 'bonds', percentage: 40 },
      ],
    });
    const result = expandAssetExposure(asset);

    expect(result).toEqual([
      { assetClass: 'equity', subCategory: undefined, marketValue: 600, notionalValue: 600 },
      { assetClass: 'bonds', subCategory: undefined, marketValue: 400, notionalValue: 400 },
    ]);
  });

  it('preserves subCategory on both single-class and composite components', () => {
    const singleClass = makeAsset({ subCategory: 'US Large Cap' });
    expect(expandAssetExposure(singleClass)[0].subCategory).toBe('US Large Cap');

    const composite = makeAsset({
      composition: [{ assetClass: 'equity', percentage: 100, subCategory: 'Emerging Markets' }],
    });
    expect(expandAssetExposure(composite)[0].subCategory).toBe('Emerging Markets');
  });

  describe('pensionFund — no special-case (D5)', () => {
    it('with composition: looked through leg-by-leg like any composite asset', () => {
      const fund = makeAsset({
        type: 'pensionFund',
        assetClass: 'equity', // TYPE_TO_CLASS['pensionFund'] fallback, irrelevant once composition is set
        quantity: 1,
        currentPrice: 10000, // market = 10000
        composition: [
          { assetClass: 'equity', percentage: 70 },
          { assetClass: 'bonds', percentage: 30 },
        ],
      });
      const result = expandAssetExposure(fund);

      expect(result).toEqual([
        { assetClass: 'equity', subCategory: undefined, marketValue: 7000, notionalValue: 7000 },
        { assetClass: 'bonds', subCategory: undefined, marketValue: 3000, notionalValue: 3000 },
      ]);
    });

    it('without composition: single-class fallback on its own assetClass', () => {
      const fund = makeAsset({
        type: 'pensionFund',
        assetClass: 'equity', // TYPE_TO_CLASS['pensionFund'] fallback, stamped on the asset at creation
        quantity: 1,
        currentPrice: 10000,
      });
      const result = expandAssetExposure(fund);

      expect(result).toEqual([
        { assetClass: 'equity', subCategory: undefined, marketValue: 10000, notionalValue: 10000 },
      ]);
    });
  });
});

describe('calculatePortfolioLeverage', () => {
  it('returns 1 when total market value is 0', () => {
    expect(calculatePortfolioLeverage([])).toBe(1);
    expect(calculatePortfolioLeverage([makeAsset({ quantity: 0, currentPrice: 0 })])).toBe(1);
  });

  it('returns 1 for a portfolio with no leveraged assets', () => {
    const assets = [
      makeAsset({ id: 'a1', quantity: 10, currentPrice: 100 }),
      makeAsset({ id: 'a2', quantity: 5, currentPrice: 200, assetClass: 'bonds' }),
    ];
    expect(calculatePortfolioLeverage(assets)).toBe(1);
  });

  it('aggregates Σnotional / Σmarket across single-class and composite assets', () => {
    const assets = [
      // market 1000, notional 2000 (2x leveraged)
      makeAsset({ id: 'a1', quantity: 10, currentPrice: 100, leverageRatio: 2 }),
      // market 1000, notional 1000 (unleveraged)
      makeAsset({ id: 'a2', quantity: 10, currentPrice: 100, assetClass: 'bonds' }),
    ];
    // total market = 2000, total notional = 3000 → leverage = 1.5
    expect(calculatePortfolioLeverage(assets)).toBeCloseTo(1.5);
  });
});
