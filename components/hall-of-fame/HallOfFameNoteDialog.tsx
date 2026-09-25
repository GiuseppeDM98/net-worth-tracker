'use client';

/**
 * HallOfFameNoteDialog — create or edit a note on a Hall of Fame period.
 *
 * A note is filed on a period (year + optional month) and on one or more rankings, and it is
 * read from the rows of those rankings. The form therefore asks three things — when, where,
 * what — and since 2026-09-24 it can arrive with the first two already written: a row of a
 * ranking opens it with its own period and section (`prefill`), so the checkboxes are a
 * confirmation, not a search through ten options for the ranking the reader just left.
 *
 * On `ResponsiveModal` (eyebrow · title · reading · body · footer): the reading is the status
 * line, and it says when the period chosen sits in none of the rankings chosen — the note is
 * kept, in the Note tile, but no row will show it. Delete arms in the footer (`useArmedDelete`,
 * no timer). A failed write speaks `describeWriteError`, never the SDK.
 */

import { useState, useMemo, useRef, type RefObject } from 'react';
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
import { SECTION_SUBJECTS, MONTHLY_SECTION_KEYS, YEARLY_SECTION_KEYS } from '@/lib/constants/hallOfFame';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { describeNoteFormReading } from '@/lib/utils/hallOfFameNarrative';
import type { NotePrefill } from '@/components/hall-of-fame/NoteTrigger';

const MAX_NOTE_LENGTH = 500;

interface HallOfFameNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editNote?: HallOfFameNote | null;
  /** The period and ranking of the row that opened the form; ignored when editing. */
  prefill?: NotePrefill | null;
  availableYears: number[];
  /** Whether a ranking holds a period — the reading says when none of the chosen ones does. */
  isPeriodRanked?: (section: HallOfFameSectionKey, year: number, month?: number) => boolean;
  onSave: (noteData: {
    id?: string;
    text: string;
    sections: HallOfFameSectionKey[];
    year: number;
    month?: number;
  }) => Promise<void>;
  onDelete?: (noteId: string) => Promise<void>;
  /** Where the window grows from — `resolveCenteredModalOrigin` of the control that opened it. */
  triggerOrigin?: string;
  /** The control that opened the window, to give the focus back to on close (doc/guide/dialog.md). */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

export function HallOfFameNoteDialog({
  open,
  onOpenChange,
  editNote,
  prefill,
  availableYears,
  isPeriodRanked,
  onSave,
  onDelete,
  triggerOrigin,
  returnFocusTo,
}: HallOfFameNoteDialogProps) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [selectedSections, setSelectedSections] = useState<Set<HallOfFameSectionKey>>(new Set());
  const [saving, setSaving] = useState(false);

  // Seed the form on open — and whenever the note, the prefill or the years change while open —
  // during render (React's adjust-state-during-render) rather than in an effect (react-hooks/
  // set-state-in-effect): the seeded form is the one painted, never the previous draft for a frame.
  const [seededFor, setSeededFor] = useState<{
    open: boolean;
    editNote: typeof editNote;
    prefill: typeof prefill;
    availableYears: number[] | null;
  }>({ open: false, editNote: undefined, prefill: undefined, availableYears: null });
  if (
    seededFor.open !== open ||
    seededFor.editNote !== editNote ||
    seededFor.prefill !== prefill ||
    seededFor.availableYears !== availableYears
  ) {
    setSeededFor({ open, editNote, prefill, availableYears });
    if (open) {
      if (editNote) {
        setSelectedYear(editNote.year);
        setSelectedMonth(editNote.month ?? null);
        setNoteText(editNote.text);
        setSelectedSections(new Set(editNote.sections));
      } else if (prefill) {
        setSelectedYear(prefill.year);
        setSelectedMonth(prefill.month ?? null);
        setNoteText('');
        setSelectedSections(new Set([prefill.section]));
      } else {
        const currentYear = getItalyYear();
        setSelectedYear(availableYears.includes(currentYear) ? currentYear : (availableYears[0] ?? null));
        setSelectedMonth(null);
        setNoteText('');
        setSelectedSections(new Set());
      }
    }
  }

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

  // Null while the period is still incomplete: nothing to check yet, nothing to claim.
  const periodComplete = selectedYear !== null && (!monthRequired || selectedMonth !== null);
  const isRanked =
    !isPeriodRanked || !periodComplete || selectedSections.size === 0
      ? null
      : Array.from(selectedSections).some((section) =>
          isPeriodRanked(section, selectedYear, MONTHLY_SECTION_KEYS.includes(section) ? (selectedMonth ?? undefined) : undefined),
        );
  const reading = describeNoteFormReading({ sectionCount: selectedSections.size, isRanked });

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
      toast.success(editNote ? 'Nota aggiornata.' : 'Nota salvata.');
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error(describeWriteError(error));
    } finally {
      setSaving(false);
    }
  }

  /** The confirmed delete. Arming it is `useArmedDelete`'s job — no timer (WCAG 2.2.1). */
  function performDelete() {
    if (!editNote || !onDelete) return;
    setSaving(true);
    onDelete(editNote.id)
      .then(() => { toast.success('Nota eliminata.'); onOpenChange(false); })
      .catch((err) => { console.error('Error deleting note:', err); toast.error(describeWriteError(err)); })
      .finally(() => setSaving(false));
  }

  const renderSections = (keys: HallOfFameSectionKey[], legend: string) => (
    <fieldset className="min-w-0">
      <legend className="text-[13px] font-medium text-foreground">{legend}</legend>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {keys.map((section) => (
          // The whole row is the target: 32px on a pointer, 44px on touch — the 16px box alone was
          // the only thing a thumb could hit (measured 2026-09-24).
          <label
            key={section}
            htmlFor={section}
            className="flex min-h-8 cursor-pointer items-center gap-3 rounded-md px-1 text-sm hover:bg-muted/60 [@media(pointer:coarse)]:min-h-11"
          >
            <Checkbox
              id={section}
              checked={selectedSections.has(section)}
              onCheckedChange={() => toggleSection(section)}
            />
            <span>{SECTION_SUBJECTS[section]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow="Hall of Fame · Note"
      title={editNote ? 'Modifica la nota' : 'Aggiungi una nota'}
      reading={reading}
      width="lg"
      triggerOrigin={triggerOrigin}
      returnFocusTo={returnFocusTo}
      footer={
        <>
          {editNote && onDelete && (
            <ArmedNoteDelete disabled={saving} onConfirm={performDelete} />
          )}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button type="button" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Salvataggio…' : 'Salva'}
          </Button>
        </>
      }
    >
        <div className="space-y-6 py-4">
          {/* The period */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <Label htmlFor="month-select">
                  Mese {monthRequired ? '*' : <span className="font-normal text-muted-foreground">(opzionale)</span>}
                </Label>
                {/* `''` and never `undefined`: a prefilled month would flip the Select from
                    uncontrolled to controlled (React warns, and the placeholder can stick). */}
                <Select
                  value={selectedMonth?.toString() ?? ''}
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

          {/* The rankings the note hangs on — the tiles' own names, grouped by period */}
          <div className="space-y-3">
            <p className="text-sm font-medium leading-none">Classifiche *</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderSections(MONTHLY_SECTION_KEYS, 'Mensili')}
              {renderSections(YEARLY_SECTION_KEYS, 'Annuali')}
            </div>
          </div>

          {/* The note */}
          <div className="space-y-2">
            <Label htmlFor="note-text">Nota *</Label>
            <Textarea
              id="note-text"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Cosa è successo in quel periodo: un bonus, una spesa straordinaria, una vendita"
              rows={4}
              className={isOverLimit ? 'border-destructive' : ''}
            />
            <p
              className={cn(
                'text-right font-mono text-xs tabular-nums',
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
