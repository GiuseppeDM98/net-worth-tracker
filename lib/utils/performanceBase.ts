/**
 * performanceBase — which capital a performance metric is measured on (spec 2-pension-fund/04 §7).
 *
 * A fondo pensione is illiquid, non-rebalanceable capital fed by external contributions
 * (TFR/employer/voluntary) rather than market activity, so including it would distort the
 * investment-performance metrics (TWR, Sharpe, volatility, max drawdown, ROI, CAGR) of the
 * portfolio the user actually manages. For those metrics the pension is EXCLUDED — treated
 * like the primary residence, out of the base.
 *
 * TYPE-BASED, not class-based (decision D2 — `pensionFund` is an `AssetType`, never an
 * `AssetClass`): `pensionAssetIds` is `assets.filter(a => a.type === 'pensionFund').map(a => a.id)`,
 * resolved by the caller. The exclusion reads `MonthlySnapshot.byAsset` (per-asset, frozen at
 * snapshot time) rather than `byAssetClass`, because a pension fund's value can already be split
 * across equity/bonds in `byAssetClass` via its `composition` look-through (`calculateCurrentAllocation`
 * — the same function that produces both the Allocazione denominator and the snapshot's
 * `byAssetClass`) — subtracting from `byAssetClass` would need to know exactly which class buckets
 * that fund contributed to. `byAsset` sidesteps this: it carries the fund's total value under its own
 * `assetId`, independent of how the class split was computed.
 *
 * `PerformanceBase` is the minimal, extensible seam: two values today — `portfolio` (excludes the
 * pension) and `netWorth` (includes everything) — ready to grow (liquid-only, cash/real-estate
 * exclusions) without rewriting callers.
 *
 * KNOWN LIMITATION: a VOLUNTARY contribution is a transfer from the portfolio (cash) into the
 * excluded pension, so on the portfolio base it looks like a small unneutralized outflow.
 * TFR/employer contributions never touch the portfolio and are unaffected. A full cash-flow
 * treatment belongs to a larger performance-base effort this seam is deliberately decoupled from.
 */

import type { MonthlySnapshot } from '@/types/assets';

export type PerformanceBase = 'portfolio' | 'netWorth';

/**
 * Project snapshots onto the requested performance base. For `netWorth` the snapshots are
 * returned unchanged; for `portfolio` (the default) every pension fund's value — summed per
 * snapshot from `byAsset` for the ids in `pensionAssetIds` — is removed from `totalNetWorth` and
 * `illiquidNetWorth` (pension funds are illiquid by default). Snapshots predating the feature, or
 * with no matching `byAsset` entry that month, pass through untouched.
 */
export function toPerformanceBaseSnapshots(
  snapshots: MonthlySnapshot[],
  pensionAssetIds: string[],
  base: PerformanceBase = 'portfolio'
): MonthlySnapshot[] {
  if (base === 'netWorth' || pensionAssetIds.length === 0) return snapshots;
  const ids = new Set(pensionAssetIds);

  return snapshots.map((snapshot) => {
    const pensionValue = (snapshot.byAsset ?? [])
      .filter((entry) => ids.has(entry.assetId))
      .reduce((sum, entry) => sum + entry.totalValue, 0);
    if (!pensionValue) return snapshot;

    return {
      ...snapshot,
      totalNetWorth: snapshot.totalNetWorth - pensionValue,
      illiquidNetWorth: Math.max(0, snapshot.illiquidNetWorth - pensionValue),
    };
  });
}
