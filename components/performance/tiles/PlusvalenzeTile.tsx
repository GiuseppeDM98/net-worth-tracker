'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { RealizedGainsSummary } from '@/lib/utils/performanceSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';

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
 *
 * With ONE fiscal year there is no list (2026-09-20): the year's row, the «Totale» row and the
 * reading all printed the same figure — 15.743 four times on the owner's data. The reading is the
 * tile then. From two years the list returns WITH its total: rows that must add up add up on screen.
 *
 * The skipped-assets warning is a fact about the figure, not method: it stays on the tile, above
 * the one-line footer, never inside the popover.
 */
export function PlusvalenzeTile({ reading, summary, skippedAssets, className }: PlusvalenzeTileProps) {
  const maxAbs = Math.max(...summary.years.map((y) => Math.abs(y.amount)), 1);
  const hasList = summary.years.length >= 2;

  return (
    <Tile eyebrow="Plusvalenze realizzate" aside="per anno fiscale · tutto lo storico" reading={reading} className={className}>
      {hasList && (
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
      )}
      {skippedAssets > 0 && (
        <p className="mt-3 text-[11px] leading-[1.45] text-warning-foreground">
          {skippedAssets === 1
            ? '1 asset è escluso dal totale: il suo registro non è ricostruibile.'
            : `${skippedAssets} asset sono esclusi dal totale: il loro registro non è ricostruibile.`}
        </p>
      )}
      <TileMethodNote subject="Plusvalenze realizzate" summary="Non segue il periodo.">
        <span className="block">Una vendita appartiene al suo anno fiscale, qualunque periodo sia scelto in alto: la tessera guarda tutto lo storico.</span>
        <span className="block">Sono utili e perdite chiusi nel registro operazioni, calcolati al PMC (prezzo medio di carico) del momento della vendita.</span>
      </TileMethodNote>
    </Tile>
  );
}
