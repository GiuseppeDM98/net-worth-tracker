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
import { CostCenter, CostCenterFormData, COST_CENTER_COLORS } from '@/types/costCenters';
import { createCostCenter, updateCostCenter } from '@/lib/services/costCenterService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(COST_CENTER_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Populate fields when editing an existing cost center
  useEffect(() => {
    if (costCenter) {
      setName(costCenter.name);
      setDescription(costCenter.description ?? '');
      setColor(costCenter.color ?? COST_CENTER_COLORS[0]);
    } else {
      setName('');
      setDescription('');
      setColor(COST_CENTER_COLORS[0]);
    }
  }, [costCenter, open]);

  const handleSave = async () => {
    if (!user || !name.trim()) return;

    const formData: CostCenterFormData = {
      name: name.trim(),
      description: description.trim() || undefined,
      color,
    };

    try {
      setSaving(true);
      if (costCenter) {
        await updateCostCenter(costCenter, formData);
        onSuccess({ ...costCenter, ...formData });
        toast.success('Centro di costo aggiornato');
      } else {
        const created = await createCostCenter(user.uid, formData);
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
                  aria-label={`Colore ${c}`}
                  aria-pressed={color === c}
                />
              ))}
            </div>
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
