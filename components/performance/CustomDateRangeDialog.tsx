import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface CustomDateRangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (startDate: Date, endDate: Date) => void;
}

/**
 * Modal dialog for selecting custom date ranges for performance analysis.
 *
 * Allows users to pick start and end dates with validation to ensure the
 * start date is before the end date. Handles timezone conversion to avoid
 * offset issues with date inputs.
 *
 * @param open - Controls dialog visibility
 * @param onOpenChange - Callback to update open state
 * @param onConfirm - Callback fired with validated Date objects when user confirms
 */
export function CustomDateRangeDialog({
  open,
  onOpenChange,
  onConfirm,
}: CustomDateRangeDialogProps) {
  // === State Management ===

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // === Event Handlers ===

  const handleConfirm = () => {
    if (!startDate || !endDate) {
      toast.error('Seleziona entrambe le date');
      return;
    }

    // Create dates in local timezone (not UTC) to avoid offset issues.
    // HTML date inputs return YYYY-MM-DD strings, which the Date constructor
    // interprets as UTC midnight, causing timezone shift problems.
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const start = new Date(startYear, startMonth - 1, startDay);

    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const end = new Date(endYear, endMonth - 1, endDay);

    // Ensure start date is before end date for valid date range
    if (start >= end) {
      toast.error('La data di inizio deve essere precedente alla data di fine');
      return;
    }

    onConfirm(start, end);
    onOpenChange(false);
  };

  // === Rendering ===

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seleziona Periodo Personalizzato</DialogTitle>
          <DialogDescription>
            Scegli le date di inizio e fine per calcolare le metriche di performance.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="start-date">Data di Inizio</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="end-date">Data di Fine</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleConfirm}>Calcola</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
