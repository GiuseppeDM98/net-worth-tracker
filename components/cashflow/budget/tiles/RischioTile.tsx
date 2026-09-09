'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { BudgetRiskSummary } from '@/types/budget';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface RischioTileProps {
  risk: BudgetRiskSummary;
  reading: Narrative;
  footer: Narrative;
  className?: string;
}

/**
 * "Quali categorie stanno per sforare?" — the monthly budgets whose month-end projection
 * exceeds their amount, largest overrun first. The aside names the horizon («a fine mese»)
 * and the footer the scope, because neither is guessable from the rows: these are
 * projections, not money spent, and only over the categories the user gave a budget to.
 * The crossed thresholds live in the Avvisi tile — no row appears in both.
 */
export function RischioTile({ risk, reading, footer, className }: RischioTileProps) {
  return (
    <Tile eyebrow="Categorie a rischio" aside={<span>a fine mese</span>} reading={reading} className={className}>
      {risk.atRisk.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {risk.atRisk.map((row) => (
            <li key={row.key} className="flex items-center justify-between gap-3 py-[9px]">
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{row.label}</span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                ~{cachedFormatCurrencyEUR(row.projectedTotal, true)} su {cachedFormatCurrencyEUR(row.budgetAmount, true)}
              </span>
              <span className="w-[60px] shrink-0 text-right font-mono text-[13px] tabular-nums text-destructive">
                +{cachedFormatCurrencyEUR(row.overBy, true)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <NarrativeText
        segments={footer}
        className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
        figureClassName="font-medium"
      />
    </Tile>
  );
}
