'use client';

/**
 * PROBABILITÀ — «quanto è probabile?»: the success rate of the base scenario as the hero figure,
 * three grouped chips (the failures, the median failure year, the survivors) and the fan of the
 * simulations filling the tile's free height. The chart is passed in as `chart` so this tile
 * knows nothing about Recharts: it is a shell with a reading, a number, chips and a footer, like
 * every other tile. The footer is the chart's legend in words (`describeProbabilitaFooter`).
 *
 * The hero carries no sign colour: a probability is not a gain. The verdict's tone already
 * judges it, and judging it twice on one page would be the same fact said in two voices.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { MonteCarloRun } from '@/lib/utils/monteCarloSummary';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { SettledPercentageValue } from '@/components/fire-simulations/SettledValue';

interface ProbabilitaTileProps {
  reading: Narrative;
  aside: string;
  run: MonteCarloRun;
  chart: ReactNode;
  footer: Narrative;
  className?: string;
}

const CHIP_CLASS = 'inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-[9px] bg-muted px-[11px] py-[6px] font-mono text-[12px] font-semibold leading-none tabular-nums text-foreground';

function Chip({ value, words, caption }: { value: string; words?: string; caption: string }) {
  return (
    <div className="flex w-fit flex-col gap-1">
      {/* A flex chip strips a leading space: the words carry their own gap. */}
      <span className={CHIP_CLASS}>
        <span>{value}</span>
        {words && <span className="font-sans font-medium text-muted-foreground">{words}</span>}
      </span>
      <span className="text-[11px] leading-[1.4] text-muted-foreground">{caption}</span>
    </div>
  );
}

export function ProbabilitaTile({ reading, aside, run, chart, footer, className }: ProbabilitaTileProps) {
  const rateDecimals = Number.isInteger(Math.round(run.successRate * 10) / 10) ? 0 : 1;

  return (
    <Tile eyebrow="Probabilità" aside={aside} reading={reading} ariaLabel="Probabilità di successo" className={className}>
      <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-3.5')}>Probabilità di successo · scenario base</p>
      <SettledPercentageValue value={run.successRate} decimals={rateDecimals} className="mt-1.5 block font-mono text-[44px] font-bold leading-none tracking-[-0.035em] tabular-nums desktop:text-[54px]" />

      <div className="mt-3 flex flex-col items-start gap-2 tablet:flex-row tablet:flex-wrap tablet:gap-x-2.5 tablet:gap-y-2">
        <Chip value={run.failureCount.toLocaleString('it-IT')} words="fallite" caption={`su ${run.simulations.toLocaleString('it-IT')} simulazioni`} />
        {run.failureMedianYear !== null && run.failureMedianCalendarYear !== null && (
          <Chip value={`anno ${run.failureMedianYear}`} words={`· ${run.failureMedianCalendarYear}`} caption="fallimento mediano" />
        )}
        <Chip value={run.successCount.toLocaleString('it-IT')} words="riuscite" caption={`capitale positivo nel ${run.endCalendarYear}`} />
      </div>

      {/* The chart stretches with the tile's free height: the SVG's 100% height resolves
          against the absolutely positioned box, never against its own ratio. */}
      <div className="relative mt-4 min-h-[240px] flex-1">
        <div className="absolute inset-0">{chart}</div>
      </div>

      <NarrativeText segments={footer} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
