'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { CenterMonthStack, CostCentersSummary } from '@/lib/utils/costCenterSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { resolveHeroValueClass } from '@/components/dashboard/overview/PatrimonioTile';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { CenterStackBars } from './CenterStackBars';

interface TotaleTileProps {
  summary: CostCentersSummary;
  stack: CenterMonthStack;
  /** The caption beside the bars' sub-eyebrow («per centro · agosto in corso»). */
  stackCaption: Narrative;
  aside: Narrative;
  reading: Narrative;
  /** «2025, intero» — last year's KPI caption. */
  lastYearCaption: Narrative;
  /** The archived centers the total leaves out; null when there are none. */
  footer: Narrative | null;
  palette: string[];
  className?: string;
}

const KPI_VALUE_CLASS = 'font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground';

function Kpi({ label, value, caption }: { label: string; value: string; caption: Narrative }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className={KPI_VALUE_CLASS}>{value}</p>
      <NarrativeText segments={caption} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
    </div>
  );
}

/**
 * «Quanto mi costano i progetti?» in figures — the dominant tile of the list: the lifetime
 * cost of the active centers (the hero), three windows that name themselves (this year, last
 * year, the trailing twelve months' average), the trailing months stacked by center (the
 * element that stretches when the tile spans two rows), and the archived centers the total
 * leaves out as the footer. Every figure is the `CostCentersSummary`'s; the tile computes nothing.
 */
export function TotaleTile({ summary, stack, stackCaption, aside, reading, lastYearCaption, footer, palette, className }: TotaleTileProps) {
  return (
    <Tile eyebrow="Totale" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className} ariaLabel="Totale dei centri di costo">
      <div className="mt-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <p className={resolveHeroValueClass(summary.total)}>{cachedFormatCurrencyEUR(summary.total, true)}</p>
        <p className="text-[13px] text-muted-foreground">
          in <span className="font-mono tabular-nums text-foreground">{summary.count}</span> {summary.count === 1 ? 'movimento' : 'movimenti'}
        </p>
      </div>

      <div className="mt-[18px] grid grid-cols-3 gap-3.5">
        <Kpi label="Quest'anno" value={cachedFormatCurrencyEUR(summary.ytd, true)} caption={[{ text: 'da gennaio' }]} />
        <Kpi label="Anno scorso" value={cachedFormatCurrencyEUR(summary.lastYear, true)} caption={lastYearCaption} />
        <Kpi
          label="Al mese"
          value={cachedFormatCurrencyEUR(summary.trailingAverage, true)}
          caption={[{ text: 'media ultimi ' }, { text: '12', mono: true }, { text: ' mesi' }]}
        />
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>Ultimi {stack.months.length} mesi</p>
        <NarrativeText segments={stackCaption} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
      </div>
      <CenterStackBars stack={stack} palette={palette} className="mt-2.5 flex-1" />

      {footer && (
        <div className="mt-auto border-t border-border pt-3.5">
          <NarrativeText segments={footer} className="text-[11px] text-muted-foreground" figureClassName="font-medium" />
        </div>
      )}
    </Tile>
  );
}
