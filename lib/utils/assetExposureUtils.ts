/**
 * assetExposureUtils — the single source of market vs notional exposure (spec
 * docs/specs/3-leveraged-etf-allocation/README.md, invariant #2).
 *
 * A leveraged/composite ETF's market value (what you paid) and notional value (the risk
 * exposure it carries) diverge once `Asset.leverageRatio` is set. `expandAssetExposure`
 * expands a single asset into its per-class components with both figures, so every
 * consumer (allocation snapshot, planners, portfolio-level leverage) reads from one place.
 *
 * No asset type is special-cased — including `pensionFund` (D5 / spec 01 §3 "pensionFund"):
 * a fund with a `composition` is looked through leg-by-leg exactly like any other composite
 * asset, and a fund without one falls back to its own `asset.assetClass` (already
 * `TYPE_TO_CLASS['pensionFund']` at creation time) exactly like any other single-class asset.
 * The `frozen` allocationRole keeps it out of trade plans elsewhere (allocationUtils.ts) —
 * that's an allocation-role concern, not an exposure-shape one, so it stays out of this module.
 */
import { Asset } from '@/types/assets';
import { calculateAssetValue } from '@/lib/services/assetService';

export interface ExposureComponent {
  assetClass: string;
  subCategory?: string;
  marketValue: number;
  notionalValue: number; // marketValue × leverageRatio (single-class) or per-leg (composite)
}

/** Expands an asset into its per-class exposure components (market + notional). */
export function expandAssetExposure(asset: Asset): ExposureComponent[] {
  const marketValue = calculateAssetValue(asset);
  const leverage = asset.leverageRatio ?? 1;

  // Single-class: no composition legs, the whole market value sits in the asset's own class,
  // but leverage still multiplies its notional exposure (a plain leveraged ETF).
  if (!asset.composition || asset.composition.length === 0) {
    return [{
      assetClass: asset.assetClass,
      subCategory: asset.subCategory,
      marketValue,
      notionalValue: marketValue * leverage,
    }];
  }

  // Composite: leverage applies per-leg, same rationale as the single-class case.
  return asset.composition.map((comp) => ({
    assetClass: comp.assetClass,
    subCategory: comp.subCategory,
    marketValue: (marketValue * comp.percentage) / 100,
    notionalValue: (marketValue * comp.percentage * leverage) / 100,
  }));
}

/** Portfolio-wide leverage: Σnotional / Σmarket across all components (1 if market total is 0). */
export function calculatePortfolioLeverage(assets: Asset[]): number {
  let totalMarketValue = 0;
  let totalNotionalValue = 0;

  for (const asset of assets) {
    for (const component of expandAssetExposure(asset)) {
      totalMarketValue += component.marketValue;
      totalNotionalValue += component.notionalValue;
    }
  }

  return totalMarketValue > 0 ? totalNotionalValue / totalMarketValue : 1;
}
