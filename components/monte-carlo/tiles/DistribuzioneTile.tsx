'use client';

/**
 * DISTRIBUZIONE — «con quanto chiudo?», and since 2026-09-24 also «quando finisco i soldi?»:
 * two views switched by the aside (`AsideToggle`, the tile's scope like the Traguardo's).
 *
 * «Valori finali»: the final values of the base scenario as three flat KPIs (the 10th percentile,
 * the median, the 90th) and the ten-bin histogram filling the tile, the median's bin outlined. A
 * percentile at zero prints «esaurito» rather than «0 €»: a figure that means "the money ran out"
 * is a state, not an amount.
 *
 * «Esaurimento»: the failed simulations by the calendar year their capital ran out — the count,
 * the first year and the median as KPIs, then the bins (the median's outlined). The view exists
 * only when something fails: with no failures the aside stays the plain window label.
 *
 * The KPI row wraps rather than shrinking: at a 4-column tile three seven-figure amounts do not
 * always fit on one line, and a truncated number reads as a wrong number.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { MonteCarloRun } from '@/lib/utils/monteCarloSummary';
import type { DistributionView } from '@/lib/utils/monteCarloNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { AsideToggle } from '@/components/ui/aside-toggle';
import { YearBars } from '@/components/ui/year-bars';
import { FinalValueBars } from '@/components/monte-carlo/FinalValueBars';

const VIEW_OPTIONS = [
  { value: 'finali' as const, label: 'Valori finali' },
  { value: 'esaurimento' as const, label: 'Esaurimento' },
];

interface DistribuzioneTileProps {
  /** The reading of the SELECTED view. */
  reading: Narrative;
  /** The window label, shown as the aside only while there is no second view to switch to. */
  aside: string;
  run: MonteCarloRun;
  view: DistributionView;
  onViewChange: (view: DistributionView) => void;
  /** The footer of the SELECTED view. */
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

function PlainKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <span className="font-mono text-[16px] font-semibold leading-none tabular-nums text-foreground desktop:text-[18px]">{value}</span>
    </div>
  );
}

export function DistribuzioneTile({ reading, aside, run, view, onViewChange, footer, className }: DistribuzioneTileProps) {
  const hasFailures = run.failureCount > 0 && run.failureYearBins.length > 0;
  const shownView: DistributionView = hasFailures ? view : 'finali';

  return (
    <Tile
      eyebrow="Distribuzione"
      aside={hasFailures ? <AsideToggle options={VIEW_OPTIONS} value={shownView} onChange={onViewChange} ariaLabel="Vista della distribuzione" /> : aside}
      reading={reading}
      ariaLabel="Distribuzione dei valori finali"
      className={className}
    >
      {shownView === 'finali' ? (
        <>
          <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-3">
            <Kpi label="10° %ile" value={run.finalPercentiles.p10} />
            <Kpi label="Mediana" value={run.finalPercentiles.p50} />
            <Kpi label="90° %ile" value={run.finalPercentiles.p90} />
          </div>

          <FinalValueBars bins={run.histogram} ariaLabel={`Distribuzione dei valori finali nel ${run.endCalendarYear} in ${run.histogram.length} classi.`} className="mt-4 flex-1" minHeight={120} />
        </>
      ) : (
        <>
          <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-3">
            <PlainKpi label="Falliscono" value={run.failureCount.toLocaleString('it-IT')} />
            <PlainKpi label="Prima" value={run.failureFirstCalendarYear !== null ? String(run.failureFirstCalendarYear) : '—'} />
            <PlainKpi label="Mediana" value={run.failureMedianCalendarYear !== null ? String(run.failureMedianCalendarYear) : '—'} />
          </div>

          <YearBars
            bins={run.failureYearBins}
            subject="simulazioni"
            referenceLabel="mediana dei fallimenti"
            ariaLabel={`Anno di esaurimento del capitale nelle ${run.failureCount.toLocaleString('it-IT')} simulazioni che falliscono, ${run.failureYearBinWidth === 1 ? 'una classe per anno' : `una classe ogni ${run.failureYearBinWidth} anni`}.`}
            className="mt-4 flex-1"
            minHeight={120}
          />
        </>
      )}

      <NarrativeText segments={footer} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
