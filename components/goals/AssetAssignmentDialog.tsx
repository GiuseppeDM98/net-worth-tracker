/**
 * Dialog for assigning an asset (by percentage) to a goal.
 * Shows available assets with their total value and already-assigned percentages.
 */

'use client';

import { useState, useMemo } from 'react';
import { Asset } from '@/types/assets';
import { GoalAssetAssignment } from '@/types/goals';
import { getAvailablePercentage } from '@/lib/services/goalService';
import { calculateAssetValue } from '@/lib/services/assetService';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils/formatters';
import { Search } from 'lucide-react';

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

  // Reset on open
  useState(() => {
    if (open) {
      setSearchTerm('');
      setSelectedAssetId(null);
      setPercentage('');
    }
  });

  // Filter assets by search
  const filteredAssets = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(term) ||
        a.ticker.toLowerCase().includes(term)
    );
  }, [assets, searchTerm]);

  // Calculate available percentage for selected asset
  const selectedAsset = assets.find((a) => a.id === selectedAssetId);
  const available = selectedAssetId
    ? getAvailablePercentage(selectedAssetId, assignments, goalId)
    : 100;

  // Check if this asset is already assigned to this goal
  const existingAssignment = selectedAssetId
    ? assignments.find(
        (a) => a.assetId === selectedAssetId && a.goalId === goalId
      )
    : null;

  const handleSave = async () => {
    if (!selectedAssetId || !percentage) return;
    const pct = parseFloat(percentage);
    if (pct <= 0 || pct > available + (existingAssignment?.percentage || 0))
      return;

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
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cerca asset per nome o ticker..."
              className="pl-9"
            />
          </div>

          {/* Asset list */}
          <div className="border rounded-lg max-h-[250px] overflow-y-auto divide-y">
            {filteredAssets.length === 0 ? (
              <p className="text-sm text-gray-500 p-4 text-center">
                Nessun asset trovato
              </p>
            ) : (
              filteredAssets.map((asset) => {
                const value = calculateAssetValue(asset);
                const avail = getAvailablePercentage(
                  asset.id,
                  assignments,
                  goalId
                );
                const isSelected = selectedAssetId === asset.id;
                const alreadyAssigned = assignments.find(
                  (a) => a.assetId === asset.id && a.goalId === goalId
                );

                return (
                  <button
                    key={asset.id}
                    onClick={() => {
                      setSelectedAssetId(asset.id);
                      // Pre-fill with existing assignment if editing
                      if (alreadyAssigned) {
                        setPercentage(alreadyAssigned.percentage.toString());
                      } else {
                        setPercentage('');
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {asset.name}
                        </p>
                        <p className="text-xs text-gray-500">{asset.ticker}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-700">
                          {formatCurrency(value)}
                        </p>
                        <p
                          className={`text-xs ${
                            avail === 0
                              ? 'text-red-500'
                              : avail < 50
                                ? 'text-yellow-600'
                                : 'text-green-600'
                          }`}
                        >
                          {avail.toFixed(0)}% disponibile
                          {alreadyAssigned && (
                            <span className="text-blue-600 ml-1">
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

          {/* Percentage input (visible when asset selected) */}
          {selectedAsset && (
            <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm font-medium text-blue-900">
                {selectedAsset.name} ({selectedAsset.ticker})
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="assignPct" className="text-xs text-blue-700">
                    Percentuale da assegnare
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="assignPct"
                      type="number"
                      min="0"
                      max={available + (existingAssignment?.percentage || 0)}
                      step="5"
                      value={percentage}
                      onChange={(e) => setPercentage(e.target.value)}
                      placeholder={`Max ${(available + (existingAssignment?.percentage || 0)).toFixed(0)}%`}
                      className="bg-white"
                    />
                    <span className="text-sm text-blue-700">%</span>
                  </div>
                </div>
                {percentage && (
                  <div className="text-right">
                    <p className="text-xs text-blue-600">Equivale a</p>
                    <p className="text-sm font-semibold text-blue-900">
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
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              saving ||
              !selectedAssetId ||
              !percentage ||
              parseFloat(percentage) <= 0 ||
              parseFloat(percentage) >
                available + (existingAssignment?.percentage || 0)
            }
          >
            {saving ? 'Salvataggio...' : existingAssignment ? 'Aggiorna' : 'Assegna'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
