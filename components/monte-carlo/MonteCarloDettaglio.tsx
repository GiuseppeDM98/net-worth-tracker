'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: the reference material of the simulation at
 * the tile's cadence — the three scenarios' medians drawn over each other (6), the base
 * scenario's five percentiles every five years (6), and the explainer (12). Closed by default:
 * the verdict and the four tiles already answer «quanto è probabile?».
 *
 * Nothing is computed here: the series and the rows come from the pure layer over the results
 * the tab already holds, so opening it costs nothing and no figure can disagree with the grid.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { OverlayPoint, PercentileRow } from '@/lib/utils/monteCarloSummary';
import { EXPLAINER } from '@/lib/utils/monteCarloNarrative';
import { formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { ScenarioOverlayChart, SCENARIO_SLOT } from '@/components/monte-carlo/ScenarioOverlayChart';

interface MonteCarloDettaglioProps {
  /** `DETTAGLIO_DESCRIPTION`. */
  description: string;
  traiettorieReading: Narrative;
  overlay: OverlayPoint[];
  percentiliReading: Narrative;
  percentileRows: PercentileRow[];
}

const PERCENTILE_COLUMNS: { key: keyof Omit<PercentileRow, 'calendarYear'>; label: string; median?: boolean }[] = [
  { key: 'p10', label: '10°' },
  { key: 'p25', label: '25°' },
  { key: 'p50', label: 'Mediana', median: true },
  { key: 'p75', label: '75°' },
  { key: 'p90', label: '90°' },
];

export function MonteCarloDettaglio({ description, traiettorieReading, overlay, percentiliReading, percentileRows }: MonteCarloDettaglioProps) {
  const [open, setOpen] = useState(false);
  const chartColors = useChartColors();

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex min-h-11 w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Traiettorie a confronto" aside="mediane · banda 10–90 del base" reading={traiettorieReading} ariaLabel="Traiettorie a confronto">
              <div className="relative mt-4 min-h-[220px] flex-1">
                <div className="absolute inset-0">
                  <ScenarioOverlayChart series={overlay} height="100%" ariaLabel="Mediane dei tre scenari, orso base e toro, con la banda 10–90 dello scenario base; la linea tratteggiata è il capitale esaurito." />
                </div>
              </div>
              <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3.5 text-[11px] text-muted-foreground">
                {(['bear', 'base', 'bull'] as const).map((key) => (
                  <span key={key} className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: chartColors[SCENARIO_SLOT[key]] }} aria-hidden="true" />
                    {key === 'bear' ? 'Orso' : key === 'base' ? 'Base' : 'Toro'}
                  </span>
                ))}
                <span className="ml-auto">tratteggiata: capitale esaurito</span>
              </div>
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <Tile eyebrow="Percentili" aside="scenario base · ogni 5 anni" reading={percentiliReading} ariaLabel="Percentili nel tempo">
              <div className="-mx-5 mt-3.5 overflow-x-auto px-5">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left font-semibold')}>
                        Anno
                      </th>
                      {PERCENTILE_COLUMNS.map((column) => (
                        <th key={column.key} scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-right font-semibold')}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {percentileRows.map((row) => (
                      <tr key={row.calendarYear} className="border-t border-border">
                        <th scope="row" className="py-2 text-left font-mono font-normal tabular-nums text-foreground">
                          {row.calendarYear}
                        </th>
                        {PERCENTILE_COLUMNS.map((column) => {
                          const value = row[column.key];
                          return (
                            <td key={column.key} className={cn('py-2 text-right font-mono tabular-nums', column.median ? 'font-semibold text-foreground' : 'text-foreground', value <= 0 && 'text-muted-foreground')}>
                              {value > 0 ? formatCurrencyCompact(value) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">Un trattino è un percentile a zero: il capitale è esaurito in almeno quella quota di simulazioni.</p>
            </Tile>
          </div>

          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
            <Tile eyebrow="Come funziona" ariaLabel="Come funziona la simulazione">
              <div className="mt-3 grid grid-cols-1 gap-5 text-[13px] leading-[1.5] text-muted-foreground desktop:grid-cols-3">
                {EXPLAINER.map((block) => (
                  <div key={block.title}>
                    <p className="mb-1 font-medium text-foreground">{block.title}</p>
                    {block.body}
                  </div>
                ))}
              </div>
            </Tile>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
