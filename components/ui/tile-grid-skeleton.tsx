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
  className?: string;
}

function SkeletonTile({ lines }: { lines: number }) {
  return (
    <div className="flex-1 rounded-2xl border border-border bg-card p-5">
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

/**
 * The ONE loading state of a redesigned page: the verdict's two lines, then the tile grid
 * with the page's own spans and no numbers (DESIGN.md → §5 Tile Grid Skeleton). A page passes
 * its `cells` so the skeleton has the proportions of what replaces it and nothing jumps on load.
 *
 * The wait is announced here and nowhere else — `role="status"` on the block, every placeholder
 * inside it `aria-hidden` (see `Skeleton`). And this is a WAIT: a page must not enter it on a
 * failed query, or the skeleton pulses forever (`resolveSurfaceState`).
 */
export function TileGridSkeleton({ verdict = true, cells = DEFAULT_SKELETON_CELLS, toolbar, className }: TileGridSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)} role="status" aria-label="Caricamento">
      {verdict && (
        <div className="flex max-w-[920px] flex-col gap-2.5 pt-1">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}
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
