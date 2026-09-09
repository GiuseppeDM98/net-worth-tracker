'use client';

/**
 * DISTRIBUZIONE — «con quanto chiudo?»: the final values of the base scenario as three flat KPIs
 * (the 10th percentile, the median, the 90th) and the ten-bin histogram filling the tile, the
 * median's bin outlined. A percentile at zero prints «esaurito» rather than «0 €»: a figure that
 * means "the money ran out" is a state, not an amount.
 *
 * The KPI row wraps rather than shrinking: at a 4-column tile three seven-figure amounts do not
 * always fit on one line, and a truncated number reads as a wrong number.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { MonteCarloRun } from '@/lib/utils/monteCarloSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { FinalValueBars } from '@/components/monte-carlo/FinalValueBars';

interface DistribuzioneTileProps {
  reading: Narrative;
  aside: string;
  run: MonteCarloRun;
  footer: Narrative;
  className?: string;
}

function Kpi({ label, value }: { label: string; value: number }) {
  const depleted = value <= 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <span className={depleted ? 'font-mono text-[16px] font-semibold leading-none text-muted-foreground' : 'font-mono text-[16px] font-semibold leading-none tabular-nums text-foreground desktop:text-[18px]'}>
        {depleted ? 'esaurito' : cachedFormatCurrencyEUR(value, true)}
      </span>
    </div>
  );
}

export function DistribuzioneTile({ reading, aside, run, footer, className }: DistribuzioneTileProps) {
  return (
    <Tile eyebrow="Distribuzione" aside={aside} reading={reading} ariaLabel="Distribuzione dei valori finali" className={className}>
      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-3">
        <Kpi label="10° %ile" value={run.finalPercentiles.p10} />
        <Kpi label="Mediana" value={run.finalPercentiles.p50} />
        <Kpi label="90° %ile" value={run.finalPercentiles.p90} />
      </div>

      <FinalValueBars bins={run.histogram} ariaLabel={`Distribuzione dei valori finali nel ${run.endCalendarYear} in ${run.histogram.length} classi.`} className="mt-4 flex-1" minHeight={120} />

      <NarrativeText segments={footer} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
