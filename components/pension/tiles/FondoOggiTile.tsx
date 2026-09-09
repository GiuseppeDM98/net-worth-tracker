'use client';

/**
 * «Quanto vale il fondo oggi?» — the dominant tile of Previdenza (5 columns, 2 rows).
 *
 * Same anatomy as the Patrimonio hero, on purpose: a pension fund is a net-worth position the
 * reader already knows how to read there — the live value as the hero figure, the month's market
 * effect and the paid-in total as grouped chips, the value series as an edge-to-edge sparkline
 * that stretches with the tile's free height, the fund count and the last manual update pinned
 * as the footer. Two differences are the page's own. The neutral chip (what was ever paid in) is
 * `bg-muted text-foreground`, never a sign token: a contribution is a flow, not a gain, and only
 * the market effect carries a sign (AGENTS.md → Layout and Color Tokens). And the sparkline's
 * window is named in the «Andamento» aside («nov 2025 → oggi · valore vivo») because the series
 * closes on today's live value, not on a snapshot — a reader who knows the last point is
 * hand-updated reads the curve correctly.
 *
 * The component computes nothing: the figures, the chip strings and every sentence arrive from
 * `pensionSummary.ts` / `pensionNarrative.ts`, and the only work here is formatting the two
 * sparkline labels. `reading` is null when the contributions failed to load, and then the tile
 * simply shows no reading — the orchestrator says why elsewhere.
 */

import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { PensionValuePoint } from '@/lib/utils/pensionReturn';
import type { FondoOggiChip } from '@/lib/utils/pensionNarrative';
import type { DashboardOverviewSparklinePoint } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { signChipClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { resolveHeroValueClass } from '@/components/dashboard/overview/PatrimonioTile';

export interface FondoOggiTileProps {
  /** The reading line under the eyebrow; null when the contributions failed to load (no reading is drawn). */
  reading: Narrative | null;
  /** The tile's scope, right of the eyebrow: «Fondo Cometa · oggi» / «2 fondi · oggi». */
  aside: string;
  /** The secondary fact pinned at the bottom: fund count, how the value is kept, the last update. */
  footer: string;
  /** Live value of every fund — the hero figure. */
  value: number;
  /** The grouped chips under the hero, already formatted (`buildFondoOggiChips`); an empty list draws no row. */
  chips: FondoOggiChip[];
  /** The value series the sparkline draws: snapshots with the funds, closed on the live value. Fewer than 2 points draw no chart. */
  series: PensionValuePoint[];
  /** The sparkline's window, as the aside of «Andamento»: «nov 2025 → oggi · valore vivo». */
  seriesAside: string;
  /** Passed through to the tile's `section`. */
  className?: string;
}

/**
 * One chip of the grouped row: the figure in a tinted pill, its caption under it. The pill is
 * sign-coloured only when the narrative gave it a sign (the month's market effect); the paid-in
 * total stays on the muted surface.
 */
function FondoChip({ chip }: { chip: FondoOggiChip }) {
  // `signChipClass` reads a number, the chip carries a sign: the figure is already a string,
  // so the sign is mapped to ±1 to keep the one source of the chip tokens.
  const Icon = chip.sign === 'negative' ? TrendingDown : TrendingUp;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span
        className={cn(
          'inline-flex w-fit max-w-full items-center gap-1.5 whitespace-nowrap rounded-[9px] px-[11px] py-[6px]',
          'font-mono text-[12px] font-semibold leading-none tracking-[-0.01em] tabular-nums',
          chip.sign ? signChipClass(chip.sign === 'positive' ? 1 : -1) : 'bg-muted text-foreground',
        )}
      >
        {chip.sign && <Icon className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />}
        <span>{chip.value}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">{chip.caption}</span>
    </div>
  );
}

/**
 * The dominant tile of Previdenza: the funds' live value, the two chips, the value series and
 * the footer. Spans two rows from `desktop:`, so the sparkline is the element that stretches
 * (`flex-1`) — the number and the chips keep their size.
 */
export function FondoOggiTile({
  reading,
  aside,
  footer,
  value,
  chips,
  series,
  seriesAside,
  className,
}: FondoOggiTileProps) {
  const hasSparkline = series.length >= 2;
  // The sparkline reads the Panoramica's point shape; a pension point is the same three fields
  // under another name, so the mapping is a rename, not a computation.
  const sparklineData: DashboardOverviewSparklinePoint[] = series.map((point) => ({
    year: point.year,
    month: point.month,
    totalNetWorth: point.value,
  }));

  return (
    <Tile eyebrow="Il fondo oggi" aside={aside} reading={reading} ariaLabel="Il fondo oggi" className={className}>
      <OverviewAnimatedCurrency
        value={value}
        animateOnMount={true}
        className={cn('mt-2.5 block leading-none', resolveHeroValueClass(value))}
      />

      {/* The chips as ONE grouped row from tablet up, a column on phones. */}
      {chips.length > 0 && (
        <div className="mt-4 flex flex-col gap-2.5 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:gap-x-2.5 tablet:gap-y-2">
          {chips.map((chip) => (
            <FondoChip key={chip.caption} chip={chip} />
          ))}
        </div>
      )}

      {hasSparkline && (
        <>
          {/* The label keeps its width and the window wraps: at a phone's width the aside is the
              longer of the two, and a `shrink-0` on it would push it past the tile's edge. */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <p className={cn('shrink-0', TILE_SUB_EYEBROW_CLASS)}>Andamento</p>
            <span className="min-w-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{seriesAside}</span>
          </div>
          {/* Edge-to-edge (the -mx matches the tile padding). The SVG is absolutely positioned
              so its 100% height resolves against the flex-sized box instead of its own viewBox
              ratio — an in-flow SVG with height:100% in an auto-height parent grows to
              width × (viewBox height / width). preserveAspectRatio="none" makes the stretch safe. */}
          <div className="relative -mx-5 mt-3 min-h-[180px] flex-1 [&_svg]:absolute [&_svg]:inset-0 [&_svg]:h-full [&_svg]:w-full">
            <NetWorthSparkline data={sparklineData} filled={true} color="var(--chart-1)" height={180} interactive />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>{cachedFormatCurrencyEUR(series[0].value, true)}</span>
            <span>{cachedFormatCurrencyEUR(series[series.length - 1].value, true)}</span>
          </div>
        </>
      )}

      {/* Pinned with mt-auto only when nothing above stretches: with a sparkline the chart takes
          the free height and the footer follows it. */}
      <div
        className={cn(
          'flex flex-col gap-1 border-t border-border pt-3.5 text-[11px] text-muted-foreground',
          hasSparkline ? 'mt-3.5' : 'mt-auto pt-4',
        )}
      >
        <p className="font-mono tabular-nums">{footer}</p>
      </div>
    </Tile>
  );
}
