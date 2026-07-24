/**
 * Tests for the leverage-aware allocation math in lib/services/assetAllocationService.ts
 * (spec docs/specs/3-leveraged-etf-allocation/02-exposure-and-planning-engine.md §2):
 * `compareAllocations` / `toLegacyAllocationResult` / `deriveTargetLeverageRatio`.
 *
 * Focus (per spec 02 §5): current% is on the MARKET base (not the notional total), a target set
 * summing to 150 encodes leverage 1.5, an `excluded` asset leaves numerator AND denominator, a
 * `frozen` asset stays in the denominator but its on-target delta generates no trade, and the
 * unleveraged case is byte-identical to before (invariant #1). Also: `applyRebalanceBand` must
 * preserve the leverage metadata.
 *
 * assetAllocationService pulls in the client Firebase SDK at module load — mock it out (same
 * convention as __tests__/assetExposure.test.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset, AssetAllocationTarget } from '@/types/assets';

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

import { compareAllocations, deriveTargetLeverageRatio } from '@/lib/services/assetAllocationService';
import { applyRebalanceBand } from '@/lib/utils/allocationUtils';

let assetSeq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  assetSeq += 1;
  return {
    id: `a${assetSeq}`,
    userId: 'u1',
    ticker: 'VWCE',
    name: 'Asset',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1000, // market = quantity × currentPrice (EUR)
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const targets = (percentages: Record<string, number>): AssetAllocationTarget => {
  const out: AssetAllocationTarget = {};
  for (const [assetClass, targetPercentage] of Object.entries(percentages)) {
    out[assetClass] = { targetPercentage };
  }
  return out;
};

describe('compareAllocations — unleveraged (invariant #1)', () => {
  it('reduces to plain market weights when nothing is leveraged', () => {
    const assets = [
      makeAsset({ assetClass: 'equity', quantity: 60, currentPrice: 1000 }), // 60k
      makeAsset({ assetClass: 'bonds', quantity: 40, currentPrice: 1000 }),  // 40k
    ];
    const result = compareAllocations(assets, targets({ equity: 60, bonds: 40 }));

    expect(result.marketValue).toBe(100000);
    expect(result.notionalValue).toBe(100000);
    expect(result.totalValue).toBe(100000);
    expect(result.leverageRatio).toBe(1);
    expect(result.hasLeveragedExposure).toBe(false);

    expect(result.byAssetClass.equity.currentPercentage).toBeCloseTo(60, 6);
    expect(result.byAssetClass.bonds.currentPercentage).toBeCloseTo(40, 6);
    expect(result.byAssetClass.equity.action).toBe('OK');
    expect(result.byAssetClass.bonds.action).toBe('OK');
  });
});

describe('compareAllocations — leverage (current% on the MARKET base)', () => {
  it('sums current% to leverage × 100, not to 100', () => {
    const assets = [
      makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000 }), // market 1000, notional 1000
      makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000, leverageRatio: 3 }), // market 1000, notional 3000
    ];
    // marketBase = 2000, notional equity = 4000 → leverage 2.
    const result = compareAllocations(assets, targets({ equity: 100 }));

    expect(result.marketValue).toBe(2000);
    expect(result.notionalValue).toBe(4000);
    expect(result.leverageRatio).toBe(2);
    expect(result.hasLeveragedExposure).toBe(true);

    // On the MARKET base: 4000 / 2000 × 100 = 200 (it would be 100 on the notional-total base).
    expect(result.byAssetClass.equity.currentPercentage).toBeCloseTo(200, 6);
    expect(result.byAssetClass.equity.currentValue).toBe(4000); // notional exposure
    expect(result.byAssetClass.equity.targetValue).toBe(2000);  // 100% × marketBase
    expect(result.byAssetClass.equity.differenceValue).toBe(2000); // 2000 notional € over target
  });
});

describe('deriveTargetLeverageRatio', () => {
  it('sums the target percentages / 100 (150 → 1.5)', () => {
    expect(deriveTargetLeverageRatio(targets({ equity: 90, bonds: 60 }))).toBeCloseTo(1.5, 6);
  });
  it('returns 1 for an unleveraged (sum 100) set and for an empty/absent set', () => {
    expect(deriveTargetLeverageRatio(targets({ equity: 60, bonds: 40 }))).toBe(1);
    expect(deriveTargetLeverageRatio(targets({}))).toBe(1);
    expect(deriveTargetLeverageRatio(null)).toBe(1);
  });
});

describe('compareAllocations — allocationRole partitioning', () => {
  it('drops an excluded asset from BOTH numerator and denominator', () => {
    const assets = [
      makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000 }), // 1000, tradable
      makeAsset({ assetClass: 'realestate', quantity: 1, currentPrice: 1000, allocationRole: 'excluded' }), // 1000, out
    ];
    const result = compareAllocations(assets, targets({ equity: 100 }));

    // If the excluded house counted, marketBase would be 2000 and equity% would be 50.
    expect(result.marketValue).toBe(1000);
    expect(result.byAssetClass.equity.currentPercentage).toBeCloseTo(100, 6);
    expect(result.byAssetClass.realestate).toBeUndefined();
  });

  it('keeps a frozen asset in the denominator but generates no trade for its on-target delta', () => {
    const assets = [
      makeAsset({ assetClass: 'equity', quantity: 600, currentPrice: 1000 }), // 600k tradable
      makeAsset({ assetClass: 'bonds', quantity: 400, currentPrice: 1000, allocationRole: 'frozen' }), // 400k frozen
    ];
    const result = compareAllocations(assets, targets({ equity: 60, bonds: 40 }));

    expect(result.marketValue).toBe(1000000);
    // Frozen bonds count in the denominator: equity is 600k/1000k = 60% (not 600k/600k = 100%).
    expect(result.byAssetClass.equity.currentPercentage).toBeCloseTo(60, 6);
    expect(result.byAssetClass.bonds.currentPercentage).toBeCloseTo(40, 6);
    // Both on target → no trade signalled.
    expect(result.byAssetClass.equity.action).toBe('OK');
    expect(result.byAssetClass.bonds.action).toBe('OK');
  });
});

describe('applyRebalanceBand preserves leverage metadata', () => {
  it('keeps marketValue / notionalValue / leverageRatio / hasLeveragedExposure after re-banding', () => {
    const assets = [
      makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000, leverageRatio: 2 }), // notional 2000
      makeAsset({ assetClass: 'bonds', quantity: 1, currentPrice: 1000 }), // notional 1000
    ];
    const result = compareAllocations(assets, targets({ equity: 100, bonds: 50 }));
    const banded = applyRebalanceBand(result, { type: 'fixed', pp: 5 });

    expect(banded.marketValue).toBe(result.marketValue);
    expect(banded.notionalValue).toBe(result.notionalValue);
    expect(banded.leverageRatio).toBe(result.leverageRatio);
    expect(banded.hasLeveragedExposure).toBe(result.hasLeveragedExposure);
    expect(banded.hasLeveragedExposure).toBe(true);
  });
});
