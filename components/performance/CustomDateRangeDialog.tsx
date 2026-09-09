'use client';

import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { describeModalStatus, type ModalStatus } from '@/lib/utils/dialogNarrative';

interface CustomDateRangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (startDate: Date, endDate: Date) => void;
  triggerOrigin?: string;
}

/**
 * The custom measurement window of Rendimenti.
 *
 * Allows users to pick start and end dates with validation to ensure the start date is before
 * the end date. Handles timezone conversion to avoid offset issues with date inputs.
 *
 * A refusal lands on the modal's reading line, not in a toast: the reader is looking at the
 * two fields that caused it (DESIGN.md → The Status-Is-The-Reading Rule).
 */
export function CustomDateRangeDialog({
  open,
  onOpenChange,
  onConfirm,
  triggerOrigin,
}: CustomDateRangeDialogProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });

  const handleConfirm = () => {
    if (!startDate || !endDate) {
      setStatus({ phase: 'error', message: 'Servono entrambe le date per misurare un periodo.' });
      return;
    }

    // Create dates in local timezone (not UTC) to avoid offset issues.
    // HTML date inputs return YYYY-MM-DD strings, which the Date constructor
    // interprets as UTC midnight, causing timezone shift problems.
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay);

    if (start >= end) {
      setStatus({
        phase: 'error',
        message: 'La data di inizio deve venire prima di quella di fine.',
      });
      return;
    }

    onConfirm(start, end);
    onOpenChange(false);
  };

  const reading = describeModalStatus(status, {
    idle: [
      {
        text: 'Le metriche vengono ricalcolate su questa finestra, e il periodo diventa un chip sotto il verdetto.',
      },
    ],
    submitting: 'Sto ricalcolando le metriche.',
  });

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow="Rendimenti · Periodo"
      title="Periodo personalizzato"
      reading={reading}
      width="sm"
      triggerOrigin={triggerOrigin}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleConfirm}>Calcola</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="start-date" className="text-xs text-muted-foreground">
            Data di inizio *
          </Label>
          <Input
            id="start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="end-date" className="text-xs text-muted-foreground">
            Data di fine *
          </Label>
          <Input
            id="end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
