/**
 * The grid geometry of the four FIRE tabs the page loads lazily (PERF-04, 2026-09-30): Coast FIRE,
 * What If, Monte Carlo and Obiettivi. Each tab module arrives as its own chunk when the tab is first
 * opened, and while it does the page shows THIS geometry — the same `TileGridSkeleton` the tab shows
 * while its data loads — so the chunk's wait and the data's wait are one skeleton and nothing jumps
 * between them. A module of its own, with no import but a type, so the page can read the cells
 * without pulling the tabs into its initial JavaScript.
 */
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';

export const COAST_TAB_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 12 },
  { span: 7, lines: 5 },
  { span: 7, lines: 4 },
];

export const WHAT_IF_TAB_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, lines: 12 },
  { span: 3, lines: 9 },
  { span: 4, lines: 10 },
  { span: 12, lines: 6 },
];

export const MONTE_CARLO_TAB_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, lines: 14 },
  { span: 4, lines: 10 },
  { span: 3, lines: 9 },
  { span: 12, lines: 10 },
];

export const GOALS_TAB_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 14 },
  { span: 7, lines: 10 },
  { span: 4, lines: 6 },
  { span: 3, lines: 5 },
  { span: 12, lines: 8 },
];
