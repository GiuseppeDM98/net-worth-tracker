'use client';

/**
 * HallOfFameNoteDialog — create/edit notes for Hall of Fame periods.
 *
 * Features:
 * - Period selection: year + optional month
 * - Multi-section checkboxes: select which ranking tables show this note
 * - Text editor: 500 character max with real-time counter
 * - Edit mode: pre-populate when editing existing note
 * - Delete button: 2-click inline confirmation with 3s auto-disarm
 */

import type { CSSProperties, RefObject } from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { HallOfFameNote, HallOfFameSectionKey } from '@/types/hall-of-fame';
import { MONTH_NAMES } from '@/lib/constants/months';
import { SECTION_LABELS, MONTHLY_SECTION_KEYS, YEARLY_SECTION_KEYS } from '@/lib/constants/hallOfFame';
import { getItalyYear } from '@/lib/utils/dateHelpers';

const MAX_NOTE_LENGTH = 500;

interface HallOfFameNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editNote?: HallOfFameNote | null;
  availableYears: number[];
  onSave: (noteData: {
    id?: string;
    text: string;
    sections: HallOfFameSectionKey[];
    year: number;
    month?: number;
  }) => Promise<void>;
  onDelete?: (noteId: string) => Promise<void>;
  dialogRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
}

export function HallOfFameNoteDialog({
  open,
  onOpenChange,
  editNote,
  availableYears,
  onSave,
  onDelete,
  dialogRef,
  style,
}: HallOfFameNoteDialogProps) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedSections, setSelectedSections] = useState<Set<HallOfFameSectionKey>>(new Set());
  const [saving, setSaving] = useState(false);

  // 2-click inline delete state
  const [pendingDelete, setPendingDelete] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;

    if (editNote) {
      setSelectedYear(editNote.year);
      setSelectedMonth(editNote.month ?? null);
      setNoteText(editNote.text);
      setSelectedSections(new Set(editNote.sections));
    } else {
      const currentYear = getItalyYear();
      setSelectedYear(availableYears.includes(currentYear) ? currentYear : (availableYears[0] ?? null));
      setSelectedMonth(null);
      setNoteText('');
      setSelectedSections(new Set());
    }

    // Reset delete state when dialog reopens
    setPendingDelete(false);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
  }, [open, editNote, availableYears]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => { if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current); };
  }, []);

  const monthRequired = useMemo(
    () => Array.from(selectedSections).some((s) => MONTHLY_SECTION_KEYS.includes(s)),
    [selectedSections]
  );

  const monthHidden = useMemo(() => {
    const hasMonthly = Array.from(selectedSections).some((s) => MONTHLY_SECTION_KEYS.includes(s));
    const hasYearly = Array.from(selectedSections).some((s) => YEARLY_SECTION_KEYS.includes(s));
    return hasYearly && !hasMonthly && selectedSections.size > 0;
  }, [selectedSections]);

  const remainingChars = MAX_NOTE_LENGTH - noteText.length;
  const isOverLimit = remainingChars < 0;

  const canSave =
    selectedYear !== null &&
    (!monthRequired || selectedMonth !== null) &&
    noteText.trim().length > 0 &&
    !isOverLimit &&
    selectedSections.size > 0;

  function toggleSection(section: HallOfFameSectionKey) {
    const next = new Set(selectedSections);
    if (next.has(section)) next.delete(section); else next.add(section);
    setSelectedSections(next);
  }

  async function handleSave() {
    if (!canSave || selectedYear === null) return;
    setSaving(true);
    try {
      await onSave({
        id: editNote?.id,
        text: noteText.trim(),
        sections: Array.from(selectedSections),
        year: selectedYear,
        month: monthRequired ? (selectedMonth ?? undefined) : undefined,
      });
      toast.success(editNote ? 'Nota aggiornata' : 'Nota creata');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Errore nel salvataggio della nota');
    } finally {
      setSaving(false);
    }
  }

  // First click arms; second click within 3s confirms
  function handleDeleteClick() {
    if (!editNote || !onDelete) return;

    if (!pendingDelete) {
      setPendingDelete(true);
      deleteTimerRef.current = setTimeout(() => setPendingDelete(false), 3000);
      return;
    }

    // Second click — confirmed
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    setPendingDelete(false);
    setSaving(true);
    onDelete(editNote.id)
      .then(() => { toast.success('Nota eliminata'); onOpenChange(false); })
      .catch((err) => { console.error('Error deleting note:', err); toast.error("Errore nell'eliminazione della nota"); })
      .finally(() => setSaving(false));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={dialogRef}
        style={style}
        className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {editNote ? 'Modifica Nota Hall of Fame' : 'Aggiungi Nota Hall of Fame'}
          </DialogTitle>
          <DialogDescription>
            {editNote
              ? 'Modifica il testo o le sezioni associate a questa nota.'
              : 'Aggiungi un commento contestuale per un periodo specifico.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Period Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year-select">Anno *</Label>
              <Select
                value={selectedYear?.toString() ?? ''}
                onValueChange={(value) => setSelectedYear(Number(value))}
              >
                <SelectTrigger id="year-select">
                  <SelectValue placeholder="Seleziona anno" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!monthHidden && (
              <div className="space-y-2">
                <Label htmlFor="month-select">Mese {monthRequired ? '*' : '(opzionale)'}</Label>
                <Select
                  value={selectedMonth?.toString() ?? undefined}
                  onValueChange={(value) => setSelectedMonth(value ? Number(value) : null)}
                >
                  <SelectTrigger id="month-select">
                    <SelectValue placeholder="Seleziona mese" />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((month, idx) => (
                      <SelectItem key={idx + 1} value={(idx + 1).toString()}>{month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Section Selection */}
          <div className="space-y-3">
            <Label>Sezioni * (seleziona almeno una)</Label>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Ranking Mensili</p>
              <div className="grid grid-cols-1 gap-2 ml-4">
                {MONTHLY_SECTION_KEYS.map((section) => (
                  <div key={section} className="flex items-center space-x-2">
                    <Checkbox
                      id={section}
                      checked={selectedSections.has(section)}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <label htmlFor={section} className="text-sm font-normal leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      {SECTION_LABELS[section]}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Ranking Annuali</p>
              <div className="grid grid-cols-1 gap-2 ml-4">
                {YEARLY_SECTION_KEYS.map((section) => (
                  <div key={section} className="flex items-center space-x-2">
                    <Checkbox
                      id={section}
                      checked={selectedSections.has(section)}
                      onCheckedChange={() => toggleSection(section)}
                    />
                    <label htmlFor={section} className="text-sm font-normal leading-none cursor-pointer peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
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
              placeholder="Es: Acquisto auto - 22.000 euro, Bonus lavorativo, Spese mediche straordinarie..."
              rows={4}
              className={isOverLimit ? 'border-destructive' : ''}
            />
            <p
              className={cn(
                'text-xs text-right',
                isOverLimit
                  ? 'text-destructive'
                  : remainingChars < 50
                  ? 'text-amber-500 dark:text-amber-400'
                  : 'text-muted-foreground'
              )}
            >
              {remainingChars} caratteri rimanenti
            </p>
          </div>

          {!canSave && selectedSections.size === 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Seleziona almeno una sezione dove mostrare questa nota
            </p>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {editNote && onDelete && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteClick}
                disabled={saving}
              >
                {pendingDelete ? 'Conferma eliminazione' : 'Elimina'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
