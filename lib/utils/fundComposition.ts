/**
 * Fund composition — from Yahoo's published ASSET ALLOCATION to `Asset.composition`.
 *
 * A hybrid fund/ETF (a 60/40, a "bilanciato", a life-strategy) has no single asset class: the
 * classes live in `Asset.composition`, and every reader that matters (`calculateCurrentAllocation`,
 * `expandAssetExposure`, the Storico snapshot, `resolveDisplayAssetClass`) already looks through
 * them. This module is the ONE translator from what the market publishes
 * (`InstrumentFundAllocation`, the six `topHoldings` buckets) to that stored shape, so a hybrid
 * instrument arrives in «Composizione» split without the user typing splits by hand.
 *
 * It is PURE and SDK-free on purpose: the Intesa import preview runs it in the browser, the
 * profile route and its tests run it in Node. It invents nothing — a bucket Yahoo did not publish
 * is 0, and no allocation at all returns `[]` (the asset keeps its own class, exactly as before).
 */
import type { AssetClass, AssetComposition } from '@/types/assets';
import type { InstrumentFundAllocation } from '@/types/exposure';

/**
 * A leg below this share of the fund is dropped: «Composizione» draws 8px per leg, and a 0,03%
 * convertible leftover is noise, not a slice. The dropped weight lands on the largest leg, so the
 * figures still add to exactly 100. 1 p.p. is the same floor the chip applies to a *visible* leg
 * (`MIN_CHIP_SEGMENT_PCT`), so a fund reads the same two ways.
 */
export const MIN_COMPOSITION_LEG_PCT = 1;

/**
 * Yahoo's six buckets onto the app's classes:
 *  - `stock` → `equity`;
 *  - `bond`, `preferred`, `convertible` → `bonds` — preferred shares and convertibles are
 *    fixed-income instruments by nature (a coupon, a redemption), which is the closest of the
 *    eight classes; the alternative is dropping them, which would misstate the fund's risk;
 *  - `cash` → `cash`;
 *  - `other` → the asset's OWN class. «Other» is whatever Morningstar could not bucket
 *    (alternatives, real assets), and the asset's class is already the app's declared best guess
 *    for that fund — better than doubling a real sleeve with it.
 */
const BUCKET_TO_CLASS: Array<{ bucket: keyof InstrumentFundAllocation; assetClass: AssetClass }> = [
  { bucket: 'stock', assetClass: 'equity' },
  { bucket: 'bond', assetClass: 'bonds' },
  { bucket: 'preferred', assetClass: 'bonds' },
  { bucket: 'convertible', assetClass: 'bonds' },
  { bucket: 'cash', assetClass: 'cash' },
];

/** Round to the hundredth (the composition total's own tolerance is 0,01). */
function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The composition legs for a published allocation, largest first, summing to exactly 100.
 *
 * `fallbackClass` is the class the caller already resolved for the instrument (the asset's own
 * `assetClass`) and receives the `other` bucket. Returns `[]` when the allocation is absent or
 * empty, and never a single leg of 100 (a one-bucket fund has no composition to store — its class
 * says it all).
 */
export function compositionFromFundAllocation(
  allocation: InstrumentFundAllocation | null | undefined,
  fallbackClass: AssetClass,
): AssetComposition[] {
  if (!allocation) return [];

  const byClass = new Map<AssetClass, number>();
  const add = (assetClass: AssetClass, weight: number) => {
    if (weight <= 0) return;
    byClass.set(assetClass, (byClass.get(assetClass) ?? 0) + weight);
  };
  for (const { bucket, assetClass } of BUCKET_TO_CLASS) add(assetClass, allocation[bucket]);
  add(fallbackClass, allocation.other);

  const total = [...byClass.values()].reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return [];

  const legs = [...byClass.entries()]
    .map(([assetClass, weight]) => ({ assetClass, percentage: (weight / total) * 100 }))
    // A bucket the fund barely holds is no leg: drop it, then renormalise what is left below.
    .filter((leg) => leg.percentage >= MIN_COMPOSITION_LEG_PCT)
    .sort((a, b) => b.percentage - a.percentage);

  if (legs.length <= 1) return [];

  const kept = legs.map((leg) => ({ ...leg, percentage: roundPct(leg.percentage) }));
  // The rounding drift goes to the LARGEST leg, never a leg at the rounding floor: the four
  // figures must add to exactly 100, because `AssetDialog` refuses any composition that does not.
  const drift = roundPct(100 - kept.reduce((sum, leg) => sum + leg.percentage, 0));
  kept[0].percentage = roundPct(kept[0].percentage + drift);

  return kept;
}
