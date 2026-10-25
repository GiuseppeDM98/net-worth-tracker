/**
 * What the objectives' editor needs from the account: the classes a
 * second-level objective can target, the ones that could once their sub-categories are on, the
 * instruments a second-level objective cannot place today and the tradable instruments the limits
 * pick from. Until A1 Impostazioni derived all of it from the targets FORM it was editing; the
 * editor now sits in Allocazione, so it reads the SAVED targets — the same ones the optimizer runs on.
 */
import type { Asset, AssetAllocationTarget, AssetClass } from '@/types/assets';
import { ASSET_CLASS_LABELS, resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { findSecondLevelGaps, type SecondLevelGap } from '@/lib/utils/weightOptimizer';
import { formatNumberIt, formatPercentageIt } from '@/lib/utils/formatters';

export interface ObjectivesClassOption {
  assetClass: AssetClass;
  label: string;
}

export interface ObjectivesEditorContext {
  factorClassOptions: ObjectivesClassOption[];
  secondLevelReadyClasses: ObjectivesClassOption[];
  secondLevelGaps: SecondLevelGap[];
  tradableAssets: { id: string; label: string }[];
}

export function buildObjectivesEditorContext(
  targets: AssetAllocationTarget,
  allAssets: Asset[],
  valueOf: (asset: Asset) => number,
): ObjectivesEditorContext {
  const classes = Object.keys(targets) as AssetClass[];
  const option = (assetClass: AssetClass): ObjectivesClassOption => ({ assetClass, label: ASSET_CLASS_LABELS[assetClass] ?? assetClass });

  const factorClasses = classes.filter(
    (assetClass) => !!targets[assetClass]?.subCategoryConfig?.enabled && (targets[assetClass]?.subCategoryConfig?.categories.length ?? 0) > 0,
  );
  const secondLevelReadyClasses = classes.filter(
    (assetClass) => (targets[assetClass]?.targetPercentage ?? 0) > 0 && !targets[assetClass]?.subCategoryConfig?.enabled,
  );

  const scoped = allAssets.filter((asset) => {
    const role = resolveAllocationRole(asset);
    return role === 'tradable' || role === 'frozen';
  });
  return {
    factorClassOptions: factorClasses.map(option),
    secondLevelReadyClasses: secondLevelReadyClasses.map(option),
    secondLevelGaps: findSecondLevelGaps(scoped, targets, factorClasses, valueOf),
    tradableAssets: allAssets.filter((asset) => resolveAllocationRole(asset) === 'tradable').map((asset) => ({ id: asset.id, label: asset.name })),
  };
}

/** The same range checks Impostazioni ran on «Salva»: a message, or null when the objectives can be saved. */
export function findIdealAllocationProblem(value: {
  instrumentLimits: { minPct?: number; maxPct?: number }[];
  groupLimits: { label: string; maxPct: number }[];
}): string | null {
  for (const limit of value.instrumentLimits) {
    if ([limit.minPct, limit.maxPct].some((pct) => pct !== undefined && (pct < 0 || pct > 100))) {
      return 'I limiti per strumento devono essere tra 0 e 100%.';
    }
    if (limit.minPct !== undefined && limit.maxPct !== undefined && limit.minPct > limit.maxPct) {
      return 'In un limite per strumento il minimo non può superare il massimo.';
    }
  }
  for (const group of value.groupLimits) {
    if (group.maxPct < 0 || group.maxPct > 100) {
      return `Il tetto del gruppo "${group.label || 'senza etichetta'}" deve essere tra 0 e 100%.`;
    }
  }
  return null;
}

export interface ClassTargetRow {
  assetClass: AssetClass;
  label: string;
  /** «20,0%», or «importo fisso» for a cash target held as an amount. */
  valueText: string;
}

export interface ClassTargetsView {
  rows: ClassTargetRow[];
  /** «Somma 110%: leva 1,10×.» or «Somma 100%: nessuna leva.» — null with no target. */
  leverageText: string | null;
}

/**
 * The class targets of Impostazioni › Allocazione read as the objectives' «Classi» base (AL18, D-AL5):
 * one row per class with a target above zero (or a fixed cash amount), in the order of
 * `ASSET_CLASS_SEQUENCE`'s consumers (the targets' own key order), and the leverage they imply — the
 * sum of the percentages, which the caller reads with `deriveTargetLeverageRatio` (not imported here: it drags Firebase in). Read-only: the write stays in
 * Impostazioni.
 */
export function describeClassTargets(targets: AssetAllocationTarget | null, targetLeverageRatio: number): ClassTargetsView {
  if (!targets) return { rows: [], leverageText: null };
  const rows: ClassTargetRow[] = [];
  for (const [key, data] of Object.entries(targets)) {
    const assetClass = key as AssetClass;
    const label = ASSET_CLASS_LABELS[assetClass] ?? key;
    if (assetClass === 'cash' && data.useFixedAmount) {
      rows.push({ assetClass, label, valueText: 'importo fisso' });
    } else if ((data.targetPercentage ?? 0) > 0) {
      rows.push({ assetClass, label, valueText: formatPercentageIt(data.targetPercentage, 1) });
    }
  }
  if (rows.length === 0) return { rows, leverageText: null };
  const ratio = targetLeverageRatio;
  const sumText = formatPercentageIt(ratio * 100, 0);
  const leverageText = ratio > 1.0005 ? `Somma ${sumText}: leva ${formatNumberIt(ratio, 2)}×.` : `Somma ${sumText}: nessuna leva.`;
  return { rows, leverageText };
}
