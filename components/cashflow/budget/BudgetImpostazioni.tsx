'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import type { BudgetAllocationValidation } from '@/lib/utils/budgetUtils';
import { DEFAULT_ALERT_THRESHOLDS } from '@/types/budget';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import {
  ALERTS_SETTING_FOOTER,
  ALERTS_SETTING_READING,
  CEILING_SETTING_FOOTER,
  CEILING_SETTING_INVALID,
  describeCeilingSetting,
} from '@/lib/utils/budgetNarrative';

interface BudgetImpostazioniProps {
  overallMonthlyAmount: number | undefined;
  alertsEnabled: boolean;
  alertThresholds: number[];
  validation: BudgetAllocationValidation;
  isDemo: boolean;
  onOverallChange: (amount: number | undefined) => void;
  onAlertsEnabledChange: (enabled: boolean) => void;
  onAlertThresholdsChange: (thresholds: number[]) => void;
}

/**
 * «Impostazioni» — the ceiling and the threshold alerts, below the grid and behind a
 * disclosure, like Dividendi's «Dettaglio»: they are configuration, not a reading of the
 * month, so they do not earn a place in the grid. Open by default only while no ceiling is
 * set — the one first-use condition that justifies it (DESIGN.md → Collapsible).
 *
 * The two blocks take the tile's cadence (eyebrow, aside, reading, then the controls); the
 * allocation feedback here is a reading, while the Per categoria tile's is the inventory's.
 */
export function BudgetImpostazioni({
  overallMonthlyAmount,
  alertsEnabled,
  alertThresholds,
  validation,
  isDemo,
  onOverallChange,
  onAlertsEnabledChange,
  onAlertThresholdsChange,
}: BudgetImpostazioniProps) {
  const [open, setOpen] = useState(overallMonthlyAmount == null);
  const hasCeiling = overallMonthlyAmount != null && overallMonthlyAmount > 0;

  const toggleThreshold = (threshold: number) => {
    const next = alertThresholds.includes(threshold)
      ? alertThresholds.filter((t) => t !== threshold)
      : [...alertThresholds, threshold].sort((a, b) => a - b);
    onAlertThresholdsChange(next);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left"
        aria-label="Impostazioni del budget"
      >
        <span className="flex items-baseline gap-2.5">
          <span className={TILE_EYEBROW_CLASS}>Impostazioni</span>
          <span className="text-[13px] text-muted-foreground">
            {hasCeiling ? (
              <>
                tetto <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(overallMonthlyAmount, true)}</span> · avvisi{' '}
                {alertsEnabled ? 'attivi' : 'disattivati'}
              </>
            ) : (
              'tetto mensile, avvisi e soglie'
            )}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Tetto complessivo mensile" aside={<span>su tutte le spese del mese</span>} reading={describeCeilingSetting(validation)}>
              <div className="mt-3.5 flex flex-col gap-1.5">
                <Label htmlFor="overall-budget" className="text-[13px]">
                  Tetto (€)
                </Label>
                <Input
                  id="overall-budget"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  disabled={isDemo}
                  value={overallMonthlyAmount ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onOverallChange(v === '' ? undefined : parseFloat(v) || 0);
                  }}
                  placeholder="Nessun limite complessivo"
                  className="w-[200px] font-mono tabular-nums"
                  aria-invalid={!validation.valid}
                />
              </div>
              <NarrativeText
                segments={validation.valid ? CEILING_SETTING_FOOTER : CEILING_SETTING_INVALID}
                className={cn('mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45]', validation.valid ? 'text-muted-foreground' : 'text-destructive')}
              />
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile
              eyebrow="Avvisi soglia"
              aside={<span>qui e nell&apos;email mensile</span>}
              reading={ALERTS_SETTING_READING}
            >
              <div className="mt-3.5 flex items-center justify-between gap-3">
                <Label htmlFor="alerts-enabled" className="cursor-pointer text-[13px]">
                  Avvisi attivi
                </Label>
                <Switch id="alerts-enabled" checked={alertsEnabled} disabled={isDemo} onCheckedChange={onAlertsEnabledChange} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Soglie di avviso">
                {DEFAULT_ALERT_THRESHOLDS.map((t) => {
                  const active = alertThresholds.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={active}
                      disabled={isDemo || !alertsEnabled}
                      onClick={() => toggleThreshold(t)}
                      className={cn(
                        'h-8 rounded-full border px-3 font-mono text-[12px] tabular-nums transition-colors disabled:opacity-50',
                        active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground',
                      )}
                    >
                      {t}%
                    </button>
                  );
                })}
              </div>
              <NarrativeText
                segments={ALERTS_SETTING_FOOTER}
                className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
              />
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
