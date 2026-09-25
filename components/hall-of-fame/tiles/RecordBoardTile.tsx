'use client';

import type { ReactNode } from 'react';
import type { HallOfFameNote } from '@/types/hall-of-fame';
import type { RecordBoard } from '@/lib/utils/hallOfFameSummary';
import type { Narrative } from '@/lib/utils/narrative';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { RecordRows } from '@/components/hall-of-fame/RecordRows';
import type { NotePrefill } from '@/components/hall-of-fame/NoteTrigger';

interface RecordBoardTileProps {
  eyebrow: string;
  /** The scope of the ranking, on the right of the eyebrow. */
  aside: string;
  reading: Narrative;
  board: RecordBoard | null;
  /** How many positions to draw; the rest live in the Dettaglio's table. */
  limit: number;
  /** Minimum width of the period column — the bars of a board start on one line; never a ceiling. */
  labelClassName?: string;
  /** Shown when the ranking is empty, or when the document does not carry it at all. */
  emptyCopy: string;
  /** Rendered under the empty copy — the recalculate action, for a document that predates a ranking. */
  emptyAction?: ReactNode;
  /** A generated footer; a page never types copy that carries a number. */
  footer?: Narrative | null;
  /**
   * A literal footer: the ONE line that says what the rows are, with the method behind
   * «Come si calcola» (`TileMethodNote`) when `method` is given — never a second line on the tile.
   */
  footerCopy?: string;
  method?: ReactNode;
  notes: HallOfFameNote[];
  onNoteClick: (note: HallOfFameNote, trigger: HTMLElement | null) => void;
  onAddNote: (prefill: NotePrefill, trigger: HTMLElement | null) => void;
  ariaLabel: string;
}

/**
 * One ranking as a tile: eyebrow (the question), the reading, the ranked rows, a footer.
 *
 * Three tiles of the page are the same shape with different rankings — Entrate, Risparmio
 * record, Anni — so they are ONE component fed by the summary layer, not three near-copies that
 * would drift the first time a row changed. The dominant Record tile is its own component: it
 * carries a chart the others do not.
 */
export function RecordBoardTile({
  eyebrow,
  aside,
  reading,
  board,
  limit,
  labelClassName,
  emptyCopy,
  emptyAction,
  footer,
  footerCopy,
  method,
  notes,
  onNoteClick,
  onAddNote,
  ariaLabel,
}: RecordBoardTileProps) {
  const hasRows = !!board && board.total > 0;

  return (
    <Tile eyebrow={eyebrow} aside={aside} reading={reading} ariaLabel={ariaLabel}>
      {hasRows ? (
        <div className="mt-2.5">
          <RecordRows
            rows={board.rows}
            category={board.category}
            limit={limit}
            notes={notes}
            sectionKey={board.sectionKey}
            onNoteClick={onNoteClick}
            onAddNote={onAddNote}
            labelClassName={labelClassName}
            ariaLabel={ariaLabel}
          />
        </div>
      ) : (
        <div className="mt-3 flex flex-col items-start gap-3">
          <p className="text-[13px] text-muted-foreground">{emptyCopy}</p>
          {emptyAction}
        </div>
      )}

      {footer && (
        <div className="mt-auto border-t border-border pt-3.5">
          <NarrativeText
            segments={footer}
            className="text-[11px] leading-[1.5] text-muted-foreground"
            figureClassName="font-medium"
          />
        </div>
      )}
      {!footer && footerCopy && method && (
        <TileMethodNote summary={footerCopy} subject={eyebrow}>
          {method}
        </TileMethodNote>
      )}
      {!footer && footerCopy && !method && (
        <div className="mt-auto border-t border-border pt-3.5">
          <p className="text-[11px] leading-[1.5] text-muted-foreground">{footerCopy}</p>
        </div>
      )}
    </Tile>
  );
}
