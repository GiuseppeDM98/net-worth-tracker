'use client';

import { ChevronRight } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { CenterRankedRow } from '@/lib/utils/costCenterSummary';
import type { CostCenter } from '@/types/costCenters';
import { describeCenterChip, describeCenterRow } from '@/lib/utils/costCenterNarrative';
import { resolveCostCenterColor } from '@/lib/utils/costCenterColors';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { CenterChip } from '@/components/cashflow/cost-centers/CenterChip';

interface CentriTileProps {
  rows: CenterRankedRow[];
  aside: Narrative;
  reading: Narrative;
  footer: Narrative;
  palette: string[];
  now: Date;
  onOpen: (center: CostCenter) => void;
  className?: string;
}

/**
 * One center as a flat row: swatch, name and chip, the caption (count · last expense · its
 * own window), then the lifetime cost with the rank bar under it and the share. The bar
 * encodes RANK (the largest center fills the track) and the trailing figure SHARE, so a
 * list where no center dominates still reads at a glance. The whole row is the button that
 * opens the detail; no aria-label, because the figures in the row ARE its name.
 */
function CenterRow({ row, palette, now, onOpen }: { row: CenterRankedRow; palette: string[]; now: Date; onOpen: (center: CostCenter) => void }) {
  const { summary, share, rank } = row;
  const color = resolveCostCenterColor(summary.center.color, summary.center.id, palette);
  const chip = describeCenterChip(summary);
  const caption = describeCenterRow(summary, now);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(summary.center)}
        className="group flex min-h-[44px] w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:-mx-2 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2"
      >
        <span className="sr-only">Apri </span>
        {/* Desktop: one line, the figures on the right. Below: name + amount, caption + chip, the bar. */}
        <span className="hidden min-w-0 flex-1 items-center gap-3 desktop:flex">
          <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-foreground">{summary.center.name}</span>
              {chip && <CenterChip chip={chip} />}
            </span>
            <NarrativeText segments={caption} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
          </span>
          <span className="flex w-[120px] shrink-0 flex-col items-end gap-1.5">
            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{cachedFormatCurrencyEUR(summary.total, true)}</span>
            <span className="h-[3px] w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full" style={{ width: `${rank}%`, background: color }} />
            </span>
          </span>
          <span className="w-[34px] shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{formatPercentage(share, 0)}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 desktop:hidden">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{summary.center.name}</span>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{cachedFormatCurrencyEUR(summary.total, true)}</span>
            <span className="w-[30px] text-right font-mono text-[11px] tabular-nums text-muted-foreground">{formatPercentage(share, 0)}</span>
          </span>
          <span className="flex flex-wrap items-center gap-2 pl-4">
            <NarrativeText segments={caption} className="min-w-0 flex-1 text-[11px] text-muted-foreground" figureClassName="font-medium" />
            {chip && <CenterChip chip={chip} />}
          </span>
          <span className="ml-4 h-[3px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${rank}%`, background: color }} />
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The inventory: every active center ranked by its lifetime cost, each a flat row that opens
 * the detail. Sorted by the pure layer; the tile computes nothing.
 */
export function CentriTile({ rows, aside, reading, footer, palette, now, onOpen, className }: CentriTileProps) {
  return (
    <Tile eyebrow="Centri" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className}>
      {rows.length > 0 ? (
        <ul className="mt-2 flex flex-col divide-y divide-border">
          {rows.map((row) => (
            <CenterRow key={row.summary.center.id} row={row} palette={palette} now={now} onOpen={onOpen} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessun centro attivo.</p>
      )}
      <div className="mt-auto border-t border-border pt-3.5">
        <NarrativeText segments={footer} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
    </Tile>
  );
}
