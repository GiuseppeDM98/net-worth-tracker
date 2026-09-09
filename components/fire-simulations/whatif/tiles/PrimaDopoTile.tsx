'use client';

/**
 * PRIMA E DOPO — «come cambia la traiettoria?»: the two base-scenario walks drawn over each
 * other, the plan of today as a neutral baseline and the plan after the event in the base
 * scenario's hue, with the FIRE number as a dashed line and the two FIRE years as marks.
 *
 * WHY this tile has no hero number (the canvas's proposal, chosen 2026-08-25): the year is the
 * verdict's headline and the Delta tile's first row, the capital is the Delta's second — a hero
 * here would repeat a row (The One-Tile-One-Question Rule). What only this tile has is the
 * DIVERGENCE: both capitals read at the FIRE year of today, so the reading says how the hit of
 * today compounds («i 31.800 € persi oggi sono 51.200 € di distanza allora») and the chart shows
 * it. The chart is passed in as `chart` so this tile knows nothing about Recharts.
 *
 * The legend is HTML above the plot: the chart carries `role="img"`, which hides a Recharts
 * legend from assistive technology, so the colour→name mapping lives in the `aria-label` and here.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface PrimaDopoTileProps {
  /** `describeBeforeAfter(summary, divergence)`. */
  reading: Narrative;
  /** `describeBeforeAfterAside(scenarios.base)`. */
  aside: string;
  /** The overlaid projection, or the message that replaces it. */
  chart: ReactNode;
  /** True when both targets are drawn (a cashflow change moves the FIRE number). */
  targetsDiffer: boolean;
  /** `describeBeforeAfterFooter(...)` — the chart's legend in words, and the step when drawn. */
  footer: Narrative;
  className?: string;
}

export function PrimaDopoTile({ reading, aside, chart, targetsDiffer, footer, className }: PrimaDopoTileProps) {
  return (
    <Tile eyebrow="Prima e dopo" aside={aside} reading={reading} ariaLabel="Prima e dopo l'evento" className={className}>
      <div className="mt-3.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-3.5 rounded-full bg-muted-foreground" />
          Piano di oggi
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-3.5 rounded-full bg-[var(--chart-1)]" />
          Dopo l&apos;evento
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 border-t-[1.5px] border-dashed border-[var(--chart-1)]" />
          {targetsDiffer ? 'Numero FIRE (oggi in grigio)' : 'Numero FIRE'}
        </span>
      </div>

      {/* The chart stretches with the tile's free height: the SVG's 100% height resolves
          against the absolutely positioned box, never against its own ratio. */}
      <div className="relative mt-3 min-h-[260px] flex-1">
        <div className="absolute inset-0">{chart}</div>
      </div>

      <NarrativeText segments={footer} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
    </Tile>
  );
}
