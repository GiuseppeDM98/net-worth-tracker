'use client';

import { TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import type { DashboardOverviewSparklinePoint } from '@/types/dashboardOverview';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { signChipClass, signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { NetWorthSparkline } from '@/components/dashboard/NetWorthSparkline';
import { PeriodSelector, type SparklinePeriod } from '@/components/dashboard/PeriodSelector';
import { OverviewTile, TILE_SUB_EYEBROW_CLASS } from './OverviewTile';

/**
 * The hero number's size class. A 7-8 figure total at 44/54px would wrap inside the tile, so
 * the step-down keys off the formatted string's length (the tile's width does not vary; the
 * string does) — AGENTS.md → Panoramica.
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
  /** The muted count line under the digest; defaults to "N asset in portafoglio". */
  countLine?: string;
  /** Feeds that default line; ignored once `countLine` is given. */
  assetCount?: number;
  /** Appends "· snapshot del mese presente" to whichever count line is shown. */
  hasCurrentMonthSnapshot?: boolean;
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
}: {
  value: number;
  percentage: number;
  caption: string;
}) {
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span
        className={cn(
          'inline-flex w-fit max-w-full items-center gap-1.5 whitespace-nowrap rounded-[9px] px-[11px] py-[6px]',
          'font-mono text-[12px] font-semibold leading-none tracking-[-0.01em] tabular-nums',
          signChipClass(value),
        )}
      >
        <Icon className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
        {value >= 0 ? '+' : '−'}
        {cachedFormatCurrencyEUR(Math.abs(value))} ({percentage >= 0 ? '+' : '−'}
        {formatPercentage(Math.abs(percentage))})
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
 * the other two (AGENTS.md → Panoramica: the hero tile is ONE component).
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
  className,
}: PatrimonioTileProps) {
  const hasSparkline = sparklineDisplay.length >= 2;

  return (
    <OverviewTile eyebrow="Patrimonio totale lordo" className={className} ariaLabel="Patrimonio">
      <OverviewAnimatedCurrency
        value={totalValue}
        animateOnMount={true}
        className={cn('mt-2.5 block leading-none', heroValueClass)}
      />

      {/* Variation chips + record, one grouped row from tablet up, a column on phones. */}
      {(variations.monthly || variations.yearly || isNewATH) && (
        <div className="mt-4 flex flex-col gap-2.5 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:gap-x-2.5 tablet:gap-y-2">
          {variations.monthly && (
            <VariationChip
              value={variations.monthly.value}
              percentage={variations.monthly.percentage}
              caption="questo mese"
            />
          )}
          {variations.yearly && (
            <VariationChip
              value={variations.yearly.value}
              percentage={variations.yearly.percentage}
              caption="da inizio anno"
            />
          )}
          {isNewATH && (
            <span className="inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-[9px] bg-positive/10 px-[11px] py-[6px] text-[12px] font-semibold leading-none text-positive">
              <Trophy className="h-[13px] w-[13px]" aria-hidden="true" />
              Massimo storico
            </span>
          )}
        </div>
      )}

      {hasSparkline && (
        <>
          <div className="mt-5 flex flex-col gap-2 tablet:flex-row tablet:items-center tablet:justify-between tablet:gap-3">
            <p className={TILE_SUB_EYEBROW_CLASS}>Andamento</p>
            <div className="w-full tablet:w-[240px]">
              <PeriodSelector value={sparklinePeriod} onChange={onSparklinePeriodChange} />
            </div>
          </div>
          {/* Edge-to-edge (the -mx matches the tile padding). The SVG is absolutely positioned
              so its 100% height resolves against the flex-sized box instead of its own viewBox
              ratio — an in-flow SVG with height:100% in an auto-height parent grows to
              width × (viewBox height / width), hundreds of pixels. preserveAspectRatio="none"
              makes the stretch safe. */}
          <div className="relative -mx-5 mt-3 min-h-[180px] flex-1 [&_svg]:absolute [&_svg]:inset-0 [&_svg]:h-full [&_svg]:w-full">
            <NetWorthSparkline data={sparklineDisplay} filled={true} color="var(--chart-1)" height={180} interactive />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
            <span>{cachedFormatCurrencyEUR(sparklineDisplay[0].totalNetWorth, true)}</span>
            <span>{cachedFormatCurrencyEUR(sparklineDisplay[sparklineDisplay.length - 1].totalNetWorth, true)}</span>
          </div>
        </>
      )}

      <div
        className={cn(
          'flex flex-col gap-1 border-t border-border pt-3.5 text-[11px] text-muted-foreground',
          hasSparkline ? 'mt-3.5' : 'mt-auto pt-4',
        )}
      >
        {movers.length > 0 && (
          <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[12px]">
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
