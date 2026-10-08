/**
 * The loading grid of each Cashflow tab that loads on demand (2026-10-05).
 *
 * Dividendi, Budget, Divisione and Centri di Costo are `lazyComponent`s of the Cashflow page, so
 * until a tab's chunk arrives the page draws the tab's OWN loading state as the fallback: one wait,
 * nothing jumps. For Budget and Centri di Costo that state is these cells alone; Dividendi and
 * Divisione draw a control row too, so their fallback is a component of
 * `components/cashflow/CashflowTabSkeletons.tsx` built on these cells. They live here and not in
 * the tab modules because a value imported from a lazy module puts it back in the page's initial
 * JavaScript (AGENTS.md § Dynamic Imports and Module Hygiene).
 */
import type { TileSkeletonCell } from '@/lib/utils/tileGridSkeleton';

export const DIVIDENDS_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 8 },
  { span: 3, lines: 5 },
  { span: 4, lines: 5 },
  { span: 4, lines: 6 },
  { span: 3, lines: 4 },
  { span: 12, lines: 6 },
];

export const BUDGET_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 8 },
  { span: 4, lines: 4 },
  { span: 3, lines: 4 },
  { span: 7, lines: 4 },
  { span: 12, lines: 6 },
];

// THREE cells, because the people share one: «In comune» over two rows, «Quota» beside it, and the
// row of person tiles under that. It declared 5/7/7 against a grid that landed 5/7/6/6 until
// 2026-09-21, and the page jumped every time the data arrived.
export const SPLIT_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 6 },
  { span: 7, lines: 3 },
  { span: 7, lines: 4 },
];

export const COST_CENTERS_SKELETON_CELLS: TileSkeletonCell[] = [
  { span: 5, rows: 2, lines: 8 },
  { span: 7, lines: 6 },
  { span: 7, lines: 3 },
];
