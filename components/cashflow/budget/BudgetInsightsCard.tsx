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
 *
 * Two things the labels must state explicitly, because neither is guessable from
 * the numbers alone (both were read wrong in practice):
 *  - Scope: every metric here covers only the categories the user gave a budget
 *    to (the opt-in focus set), never all of the month's spending.
 *  - Horizon: the at-risk list shows END-OF-MONTH PROJECTIONS, not money already
 *    spent — a `~` prefix alone was not enough of a signal.
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
      <h3 className="text-sm font-semibold">Approfondimenti</h3>
      <p className="mt-1 mb-3 text-xs text-muted-foreground">
        Solo le categorie a cui hai assegnato un budget, non tutte le spese del mese.
      </p>

      <dl className="divide-y divide-border text-sm">
        {topCategory && (
          <div className="flex items-start justify-between gap-3 py-2 first:pt-0">
            <dt className="text-muted-foreground">
              Categoria con più spesa
              <span className="block text-xs text-muted-foreground/70">Speso da inizio mese</span>
            </dt>
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
          <div className="flex items-start justify-between gap-3 py-2">
            <dt className="text-muted-foreground">
              Spesa vs atteso a oggi
              <span className="block text-xs text-muted-foreground/70">
                Confronto con la tua media dei mesi scorsi, riproporzionata a oggi
              </span>
            </dt>
            <dd
              className={`shrink-0 font-mono tabular-nums font-medium ${deltaPct > 0 ? 'text-destructive' : 'text-positive'}`}
            >
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
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Proiezione a fine mese
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Stima di quanto spenderai entro fine mese al ritmo attuale — non è quanto hai già speso.
          </p>
          <ul className="mt-2 space-y-1">
            {categoriesAtRisk.slice(0, 3).map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">{c.label}</span>
                <span className="font-mono tabular-nums text-destructive shrink-0">
                  ~{cachedFormatCurrencyEUR(c.projectedTotal)} su {cachedFormatCurrencyEUR(c.budgetAmount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
