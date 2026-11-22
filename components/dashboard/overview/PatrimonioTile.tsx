'use client';

import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import type { DashboardOverviewSparklinePoint } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR, formatSignedPercentIt } from '@/lib/utils/formatters';
import { signChipClass, signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { PeriodSelector, type SparklinePeriod } from '@/components/dashboard/PeriodSelector';
import { LIFTED_FIGURE_CLASS } from '@/components/ui/tile';
import { OverviewTile, TILE_SUB_EYEBROW_CLASS } from './OverviewTile';

/**
 * The blocks of this tile a phone's strip can repeat (The Lifted-Figure Rule: the Panoramica since
 * 2026-10-11, Patrimonio with the same names since 2026-10-14 — doc/guide/patrimonio.md § Composizione
 * mobile): the month's chip, the year's chip, the «Mercato:» digest, the right-hand label under the curve (the hero in compact form). A lifted block takes
 * `LIFTED_FIGURE_CLASS` and hides below `desktop:`; the hero itself is never lifted (the same rule).
 */
export type PatrimonioLiftedBlock = 'monthly' | 'yearly' | 'movers' | 'curve-end';

const PATRIMONIO_LIFTED_BLOCKS: readonly string[] = ['monthly', 'yearly', 'movers', 'curve-end'];

/** Narrows the `string[]` of `liftedBlocks(strip, section)` to this tile's blocks at the call site. */
export function isPatrimonioLiftedBlock(block: string): block is PatrimonioLiftedBlock {
  return PATRIMONIO_LIFTED_BLOCKS.includes(block);
}

/** The suffix of the «Andamento» row's id: where a strip cell that changes the curve's period scrolls to. */
export const PATRIMONIO_CURVE_ID_SUFFIX = '-andamento';

/**
 * The hero number's size class. A 7-8 figure total at 44/54px would wrap inside the tile, so
 * the step-down keys off the formatted string's length (the tile's width does not vary; the
 * string does) — doc/guide/panoramica.md § Panoramica and Dashboard Data Isolation.
 */
export function resolveHeroValueClass(totalValue: number): string {
  const formattedLength = cachedFormatCurrencyEUR(totalValue).length;
  return cn(
    'font-mono font-bold tracking-[-0.035em] tabular-nums',
    formattedLength > 13 ? 'text-[32px] desktop:text-[40px]' : 'text-[44px] desktop:text-[54px]',
  );
}

/** One entry of the "Mercato:" digest — a class on the Panoramica, an instrument on Patrimonio. */
export interface MarketDigestEntry {
  key: string;
  label: string;
  delta: number;
}

/** The two windows the hero chips read, either of them absent when there is no baseline. */
export interface PatrimonioTileVariations {
  monthly: { value: number; percentage: number } | null;
  yearly: { value: number; percentage: number } | null;
}

interface PatrimonioTileProps {
  totalValue: number;
  heroValueClass: string;
  variations: PatrimonioTileVariations;
  /** Renders the "Massimo storico" chip. */
  isNewATH?: boolean;
  sparklinePeriod: SparklinePeriod;
  onSparklinePeriodChange: (period: SparklinePeriod) => void;
  sparklineDisplay: DashboardOverviewSparklinePoint[];
  /**
   * The "Mercato:" digest. The Panoramica passes the payload's per-class movers, Patrimonio its
   * top instruments, so the two pages never print the same line.
   */
  movers?: MarketDigestEntry[];
  /** The muted count line under the digest; defaults to "N asset in portafoglio". Patrimonio passes its holdings count: a link to its table at 1440, a button opening the Strumenti row below `desktop:`. */
  countLine?: ReactNode;
  /** Feeds that default line; ignored once `countLine` is given. */
  assetCount?: number;
  /** Appends "· snapshot del mese presente" to whichever count line is shown. */
  hasCurrentMonthSnapshot?: boolean;
  /**
   * The `section`'s id (THE tile of the phone composition, open at every width); the «Andamento»
   * row takes `<id>-andamento`, so a strip cell can scroll to the curve after changing its period.
   */
  id?: string;
  /**
   * The blocks the page's strip already prints, hidden below `desktop:` (The Lifted-Figure Rule):
   * `[...liftedBlocks(strip, id).filter(isPatrimonioLiftedBlock), 'curve-end', 'movers' when the
   * verdict names the market]` (the Panoramica, and Patrimonio with the year's chip too). Default none: the landing keeps every block.
   */
  liftedFigures?: readonly PatrimonioLiftedBlock[];
  className?: string;
}

/**
 * The grouped variation chip of a hero tile (DESIGN.md → The Grouped Chip Rule): the signed
 * amount and percentage in the sign colour, an 11px caption under it. Exported because the
 * Assistente's context tile shows the same variations — a second chip would drift.
 */
export function VariationChip({
  value,
  percentage,
  caption,
  className,
}: {
  value: number;
  percentage: number;
  caption: string;
  /** `LIFTED_FIGURE_CLASS` on a chip the phone's strip already prints. */
  className?: string;
}) {
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex w-fit max-w-full items-center gap-1.5 whitespace-nowrap rounded-[var(--costume-control-chip-radius,9px)] px-[11px] py-[6px]',
          'font-mono text-[12px] font-semibold leading-none tracking-[-0.01em] tabular-nums',
          signChipClass(value),
        )}
      >
        <Icon className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
        {value >= 0 ? '+' : '−'}
        {/* The percentage is the text of the resource bar's «Da inizio anno» cell: signed on the printed value, «0,00%» at zero. */}
        {cachedFormatCurrencyEUR(Math.abs(value))} ({formatSignedPercentIt(percentage, 2)})
      </span>
      <span className="text-[11px] text-muted-foreground">{caption}</span>
    </div>
  );
}

/**
 * The dominant tile: net worth, its two variations, the all-time-high chip, the sparkline on
 * the selected period, and the market digest. Spans two rows on desktop, so the sparkline is
 * the element that stretches (`flex-1`) — the number and the chips keep their size.
 *
 * It takes the FIGURES it draws, not the overview payload it used to receive: three surfaces
 * render this one hero — the Panoramica, Patrimonio and the public landing, which has no
 * account and therefore no payload — and a second hero built for the third would drift from
 * the other two (doc/guide/panoramica.md § Panoramica and Dashboard Data Isolation).
 */
export function PatrimonioTile({
  totalValue,
  heroValueClass,
  variations,
  isNewATH = false,
  sparklinePeriod,
  onSparklinePeriodChange,
  sparklineDisplay,
  movers = [],
  countLine,
  assetCount = 0,
  hasCurrentMonthSnapshot = false,
  id,
  liftedFigures = [],
  className,
}: PatrimonioTileProps) {
  const hasSparkline = sparklineDisplay.length >= 2;
  const lifted = (block: PatrimonioLiftedBlock) => liftedFigures.includes(block);
  // The chips' row hides whole when every chip in it is lifted, or it would leave its gap behind.
  const chipsRowLifted = (!variations.monthly || lifted('monthly')) && (!variations.yearly || lifted('yearly')) && !isNewATH;

  return (
    <OverviewTile eyebrow="Patrimonio totale lordo" className={className} ariaLabel="Patrimonio" id={id}>
      <OverviewAnimatedCurrency
        value={totalValue}
        animateOnMount={true}
        className={cn('mt-2.5 block leading-none', heroValueClass)}
      />

      {/* Variation chips + record, one grouped row from tablet up, a column on phones. A chip the
          strip repeats hides whole below `desktop:`: the month's euro is the cell and its percentage
          is in «Il perché», the year's euro is in the sentence (The Lifted-Figure Rule). «Massimo storico» stays. */}
      {(variations.monthly || variations.yearly || isNewATH) && (
        <div
          className={cn(
            'mt-4 flex flex-col gap-2.5 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:gap-x-2.5 tablet:gap-y-2',
            chipsRowLifted && LIFTED_FIGURE_CLASS,
          )}
        >
          {variations.monthly && (
            <VariationChip
              value={variations.monthly.value}
              percentage={variations.monthly.percentage}
              caption="questo mese"
              className={lifted('monthly') ? LIFTED_FIGURE_CLASS : undefined}
            />
          )}
          {variations.yearly && (
            <VariationChip
              value={variations.yearly.value}
              percentage={variations.yearly.percentage}
              caption="da inizio anno"
              className={lifted('yearly') ? LIFTED_FIGURE_CLASS : undefined}
            />
          )}
          {isNewATH && (
            <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-[var(--costume-control-chip-radius,9px)] bg-positive/10 px-[11px] py-[6px] text-[12px] font-semibold leading-none text-positive">
              <Trophy className="h-[13px] w-[13px]" aria-hidden="true" />
              Massimo storico
            </span>
          )}
        </div>
      )}

      {hasSparkline && (
        <>
          <div
            id={id ? `${id}${PATRIMONIO_CURVE_ID_SUFFIX}` : undefined}
            className="mt-5 flex scroll-mt-24 flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between tablet:gap-3"
          >
            <p className={TILE_SUB_EYEBROW_CLASS}>Andamento</p>
            <PeriodSelector value={sparklinePeriod} onChange={onSparklinePeriodChange} />
          </div>
          {/* Edge-to-edge (the -mx matches the tile padding). The SVG is absolutely positioned
              so its 100% height resolves against the flex-sized box instead of its own viewBox
              ratio — an in-flow SVG with height:100% in an auto-height parent grows to
              width × (viewBox height / width), hundreds of pixels. preserveAspectRatio="none"
              makes the stretch safe. Below `desktop:` the curve yields to 120px — the curve
              shortens, never the reading (The First-Screen Rule). */}
          <div className="relative -mx-5 mt-3 flex-1 max-desktop:min-h-[120px] desktop:min-h-[180px] [&_svg]:absolute [&_svg]:inset-0 [&_svg]:h-full [&_svg]:w-full">
            <NetWorthSparkline data={sparklineDisplay} filled={true} color="var(--chart-1)" height={180} interactive />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>{cachedFormatCurrencyEUR(sparklineDisplay[0].totalNetWorth, true)}</span>
            {/* The curve's last point is the hero in compact form: lifted on a phone. */}
            <span className={lifted('curve-end') ? LIFTED_FIGURE_CLASS : undefined}>
              {cachedFormatCurrencyEUR(sparklineDisplay[sparklineDisplay.length - 1].totalNetWorth, true)}
            </span>
          </div>
        </>
      )}

      <div
        className={cn(
          'flex flex-col gap-1 border-t border-border pt-3.5 text-[11px] text-muted-foreground',
          hasSparkline ? 'mt-3.5' : 'mt-auto pt-4',
        )}
      >
        {/* The digest is lifted only when the verdict's sentence names the market in words
            («dal mercato», the class that pushed most) — `verdictNamesMarket` at the call site;
            otherwise it stays, the other classes with it. */}
        {movers.length > 0 && (
          <p className={cn('flex flex-wrap gap-x-2 gap-y-0.5 text-[12px]', lifted('movers') && LIFTED_FIGURE_CLASS)}>
            <span>Mercato:</span>
            {movers.map((mover, i) => (
              <span key={mover.key} className="whitespace-nowrap">
                {i > 0 && <span aria-hidden="true">· </span>}
                <span className="text-foreground">{mover.label}</span>{' '}
                <span className={cn('font-mono tabular-nums', signTextClass(mover.delta))}>
                  {mover.delta >= 0 ? '+' : '−'}
                  {cachedFormatCurrencyEUR(Math.abs(mover.delta), true)}
                </span>
              </span>
            ))}
          </p>
        )}
        <p className="font-mono tabular-nums">
          {countLine ??
            (assetCount === 0 ? 'Aggiungi asset per iniziare' : `${assetCount} asset in portafoglio`)}
          {hasCurrentMonthSnapshot && ' · snapshot del mese presente'}
        </p>
      </div>
    </OverviewTile>
  );
}
