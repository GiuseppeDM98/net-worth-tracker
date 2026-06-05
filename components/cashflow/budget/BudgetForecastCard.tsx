'use client';

import { Card } from '@/components/ui/card';
import { SpendingForecast } from '@/types/budget';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { progressFillColor } from './budgetProgressStyle';

interface BudgetForecastCardProps {
  forecast: SpendingForecast;
}

/**
 * End-of-month spending projection for the overall budget.
 *
 * Hero number = projected end-of-month total, with the budget as the reference;
 * three flat rows underneath give residual budget / estimated overspend / daily
 * allowance. A thin track shows spent-so-far against the budget.
 */
export function BudgetForecastCard({ forecast }: BudgetForecastCardProps) {
  const { projectedTotal, budgetAmount, remainingBudget, estimatedOverspend, dailyAllowance, spentSoFar } = forecast;
  const overspending = estimatedOverspend > 0;
  const usedRatio = budgetAmount > 0 ? spentSoFar / budgetAmount : 0;

  return (
    <Card className="p-5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        Proiezione fine mese
      </p>
      <p className="text-[36px] leading-none font-bold font-mono tracking-[-0.02em] tabular-nums mt-1">
        {cachedFormatCurrencyEUR(projectedTotal)}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        su un budget di{' '}
        <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(budgetAmount)}</span>
      </p>

      <div className="mt-4 h-1.5 bg-muted rounded-full overflow-hidden" aria-hidden>
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, usedRatio * 100)}%`, backgroundColor: progressFillColor(usedRatio) }}
        />
      </div>

      <dl className="mt-4 divide-y divide-border text-sm">
        <div className="flex items-center justify-between py-2">
          <dt className="text-muted-foreground">{overspending ? 'Sforamento stimato' : 'Budget residuo previsto'}</dt>
          <dd className={`font-mono tabular-nums font-medium ${overspending ? 'text-destructive' : 'text-positive'}`}>
            {cachedFormatCurrencyEUR(overspending ? estimatedOverspend : remainingBudget)}
          </dd>
        </div>
        <div className="flex items-center justify-between py-2">
          <dt className="text-muted-foreground">Spesa fino a oggi</dt>
          <dd className="font-mono tabular-nums">{cachedFormatCurrencyEUR(spentSoFar)}</dd>
        </div>
        <div className="flex items-center justify-between py-2">
          <dt className="text-muted-foreground">Disponibile al giorno</dt>
          <dd className="font-mono tabular-nums">{cachedFormatCurrencyEUR(dailyAllowance)}</dd>
        </div>
      </dl>
    </Card>
  );
}
