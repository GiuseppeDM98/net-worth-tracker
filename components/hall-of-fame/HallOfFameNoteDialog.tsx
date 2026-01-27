'use client';

/**
 * HallOfFameNoteDialog Component
 *
 * Create/edit notes for Hall of Fame periods with multi-section support
 *
 * Features:
 * - Period selection: Year + optional month combobox (similar to SnapshotSearchDialog)
 * - Multi-section checkboxes: Select which ranking tables should show this note
 * - Text editor: 500 character max with real-time counter
 * - Edit mode: Pre-populate when editing existing note
 * - Delete button: Only shown when editing existing note
 *
 * UX Flow:
 * 1. User selects year (always required)
 * 2. User selects month (auto-hides for yearly sections, optional for monthly)
 * 3. User checks relevant sections (at least 1 required)
 * 4. User enters note text (max 500 chars)
 * 5. Save → validates → calls service → shows toast → closes dialog
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { HallOfFameNote, HallOfFameSectionKey } from '@/types/hall-of-fame';
import { getItalyYear } from '@/lib/utils/dateHelpers';

const MAX_NOTE_LENGTH = 500;

// Section labels in Italian (user-friendly display names)
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

// Italian month names
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

interface HallOfFameNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  editNote?: HallOfFameNote | null; // If provided, dialog is in edit mode
  availableYears: number[]; // Years that have data (from rankings)
  onSave: (noteData: {
    id?: string; // Present if editing
    text: string;
    sections: HallOfFameSectionKey[];
    year: number;
    month?: number;
  }) => Promise<void>;
  onDelete?: (noteId: string) => Promise<void>;
}

export function HallOfFameNoteDialog({
  open,
  onOpenChange,
  userId,
  editNote,
  availableYears,
  onSave,
  onDelete,
}: HallOfFameNoteDialogProps) {
  // Form state
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedSections, setSelectedSections] = useState<Set<HallOfFameSectionKey>>(new Set());
  const [saving, setSaving] = useState(false);

  // Initialize form when editing or opening
  useEffect(() => {
    if (open) {
      if (editNote) {
        // Edit mode: pre-populate form
        setSelectedYear(editNote.year);
        setSelectedMonth(editNote.month || null);
        setNoteText(editNote.text);
        setSelectedSections(new Set(editNote.sections));
      } else {
        // Create mode: reset to defaults
        const currentYear = getItalyYear();
        setSelectedYear(availableYears.includes(currentYear) ? currentYear : availableYears[0] || null);
        setSelectedMonth(null);
        setNoteText('');
        setSelectedSections(new Set());
      }
    }
  }, [open, editNote, availableYears]);

  // Determine if month is required based on selected sections
  const monthRequired = useMemo(() => {
    return Array.from(selectedSections).some((section) => MONTHLY_SECTIONS.includes(section));
  }, [selectedSections]);

  // Determine if month should be hidden (only yearly sections selected)
  const monthHidden = useMemo(() => {
    const hasMonthly = Array.from(selectedSections).some((section) =>
      MONTHLY_SECTIONS.includes(section)
    );
    const hasYearly = Array.from(selectedSections).some((section) =>
      YEARLY_SECTIONS.includes(section)
    );
    return hasYearly && !hasMonthly && selectedSections.size > 0;
  }, [selectedSections]);

  // Character count
  const remainingChars = MAX_NOTE_LENGTH - noteText.length;
  const isOverLimit = remainingChars < 0;

  // Validation
  const canSave =
    selectedYear !== null &&
    (!monthRequired || selectedMonth !== null) &&
    noteText.trim().length > 0 &&
    !isOverLimit &&
    selectedSections.size > 0;

  // Toggle section checkbox
  const toggleSection = (section: HallOfFameSectionKey) => {
    const newSections = new Set(selectedSections);
    if (newSections.has(section)) {
      newSections.delete(section);
    } else {
      newSections.add(section);
    }
    setSelectedSections(newSections);
  };

  const handleSave = async () => {
    if (!canSave || selectedYear === null) return;

    setSaving(true);
    try {
      await onSave({
        id: editNote?.id,
        text: noteText.trim(),
        sections: Array.from(selectedSections),
        year: selectedYear,
        month: monthRequired ? selectedMonth || undefined : undefined,
      });

      toast.success(editNote ? 'Nota aggiornata' : 'Nota creata');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Errore nel salvataggio della nota');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editNote || !onDelete) return;

    setSaving(true);
    try {
      await onDelete(editNote.id);
      toast.success('Nota eliminata');
      onOpenChange(false);
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error("Errore nell'eliminazione della nota");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editNote ? 'Modifica Nota Hall of Fame' : 'Aggiungi Nota Hall of Fame'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Period Selection */}
          <div className="grid grid-cols-2 gap-4">
            {/* Year Selection */}
            <div className="space-y-2">
              <Label htmlFor="year-select">Anno *</Label>
              <Select
                value={selectedYear?.toString() || ''}
                onValueChange={(value) => setSelectedYear(Number(value))}
              >
                <SelectTrigger id="year-select">
                  <SelectValue placeholder="Seleziona anno" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Month Selection (conditional) */}
            {!monthHidden && (
              <div className="space-y-2">
                <Label htmlFor="month-select">Mese {monthRequired ? '*' : '(opzionale)'}</Label>
                <Select
                  value={selectedMonth?.toString() || undefined}
                  onValueChange={(value) => setSelectedMonth(value ? Number(value) : null)}
                >
                  <SelectTrigger id="month-select">
                    <SelectValue placeholder="Seleziona mese" />
                  </SelectTrigger>
                  <SelectContent>
                    {ITALIAN_MONTHS.map((month, idx) => (
                      <SelectItem key={idx + 1} value={(idx + 1).toString()}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Section Selection */}
          <div className="space-y-3">
            <Label>Sezioni * (seleziona almeno una)</Label>

            {/* Monthly Sections */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Ranking Mensili</p>
              <div className="grid grid-cols-1 gap-2 ml-4">
                {MONTHLY_SECTIONS.map((section) => (
                  <div key={section} className="flex items-center space-x-2">
                    <Checkbox
                      id={section}
                      checked={selectedSections.has(section)}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <label
                      htmlFor={section}
                      className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {SECTION_LABELS[section]}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Yearly Sections */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Ranking Annuali</p>
              <div className="grid grid-cols-1 gap-2 ml-4">
                {YEARLY_SECTIONS.map((section) => (
                  <div key={section} className="flex items-center space-x-2">
                    <Checkbox
                      id={section}
                      checked={selectedSections.has(section)}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <label
                      htmlFor={section}
                      className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      {SECTION_LABELS[section]}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Note Text */}
          <div className="space-y-2">
            <Label htmlFor="note-text">Nota *</Label>
            <Textarea
              id="note-text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Es: Acquisto auto - €22.000, Bonus lavorativo, Spese mediche straordinarie..."
              rows={4}
              className={isOverLimit ? 'border-destructive' : ''}
            />
            <p
              className={`text-xs text-right ${
                isOverLimit
                  ? 'text-destructive'
                  : remainingChars < 50
                  ? 'text-orange-500'
                  : 'text-muted-foreground'
              }`}
            >
              {remainingChars} caratteri rimanenti
            </p>
          </div>

          {/* Validation hint */}
          {!canSave && selectedSections.size === 0 && (
            <p className="text-sm text-amber-600">
              Seleziona almeno una sezione dove mostrare questa nota
            </p>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {editNote && onDelete && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving}>
                Elimina
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Annulla
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
              {saving ? 'Salvataggio...' : 'Salva'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
