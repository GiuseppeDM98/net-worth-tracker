'use client';

/**
 * "Allocazione ideale" (Impostazioni → Allocazione) — the weight optimizer's objectives
 *. A controlled leaf: the page owns the state, the load and
 * the Salva button; this component only edits `value` in place through `onChange`. Nothing here
 * writes to Firestore on its own (no second Save path — doc/guide/impostazioni.md § Settings —
 * the FIVE places).
 */

import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/services/chartService';
import { buildIdealAllocationInput, describeIdealAllocation, describeSecondLevelSetupHint } from '@/lib/utils/settingsNarrative';
import type { SecondLevelGap } from '@/lib/utils/weightOptimizer';
import { describeSecondLevelGaps } from '@/lib/utils/weightOptimizerNarrative';
import type { AssetClass, IdealAllocationSettings, ObjectivePriority } from '@/types/assets';

const PRIORITY_OPTIONS: Array<{ value: ObjectivePriority; label: string }> = [
  { value: 'essential', label: 'Essenziale' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Bassa' },
];

const LEVERAGE_PRIORITY_OPTIONS: Array<{ value: ObjectivePriority | 'off'; label: string }> = [
  { value: 'off', label: 'Off' },
  ...PRIORITY_OPTIONS,
];

function createGroupLimitId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface FactorClassOption {
  assetClass: AssetClass;
  label: string;
}

export interface TradableAssetOption {
  id: string;
  label: string;
}

interface IdealAllocationTileProps {
  value: IdealAllocationSettings;
  onChange: (next: IdealAllocationSettings) => void;
  /** deriveTargetLeverageRatio(targets) — read-only, shown next to the Leva priority select. */
  targetLeverageRatio: number;
  /** Classes with sub-category targets enabled — the only ones a second-level objective can target. */
  factorClassOptions: FactorClassOption[];
  /** Classes with target > 0 but sub-categories still OFF (§3.2's guided hint). */
  secondLevelReadyClasses: FactorClassOption[];
  /** §3.3/G5 — instruments a second-level objective cannot place today (preventive, never blocks Salva). */
  secondLevelGaps: SecondLevelGap[];
  tradableAssets: TradableAssetOption[];
  disabled?: boolean;
  /**
   * Without the surrounding `Tile`: the editor now also lives in a modal (Allocazione › Accumulo,
   * RV6), and a tile inside a modal is a card in a card.
   */
  bare?: boolean;
}

const rowLabelClass = 'text-[13px] font-medium';
const rowHintClass = 'mt-0.5 text-[11px] leading-[1.4] text-muted-foreground';

export function IdealAllocationTile({
  value,
  onChange,
  targetLeverageRatio,
  factorClassOptions,
  secondLevelReadyClasses,
  secondLevelGaps,
  tradableAssets,
  disabled = false,
  bare = false,
}: IdealAllocationTileProps) {
  const factorObjectiveByClass = new Map(value.factorObjectives.map((f) => [f.assetClass, f.priority]));
  const assetOptions: MultiSelectOption[] = tradableAssets.map((a) => ({ value: a.id, label: a.label }));

  const readingInput = buildIdealAllocationInput(value, targetLeverageRatio);

  const usedInstrumentAssetIds = new Set(value.instrumentLimits.map((l) => l.assetId));
  const firstUnusedAssetId = tradableAssets.find((a) => !usedInstrumentAssetIds.has(a.id))?.id;

  const updateInstrumentLimit = (assetId: string, patch: Partial<{ assetId: string; minPct?: number; maxPct?: number }>) => {
    onChange({
      ...value,
      instrumentLimits: value.instrumentLimits.map((limit) =>
        limit.assetId === assetId ? { ...limit, ...patch } : limit
      ),
    });
  };

  const removeInstrumentLimit = (assetId: string) => {
    onChange({ ...value, instrumentLimits: value.instrumentLimits.filter((l) => l.assetId !== assetId) });
  };

  const addInstrumentLimit = () => {
    if (!firstUnusedAssetId) return;
    onChange({ ...value, instrumentLimits: [...value.instrumentLimits, { assetId: firstUnusedAssetId }] });
  };

  const updateGroupLimit = (id: string, patch: Partial<IdealAllocationSettings['groupLimits'][number]>) => {
    onChange({
      ...value,
      groupLimits: value.groupLimits.map((group) => (group.id === id ? { ...group, ...patch } : group)),
    });
  };

  const removeGroupLimit = (id: string) => {
    onChange({ ...value, groupLimits: value.groupLimits.filter((g) => g.id !== id) });
  };

  const addGroupLimit = () => {
    onChange({
      ...value,
      groupLimits: [
        ...value.groupLimits,
        { id: createGroupLimitId(), label: '', assetIds: [], maxPct: 0, priority: 'medium' },
      ],
    });
  };

  const toggleFactorObjective = (assetClass: AssetClass, checked: boolean) => {
    if (checked) {
      onChange({
        ...value,
        factorObjectives: [...value.factorObjectives, { assetClass, priority: 'medium' }],
      });
    } else {
      onChange({
        ...value,
        factorObjectives: value.factorObjectives.filter((f) => f.assetClass !== assetClass),
      });
    }
  };

  const setFactorObjectivePriority = (assetClass: AssetClass, priority: ObjectivePriority) => {
    onChange({
      ...value,
      factorObjectives: value.factorObjectives.map((f) => (f.assetClass === assetClass ? { ...f, priority } : f)),
    });
  };

  const content = (
    <>
      <div className="mt-3.5 flex items-center justify-between gap-4 py-2">
        <div className="min-w-0">
          <p className={rowLabelClass}>Attiva</p>
          <p className={rowHintClass}>Propone i pesi degli strumenti: nel portafoglio modello e nel passo Target del PAC.</p>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
          disabled={disabled}
          aria-label="Attiva allocazione ideale"
        />
      </div>

      {value.enabled && (
        <div className="mt-1 flex flex-col divide-y divide-border">
          {/* Classi */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0">
              <p className={rowLabelClass}>Classi</p>
              <p className={rowHintClass}>Target delle classi qui sopra</p>
            </div>
            <Select
              value={value.classPriority}
              onValueChange={(priority: ObjectivePriority) => onChange({ ...value, classPriority: priority })}
              disabled={disabled}
            >
              <SelectTrigger className="w-40" aria-label="Priorità classi">
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

          {/* Leva */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <div className="min-w-0">
              <p className={rowLabelClass}>Leva</p>
              <p className={rowHintClass}>Leva target: {formatNumber(targetLeverageRatio, 2)}×</p>
            </div>
            <Select
              value={value.leveragePriority}
              onValueChange={(priority: ObjectivePriority | 'off') => onChange({ ...value, leveragePriority: priority })}
              disabled={disabled}
            >
              <SelectTrigger className="w-40" aria-label="Priorità leva">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEVERAGE_PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Secondo livello (sottocategorie) */}
          <div className="py-3">
            <p className={rowLabelClass}>Secondo livello (sottocategorie)</p>
            <p className={rowHintClass}>
              Il significato lo scegli tu per ogni classe: per l&apos;azionario, per esempio, i fattori (mercato,
              momentum, small cap value).
            </p>
            {factorClassOptions.length === 0 ? (
              <p className={rowHintClass}>Nessuna classe con sotto-categorie abilitate qui sopra.</p>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {factorClassOptions.map((opt) => {
                  const priority = factorObjectiveByClass.get(opt.assetClass);
                  return (
                    <div key={opt.assetClass} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <label className="flex min-w-0 items-center gap-2 text-[13px]">
                        <Checkbox
                          checked={priority !== undefined}
                          onCheckedChange={(state) => toggleFactorObjective(opt.assetClass, state === true)}
                          disabled={disabled}
                          aria-label={`Secondo livello — ${opt.label}`}
                        />
                        {opt.label}
                      </label>
                      {priority !== undefined && (
                        <Select
                          value={priority}
                          onValueChange={(p: ObjectivePriority) => setFactorObjectivePriority(opt.assetClass, p)}
                          disabled={disabled}
                        >
                          <SelectTrigger className="w-40" aria-label={`Priorità secondo livello — ${opt.label}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRIORITY_OPTIONS.map((p) => (
                              <SelectItem key={p.value} value={p.value}>
                                {p.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {secondLevelReadyClasses.length > 0 && (
              <p className={cn(rowHintClass, 'mt-2')}>
                {describeSecondLevelSetupHint(secondLevelReadyClasses.map((c) => c.label))}
              </p>
            )}
            {secondLevelGaps.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {describeSecondLevelGaps(secondLevelGaps).map((line) => (
                  <p key={line} className={cn(rowHintClass, 'text-warning-foreground')}>
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Limiti per strumento */}
          <div className="py-3">
            <p className={cn(TILE_SUB_EYEBROW_CLASS)}>Limiti per strumento</p>
            <div className="mt-2 flex flex-col gap-2">
              {value.instrumentLimits.map((limit) => {
                const options = tradableAssets.filter(
                  (a) => a.id === limit.assetId || !usedInstrumentAssetIds.has(a.id)
                );
                return (
                  <div key={limit.assetId} className="flex flex-wrap items-center gap-2">
                    <Select
                      value={limit.assetId}
                      onValueChange={(assetId: string) => updateInstrumentLimit(limit.assetId, { assetId })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="w-52" aria-label="Strumento">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Min %"
                      className="w-24"
                      value={limit.minPct ?? ''}
                      onChange={(e) =>
                        updateInstrumentLimit(limit.assetId, {
                          minPct: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      disabled={disabled}
                      aria-label={`Minimo % — ${limit.assetId}`}
                    />
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Max %"
                      className="w-24"
                      value={limit.maxPct ?? ''}
                      onChange={(e) =>
                        updateInstrumentLimit(limit.assetId, {
                          maxPct: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      disabled={disabled}
                      aria-label={`Massimo % — ${limit.assetId}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeInstrumentLimit(limit.assetId)}
                      disabled={disabled}
                      aria-label="Rimuovi limite"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addInstrumentLimit}
                disabled={disabled || !firstUnusedAssetId}
                className="w-fit"
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi limite
              </Button>
            </div>
          </div>

          {/* Limiti di gruppo */}
          <div className="py-3">
            <p className={cn(TILE_SUB_EYEBROW_CLASS)}>Limiti di gruppo</p>
            <div className="mt-2 flex flex-col gap-2">
              {value.groupLimits.map((group) => (
                <div key={group.id} className="flex flex-col gap-2 rounded-lg border border-border p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      placeholder="Etichetta"
                      className="w-40"
                      value={group.label}
                      onChange={(e) => updateGroupLimit(group.id, { label: e.target.value })}
                      disabled={disabled}
                      aria-label="Etichetta del gruppo"
                    />
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="Tetto %"
                      className="w-24"
                      value={group.maxPct}
                      onChange={(e) => updateGroupLimit(group.id, { maxPct: Number(e.target.value) || 0 })}
                      disabled={disabled}
                      aria-label="Tetto % del gruppo"
                    />
                    <Select
                      value={group.priority}
                      onValueChange={(priority: ObjectivePriority) => updateGroupLimit(group.id, { priority })}
                      disabled={disabled}
                    >
                      <SelectTrigger className="w-36" aria-label="Priorità del gruppo">
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeGroupLimit(group.id)}
                      disabled={disabled}
                      aria-label="Rimuovi gruppo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <MultiSelect
                    options={assetOptions}
                    defaultValue={group.assetIds}
                    onValueChange={(assetIds) => updateGroupLimit(group.id, { assetIds })}
                    placeholder="Strumenti del gruppo"
                    disabled={disabled}
                  />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addGroupLimit} disabled={disabled} className="w-fit">
                <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi gruppo
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (bare) return <div className="min-w-0">{content}</div>;
  return (
    <Tile eyebrow="Criteri del modello" reading={describeIdealAllocation(readingInput)}>
      {content}
    </Tile>
  );
}
