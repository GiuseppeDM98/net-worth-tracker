'use client';

/**
 * HallOfFameNoteDialog — create/edit notes for Hall of Fame periods.
 *
 * Features:
 * - Period selection: year + optional month
 * - Multi-section checkboxes: select which ranking tables show this note
 * - Text editor: 500 character max with real-time counter
 * - Edit mode: pre-populate when editing existing note
 * - Delete button: 2-click inline confirmation without a timer (`useArmedDelete`)
 */

import type { CSSProperties, RefObject } from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
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
  }, [open, editNote, availableYears]);

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

  /** The confirmed delete. Arming it is `useArmedDelete`'s job — no timer (WCAG 2.2.1). */
  function performDelete() {
    if (!editNote || !onDelete) return;
    setSaving(true);
    onDelete(editNote.id)
      .then(() => { toast.success('Nota eliminata'); onOpenChange(false); })
      .catch((err) => { console.error('Error deleting note:', err); toast.error("Errore nell'eliminazione della nota"); })
      .finally(() => setSaving(false));
  }

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow="Hall of Fame · Note"
      title={editNote ? 'Modifica la nota' : 'Aggiungi una nota'}
      reading={
        selectedSections.size === 0
          ? 'Scegli il periodo e almeno una classifica: la nota compare accanto ai record che scegli.'
          : `La nota comparirà su ${selectedSections.size === 1 ? 'una classifica' : `${selectedSections.size} classifiche`} di questo periodo.`
      }
      width="lg"
      contentRef={dialogRef}
      triggerOrigin={style?.transformOrigin as string | undefined}
      footer={
        <>
          {editNote && onDelete && (
            <ArmedNoteDelete disabled={saving} onConfirm={performDelete} />
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </>
      }
    >

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
                  ? 'text-warning-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {remainingChars} caratteri rimanenti
            </p>
          </div>

        </div>
    </ResponsiveModal>
  );
}

/** The note's delete: two clicks, no timer, Escape disarms. */
function ArmedNoteDelete({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onConfirm);
  const [wasArmed, setWasArmed] = useState(false);
  if (armed && !wasArmed) setWasArmed(true);

  return (
    <>
      <Button
        ref={ref}
        type="button"
        variant={armed ? 'destructive' : 'outline'}
        className={cn(!armed && 'text-destructive hover:text-destructive')}
        onClick={onClick}
        onBlur={onBlur}
        disabled={disabled}
        aria-pressed={armed}
        aria-label={armed ? 'Premi di nuovo per eliminare la nota' : 'Elimina la nota'}
      >
        {armed ? 'Premi di nuovo per eliminare' : 'Elimina'}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {armed ? 'Premi di nuovo per eliminare la nota' : wasArmed ? 'Eliminazione annullata' : ''}
      </span>
    </>
  );
}
