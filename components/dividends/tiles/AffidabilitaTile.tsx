'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CoverageMonth, DividendReliability } from '@/lib/utils/dividendAnalytics';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { describeReliabilityWindow } from '@/lib/utils/dividendiNarrative';
import { MONTH_NAMES } from '@/lib/constants/months';

interface AffidabilitaTileProps {
  reliability: DividendReliability;
  reading: Narrative | null;
  /** How many of the window's months paid; empty when the window is too long to draw. */
  months: CoverageMonth[];
  footer: Narrative | null;
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums';

/**
 * "Posso contare su questo reddito?" — the two risk signals latent in the payment history:
 * how many months actually paid (smoothness) and how much of the income hangs on one payer
 * (concentration).
 *
 * The strip is one cell per month of the window, filled when that month paid — a shape, not a
 * chart. `buildCoverageMonths` returns an empty array when the window is longer than it can
 * draw, and then the KPIs answer alone: a slice of the window under a KPI measured on all of
 * it would put two windows in one tile.
 */
export function AffidabilitaTile({ reliability, reading, months, footer, className }: AffidabilitaTileProps) {
  const coverage = reliability.coveragePct * 100;
  const topShare = reliability.topPayerSharePct * 100;

  return (
    <Tile
      eyebrow="Affidabilità"
      aside={<NarrativeText segments={describeReliabilityWindow(reliability.monthsInWindow)} figureClassName="font-medium" />}
      reading={reading}
      className={className}
    >
      <div className="mt-4 flex gap-6">
        <div className="min-w-0">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-1.5')}>Copertura</p>
          <p className={cn(KPI_VALUE_CLASS, 'text-foreground')}>{formatPercentage(coverage, 0)}</p>
        </div>
        <div className="min-w-0">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-1.5')}>Primo pagatore</p>
          <p className={cn(KPI_VALUE_CLASS, reliability.topPayerTicker ? 'text-foreground' : 'text-muted-foreground')}>
            {reliability.topPayerTicker ? formatPercentage(topShare, 0) : '—'}
          </p>
        </div>
      </div>

      {months.length >= 2 && (
        <div className="mt-4">
          <div
            role="img"
            aria-label={`Mesi con almeno un incasso: ${months
              .map((m) => `${MONTH_NAMES[m.month - 1].toLowerCase()} ${m.paid ? 'sì' : 'no'}`)
              .join(', ')}.`}
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
          >
            {months.map((month) => (
              <span
                key={month.key}
                title={`${MONTH_NAMES[month.month - 1]} ${month.year}: ${
                  month.paid ? cachedFormatCurrencyEUR(month.net, true) : 'nessun incasso'
                }`}
                className="h-[22px] rounded-[3px]"
                style={{ background: month.paid ? 'var(--chart-2)' : 'var(--muted)' }}
              />
            ))}
          </div>
          <div
            className="mt-1.5 grid"
            style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}
            aria-hidden="true"
          >
            {months.map((month) => (
              <span key={month.key} className="text-center font-mono text-[10px] tabular-nums text-muted-foreground">
                {/* One letter per month: twelve three-letter labels do not fit a 3-column tile. */}
                {month.label.charAt(0)}
              </span>
            ))}
          </div>
        </div>
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
