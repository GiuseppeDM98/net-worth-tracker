'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { BudgetAlert } from '@/types/budget';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { describeAlertRowCaption } from '@/lib/utils/budgetNarrative';
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

/** The used share's colour: a warning only when the share is ahead of ITS calendar; a fact in red once over. */
function usedShareClass(alert: BudgetAlert): string {
  if (alert.level === 'exceeded') return 'text-destructive';
  return alert.aheadOfCalendar ? 'text-warning-foreground' : 'text-muted-foreground';
}

/**
 * "Quali soglie ho superato?" — one row per crossed threshold, most urgent first: the name,
 * what is spent against what is budgeted, the used share (or «Superato») and, under it, the
 * threshold read against the calendar of the row's own window («soglia 50% · anno al 70%»).
 * A crossed threshold behind its calendar is printed muted, not amber: Tecnologia at 54%
 * with the year at 70% is a number, not a warning — the tile beside this one teaches that a
 * quota says nothing without its calendar, and this tile used to contradict it (2026-09-14).
 * A forecast-only alert is not here — it is a projection, and projections are the Categorie
 * a rischio tile's. When alerts are off the tile says so and why it is empty, rather than
 * disappearing: the user switched them off and may not remember.
 */
export function AvvisiTile({ rows, enabled, aside, reading, footer, className }: AvvisiTileProps) {
  return (
    <Tile eyebrow="Avvisi" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className}>
      {enabled && rows.length > 0 && (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {rows.map((alert) => {
            const exceeded = alert.level === 'exceeded';
            // Two lines: the name against its share, then the figures against the calendar clause —
            // side by side the clause («soglia 50% · anno al 70%») wrapped the figures in a 3/12 tile.
            return (
              <li key={alert.key} className="flex flex-col gap-0.5 py-[9px]">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-[13px] text-foreground">{alert.label}</p>
                  <span className={cn('shrink-0 font-mono text-[13px] font-semibold tabular-nums', usedShareClass(alert))}>
                    {exceeded ? 'Superato' : formatPercentage(alert.usedRatio * 100, 0)}
                  </span>
                </div>
                {/* The clause takes its own line, right-aligned, when the 3/12 tile cannot hold both. */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <p className="shrink-0 font-mono tabular-nums">
                    {cachedFormatCurrencyEUR(alert.spent, true)} su {cachedFormatCurrencyEUR(alert.budgetAmount, true)}
                  </p>
                  <NarrativeText segments={describeAlertRowCaption(alert)} className="ml-auto whitespace-nowrap text-right" figureClassName="font-medium" />
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
