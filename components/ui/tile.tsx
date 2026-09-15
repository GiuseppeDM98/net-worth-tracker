import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Narrative } from '@/lib/utils/narrative';
import { NarrativeText } from '@/components/ui/narrative-text';

interface TileProps {
  /** The tile's question, as the small uppercase label. */
  eyebrow: string;
  /** Short context on the right of the eyebrow (a period, a count, a scope). */
  aside?: ReactNode;
  /** The one-line reading under the eyebrow: the answer in words, before the numbers. */
  reading?: Narrative | null;
  /** Optional accessible label for the section; defaults to the eyebrow. */
  ariaLabel?: string;
  /** An anchor id, so a line elsewhere on the page can jump to this tile («18 strumenti» → the table). */
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A text action inside a tile's 11px footer («Aggiungi conto», «Mostra tutte», a link to the
 * page that owns the depth): the words stay 11px, the TARGET does not — 32px on a pointer (the
 * dense-list floor), 44px on touch — through vertical padding folded back by a negative margin,
 * so the footer's rhythm is unchanged (measured 75×17 and 60×17 on 2026-09-14).
 */
export const TILE_FOOTER_ACTION_CLASS =
  'inline-flex min-h-8 -my-2 items-center text-foreground underline-offset-2 hover:underline [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:-my-3.5';

/** The eyebrow every tile, every hero and the compact page header share. */
export const TILE_EYEBROW_CLASS =
  'text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground';

/** A smaller eyebrow for labels INSIDE a tile (a KPI name, a list title). */
export const TILE_SUB_EYEBROW_CLASS =
  'text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground';

/**
 * Grid-cell wrapper for a tile: the tile stretches to the row height so `mt-auto` footers
 * align across a row. Pair with the desktop span (`desktop:col-span-N`) and a mobile order.
 */
export const TILE_CELL_CLASS = 'flex min-w-0 [&>section]:flex-1';

/**
 * One tile of a redesigned page (DESIGN.md → §5 Tile). Every tile answers ONE question: the
 * eyebrow names it, the reading answers it in a sentence, the body shows the numbers. The
 * shell is the app's card (bg-card, 1px border, 16px radius, the Lift shadow) written as a
 * naked `section` so the tile controls its own flex column — `mt-auto` footers rely on it.
 */
export function Tile({ eyebrow, aside, reading, ariaLabel, id, className, children }: TileProps) {
  return (
    <section
      id={id}
      aria-label={ariaLabel ?? eyebrow}
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm',
        className,
      )}
    >
      {/* The head wraps: an aside that carries controls (a pill, a select, two actions) drops under the
          eyebrow on a phone instead of pushing the tile past the viewport. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5">
        <p className={TILE_EYEBROW_CLASS}>{eyebrow}</p>
        {aside && <div className="min-w-0 max-w-full shrink-0 text-[10px] text-muted-foreground">{aside}</div>}
      </div>
      {reading && (
        <NarrativeText segments={reading} className="mt-2 text-[13px] leading-[1.45] text-foreground" />
      )}
      {children}
    </section>
  );
}
