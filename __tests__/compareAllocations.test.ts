/**
 * Tests for the leverage-aware allocation math in lib/services/assetAllocationService.ts:
 * `compareAllocations` / `toLegacyAllocationResult` / `deriveTargetLeverageRatio`.
 *
 * Focus: current% is on the MARKET base (not the notional total), a target set
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

describe('compareAllocations — fixed-amount cash target', () => {
  // Settings keep a stale `targetPercentage` on cash beside `useFixedAmount`; the percentages of
  // the other classes sum to 100 «excl. cash» and apply to the market base net of the reserve.
  const fixedCashTargets = (): AssetAllocationTarget => {
    const t = targets({ equity: 70, bonds: 30, cash: 5 });
    t.cash = { targetPercentage: 5, useFixedAmount: true, fixedAmount: 25000 };
    return t;
  };
  const assets = () => [
    makeAsset({ assetClass: 'equity', quantity: 150, currentPrice: 1000 }), // 150k
    makeAsset({ assetClass: 'bonds', quantity: 40, currentPrice: 1000 }), // 40k
    makeAsset({ assetClass: 'cash', type: 'cash', quantity: 10000, currentPrice: 1 }), // 10k
  ];

  it('expresses every target on the MARKET base, so the drifts sum to zero like the currents do', () => {
    // market 200k; the reserve is 25k, so 70/30 apply to 175k: equity 122.5k = 61,25% of 200k.
    const result = compareAllocations(assets(), fixedCashTargets());
    expect(result.byAssetClass.cash.targetPercentage).toBeCloseTo(12.5, 6);
    expect(result.byAssetClass.cash.targetValue).toBe(25000);
    expect(result.byAssetClass.equity.targetValue).toBeCloseTo(122500, 6);
    expect(result.byAssetClass.equity.targetPercentage).toBeCloseTo(61.25, 6);
    expect(result.byAssetClass.bonds.targetPercentage).toBeCloseTo(26.25, 6);
    const targetSum = Object.values(result.byAssetClass).reduce((sum, d) => sum + d.targetPercentage, 0);
    expect(targetSum).toBeCloseTo(100, 6);
    const driftSum = Object.values(result.byAssetClass).reduce((sum, d) => sum + d.difference, 0);
    expect(driftSum).toBeCloseTo(0, 6);
    expect(result.byAssetClass.equity.difference).toBeCloseTo(75 - 61.25, 6);
  });

  it('is not a leverage target: the stale cash percentage never enters the ratio', () => {
    expect(deriveTargetLeverageRatio(fixedCashTargets())).toBe(1);
  });
});

describe('compareAllocations — the residual sleeve of an unclassified holding', () => {
  // The subcategory is optional in AssetDialog. Before that, a class with sub-targets could not
  // contain an unclassified holding at all; now it can, and the euros must stay visible.
  const withSubTargets = (): AssetAllocationTarget => ({
    equity: {
      targetPercentage: 100,
      subTargets: { World: 70, Emergenti: 30 },
    },
  });

  const holdings = () => [
    makeAsset({ assetClass: 'equity', subCategory: 'World', quantity: 70, currentPrice: 1000 }),
    makeAsset({ assetClass: 'equity', subCategory: 'Emergenti', quantity: 30, currentPrice: 1000 }),
    makeAsset({ assetClass: 'equity', quantity: 20, currentPrice: 1000 }),
  ];

  it('states the unclassified euros as their own untargeted row', () => {
    const result = compareAllocations(holdings(), withSubTargets());
    const residual = result.bySubCategory['equity:Senza sottocategoria'];
    expect(residual).toBeDefined();
    expect(residual.currentValue).toBe(20000);
    // 20k of a 120k class.
    expect(residual.currentPercentage).toBeCloseTo(16.666, 2);
    // No target means no verdict: the answer to «troppo o troppo poco?» is «classificalo».
    expect(residual.targetPercentage).toBe(0);
    expect(residual.differenceValue).toBe(0);
    expect(residual.action).toBe('OK');
  });

  it('leaves the targeted sleeves measured against the whole class, and the shares reaching 100%', () => {
    const result = compareAllocations(holdings(), withSubTargets());
    // 70k of 120k — genuinely under a 70% target, because 20k of the class is unclassified.
    expect(result.bySubCategory['equity:World'].currentPercentage).toBeCloseTo(58.333, 2);
    expect(result.bySubCategory['equity:Emergenti'].currentPercentage).toBeCloseTo(25, 2);
    const shares = Object.values(result.bySubCategory).reduce((sum, d) => sum + d.currentPercentage, 0);
    expect(shares).toBeCloseTo(100, 6);
  });

  it('emits no residual row when every holding of the class carries a sub-category', () => {
    const classified = [
      makeAsset({ assetClass: 'equity', subCategory: 'World', quantity: 70, currentPrice: 1000 }),
      makeAsset({ assetClass: 'equity', subCategory: 'Emergenti', quantity: 30, currentPrice: 1000 }),
    ];
    const result = compareAllocations(classified, withSubTargets());
    expect(result.bySubCategory['equity:Senza sottocategoria']).toBeUndefined();
  });
});
