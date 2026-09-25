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
 * A curated 8-color palette is enough to distinguish cost centers at a glance — provided two
 * centers do not wear the same one: a new center opens on the first slot no active center
 * holds (`firstFreeColorKey`), and a swatch another center wears says whose it is.
 *
 * The reading under the title is the form's status line (DESIGN.md → The Status-Is-The-Reading
 * Rule): a refused submit and a failed write are sentences THERE, never a toast — the submit
 * stays enabled so that pressing it can say what is missing.
 */

import { useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import {
  CostCenter,
  CostCenterFormData,
  CostCenterBudgetPeriod,
} from '@/types/costCenters';
import {
  COST_CENTER_COLOR_KEYS,
  firstFreeColorKey,
  mapColorSlotUsage,
  resolveCostCenterColor,
  resolveCostCenterColorSlot,
} from '@/lib/utils/costCenterColors';
import { describeCeilingHint, describeColorClash, describeColorSwatch, describeCostCenterDialogCopy } from '@/lib/utils/costCenterNarrative';
import { describeFormRefusal, describeModalStatus, describeWriteError, type ModalStatus } from '@/lib/utils/dialogNarrative';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { createCostCenter, updateCostCenter } from '@/lib/services/costCenterService';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const NO_HOLDERS: readonly string[] = [];

interface CostCenterDialogProps {
  open: boolean;
  onClose: () => void;
  /** When provided, the dialog is in edit mode. Otherwise it creates a new center. */
  costCenter?: CostCenter | null;
  /** Every center of the account: who already wears which colour. */
  centers: CostCenter[];
  /** The control that opened the dialog: the focus goes back to it on close, not to `body`. */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
  onSuccess: (costCenter: CostCenter) => void;
}

interface CostCenterFields {
  name: string;
  description: string;
  color: string;
  /** Optional spending ceiling. Empty string = no budget; the field is opt-in. */
  budgetAmount: string;
  budgetPeriod: CostCenterBudgetPeriod;
}

/** The form's values for a subject: the center being edited, or the blank form for a new one. */
function fieldsFor(costCenter: CostCenter | null | undefined, centers: CostCenter[]): CostCenterFields {
  if (!costCenter) {
    return { name: '', description: '', color: firstFreeColorKey(centers), budgetAmount: '', budgetPeriod: 'annual' };
  }
  return {
    name: costCenter.name,
    description: costCenter.description ?? '',
    // A pre-migration document still holds a hex, which matches no slot key — resolving it
    // to its slot both highlights the right swatch and migrates the value on the next save.
    color: COST_CENTER_COLOR_KEYS[resolveCostCenterColorSlot(costCenter.color, costCenter.id)],
    budgetAmount: costCenter.budgetAmount != null ? String(costCenter.budgetAmount) : '',
    budgetPeriod: costCenter.budgetPeriod ?? 'annual',
  };
}

export function CostCenterDialog({
  open,
  onClose,
  costCenter,
  centers,
  returnFocusTo,
  onSuccess,
}: CostCenterDialogProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const chartColors = useChartColors();
  const [fields, setFields] = useState<CostCenterFields>(() => fieldsFor(costCenter, centers));
  const [status, setStatus] = useState<ModalStatus>({ phase: 'idle' });
  const saving = status.phase === 'submitting';
  const nameRef = useRef<HTMLInputElement | null>(null);
  const budgetRef = useRef<HTMLInputElement | null>(null);

  // Populate the fields from the subject on every open and on every change of center. Done
  // while rendering, before anything reads them — the React "adjust state when a prop
  // changes" pattern — because the same reset inside an effect is banned by
  // react-hooks/set-state-in-effect and would paint one frame with the previous center's values.
  const [prevSubject, setPrevSubject] = useState({ open, costCenter });
  if (prevSubject.open !== open || prevSubject.costCenter !== costCenter) {
    setPrevSubject({ open, costCenter });
    setFields(fieldsFor(costCenter, centers));
    setStatus({ phase: 'idle' });
  }

  const { name, description, color, budgetAmount, budgetPeriod } = fields;
  // Editing a field answers the refusal it may have caused: the reading goes back to idle.
  const setField = <K extends keyof CostCenterFields>(key: K, value: CostCenterFields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    if (status.phase === 'error') setStatus({ phase: 'idle' });
  };

  const slotUsage = mapColorSlotUsage(centers, costCenter?.id);
  const holdersOf = (key: string) => slotUsage.get(resolveCostCenterColorSlot(key, key)) ?? NO_HOLDERS;
  const colorClash = describeColorClash(holdersOf(color));

  const handleSave = async () => {
    if (!user || !ownerId || saving) return;

    // An empty ceiling means «no ceiling»; a typed one that is not a positive amount is a
    // mistake, and saving it as «no ceiling» would drop what the user meant without a word.
    const typedBudget = budgetAmount.trim();
    const parsedBudget = parseFloat(typedBudget.replace(',', '.'));
    const hasBudget = typedBudget !== '' && Number.isFinite(parsedBudget) && parsedBudget > 0;
    const missing = name.trim() ? [] : ['Nome'];
    const invalid = typedBudget !== '' && !hasBudget ? ['Tetto di spesa'] : [];
    if (missing.length > 0 || invalid.length > 0) {
      setStatus({ phase: 'error', message: describeFormRefusal(missing, invalid) });
      (missing.length > 0 ? nameRef : budgetRef).current?.focus();
      return;
    }

    const formData: CostCenterFormData = {
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      budgetAmount: hasBudget ? parsedBudget : undefined,
      budgetPeriod: hasBudget ? budgetPeriod : undefined,
    };

    try {
      setStatus({ phase: 'submitting' });
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
      // The form stays open with what was typed; the reading says why it was not saved.
      setStatus({ phase: 'error', message: describeWriteError(error) });
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onClose={onClose}
      eyebrow="Cashflow · Centri di costo"
      title={costCenter ? 'Modifica centro di costo' : 'Nuovo centro di costo'}
      reading={describeModalStatus(status, describeCostCenterDialogCopy(!!costCenter))}
      width="md"
      returnFocusTo={returnFocusTo}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio...' : costCenter ? 'Aggiorna' : 'Crea'}
          </Button>
        </>
      }
    >
        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="ccName">Nome *</Label>
            <Input
              id="ccName"
              ref={nameRef}
              placeholder="es. Automobile Dacia"
              value={name}
              onChange={(e) => setField('name', e.target.value)}
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
              onChange={(e) => setField('description', e.target.value)}
            />
          </div>

          {/* Color picker — fixed palette for visual consistency */}
          <div className="space-y-2">
            <Label>Colore</Label>
            <div className="flex flex-wrap gap-2">
              {COST_CENTER_COLOR_KEYS.map((key, i) => (
                <button
                  key={key}
                  type="button"
                  // 44×44 hit area around a 32px swatch: the target meets 2.5.5 without the
                  // dots growing into each other and losing the palette's compactness.
                  className={cn(
                    'group grid h-11 w-11 place-items-center rounded-full',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
                  )}
                  onClick={() => setField('color', key)}
                  // Named by POSITION, never by hue: a slot resolves to a different colour on
                  // each theme, so «Blu» would be a lie on Cyberpunk — plus who already wears it.
                  aria-label={describeColorSwatch(i, COST_CENTER_COLOR_KEYS.length, holdersOf(key), color === key)}
                  aria-pressed={color === key}
                >
                  <span
                    className={cn(
                      // group-hover, not hover: the 6px ring that makes the target 44px is
                      // part of the button, so pointing at it must give the same feedback as
                      // pointing at the dot.
                      'grid h-8 w-8 place-items-center rounded-full border-2 transition-transform duration-100 motion-reduce:transition-none',
                      color === key
                        ? 'border-foreground scale-110'
                        : 'border-transparent group-hover:scale-105'
                    )}
                    style={{ backgroundColor: resolveCostCenterColor(key, key, chartColors) }}
                  >
                    {/* Taken by another active center: a hole in the dot, legible on any theme
                        because it is the surface showing through, not a second colour. */}
                    {holdersOf(key).length > 0 && <span className="h-2.5 w-2.5 rounded-full bg-background" aria-hidden="true" />}
                  </span>
                </button>
              ))}
            </div>
            {/* Reserved line: choosing a taken colour says what it costs without moving the form. */}
            <p className="min-h-4 text-xs leading-4 text-muted-foreground">
              {colorClash ?? (slotUsage.size > 0 ? 'Il punto vuoto segna un colore già di un altro centro.' : '')}
            </p>
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
                  ref={budgetRef}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="50"
                  placeholder="0"
                  value={budgetAmount}
                  onChange={(e) => setField('budgetAmount', e.target.value)}
                  className="pl-7 font-mono"
                />
              </div>
              <SegmentedControl<CostCenterBudgetPeriod>
                options={[
                  { value: 'monthly', label: 'Mensile' },
                  { value: 'annual', label: 'Annuale' },
                ]}
                value={budgetPeriod}
                onChange={(value) => setField('budgetPeriod', value)}
                aria-label="Periodo del tetto di spesa"
                className="sm:w-[180px]"
              />
            </div>
            <p className="text-xs text-muted-foreground">{describeCeilingHint(budgetPeriod)}</p>
          </div>
        </div>
    </ResponsiveModal>
  );
}
