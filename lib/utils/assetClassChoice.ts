/**
 * The class list of `AssetDialog` — the app's eight classes, plus «Asset composto».
 *
 * WHY «ASSET COMPOSTO» IS NOT AN `AssetClass`. A hybrid fund or ETF has no single class: its
 * exposure is `Asset.composition` (equity + bonds + cash …), and every reader that matters already
 * looks through it (`calculateCurrentAllocation`, `expandAssetExposure`, the Storico snapshot,
 * `resolveDisplayAssetClass`). A ninth class would be a bucket no target can describe, with no
 * chart slot (the palette has eight, `ASSET_CLASS_CHART_INDEX`), and its euros would be allocated
 * to «Asset composto» instead of to the classes the fund actually holds. So «Asset composto» is a
 * SELECT VALUE: it turns on the switch of the same name and hands the truth to the composition
 * rows. The stored `Asset.assetClass` stays the fallback the form already held — the class a reader
 * uses when a composition is absent.
 *
 * The option list is derived from `ASSET_CLASS_SEQUENCE`, never hand-written beside the control:
 * a class missing from a list drops its euros, not just its label (doc/guide/allocazione.md).
 */
import type { AssetClass, AssetComposition } from '@/types/assets';
import { ASSET_CLASS_LABELS, ASSET_CLASS_SEQUENCE } from './allocationUtils';

/** Radix `Select` reserves `''` for "no value": the composite entry needs a sentinel of its own. */
export const MIXED_CLASS_VALUE = '__mixed__';
/**
 * The option's visible words. Deliberately the SAME words as the switch below it in the dialog
 * («Asset composto»): they are two handles on one field, and a second name for one declaration is
 * how the select and the switch start drifting apart.
 */
export const MIXED_CLASS_LABEL = 'Asset composto';

export interface AssetClassOption {
  value: string;
  label: string;
}

/** The eight real classes, in the app's canonical order — composition legs use this list. */
export const ASSET_CLASS_CHOICES: AssetClassOption[] = ASSET_CLASS_SEQUENCE.map((assetClass) => ({
  value: assetClass,
  label: ASSET_CLASS_LABELS[assetClass] ?? assetClass,
}));

/** The asset's own class select: the eight classes, then «Asset composto». */
export const ASSET_CLASS_OPTIONS: AssetClassOption[] = [
  ...ASSET_CLASS_CHOICES,
  { value: MIXED_CLASS_VALUE, label: MIXED_CLASS_LABEL },
];

/** TRUE for the composite entry, which is a shape (a composition) and not a class. */
export function isMixedClassChoice(value: string): boolean {
  return value === MIXED_CLASS_VALUE;
}

/**
 * What the class select shows: «Asset composto» while the asset is composite (the switch is the
 * field), the stored fallback class otherwise. One handle on `isComposite`, so the select and the
 * switch cannot disagree.
 */
export function classSelectValue(isComposite: boolean, assetClass: AssetClass): string {
  return isComposite ? MIXED_CLASS_VALUE : assetClass;
}

/**
 * The rows the composite entry starts from: the two sleeves of the classic balanced fund, at 0 %
 * so nothing is invented. The form refuses a composition that does not sum to 100
 * (`validateComposition`), so the user must type the shares before saving.
 */
export function emptyMixedComposition(): AssetComposition[] {
  return [
    { assetClass: 'equity', percentage: 0 },
    { assetClass: 'bonds', percentage: 0 },
  ];
}
