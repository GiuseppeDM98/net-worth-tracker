'use client';

import { useState } from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { BudgetAllocationValidation } from '@/lib/utils/budgetUtils';
import { DEFAULT_ALERT_THRESHOLDS } from '@/types/budget';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

interface BudgetSettingsCardProps {
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
 * Settings for the overall spending ceiling and threshold alerts.
 *
 * Collapsed once the overall budget is configured (config-first); shows live
 * allocation feedback (allocated / available) and an inline error when the sum
 * of category budgets exceeds the overall budget.
 */
export function BudgetSettingsCard({
  overallMonthlyAmount,
  alertsEnabled,
  alertThresholds,
  validation,
  isDemo,
  onOverallChange,
  onAlertsEnabledChange,
  onAlertThresholdsChange,
}: BudgetSettingsCardProps) {
  const [open, setOpen] = useState(overallMonthlyAmount == null);

  const toggleThreshold = (threshold: number) => {
    const next = alertThresholds.includes(threshold)
      ? alertThresholds.filter((t) => t !== threshold)
      : [...alertThresholds, threshold].sort((a, b) => a - b);
    onAlertThresholdsChange(next);
  };

  return (
    <Card className="p-0 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-2 px-5 py-4 text-left"
            aria-expanded={open}
          >
            <span className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Impostazioni budget</span>
            </span>
            <span className="flex items-center gap-3">
              {overallMonthlyAmount != null && (
                <span className="text-sm font-mono tabular-nums text-muted-foreground">
                  {cachedFormatCurrencyEUR(overallMonthlyAmount)}/mese
                </span>
              )}
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-5 border-t border-border pt-4">
            {/* Overall budget */}
            <div className="space-y-1.5">
              <Label htmlFor="overall-budget">Budget complessivo mensile (€)</Label>
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
                className="font-mono tabular-nums"
              />
              {overallMonthlyAmount != null && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Allocato:{' '}
                    <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(validation.allocated)}</span>
                  </span>
                  <span className={validation.valid ? 'text-muted-foreground' : 'text-destructive'}>
                    {validation.valid ? 'Disponibile: ' : 'Eccedenza: '}
                    <span className="font-mono tabular-nums">
                      {cachedFormatCurrencyEUR(Math.abs(validation.available))}
                    </span>
                  </span>
                </div>
              )}
              {!validation.valid && (
                <p className="text-xs text-destructive">
                  La somma dei budget di categoria supera il budget complessivo. Le modifiche non vengono salvate
                  finché non rientri nel limite.
                </p>
              )}
            </div>

            {/* Alerts */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="alerts-enabled" className="cursor-pointer">Avvisi soglia</Label>
                <Switch
                  id="alerts-enabled"
                  checked={alertsEnabled}
                  disabled={isDemo}
                  onCheckedChange={onAlertsEnabledChange}
                />
              </div>
              {alertsEnabled && (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Soglie di avviso">
                  {DEFAULT_ALERT_THRESHOLDS.map((t) => {
                    const active = alertThresholds.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={active}
                        disabled={isDemo}
                        onClick={() => toggleThreshold(t)}
                        className={`rounded-full border px-3 py-1 text-xs font-mono tabular-nums transition-colors ${
                          active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'
                        }`}
                      >
                        {t}%
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Gli avvisi compaiono qui e nel riepilogo email mensile quando una categoria supera una soglia.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
