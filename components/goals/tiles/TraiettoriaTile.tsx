'use client';

/**
 * TRAIETTORIA — «dove arriva l'obiettivo selezionato?»: the projected value at the deadline as the
 * hero figure, four grouped chips (the pace paid, the pace required, the months left, the return)
 * and the glide path filling the tile's free height. The chart is passed in as `chart` so this
 * tile knows nothing about Recharts: a shell with a reading, a number, chips and a footer.
 *
 * The goal's two actions — Modifica and Elimina — are the aside's ghost buttons from `desktop:`
 * and a full-width row of 44px targets below it (the Scheda's rule). Elimina is a two-click
 * confirm without a timer (`useArmedDelete`), announced to screen readers on arm AND on disarm.
 * In demo the buttons are disabled and the aside says why in visible copy.
 */

import { useRef, useState, type ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { TraiettoriaChip } from '@/lib/utils/goalsNarrative';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';

interface TraiettoriaTileProps {
  reading: Narrative;
  /** The selected goal's name — the aside's scope. */
  name: string;
  hero: { label: string; value: string } | null;
  chips: TraiettoriaChip[];
  notes: string | null;
  chart: ReactNode | null;
  footer: Narrative;
  onEdit: () => void;
  onDelete: () => void;
  isDemo: boolean;
  className?: string;
}

const ACTION_CLASS =
  'inline-flex h-11 items-center justify-center gap-1 rounded-md border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 desktop:h-7 desktop:border-0 desktop:px-2';

const CHIP_CLASS = 'inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-[9px] bg-muted px-[11px] py-[6px] font-mono text-[12px] font-semibold leading-none tabular-nums text-foreground';

function Chip({ chip }: { chip: TraiettoriaChip }) {
  return (
    <div className="flex w-fit flex-col gap-1">
      {/* A flex chip strips a leading space: the words carry their own gap. */}
      <span className={CHIP_CLASS}>
        <span>{chip.value}</span>
        {chip.words && <span className="font-sans font-medium text-muted-foreground">{chip.words}</span>}
      </span>
      <span className="text-[11px] leading-[1.4] text-muted-foreground">{chip.caption}</span>
    </div>
  );
}

function DeleteButton({ onDelete, disabled }: { onDelete: () => void; disabled: boolean }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onDelete);
  // Emptying a live region announces nothing, so the disarm is announced explicitly.
  const [wasArmed, setWasArmed] = useState(false);
  if (armed && !wasArmed) setWasArmed(true);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        onBlur={onBlur}
        disabled={disabled}
        aria-pressed={armed}
        className={cn(ACTION_CLASS, armed && 'border-destructive text-destructive hover:text-destructive desktop:border')}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        {armed ? 'Conferma eliminazione' : 'Elimina'}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {armed ? "Premi di nuovo per eliminare l'obiettivo" : wasArmed ? 'Eliminazione annullata' : ''}
      </span>
    </>
  );
}

export function TraiettoriaTile({ reading, name, hero, chips, notes, chart, footer, onEdit, onDelete, isDemo, className }: TraiettoriaTileProps) {
  return (
    <Tile
      eyebrow="Traiettoria"
      ariaLabel={`Traiettoria di ${name}`}
      aside={
        <div className="flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-2 desktop:w-auto">
          <span className="truncate">
            {name}
            {isDemo && ' · non modificabile in demo'}
          </span>
          {/* Below desktop the two actions take a full-width row of 44px targets; from desktop they are the aside's ghost buttons. */}
          <div className="flex w-full gap-2 [&>button]:flex-1 desktop:w-auto desktop:[&>button]:flex-none">
            <button type="button" onClick={onEdit} disabled={isDemo} className={ACTION_CLASS}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Modifica
            </button>
            <DeleteButton onDelete={onDelete} disabled={isDemo} />
          </div>
        </div>
      }
      reading={reading}
      className={className}
    >
      {notes && <p className="mt-2 text-[11px] leading-[1.45] italic text-muted-foreground">{notes}</p>}

      {hero && (
        <>
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-3.5')}>{hero.label}</p>
          <p className="mt-1.5 font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">{hero.value}</p>
        </>
      )}

      <div className="mt-3 flex flex-col items-start gap-2 tablet:flex-row tablet:flex-wrap tablet:gap-x-2.5 tablet:gap-y-2">
        {chips.map((chip) => (
          <Chip key={chip.caption} chip={chip} />
        ))}
      </div>

      {chart && (
        // The chart stretches with the tile's free height: the SVG's 100% height resolves against
        // the absolutely positioned box, never against its own ratio.
        <div className="relative mt-4 min-h-[200px] flex-1">
          <div className="absolute inset-0">{chart}</div>
        </div>
      )}

      <NarrativeText segments={footer} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
