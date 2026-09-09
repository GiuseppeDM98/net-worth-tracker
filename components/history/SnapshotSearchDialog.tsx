'use client';

/**
 * SnapshotSearchDialog Component
 *
 * Dialog for searching snapshots and adding/editing notes for financial events.
 *
 * Features:
 * - Searchable Snapshot Dropdown: Find snapshots by date/amount
 * - Note Management: Add/edit notes up to 500 characters with visual feedback
 * - Character Counter: Color-coded remaining characters (warning at 50 remaining)
 * - Amber Highlighting: Snapshots with existing notes highlighted in dropdown
 * - Formatted Display: Italian date format (MMMM yyyy) with currency formatting
 *
 * Note Use Cases:
 * - Document significant financial events (bonus received, large purchase)
 * - Explain anomalies in net worth (market crash, inheritance)
 * - Track milestones (reached savings goal, paid off debt)
 *
 * Teacher Comment: Snapshot ID Format
 * Snapshot IDs use format "YYYY-MM" (e.g., "2024-01" for January 2024).
 * To extract year/month: const [year, month] = id.split('-').map(Number);
 *
 * @param open - Controls dialog visibility
 * @param onOpenChange - Callback when dialog open state changes
 * @param snapshots - Array of snapshots to choose from
 * @param onSave - Async callback with year, month, note to save to database
 */

import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SearchableCombobox, ComboboxOption } from '@/components/ui/searchable-combobox';
import { MonthlySnapshot } from '@/types/assets';
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

export function SnapshotSearchDialog({
  open,
  onOpenChange,
  snapshots,
  onSave
}: SnapshotSearchDialogProps) {
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

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
    try {
      await onSave(selectedSnapshot.year, selectedSnapshot.month, noteText);
      toast.success(noteText.trim() ? 'Nota salvata' : 'Nota eliminata');
      onOpenChange(false);
      setSelectedSnapshotId('');
    } catch (error) {
      console.error('Error saving note:', error);
      toast.error('Errore nel salvataggio della nota');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedSnapshot) return;

    setSaving(true);
    try {
      await onSave(selectedSnapshot.year, selectedSnapshot.month, '');
      toast.success('Nota eliminata');
      onOpenChange(false);
      setSelectedSnapshotId('');
    } catch (error) {
      console.error('Error deleting note:', error);
      toast.error("Errore nell'eliminazione della nota");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow="Storico · Note"
      title="Annota un mese"
      reading={
        selectedSnapshot
          ? 'La nota compare come marcatore sulla curva del patrimonio e nel Dettaglio.'
          : 'Scegli il mese: la nota comparirà come marcatore sulla sua curva.'
      }
      width="md"
      footer={
        <>
          {selectedSnapshot?.note && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={saving || !selectedSnapshot}
            >
              Elimina nota
            </Button>
          )}
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
            {saving ? 'Salvataggio...' : 'Salva'}
          </Button>
        </>
      }
    >
        <div className="space-y-4">
          {/* Snapshot Selection */}
          <div className="space-y-2">
            <Label htmlFor="snapshot-select">Seleziona uno snapshot</Label>
            <SearchableCombobox
              id="snapshot-select"
              options={snapshotOptions}
              value={selectedSnapshotId}
              onValueChange={handleSelectSnapshot}
              placeholder="Cerca per mese/anno..."
              searchPlaceholder="Es: Marzo 2024"
              emptyMessage="Nessuno snapshot trovato"
              showBadge={false}
            />
          </div>

          {/* Note Textarea (only if snapshot selected) */}
          {selectedSnapshot && (
            <div className="space-y-2">
              <Label htmlFor="note">Nota evento finanziario</Label>
              <Textarea
                id="note"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Es: Acquisto auto - €22.000, Bonus lavorativo, Eredità ricevuta..."
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
          )}
        </div>
    </ResponsiveModal>
  );
}
