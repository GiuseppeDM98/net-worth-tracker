'use client';

import { NotebookPen, Plus } from 'lucide-react';
import type { HallOfFameNote, HallOfFameSectionKey } from '@/types/hall-of-fame';
import { getNotesForPeriod } from '@/lib/services/hallOfFameService';
import { describeNotePeriod } from '@/lib/utils/hallOfFameNarrative';
import { cn } from '@/lib/utils';

/** What a row hands the note form: the period and the ranking it was opened from. */
export interface NotePrefill {
  year: number;
  month?: number;
  section: HallOfFameSectionKey;
}

interface NoteTriggerProps {
  notes: HallOfFameNote[];
  sectionKey: HallOfFameSectionKey;
  year: number;
  /** Absent on a yearly row — a note is filed with `month: undefined` there. */
  month?: number;
  onNoteClick: (note: HallOfFameNote, trigger: HTMLElement | null) => void;
  /**
   * Opens the note form with the row's period and ranking already written. Without it a row
   * with no note renders nothing: the tile stays a reading surface.
   */
  onAddNote?: (prefill: NotePrefill, trigger: HTMLElement | null) => void;
  /**
   * Always drawn, instead of fading in on hover. The Dettaglio's table has a «Nota» column: a
   * header that promises a marker only a mouse can reveal promises an empty column.
   */
  alwaysVisible?: boolean;
}

/**
 * The 44px-on-touch, 28px-on-pointer box of both markers: a row is 47px tall on a phone, so the
 * thumb target fits it (AGENTS.md → the `h-11 → desktop:h-7` idiom is the row's own).
 */
const MARKER_CLASS =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11';

/** Hidden until the row is hovered or focused with a mouse; on touch it is always there. */
const HOVER_ONLY_CLASS =
  '[@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-focus-within:opacity-100 [@media(pointer:fine)]:group-hover:opacity-100';

/**
 * The marker on a ranked row: a note to read when the period has one, «aggiungi» when it has
 * none and the row can open the form.
 *
 * A row with a note keeps its marker visible on touch (a hover-only affordance is invisible on
 * a phone) while fading in on hover with a mouse. The «add» affordance follows the same rule
 * where the caller asks for it — on the tiles it shows on hover and focus only under a mouse,
 * because twenty «+» on every ranked row of a phone would be chrome; the Dettaglio's table
 * draws it always, in its «Nota» column, so touch has one place to add a note from a row.
 *
 * The amber is `--warning-foreground`, the app's semantic amber; a chart slot is not a text
 * colour (AGENTS.md → Layout and Color Tokens).
 */
export function NoteTrigger({
  notes,
  sectionKey,
  year,
  month,
  onNoteClick,
  onAddNote,
  alwaysVisible = false,
}: NoteTriggerProps) {
  const matching = getNotesForPeriod(notes, sectionKey, year, month);
  const period = describeNotePeriod(year, month);

  if (matching.length === 0) {
    if (!onAddNote) return null;
    return (
      <button
        type="button"
        onClick={(event) => onAddNote({ year, month, section: sectionKey }, event.currentTarget)}
        aria-label={`Aggiungi una nota a ${period}`}
        className={cn(
          MARKER_CLASS,
          'text-muted-foreground hover:text-foreground',
          !alwaysVisible && HOVER_ONLY_CLASS,
          // On the tiles the add affordance is a mouse gesture: on touch the Dettaglio has it.
          !alwaysVisible && '[@media(pointer:coarse)]:hidden',
        )}
      >
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => onNoteClick(matching[0], event.currentTarget)}
      aria-label={
        matching.length > 1 ? `Leggi le ${matching.length} note di ${period}` : `Leggi la nota di ${period}`
      }
      className={cn(MARKER_CLASS, 'text-warning-foreground', !alwaysVisible && HOVER_ONLY_CLASS)}
    >
      <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
