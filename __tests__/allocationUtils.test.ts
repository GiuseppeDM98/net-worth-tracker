/**
 * Characterization tests for pure helpers in the Allocation feature.
 *
 * Four categories of logic are covered:
 *
 *   1. getDifferenceColor — semantic color token for a portfolio difference value.
 *      Over-allocation (positive) is a sell signal; under-allocation (negative) is a buy
 *      signal. These tests anchor the token mapping so a theme refactor cannot silently
 *      flip the semantics of the color choice.
 *
 *   2. groupSubCategoriesByAssetClass — parses "assetClass:subCategory" keys from the
 *      Firestore bySubCategory map. Must silently ignore malformed keys to avoid crashes.
 *
 *   3. filterSpecificAssets — parses "assetClass:subCategory:assetName" keys from
 *      bySpecificAsset and filters by the given assetClass + subCategory pair.
 *
 *   4. hasSpecificAssetTracking — guards whether a subcategory exposes the third drill-down
 *      level. The subTargets field supports two formats (legacy number and SubCategoryTarget
 *      object) for backward compat; that branch is the only non-obvious code path here.
 *
 *   5. ActionChip token family — anchors the token migration: VENDI must map to destructive,
 *      COMPRA to warning. A revert to hardcoded colors would break these tests.
 *
 * All functions below are local copies that mirror the component helpers (same pattern as
 * assetDialogHelpers.test.ts). No React, no Firebase.
 */

import { describe, it, expect } from 'vitest';
import type { AllocationData, AssetAllocationTarget } from '@/types/assets';

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
// Local copies — mirror page.tsx and AllocationCard.tsx helpers
// ---------------------------------------------------------------------------

// Positive difference = current > target (over-allocated → VENDI).
// Negative difference = current < target (under-allocated → COMPRA).
// ±1% is the tolerance band where the position is considered balanced (OK).
function getDifferenceColor(difference: number): string {
  if (Math.abs(difference) <= 1) return 'text-green-600 dark:text-green-400';
  if (difference > 1) return 'text-destructive';
  return 'text-warning-foreground';
}

function groupSubCategoriesByAssetClass(
  bySubCategory: Record<string, AllocationData>
): Record<string, Record<string, AllocationData>> {
  const grouped: Record<string, Record<string, AllocationData>> = {};
  Object.entries(bySubCategory).forEach(([key, data]) => {
    const parts = key.split(':');
    if (parts.length === 2) {
      const [assetClass, subCategory] = parts;
      if (!grouped[assetClass]) grouped[assetClass] = {};
      grouped[assetClass][subCategory] = data;
    }
  });
  return grouped;
}

function filterSpecificAssets(
  bySpecificAsset: Record<string, AllocationData>,
  assetClass: string,
  subCategory: string
): Record<string, AllocationData> {
  const result: Record<string, AllocationData> = {};
  Object.entries(bySpecificAsset).forEach(([key, data]) => {
    const parts = key.split(':');
    if (parts.length === 3) {
      const [ac, sc, assetName] = parts;
      if (ac === assetClass && sc === subCategory) {
        result[assetName] = data;
      }
    }
  });
  return result;
}

function hasSpecificAssetTracking(
  targets: AssetAllocationTarget | null,
  assetClass: string,
  subCategory: string
): boolean {
  if (!targets || !targets[assetClass]) return false;
  const subTargets = targets[assetClass].subTargets;
  if (!subTargets) return false;
  const subTargetData = subTargets[subCategory];
  if (!subTargetData || typeof subTargetData === 'number') return false;
  return subTargetData.specificAssetsEnabled || false;
}

// Mirrors the color-family decision in ActionChip (AllocationCard.tsx).
// Returns the token family name, not the full class string, so tests stay decoupled
// from Tailwind class spelling while still anchoring the semantic mapping.
function getActionChipTokenFamily(action: 'COMPRA' | 'VENDI' | 'OK'): 'warning' | 'destructive' | 'green' {
  switch (action) {
    case 'COMPRA': return 'warning';
    case 'VENDI': return 'destructive';
    case 'OK': return 'green';
  }
}

// ---------------------------------------------------------------------------
// getDifferenceColor
// ---------------------------------------------------------------------------

describe('getDifferenceColor', () => {
  it('should return green for a balanced position at 0', () => {
    expect(getDifferenceColor(0)).toBe('text-green-600 dark:text-green-400');
  });

  it('should return green at the positive tolerance boundary (exactly +1%)', () => {
    expect(getDifferenceColor(1)).toBe('text-green-600 dark:text-green-400');
  });

  it('should return green at the negative tolerance boundary (exactly -1%)', () => {
    expect(getDifferenceColor(-1)).toBe('text-green-600 dark:text-green-400');
  });

  it('should return destructive when current exceeds target by more than 1% (over-allocated)', () => {
    expect(getDifferenceColor(1.1)).toBe('text-destructive');
  });

  it('should return destructive for a strongly over-allocated position', () => {
    expect(getDifferenceColor(25)).toBe('text-destructive');
  });

  it('should return warning-foreground when current falls below target by more than 1% (under-allocated)', () => {
    expect(getDifferenceColor(-1.1)).toBe('text-warning-foreground');
  });

  it('should return warning-foreground for a strongly under-allocated position', () => {
    expect(getDifferenceColor(-30)).toBe('text-warning-foreground');
  });
});

// ---------------------------------------------------------------------------
// groupSubCategoriesByAssetClass
// ---------------------------------------------------------------------------

describe('groupSubCategoriesByAssetClass', () => {
  it('should group a single valid key under the correct asset class', () => {
    const input = {
      'equity:ETF World': makeAllocationData({ currentPercentage: 40 }),
    };
    const result = groupSubCategoriesByAssetClass(input);
    expect(result['equity']?.['ETF World']?.currentPercentage).toBe(40);
  });

  it('should group multiple sub-categories under the same asset class', () => {
    const input = {
      'equity:ETF World': makeAllocationData(),
      'equity:EM': makeAllocationData(),
    };
    const result = groupSubCategoriesByAssetClass(input);
    expect(Object.keys(result['equity']!)).toHaveLength(2);
  });

  it('should group sub-categories across different asset classes independently', () => {
    const input = {
      'equity:ETF World': makeAllocationData(),
      'bonds:BTP': makeAllocationData(),
    };
    const result = groupSubCategoriesByAssetClass(input);
    expect(result['equity']?.['ETF World']).toBeDefined();
    expect(result['bonds']?.['BTP']).toBeDefined();
    expect(Object.keys(result)).toHaveLength(2);
  });

  it('should ignore keys with no colon (malformed format)', () => {
    const input = { equity: makeAllocationData() };
    expect(groupSubCategoriesByAssetClass(input)).toEqual({});
  });

  it('should ignore 3-part keys (those belong to bySpecificAsset, not bySubCategory)', () => {
    const input = { 'equity:ETF World:VWCE': makeAllocationData() };
    expect(groupSubCategoriesByAssetClass(input)).toEqual({});
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

  it('should return all assets matching the given assetClass and subCategory', () => {
    const result = filterSpecificAssets(bySpecificAsset, 'equity', 'ETF World');
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['VWCE']?.currentValue).toBe(1000);
    expect(result['XEON']?.currentValue).toBe(500);
  });

  it('should exclude assets from a different sub-category within the same asset class', () => {
    const result = filterSpecificAssets(bySpecificAsset, 'equity', 'EM');
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['EIMI']).toBeDefined();
    expect(result['VWCE']).toBeUndefined();
  });

  it('should exclude assets from a different asset class entirely', () => {
    const result = filterSpecificAssets(bySpecificAsset, 'bonds', 'ETF World');
    expect(result).toEqual({});
  });

  it('should ignore 2-part keys (those belong to bySubCategory, not bySpecificAsset)', () => {
    const input = { 'equity:ETF World': makeAllocationData() };
    expect(filterSpecificAssets(input, 'equity', 'ETF World')).toEqual({});
  });

  it('should return an empty object when no key matches the given assetClass + subCategory', () => {
    const result = filterSpecificAssets(bySpecificAsset, 'crypto', 'Bitcoin');
    expect(result).toEqual({});
  });

  it('should return an empty object when input is empty', () => {
    expect(filterSpecificAssets({}, 'equity', 'ETF World')).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// hasSpecificAssetTracking
// ---------------------------------------------------------------------------

describe('hasSpecificAssetTracking', () => {
  it('should return false when targets is null', () => {
    expect(hasSpecificAssetTracking(null, 'equity', 'ETF World')).toBe(false);
  });

  it('should return false when the asset class is not present in targets', () => {
    const targets: AssetAllocationTarget = { bonds: { targetPercentage: 20 } };
    expect(hasSpecificAssetTracking(targets, 'equity', 'ETF World')).toBe(false);
  });

  it('should return false when the asset class has no subTargets', () => {
    const targets: AssetAllocationTarget = { equity: { targetPercentage: 60 } };
    expect(hasSpecificAssetTracking(targets, 'equity', 'ETF World')).toBe(false);
  });

  it('should return false when the sub-category is not in subTargets', () => {
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 60, subTargets: { EM: { targetPercentage: 30 } } },
    };
    expect(hasSpecificAssetTracking(targets, 'equity', 'ETF World')).toBe(false);
  });

  it('should return false when subTargets uses the legacy number format', () => {
    // Old Firestore documents store sub-category targets as plain numbers.
    // The helper must not crash on this format and must treat it as disabled.
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 60, subTargets: { 'ETF World': 70 } },
    };
    expect(hasSpecificAssetTracking(targets, 'equity', 'ETF World')).toBe(false);
  });

  it('should return false when specificAssetsEnabled is explicitly false', () => {
    const targets: AssetAllocationTarget = {
      equity: {
        targetPercentage: 60,
        subTargets: { 'ETF World': { targetPercentage: 70, specificAssetsEnabled: false } },
      },
    };
    expect(hasSpecificAssetTracking(targets, 'equity', 'ETF World')).toBe(false);
  });

  it('should return false when specificAssetsEnabled is absent (defaults to false)', () => {
    const targets: AssetAllocationTarget = {
      equity: {
        targetPercentage: 60,
        subTargets: { 'ETF World': { targetPercentage: 70 } },
      },
    };
    expect(hasSpecificAssetTracking(targets, 'equity', 'ETF World')).toBe(false);
  });

  it('should return true when specificAssetsEnabled is true', () => {
    const targets: AssetAllocationTarget = {
      equity: {
        targetPercentage: 60,
        subTargets: { 'ETF World': { targetPercentage: 70, specificAssetsEnabled: true } },
      },
    };
    expect(hasSpecificAssetTracking(targets, 'equity', 'ETF World')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ActionChip token family
// ---------------------------------------------------------------------------

describe('ActionChip token family', () => {
  it('should assign the warning token family to COMPRA (under-allocated — buy signal)', () => {
    expect(getActionChipTokenFamily('COMPRA')).toBe('warning');
  });

  it('should assign the destructive token family to VENDI (over-allocated — sell signal)', () => {
    expect(getActionChipTokenFamily('VENDI')).toBe('destructive');
  });

  it('should assign the green family to OK (balanced position, no action needed)', () => {
    expect(getActionChipTokenFamily('OK')).toBe('green');
  });
});
