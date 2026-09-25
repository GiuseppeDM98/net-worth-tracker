/**
 * The rules Impostazioni › Allocazione's «Salva» enforces on the target tree, as data.
 *
 * These checks used to live inside the page's save handler, each ending in a toast — so the
 * reader learnt that a group of subcategories did not reach 100% from a message that vanished
 * after four seconds, about a group that could be collapsed, and the specific-asset branch
 * printed the service's ENGLISH strings («Specific asset percentages must sum…»). Here each rule
 * returns WHERE it failed (the class, the subcategory row, the asset row), so the page can open
 * that group, put the focus on the field and state the problem in the tile's own reading; the
 * words live in `settingsNarrative.describeTargetProblem`.
 *
 * The order is the page's reading order: the total first (it is the tile above the list), then
 * each class from top to bottom, and inside a class the subcategories before their assets.
 * Only the FIRST problem is returned — one thing to fix at a time, and the reading line has room
 * for one sentence.
 */

import type { AssetClass } from '@/types/assets';

/**
 * Rounding slack: every percentage is typed with two decimals and summed in floating point. It is not
 * a two-decimal «grace»: 100.01 − 100 is 0.010000000000005 in binary, just OVER it.
 */
const TOLERANCE = 0.01;

export interface SpecificAssetDraft {
  name: string;
  targetPercentage: number;
}

export interface SubTargetDraft {
  name: string;
  percentage: number;
  specificAssetsEnabled?: boolean;
  specificAssets?: SpecificAssetDraft[];
}

export interface ClassTargetDraft {
  assetClass: AssetClass;
  subCategoryEnabled: boolean;
  subTargets: SubTargetDraft[];
}

export type TargetProblem =
  | { kind: 'total-below-100'; total: number }
  | { kind: 'sub-total'; assetClass: AssetClass; total: number }
  | { kind: 'sub-name-duplicate'; assetClass: AssetClass; subIndex: number; name: string }
  | { kind: 'specific-empty'; assetClass: AssetClass; subIndex: number; subName: string }
  | { kind: 'specific-name-missing'; assetClass: AssetClass; subIndex: number; subName: string; assetIndex: number }
  | { kind: 'specific-out-of-range'; assetClass: AssetClass; subIndex: number; subName: string; assetIndex: number }
  | { kind: 'specific-name-duplicate'; assetClass: AssetClass; subIndex: number; subName: string; assetIndex: number; name: string }
  | { kind: 'specific-total'; assetClass: AssetClass; subIndex: number; subName: string; total: number };

/**
 * The class total is valid from 100% up: the targets are desired NOTIONAL exposure over the
 * invested capital, so exactly 100 means no leverage and anything above it is a target leverage.
 */
export function isTargetTotalValid(total: number): boolean {
  return total >= 100 - TOLERANCE;
}

/** A group of subcategories, or of one subcategory's assets, must sum to exactly 100%. */
export function sumsToHundred(total: number): boolean {
  return Math.abs(total - 100) <= TOLERANCE;
}

/** Σ of a class's subcategory percentages. */
export function sumSubTargets(subTargets: SubTargetDraft[]): number {
  return subTargets.reduce((sum, target) => sum + target.percentage, 0);
}

/**
 * The tree as «Salva» writes it: a subcategory row with no name is a row the reader started and
 * left, so it is dropped rather than refused (its percentage leaves the group's sum with it,
 * which the sub-total rule then reports if the group no longer adds up).
 */
export function dropUnnamedSubTargets(classes: ClassTargetDraft[]): ClassTargetDraft[] {
  return classes.map((draft) =>
    draft.subCategoryEnabled
      ? { ...draft, subTargets: draft.subTargets.filter((target) => target.name.trim() !== '') }
      : draft
  );
}

function findDuplicateIndex(names: string[]): number {
  const seen = new Set<string>();
  for (let index = 0; index < names.length; index += 1) {
    const key = names[index].trim().toLowerCase();
    if (seen.has(key)) return index;
    seen.add(key);
  }
  return -1;
}

function findSpecificAssetProblem(
  assetClass: AssetClass,
  subIndex: number,
  target: SubTargetDraft
): TargetProblem | null {
  const subName = target.name.trim();
  const assets = target.specificAssets ?? [];
  const where = { assetClass, subIndex, subName };

  if (assets.length === 0) return { kind: 'specific-empty', ...where };

  const unnamed = assets.findIndex((asset) => asset.name.trim() === '');
  if (unnamed !== -1) return { kind: 'specific-name-missing', ...where, assetIndex: unnamed };

  const outOfRange = assets.findIndex((asset) => asset.targetPercentage < 0 || asset.targetPercentage > 100);
  if (outOfRange !== -1) return { kind: 'specific-out-of-range', ...where, assetIndex: outOfRange };

  const duplicate = findDuplicateIndex(assets.map((asset) => asset.name));
  if (duplicate !== -1) {
    return { kind: 'specific-name-duplicate', ...where, assetIndex: duplicate, name: assets[duplicate].name.trim() };
  }

  const total = assets.reduce((sum, asset) => sum + asset.targetPercentage, 0);
  if (!sumsToHundred(total)) return { kind: 'specific-total', ...where, total };

  return null;
}

/**
 * The first rule the target tree breaks, or `null` when «Salva» may write it.
 *
 * Pass the classes AFTER `dropUnnamedSubTargets` — that is the tree the save writes, and the
 * indices in the problem refer to it.
 */
export function findTargetProblem(total: number, classes: ClassTargetDraft[]): TargetProblem | null {
  if (!isTargetTotalValid(total)) return { kind: 'total-below-100', total };

  for (const draft of classes) {
    if (!draft.subCategoryEnabled) continue;
    const { assetClass, subTargets } = draft;

    const subTotal = sumSubTargets(subTargets);
    if (!sumsToHundred(subTotal)) return { kind: 'sub-total', assetClass, total: subTotal };

    const duplicate = findDuplicateIndex(subTargets.map((target) => target.name));
    if (duplicate !== -1) {
      return { kind: 'sub-name-duplicate', assetClass, subIndex: duplicate, name: subTargets[duplicate].name.trim() };
    }

    for (let subIndex = 0; subIndex < subTargets.length; subIndex += 1) {
      const target = subTargets[subIndex];
      if (!target.specificAssetsEnabled) continue;
      const problem = findSpecificAssetProblem(assetClass, subIndex, target);
      if (problem) return problem;
    }
  }

  return null;
}
