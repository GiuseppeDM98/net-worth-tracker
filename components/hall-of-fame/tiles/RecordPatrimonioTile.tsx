'use client';

import type { HallOfFameNote } from '@/types/hall-of-fame';
import type { RecordBoard, TimelinePoint } from '@/lib/utils/hallOfFameSummary';
import type { Narrative } from '@/lib/utils/narrative';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { RecordRows } from '@/components/hall-of-fame/RecordRows';
import { RecordBars } from '@/components/hall-of-fame/RecordBars';

interface RecordPatrimonioTileProps {
  reading: Narrative;
  /** «46 mesi confrontati»; absent until the stored stats exist. */
  aside?: string;
  board: RecordBoard | null;
  timeline: TimelinePoint[];
  /** The worst month, as the footer; absent when nothing has ever fallen. */
  footer: Narrative | null;
  notes: HallOfFameNote[];
  onNoteClick: (note: HallOfFameNote, trigger: HTMLElement | null) => void;
}

/**
 * How many positions the tile lists; the rest live in the Dettaglio's table. Five, like every
 * other board on the page: the tile spans two grid rows, and three rows plus a capped chart left
 * a hole above the footer.
 */
const PODIUM_SIZE = 5;

/**
 * «Qual è stato il mese migliore?» — the dominant tile: the podium of growth months, then the
 * record months dated on a chart, and the worst month as the footer.
 *
 * The worst month lives HERE and never in the verdict: the verdict names the best, the tile the
 * worst, so the same figure is never printed twice (the rule Storico settled). It spans two grid
 * rows, so the chart is the element that stretches — the podium keeps its size.
 */
export function RecordPatrimonioTile({
  reading,
  aside,
  board,
  timeline,
  footer,
  notes,
  onNoteClick,
}: RecordPatrimonioTileProps) {
  return (
    <Tile eyebrow="Record del patrimonio" aside={aside} reading={reading} ariaLabel="Record del patrimonio">
      {board && board.total > 0 ? (
        <>
          <div className="mt-2.5">
            <RecordRows
              rows={board.rows}
              category={board.category}
              limit={PODIUM_SIZE}
              notes={notes}
              sectionKey={board.sectionKey}
              onNoteClick={onNoteClick}
              labelClassName="w-[78px]"
              ariaLabel="I mesi con la crescita di patrimonio più alta"
            />
          </div>

          {timeline.length > 1 && (
            <>
              <div className="mt-[18px] flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className={TILE_SUB_EYEBROW_CLASS}>I {timeline.length} record nel tempo</p>
                <span className="text-[10px] text-muted-foreground">in ordine cronologico</span>
              </div>
              {/* It stretches with the tile's free height, but not past a ceiling: with three
                  podium rows above it, a 450px plot reads as the tile's subject rather than its
                  second fact. Whatever slack is left sits above the footer. */}
              <RecordBars
                points={timeline}
                ariaLabel="I mesi record, in ordine cronologico."
                className="mt-2.5 max-h-[300px] flex-1"
              />
            </>
          )}
        </>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Il primo record nasce con il secondo snapshot: da lì ogni mese ha un mese prima con cui confrontarsi.
        </p>
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
    </Tile>
  );
}
