/**
 * Cell geometry of the reusable tile-grid skeleton (`components/ui/tile-grid-skeleton.tsx`).
 *
 * Tailwind only emits classes it can see as literals, so a span is looked up in a table rather
 * than interpolated — `desktop:col-span-${n}` would compile to nothing and every cell would
 * collapse to one column.
 */

export interface TileSkeletonCell {
  /** Desktop columns, 1-12, as on the page's own grid. */
  span: number;
  /** Desktop rows the cell spans (the dominant tile spans 2). */
  rows?: number;
  /** Muted text lines inside the cell, a proxy for the tile's height. */
  lines?: number;
}

const COL_SPAN_CLASS: Record<number, string> = {
  1: 'desktop:col-span-1',
  2: 'desktop:col-span-2',
  3: 'desktop:col-span-3',
  4: 'desktop:col-span-4',
  5: 'desktop:col-span-5',
  6: 'desktop:col-span-6',
  7: 'desktop:col-span-7',
  8: 'desktop:col-span-8',
  9: 'desktop:col-span-9',
  10: 'desktop:col-span-10',
  11: 'desktop:col-span-11',
  12: 'desktop:col-span-12',
};

export const DEFAULT_SKELETON_LINES = 3;

/**
 * Grid classes of one skeleton cell. A cell wider than half the grid, or two rows tall, also
 * takes the full tablet row (the two-column collapse), as the dominant tile does on the page.
 */
export function tileSkeletonCellClass(cell: TileSkeletonCell): string {
  const span = Math.min(12, Math.max(1, Math.round(cell.span)));
  const isTall = (cell.rows ?? 1) >= 2;
  const classes = [COL_SPAN_CLASS[span]];
  if (span > 6 || isTall) classes.push('tablet:col-span-2');
  if (isTall) classes.push('desktop:row-span-2');
  return classes.join(' ');
}

/** The Panoramica's first two rows — the default when a page passes no cells. */
export const DEFAULT_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 8 },
  { span: 3, lines: 4 },
  { span: 4, lines: 4 },
  { span: 3, lines: 5 },
  { span: 2, lines: 2 },
  { span: 2, lines: 2 },
];
