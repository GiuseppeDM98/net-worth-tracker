'use client';

/**
 * TRAGUARDO — «quanto manca, e come ci arrivo?»: the FIRE number as the hero figure, the
 * progress as a chip and a 3px track under it, then the projection filling the tile's free
 * height in one of three views — the deterministic Scenari chart, the Monte Carlo Ventaglio, or
 * the Distribuzione of the FIRE year across the fan's paths (2026-09-24) — switched by the aside
 * (`AsideToggle`: a view switch is the tile's scope, not the page's axis).
 *
 * WHY the number and not the year is the hero: the year is the verdict's headline already, and the
 * progress is its first clause; the FIRE number is the one figure the page names nowhere else at
 * this size, and it is the thing the chart's dashed line IS. The chart is passed in as `chart`
 * so this tile knows nothing about Recharts, fan inputs or memoisation: it is a shell with a
 * reading, a number, a track and a footer, like every other tile. The footer is the chart's
 * legend in words (Scenari), the fan's one number (Ventaglio) or what the bars are, with the
 * method behind «Come si calcola» (Distribuzione) — `describeTargetFooter`. The two Recharts
 * views fill an absolutely positioned box (a percentage height needs a definite parent); the
 * Distribuzione view is text and a hand-written SVG, and flows, so it can never overrun the footer.
 *
 * The track fills to the progress capped at 100%, in `--chart-1` (the base scenario's hue) and in
 * the gain token once the target is reached: reaching FIRE is a fact with a sign; being at 68% is
 * not, so the chip stays neutral.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { FireTarget } from '@/lib/utils/fireSummary';
import type { ProjectionView } from '@/lib/utils/fireNarrative';
import { cn } from '@/lib/utils';
import { formatPercentage } from '@/lib/services/chartService';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeSegments, NarrativeText } from '@/components/ui/narrative-text';
import { AsideToggle } from '@/components/ui/aside-toggle';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { resolveHeroValueClass } from '@/components/dashboard/overview/PatrimonioTile';
import { SettledCurrencyValue, SettledPercentageValue } from '@/components/fire-simulations/SettledValue';

const VIEW_OPTIONS = [
  { value: 'scenari' as const, label: 'Scenari' },
  { value: 'ventaglio' as const, label: 'Ventaglio' },
  { value: 'distribuzione' as const, label: 'Distribuzione' },
];

interface TraguardoTileProps {
  /** `describeTarget(target)`. */
  reading: Narrative;
  target: FireTarget;
  /** `describeTargetCaption(...)` — the formula, or what the bridge changes. */
  caption: Narrative;
  view: ProjectionView;
  onViewChange: (view: ProjectionView) => void;
  /** False hides the switch: without an allocation in the four MC classes there is no fan to show. */
  fanAvailable: boolean;
  /** The projection in the selected view, or the message that replaces it. */
  chart: ReactNode;
  /** `describeTargetFooter(...)`. */
  footer: Narrative | null;
  /** The method behind «Come si calcola», as paragraphs — the Distribuzione view's; absent on the others. */
  method?: string[] | null;
  className?: string;
}

export function TraguardoTile({ reading, target, caption, view, onViewChange, fanAvailable, chart, footer, method, className }: TraguardoTileProps) {
  const fill = Math.min(100, Math.max(0, target.progressPct));

  return (
    <Tile
      eyebrow="Traguardo"
      aside={fanAvailable ? <AsideToggle options={VIEW_OPTIONS} value={view} onChange={onViewChange} ariaLabel="Vista della proiezione" /> : undefined}
      reading={reading}
      ariaLabel="Traguardo FIRE"
      className={className}
    >
      <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-3.5')}>Numero FIRE{target.isBridge && ' · modello ponte'}</p>
      <SettledCurrencyValue
        value={target.fireNumber}
        compact
        className={cn('mt-1.5 block leading-none', resolveHeroValueClass(target.fireNumber))}
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* The chip is a flex box, and a flex item strips its leading whitespace: the words carry
            their own gap instead of a space that would never paint. */}
        {/* «verso FI» is a direction; past the target it is «del numero FIRE» — a reader at 252%
            has nothing left to go towards (2026-09-22). */}
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[9px] bg-muted px-[11px] py-[6px] font-mono text-[12px] font-semibold leading-none tabular-nums text-foreground">
          <SettledPercentageValue value={target.progressPct} />
          <span>{target.reached ? 'del numero FIRE' : 'verso FI'}</span>
        </span>
        <NarrativeText segments={caption} className="min-w-0 text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
      </div>
      <div
        className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Progresso verso il numero FIRE"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        // The bar caps at 100; the text says the true share, so 252% is not announced as 100.
        aria-valuetext={`${formatPercentage(target.progressPct, 1)} del numero FIRE`}
      >
        <div className={cn('h-full rounded-full', target.reached ? 'bg-positive' : 'bg-[var(--chart-1)]')} style={{ width: `${fill}%` }} />
      </div>

      {/* The Recharts views stretch with the tile's free height: the SVG's 100% height resolves
          against the absolutely positioned box, never against its own ratio. The Distribuzione
          view flows: its bars stretch, its sentences take the height they need. */}
      {view === 'distribuzione' && fanAvailable ? (
        <div className="mt-4 flex min-h-[240px] flex-1 flex-col">{chart}</div>
      ) : (
        <div className="relative mt-4 min-h-[240px] flex-1">
          <div className="absolute inset-0">{chart}</div>
        </div>
      )}

      {footer && method && method.length > 0 ? (
        <TileMethodNote className="mt-3.5" summary={<NarrativeSegments segments={footer} figureClassName="font-medium" />} subject="Distribuzione dell'anno FIRE">
          {method.map((paragraph) => (
            <span key={paragraph} className="block">
              {paragraph}
            </span>
          ))}
        </TileMethodNote>
      ) : (
        footer && (
          <NarrativeText segments={footer} className="mt-3.5 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" figureClassName="font-medium" />
        )
      )}
    </Tile>
  );
}
