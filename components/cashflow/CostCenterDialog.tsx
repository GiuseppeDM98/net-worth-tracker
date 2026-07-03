'use client';

/**
 * CostCenterDialog
 *
 * Modal for creating and editing cost centers.
 * Keeps the form minimal: name (required), optional description, and a color picker
 * with a fixed palette so colors stay visually consistent across the app.
 *
 * WHY a fixed palette:
 * Free-form hex input is harder to use on mobile and produces inconsistent results.
 * A curated 8-color palette is enough to distinguish cost centers at a glance.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import {
  CostCenter,
  CostCenterFormData,
  CostCenterBudgetPeriod,
  COST_CENTER_COLORS,
} from '@/types/costCenters';
import { createCostCenter, updateCostCenter } from '@/lib/services/costCenterService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Human-readable labels for screen readers — hex values are unpronounceable.
// Keep in sync with COST_CENTER_COLORS in types/costCenters.ts.
const COLOR_LABELS: Record<string, string> = {
  '#3b82f6': 'Blu',
  '#10b981': 'Verde smeraldo',
  '#f59e0b': 'Ambra',
  '#ef4444': 'Rosso',
  '#8b5cf6': 'Viola',
  '#ec4899': 'Rosa',
  '#06b6d4': 'Ciano',
  '#84cc16': 'Verde lime',
};

interface CostCenterDialogProps {
  open: boolean;
  onClose: () => void;
  /** When provided, the dialog is in edit mode. Otherwise it creates a new center. */
  costCenter?: CostCenter | null;
  onSuccess: (costCenter: CostCenter) => void;
}

export function CostCenterDialog({
  open,
  onClose,
  costCenter,
  onSuccess,
}: CostCenterDialogProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(COST_CENTER_COLORS[0]);
  // Optional spending ceiling. Empty string = no budget; the field is opt-in.
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetPeriod, setBudgetPeriod] = useState<CostCenterBudgetPeriod>('annual');
  const [saving, setSaving] = useState(false);

  // Populate fields when editing an existing cost center
  useEffect(() => {
    if (costCenter) {
      setName(costCenter.name);
      setDescription(costCenter.description ?? '');
      setColor(costCenter.color ?? COST_CENTER_COLORS[0]);
      setBudgetAmount(costCenter.budgetAmount != null ? String(costCenter.budgetAmount) : '');
      setBudgetPeriod(costCenter.budgetPeriod ?? 'annual');
    } else {
      setName('');
      setDescription('');
      setColor(COST_CENTER_COLORS[0]);
      setBudgetAmount('');
      setBudgetPeriod('annual');
    }
  }, [costCenter, open]);

  const handleSave = async () => {
    if (!user || !ownerId || !name.trim()) return;

    // A non-positive or empty budget input means "no ceiling": persist undefined so
    // the verdict logic skips it.
    const parsedBudget = parseFloat(budgetAmount.replace(',', '.'));
    const hasBudget = Number.isFinite(parsedBudget) && parsedBudget > 0;

    const formData: CostCenterFormData = {
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      budgetAmount: hasBudget ? parsedBudget : undefined,
      budgetPeriod: hasBudget ? budgetPeriod : undefined,
    };

    try {
      setSaving(true);
      if (costCenter) {
        await updateCostCenter(costCenter, formData);
        onSuccess({ ...costCenter, ...formData });
        toast.success('Centro di costo aggiornato');
      } else {
        const created = await createCostCenter(ownerId, formData);
        onSuccess(created);
        toast.success('Centro di costo creato');
      }
      onClose();
    } catch (error) {
      console.error('Error saving cost center:', error);
      toast.error('Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {costCenter ? 'Modifica centro di costo' : 'Nuovo centro di costo'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {costCenter
              ? 'Modifica nome, descrizione e colore del centro di costo.'
              : 'Crea un nuovo centro di costo per raggruppare le spese per oggetto o progetto.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="ccName">Nome *</Label>
            <Input
              id="ccName"
              placeholder="es. Automobile Dacia"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="ccDesc">Descrizione (opzionale)</Label>
            <Input
              id="ccDesc"
              placeholder="es. Spese per la Dacia Sandero"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Color picker — fixed palette for visual consistency */}
          <div className="space-y-2">
            <Label>Colore</Label>
            <div className="flex flex-wrap gap-2">
              {COST_CENTER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition-transform duration-100',
                    color === c
                      ? 'border-foreground scale-110'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                  aria-label={`${COLOR_LABELS[c] ?? c}${color === c ? ' (selezionato)' : ''}`}
                  aria-pressed={color === c}
                />
              ))}
            </div>
          </div>

          {/* Optional spending ceiling (budget). Lets the center report a verdict and
              compare its projected cost against a target. Leaving the amount empty
              keeps the center as a pure tracker. */}
          <div className="space-y-2 border-t border-border/40 pt-4">
            <Label htmlFor="ccBudget">Tetto di spesa (opzionale)</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  €
                </span>
                <Input
                  id="ccBudget"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="50"
                  placeholder="0"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  className="pl-7 font-mono"
                />
              </div>
              <SegmentedControl<CostCenterBudgetPeriod>
                options={[
                  { value: 'monthly', label: 'Mensile' },
                  { value: 'annual', label: 'Annuale' },
                ]}
                value={budgetPeriod}
                onChange={setBudgetPeriod}
                aria-label="Periodo del tetto di spesa"
                className="sm:w-[180px]"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Imposta un limite {budgetPeriod === 'monthly' ? 'mensile' : 'annuale'} per
              ricevere un avviso quando il centro lo supera.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Salvataggio...' : costCenter ? 'Aggiorna' : 'Crea'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
