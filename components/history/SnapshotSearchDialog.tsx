'use client';

/**
 * «Annota un mese» — pick a snapshot, write what happened in it (up to 500 characters). The note
 * becomes a marker on the Evoluzione curve and a row in the Dettaglio's Note tile.
 *
 * A modal at the app's vocabulary (doc/guide/dialog.md): the reading is the status line, so a
 * failed save speaks THERE (`describeWriteError`), never in a toast that names no cause; «Elimina
 * nota» arms itself (`useArmedDelete`: two presses, no timer, Escape disarms) — until 2026-09-20
 * it erased the note on one click, with no undo. A month that already carries a note is marked in
 * the dropdown with the theme's caution token.
 *
 * Snapshot ids in the combobox are `YYYY-M` (`2024-1`): `id.split('-').map(Number)` gives back
 * the year and the month.
 */

import { useRef, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SearchableCombobox, ComboboxOption } from '@/components/ui/searchable-combobox';
import { MonthlySnapshot } from '@/types/assets';
import { armedActionLabel, describeWriteError, type ModalReading } from '@/lib/utils/dialogNarrative';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { toast } from 'sonner';

const MAX_NOTE_LENGTH = 500;

interface SnapshotSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshots: MonthlySnapshot[];
  onSave: (year: number, month: number, note: string) => Promise<void>;
}

/**
 * The destructive action of the footer: the first press arms, the second deletes; the armed label
 * repeats the consequence. One live region announces the arm AND the disarm — emptying a region
 * announces nothing (AGENTS.md → Accessibility).
 */
function ArmedDeleteNoteButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onConfirm);
  const [wasArmed, setWasArmed] = useState(false);
  if (armed && !wasArmed) setWasArmed(true);
  const label = 'Elimina nota';
  return (
    <>
      <Button ref={ref} type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={onClick} onBlur={onBlur} disabled={disabled} aria-pressed={armed}>
        {armed ? armedActionLabel(label) : label}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {armed ? armedActionLabel(label) : wasArmed ? 'Eliminazione annullata' : ''}
      </span>
    </>
  );
}

export function SnapshotSearchDialog({
  open,
  onOpenChange,
  snapshots,
  onSave
}: SnapshotSearchDialogProps) {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  /** The last failed write, in the reader's words; cleared by the next attempt and by a new selection. */
  const [failure, setFailure] = useState<string | null>(null);

  // Convert snapshots to combobox options
  const snapshotOptions: ComboboxOption[] = [...snapshots]
    .sort((a, b) => {
      // Sort by year desc, month desc
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    })
    .map((snapshot) => {
      const dateLabel = format(
        new Date(snapshot.year, snapshot.month - 1),
        'MMMM yyyy',
        { locale: it }
      );
      const amountLabel = new Intl.NumberFormat('it-IT', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(snapshot.totalNetWorth);

      return {
        value: `${snapshot.year}-${snapshot.month}`,
        label: `${dateLabel} - ${amountLabel}`,
        // A month that already carries a note is marked with the theme's caution token — the
        // literal amber it had stayed the same hue on every theme (The Sign-Color Token Rule).
        color: snapshot.note ? 'var(--warning-foreground)' : undefined,
      };
    });

  // The note follows the selection: set together with it, in the handler, not in an effect
  // (react-hooks/set-state-in-effect).
  const handleSelectSnapshot = (id: string) => {
    setSelectedSnapshotId(id);
    setFailure(null);
    if (!id) {
      setNoteText('');
      return;
    }
    const [year, month] = id.split('-').map(Number);
    const snapshot = snapshots.find((s) => s.year === year && s.month === month);
    setNoteText(snapshot?.note || '');
  };

  const selectedSnapshot = (() => {
    if (!selectedSnapshotId) return null;
    const [year, month] = selectedSnapshotId.split('-').map(Number);
    return snapshots.find((s) => s.year === year && s.month === month);
  })();

  const remainingChars = MAX_NOTE_LENGTH - noteText.length;
  const isOverLimit = remainingChars < 0;

  const handleSave = async () => {
    if (!selectedSnapshot || isOverLimit) return;

    setSaving(true);
    setFailure(null);
    try {
      await onSave(selectedSnapshot.year, selectedSnapshot.month, noteText);
      toast.success(noteText.trim() ? 'Nota salvata' : 'Nota eliminata');
      onOpenChange(false);
      setSelectedSnapshotId('');
    } catch (error) {
      console.error('Error saving note:', error);
      setFailure(describeWriteError(error));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSnapshot) return;

    setSaving(true);
    setFailure(null);
    try {
      await onSave(selectedSnapshot.year, selectedSnapshot.month, '');
      toast.success('Nota eliminata');
      onOpenChange(false);
      setSelectedSnapshotId('');
    } catch (error) {
      console.error('Error deleting note:', error);
      setFailure(describeWriteError(error));
    } finally {
      setSaving(false);
    }
  };

  // The reading IS the status line: a refusal takes its place and its negative tone.
  const reading: ModalReading | string = failure
    ? { narrative: [{ text: failure }], tone: 'negative' }
    : selectedSnapshot
      ? 'La nota compare come marcatore sulla curva del patrimonio e nel Dettaglio.'
      : 'Scegli il mese: la nota comparirà come marcatore sulla sua curva.';

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow="Storico · Note"
      title="Annota un mese"
      reading={reading}
      width="md"
      footer={
        <>
          {selectedSnapshot?.note && <ArmedDeleteNoteButton disabled={saving} onConfirm={handleDelete} />}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setSelectedSnapshotId('');
            }}
            disabled={saving}
          >
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !selectedSnapshot || isOverLimit}
          >
            {saving ? 'Salvataggio…' : 'Salva'}
          </Button>
        </>
      }
    >
        <div className="space-y-4">
          {/* Snapshot Selection */}
          <div className="space-y-2">
            <Label htmlFor="snapshot-select">Mese</Label>
            <SearchableCombobox
              id="snapshot-select"
              options={snapshotOptions}
              value={selectedSnapshotId}
              onValueChange={handleSelectSnapshot}
              placeholder="Cerca per mese o anno"
              searchPlaceholder="Es. marzo 2024"
              emptyMessage="Nessuno snapshot trovato"
              showBadge={false}
            />
          </div>

          {/* Note Textarea (only if snapshot selected) */}
          {selectedSnapshot && (
            <div className="space-y-2">
              <Label htmlFor="note">Nota</Label>
              <Textarea
                id="note"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Es. acquisto dell'auto, bonus, eredità ricevuta"
                rows={4}
                aria-describedby="note-remaining"
                aria-invalid={isOverLimit}
                className={isOverLimit ? 'border-destructive' : ''}
              />
              {/* The caution is the theme's token (`text-orange-500` kept one hue on twelve themes), the count in mono. */}
              <p id="note-remaining" className={cn('text-right text-xs', isOverLimit ? 'text-destructive' : remainingChars < 50 ? 'text-warning-foreground' : 'text-muted-foreground')}>
                <span className="font-mono tabular-nums">{remainingChars}</span> caratteri rimanenti
              </p>
            </div>
          )}
        </div>
    </ResponsiveModal>
  );
}
