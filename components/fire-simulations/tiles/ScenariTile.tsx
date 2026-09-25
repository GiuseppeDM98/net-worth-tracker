'use client';

/**
 * SCENARI — «e se il mercato va diversamente?»: the three scenarios as rows — Orso · Base ·
 * Toro, each with its growth and inflation as a caption and its FIRE year with the distance in
 * years — and a footer that says the model in words. The base row is set semibold: it is the
 * scenario the verdict and the Traguardo run on.
 *
 * The swatch takes the same chart slot the Scenari chart gives that series (bear → slot 5,
 * base → slot 1, bull → slot 2, through `useChartColors`), so a row and its line share a hue on
 * every theme. The old page had the same three numbers as KPI chips above the chart; inside a
 * tile they are rows, so the year and the parameters read as one line each.
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { ScenarioRow } from '@/lib/utils/fireSummary';
import { formatRate } from '@/lib/utils/fireNarrative';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface ScenariTileProps {
  reading: Narrative;
  rows: ScenarioRow[];
  /** The projection's horizon, for the «oltre N anni» caption. */
  horizonYears: number;
  footer: Narrative;
  className?: string;
}

/** The chart slot of each scenario — the same mapping `FIREProjectionChart` draws with. */
const SCENARIO_SLOT: Record<ScenarioRow['key'], number> = { bear: 4, base: 0, bull: 1 };

/** «tra 6 anni» / «tra 1 anno» / «già raggiunto» (year 0: the walk tests today before stepping). */
function distance(years: number | null, horizonYears: number): string {
  if (years === null) return `oltre ${horizonYears} anni`;
  if (years === 0) return 'già raggiunto';
  return years === 1 ? 'tra 1 anno' : `tra ${years} anni`;
}

export function ScenariTile({ reading, rows, horizonYears, footer, className }: ScenariTileProps) {
  const chartColors = useChartColors();

  return (
    <Tile eyebrow="Scenari" aside="crescita · inflazione" reading={reading} ariaLabel="Scenari di mercato" className={className}>
      <ul className="mt-2.5 flex flex-col divide-y divide-border" aria-label="Anno del FIRE per scenario">
        {rows.map((row) => {
          const isBase = row.key === 'base';
          return (
            <li key={row.key} className="flex items-center justify-between gap-3 py-[9px]">
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: chartColors[SCENARIO_SLOT[row.key]] }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className={cn('block text-[13px] text-foreground', isBase && 'font-semibold')}>{row.label}</span>
                  <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                    {formatRate(row.growthRate)} · {formatRate(row.inflationRate)}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                {/* A year cell prints the year; a scenario reached today prints «oggi» — the year
                    it would print is this one, and «2026 · già raggiunto» reads as a date. */}
                <span className={cn('block font-mono text-[14px] tabular-nums text-foreground', isBase && 'font-semibold')}>
                  {row.yearsToFire === 0 ? 'oggi' : (row.calendarYear ?? '—')}
                </span>
                <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">{distance(row.yearsToFire, horizonYears)}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
