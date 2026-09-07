import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface MovimentiTileProps {
  /** "47 voci" / "12 di 47 voci" — from `describeMovementsCount`. */
  aside: Narrative;
  reading: Narrative | null;
  /** The desktop filter toolbar (search, categories, account, sort, view, export); absent below `desktop:`. */
  toolbar?: ReactNode;
  /** The phone's «periodo · Filtri · ordina» bar, next to the list it narrows; absent from `desktop:`. */
  mobileToolbar?: ReactNode;
  /** The feed or the table. */
  children: ReactNode;
  className?: string;
}

/**
 * "Cosa c'è nel registro?" — the inventory of the period with the tile's cadence: the
 * eyebrow, the count as the aside, a reading that counts the rows by type and names the
 * largest, then the toolbar that narrows the list and the list itself. The feed keeps its
 * flat surface: rows inside a tile are never cards (DESIGN.md → Table inside a Tile).
 */
export function MovimentiTile({ aside, reading, toolbar, mobileToolbar, children, className }: MovimentiTileProps) {
  return (
    <Tile eyebrow="Movimenti" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className}>
      {toolbar && <div className="mt-3.5 hidden desktop:block">{toolbar}</div>}
      {mobileToolbar && <div className="mt-3.5 desktop:hidden">{mobileToolbar}</div>}
      <div className="mt-4">{children}</div>
    </Tile>
  );
}
