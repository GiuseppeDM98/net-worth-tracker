/**
 * Tests for the pure helpers in lib/utils/allocationUtils.ts.
 *
 * These functions are the testable core of the Allocazione page. The suite covers:
 *
 *   1. deriveAction / bandForTarget / applyRebalanceBand — the tunable rebalance band
 *      (fixed % and the 5/25 rule) that re-classifies COMPRA / VENDI / OK client-side.
 *   2. groupSubCategoriesByAssetClass / filterSpecificAssets — composite-key parsing for
 *      the bySubCategory / bySpecificAsset maps; malformed keys must be ignored.
 *   3. hasSpecificAssetTracking — guards the third drill level across the legacy-number
 *      and SubCategoryTarget formats.
 *   4. ACTION_CHART_NUMBER — theme chart slot per action (chips + action numbers).
 *   5. summarizeBalance / buildRebalancePlan — hero verdict + consolidated trade list.
 *   6. splitTowardTarget / allocateContribution / allocateContributionHierarchical —
 *      the no-sell contribution split (by class, and class → sub-category).
 *
 * No React, no Firebase — allocationUtils imports only types.
 */

import { describe, it, expect } from 'vitest';
import type { AllocationData, AllocationResult, AssetAllocationTarget } from '@/types/assets';
import {
  deriveAction,
  bandForTarget,
  applyRebalanceBand,
  groupSubCategoriesByAssetClass,
  filterSpecificAssets,
  hasSpecificAssetTracking,
  ACTION_CHART_NUMBER,
  computeBalanceScore,
  summarizeBalance,
  buildRebalancePlan,
  allocateContribution,
  splitTowardTarget,
  allocateContributionHierarchical,
  type RebalanceBand,
} from '@/lib/utils/allocationUtils';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAllocationData(overrides: Partial<AllocationData> = {}): AllocationData {
  return {
    currentPercentage: 0,
    currentValue: 0,
    targetPercentage: 0,
    targetValue: 0,
    difference: 0,
    differenceValue: 0,
    action: 'OK',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// deriveAction + bandForTarget + applyRebalanceBand
// ---------------------------------------------------------------------------

describe('deriveAction', () => {
  it('should return OK within the band (inclusive of the edge)', () => {
    expect(deriveAction(0, 2)).toBe('OK');
    expect(deriveAction(2, 2)).toBe('OK');
    expect(deriveAction(-2, 2)).toBe('OK');
  });

  it('should return VENDI when over-allocated beyond the band', () => {
    expect(deriveAction(2.01, 2)).toBe('VENDI');
  });

  it('should return COMPRA when under-allocated beyond the band', () => {
    expect(deriveAction(-2.01, 2)).toBe('COMPRA');
  });
});

describe('bandForTarget', () => {
  it('should return the fixed pp regardless of target for a fixed band', () => {
    const band: RebalanceBand = { type: 'fixed', pp: 3 };
    expect(bandForTarget(band, 60)).toBe(3);
    expect(bandForTarget(band, 5)).toBe(3);
  });

  it('should apply the 5pp absolute arm for large targets under the 5/25 rule', () => {
    // 25% of 60 = 15pp, so the 5pp absolute arm is tighter.
    expect(bandForTarget({ type: 'rule525' }, 60)).toBe(5);
  });

  it('should apply the 25% relative arm for small targets under the 5/25 rule', () => {
    // 25% of 8 = 2pp, tighter than the 5pp absolute arm.
    expect(bandForTarget({ type: 'rule525' }, 8)).toBe(2);
  });
});

describe('applyRebalanceBand', () => {
  const baseResult: AllocationResult = {
    totalValue: 100000,
    byAssetClass: {
      equity: makeAllocationData({ difference: 3, targetPercentage: 60, action: 'OK' }),
      bonds: makeAllocationData({ difference: -3, targetPercentage: 8, action: 'OK' }),
    },
    bySubCategory: {
      'equity:ETF World': makeAllocationData({ difference: 4, targetPercentage: 70, action: 'OK' }),
    },
    bySpecificAsset: {},
  };

  it('should re-classify rows under a tighter fixed band without mutating the input', () => {
    const result = applyRebalanceBand(baseResult, { type: 'fixed', pp: 2 });
    expect(result.byAssetClass.equity.action).toBe('VENDI'); // +3 > 2
    expect(result.byAssetClass.bonds.action).toBe('COMPRA'); // -3 < -2
    expect(result.bySubCategory['equity:ETF World'].action).toBe('VENDI'); // +4 > 2
    // input untouched
    expect(baseResult.byAssetClass.equity.action).toBe('OK');
  });

  it('should classify per-row under the 5/25 rule using each row target', () => {
    const result = applyRebalanceBand(baseResult, { type: 'rule525' });
    // equity: band = min(5, 25%*60=15) = 5 → |3| <= 5 → OK
    expect(result.byAssetClass.equity.action).toBe('OK');
    // bonds: band = min(5, 25%*8=2) = 2 → -3 < -2 → COMPRA
    expect(result.byAssetClass.bonds.action).toBe('COMPRA');
  });
});

// ---------------------------------------------------------------------------
// groupSubCategoriesByAssetClass
// ---------------------------------------------------------------------------

describe('groupSubCategoriesByAssetClass', () => {
  it('should group sub-categories under the correct asset class', () => {
    const input = {
      'equity:ETF World': makeAllocationData({ currentPercentage: 40 }),
      'equity:EM': makeAllocationData(),
      'bonds:BTP': makeAllocationData(),
    };
    const result = groupSubCategoriesByAssetClass(input);
    expect(result['equity']?.['ETF World']?.currentPercentage).toBe(40);
    expect(Object.keys(result['equity']!)).toHaveLength(2);
    expect(result['bonds']?.['BTP']).toBeDefined();
    expect(Object.keys(result)).toHaveLength(2);
  });

  it('should ignore keys with no colon (malformed)', () => {
    expect(groupSubCategoriesByAssetClass({ equity: makeAllocationData() })).toEqual({});
  });

  it('should ignore 3-part keys (those belong to bySpecificAsset)', () => {
    expect(groupSubCategoriesByAssetClass({ 'equity:ETF World:VWCE': makeAllocationData() })).toEqual({});
  });

  it('should return an empty object when input is empty', () => {
    expect(groupSubCategoriesByAssetClass({})).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// filterSpecificAssets
// ---------------------------------------------------------------------------

describe('filterSpecificAssets', () => {
  const bySpecificAsset: Record<string, AllocationData> = {
    'equity:ETF World:VWCE': makeAllocationData({ currentValue: 1000 }),
    'equity:ETF World:XEON': makeAllocationData({ currentValue: 500 }),
    'equity:EM:EIMI': makeAllocationData({ currentValue: 200 }),
    'bonds:BTP:BTP 2030': makeAllocationData({ currentValue: 800 }),
  };

  it('should return the assets matching the asset class + sub-category', () => {
    const result = filterSpecificAssets(bySpecificAsset, 'equity', 'ETF World');
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['VWCE']?.currentValue).toBe(1000);
    expect(result['XEON']?.currentValue).toBe(500);
  });

  it('should exclude assets from other sub-categories and asset classes', () => {
    expect(Object.keys(filterSpecificAssets(bySpecificAsset, 'equity', 'EM'))).toEqual(['EIMI']);
    expect(filterSpecificAssets(bySpecificAsset, 'bonds', 'ETF World')).toEqual({});
  });

  it('should ignore 2-part keys and empty input', () => {
    expect(filterSpecificAssets({ 'equity:ETF World': makeAllocationData() }, 'equity', 'ETF World')).toEqual({});
    expect(filterSpecificAssets({}, 'equity', 'ETF World')).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// hasSpecificAssetTracking
// ---------------------------------------------------------------------------

describe('hasSpecificAssetTracking', () => {
  it('should return false for null targets, missing class, or missing subTargets', () => {
    expect(hasSpecificAssetTracking(null, 'equity', 'ETF World')).toBe(false);
    expect(hasSpecificAssetTracking({ bonds: { targetPercentage: 20 } }, 'equity', 'ETF World')).toBe(false);
    expect(hasSpecificAssetTracking({ equity: { targetPercentage: 60 } }, 'equity', 'ETF World')).toBe(false);
  });

  it('should return false for the legacy number format', () => {
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 60, subTargets: { 'ETF World': 70 } },
    };
    expect(hasSpecificAssetTracking(targets, 'equity', 'ETF World')).toBe(false);
  });

  it('should return false when specificAssetsEnabled is false or absent', () => {
    const off: AssetAllocationTarget = {
      equity: { targetPercentage: 60, subTargets: { 'ETF World': { targetPercentage: 70, specificAssetsEnabled: false } } },
    };
    const absent: AssetAllocationTarget = {
      equity: { targetPercentage: 60, subTargets: { 'ETF World': { targetPercentage: 70 } } },
    };
    expect(hasSpecificAssetTracking(off, 'equity', 'ETF World')).toBe(false);
    expect(hasSpecificAssetTracking(absent, 'equity', 'ETF World')).toBe(false);
  });

  it('should return true when specificAssetsEnabled is true', () => {
    const on: AssetAllocationTarget = {
      equity: { targetPercentage: 60, subTargets: { 'ETF World': { targetPercentage: 70, specificAssetsEnabled: true } } },
    };
    expect(hasSpecificAssetTracking(on, 'equity', 'ETF World')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ACTION_CHART_NUMBER (theme chart-palette mapping)
// ---------------------------------------------------------------------------

describe('ACTION_CHART_NUMBER', () => {
  it('should map each action to a chart slot (default hues: amber/coral/jade)', () => {
    expect(ACTION_CHART_NUMBER.COMPRA).toBe(3);
    expect(ACTION_CHART_NUMBER.VENDI).toBe(5);
    expect(ACTION_CHART_NUMBER.OK).toBe(2);
  });

  it('should give each action a distinct slot so the three states stay separable', () => {
    expect(new Set(Object.values(ACTION_CHART_NUMBER)).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeBalanceScore
// ---------------------------------------------------------------------------

describe('computeBalanceScore', () => {
  it('should score a perfectly on-target portfolio at 100', () => {
    const result = computeBalanceScore({
      equity: makeAllocationData({ difference: 0 }),
      bonds: makeAllocationData({ difference: 0 }),
    });
    expect(result.score).toBe(100);
    expect(result.misallocationPct).toBe(0);
  });

  it('should equal 100 minus half the total absolute drift (misallocation share)', () => {
    // equity +8, bonds -8 → Σ|drift| = 16 → 8% misallocated → score 92.
    const result = computeBalanceScore({
      equity: makeAllocationData({ difference: 8 }),
      bonds: makeAllocationData({ difference: -8 }),
    });
    expect(result.misallocationPct).toBeCloseTo(8, 5);
    expect(result.score).toBe(92);
  });

  it('should be band-independent (ignores action, reads raw difference)', () => {
    // Same drift classified OK should still lower the score.
    const result = computeBalanceScore({
      equity: makeAllocationData({ difference: 6, action: 'OK' }),
      bonds: makeAllocationData({ difference: -6, action: 'OK' }),
    });
    expect(result.score).toBe(94); // Σ|drift| 12 → 6% misallocated
  });

  it('should clamp a wildly off portfolio to a floor of 0', () => {
    // 100% in one class vs a spread target → Σ|drift| can exceed 200.
    const result = computeBalanceScore({
      equity: makeAllocationData({ difference: 200 }),
      bonds: makeAllocationData({ difference: -200 }),
    });
    expect(result.misallocationPct).toBe(100);
    expect(result.score).toBe(0);
  });

  it('should return 100 for an empty portfolio (no drift to penalise)', () => {
    expect(computeBalanceScore({})).toEqual({ score: 100, misallocationPct: 0 });
  });
});

// ---------------------------------------------------------------------------
// summarizeBalance
// ---------------------------------------------------------------------------

describe('summarizeBalance', () => {
  it('should report a balanced portfolio when every class is OK', () => {
    const summary = summarizeBalance({
      equity: makeAllocationData({ action: 'OK', difference: 1 }),
      bonds: makeAllocationData({ action: 'OK', difference: -1 }),
    });
    expect(summary.isBalanced).toBe(true);
    expect(summary.offTargetCount).toBe(0);
    expect(summary.largestGap).toBeNull();
  });

  it('should count off-target classes and surface the largest drift', () => {
    const summary = summarizeBalance({
      equity: makeAllocationData({ action: 'VENDI', difference: 7.4 }),
      bonds: makeAllocationData({ action: 'COMPRA', difference: -3 }),
      cash: makeAllocationData({ action: 'OK', difference: 0.5 }),
    });
    expect(summary.isBalanced).toBe(false);
    expect(summary.offTargetCount).toBe(2);
    expect(summary.totalAbsDriftPp).toBeCloseTo(10.4, 5);
    expect(summary.largestGap?.assetClass).toBe('equity');
    expect(summary.largestGap?.label).toBe('Azioni');
  });
});

// ---------------------------------------------------------------------------
// buildRebalancePlan
// ---------------------------------------------------------------------------

describe('buildRebalancePlan', () => {
  it('should exclude OK rows and sort the moves by euro amount descending', () => {
    const plan = buildRebalancePlan({
      equity: makeAllocationData({ action: 'VENDI', difference: 7, differenceValue: 6200 }),
      bonds: makeAllocationData({ action: 'COMPRA', difference: -4, differenceValue: -3100 }),
      cash: makeAllocationData({ action: 'OK', difference: 1, differenceValue: 200 }),
    });
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ assetClass: 'equity', action: 'VENDI', amount: 6200, label: 'Azioni' });
    expect(plan[1]).toMatchObject({ assetClass: 'bonds', action: 'COMPRA', amount: 3100 });
  });

  it('should return an empty plan when everything is in band', () => {
    expect(buildRebalancePlan({ equity: makeAllocationData({ action: 'OK' }) })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// allocateContribution
// ---------------------------------------------------------------------------

describe('allocateContribution', () => {
  const add = (slices: ReturnType<typeof allocateContribution>, k: string) =>
    slices.find((s) => s.assetClass === k)!.add;

  // equity 50% now / 60% target; bonds 50% now / 40% target. Deficits are computed at
  // the NEW total — so a partial contribution can still leave the deficit unfilled.
  const sixtyForty: Record<string, AllocationData> = {
    equity: makeAllocationData({ currentValue: 50000, targetPercentage: 60 }),
    bonds: makeAllocationData({ currentValue: 50000, targetPercentage: 40 }),
  };

  it('should send a partial contribution only where it closes the gap (proportional branch)', () => {
    // newTotal 120000: equity deficit 22000, bonds desired 48000 < 50000 → deficit 0.
    const slices = allocateContribution(sixtyForty, 20000);
    expect(add(slices, 'equity')).toBeCloseTo(20000, 2);
    expect(add(slices, 'bonds')).toBeCloseTo(0, 2);
  });

  it('should land every class exactly on target when the cash covers all deficits', () => {
    // newTotal 130000: equity deficit 28000, bonds deficit 2000, total 30000 == amount.
    const slices = allocateContribution(sixtyForty, 30000);
    expect(add(slices, 'equity')).toBeCloseTo(28000, 2);
    expect(add(slices, 'bonds')).toBeCloseTo(2000, 2);
    expect(add(slices, 'equity') + add(slices, 'bonds')).toBeCloseTo(30000, 2);
  });

  it('should fill deficits then spread the remainder by target weight (targets sum below 100)', () => {
    // Targets sum to 80 → leftover cash after deficits is spread proportionally to target.
    const underSpecified: Record<string, AllocationData> = {
      equity: makeAllocationData({ currentValue: 50000, targetPercentage: 50 }),
      bonds: makeAllocationData({ currentValue: 50000, targetPercentage: 30 }),
    };
    // newTotal 120000: equity deficit 10000, bonds deficit 0 → remainder 10000 by 50/30.
    const slices = allocateContribution(underSpecified, 20000);
    expect(add(slices, 'equity')).toBeCloseTo(10000 + 10000 * (50 / 80), 2); // 16250
    expect(add(slices, 'bonds')).toBeCloseTo(10000 * (30 / 80), 2); // 3750
  });

  it('should spread by target weight when no class is under target', () => {
    // Both already at/above target at the new total → no deficits → pure target-weight split.
    const overFunded: Record<string, AllocationData> = {
      equity: makeAllocationData({ currentValue: 70000, targetPercentage: 50 }),
      bonds: makeAllocationData({ currentValue: 40000, targetPercentage: 30 }),
    };
    const slices = allocateContribution(overFunded, 10000);
    expect(add(slices, 'equity')).toBeCloseTo(10000 * (50 / 80), 2); // 6250
    expect(add(slices, 'bonds')).toBeCloseTo(10000 * (30 / 80), 2); // 3750
  });

  it('should add nothing for a non-positive amount', () => {
    expect(allocateContribution(sixtyForty, 0).every((s) => s.add === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// splitTowardTarget (generic core)
// ---------------------------------------------------------------------------

describe('splitTowardTarget', () => {
  const items = [
    { key: 'a', currentValue: 50000, targetPercentage: 60 },
    { key: 'b', currentValue: 50000, targetPercentage: 40 },
  ];

  it('should fill deficits measured against the explicit baseTotal', () => {
    // baseTotal 130000: a deficit 28000, b deficit 2000, total 30000 == amount.
    const adds = splitTowardTarget(items, 30000, 130000);
    expect(adds.a).toBeCloseTo(28000, 2);
    expect(adds.b).toBeCloseTo(2000, 2);
  });

  it('should spread by target weight when no item is under target', () => {
    // baseTotal 80000: a desired 48000 ≤ 50000, b desired 32000 ≤ 50000 → no deficits.
    const adds = splitTowardTarget(items, 10000, 80000);
    expect(adds.a).toBeCloseTo(10000 * 0.6, 2);
    expect(adds.b).toBeCloseTo(10000 * 0.4, 2);
  });

  it('should add nothing for a non-positive amount', () => {
    const adds = splitTowardTarget(items, 0, 130000);
    expect(adds.a).toBe(0);
    expect(adds.b).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// allocateContributionHierarchical (class → sub-category)
// ---------------------------------------------------------------------------

describe('allocateContributionHierarchical', () => {
  it('should split a class allotment across its sub-categories toward class-relative targets', () => {
    const byAssetClass: Record<string, AllocationData> = {
      equity: makeAllocationData({ currentValue: 100000, targetPercentage: 100 }),
    };
    // Sub-targets are % of the class. World is under, EM is over at the new class total.
    const bySubCategory: Record<string, AllocationData> = {
      'equity:World': makeAllocationData({ currentValue: 60000, targetPercentage: 70 }),
      'equity:EM': makeAllocationData({ currentValue: 40000, targetPercentage: 30 }),
    };
    // amount 20000 → class gets all 20000; classNewTotal 120000.
    // World deficit = 70%*120000 - 60000 = 24000; EM deficit = 30%*120000 - 40000 = 0.
    const plan = allocateContributionHierarchical(byAssetClass, bySubCategory, 20000);
    const equity = plan.find((s) => s.assetClass === 'equity')!;
    expect(equity.add).toBeCloseTo(20000, 2);

    const world = equity.subSlices.find((s) => s.label === 'World')!;
    const em = equity.subSlices.find((s) => s.label === 'EM')!;
    expect(world.add).toBeCloseTo(20000, 2); // all of the class allotment fills the World gap
    expect(em.add).toBeCloseTo(0, 2);
    // Sub-slice weight is relative to the class new total.
    expect(world.newPercentage).toBeCloseTo((80000 / 120000) * 100, 2);
  });

  it('should return an empty subSlices array for classes without sub-categories', () => {
    const byAssetClass: Record<string, AllocationData> = {
      cash: makeAllocationData({ currentValue: 10000, targetPercentage: 100 }),
    };
    const plan = allocateContributionHierarchical(byAssetClass, {}, 5000);
    expect(plan[0].subSlices).toEqual([]);
  });
});
