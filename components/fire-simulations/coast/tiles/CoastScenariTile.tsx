'use client';

/**
 * SCENARI — «e se il mercato rende diversamente?»: Orso · Base · Toro as rows, each with its
 * real return as a caption and its own Coast number today, with the progress and the gap (or
 * the surplus) under it. The base row is set semibold: it is the scenario the verdict and the
 * Traguardo run on.
 *
 * The swatch takes the same chart slot the projection gives that series (bear → slot 5, base →
 * slot 1, bull → slot 2, through `useChartColors`), so a row and its line share a hue on every
 * theme. The old page had the same numbers as three peer cards; inside a tile they are rows, so
 * the three Coast numbers read as one comparison.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { CoastScenarioRow } from '@/lib/utils/coastFireView';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface CoastScenariTileProps {
  /** `describeCoastScenarios(rows)`. */
  reading: Narrative;
  rows: CoastScenarioRow[];
  footer: Narrative;
  className?: string;
}

/** The chart slot of each scenario — the same mapping `CoastFireProjectionChart` draws with. */
const SCENARIO_SLOT: Record<CoastScenarioRow['key'], number> = { bear: 4, base: 0, bull: 1 };

const formatRate = (value: number) => `${value.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;
const compact = (value: number) => cachedFormatCurrencyEUR(Math.round(value), true);

export function CoastScenariTile({ reading, rows, footer, className }: CoastScenariTileProps) {
  const chartColors = useChartColors();

  return (
    <Tile eyebrow="Scenari" aside="rendimento reale = crescita − inflazione" reading={reading} ariaLabel="Scenari Coast FIRE" className={className}>
      <ul className="mt-2.5 flex flex-col divide-y divide-border" aria-label="Numero Coast FIRE per scenario">
        {rows.map((row) => {
          const isBase = row.key === 'base';
          return (
            <li key={row.key} className="flex items-center justify-between gap-3 py-[9px]">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: chartColors[SCENARIO_SLOT[row.key]] }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className={cn('block text-[13px] text-foreground', isBase && 'font-semibold')}>{row.label}</span>
                  <span className="block font-mono text-[11px] tabular-nums text-muted-foreground/70">reale {formatRate(row.realReturnRate)}</span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={cn('block font-mono text-[14px] tabular-nums text-foreground', isBase && 'font-semibold')}>{compact(row.coastNumberToday)}</span>
                <span className="block font-mono text-[11px] tabular-nums text-muted-foreground/70">
                  {formatPercentage(row.progressPct, 1)} · {row.reached ? `superato di ${compact(row.surplus)}` : `mancano ${compact(row.gap)}`}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
