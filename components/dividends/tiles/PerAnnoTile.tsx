'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { YearlyIncomeSummary } from '@/lib/utils/dividendAnalytics';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { NetIncomeBars, type NetIncomeBarPoint } from './NetIncomeBars';

interface PerAnnoTileProps {
  summary: YearlyIncomeSummary;
  reading: Narrative | null;
  footer: Narrative | null;
  className?: string;
}

/**
 * "Il flusso sta crescendo negli anni?" — net income per calendar year, with the average of
 * the CLOSED years as a dashed reference.
 *
 * The running year is drawn softer and outlined, and it is out of the average, the ranking and
 * the reading: at the end of August a year two thirds done would be the worst year on the
 * chart by construction, which would be a statement about the calendar, not about the
 * portfolio (the same rule Tracciamento applies to the running month).
 */
export function PerAnnoTile({ summary, reading, footer, className }: PerAnnoTileProps) {
  const points: NetIncomeBarPoint[] = summary.years.map((year) => ({
    key: String(year.year),
    label: String(year.year),
    value: year.net,
    caption: year.ongoing ? `${year.year} · in corso` : String(year.year),
    ongoing: year.ongoing,
  }));

  return (
    <Tile
      eyebrow="Per anno"
      aside={
        summary.years.length > 0 ? (
          <span>
            <span className="font-mono font-medium tabular-nums">{summary.years.length}</span>{' '}
            {summary.years.length === 1 ? 'anno' : 'anni'}
          </span>
        ) : undefined
      }
      reading={reading}
      className={className}
    >
      {points.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessun dividendo incassato finora.</p>
      ) : (
        <NetIncomeBars
          points={points}
          reference={summary.average}
          ariaLabel="Netto incassato per anno."
          minHeight={120}
          className="mt-4 flex-1"
        />
      )}
      {footer && (
        <NarrativeText
          segments={footer}
          className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground"
          figureClassName="font-medium"
        />
      )}
    </Tile>
  );
}
