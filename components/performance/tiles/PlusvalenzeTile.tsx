'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { RealizedGainsSummary } from '@/lib/utils/performanceSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';

interface PlusvalenzeTileProps {
  reading: Narrative;
  summary: RealizedGainsSummary;
  /** Assets left out because their ledger replay failed — the total is then incomplete, and says so. */
  skippedAssets: number;
  className?: string;
}

function signedEuro(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${cachedFormatCurrencyEUR(Math.abs(value), true)}`;
}

/**
 * «Quanto hai incassato davvero?» — realized gains and losses per FISCAL year from the trade
 * ledger, all-time: a sale belongs to its own year whatever the picker says, so the tile is
 * off the page's axis and its aside names its own window (DESIGN.md → The Off-Axis Tile Rule).
 * The bar is the year's magnitude against the largest year, signed by colour.
 */
export function PlusvalenzeTile({ reading, summary, skippedAssets, className }: PlusvalenzeTileProps) {
  const maxAbs = Math.max(...summary.years.map((y) => Math.abs(y.amount)), 1);

  return (
    <Tile eyebrow="Plusvalenze realizzate" aside="per anno fiscale · tutto lo storico" reading={reading} className={className}>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {summary.years.map((y) => (
          <li key={y.year} className="grid grid-cols-[44px_minmax(0,1fr)_96px] items-center gap-3 py-[9px]">
            <span className="font-mono text-[13px] tabular-nums text-foreground">{y.year}</span>
            <span className="h-[3px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(Math.abs(y.amount) / maxAbs) * 100}%`, background: y.amount < 0 ? 'var(--destructive)' : 'var(--positive)' }}
              />
            </span>
            <span className={cn('text-right font-mono text-[13px] font-semibold tabular-nums', signTextClass(y.amount))}>{signedEuro(y.amount)}</span>
          </li>
        ))}
        <li className="grid grid-cols-[44px_minmax(0,1fr)_96px] items-center gap-3 py-[9px]">
          <span className="text-[13px] font-semibold text-foreground">Totale</span>
          <span />
          <span className={cn('text-right font-mono text-[13px] font-bold tabular-nums', signTextClass(summary.total))}>{signedEuro(summary.total)}</span>
        </li>
      </ul>
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        Non segue il periodo: una vendita appartiene al suo anno fiscale. Utili e perdite chiusi nel registro operazioni,
        al PMC del momento della vendita.
        {skippedAssets > 0 && (
          <>
            {' '}
            <span className="text-warning-foreground">
              {skippedAssets === 1
                ? '1 asset è escluso dal totale: il suo registro non è ricostruibile.'
                : `${skippedAssets} asset sono esclusi dal totale: il loro registro non è ricostruibile.`}
            </span>
          </>
        )}
      </p>
    </Tile>
  );
}
