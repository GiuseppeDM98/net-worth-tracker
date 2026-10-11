/**
 * The Sovrapposizioni input from the SAME payload Esposizione reads: ETF vectors from the
 * answered fund profiles, direct stocks from the assets, the total from the base. No second
 * fetch — the tile reads `usePortfolioExposure` with the page's assets, so React Query serves
 * the cached profiles.
 *
 * Fund holding weights are sleeve fractions when Yahoo normalised them (`holdingsBasis:
 * 'sleeve'): scaled back to fund fractions by the asset's equity market share, so Σ min stays
 * a share of the ETF. A fund without published holdings, a composite without an equity leg and
 * a non-positive value contribute no vector — never a guess.
 */

import type { Asset } from '@/types/assets';
import type { InstrumentProfile } from '@/types/exposure';
import { expandAssetExposure } from '@/lib/utils/assetExposureUtils';
import { effectiveProfileTicker, isExposureBaseAsset, isQuotedInstrument, profileModuleFor } from '@/lib/utils/exposureRequests';
import type { OverlapDirectStock, OverlapEtfVector, OverlapInput } from '@/lib/utils/overlapUtils';

export function buildOverlapInput(
  assets: Asset[],
  profiles: Record<string, InstrumentProfile>,
): OverlapInput {
  const etfs: OverlapEtfVector[] = [];
  const stocks: OverlapDirectStock[] = [];
  let totalPortfolioValue = 0;
  for (const asset of assets) {
    if (!isExposureBaseAsset(asset)) continue;
    const legs = expandAssetExposure(asset);
    const marketValue = legs.reduce((sum, leg) => sum + leg.marketValue, 0);
    if (!(marketValue > 0)) continue;
    totalPortfolioValue += marketValue;
    if (!isQuotedInstrument(asset)) continue;
    const ticker = effectiveProfileTicker(asset);
    if (profileModuleFor(asset.type) === 'fund') {
      const holdings = profiles[ticker]?.fund?.holdings;
      if (!holdings || holdings.length === 0) continue;
      const equityMarket = legs
        .filter((leg) => leg.assetClass === 'equity')
        .reduce((sum, leg) => sum + leg.marketValue, 0);
      const scale = equityMarket / marketValue;
      if (!(scale > 0)) continue;
      etfs.push({
        ticker,
        assetName: asset.name,
        assetValueEur: marketValue,
        holdings: holdings
          .filter((holding) => holding.weight > 0)
          .map((holding) => ({ symbol: holding.key, name: holding.label, weight: holding.weight * scale })),
      });
    } else if (profileModuleFor(asset.type) === 'stock') {
      stocks.push({ ticker, name: asset.name, valueEur: marketValue });
    }
  }
  return { etfs, stocks, totalPortfolioValue };
}
