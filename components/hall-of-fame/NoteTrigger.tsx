'use client';

import { NotebookPen } from 'lucide-react';
import type { HallOfFameNote, HallOfFameSectionKey } from '@/types/hall-of-fame';
import { getNotesForPeriod } from '@/lib/services/hallOfFameService';
import { cn } from '@/lib/utils';

interface NoteTriggerProps {
  notes: HallOfFameNote[];
  sectionKey: HallOfFameSectionKey;
  year: number;
  /** Absent on a yearly row — a note is filed with `month: undefined` there. */
  month?: number;
  onNoteClick: (note: HallOfFameNote, trigger: HTMLElement | null) => void;
  /**
   * Always drawn, instead of fading in on hover. The Dettaglio's table has a «Nota» column: a
   * header that promises a marker only a mouse can reveal promises an empty column.
   */
  alwaysVisible?: boolean;
}

/**
 * The marker on a ranked row that carries a note. It renders nothing when the period has none,
 * so a ranking without notes has no ghost column, and it stays visible on touch (a hover-only
 * affordance is invisible on a phone) while fading in on hover with a mouse.
 *
 * The amber is `--warning-foreground`, the app's semantic amber; a chart slot is not a text
 * colour (AGENTS.md → Layout and Color Tokens).
 */
export function NoteTrigger({ notes, sectionKey, year, month, onNoteClick, alwaysVisible = false }: NoteTriggerProps) {
  const matching = getNotesForPeriod(notes, sectionKey, year, month);
  if (matching.length === 0) return null;

  return (
    <button
      type="button"
      onClick={(event) => onNoteClick(matching[0], event.currentTarget)}
      aria-label={`Leggi la nota di ${month ? `${month}/${year}` : year}`}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-warning-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        !alwaysVisible &&
          '[@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-focus-within:opacity-100 [@media(pointer:fine)]:group-hover:opacity-100',
      )}
    >
      <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
