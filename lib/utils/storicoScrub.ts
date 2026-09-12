/**
 * The ONE resolution of a scrubbed month on Storico.
 *
 * Moving a fine pointer along the Evoluzione series puts the page in «lettura di un mese»: the
 * value in the tile's head becomes that month's, Composizione shows that month's split, Valore
 * per strumento jumps to it when the snapshot carries a per-asset breakdown, and the Driver
 * bars highlight its slot. This module decides, from one `PeriodMonth`, what every tile shows —
 * so a month that a tile cannot honour (no `byAsset`, outside the driver window) degrades in
 * one place instead of four. The page hands each tile only its own slice of the result.
 *
 * Pure and SDK-free: the words stay in `storicoNarrative.ts`, the figures in `storicoSummary.ts`.
 */

import type { EvolutionPoint, PeriodMonth } from './storicoSummary';
import type { SnapshotMonthOption } from './snapshotAssetBreakdown';

export interface ScrubView {
  /** The month under the pointer. */
  period: PeriodMonth;
  /** Its point on the Evoluzione series: the value, and the change on the month before. */
  point: EvolutionPoint;
  /** The `SnapshotMonthOption.key` of that month when it carries a per-asset breakdown, else null. */
  breakdownMonthKey: string | null;
  /** The slot of that month inside the Driver's trailing window, else null. */
  driverIndex: number | null;
}

/** Two calendar months are the same when year and month agree. */
export function isSamePeriod(a: PeriodMonth | null, b: PeriodMonth | null): boolean {
  if (!a || !b) return false;
  return a.year === b.year && a.month === b.month;
}

/**
 * What the tiles show for a scrubbed month. `null` when the month is not on the series — a
 * pointer index that outran the data must not put the page in a reading of nothing.
 */
export function resolveScrubView(input: {
  period: PeriodMonth | null;
  points: EvolutionPoint[];
  breakdownMonths: SnapshotMonthOption[];
  driverMonths: PeriodMonth[];
}): ScrubView | null {
  const { period, points, breakdownMonths, driverMonths } = input;
  if (!period) return null;
  const point = points.find((p) => isSamePeriod(p, period));
  if (!point) return null;

  const breakdownMonthKey = breakdownMonths.find((m) => isSamePeriod(m, period))?.key ?? null;
  const driverIndex = driverMonths.findIndex((m) => isSamePeriod(m, period));

  return {
    period: { year: point.year, month: point.month },
    point,
    breakdownMonthKey,
    driverIndex: driverIndex >= 0 ? driverIndex : null,
  };
}
