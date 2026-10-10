'use client';

import { cn } from '@/lib/utils';
import type { MobileSections } from '@/lib/hooks/useMobileSections';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';

interface PageRestProps {
  sections: MobileSections;
  className?: string;
}

/**
 * The line between THE tile and the rows on a phone (The Closed-Row Rule, since 2026-10-10):
 * «Il resto della pagina» as the second level-2 heading of the page, and the one button
 * that opens or closes every row — never the verdict's «Il perché». A child of the grid, right
 * after THE tile's cell in the DOM on every page, `col-span-full`, hidden from `desktop:`.
 *
 * Beside it, OUTSIDE the hidden wrapper, the page's one live node for the failed reads: below
 * `desktop:` every `ErrorNotice` row is silent (`live={!sections.compact}`) and this sentence
 * says them all at once («2 sezioni non sono state lette: Benchmark, Contributi.»). A stable
 * node that changes text and empties (doc/guide/dialog.md), never one that appears.
 * A page with no rows does not render this.
 */
export function PageRest({ sections, className }: PageRestProps) {
  return (
    <>
      <div className={cn('col-span-full flex items-center justify-between gap-3 desktop:hidden', className)}>
        <h2 className={cn(TILE_EYEBROW_CLASS, 'm-0')}>Il resto della pagina</h2>
        <button
          type="button"
          onClick={() => sections.setAll(!sections.allOpen)}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-[13px] font-medium text-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {sections.allOpen ? 'Chiudi tutte' : 'Apri tutte'}
        </button>
      </div>
      <p role="alert" className="sr-only">
        {sections.announcement ?? ''}
      </p>
    </>
  );
}
