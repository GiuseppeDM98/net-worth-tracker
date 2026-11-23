'use client';

/**
 * SCENARI A CONFRONTO — «e se i mercati vanno diversamente?»: the three scenarios as rows, each
 * with its swatch (the scenario's chart slot), its probability as the row's figure, a 3px track
 * filled to that probability in the scenario's hue, and a note with the median final value and
 * the worst tenth. The Base row repeats the Probabilità hero on purpose and the footer says so:
 * a comparison needs its reference on the same list.
 *
 * A chart slot is not a text colour: the label stays `text-foreground` beside its 8px swatch, and
 * the track is the only place the hue paints.
 */

import type { Narrative } from '@/lib/utils/narrative';
import { rateDecimals, type ScenarioKey } from '@/lib/utils/monteCarloSummary';
import { formatPercentage } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { SCENARIO_SLOT } from '@/components/monte-carlo/ScenarioOverlayChart';
import { COSTUME_PILL_RADIUS_CLASS } from '@/lib/constants/themeCostume';
import { cn } from '@/lib/utils';

export interface ScenarioRow {
  key: ScenarioKey;
  label: string;
  successRate: number;
  note: Narrative;
}

interface ScenariConfrontoTileProps {
  reading: Narrative;
  aside: string;
  rows: ScenarioRow[];
  footer: Narrative;
  /** The row of the phone composition (The Closed-Row Rule); absent at 1440. */
  collapse?: TileCollapse;
  asideWhenClosed?: string;
  className?: string;
}

export function ScenariConfrontoTile({ reading, aside, rows, footer, collapse, asideWhenClosed, className }: ScenariConfrontoTileProps) {
  const chartColors = useChartColors();

  return (
    <Tile eyebrow="Scenari a confronto" aside={aside} asideWhenClosed={asideWhenClosed} reading={reading} ariaLabel="Scenari a confronto" className={className} collapse={collapse}>
      <ul className="mt-3.5 flex flex-col divide-y divide-border" aria-label="Probabilità di successo per scenario">
        {rows.map((row) => {
          const color = chartColors[SCENARIO_SLOT[row.key]] || `var(--chart-${SCENARIO_SLOT[row.key] + 1})`;
          const fill = Math.min(100, Math.max(0, row.successRate));
          // The one rule of a rate's decimals, the closed row's «Toro» answer prints it too (2026-10-16).
          const decimals = rateDecimals(row.successRate);
          return (
            <li key={row.key} className="flex flex-col py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[13px] text-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
                  {row.label}
                </span>
                <span className="font-mono text-[18px] font-semibold leading-none tabular-nums text-foreground">{formatPercentage(row.successRate, decimals)}</span>
              </div>
              <div className={cn('mt-1.5 h-[3px] overflow-hidden bg-muted', COSTUME_PILL_RADIUS_CLASS)} aria-hidden="true">
                <div className={cn('h-full', COSTUME_PILL_RADIUS_CLASS)} style={{ width: `${fill}%`, background: color }} />
              </div>
              <NarrativeText segments={row.note} className="mt-1.5 text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
            </li>
          );
        })}
      </ul>

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
