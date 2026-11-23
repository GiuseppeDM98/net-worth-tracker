/**
 * Two tiles side by side in one grid row stretch to the taller one, and the shorter one is left
 * with a void between its rows and its footer. `balanceRows` says how many rows more the shorter
 * one draws to fill it (owner, 2026-11-23: Analisi's «Dove vanno i soldi» beside «Spese maggiori»).
 * The measuring is `useBalancedRows`; this is the arithmetic, and it is the same before and after
 * the rows are drawn — a measure never has to start from the tiles at rest.
 */

export interface RowFillMeasure {
  /** The void between the rows and the tile's footer as drawn, in px. */
  free: number;
  /** The height of one drawn row, in px (the list's height over its rows). */
  rowHeight: number;
  /** The rows the tile draws beyond its own count at rest. */
  extra: number;
  /** The rows it could draw beyond that count: 0 once the reader has unfolded it, or with nothing left. */
  room: number;
}

/** A row that fits to the pixel counts: the rectangles are fractional. */
const TOLERANCE_PX = 1;

/**
 * The extra rows of the two tiles, `[left, right]`: only the one that is shorter AT REST gets any.
 * A tile's slack is the void it would show at rest — the void drawn plus the rows already added —
 * so the difference of the two slacks is the difference of their heights at rest, whatever is drawn.
 */
export function balanceRows(left: RowFillMeasure, right: RowFillMeasure): [number, number] {
  const slack = (tile: RowFillMeasure) => tile.free + tile.extra * tile.rowHeight;
  const rows = (tile: RowFillMeasure, gap: number) =>
    tile.rowHeight > 0 ? Math.max(0, Math.min(tile.room, Math.floor((gap + TOLERANCE_PX) / tile.rowHeight))) : 0;
  const difference = slack(left) - slack(right);
  return difference >= 0 ? [rows(left, difference), 0] : [0, rows(right, -difference)];
}
