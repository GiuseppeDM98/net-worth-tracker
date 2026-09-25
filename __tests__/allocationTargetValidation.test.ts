/**
 * Tests for lib/utils/allocationTargetValidation.ts — the rules «Salva» enforces on the
 * allocation target tree of Impostazioni, returned as WHERE they failed so the page can open
 * the group and focus the field. Pure: no Firebase chain to mock.
 */

import { describe, expect, it } from 'vitest';
import {
  dropUnnamedSubTargets,
  findTargetProblem,
  isTargetTotalValid,
  sumsToHundred,
  type ClassTargetDraft,
} from '@/lib/utils/allocationTargetValidation';

const flatClass = (assetClass: ClassTargetDraft['assetClass']): ClassTargetDraft => ({
  assetClass,
  subCategoryEnabled: false,
  subTargets: [],
});

describe('isTargetTotalValid', () => {
  it('accepts exactly 100 and a leveraged total, refuses anything under', () => {
    expect(isTargetTotalValid(100)).toBe(true);
    expect(isTargetTotalValid(110)).toBe(true);
    expect(isTargetTotalValid(99.995)).toBe(true);
    expect(isTargetTotalValid(99.9)).toBe(false);
  });
});

describe('sumsToHundred', () => {
  it('absorbs the two-decimal rounding and nothing more', () => {
    expect(sumsToHundred(33.33 + 33.33 + 33.34)).toBe(true);
    expect(sumsToHundred(100.005)).toBe(true);
    expect(sumsToHundred(100.5)).toBe(false);
  });
});

describe('dropUnnamedSubTargets', () => {
  it('drops the rows the reader started and left, only where subcategories are on', () => {
    const [enabled, disabled] = dropUnnamedSubTargets([
      { assetClass: 'equity', subCategoryEnabled: true, subTargets: [{ name: 'ETF', percentage: 100 }, { name: '  ', percentage: 0 }] },
      { assetClass: 'bonds', subCategoryEnabled: false, subTargets: [{ name: '', percentage: 0 }] },
    ]);
    expect(enabled.subTargets.map((t) => t.name)).toEqual(['ETF']);
    expect(disabled.subTargets).toHaveLength(1);
  });
});

describe('findTargetProblem', () => {
  it('returns null for a tree «Salva» may write', () => {
    expect(
      findTargetProblem(100, [
        { assetClass: 'equity', subCategoryEnabled: true, subTargets: [{ name: 'ETF', percentage: 60 }, { name: 'Azioni singole', percentage: 40 }] },
        flatClass('bonds'),
      ])
    ).toBeNull();
  });

  it('reports the total first, before any group below it', () => {
    expect(
      findTargetProblem(90, [{ assetClass: 'equity', subCategoryEnabled: true, subTargets: [{ name: 'ETF', percentage: 50 }] }])
    ).toEqual({ kind: 'total-below-100', total: 90 });
  });

  it('names the first class, top to bottom, whose subcategories do not add up', () => {
    expect(
      findTargetProblem(100, [
        flatClass('equity'),
        { assetClass: 'bonds', subCategoryEnabled: true, subTargets: [{ name: 'Governativi', percentage: 95 }] },
        { assetClass: 'cash', subCategoryEnabled: true, subTargets: [{ name: 'Conti', percentage: 10 }] },
      ])
    ).toEqual({ kind: 'sub-total', assetClass: 'bonds', total: 95 });
  });

  it('ignores the subcategories of a class that has them switched off', () => {
    expect(
      findTargetProblem(100, [{ assetClass: 'equity', subCategoryEnabled: false, subTargets: [{ name: 'ETF', percentage: 10 }] }])
    ).toBeNull();
  });

  it('points at the SECOND of two same-named subcategories, case and spaces ignored', () => {
    expect(
      findTargetProblem(100, [
        {
          assetClass: 'bonds',
          subCategoryEnabled: true,
          subTargets: [{ name: 'Governativi', percentage: 50 }, { name: ' governativi ', percentage: 50 }],
        },
      ])
    ).toEqual({ kind: 'sub-name-duplicate', assetClass: 'bonds', subIndex: 1, name: 'governativi' });
  });

  it('checks the specific assets of a subcategory only when their tracking is on', () => {
    const tree = (specificAssetsEnabled: boolean): ClassTargetDraft[] => [
      {
        assetClass: 'equity',
        subCategoryEnabled: true,
        subTargets: [{ name: 'ETF', percentage: 100, specificAssetsEnabled, specificAssets: [{ name: 'VWCE', targetPercentage: 80 }] }],
      },
    ];
    expect(findTargetProblem(100, tree(false))).toBeNull();
    expect(findTargetProblem(100, tree(true))).toEqual({
      kind: 'specific-total',
      assetClass: 'equity',
      subIndex: 0,
      subName: 'ETF',
      total: 80,
    });
  });

  it('refuses tracking with no asset, an unnamed asset, one out of range and a duplicate, in that order', () => {
    const withAssets = (specificAssets: { name: string; targetPercentage: number }[]): ClassTargetDraft[] => [
      { assetClass: 'equity', subCategoryEnabled: true, subTargets: [{ name: 'ETF', percentage: 100, specificAssetsEnabled: true, specificAssets }] },
    ];
    expect(findTargetProblem(100, withAssets([]))?.kind).toBe('specific-empty');
    expect(findTargetProblem(100, withAssets([{ name: 'VWCE', targetPercentage: 50 }, { name: '', targetPercentage: 50 }]))).toMatchObject({
      kind: 'specific-name-missing',
      assetIndex: 1,
    });
    expect(findTargetProblem(100, withAssets([{ name: 'VWCE', targetPercentage: 120 }]))).toMatchObject({
      kind: 'specific-out-of-range',
      assetIndex: 0,
    });
    expect(
      findTargetProblem(100, withAssets([{ name: 'VWCE', targetPercentage: 50 }, { name: 'vwce', targetPercentage: 50 }]))
    ).toMatchObject({ kind: 'specific-name-duplicate', assetIndex: 1, name: 'vwce' });
  });
});
