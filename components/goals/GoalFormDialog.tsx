/**
 * Dialog for creating/editing investment goals.
 * Includes preset templates for quick creation and optional recommended allocation.
 */

'use client';

import { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { AssetClass } from '@/types/assets';
import {
  InvestmentGoal,
  GoalPriority,
  GOAL_TEMPLATES,
  GOAL_COLORS,
} from '@/types/goals';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check } from 'lucide-react';

interface GoalFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (goal: InvestmentGoal) => Promise<void>;
  goal: InvestmentGoal | null; // null = creating new
  existingGoals: InvestmentGoal[];
}

const PRIORITY_OPTIONS: { value: GoalPriority; label: string }[] = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'bassa', label: 'Bassa' },
];

// Asset classes available for recommended allocation
const ALLOCATION_CLASSES: { value: AssetClass; label: string }[] = [
  { value: 'equity', label: 'Azioni' },
  { value: 'bonds', label: 'Obbligazioni' },
  { value: 'cash', label: 'Liquidità' },
  { value: 'realestate', label: 'Immobili' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'commodity', label: 'Materie Prime' },
];

export function GoalFormDialog({
  open,
  onClose,
  onSave,
  goal,
  existingGoals,
}: GoalFormDialogProps) {
  const isEditing = !!goal;

  // Form state
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [priority, setPriority] = useState<GoalPriority>('media');
  const [color, setColor] = useState(GOAL_COLORS[0]);
  const [notes, setNotes] = useState('');
  const [allocation, setAllocation] = useState<
    Partial<Record<AssetClass, number>>
  >({});
  const [saving, setSaving] = useState(false);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (goal) {
        // Editing: populate form from goal
        setName(goal.name);
        setTargetAmount(goal.targetAmount?.toString() ?? '');
        setTargetDate(goal.targetDate || '');
        setPriority(goal.priority);
        setColor(goal.color);
        setNotes(goal.notes || '');
        setAllocation(goal.recommendedAllocation || {});
      } else {
        // Creating: reset to defaults
        setName('');
        setTargetAmount('');
        setTargetDate('');
        setPriority('media');
        setColor(GOAL_COLORS[0]);
        setNotes('');
        setAllocation({});
      }
    }
  }, [open, goal]);

  const handleTemplateSelect = (templateName: string) => {
    const template = GOAL_TEMPLATES.find((t) => t.name === templateName);
    if (!template) return;

    setName(template.name);
    setPriority(template.priority);
    setColor(template.color);
    setAllocation(template.recommendedAllocation || {});
  };

  const handleAllocationChange = (cls: AssetClass, value: string) => {
    const numValue = parseFloat(value) || 0;
    setAllocation((prev) => {
      const updated = { ...prev };
      if (numValue > 0) {
        updated[cls] = numValue;
      } else {
        delete updated[cls];
      }
      return updated;
    });
  };

  const allocationTotal = Object.values(allocation).reduce(
    (sum, v) => sum + (v || 0),
    0
  );
  const isAllocationValid =
    Object.keys(allocation).length === 0 ||
    Math.abs(allocationTotal - 100) < 0.01;

  const handleSubmit = async () => {
    if (!name.trim()) return;
    // Target amount is optional — if provided, must be positive
    if (targetAmount && parseFloat(targetAmount) < 0) return;
    if (!isAllocationValid) return;

    setSaving(true);
    try {
      const now = Timestamp.now();
      const parsedTarget = targetAmount ? parseFloat(targetAmount) : undefined;
      const goalData: InvestmentGoal = {
        id: goal?.id || crypto.randomUUID(),
        name: name.trim(),
        targetAmount: parsedTarget && parsedTarget > 0 ? parsedTarget : undefined,
        targetDate: targetDate || undefined,
        priority,
        color,
        recommendedAllocation:
          Object.keys(allocation).length > 0 ? allocation : undefined,
        notes: notes.trim() || undefined,
        createdAt: goal?.createdAt || now,
        updatedAt: now,
      };

      await onSave(goalData);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Modifica Obiettivo' : 'Nuovo Obiettivo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Templates (only when creating) */}
          {!isEditing && (
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">Template rapidi</Label>
              <div className="flex flex-wrap gap-2">
                {GOAL_TEMPLATES.map((t) => (
                  <Button
                    key={t.name}
                    variant="outline"
                    size="sm"
                    onClick={() => handleTemplateSelect(t.name)}
                    className="text-xs"
                    style={{
                      borderColor: name === t.name ? t.color : undefined,
                      color: name === t.name ? t.color : undefined,
                    }}
                  >
                    {t.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div className="space-y-1">
            <Label htmlFor="goalName">Nome *</Label>
            <Input
              id="goalName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="es. Acquisto Casa"
              maxLength={50}
            />
          </div>

          {/* Target amount */}
          <div className="space-y-1">
            <Label htmlFor="goalTarget">Importo Obiettivo (EUR)</Label>
            <Input
              id="goalTarget"
              type="number"
              min="0"
              step="1000"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
              placeholder="es. 200000"
            />
          </div>

          {/* Target date */}
          <div className="space-y-1">
            <Label htmlFor="goalDate">Data Obiettivo (opzionale)</Label>
            <Input
              id="goalDate"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          {/* Priority */}
          <div className="space-y-1">
            <Label>Priorità</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as GoalPriority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div className="space-y-1">
            <Label>Colore</Label>
            <div className="flex flex-wrap gap-2">
              {GOAL_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? '#1F2937' : 'transparent',
                  }}
                >
                  {color === c && (
                    <Check className="h-3.5 w-3.5 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Recommended Allocation */}
          <div className="space-y-2">
            <Label className="text-sm">
              Allocazione Consigliata (opzionale)
            </Label>
            <p className="text-xs text-gray-500">
              Definisci il mix ideale di asset class per questo obiettivo
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ALLOCATION_CLASSES.map((cls) => (
                <div key={cls.value} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    className="w-20 text-sm"
                    value={allocation[cls.value] || ''}
                    onChange={(e) =>
                      handleAllocationChange(cls.value, e.target.value)
                    }
                    placeholder="0"
                  />
                  <span className="text-xs text-gray-600">% {cls.label}</span>
                </div>
              ))}
            </div>
            {Object.keys(allocation).length > 0 && (
              <p
                className={`text-xs font-medium ${
                  isAllocationValid ? 'text-green-600' : 'text-red-600'
                }`}
              >
                Totale: {allocationTotal.toFixed(1)}%
                {!isAllocationValid && ' (deve essere 100%)'}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="goalNotes">Note (opzionale)</Label>
            <textarea
              id="goalNotes"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note sull'obiettivo..."
            />
            <p
              className={`text-xs ${
                notes.length > 400
                  ? notes.length > 480
                    ? 'text-red-500'
                    : 'text-orange-500'
                  : 'text-gray-400'
              }`}
            >
              {notes.length}/500
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              saving ||
              !name.trim() ||
              (targetAmount !== '' && parseFloat(targetAmount) < 0) ||
              !isAllocationValid
            }
          >
            {saving
              ? 'Salvataggio...'
              : isEditing
                ? 'Salva Modifiche'
                : 'Crea Obiettivo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
