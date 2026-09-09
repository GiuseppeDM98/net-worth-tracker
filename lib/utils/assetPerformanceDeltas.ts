/**
 * Per-instrument price deltas over three windows — the Δ Mese / Δ YTD / Δ Inizio columns behind
 * Patrimonio's "Andamento" toggle — and the unit-price series of the mobile rows' sparkline.
 *
 * A Δ is a PRICE variation, never a profit and never a value change. It is measured on the
 * canonical EUR unit price, `totalValue / quantity` of a snapshot row against
 * `calculateAssetValue(asset) / quantity` today — the same unit `attributeSelectedChange` uses
 * to split a month's change into price and quantity effects. Three consequences the previous
 * engine got wrong:
 *
 * - a purchase does not move the Δ. The old engine measured any hand-priced asset on its total
 *   value, so a crypto ETP with auto-update off that the user kept buying read "+573% Δ Mese";
 * - the currency conversion is part of the return (a USD position's EUR unit moves with the
 *   rate), and a change of the quote's basis (ticker, GBp) cannot fake a jump;
 * - real estate is measured gross of debt, `quantity × price` on both sides, so a mortgage
 *   instalment never reads as appreciation (the rule the market digest already follows).
 *
 * Assets whose quantity IS the value (pension funds, cash accounts — unit price pinned at 1)
 * have no price to measure: every window is null and the UI prints "—". A pension fund's return
 * net of contributions lives on Previdenza, which has the data to split it.
 *
 * Δ Inizio's base is always the first recorded unit price, never the PMC: it answers "how has
 * this position moved since I started tracking it", deliberately distinct from G/P.
 */

import type { Asset, MonthlySnapshot } from '@/types/assets';
import { calculateAssetValue } from '@/lib/services/assetService';

export interface AssetPerformanceData {
  /** % change vs the last COMPLETED month's snapshot; null when not measurable. */
  lastSnapshotDelta: number | null;
  /** % change vs the last snapshot of the previous year (or the first of this year). */
  ytdDelta: number | null;
  /** % change vs the first snapshot that holds the asset. */
  allTimeDelta: number | null;
}

export interface UnitPricePoint {
  year: number;
  month: number;
  value: number;
}

const EMPTY: AssetPerformanceData = { lastSnapshotDelta: null, ytdDelta: null, allTimeDelta: null };

/** Types whose unit price is pinned at 1 — the quantity carries the value, so no Δ exists. */
function hasNoUnitPrice(asset: Pick<Asset, 'type'>): boolean {
  return asset.type === 'pensionFund' || asset.type === 'cash';
}

/**
 * The hand-valued property — keyed on the TYPE, not the class: a REIT ETF sits in the
 * `realestate` class but is a quoted fund whose snapshot `price` is a native-currency quote, and
 * only the property carries an `outstandingDebt` to be gross of.
 */
function isRealEstate(asset: Pick<Asset, 'type'>): boolean {
  return asset.type === 'realestate';
}

/** Today's EUR unit price; null when there is no quantity to divide by. */
function currentUnitPrice(asset: Asset): number | null {
  if (!(asset.quantity > 0)) return null;
  // Gross of debt: the debt is not a price. `calculateAssetValue` clamps an underwater
  // property at 0, so the gross value is rebuilt without the debt rather than adding it back.
  const value = isRealEstate(asset) ? calculateAssetValue({ ...asset, outstandingDebt: undefined }) : calculateAssetValue(asset);
  return value / asset.quantity;
}

/** One asset's chronological unit-price history from the snapshots, rows without quantity skipped. */
function unitPriceHistory(asset: Asset, sortedSnapshots: MonthlySnapshot[]): UnitPricePoint[] {
  const points: UnitPricePoint[] = [];
  for (const snapshot of sortedSnapshots) {
    const row = snapshot.byAsset?.find((entry) => entry.assetId === asset.id);
    if (!row || !(row.quantity > 0)) continue;
    // The snapshot's raw `price` is the gross property value; `totalValue` is net of debt.
    const value = isRealEstate(asset) ? row.quantity * row.price : row.totalValue;
    points.push({ year: snapshot.year, month: snapshot.month, value: value / row.quantity });
  }
  return points;
}

function sortChronologically(snapshots: MonthlySnapshot[]): MonthlySnapshot[] {
  return [...snapshots].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
}

/**
 * The three Δ windows for every asset, keyed by asset id. `today` is the Italian calendar month
 * the page is rendered in: a snapshot already taken this month is skipped by Δ Mese, or the
 * column would read 0% the morning after the cron ran.
 */
export function computeAssetPerformanceDeltas(
  assets: Asset[],
  snapshots: MonthlySnapshot[],
  today: { year: number; month: number },
): Record<string, AssetPerformanceData> {
  if (snapshots.length === 0) return {};
  const sorted = sortChronologically(snapshots);
  const result: Record<string, AssetPerformanceData> = {};

  for (const asset of assets) {
    const current = hasNoUnitPrice(asset) ? null : currentUnitPrice(asset);
    const history = current === null ? [] : unitPriceHistory(asset, sorted);
    if (current === null || history.length === 0) {
      result[asset.id] = EMPTY;
      continue;
    }

    const deltaFrom = (point: UnitPricePoint | undefined): number | null =>
      point && point.value > 0 ? ((current - point.value) / point.value) * 100 : null;

    // A snapshot already taken this month is no base for any window: yesterday's cron is not a
    // year-to-date or since-inception figure either.
    const completed = history.filter((p) => !(p.year === today.year && p.month === today.month));
    // Δ Mese: the last completed month.
    const previousMonth = completed[completed.length - 1];
    // Δ YTD: the last snapshot of the previous year, else the first completed month of this year.
    const previousYear = completed.filter((p) => p.year === today.year - 1);
    const yearStart = previousYear.length > 0 ? previousYear[previousYear.length - 1] : completed.find((p) => p.year === today.year);

    result[asset.id] = {
      lastSnapshotDelta: deltaFrom(previousMonth),
      ytdDelta: deltaFrom(yearStart),
      allTimeDelta: deltaFrom(completed[0]),
    };
  }
  return result;
}

/**
 * The last twelve EUR unit prices of every asset that has at least two, keyed by asset id —
 * the shape `AssetSparkline` draws. Same unit as the deltas, so the line and the columns
 * agree; assets with no unit price get no series.
 */
export function computeAssetUnitPriceSeries(
  assets: Asset[],
  snapshots: MonthlySnapshot[],
  points = 12,
): Record<string, { value: number }[]> {
  if (snapshots.length === 0) return {};
  const sorted = sortChronologically(snapshots);
  const result: Record<string, { value: number }[]> = {};
  for (const asset of assets) {
    if (hasNoUnitPrice(asset)) continue;
    const series = unitPriceHistory(asset, sorted)
      .slice(-points)
      .map((p) => ({ value: p.value }));
    if (series.length >= 2) result[asset.id] = series;
  }
  return result;
}
