'use client';

/**
 * NoteIconCell Component (Updated for Dedicated Notes System)
 *
 * Displays clickable icon button for Hall of Fame notes with edit capability
 *
 * Changes from original:
 * - Now checks dedicated HallOfFameNote array instead of snapshot.note
 * - Filters by section key to show only relevant notes
 * - Click opens edit dialog instead of read-only view
 * - Shows amber icon if ANY note exists for this period + section
 *
 * @param notes - All Hall of Fame notes for the user
 * @param section - Current section key (e.g., 'bestMonthsByNetWorthGrowth')
 * @param year - Year to match
 * @param month - Month to match (undefined for yearly rankings)
 * @param onNoteClick - Callback to open edit dialog with the first matching note
 */

import { MessageSquare } from 'lucide-react';
import { HallOfFameNote, HallOfFameSectionKey } from '@/types/hall-of-fame';
import { getNotesForPeriod } from '@/lib/services/hallOfFameService';

interface NoteIconCellProps {
  notes: HallOfFameNote[];
  section: HallOfFameSectionKey;
  year: number;
  month?: number;
  onNoteClick: (note: HallOfFameNote) => void;
}

export function NoteIconCell({ notes, section, year, month, onNoteClick }: NoteIconCellProps) {
  // Find notes matching this period and section
  const matchingNotes = getNotesForPeriod(notes, section, year, month);

  // No note exists: show spacer for alignment
  if (matchingNotes.length === 0) {
    return <div className="w-8" />;
  }

  // Note exists: show clickable amber icon
  // If multiple notes exist for same period+section (edge case), show first one
  const noteToDisplay = matchingNotes[0];

  return (
    <button
      onClick={() => onNoteClick(noteToDisplay)}
      className="flex items-center justify-center w-8 h-8 rounded hover:bg-amber-100 dark:hover:bg-amber-950 transition-colors"
      aria-label="Visualizza nota"
    >
      <MessageSquare className="h-4 w-4 text-amber-500" />
    </button>
  );
}
