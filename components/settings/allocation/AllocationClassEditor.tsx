'use client';

/**
 * One asset class of Impostazioni › Allocazione › Target per classe: the class row (its target,
 * the «fisso €» switch for Liquidità, the Sottocategorie toggle) and, behind a Collapsible that is
 * NOT force-mounted (since 2026-10-08), the subcategory group — enable switch, the rows sorted by name,
 * «Aggiungi sottocategoria». A collapsed group is not in the DOM.
 *
 * A controlled editor: `draft` in, `onChange(patch)` out; its rows are patched BY COPY, because
 * after a read the draft's rows are shared with the saved baseline (`saved === slices`) and a
 * row mutated in place would move the baseline with it. `categories` follows the named rows
 * (the datalist, the Costi select and the document read it).
 */

import { ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { sumSubTargets, sumsToHundred } from '@/lib/utils/allocationTargetValidation';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { targetFieldId, type AssetClassDraft, type SubTargetDraft } from '@/lib/utils/settingsDraft';
import type { AssetClass } from '@/types/assets';
import { INTERACTIVE_CONTROL_CLASS, pctLabel } from '@/components/settings/tabs/shared';
import { COLLAPSIBLE_CONTENT_CLASS, SubTargetEditor } from './SubTargetEditor';

const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100;

// The class names Allocazione prints (one label map, no English in brackets: «Azioni», never
// «Azioni (Equity)»).
const assetClassLabel = (assetClass: AssetClass): string => ASSET_CLASS_LABELS[assetClass] ?? assetClass;

const emptySubTarget = (name = ''): SubTargetDraft => ({
  name,
  percentage: 0,
  specificAssetsEnabled: false,
  specificAssets: [],
  expanded: false,
});

export interface AllocationClassEditorProps {
  assetClass: AssetClass;
  draft: AssetClassDraft;
  /** The formula owns Azioni and Obbligazioni while it is on: the field is read-only and says so. */
  isAutoCalculated: boolean;
  /** Liquidità only: the fixed euro amount pair, from the slice root. */
  cash?: {
    useFixedAmount: boolean;
    fixedAmount: number;
    onUseFixedAmount: (value: boolean) => void;
    onFixedAmount: (value: number) => void;
  };
  onChange: (patch: Partial<AssetClassDraft>) => void;
}

export function AllocationClassEditor({ assetClass, draft, isAutoCalculated, cash, onChange }: AllocationClassEditorProps) {
  const label = assetClassLabel(assetClass);
  const subTotal = sumSubTargets(draft.subTargets);
  const isValidSubTotal = sumsToHundred(subTotal);
  // A group that does not add up says so ON THE CLASS ROW, closed or open: it used to be visible
  // only inside the group, which could be collapsed.
  const showsSubTotalError = draft.subCategoryEnabled && !isValidSubTotal;
  const datalistId = `${assetClass}-categories`;

  const toggleSubCategories = (enabled: boolean) => {
    if (enabled && draft.subTargets.length === 0) {
      // Enabling for the first time: a 0% row per known category, the names kept in step.
      onChange({ subCategoryEnabled: enabled, subTargets: draft.categories.map((name) => emptySubTarget(name)), categories: draft.categories });
    } else {
      onChange({ subCategoryEnabled: enabled });
    }
  };

  const addSubTarget = () => {
    if (draft.subTargets.some((target) => !target.name.trim())) {
      toast.error("Dai un nome alla sottocategoria vuota prima di aggiungerne un'altra.");
      return;
    }
    const subTargets = [...draft.subTargets, emptySubTarget()];
    onChange({ subTargets, categories: subTargets.map((t) => t.name).filter((n) => n !== '') });
  };

  const removeSubTarget = (index: number) => {
    const subTargets = draft.subTargets.filter((_, i) => i !== index);
    onChange({ subTargets, categories: subTargets.map((t) => t.name) });
  };

  const updateSubTarget = (index: number, patch: Partial<SubTargetDraft>) => {
    const subTargets = draft.subTargets.map((target, i) => (i === index ? { ...target, ...patch } : target));
    const classPatch: Partial<AssetClassDraft> = { subTargets };
    // A rename keeps `categories` in step with the named rows.
    if (patch.name !== undefined) classPatch.categories = subTargets.map((t) => t.name).filter((n) => n !== '');
    onChange(classPatch);
  };

  return (
    <div>
      {/* Asset class main row */}
      <div className="flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">{label}</p>
          {isAutoCalculated && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">Calcolata dalla formula</p>
          )}
        </div>
        {cash && !isAutoCalculated && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Switch
              id="cashFixedToggle"
              checked={cash.useFixedAmount}
              onCheckedChange={cash.onUseFixedAmount}
              className={INTERACTIVE_CONTROL_CLASS}
            />
            <Label htmlFor="cashFixedToggle" className="whitespace-nowrap text-[11px] text-muted-foreground">
              fisso €
            </Label>
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <Input
            id={targetFieldId.classPct(assetClass)}
            type="number"
            step="0.01"
            min="0"
            // No max cap: a single class can exceed 100% of invested capital under leverage.
            // The fixed-cash case is a € amount.
            value={cash?.useFixedAmount ? cash.fixedAmount : draft.targetPercentage || 0}
            onChange={(e) => {
              if (cash?.useFixedAmount) {
                cash.onFixedAmount(parseFloat(e.target.value) || 0);
              } else {
                onChange({ targetPercentage: roundToTwoDecimals(parseFloat(e.target.value) || 0) });
              }
            }}
            disabled={isAutoCalculated}
            aria-label={`Target ${label}`}
            className={cn('w-28 text-right font-mono', INTERACTIVE_CONTROL_CLASS, isAutoCalculated ? 'bg-muted' : '')}
          />
          <span className="w-4 shrink-0 text-sm text-muted-foreground">{cash?.useFixedAmount ? '€' : '%'}</span>
        </div>
        {/* Sub-category expand/collapse */}
        <button
          type="button"
          className={cn(
            'flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-md px-1.5 text-xs transition-colors hover:text-foreground desktop:h-8',
            showsSubTotalError ? 'text-destructive' : 'text-muted-foreground'
          )}
          onClick={() => onChange({ expanded: !draft.expanded })}
          aria-expanded={draft.expanded}
          aria-label={`${draft.expanded ? 'Chiudi' : 'Apri'} sottocategorie di ${label}${
            showsSubTotalError ? ` (sommano ${pctLabel(subTotal)}, non 100%)` : ''
          }`}
        >
          {showsSubTotalError ? (
            <span className="font-mono font-semibold tabular-nums">{pctLabel(subTotal)} ≠ 100%</span>
          ) : (
            <span className="hidden sm:inline">Sottocategorie</span>
          )}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-200 motion-reduce:transition-none', draft.expanded && 'rotate-180')}
          />
        </button>
      </div>

      {/* Sub-categories — expandable, flush to the tile's edge; not in the DOM while closed */}
      <Collapsible open={draft.expanded}>
        <CollapsibleContent className={COLLAPSIBLE_CONTENT_CLASS}>
          <div className="-mx-5 border-t border-border bg-muted/20 px-5">
            {/* Enable toggle + sub-total */}
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <Switch
                  id={targetFieldId.subToggle(assetClass)}
                  checked={draft.subCategoryEnabled}
                  onCheckedChange={toggleSubCategories}
                  className={INTERACTIVE_CONTROL_CLASS}
                />
                <Label htmlFor={targetFieldId.subToggle(assetClass)} className="text-[13px]">
                  Abilita sottocategorie
                </Label>
              </div>
              {draft.subCategoryEnabled && (
                <span className={cn('font-mono text-xs font-semibold tabular-nums', isValidSubTotal ? 'text-muted-foreground' : 'text-destructive')}>
                  {pctLabel(subTotal)}
                  {!isValidSubTotal && ' ≠ 100%'}
                </span>
              )}
            </div>

            {/* Sub-target rows, listed by name; the ids keep the row's index in the draft */}
            {draft.subCategoryEnabled && (
              <div className="pb-4">
                <datalist id={datalistId}>
                  {draft.categories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <div className="divide-y divide-border border-t border-border">
                  {draft.subTargets
                    .map((target, originalIndex) => ({ target, originalIndex }))
                    .sort((a, b) => a.target.name.localeCompare(b.target.name))
                    .map(({ target, originalIndex }) => (
                      <SubTargetEditor
                        key={originalIndex}
                        assetClass={assetClass}
                        index={originalIndex}
                        target={target}
                        datalistId={datalistId}
                        onChange={(patch) => updateSubTarget(originalIndex, patch)}
                        onRemove={() => removeSubTarget(originalIndex)}
                      />
                    ))}
                </div>
                <Button variant="outline" size="sm" className="mt-3 w-full sm:w-auto" onClick={addSubTarget}>
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi sottocategoria
                </Button>
                <p className="mt-2 text-[11px] leading-[1.4] text-muted-foreground">
                  Le sottocategorie sono espresse come percentuale di {label} ({pctLabel(draft.targetPercentage)})
                </p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
