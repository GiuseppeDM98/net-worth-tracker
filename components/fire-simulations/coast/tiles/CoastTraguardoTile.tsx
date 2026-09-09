'use client';

/**
 * TRAGUARDO — «quanto manca al Coast FIRE?»: the shortfall (or the surplus, once the target is
 * behind) as the hero figure, the progress as a chip over a 3px track with the liquid read and
 * what the number discounts beside it, then the projection filling the tile's free height —
 * the three scenarios compounding from today's free capital, and the capital required at the
 * target age as the dashed line, which steps with the fund when it re-enters.
 *
 * WHY the gap and not the Coast number is the hero: the page's question is «posso smettere di
 * versare?», and the gap is the one figure that answers it in money — the Coast number itself
 * is in the reading, the caption and the Scenari tile. The chart is passed in as `chart` so this
 * tile knows nothing about Recharts: a shell with a reading, a number, a track and a footer.
 *
 * The track fills to the progress capped at 100%, in `--chart-1` (the base scenario's hue) and
 * in the gain token once the target is reached: reaching Coast is a fact with a sign; being at
 * 76% is not, so the chip stays neutral.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { CoastTarget } from '@/lib/utils/coastFireView';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { resolveHeroValueClass } from '@/components/dashboard/overview/PatrimonioTile';
import { SettledCurrencyValue, SettledPercentageValue } from '@/components/fire-simulations/SettledValue';

interface CoastTraguardoTileProps {
  /** `describeCoastTarget(target)`. */
  reading: Narrative;
  target: CoastTarget;
  /** `describeCoastTargetCaption(target)` — the liquid read and what the number discounts. */
  caption: Narrative;
  /** The projection, or the message that replaces it. */
  chart: ReactNode;
  /** `describeCoastTargetFooter(...)` — the dashed line in words. */
  footer: Narrative;
  className?: string;
}

export function CoastTraguardoTile({ reading, target, caption, chart, footer, className }: CoastTraguardoTileProps) {
  const heroValue = target.reached ? target.surplus : target.gap;
  const fill = Math.min(100, Math.max(0, target.progressPct));

  return (
    <Tile
      eyebrow="Traguardo"
      aside={`scenario base · reale ${target.realReturnRate.toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`}
      reading={reading}
      ariaLabel="Traguardo Coast FIRE"
      className={className}
    >
      <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-3.5')}>
        {target.reached ? 'Oltre il numero Coast FIRE' : 'Mancano al numero Coast FIRE'}
        {target.isBridge && ' · modello ponte'}
      </p>
      <SettledCurrencyValue value={heroValue} compact className={cn('mt-1.5 block leading-none', resolveHeroValueClass(heroValue))} />

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* The chip is a flex box, and a flex item strips its leading whitespace: the words carry
            their own gap instead of a space that would never paint. */}
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[9px] bg-muted px-[11px] py-[6px] font-mono text-[12px] font-semibold leading-none tabular-nums text-foreground">
          <SettledPercentageValue value={target.progressPct} />
          <span>del numero Coast</span>
        </span>
        <NarrativeText segments={caption} className="min-w-0 text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />
      </div>
      <div
        className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Progresso verso il numero Coast FIRE"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
      >
        <div className={cn('h-full rounded-full', target.reached ? 'bg-positive' : 'bg-[var(--chart-1)]')} style={{ width: `${fill}%` }} />
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
