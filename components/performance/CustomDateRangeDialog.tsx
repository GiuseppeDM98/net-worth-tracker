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

export function CustomDateRangeDialog({
  open,
  onOpenChange,
  onConfirm,
}: CustomDateRangeDialogProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleConfirm = () => {
    if (!startDate || !endDate) {
      toast.error('Seleziona entrambe le date');
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      toast.error('La data di inizio deve essere precedente alla data di fine');
      return;
    }

    onConfirm(start, end);
    onOpenChange(false);
  };

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
