'use client';

import { cn } from '@/lib/utils';
import { formatStripFigure, type StripFigure } from '@/lib/utils/verdictStrip';
import { NarrativeSegments } from '@/components/ui/narrative-text';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

interface VerdictStripProps {
  /** At most four, from the page's `select<Page>Strip(summary)` — never recomputed here. */
  figures: readonly StripFigure[];
  /** What a cell opens: a row (`sections.reveal`), the verdict's rest, or THE tile (the page's own handler). */
  onOpen(section: string): void;
  /**
   * The eyebrow a cell announces («, apre Anni»), by the section it opens. A page passes its rows'
   * eyebrows and, for a cell that opens no row, the words it wants («l'andamento da inizio anno»).
   * Absent, the cell's own label.
   */
  eyebrows?: Readonly<Record<string, string>>;
}

/** A value longer than this takes a row of its own: «+123.456,78 €» does not fit a third of 358px (decision 28). */
const WIDE_CELL_CHARS = 9;

/**
 * The figures of a phone's first screen, under the verdict's first sentence (The First-Screen
 * Rule): 1–3 cells in a row, 4 as 2×2 below `tablet:`, a wide cell on a row of its own with the
 * others moving down. Each cell is a button that opens the section explaining it; a `null` figure
 * prints its `reason`, never a zero. Hidden from `desktop:` by its own class: the page does not
 * branch on the width to mount it.
 *
 * The `ul[aria-label="Le cifre del verdetto"]` is what the census counts OUTSIDE the verdict
 * (`scripts/mobileCensus.mjs`, correction 3): rename nothing here without renaming it there.
 */
export function VerdictStrip({ figures, onOpen, eyebrows }: VerdictStripProps) {
  if (figures.length === 0) return null;
  const twoByTwo = figures.length === 4;

  return (
    <ul aria-label="Le cifre del verdetto" className="my-2 flex flex-wrap gap-2 desktop:hidden">
      {figures.map((figure) => {
        const segment = formatStripFigure(figure);
        const text = segment?.text ?? figure.reason ?? '';
        const wide = text.length > WIDE_CELL_CHARS;
        const target = eyebrows?.[figure.opens] ?? figure.label;
        return (
          <li
            key={figure.opens}
            className={cn('@container min-w-0 flex-1', wide ? 'basis-full' : twoByTwo ? 'basis-[calc(50%-0.25rem)] tablet:basis-0' : 'basis-0')}
          >
            <button
              type="button"
              onClick={() => onOpen(figure.opens)}
              className="flex min-h-11 w-full flex-col items-start justify-center gap-0.5 rounded-lg py-1 text-left active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={TILE_SUB_EYEBROW_CLASS}>{figure.label}</span>
              {segment ? (
                <span className="text-[22px] leading-none tabular-nums @max-[110px]:text-[18px]">
                  {/* The unit at `ml-[0.2em]` after the figure: `NarrativeSegments` splits it (narrative-text.tsx). */}
                  <NarrativeSegments segments={[segment]} />
                </span>
              ) : (
                <span className="text-[13px] leading-[1.3] text-muted-foreground">{figure.reason}</span>
              )}
              <span className="sr-only">, apre {target}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
