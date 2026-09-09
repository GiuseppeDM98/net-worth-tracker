'use client';

import { NotebookPen, Plus } from 'lucide-react';
import type { HallOfFameNote } from '@/types/hall-of-fame';
import type { NotesSummary } from '@/lib/utils/hallOfFameSummary';
import type { Narrative } from '@/lib/utils/narrative';
import { Button } from '@/components/ui/button';
import { Tile } from '@/components/ui/tile';

interface NoteTileProps {
  reading: Narrative;
  summary: NotesSummary;
  /** Looked up by id when a row is opened — the row carries the display shape, not the record. */
  notes: HallOfFameNote[];
  onOpenNote: (note: HallOfFameNote, trigger: HTMLElement | null) => void;
  onAddNote: (trigger: HTMLElement | null) => void;
  disabled: boolean;
}

/**
 * «Cosa è successo in quei mesi?» — the notes the user filed on their own records.
 *
 * A note survives the ranking it was written for: it stays in this tile even after its period
 * drops out of the top twenty, which is why the tile lists notes rather than decorating rows.
 * The markers on the ranked rows are the other half of the same feature.
 */
export function NoteTile({ reading, summary, notes, onOpenNote, onAddNote, disabled }: NoteTileProps) {
  return (
    <Tile
      eyebrow="Note"
      aside={
        <Button
          variant="ghost"
          onClick={(event) => onAddNote(event.currentTarget)}
          disabled={disabled}
          className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground max-desktop:h-11 max-desktop:px-3 max-desktop:text-[13px]"
          aria-label={disabled ? 'Aggiungi una nota — non disponibile in modalità demo' : 'Aggiungi una nota'}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Aggiungi
        </Button>
      }
      reading={reading}
      ariaLabel="Note sui record"
    >
      {summary.rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Una nota spiega un record: cosa è successo quel mese, e perché la cifra è quella.
        </p>
      ) : (
        <ul className="mt-2.5 flex flex-col divide-y divide-border" aria-label="Le tue note">
          {summary.rows.map((row) => {
            const note = notes.find((candidate) => candidate.id === row.id);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={(event) => note && onOpenNote(note, event.currentTarget)}
                  aria-label={`Nota di ${row.longLabel}: ${row.text}`}
                  className="flex min-h-[44px] w-full items-start gap-3 py-[11px] text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring desktop:-mx-2 desktop:min-h-0 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2"
                >
                  <NotebookPen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-foreground" aria-hidden="true" />
                  {/* Below desktop the three columns stack: a 390px row has no space for them side by side. */}
                  <span className="flex min-w-0 flex-1 flex-col gap-1 desktop:flex-row desktop:items-baseline desktop:gap-3">
                    <span className="flex min-w-0 shrink-0 items-baseline gap-2 desktop:w-[240px]">
                      <span className="font-mono text-[13px] tabular-nums text-foreground">{row.label}</span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {row.sectionLabels.join(' · ')}
                      </span>
                    </span>
                    <span className="min-w-0 text-[13px] leading-[1.45] text-foreground">{row.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-auto border-t border-border pt-3.5">
        <p className="text-[11px] leading-[1.5] text-muted-foreground">
          Una nota può valere su più classifiche, e resta anche quando il periodo esce dalla top venti.
        </p>
      </div>
    </Tile>
  );
}
