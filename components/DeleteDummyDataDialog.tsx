/**
 * Confirmation dialog for deleting all dummy/test data
 *
 * Flow:
 * 1. Load counts (snapshots, expenses, categories) on dialog open
 * 2. Display summary to user
 * 3. Delete all three types in parallel if confirmed (Promise.all)
 * 4. Trigger callback to refresh parent UI
 *
 * Safety: Shows counts before deletion to prevent accidental data loss
 * Parallel Execution: 3x faster than sequential deletion
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Button } from '@/components/ui/button';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import {
  armedActionLabel,
  describeDummyDataReading,
  describeModalStatus,
  describeWriteError,
  pluralize,
  type ModalStatus,
} from '@/lib/utils/dialogNarrative';
import { getDummyDataCount, deleteAllDummyData, type DummyDataCount } from '@/lib/services/dummyDataService';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface DeleteDummyDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onDeleted?: () => void; // Callback after successful deletion
}

export function DeleteDummyDataDialog({
  open,
  onOpenChange,
  userId,
  onDeleted,
}: DeleteDummyDataDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [dataCount, setDataCount] = useState<DummyDataCount | null>(null);
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });

  // Load count when dialog opens
  useEffect(() => {
    if (open) {
      loadDataCount();
    }
  }, [open, userId]);

  const loadDataCount = async () => {
    setIsLoading(true);
    try {
      const count = await getDummyDataCount(userId);
      setDataCount(count);
    } catch (error) {
      console.error('Error loading dummy data count:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!dataCount || dataCount.total === 0) return;

    setIsDeleting(true);

    try {
      const result = await deleteAllDummyData(userId);

      toast.success(
        `Eliminati con successo: ${result.snapshots} snapshot, ${result.expenses} spese, ${result.categories} categorie (${result.total} totali)`
      );

      onOpenChange(false);

      // Call the callback to refresh data
      if (onDeleted) {
        onDeleted();
      }
    } catch (error) {
      console.error('Error deleting dummy data:', error);
      setStatus({ phase: 'error', message: describeWriteError(error) });
    } finally {
      setIsDeleting(false);
    }
  };


  const reading = describeModalStatus(
    isDeleting ? { phase: 'submitting' } : status,
    {
      idle: isLoading
        ? [{ text: 'Sto contando i dati di test.' }]
        : dataCount
          ? describeDummyDataReading(dataCount)
          : [{ text: 'Sto contando i dati di test.' }],
      submitting: 'Sto eliminando i dati di test.',
    },
  );

  const total = dataCount?.total ?? 0;

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow="Impostazioni · Dati di test"
      title="Elimina i dati di test"
      reading={reading}
      width="sm"
      footerNote={total > 0 ? 'Esc annulla la conferma' : undefined}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            {total === 0 ? 'Chiudi' : 'Annulla'}
          </Button>
          {total > 0 && (
            <ArmedDeleteAll
              label={`Elimina ${pluralize(total, 'elemento', 'elementi')}`}
              disabled={isLoading || isDeleting}
              onConfirm={handleDelete}
            />
          )}
        </>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : dataCount && dataCount.total > 0 ? (
        <div className="rounded-xl bg-muted p-3.5">
          <p className={TILE_SUB_EYEBROW_CLASS}>Che cosa sparisce</p>
          <dl className="mt-2 divide-y divide-border text-sm">
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">Snapshot mensili</dt>
              <dd className="font-mono tabular-nums">{dataCount.snapshots}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">Movimenti</dt>
              <dd className="font-mono tabular-nums">{dataCount.expenses}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-muted-foreground">Categorie</dt>
              <dd className="font-mono tabular-nums">{dataCount.categories}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </ResponsiveModal>
  );
}

/** The armed destructive primary: two clicks, no timer, Escape disarms. */
function ArmedDeleteAll({
  label,
  disabled,
  onConfirm,
}: {
  label: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick, onBlur } = useArmedDelete(ref, onConfirm);
  const [wasArmed, setWasArmed] = useState(false);
  if (armed && !wasArmed) setWasArmed(true);

  return (
    <>
      <Button
        ref={ref}
        type="button"
        variant="destructive"
        onClick={onClick}
        onBlur={onBlur}
        disabled={disabled}
        aria-pressed={armed}
      >
        {armed ? armedActionLabel(label) : label}
      </Button>
      <span className="sr-only" role="status" aria-live="polite">
        {armed ? armedActionLabel(label) : wasArmed ? 'Eliminazione annullata' : ''}
      </span>
    </>
  );
}
