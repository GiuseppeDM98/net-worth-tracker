/**
 * The Accumulo tab's loading state, and the page's fallback while the tab's chunk is on its way
 * (2026-11-12, AGENTS.md § Dynamic Imports: a lazy tab's fallback is the tab's own loading state).
 * The verdict's lines, then Questo mese (7) beside Classi del piano (5) — the row a plan draws first.
 * Held by `e2e/lazyTabLanding.ts` (`expectAccumuloTabLandsInPlace`): the first cell of the grid sits
 * where the tab's first tile lands.
 *
 * This module imports no tab: a value imported from the lazy module puts it back in the page's
 * initial JavaScript.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { VerdictSkeleton } from '@/components/ui/tile-grid-skeleton';

export function AccumuloTabSkeleton() {
  return (
    <div role="status" aria-label="Caricamento" className="mt-4 grid gap-3">
      {/* A `section`, not a `div`: the first `.grid > div` is then the tile grid, the cell the landing check reads.
          pt-1 + the verdict's lines + pb-1 + the gap = the tab's verdict cell and its space-y-4 above the first tile. */}
      <section aria-hidden="true" className="pb-1 pt-1">
        <VerdictSkeleton />
      </section>
      <div className="grid grid-cols-1 gap-3 desktop:grid-cols-12">
        <Skeleton className="h-64 rounded-2xl desktop:col-span-7" />
        <Skeleton className="h-64 rounded-2xl desktop:col-span-5" />
      </div>
    </div>
  );
}
