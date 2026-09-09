'use client';

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface PagamentiTileProps {
  /** "15 voci" / "4 di 15 voci" — from `describePaymentsCount`. */
  aside: Narrative;
  reading: Narrative | null;
  /** The provisional-coupon notice, above the toolbar it concerns. */
  notice?: ReactNode;
  /** The desktop toolbar (instrument, type, view switch, CSV). */
  toolbar?: ReactNode;
  /** The compact toolbar rendered below `desktop:`, next to the list it narrows. */
  mobileToolbar?: ReactNode;
  /** The table or the calendar. */
  children: ReactNode;
  footer?: Narrative | null;
  className?: string;
}

/**
 * "Cosa c'è nel registro?" — the inventory of the period with the tile's cadence: the eyebrow,
 * the count as the aside, a reading that separates received from announced and names the
 * largest row, then the toolbar that narrows the list and the list itself.
 *
 * The toolbar narrows ONLY this tile. The verdict and every other tile read the period slice,
 * because a yield computed over one instrument is not the portfolio's yield (AGENTS.md →
 * Cashflow › Tracciamento, the same rule).
 */
export function PagamentiTile({
  aside,
  reading,
  notice,
  toolbar,
  mobileToolbar,
  children,
  footer,
  className,
}: PagamentiTileProps) {
  return (
    <Tile
      eyebrow="Pagamenti"
      aside={<NarrativeText segments={aside} figureClassName="font-medium" />}
      reading={reading}
      className={className}
    >
      {notice && <div className="mt-3.5">{notice}</div>}
      {toolbar && <div className="mt-3.5 hidden desktop:block">{toolbar}</div>}
      {mobileToolbar && <div className="mt-3.5 desktop:hidden">{mobileToolbar}</div>}
      <div className="mt-4">{children}</div>
      {footer && (
        <NarrativeText
          segments={footer}
          className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
          figureClassName="font-medium"
        />
      )}
    </Tile>
  );
}
