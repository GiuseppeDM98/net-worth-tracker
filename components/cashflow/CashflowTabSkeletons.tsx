/**
 * The loading layout of the two Cashflow tabs whose wait is more than a tile grid, drawn by the
 * page as the `lazyComponent` fallback while the tab's chunk is on its way.
 *
 * Dividendi and Divisione draw a control row of their own while their data loads (Dividendi the
 * phone's toolbar, Divisione the period picker beside the verdict on desktop and on a row of its
 * own below it). A fallback of verdict and cells alone made everything under that row jump when
 * the chunk landed — on a deep link (`?tab=dividends`, `?tab=split`) or a click before the
 * preload. So the fallback draws the same rows:
 *   - Dividendi's loading state IS `DividendsTabSkeleton` (the tab renders it too);
 *   - Divisione keeps its LIVE picker mounted while it reads (a new period is a new read, and the
 *     picker that asked for it keeps its place and focus), so `SplitTabSkeleton` mirrors the
 *     tab's rows with a placeholder of the picker's size — `ExpenseSplitTab`'s `periodRows` and
 *     `PeriodPicker`'s `h-11 desktop:h-9`: change one, change this.
 * Budget and Centri di Costo wait on a tile grid alone, so their fallback is the grid of
 * `lib/constants/cashflowTabSkeletons.ts`. Held by `e2e/lazyTabLanding.ts` (the grid's first cell
 * where the fallback drew it, once the tab is in its own loading state), seen red without this.
 *
 * This module imports no tab: a value imported from a lazy module puts it back in the page's
 * initial JavaScript (AGENTS.md § Dynamic Imports and Module Hygiene).
 */
import { Skeleton } from '@/components/ui/skeleton';
import { TileGridSkeleton, VerdictSkeleton } from '@/components/ui/tile-grid-skeleton';
import { DIVIDENDS_SKELETON_CELLS, SPLIT_SKELETON_CELLS } from '@/lib/constants/cashflowTabSkeletons';

export function DividendsTabSkeleton() {
  return (
    <TileGridSkeleton
      cells={DIVIDENDS_SKELETON_CELLS}
      className="pt-1"
      toolbar={<Skeleton className="mx-auto h-9 w-full max-w-[320px] rounded-lg desktop:hidden" />}
    />
  );
}

export function SplitTabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-6 pt-1">
        <VerdictSkeleton className="flex-1" />
        <Skeleton className="hidden h-9 w-[190px] shrink-0 rounded-md desktop:block" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 desktop:hidden">
        <Skeleton className="h-11 w-[190px] rounded-md" />
      </div>
      <TileGridSkeleton verdict={false} cells={SPLIT_SKELETON_CELLS} />
    </div>
  );
}
