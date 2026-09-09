'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { BudgetAlert } from '@/types/budget';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { dayRef } from '@/lib/utils/budgetNarrative';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface AvvisiTileProps {
  /** The alerts whose threshold was actually crossed (summarizeAlerts). */
  rows: BudgetAlert[];
  enabled: boolean;
  aside: Narrative;
  reading: Narrative;
  footer: Narrative;
  className?: string;
}

/**
 * "Quali soglie ho superato?" — one row per crossed threshold, most urgent first: the name,
 * what is spent against what is budgeted, the used share (or «Superato») and the threshold
 * it crossed. A forecast-only alert is not here — it is a projection, and projections are
 * the Categorie a rischio tile's. When alerts are off the tile says so and why it is empty,
 * rather than disappearing: the user switched them off and may not remember.
 */
export function AvvisiTile({ rows, enabled, aside, reading, footer, className }: AvvisiTileProps) {
  return (
    <Tile eyebrow="Avvisi" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className}>
      {enabled && rows.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {rows.map((alert) => {
            const exceeded = alert.level === 'exceeded';
            return (
              <li key={alert.key} className="flex items-center justify-between gap-3 py-[9px]">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-foreground">{alert.label}</p>
                  <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {cachedFormatCurrencyEUR(alert.spent, true)} su {cachedFormatCurrencyEUR(alert.budgetAmount, true)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <span className={cn('font-mono text-[13px] font-semibold tabular-nums', exceeded ? 'text-destructive' : 'text-warning-foreground')}>
                    {exceeded ? 'Superato' : formatPercentage(alert.usedRatio * 100, 0)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {exceeded && alert.crossedOn !== null ? (
                      <NarrativeText segments={dayRef('il', alert.crossedOn)} className="inline" figureClassName="font-medium" />
                    ) : (
                      <>
                        soglia <span className="font-mono tabular-nums">{alert.threshold}%</span>
                      </>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
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
