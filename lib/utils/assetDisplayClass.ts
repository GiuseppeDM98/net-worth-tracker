/**
 * Display-only prevailing asset class.
 *
 * A composite asset (a fondo pensione, a multi-sleeve ETF) has no single "true" class — its real
 * exposure lives in `Asset.composition`. `Asset.assetClass` itself only ever holds ONE value
 * (`TYPE_TO_CLASS['pensionFund'] = 'equity'` for a fund with no composition yet — see
 * AssetDialog.tsx), so a table that always reads `asset.assetClass` shows "Azioni" for a fund that
 * is actually 70% obbligazioni. This module answers "which class should a badge/group/sort show?"
 * WITHOUT ever writing back to `asset.assetClass` — no role/class is ever inferred at read time
 * (same rule as `resolveAllocationRole` in allocationUtils.ts). It is purely a display label.
 */
import type { Asset, AssetClass, AssetComposition } from '@/types/assets';

interface AssetClassLeg {
  assetClass: AssetClass;
  weight: number;
}

/**
 * Splits one asset into (assetClass, weight) legs, looking through `composition` when present —
 * weight is the composition percentage, or the asset's own class at full weight when uncomposed.
 * Shared by `resolveDisplayAssetClass` (ranks legs directly, no dollar value needed) and
 * `buildPensionLookThrough` in allocazioneSummary.ts (ranks legs after scaling weight by the asset's market VALUE) — the
 * third consumer of this exact "split into weighted class legs" shape is what earned the extraction
 * (Rule of Three), the two were duplicated as `assetLegs`/`toClassSlices` before this file existed.
 */
function assetClassLegs(
  asset: Pick<Asset, 'assetClass' | 'composition'>,
  totalWeight: number = 100
): AssetClassLeg[] {
  if (asset.composition && asset.composition.length > 0) {
    return asset.composition.map((comp: AssetComposition) => ({
      assetClass: comp.assetClass,
      weight: (totalWeight * comp.percentage) / 100,
    }));
  }
  return [{ assetClass: asset.assetClass, weight: totalWeight }];
}

/**
 * The composition leg with the largest share, falling back to `asset.assetClass` when composition
 * is empty/absent. On a tie, the FIRST leg in insertion order wins (`Array.prototype.sort` is
 * stable) — an arbitrary but deterministic choice, since there is no third signal to break a real
 * 50/50 split. NEVER used to rewrite `asset.assetClass` — display only (table badges, group
 * headers, sort), never allocation math, snapshots, or Storico, which already do their own
 * composition look-through where it matters.
 */
export function resolveDisplayAssetClass(
  asset: Pick<Asset, 'assetClass' | 'composition'>
): AssetClass {
  // assetClassLegs always returns at least one leg (the uncomposed fallback), so the top of a
  // descending sort is always defined.
  const legs = assetClassLegs(asset);
  const sorted = [...legs].sort((a, b) => b.weight - a.weight);
  return sorted[0].assetClass;
}

export { assetClassLegs };
