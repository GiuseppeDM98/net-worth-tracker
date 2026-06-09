/**
 * Snapshot Asset Breakdown — pure helpers for the Storico "Valore per strumento" section.
 *
 * Every MonthlySnapshot already carries a `byAsset` array with each instrument's value frozen
 * at snapshot time (`totalValue`, computed via calculateAssetValue — so all the EUR/GBp/real-estate
 * and quantity×price rules are already baked in). These helpers only READ that data:
 *  - list the months that have a per-asset breakdown,
 *  - sort a month's assets by value,
 *  - sum a user-selected subset for a given month,
 *  - build the cross-month trend of a selected subset's combined value.
 *
 * No value re-computation happens here — the snapshot is the source of truth.
 */

import type { MonthlySnapshot } from '@/types/assets';
import { MONTH_NAMES } from '@/lib/constants/months';

/** A single asset entry as stored inside a snapshot. */
export type SnapshotAsset = MonthlySnapshot['byAsset'][number];

/** A selectable month in the breakdown UI. `key` is the stable Select value. */
export interface SnapshotMonthOption {
  key: string; // `${year}-${month}`
  year: number;
  month: number; // 1-12
  label: string; // e.g. "Marzo 2026"
}

/** One point of the selected-assets combined-value trend. */
export interface SelectedAssetTrendPoint {
  key: string; // `${year}-${month}`
  label: string; // e.g. "Marzo 2026"
  year: number;
  month: number;
  total: number; // sum of selected assets' totalValue present in this month

  // Change attribution vs the previous month in the series. All three are null on the first
  // point (no prior month to compare against). When present, `delta = priceEffect + quantityEffect`.
  delta: number | null; // total - previous total
  priceEffect: number | null; // share of the change driven by market price moves
  quantityEffect: number | null; // share driven by buying/selling (quantity changes)
  previousLabel: string | null; // label of the month the change is measured against
}

/** Price/quantity split of a month-over-month value change. */
interface ChangeAttribution {
  priceEffect: number;
  quantityEffect: number;
}

/** Build the stable Select value for a year/month pair. */
function buildMonthKey(year: number, month: number): string {
  return `${year}-${month}`;
}

/** Human-readable Italian label for a year/month pair. */
function buildMonthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** True when a snapshot carries a non-empty per-asset breakdown. */
function hasAssetBreakdown(snapshot: MonthlySnapshot): boolean {
  return Array.isArray(snapshot.byAsset) && snapshot.byAsset.length > 0;
}

/**
 * List the months that have a per-asset breakdown, most recent first.
 *
 * Snapshots created before the `byAsset` field existed (or empty ones) are excluded — they would
 * render an empty table. Sorting is descending so the latest month is the default selection.
 *
 * @param snapshots - All user snapshots (any order)
 * @returns Selectable month options, newest first
 */
export function getAvailableSnapshotMonths(
  snapshots: MonthlySnapshot[]
): SnapshotMonthOption[] {
  return snapshots
    .filter(hasAssetBreakdown)
    .map((snapshot) => ({
      key: buildMonthKey(snapshot.year, snapshot.month),
      year: snapshot.year,
      month: snapshot.month,
      label: buildMonthLabel(snapshot.year, snapshot.month),
    }))
    .sort((a, b) => (b.year !== a.year ? b.year - a.year : b.month - a.month));
}

/**
 * Return a copy of a month's assets sorted by total value, largest first.
 * Does not mutate the input array.
 */
export function sortAssetsByValue(byAsset: SnapshotAsset[]): SnapshotAsset[] {
  return [...byAsset].sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * Sum the total value of the selected assets within a single month.
 *
 * @param byAsset - The chosen month's asset breakdown
 * @param selectedIds - Set of selected assetIds
 * @returns Combined value of the selected assets (0 when nothing is selected)
 */
export function sumSelectedValues(
  byAsset: SnapshotAsset[],
  selectedIds: Set<string>
): number {
  return byAsset.reduce(
    (sum, asset) => (selectedIds.has(asset.assetId) ? sum + asset.totalValue : sum),
    0
  );
}

/**
 * Split the month-over-month value change of a selected subset into a price effect and a
 * quantity effect.
 *
 * WHY this exists: a drop in an instrument's value can mean two very different things — the
 * market price fell, or the user sold part of the position. The trend line alone can't tell
 * them apart; this attribution does.
 *
 * WHY we use totalValue/quantity instead of the snapshot's `price` field: the stored `price`
 * is the raw native-currency price (`asset.currentPrice`), while `totalValue` is the canonical
 * EUR figure produced by calculateAssetValue (FX-converted, GBp normalised, real-estate net of
 * debt). For USD/GBp/real-estate assets `totalValue !== quantity * price`, so only the effective
 * EUR unit value `u = totalValue / quantity` keeps the attribution consistent with the line.
 *
 * THE MATH (per asset, summed over the selected subset):
 *   Let q = quantity, u = totalValue / quantity (effective EUR unit value), subscripts p/c = prev/curr.
 *   - Both months present:
 *       priceEffect    = q_p * (u_c - u_p)   — market move on the position held at the start
 *       quantityEffect = (q_c - q_p) * u_c   — value of shares added/removed (interaction folded in)
 *       Sum = q_c*u_c - q_p*u_p = ΔtotalValue  (exact, no residual).
 *   - Asset present in only one month (a full open/close): the change is a pure quantity action,
 *     so the whole ΔtotalValue is attributed to quantityEffect (priceEffect = 0). This sidesteps
 *     the undefined unit value of the absent side (u would be 0/0).
 *
 * @param previousByAsset - The earlier month's asset breakdown
 * @param currentByAsset - The later month's asset breakdown
 * @param selectedIds - Set of selected assetIds
 * @returns Combined price/quantity effects; their sum equals the subset's total change
 */
export function attributeSelectedChange(
  previousByAsset: SnapshotAsset[],
  currentByAsset: SnapshotAsset[],
  selectedIds: Set<string>
): ChangeAttribution {
  const previousById = new Map(
    previousByAsset.filter((a) => selectedIds.has(a.assetId)).map((a) => [a.assetId, a])
  );
  const currentById = new Map(
    currentByAsset.filter((a) => selectedIds.has(a.assetId)).map((a) => [a.assetId, a])
  );

  let priceEffect = 0;
  let quantityEffect = 0;

  for (const assetId of new Set([...previousById.keys(), ...currentById.keys()])) {
    const prev = previousById.get(assetId);
    const curr = currentById.get(assetId);

    // Pure open/close: the asset exists in only one month → attribute the whole change to quantity.
    if (!prev) {
      quantityEffect += curr!.totalValue;
      continue;
    }
    if (!curr) {
      quantityEffect -= prev.totalValue;
      continue;
    }

    // Both present: split using the effective EUR unit value (guard against quantity 0).
    const unitPrev = prev.quantity !== 0 ? prev.totalValue / prev.quantity : 0;
    const unitCurr = curr.quantity !== 0 ? curr.totalValue / curr.quantity : 0;
    priceEffect += prev.quantity * (unitCurr - unitPrev);
    quantityEffect += (curr.quantity - prev.quantity) * unitCurr;
  }

  return { priceEffect, quantityEffect };
}

/**
 * Build the combined-value trend of the selected assets across all months that have a breakdown.
 *
 * One point per month (chronological order), summing the `totalValue` of the selected assetIds
 * that exist in that month. An asset absent from a given month (bought later, already sold)
 * contributes 0 for that month, so the line reflects the real combined exposure over time.
 *
 * Each point (except the first) also carries the change vs the previous month, split into a price
 * effect and a quantity effect via attributeSelectedChange — so the tooltip can explain whether a
 * move was the market or a buy/sell.
 *
 * @param snapshots - All user snapshots (any order)
 * @param selectedIds - Set of selected assetIds
 * @returns Trend points oldest-first, or [] when nothing is selected
 */
export function buildSelectedAssetTrend(
  snapshots: MonthlySnapshot[],
  selectedIds: Set<string>
): SelectedAssetTrendPoint[] {
  if (selectedIds.size === 0) {
    return [];
  }

  const orderedSnapshots = snapshots
    .filter(hasAssetBreakdown)
    .slice()
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

  return orderedSnapshots.map((snapshot, index) => {
    const previous = index > 0 ? orderedSnapshots[index - 1] : null;
    const total = sumSelectedValues(snapshot.byAsset, selectedIds);

    let delta: number | null = null;
    let priceEffect: number | null = null;
    let quantityEffect: number | null = null;
    let previousLabel: string | null = null;

    if (previous) {
      const attribution = attributeSelectedChange(previous.byAsset, snapshot.byAsset, selectedIds);
      priceEffect = attribution.priceEffect;
      quantityEffect = attribution.quantityEffect;
      delta = priceEffect + quantityEffect;
      previousLabel = buildMonthLabel(previous.year, previous.month);
    }

    return {
      key: buildMonthKey(snapshot.year, snapshot.month),
      label: buildMonthLabel(snapshot.year, snapshot.month),
      year: snapshot.year,
      month: snapshot.month,
      total,
      delta,
      priceEffect,
      quantityEffect,
      previousLabel,
    };
  });
}
