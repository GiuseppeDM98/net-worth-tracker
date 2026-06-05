'use client';

import { Card } from '@/components/ui/card';
import { BudgetInsights } from '@/types/budget';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';

interface BudgetInsightsCardProps {
  insights: BudgetInsights;
}

/**
 * Actionable budget insights for the current month: top spending category,
 * categories at risk of overrun, current vs trailing-average spend, and the
 * average daily spend so far. Rows with no data are hidden.
 */
export function BudgetInsightsCard({ insights }: BudgetInsightsCardProps) {
  const { topCategory, categoriesAtRisk, currentMonthExpenses, expectedSpendToDate, averageDailySpend } = insights;

  // Compare the partial current month against what you'd typically have spent by
  // today (prior-months average prorated to the day), not against a full month.
  const hasComparison = expectedSpendToDate > 0;
  const deltaPct = hasComparison
    ? ((currentMonthExpenses - expectedSpendToDate) / expectedSpendToDate) * 100
    : 0;

  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold mb-3">Approfondimenti</h3>
      <dl className="divide-y divide-border text-sm">
        {topCategory && (
          <div className="flex items-center justify-between gap-3 py-2 first:pt-0">
            <dt className="text-muted-foreground">Categoria con più spesa</dt>
            <dd className="text-right">
              <span className="block truncate">{topCategory.label}</span>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {cachedFormatCurrencyEUR(topCategory.amount)}
              </span>
            </dd>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 py-2">
          <dt className="text-muted-foreground">Categorie a rischio</dt>
          <dd className="font-mono tabular-nums font-medium">
            {categoriesAtRisk.length > 0 ? (
              <span className="text-destructive">{categoriesAtRisk.length}</span>
            ) : (
              <span className="text-positive">0</span>
            )}
          </dd>
        </div>

        {hasComparison && (
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-muted-foreground">Spesa vs atteso a oggi</dt>
            <dd className={`font-mono tabular-nums font-medium ${deltaPct > 0 ? 'text-destructive' : 'text-positive'}`}>
              {deltaPct > 0 ? '+' : ''}{deltaPct.toFixed(1)}%
            </dd>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 py-2 last:pb-0">
          <dt className="text-muted-foreground">Media giornaliera</dt>
          <dd className="font-mono tabular-nums">{cachedFormatCurrencyEUR(averageDailySpend)}</dd>
        </div>
      </dl>

      {categoriesAtRisk.length > 0 && (
        <ul className="mt-3 space-y-1">
          {categoriesAtRisk.slice(0, 3).map((c) => (
            <li key={c.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-muted-foreground">{c.label}</span>
              <span className="font-mono tabular-nums text-destructive shrink-0">
                ~{cachedFormatCurrencyEUR(c.projectedTotal)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
