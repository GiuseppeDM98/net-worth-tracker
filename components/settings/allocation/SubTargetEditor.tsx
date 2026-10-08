'use client';

/**
 * One subcategory row of a class in Impostazioni › Allocazione › Target per classe: name, share of
 * the class, delete — and, once named, the «Traccia asset specifici» switch with its asset list
 * behind a Collapsible that is NOT force-mounted (PERF-13): a closed list is not in the DOM, so a
 * keystroke elsewhere on the page renders no hidden editor.
 *
 * A controlled row: `target` in, `onChange(patch)` out (the class editor patches its row by copy).
 * The field ids (`targetFieldId`) are what «Salva» sends the focus to.
 */

import { ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { targetFieldId, type SubTargetDraft } from '@/lib/utils/settingsDraft';
import type { AssetClass } from '@/types/assets';
import { INTERACTIVE_CONTROL_CLASS, pctLabel } from '@/components/settings/tabs/shared';

const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100;

/** The Collapsible's classes: fade in and out, nothing painted while closed. */
export const COLLAPSIBLE_CONTENT_CLASS = cn(
  'overflow-hidden motion-safe:transition-all motion-safe:duration-200 motion-reduce:transition-none',
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
  'data-[state=closed]:hidden'
);

export interface SubTargetEditorProps {
  assetClass: AssetClass;
  /** The row's index in the class's `subTargets` (the ids and the focus use it, not the sorted position). */
  index: number;
  target: SubTargetDraft;
  /** The class's known subcategory names, offered by the name field's datalist. */
  datalistId: string;
  onChange: (patch: Partial<SubTargetDraft>) => void;
  onRemove: () => void;
}

export function SubTargetEditor({ assetClass, index, target, datalistId, onChange, onRemove }: SubTargetEditorProps) {
  const specificAssetTotal = target.specificAssets.reduce((sum, asset) => sum + asset.targetPercentage, 0);
  const isValidSpecificTotal = Math.abs(specificAssetTotal - 100) < 0.01;

  const updateSpecificAsset = (assetIndex: number, patch: { name?: string; targetPercentage?: number }) =>
    onChange({ specificAssets: target.specificAssets.map((asset, i) => (i === assetIndex ? { ...asset, ...patch } : asset)) });

  return (
    <div className="space-y-3 py-3">
      {/* Name + % + delete */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            id={targetFieldId.subName(assetClass, index)}
            placeholder="Nome sottocategoria"
            value={target.name}
            onChange={(e) => onChange({ name: e.target.value })}
            list={datalistId}
            aria-label="Nome sottocategoria"
            className={cn('text-sm', INTERACTIVE_CONTROL_CLASS)}
          />
        </div>
        <Input
          id={targetFieldId.subPct(assetClass, index)}
          type="number"
          step="0.01"
          min="0"
          max="100"
          aria-label={`Percentuale di ${target.name || 'sottocategoria'}`}
          className={cn('w-24 shrink-0 text-right font-mono', INTERACTIVE_CONTROL_CLASS)}
          value={target.percentage}
          onChange={(e) => onChange({ percentage: roundToTwoDecimals(parseFloat(e.target.value) || 0) })}
        />
        <span className="shrink-0 text-sm text-muted-foreground">%</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label={`Rimuovi ${target.name || 'sottocategoria'}`}
          className="h-11 w-11 shrink-0 desktop:h-8 desktop:w-8"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {/* Specific assets toggle + expand */}
      {target.name && (
        <div className="ml-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch
                id={`specific-${assetClass}-${index}`}
                checked={target.specificAssetsEnabled}
                onCheckedChange={(checked) => onChange({ specificAssetsEnabled: checked })}
                className={INTERACTIVE_CONTROL_CLASS}
              />
              <Label htmlFor={`specific-${assetClass}-${index}`} className="cursor-pointer text-xs text-muted-foreground">
                Traccia asset specifici
              </Label>
            </div>
            {target.specificAssetsEnabled && (
              <span
                className={cn(
                  'font-mono text-xs font-semibold tabular-nums',
                  isValidSpecificTotal ? 'text-muted-foreground' : 'text-destructive'
                )}
              >
                {pctLabel(specificAssetTotal)}
                {!isValidSpecificTotal && ' ≠ 100%'}
              </span>
            )}
          </div>

          {target.specificAssetsEnabled && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start text-xs"
                onClick={() => onChange({ expanded: !target.expanded })}
              >
                <ChevronDown
                  className={cn(
                    'mr-1.5 h-3 w-3 transition-transform duration-200 motion-reduce:transition-none',
                    target.expanded && 'rotate-180'
                  )}
                />
                {target.expanded ? 'Nascondi' : 'Mostra'} asset specifici
                {target.specificAssets.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground">({target.specificAssets.length})</span>
                )}
              </Button>

              <Collapsible open={target.expanded}>
                <CollapsibleContent className={COLLAPSIBLE_CONTENT_CLASS}>
                  <div className="mt-1 space-y-2">
                    {target.specificAssets.map((specificAsset, specificIndex) => (
                      <div key={specificIndex} className="flex items-center gap-2">
                        <Input
                          id={targetFieldId.assetName(assetClass, index, specificIndex)}
                          placeholder="Ticker/Nome (es. AAPL)"
                          value={specificAsset.name}
                          onChange={(e) => updateSpecificAsset(specificIndex, { name: e.target.value })}
                          aria-label="Nome asset specifico"
                          className={cn('flex-1 text-sm', INTERACTIVE_CONTROL_CLASS)}
                        />
                        <Input
                          id={targetFieldId.assetPct(assetClass, index, specificIndex)}
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          aria-label={`Percentuale di ${specificAsset.name || 'asset specifico'}`}
                          className={cn('w-24 shrink-0 text-right font-mono text-sm', INTERACTIVE_CONTROL_CLASS)}
                          value={specificAsset.targetPercentage}
                          onChange={(e) =>
                            updateSpecificAsset(specificIndex, { targetPercentage: roundToTwoDecimals(parseFloat(e.target.value) || 0) })
                          }
                        />
                        <span className="shrink-0 text-xs text-muted-foreground">%</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0 desktop:h-8 desktop:w-8"
                          aria-label={`Rimuovi ${specificAsset.name || 'asset specifico'}`}
                          onClick={() => onChange({ specificAssets: target.specificAssets.filter((_, i) => i !== specificIndex) })}
                        >
                          <Trash2 className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      id={targetFieldId.assetAdd(assetClass, index)}
                      variant="outline"
                      size="sm"
                      className="h-11 w-full text-xs desktop:h-8"
                      onClick={() => onChange({ specificAssets: [...target.specificAssets, { name: '', targetPercentage: 0 }] })}
                    >
                      <Plus className="mr-1.5 h-3 w-3" />
                      Aggiungi asset specifico
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
        </div>
      )}
    </div>
  );
}
