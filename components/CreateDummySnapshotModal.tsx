/**
 * Generate dummy/test data for portfolio testing
 *
 * Use Cases:
 * - Testing Hall of Fame rankings
 * - Testing FIRE calculator with historical data
 * - Visualizing chart patterns without real data
 *
 * Features:
 * - Configurable growth rate and months
 * - Optional expense/income data generation
 * - Cross-validation (expenses < income)
 */
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
import { Switch } from '@/components/ui/switch';
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
  const [monthlyGrowthRate, setMonthlyGrowthRate] = useState<string>('0.8');
  const [numberOfMonths, setNumberOfMonths] = useState<string>('24');
  const [averageMonthlyIncome, setAverageMonthlyIncome] = useState<string>('3000');
  const [averageMonthlyExpenses, setAverageMonthlyExpenses] = useState<string>('2500');
  const [generateExpenses, setGenerateExpenses] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  /**
   * Sequential validation with early exit pattern
   *
   * Validation Order:
   * 1. Net worth (positive, not NaN)
   * 2. Growth rate (-100% to any positive %)
   * 3. Months (1-120, prevents infinite loops)
   * 4. If generateExpenses enabled:
   *    - Income (positive)
   *    - Expenses (positive AND < income)
   *
   * Why early exit? Show specific error to user immediately,
   * don't overwhelm with multiple validation errors at once.
   */
  const handleGenerate = async () => {
    const netWorth = parseFloat(initialNetWorth);
    const growthRate = parseFloat(monthlyGrowthRate);
    const months = parseInt(numberOfMonths);
    const income = parseFloat(averageMonthlyIncome);
    const expenses = parseFloat(averageMonthlyExpenses);

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

    if (generateExpenses) {
      if (isNaN(income) || income <= 0) {
        toast.error('Inserisci entrate mensili medie valide');
        return;
      }

      if (isNaN(expenses) || expenses < 0) {
        toast.error('Inserisci spese mensili medie valide');
        return;
      }

      if (expenses >= income) {
        toast.error('Le spese non possono essere maggiori o uguali alle entrate');
        return;
      }
    }

    setIsGenerating(true);

    try {
      await generateDummySnapshots({
        userId,
        initialNetWorth: netWorth,
        monthlyGrowthRate: growthRate,
        numberOfMonths: months,
        averageMonthlyIncome: generateExpenses ? income : undefined,
        averageMonthlyExpenses: generateExpenses ? expenses : undefined,
      });

      const message = generateExpenses
        ? `${months} snapshot e dati di spese/entrate creati con successo!`
        : `${months} snapshot fittizi creati con successo!`;
      toast.success(message);
      onOpenChange(false);

      // Reset form
      setInitialNetWorth('50000');
      setMonthlyGrowthRate('0.8');
      setNumberOfMonths('24');
      setAverageMonthlyIncome('3000');
      setAverageMonthlyExpenses('2500');
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
          <DialogTitle>Crea Dati di Test Fittizi</DialogTitle>
          <DialogDescription>
            Genera snapshot, spese ed entrate fittizi per testare grafici, statistiche e Hall of Fame.
            I dati verranno creati retroattivamente a partire da oggi.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Net Worth Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold">Dati Patrimonio</h3>

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
                placeholder="0.8"
                step="0.1"
              />
              <p className="text-xs text-muted-foreground">
                Percentuale di crescita mensile media del portfolio (0.5-1.0% realistico → 6-12% annuo)
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
          </div>

          {/* Expenses Section */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Genera Spese ed Entrate</h3>
                <p className="text-xs text-muted-foreground">
                  Crea anche dati fittizi per testare Hall of Fame e FIRE
                </p>
              </div>
              <Switch
                id="generate-expenses"
                checked={generateExpenses}
                onCheckedChange={setGenerateExpenses}
              />
            </div>

            {generateExpenses && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="average-income">
                    Entrate Mensili Medie (€)
                  </Label>
                  <Input
                    id="average-income"
                    type="number"
                    value={averageMonthlyIncome}
                    onChange={(e) => setAverageMonthlyIncome(e.target.value)}
                    placeholder="3000"
                    min="0"
                    step="100"
                  />
                  <p className="text-xs text-muted-foreground">
                    Media delle entrate mensili (con variabilità ±8%)
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="average-expenses">
                    Spese Mensili Medie (€)
                  </Label>
                  <Input
                    id="average-expenses"
                    type="number"
                    value={averageMonthlyExpenses}
                    onChange={(e) => setAverageMonthlyExpenses(e.target.value)}
                    placeholder="2500"
                    min="0"
                    step="100"
                  />
                  <p className="text-xs text-muted-foreground">
                    Media delle spese mensili (distribuite tra fisse, variabili e debiti)
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950 p-3 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Attenzione:</strong> I dati verranno salvati nelle stesse collection
              dei dati reali. Puoi eliminarli usando il pulsante &quot;Elimina Tutti i Dati Dummy&quot;
              in questa pagina o manualmente da Firebase Console.
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
            {isGenerating ? 'Generazione...' : generateExpenses ? 'Genera Dati di Test' : 'Genera Snapshot'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
