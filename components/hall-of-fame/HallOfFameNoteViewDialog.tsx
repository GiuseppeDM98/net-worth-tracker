'use client';

/**
 * HallOfFameNoteViewDialog Component
 *
 * Read-only dialog for viewing Hall of Fame note content
 *
 * PURPOSE:
 * Displays note details when user clicks the amber note icon in ranking tables.
 * Provides a clear separation between viewing and editing notes - users can read
 * the note first before deciding to modify it via the "Modifica Nota" button.
 *
 * FEATURES:
 * - Period display: Format year/month appropriately (monthly vs yearly notes)
 * - Section grouping: Group associated sections by type (Monthly/Yearly)
 * - Scrollable content: Handle long notes (up to 500 chars) without overflow
 * - Edit transition: Footer button to open edit dialog with same note
 *
 * UX FLOW:
 * 1. User clicks note icon → this dialog opens (read-only)
 * 2. User reads note content and metadata
 * 3a. User clicks "Chiudi" → dialog closes
 * 3b. User clicks "Modifica Nota" → triggers onEditClick → edit dialog opens
 *
 * DESIGN PATTERN:
 * Follows DividendDetailsDialog.tsx (read-only content structure) and
 * AIAnalysisDialog.tsx (footer button pattern for actions)
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HallOfFameNote, HallOfFameSectionKey } from '@/types/hall-of-fame';

// Section labels in Italian (user-friendly display names)
// NOTE: Duplicated from HallOfFameNoteDialog.tsx for component isolation
// Could be extracted to shared constants file, but KISS principle applies for now
const SECTION_LABELS: Record<HallOfFameSectionKey, string> = {
  bestMonthsByNetWorthGrowth: 'Miglior Mese: Differenza NW',
  bestMonthsByIncome: 'Miglior Mese: Entrate',
  worstMonthsByNetWorthDecline: 'Peggior Mese: Differenza NW',
  worstMonthsByExpenses: 'Peggior Mese: Spese',
  bestYearsByNetWorthGrowth: 'Miglior Anno: Differenza NW',
  bestYearsByIncome: 'Miglior Anno: Entrate',
  worstYearsByNetWorthDecline: 'Peggior Anno: Differenza NW',
  worstYearsByExpenses: 'Peggior Anno: Spese',
};

// Group sections by type (monthly vs yearly)
const MONTHLY_SECTIONS: HallOfFameSectionKey[] = [
  'bestMonthsByNetWorthGrowth',
  'bestMonthsByIncome',
  'worstMonthsByNetWorthDecline',
  'worstMonthsByExpenses',
];

const YEARLY_SECTIONS: HallOfFameSectionKey[] = [
  'bestYearsByNetWorthGrowth',
  'bestYearsByIncome',
  'worstYearsByNetWorthDecline',
  'worstYearsByExpenses',
];

// Italian month names (1-indexed: month 1 = Gennaio)
const ITALIAN_MONTHS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

interface HallOfFameNoteViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: HallOfFameNote | null;
  onEditClick: () => void; // Triggers transition to edit mode
}

export function HallOfFameNoteViewDialog({
  open,
  onOpenChange,
  note,
  onEditClick,
}: HallOfFameNoteViewDialogProps) {
  // Early return if no note provided (defensive programming)
  if (!note) {
    return null;
  }

  // Format period display
  // Monthly note: "Gennaio 2025"
  // Yearly note: "Anno 2025"
  const periodText = note.month
    ? `${ITALIAN_MONTHS[note.month - 1]} ${note.year}`
    : `Anno ${note.year}`;

  // Group sections by type for clearer display
  // Filters out sections that don't belong to each group (defensive)
  const monthlySections = note.sections.filter((s) =>
    MONTHLY_SECTIONS.includes(s)
  );
  const yearlySections = note.sections.filter((s) =>
    YEARLY_SECTIONS.includes(s)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Visualizza Nota</DialogTitle>
        </DialogHeader>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {/* Period */}
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">Periodo:</p>
            <p className="text-base">{periodText}</p>
          </div>

          {/* Associated sections (grouped by type) */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Sezioni Associate:
            </p>

            {/* Monthly sections group */}
            {monthlySections.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Ranking Mensili:
                </p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  {monthlySections.map((section) => (
                    <li key={section} className="text-sm">
                      {SECTION_LABELS[section]}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Yearly sections group */}
            {yearlySections.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Ranking Annuali:
                </p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  {yearlySections.map((section) => (
                    <li key={section} className="text-sm">
                      {SECTION_LABELS[section]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Note text (scrollable for long notes) */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Nota:</p>
            <div className="max-h-[300px] overflow-y-auto border border-border rounded-lg p-3 bg-muted/50">
              <p className="text-base whitespace-pre-wrap">{note.text}</p>
            </div>
          </div>
        </div>

        {/* Footer with action buttons */}
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onEditClick}>
            Modifica Nota
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
