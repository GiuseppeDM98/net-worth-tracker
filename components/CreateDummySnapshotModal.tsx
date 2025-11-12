'use client';

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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generateDummySnapshots } from '@/lib/services/dummySnapshotGenerator';
import { toast } from 'sonner';

interface CreateDummySnapshotModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export function CreateDummySnapshotModal({
  open,
  onOpenChange,
  userId,
}: CreateDummySnapshotModalProps) {
  const [initialNetWorth, setInitialNetWorth] = useState<string>('50000');
  const [monthlyGrowthRate, setMonthlyGrowthRate] = useState<string>('3');
  const [numberOfMonths, setNumberOfMonths] = useState<string>('24');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    // Validate inputs
    const netWorth = parseFloat(initialNetWorth);
    const growthRate = parseFloat(monthlyGrowthRate);
    const months = parseInt(numberOfMonths);

    if (isNaN(netWorth) || netWorth <= 0) {
      toast.error('Inserisci un Net Worth iniziale valido');
      return;
    }

    if (isNaN(growthRate) || growthRate < -100) {
      toast.error('Inserisci una percentuale di crescita valida');
      return;
    }

    if (isNaN(months) || months <= 0 || months > 120) {
      toast.error('Inserisci un numero di mesi valido (1-120)');
      return;
    }

    setIsGenerating(true);

    try {
      await generateDummySnapshots({
        userId,
        initialNetWorth: netWorth,
        monthlyGrowthRate: growthRate,
        numberOfMonths: months,
      });

      toast.success(`${months} snapshot fittizi creati con successo!`);
      onOpenChange(false);

      // Reset form
      setInitialNetWorth('50000');
      setMonthlyGrowthRate('3');
      setNumberOfMonths('24');
    } catch (error) {
      console.error('Error generating dummy snapshots:', error);
      toast.error('Errore durante la creazione degli snapshot');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Crea Snapshot Fittizi</DialogTitle>
          <DialogDescription>
            Genera snapshot fittizi per testare i grafici nella pagina History.
            Gli snapshot verranno creati retroattivamente a partire da oggi.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="initial-net-worth">
              Net Worth Iniziale (€)
            </Label>
            <Input
              id="initial-net-worth"
              type="number"
              value={initialNetWorth}
              onChange={(e) => setInitialNetWorth(e.target.value)}
              placeholder="50000"
              min="0"
              step="1000"
            />
            <p className="text-xs text-muted-foreground">
              Valore di partenza del patrimonio
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="growth-rate">
              Crescita Mensile (%)
            </Label>
            <Input
              id="growth-rate"
              type="number"
              value={monthlyGrowthRate}
              onChange={(e) => setMonthlyGrowthRate(e.target.value)}
              placeholder="3"
              step="0.1"
            />
            <p className="text-xs text-muted-foreground">
              Percentuale di crescita mese su mese
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="number-of-months">
              Numero di Mesi
            </Label>
            <Input
              id="number-of-months"
              type="number"
              value={numberOfMonths}
              onChange={(e) => setNumberOfMonths(e.target.value)}
              placeholder="24"
              min="1"
              max="120"
            />
            <p className="text-xs text-muted-foreground">
              Quanti mesi di storico generare (max 120)
            </p>
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Attenzione:</strong> Gli snapshot verranno salvati nella stessa collection
              degli snapshot reali. Potrai cancellarli manualmente da Firebase Console.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Annulla
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Generazione...' : 'Genera Snapshot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
