/**
 * Dialog for assigning an asset (by percentage) to a goal.
 * Shows available assets with their total value and already-assigned percentages.
 *
 * Bug fix: reset used useState(initializer) which only fires once.
 * Corrected to useEffect([open]) with guard `if (!open) return`.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { Asset } from '@/types/assets';
import { GoalAssetAssignment } from '@/types/goals';
import { getAvailablePercentage } from '@/lib/services/goalService';
import { calculateAssetValue } from '@/lib/services/assetService';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils/formatters';
import { Search, Loader2 } from 'lucide-react';

interface AssetAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (goalId: string, assetId: string, percentage: number) => Promise<void>;
  goalId: string;
  assets: Asset[];
  assignments: GoalAssetAssignment[];
}

export function AssetAssignmentDialog({
  open,
  onClose,
  onSave,
  goalId,
  assets,
  assignments,
}: AssetAssignmentDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [percentage, setPercentage] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset fields each time the dialog opens; guard prevents reset on close
  useEffect(() => {
    if (!open) return;
    setSearchTerm('');
    setSelectedAssetId(null);
    setPercentage('');
  }, [open]);

  const filteredAssets = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        a.ticker.toLowerCase().includes(term)
    );
  }, [assets, searchTerm]);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  // available: excludes current goal's assignment → represents the true cap this goal can hold
  // (free space + what this goal already has). Do NOT add existingAssignment on top — that
  // would double-count. E.g. Giulia 50% + Isabella 50%: available=50, existingAssignment=50,
  // wrongly giving maxAllowedPct=100 when the real max is 50.
  const available = selectedAssetId
    ? getAvailablePercentage(selectedAssetId, assignments, goalId)
    : 100;

  const existingAssignment = selectedAssetId
    ? assignments.find((a) => a.assetId === selectedAssetId && a.goalId === goalId)
    : null;

  const maxAllowedPct = available;

  const handleSave = async () => {
    if (!selectedAssetId || !percentage) return;
    const pct = parseFloat(percentage);
    if (pct <= 0 || pct > maxAllowedPct) return;

    setSaving(true);
    try {
      await onSave(goalId, selectedAssetId, pct);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assegna Asset all&apos;Obiettivo</DialogTitle>
          <DialogDescription>
            Scegli un asset e la percentuale del suo valore da assegnare a questo obiettivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca asset per nome o ticker..."
              className="pl-9"
            />
          </div>

          {/* Asset list */}
          <div className="border border-border rounded-lg max-h-[250px] overflow-y-auto divide-y divide-border">
            {filteredAssets.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">
                Nessun asset trovato
              </p>
            ) : (
              filteredAssets.map((asset) => {
                const value = calculateAssetValue(asset);
                // trueAvail: truly free space across ALL goals (no exclusion)
                const trueAvail = getAvailablePercentage(asset.id, assignments);
                const isSelected = selectedAssetId === asset.id;
                const alreadyAssigned = assignments.find(
                  (a) => a.assetId === asset.id && a.goalId === goalId
                );

                // Availability status: based on truly free space, not goal-scoped available
                const availabilityInfo =
                  trueAvail === 0 && !alreadyAssigned
                    ? { label: 'Esaurito', cls: 'text-destructive' }
                    : trueAvail === 0 && alreadyAssigned
                      ? { label: 'Nessuna quota libera', cls: 'text-muted-foreground' }
                      : trueAvail < 50
                        ? { label: `${trueAvail.toFixed(0)}% libero`, cls: 'text-amber-600 dark:text-amber-400' }
                        : { label: `${trueAvail.toFixed(0)}% libero`, cls: 'text-emerald-600 dark:text-emerald-400' };

                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      setPercentage(
                        alreadyAssigned ? alreadyAssigned.percentage.toString() : ''
                      );
                    }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted/30 transition-colors ${
                      isSelected ? 'bg-accent border-l-2 border-primary' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {asset.name}
                        </p>
                        <p className="text-xs text-muted-foreground">{asset.ticker}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono tabular-nums text-foreground/80">
                          {formatCurrency(value)}
                        </p>
                        <p className={`text-xs ${availabilityInfo.cls}`}>
                          {availabilityInfo.label}
                          {alreadyAssigned && (
                            <span className="text-muted-foreground ml-1">
                              ({alreadyAssigned.percentage}% assegnato)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Percentage input — visible when asset selected */}
          {selectedAsset && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
              <p className="text-sm font-medium text-foreground">
                {selectedAsset.name} ({selectedAsset.ticker})
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="assignPct" className="text-xs text-muted-foreground">
                    Percentuale da assegnare
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="assignPct"
                      type="number"
                      min="0"
                      max={maxAllowedPct}
                      step="5"
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value)}
                      placeholder={`Max ${maxAllowedPct.toFixed(0)}%`}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
                {percentage && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Equivale a</p>
                    <p className="text-sm font-semibold font-mono tabular-nums text-foreground">
                      {formatCurrency(
                        (calculateAssetValue(selectedAsset) *
                          (parseFloat(percentage) || 0)) /
                          100
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              saving ||
              !selectedAssetId ||
              !percentage ||
              parseFloat(percentage) <= 0 ||
              parseFloat(percentage) > maxAllowedPct
            }
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Salvataggio...' : existingAssignment ? 'Aggiorna' : 'Assegna'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
