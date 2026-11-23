import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DEFAULT_SKELETON_CELLS,
  DEFAULT_SKELETON_LINES,
  tileSkeletonCellClass,
  type TileSkeletonCell,
} from '@/lib/utils/tileGridSkeleton';

interface TileGridSkeletonProps {
  /** Render the two verdict lines above the grid (pages that open with a verdict). */
  verdict?: boolean;
  /** Desktop geometry of the cells; defaults to the Panoramica's first two rows. */
  cells?: TileSkeletonCell[];
  /** A placeholder for a control row between the verdict and the grid (Tracciamento's period bar), so nothing jumps. */
  toolbar?: ReactNode;
  /** A placeholder for the verdict's `axis` slot, under the headline's line (`VerdictSkeleton`). */
  axis?: ReactNode;
  /**
   * What the wait is announced as. «Caricamento» is a page waiting for its data; the dashboard
   * layout names the auth wait («Verifica dell'accesso») so a reader hears which one it is — and
   * the benchmark's auth marker reads that label (scripts/perfBenchmark.mjs).
   */
  label?: string;
  className?: string;
}

function SkeletonTile({ lines }: { lines: number }) {
  return (
    <div data-tile="" className="flex-1 rounded-2xl border border-border bg-card p-5">
      <Skeleton className="mb-3 h-2.5 w-24" />
      <Skeleton className="mb-4 h-[13px] w-4/5" />
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3.5" />
        ))}
      </div>
    </div>
  );
}

/** The headline's line of a verdict still to come — `PageVerdict` draws it too while `pending`. */
export function VerdictSkeletonHeadline() {
  return <Skeleton className="h-8 w-72" />;
}

/** The sentence's two lines of a verdict still to come. */
export function VerdictSkeletonLines() {
  return (
    <>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </>
  );
}

/**
 * The lines a verdict arrives on, alone — for a page that keeps its own controls mounted beside
 * them while it waits (Tracciamento's period picker: a new period is a new read, and the picker
 * that asked for it must keep its place and its focus). Silent like every `Skeleton`: the wait is
 * announced by the grid's `role="status"`.
 *
 * `axis`: a placeholder of the verdict's `axis` slot, under the headline's line as `PageVerdict`
 * puts it (DESIGN.md → Page Verdict) — the two lazy Cashflow tabs' fallbacks draw
 * their period control there since 2026-10-12 (`CashflowTabSkeletons.tsx`), so a deep link lands
 * on the same geometry the tab draws.
 */
export function VerdictSkeleton({ className, axis }: { className?: string; axis?: ReactNode }) {
  return (
    // The same `page-verdict` name as `PageVerdict`: the page scene lands on these lines and the
    // verdict arrives in place when the data does.
    <div className={cn('flex max-w-[920px] flex-col gap-2', className)} style={{ viewTransitionName: 'page-verdict' }}>
      <VerdictSkeletonHeadline />
      {axis && <div className="desktop:hidden">{axis}</div>}
      <VerdictSkeletonLines />
    </div>
  );
}

/**
 * The ONE loading state of a redesigned page: the verdict's two lines, then the tile grid
 * with the page's own spans and no numbers (DESIGN.md → §5 Tile Grid Skeleton). A page passes
 * its `cells` so the skeleton has the proportions of what replaces it and nothing jumps on load.
 *
 * The wait is announced here and nowhere else — `role="status"` on the block, every placeholder
 * inside it `aria-hidden` (see `Skeleton`). And this is a WAIT: a page must not enter it on a
 * failed query, or the skeleton pulses forever (`resolveSurfaceState`).
 */
export function TileGridSkeleton({
  verdict = true,
  cells = DEFAULT_SKELETON_CELLS,
  toolbar,
  axis,
  label = 'Caricamento',
  className,
}: TileGridSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)} role="status" aria-label={label}>
      {verdict && <VerdictSkeleton className="pt-1" axis={axis} />}
      {toolbar}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        {cells.map((cell, i) => (
          <div key={i} className={cn('flex min-w-0', tileSkeletonCellClass(cell))}>
            <SkeletonTile lines={cell.lines ?? DEFAULT_SKELETON_LINES} />
          </div>
        ))}
      </div>
    </div>
  );
}
