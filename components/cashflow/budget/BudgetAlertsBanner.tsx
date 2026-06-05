'use client';

import { AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { BudgetAlert } from '@/types/budget';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

interface BudgetAlertsBannerProps {
  alerts: BudgetAlert[];
}

/**
 * In-app budget alerts. One row per fired alert (highest urgency first), colour
 * sourced from semantic tokens: exceeded → destructive, warning → warning.
 * Renders nothing when there are no alerts.
 */
export function BudgetAlertsBanner({ alerts }: BudgetAlertsBannerProps) {
  if (alerts.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-warning-foreground" />
        <h3 className="text-sm font-semibold">Avvisi budget</h3>
      </div>
      <ul className="divide-y divide-border">
        {alerts.map((alert) => {
          const isExceeded = alert.level === 'exceeded';
          const colorClass = isExceeded ? 'text-destructive' : 'text-warning-foreground';
          const pct = Math.round(alert.usedRatio * 100);
          return (
            <li key={alert.key} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm truncate">{alert.label}</p>
                <p className="text-xs text-muted-foreground font-mono tabular-nums">
                  {cachedFormatCurrencyEUR(alert.spent)} / {cachedFormatCurrencyEUR(alert.budgetAmount)}
                  {alert.forecastedOverrun && !isExceeded ? ' · sforamento previsto' : ''}
                </p>
              </div>
              <span className={`text-sm font-semibold font-mono tabular-nums shrink-0 ${colorClass}`}>
                {isExceeded ? 'Superato' : `${pct}%`}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
