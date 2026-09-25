'use client';

/**
 * The Distribuzione view of the Traguardo: «in quanti percorsi arrivo presto, tardi, mai?»
 *
 * Three flat KPIs (the year by which one path in ten, half and nine in ten are FIRE), the
 * reading that says the same with the base year and the «never» count, the histogram of the
 * FIRE year by calendar bin (the base year's bin outlined, the paths past the horizon as one
 * muted bar at the end), then the two sentences that turn the tail into decisions: the lever
 * (what extra saving brings the bad tail within the base year, and what it does to the lucky
 * one) and the retirement survival (what happens to the capital of the paths that retire, on
 * the same returns). Every number comes from `fireDistribution.ts`, every sentence from
 * `fireNarrative.ts`; this component lays them out.
 *
 * Rendered in normal flow, not in the Recharts' absolute box: its height is its content's, and
 * the histogram is the one element that stretches with the tile (`flex-1`).
 */

import type { Narrative } from '@/lib/utils/narrative';
import type { FireYearDistribution } from '@/lib/utils/fireDistribution';
import { cn } from '@/lib/utils';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { YearBars } from '@/components/ui/year-bars';

interface FireYearDistributionViewProps {
  distribution: FireYearDistribution;
  /** `describeFireYearDistribution(distribution)`. */
  reading: Narrative;
  /** `describeTailLever(...)`; null when there is no base year to aim at, or nothing to move. */
  lever: Narrative | null;
  /** `describeRetirementSurvival(...)`; null when no path retires. */
  survival: Narrative | null;
}

function YearKpi({ label, year, beyondLabel }: { label: string; year: number | null; beyondLabel: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <span className={cn('font-mono text-[16px] font-semibold leading-none desktop:text-[18px]', year === null ? 'text-muted-foreground' : 'tabular-nums text-foreground')}>
        {year === null ? beyondLabel : year}
      </span>
    </div>
  );
}

export function FireYearDistributionView({ distribution, reading, lever, survival }: FireYearDistributionViewProps) {
  const beyondCaption = `oltre il ${distribution.horizonCalendarYear}`;
  const perBin = distribution.binWidthYears === 1 ? 'una classe per anno' : `una classe ogni ${distribution.binWidthYears} anni`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* A percentile the horizon cuts prints «oltre», a state, never a year that does not exist. */}
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        <YearKpi label="10° %ile" year={distribution.p10Year} beyondLabel="oltre" />
        <YearKpi label="Mediana" year={distribution.p50Year} beyondLabel="oltre" />
        <YearKpi label="90° %ile" year={distribution.p90Year} beyondLabel="oltre" />
      </div>

      <NarrativeText segments={reading} className="mt-3 text-[13px] leading-[1.45] text-foreground" figureClassName="font-semibold" />

      <YearBars
        className="mt-4 flex-1"
        minHeight={110}
        bins={distribution.bins}
        beyond={{ axisLabel: 'oltre', caption: beyondCaption, count: distribution.neverCount, sharePct: distribution.neverPct }}
        subject="percorsi"
        referenceLabel="anno del base"
        ariaLabel={`Distribuzione dell'anno FIRE su ${distribution.pathCount.toLocaleString('it-IT')} percorsi, ${perBin}.`}
      />

      {(lever || survival) && (
        <div className="mt-3 space-y-1.5 text-[11px] leading-[1.45] text-muted-foreground">
          {lever && <NarrativeText segments={lever} figureClassName="font-medium" />}
          {survival && <NarrativeText segments={survival} figureClassName="font-medium" />}
        </div>
      )}
    </div>
  );
}
