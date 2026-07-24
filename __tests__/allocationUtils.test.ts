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
 *   6. splitTowardTarget / allocateContribution / buildContributionPlan — the no-sell
 *      contribution split, class → sub-category → instrument.
 *   7. isAllocatable / partitionAllocatable / buildHoldings — the non-rebalanceable asset
 *      flag and the wealth it removes from the page.
 *   8. findOrphanedTargets / stripOrphanedSubTargets — targets the exclusion has stranded
 *      (a sub-category like "Prima casa" that can only ever hold the excluded house), and
 *      their removal from the maps that feed the planners.
 *   9. splitFromSurplus / buildWithdrawalPlan — the withdrawal ("Preleva") split, class →
 *      sub-category → instrument. Its load-bearing invariant, asserted throughout:
 *      Σamount === min(requested, ΣcurrentValue), at every level of the tree.
 *
 * No React, no Firebase — allocationUtils imports only types.
 */

import { describe, it, expect } from 'vitest';
import type {
  AllocationData,
  AllocationResult,
  Asset,
  AssetAllocationTarget,
} from '@/types/assets';
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
  buildContributionPlan,
  resolveAllocationRole,
  partitionByAllocationRole,
  buildHoldings,
  sumHoldingsByClass,
  sumTradableByClass,
  sumHoldingsBySubCategory,
  findOrphanedTargets,
  stripOrphanedSubTargets,
  splitFromSurplus,
  buildWithdrawalPlan,
  NO_SUBCATEGORY_LABEL,
  type AllocatableHolding,
  type PlanNode,
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

function makeHolding(overrides: Partial<AllocatableHolding> = {}): AllocatableHolding {
  return {
    id: 'h1',
    label: 'Holding',
    assetClass: 'equity',
    value: 1000,
    tradable: true,
    ...overrides,
  };
}

/** Σ of the euros moved across one level of a plan tree (contribution or withdrawal). */
function sumAmounts(nodes: PlanNode[]): number {
  return nodes.reduce((sum, node) => sum + node.amount, 0);
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
    marketValue: 100000,
    notionalValue: 100000,
    leverageRatio: 1,
    hasLeveragedExposure: false,
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
// buildContributionPlan — class → sub-category → instrument
// ---------------------------------------------------------------------------

describe('buildContributionPlan', () => {
  const byAssetClass: Record<string, AllocationData> = {
    equity: makeAllocationData({ currentValue: 100000, targetPercentage: 100 }),
  };
  // Sub-targets are % of the class. World is under, EM is over at the new class total.
  const bySubCategory: Record<string, AllocationData> = {
    'equity:World': makeAllocationData({ currentValue: 60000, targetPercentage: 70 }),
    'equity:EM': makeAllocationData({ currentValue: 40000, targetPercentage: 30 }),
  };

  it('should split a class allotment across its sub-categories toward class-relative targets', () => {
    // amount 20000 → class gets all 20000; classNewTotal 120000.
    // World deficit = 70%*120000 - 60000 = 24000; EM deficit = 30%*120000 - 40000 = 0.
    const plan = buildContributionPlan(byAssetClass, bySubCategory, {}, [], 20000);
    const equity = plan.find((n) => n.key === 'equity')!;
    expect(equity.amount).toBeCloseTo(20000, 2);

    const world = equity.children.find((n) => n.key === 'World')!;
    const em = equity.children.find((n) => n.key === 'EM')!;
    expect(world.amount).toBeCloseTo(20000, 2); // the whole class allotment fills the World gap
    expect(em.amount).toBeCloseTo(0, 2);
    // Sub-node weight is relative to the class's new total.
    expect(world.newPercentage).toBeCloseTo((80000 / 120000) * 100, 2);
  });

  it('should have no children for classes without sub-categories', () => {
    const plan = buildContributionPlan(
      { cash: makeAllocationData({ currentValue: 10000, targetPercentage: 100 }) },
      {},
      {},
      [],
      5000
    );
    expect(plan[0].children).toEqual([]);
  });

  it('should split a sub-category allotment pro-rata across the instruments held there', () => {
    const holdings: AllocatableHolding[] = [
      makeHolding({ id: 'e1', assetClass: 'equity', subCategory: 'World', value: 45000 }),
      makeHolding({ id: 'e2', assetClass: 'equity', subCategory: 'World', value: 15000 }),
    ];
    const plan = buildContributionPlan(byAssetClass, bySubCategory, {}, holdings, 20000);
    const world = plan[0].children.find((n) => n.key === 'World')!;

    // 45k : 15k = 3 : 1 → the 20.000 splits 15.000 / 5.000.
    expect(world.children.find((n) => n.key === 'e1')!.amount).toBeCloseTo(15000, 2);
    expect(world.children.find((n) => n.key === 'e2')!.amount).toBeCloseTo(5000, 2);
    expect(sumAmounts(world.children)).toBeCloseTo(world.amount, 2);
  });

  it('should honour specific-asset targets over the held instruments, even at zero holding', () => {
    // The asymmetry with the withdrawal: new money CAN be sent to something you own none of.
    const bySpecificAsset: Record<string, AllocationData> = {
      'equity:World:EPRA': makeAllocationData({ currentValue: 0, targetPercentage: 100 }),
    };
    const holdings: AllocatableHolding[] = [
      makeHolding({ id: 'e1', assetClass: 'equity', subCategory: 'World', value: 60000 }),
    ];
    const plan = buildContributionPlan(byAssetClass, bySubCategory, bySpecificAsset, holdings, 20000);
    const world = plan[0].children.find((n) => n.key === 'World')!;

    expect(world.children).toHaveLength(1);
    expect(world.children[0].key).toBe('EPRA');
    expect(world.children[0].amount).toBeCloseTo(world.amount, 2);
  });

  it('should have no instrument children when the sub-category holds nothing and has no specific targets', () => {
    // A targeted-but-empty sub-category still gets money — we just cannot name an instrument.
    const plan = buildContributionPlan(byAssetClass, bySubCategory, {}, [], 20000);
    const world = plan[0].children.find((n) => n.key === 'World')!;
    expect(world.amount).toBeGreaterThan(0);
    expect(world.children).toEqual([]);
  });

  it('should reconcile at every level: Σ instruments = sub-category, Σ sub-categories = class', () => {
    const holdings: AllocatableHolding[] = [
      makeHolding({ id: 'e1', assetClass: 'equity', subCategory: 'World', value: 45000 }),
      makeHolding({ id: 'e2', assetClass: 'equity', subCategory: 'World', value: 15000 }),
      makeHolding({ id: 'e3', assetClass: 'equity', subCategory: 'EM', value: 40000 }),
    ];
    const plan = buildContributionPlan(byAssetClass, bySubCategory, {}, holdings, 20000);

    for (const classNode of plan) {
      if (classNode.children.length === 0) continue;
      expect(sumAmounts(classNode.children)).toBeCloseTo(classNode.amount, 2);
      for (const sub of classNode.children) {
        if (sub.children.length === 0) continue;
        expect(sumAmounts(sub.children)).toBeCloseTo(sub.amount, 2);
      }
    }
    expect(sumAmounts(plan)).toBeCloseTo(20000, 2);
  });
});

// ---------------------------------------------------------------------------
// Non-rebalanceable assets
// ---------------------------------------------------------------------------

describe('resolveAllocationRole', () => {
  it('should default an asset with no role to tradable', () => {
    expect(resolveAllocationRole(makeAsset())).toBe('tradable');
  });

  it('should return the explicit role when set', () => {
    expect(resolveAllocationRole(makeAsset({ allocationRole: 'frozen' }))).toBe('frozen');
    expect(resolveAllocationRole(makeAsset({ allocationRole: 'excluded' }))).toBe('excluded');
  });

  it('should map the legacy excludeFromAllocation flag to excluded, not frozen', () => {
    // Behaviour-preserving: `excluded` is exactly what the old boolean did. Silently upgrading it
    // to `frozen` would put the asset back in the denominator and move the user's numbers.
    expect(resolveAllocationRole(makeAsset({ excludeFromAllocation: true }))).toBe('excluded');
  });

  it('should let an explicit role win over the legacy flag', () => {
    const asset = makeAsset({ excludeFromAllocation: true, allocationRole: 'frozen' });
    expect(resolveAllocationRole(asset)).toBe('frozen');
  });

  it('should not infer a role from real estate or the primary-residence flag', () => {
    // The migration promise: no existing asset changes behaviour until the user opts in.
    const house = makeAsset({
      type: 'realestate',
      assetClass: 'realestate',
      isPrimaryResidence: true,
      isLiquid: false,
    });
    expect(resolveAllocationRole(house)).toBe('tradable');
  });
});

describe('partitionByAllocationRole', () => {
  it('should split assets into the three roles', () => {
    const etf = makeAsset({ id: 'etf' });
    const pension = makeAsset({ id: 'pension', allocationRole: 'frozen' });
    const house = makeAsset({ id: 'house', allocationRole: 'excluded' });
    const legacy = makeAsset({ id: 'legacy', excludeFromAllocation: true });

    const { tradable, frozen, excluded } = partitionByAllocationRole([etf, pension, house, legacy]);
    expect(tradable.map((a) => a.id)).toEqual(['etf']);
    expect(frozen.map((a) => a.id)).toEqual(['pension']);
    expect(excluded.map((a) => a.id)).toEqual(['house', 'legacy']);
  });

  it('should return empty sets for an empty portfolio', () => {
    expect(partitionByAllocationRole([])).toEqual({ tradable: [], frozen: [], excluded: [] });
  });
});

describe('buildHoldings', () => {
  const valueOf = (asset: Asset) => asset.quantity * asset.currentPrice;

  it('should emit one holding per plain asset, carrying its class and sub-category', () => {
    const asset = makeAsset({ id: 'a1', subCategory: 'World', quantity: 5, currentPrice: 200 });
    expect(buildHoldings([asset], valueOf)).toEqual([
      {
        id: 'a1',
        label: 'Vanguard All-World',
        ticker: 'VWCE',
        assetClass: 'equity',
        subCategory: 'World',
        value: 1000,
        tradable: true,
      },
    ]);
  });

  it('should mark a frozen asset non-tradable while still emitting it', () => {
    const pension = makeAsset({ id: 'pf', allocationRole: 'frozen', quantity: 5, currentPrice: 200 });
    const [holding] = buildHoldings([pension], valueOf);
    expect(holding.tradable).toBe(false);
    expect(holding.value).toBe(1000); // it still counts
  });

  it('should split a composite asset into one holding per component, weighted by percentage', () => {
    const pensionFund = makeAsset({
      id: 'pf',
      name: 'Fondo Pensione',
      quantity: 1,
      currentPrice: 100000,
      composition: [
        { assetClass: 'equity', percentage: 60, subCategory: 'World' },
        { assetClass: 'bonds', percentage: 40 },
      ],
    });
    const holdings = buildHoldings([pensionFund], valueOf);

    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toMatchObject({ id: 'pf:0', assetClass: 'equity', value: 60000 });
    expect(holdings[1]).toMatchObject({ id: 'pf:1', assetClass: 'bonds', value: 40000 });
    // The components sum back to the asset's value, so class totals still reconcile.
    expect(holdings[0].value + holdings[1].value).toBeCloseTo(100000, 2);
  });

  it('should drop assets with no value (sold positions contribute nothing to sell)', () => {
    expect(buildHoldings([makeAsset({ quantity: 0 })], valueOf)).toEqual([]);
  });
});

describe('sumHoldingsByClass', () => {
  it('should total holdings per asset class', () => {
    const holdings = [
      makeHolding({ id: 'h1', assetClass: 'equity', value: 1000 }),
      makeHolding({ id: 'h2', assetClass: 'equity', value: 500 }),
      makeHolding({ id: 'h3', assetClass: 'realestate', value: 250000 }),
    ];
    expect(sumHoldingsByClass(holdings)).toEqual({ equity: 1500, realestate: 250000 });
  });
});

describe('sumTradableByClass', () => {
  it('should count only the tradable slice of each class', () => {
    const holdings = [
      makeHolding({ id: 'etf', assetClass: 'equity', value: 10000 }),
      makeHolding({ id: 'pf', assetClass: 'equity', value: 40000, tradable: false }),
    ];
    expect(sumTradableByClass(holdings)).toEqual({ equity: 10000 });
  });

  it('should omit a class with nothing tradable rather than report zero-value keys', () => {
    expect(sumTradableByClass([makeHolding({ tradable: false })])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// The `frozen` role — counted in the denominator, never moved by a plan
// ---------------------------------------------------------------------------

describe('frozen holdings', () => {
  // A class worth €50k of which €40k is a locked pension fund: far above a 20% target, but only
  // €10k of it can ever be sold. Keeping the drift honest AND the instruction executable is the
  // whole reason `currentValue` and `capacity` are separate inputs.
  const byAssetClass: Record<string, AllocationData> = {
    equity: makeAllocationData({ currentValue: 50000, targetPercentage: 20, differenceValue: 30000, difference: 30, action: 'VENDI' }),
    bonds: makeAllocationData({ currentValue: 50000, targetPercentage: 80, differenceValue: -30000, difference: -30, action: 'COMPRA' }),
  };
  const holdings: AllocatableHolding[] = [
    makeHolding({ id: 'etf', assetClass: 'equity', subCategory: 'World', value: 10000 }),
    makeHolding({ id: 'pf', assetClass: 'equity', subCategory: 'Fondo Pensione', value: 40000, tradable: false }),
    makeHolding({ id: 'btp', assetClass: 'bonds', subCategory: 'Governativi', value: 50000 }),
  ];

  describe('splitFromSurplus', () => {
    it('should measure the surplus on the full value but cap the take at the capacity', () => {
      const takes = splitFromSurplus(
        [{ key: 'equity', currentValue: 50000, capacity: 10000, targetPercentage: 20 }],
        30000,
        90000
      );
      // Surplus is 50000 − 20%*90000 = 32000, but only 10000 is sellable.
      expect(takes.equity).toBeCloseTo(10000, 2);
    });

    it('should cap Σtake at Σcapacity, not at Σcurrentvalue', () => {
      const items = [
        { key: 'a', currentValue: 50000, capacity: 10000, targetPercentage: 50 },
        { key: 'b', currentValue: 50000, capacity: 50000, targetPercentage: 50 },
      ];
      const takes = splitFromSurplus(items, 999999, 0);
      expect(takes.a + takes.b).toBeCloseTo(60000, 2);
      expect(takes.a).toBeCloseTo(10000, 2);
    });

    it('should default capacity to the full value when it is not given', () => {
      const takes = splitFromSurplus(
        [{ key: 'a', currentValue: 1000, targetPercentage: 100 }],
        999999,
        0
      );
      expect(takes.a).toBeCloseTo(1000, 2);
    });
  });

  describe('buildRebalancePlan', () => {
    it('should cap a VENDI at the tradable value and flag it', () => {
      const [move] = buildRebalancePlan(byAssetClass, sumTradableByClass(holdings)).filter(
        (m) => m.assetClass === 'equity'
      );
      expect(move.requestedAmount).toBeCloseTo(30000, 2); // the drift is not hidden
      expect(move.amount).toBeCloseTo(10000, 2); // but only this is executable
      expect(move.limitedByFrozen).toBe(true);
    });

    it('should never cap a COMPRA — you can always buy more', () => {
      const [move] = buildRebalancePlan(byAssetClass, sumTradableByClass(holdings)).filter(
        (m) => m.assetClass === 'bonds'
      );
      expect(move.amount).toBeCloseTo(30000, 2);
      expect(move.limitedByFrozen).toBe(false);
    });

    it('should report amount 0 and the flag when a class is entirely frozen', () => {
      const allFrozen = [makeHolding({ id: 'pf', assetClass: 'equity', value: 50000, tradable: false })];
      const [move] = buildRebalancePlan(byAssetClass, sumTradableByClass(allFrozen)).filter(
        (m) => m.assetClass === 'equity'
      );
      expect(move.amount).toBe(0);
      expect(move.limitedByFrozen).toBe(true);
    });

    it('should leave every class uncapped when no caps map is passed', () => {
      const [move] = buildRebalancePlan(byAssetClass).filter((m) => m.assetClass === 'equity');
      expect(move.amount).toBeCloseTo(30000, 2);
      expect(move.limitedByFrozen).toBe(false);
    });
  });

  describe('buildWithdrawalPlan', () => {
    it('should never sell a frozen holding, draining only what is tradable', () => {
      const plan = buildWithdrawalPlan(byAssetClass, {}, holdings, 10000);
      const equity = plan.find((n) => n.key === 'equity')!;
      const pensionBucket = equity.children.find((n) => n.key === 'Fondo Pensione');

      expect(pensionBucket?.amount ?? 0).toBeCloseTo(0, 2);
      const worldBucket = equity.children.find((n) => n.key === 'World')!;
      expect(worldBucket.children.every((n) => n.key !== 'pf')).toBe(true);
      expect(sumAmounts(plan)).toBeCloseTo(10000, 2);
    });

    it('should cap the whole plan at the TRADABLE total, not the portfolio value', () => {
      // €100k held, but €40k is a locked pension fund → only €60k can ever be withdrawn.
      const plan = buildWithdrawalPlan(byAssetClass, {}, holdings, 999999);
      expect(sumAmounts(plan)).toBeCloseTo(60000, 2);
    });
  });

  describe('buildContributionPlan', () => {
    const bySubCategory: Record<string, AllocationData> = {
      'equity:World': makeAllocationData({ currentValue: 10000, targetPercentage: 20 }),
      'equity:Fondo Pensione': makeAllocationData({ currentValue: 40000, targetPercentage: 80 }),
    };

    it('should never direct money into a sub-category that is entirely frozen', () => {
      // The pension fund's 80% target is real and met — but you cannot decide to put this month's
      // money there, so the class's whole allotment must renormalize onto the sleeve you CAN buy.
      const oneClass: Record<string, AllocationData> = {
        equity: makeAllocationData({ currentValue: 50000, targetPercentage: 100 }),
      };
      const plan = buildContributionPlan(oneClass, bySubCategory, {}, holdings, 5000);
      const equity = plan.find((n) => n.key === 'equity')!;

      expect(equity.children.map((n) => n.key)).toEqual(['World']);
      expect(equity.children[0].amount).toBeCloseTo(5000, 2);
    });

    it('should never name a frozen instrument at the leaf', () => {
      const mixedBucket: AllocatableHolding[] = [
        makeHolding({ id: 'etf', assetClass: 'equity', subCategory: 'World', value: 10000 }),
        makeHolding({ id: 'pf', assetClass: 'equity', subCategory: 'World', value: 40000, tradable: false }),
      ];
      const oneClass: Record<string, AllocationData> = {
        equity: makeAllocationData({ currentValue: 50000, targetPercentage: 100 }),
      };
      const plan = buildContributionPlan(
        oneClass,
        { 'equity:World': makeAllocationData({ currentValue: 50000, targetPercentage: 100 }) },
        {},
        mixedBucket,
        5000
      );
      const world = plan[0].children.find((n) => n.key === 'World')!;

      expect(world.children.map((n) => n.key)).toEqual(['etf']);
      expect(world.children[0].amount).toBeCloseTo(5000, 2);
    });
  });
});

describe('sumHoldingsBySubCategory', () => {
  it('should total holdings per class:subCategory key, bucketing the ones without a sub-category', () => {
    const holdings = [
      makeHolding({ id: 'h1', assetClass: 'equity', subCategory: 'World', value: 1000 }),
      makeHolding({ id: 'h2', assetClass: 'equity', subCategory: 'World', value: 500 }),
      makeHolding({ id: 'h3', assetClass: 'equity', subCategory: undefined, value: 200 }),
    ];
    expect(sumHoldingsBySubCategory(holdings)).toEqual({
      'equity:World': 1500,
      [`equity:${NO_SUBCATEGORY_LABEL}`]: 200,
    });
  });
});

describe('findOrphanedTargets', () => {
  it('should flag a class whose whole value is excluded and which has no sub-targets', () => {
    // The trap: the house leaves the denominator, the 25% realestate target stays behind,
    // and the page would otherwise demand "COMPRA 25% Immobili" forever.
    const byAssetClass: Record<string, AllocationData> = {
      equity: makeAllocationData({ currentValue: 75000, targetPercentage: 75 }),
      realestate: makeAllocationData({ currentValue: 0, targetPercentage: 25 }),
    };
    const orphans = findOrphanedTargets(byAssetClass, {}, { realestate: 250000 }, {});

    expect(orphans).toEqual([
      { assetClass: 'realestate', label: 'Immobili', targetPercentage: 25, excludedValue: 250000 },
    ]);
  });

  it('should flag the SUB-CATEGORY whose whole value is excluded', () => {
    // The bug this rule exists for: "Prima casa" can only ever contain the excluded house, but its
    // 70% target survives, so the contribution split poured money into an unreachable bucket.
    const byAssetClass: Record<string, AllocationData> = {
      realestate: makeAllocationData({ currentValue: 0, targetPercentage: 5 }),
    };
    const bySubCategory: Record<string, AllocationData> = {
      'realestate:Prima casa': makeAllocationData({ currentValue: 0, targetPercentage: 70 }),
      'realestate:REIT': makeAllocationData({ currentValue: 0, targetPercentage: 30 }),
    };
    const orphans = findOrphanedTargets(
      byAssetClass,
      bySubCategory,
      { realestate: 200000 },
      { 'realestate:Prima casa': 200000 }
    );

    // The sub-category is unreachable...
    expect(orphans).toEqual([
      {
        assetClass: 'realestate',
        subCategory: 'Prima casa',
        label: 'Immobili → Prima casa',
        targetPercentage: 70,
        excludedValue: 200000,
      },
    ]);
    // ...but the CLASS is not: REIT is a live destination you can buy into even holding none.
    expect(orphans.some((o) => o.subCategory === undefined)).toBe(false);
  });

  it('should flag the class when every one of its sub-targets is itself orphaned', () => {
    const byAssetClass: Record<string, AllocationData> = {
      realestate: makeAllocationData({ currentValue: 0, targetPercentage: 5 }),
    };
    const bySubCategory: Record<string, AllocationData> = {
      'realestate:Prima casa': makeAllocationData({ currentValue: 0, targetPercentage: 100 }),
    };
    const orphans = findOrphanedTargets(
      byAssetClass,
      bySubCategory,
      { realestate: 200000 },
      { 'realestate:Prima casa': 200000 }
    );
    expect(orphans.map((o) => o.subCategory)).toEqual(['Prima casa', undefined]);
  });

  it('should not flag a sub-category that still holds something rebalanceable', () => {
    const bySubCategory: Record<string, AllocationData> = {
      'realestate:REIT': makeAllocationData({ currentValue: 5000, targetPercentage: 30 }),
    };
    expect(
      findOrphanedTargets({}, bySubCategory, {}, { 'realestate:REIT': 200000 })
    ).toEqual([]);
  });

  it('should not flag an empty sub-category with no excluded value behind it', () => {
    // A target you have simply not funded yet MUST stay actionable — that is what Versa is for.
    const bySubCategory: Record<string, AllocationData> = {
      'equity:EM': makeAllocationData({ currentValue: 0, targetPercentage: 30 }),
    };
    expect(findOrphanedTargets({}, bySubCategory, {}, {})).toEqual([]);
  });

  it('should not flag a class that still holds something rebalanceable', () => {
    const byAssetClass: Record<string, AllocationData> = {
      realestate: makeAllocationData({ currentValue: 5000, targetPercentage: 25 }),
    };
    expect(findOrphanedTargets(byAssetClass, {}, { realestate: 250000 }, {})).toEqual([]);
  });

  it('should not flag a class whose target is already zero', () => {
    const byAssetClass: Record<string, AllocationData> = {
      realestate: makeAllocationData({ currentValue: 0, targetPercentage: 0 }),
    };
    expect(findOrphanedTargets(byAssetClass, {}, { realestate: 250000 }, {})).toEqual([]);
  });

  it('should not flag anything when nothing is excluded', () => {
    const byAssetClass: Record<string, AllocationData> = {
      realestate: makeAllocationData({ currentValue: 0, targetPercentage: 25 }),
    };
    expect(findOrphanedTargets(byAssetClass, {}, {}, {})).toEqual([]);
  });
});

describe('stripOrphanedSubTargets', () => {
  const bySubCategory: Record<string, AllocationData> = {
    'realestate:Prima casa': makeAllocationData({ currentValue: 0, targetPercentage: 70 }),
    'realestate:REIT': makeAllocationData({ currentValue: 0, targetPercentage: 30 }),
  };

  it('should drop the orphaned sub-categories and keep the rest', () => {
    const orphans = findOrphanedTargets(
      { realestate: makeAllocationData({ currentValue: 0, targetPercentage: 5 }) },
      bySubCategory,
      { realestate: 200000 },
      { 'realestate:Prima casa': 200000 }
    );
    expect(Object.keys(stripOrphanedSubTargets(bySubCategory, orphans))).toEqual([
      'realestate:REIT',
    ]);
  });

  it('should send the class allotment entirely to what survives, not into the unreachable bucket', () => {
    // End-to-end proof of the fix: before stripping, "Prima casa" (70%) swallowed most of the
    // money; after, the whole class allotment renormalizes onto REIT.
    const byAssetClass: Record<string, AllocationData> = {
      realestate: makeAllocationData({ currentValue: 0, targetPercentage: 100 }),
    };
    const orphans = findOrphanedTargets(
      byAssetClass,
      bySubCategory,
      { realestate: 200000 },
      { 'realestate:Prima casa': 200000 }
    );

    const naive = buildContributionPlan(byAssetClass, bySubCategory, {}, [], 1000);
    expect(naive[0].children.find((n) => n.key === 'Prima casa')!.amount).toBeGreaterThan(0);

    const fixed = buildContributionPlan(
      byAssetClass,
      stripOrphanedSubTargets(bySubCategory, orphans),
      {},
      [],
      1000
    );
    expect(fixed[0].children.map((n) => n.key)).toEqual(['REIT']);
    expect(fixed[0].children[0].amount).toBeCloseTo(1000, 2);
  });

  it('should return the map untouched when there are no orphans', () => {
    expect(stripOrphanedSubTargets(bySubCategory, [])).toBe(bySubCategory);
  });
});

// ---------------------------------------------------------------------------
// splitFromSurplus — the withdrawal core (mirror of splitTowardTarget)
// ---------------------------------------------------------------------------

describe('splitFromSurplus', () => {
  it('should drain surpluses proportionally when the amount fits inside them', () => {
    // baseTotal 90000 (100000 − 10000). equity surplus = 70000 − 60%*90000 = 16000;
    // bonds surplus = 30000 − 40%*90000 = 0. Everything comes out of equity.
    const takes = splitFromSurplus(
      [
        { key: 'equity', currentValue: 70000, targetPercentage: 60 },
        { key: 'bonds', currentValue: 30000, targetPercentage: 40 },
      ],
      10000,
      90000
    );
    expect(takes.equity).toBeCloseTo(10000, 2);
    expect(takes.bonds).toBeCloseTo(0, 2);
  });

  it('should drain every surplus then spread the remainder by target weight', () => {
    // baseTotal 50000. equity surplus = 70000 − 60%*50000 = 40000;
    // bonds surplus = 30000 − 40%*50000 = 10000. Total surplus 50000 = the amount exactly.
    const takes = splitFromSurplus(
      [
        { key: 'equity', currentValue: 70000, targetPercentage: 60 },
        { key: 'bonds', currentValue: 30000, targetPercentage: 40 },
      ],
      50000,
      50000
    );
    expect(takes.equity).toBeCloseTo(40000, 2);
    expect(takes.bonds).toBeCloseTo(10000, 2);
  });

  it('should spread by target weight when nothing is above target', () => {
    // Perfectly on target for the post-withdrawal base → no surplus anywhere.
    const takes = splitFromSurplus(
      [
        { key: 'equity', currentValue: 60000, targetPercentage: 60 },
        { key: 'bonds', currentValue: 40000, targetPercentage: 40 },
      ],
      10000,
      100000
    );
    expect(takes.equity).toBeCloseTo(6000, 2);
    expect(takes.bonds).toBeCloseTo(4000, 2);
  });

  it('should never take more than an item holds, redistributing the overflow', () => {
    // Target weight would send 90% of the €50k remainder to equity, but equity only holds €10k.
    // The excess must land on bonds, not produce a negative balance.
    const takes = splitFromSurplus(
      [
        { key: 'equity', currentValue: 10000, targetPercentage: 90 },
        { key: 'bonds', currentValue: 90000, targetPercentage: 10 },
      ],
      60000,
      40000
    );
    expect(takes.equity).toBeLessThanOrEqual(10000 + 1e-6);
    expect(takes.bonds).toBeLessThanOrEqual(90000 + 1e-6);
    expect(takes.equity + takes.bonds).toBeCloseTo(60000, 2);
  });

  it('should cap the total at what exists and drain everything when asked for more', () => {
    const items = [
      { key: 'equity', currentValue: 60000, targetPercentage: 60 },
      { key: 'bonds', currentValue: 40000, targetPercentage: 40 },
    ];
    const takes = splitFromSurplus(items, 500000, 0);

    expect(takes.equity).toBeCloseTo(60000, 2);
    expect(takes.bonds).toBeCloseTo(40000, 2);
    expect(takes.equity + takes.bonds).toBeCloseTo(100000, 2); // Σtake === ΣcurrentValue
  });

  it('should take nothing for a zero or negative amount', () => {
    const items = [{ key: 'equity', currentValue: 60000, targetPercentage: 100 }];
    expect(splitFromSurplus(items, 0, 60000).equity).toBe(0);
    expect(splitFromSurplus(items, -100, 60000).equity).toBe(0);
  });

  it('should degenerate to an exact pro-rata drain when every target equals the current share', () => {
    // This is the "neutral targets" trick the sub-category and instrument levels rely on:
    // target_i = value_i / total → surplus_i ∝ value_i → take_i = amount × value_i / total.
    const items = [
      { key: 'a', currentValue: 75000, targetPercentage: 75 },
      { key: 'b', currentValue: 25000, targetPercentage: 25 },
    ];
    const takes = splitFromSurplus(items, 10000, 90000);
    expect(takes.a).toBeCloseTo(7500, 2);
    expect(takes.b).toBeCloseTo(2500, 2);
  });
});

// ---------------------------------------------------------------------------
// buildWithdrawalPlan — class → sub-category → instrument
// ---------------------------------------------------------------------------

describe('buildWithdrawalPlan', () => {
  const byAssetClass: Record<string, AllocationData> = {
    equity: makeAllocationData({ currentValue: 70000, targetPercentage: 60 }),
    bonds: makeAllocationData({ currentValue: 30000, targetPercentage: 40 }),
  };
  const holdings: AllocatableHolding[] = [
    makeHolding({ id: 'e1', label: 'VWCE', assetClass: 'equity', subCategory: 'World', value: 50000 }),
    makeHolding({ id: 'e2', label: 'EIMI', assetClass: 'equity', subCategory: 'EM', value: 20000 }),
    makeHolding({ id: 'b1', label: 'BTP', assetClass: 'bonds', subCategory: 'Govt', value: 30000 }),
  ];

  it('should drain the over-target class first', () => {
    // Equity is 70% against a 60% target → the whole withdrawal comes out of it.
    const plan = buildWithdrawalPlan(byAssetClass, {}, holdings, 10000);
    const equity = plan.find((n) => n.key === 'equity')!;
    const bonds = plan.find((n) => n.key === 'bonds')!;

    expect(equity.amount).toBeCloseTo(10000, 2);
    expect(bonds.amount).toBeCloseTo(0, 2);
    expect(sumAmounts(plan)).toBeCloseTo(10000, 2);
  });

  it('should reconcile at every level: Σ instruments = bucket, Σ buckets = class', () => {
    const plan = buildWithdrawalPlan(byAssetClass, {}, holdings, 10000);

    for (const classNode of plan) {
      if (classNode.children.length === 0) continue;
      expect(sumAmounts(classNode.children)).toBeCloseTo(classNode.amount, 2);
      for (const bucket of classNode.children) {
        if (bucket.children.length === 0) continue;
        expect(sumAmounts(bucket.children)).toBeCloseTo(bucket.amount, 2);
      }
    }
  });

  it('should split an untargeted sub-category pro-rata instead of stranding its euros', () => {
    // Neither World nor EM has a configured target, so the class take must still be fully
    // distributed across them, in proportion to what is held (50k / 20k = 5:2).
    const plan = buildWithdrawalPlan(byAssetClass, {}, holdings, 7000);
    const equity = plan.find((n) => n.key === 'equity')!;
    const world = equity.children.find((n) => n.key === 'World')!;
    const em = equity.children.find((n) => n.key === 'EM')!;

    expect(world.amount).toBeCloseTo(5000, 2);
    expect(em.amount).toBeCloseTo(2000, 2);
    expect(world.amount + em.amount).toBeCloseTo(equity.amount, 2);
  });

  it('should drain a sub-category that is above its configured class-relative target first', () => {
    // World is 50k/70k ≈ 71% of equity against a 50% target → it absorbs the whole class take.
    const bySubCategory: Record<string, AllocationData> = {
      'equity:World': makeAllocationData({ currentValue: 50000, targetPercentage: 50 }),
      'equity:EM': makeAllocationData({ currentValue: 20000, targetPercentage: 50 }),
    };
    const plan = buildWithdrawalPlan(byAssetClass, bySubCategory, holdings, 10000);
    const equity = plan.find((n) => n.key === 'equity')!;
    const world = equity.children.find((n) => n.key === 'World')!;
    const em = equity.children.find((n) => n.key === 'EM')!;

    expect(world.amount).toBeCloseTo(10000, 2);
    expect(em.amount).toBeCloseTo(0, 2);
  });

  it('should split instruments inside one sub-category pro-rata by value', () => {
    const twoInWorld: AllocatableHolding[] = [
      makeHolding({ id: 'e1', assetClass: 'equity', subCategory: 'World', value: 30000 }),
      makeHolding({ id: 'e2', assetClass: 'equity', subCategory: 'World', value: 10000 }),
    ];
    const oneClass: Record<string, AllocationData> = {
      equity: makeAllocationData({ currentValue: 40000, targetPercentage: 100 }),
    };
    const plan = buildWithdrawalPlan(oneClass, {}, twoInWorld, 4000);
    const world = plan[0].children.find((n) => n.key === 'World')!;

    expect(world.children.find((n) => n.key === 'e1')!.amount).toBeCloseTo(3000, 2);
    expect(world.children.find((n) => n.key === 'e2')!.amount).toBeCloseTo(1000, 2);
  });

  it('should bucket instruments without a sub-category under a named fallback', () => {
    const noSub: AllocatableHolding[] = [
      makeHolding({ id: 'e1', assetClass: 'equity', subCategory: undefined, value: 40000 }),
    ];
    const oneClass: Record<string, AllocationData> = {
      equity: makeAllocationData({ currentValue: 40000, targetPercentage: 100 }),
    };
    const plan = buildWithdrawalPlan(oneClass, {}, noSub, 4000);

    expect(plan[0].children[0].key).toBe(NO_SUBCATEGORY_LABEL);
    expect(plan[0].children[0].amount).toBeCloseTo(4000, 2);
  });

  it('should cap the plan at the rebalanceable total when asked for more', () => {
    const plan = buildWithdrawalPlan(byAssetClass, {}, holdings, 500000);
    expect(sumAmounts(plan)).toBeCloseTo(100000, 2);
    // Nothing may be left holding a negative balance.
    for (const node of plan) expect(node.newValue).toBeGreaterThanOrEqual(-1e-6);
  });

  it('should take nothing and expose no children for a zero amount', () => {
    const plan = buildWithdrawalPlan(byAssetClass, {}, holdings, 0);
    expect(sumAmounts(plan)).toBe(0);
    expect(plan.every((n) => n.children.length === 0)).toBe(true);
  });

  it('should withdraw nothing when no holdings are known', () => {
    // Capacity comes from the holdings, so an empty list means zero sellable — the honest answer
    // to "what do I sell?" when we do not know what is held is "nothing", not a euro figure
    // attached to no instrument.
    const plan = buildWithdrawalPlan(byAssetClass, {}, [], 10000);
    expect(plan.every((n) => n.children.length === 0)).toBe(true);
    expect(sumAmounts(plan)).toBe(0);
  });
});
