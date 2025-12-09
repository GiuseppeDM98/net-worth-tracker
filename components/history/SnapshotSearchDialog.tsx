'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
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
        color: snapshot.note ? '#F59E0B' : undefined, // Amber if has note
      };
    });

  // Load note when snapshot selected
  useEffect(() => {
    if (selectedSnapshotId) {
      const [year, month] = selectedSnapshotId.split('-').map(Number);
      const snapshot = snapshots.find(
        (s) => s.year === year && s.month === month
      );
      setNoteText(snapshot?.note || '');
    } else {
      setNoteText('');
    }
  }, [selectedSnapshotId, snapshots]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Inserisci o modifica una nota</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Snapshot Selection */}
          <div className="space-y-2">
            <Label htmlFor="snapshot-select">Seleziona uno snapshot</Label>
            <SearchableCombobox
              id="snapshot-select"
              options={snapshotOptions}
              value={selectedSnapshotId}
              onValueChange={setSelectedSnapshotId}
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

        <DialogFooter className="flex justify-between sm:justify-between">
          <div>
            {selectedSnapshot?.note && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={saving || !selectedSnapshot}
              >
                Elimina nota
              </Button>
            )}
          </div>
          <div className="flex gap-2">
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
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
