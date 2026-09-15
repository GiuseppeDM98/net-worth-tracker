'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { DrawdownStatus, GrowthOfHundredSeries, HeroReturn, PeriodReturnChip } from '@/lib/utils/performanceSummary';
import { formatNumber, formatPercentage } from '@/lib/services/chartService';
import { getMetricValueColor, signChipClass } from '@/lib/utils/metricColors';
import { useCountUp } from '@/lib/utils/useCountUp';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { GrowthOfHundredChart } from '@/components/performance/GrowthOfHundredChart';

interface RendimentoTileProps {
  aside: string;
  reading: Narrative | null;
  heroReturn: HeroReturn;
  /** Months of return the figure is measured on, for the qualifier under the number. */
  numberOfMonths: number;
  /** The reference model and the gap in points; null while its series is loading or unavailable. */
  benchmark: { name: string; delta: number } | null;
  benchmarkLoading: boolean;
  benchmarkName: string;
  /** The period's CUMULATIVE TWR, never annualised — the second chip; null when the hero already is the period return. */
  periodReturn: PeriodReturnChip | null;
  /** Where the portfolio stands today against the period's peak. */
  drawdown: DrawdownStatus | null;
  series: GrowthOfHundredSeries;
  /** The footer line naming the base month and the currency of the benchmark. */
  footer: string;
  className?: string;
}

/**
 * Leaf so the rAF count-up re-renders only this span, not the whole tile (DESIGN.md → count-up
 * isolation). It counts up once on mount and, on a period switch, glides from the figure it showed
 * to the new one — the tile is not remounted any more, so the number is seen changing.
 */
function HeroValue({ value }: { value: number }) {
  const animated = useCountUp(value, { duration: 620, fromPrevious: true });
  const shown = animated ?? value;
  return <>{`${shown > 0 ? '+' : shown < 0 ? '−' : ''}${formatPercentage(Math.abs(shown), 1)}`}</>;
}

function formatPoints(delta: number): string {
  const points = Math.round(Math.abs(delta) * 10) / 10;
  return `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${formatNumber(points, points === Math.round(points) ? 0 : 1)} pt`;
}

function Chip({ value, caption, children }: { value: number | null; caption: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        className={cn(
          'inline-flex w-fit max-w-full items-center gap-1.5 whitespace-nowrap rounded-[9px] px-[11px] py-[6px] font-mono text-[12px] font-semibold leading-none tracking-[-0.01em] tabular-nums',
          value === null ? 'bg-muted text-foreground' : signChipClass(value),
        )}
      >
        {children}
      </span>
      <span className="text-[11px] text-muted-foreground">{caption}</span>
    </div>
  );
}

/**
 * «Quanto rende?» — the dominant tile: the TWR (annualised, or the period return below six
 * months, and the qualifier says which), the gap against the reference model, the period's
 * cumulative return (the same TWR de-annualised, never the ROI: a gain over the first month's
 * capital is not the period's return) and today's distance from the period's peak as grouped
 * chips, then the growth-of-100 plot, which is the element that stretches when the tile spans
 * two rows.
 */
export function RendimentoTile({
  aside,
  reading,
  heroReturn,
  numberOfMonths,
  benchmark,
  benchmarkLoading,
  benchmarkName,
  periodReturn,
  drawdown,
  series,
  footer,
  className,
}: RendimentoTileProps) {
  const DeltaIcon = benchmark && benchmark.delta < 0 ? TrendingDown : TrendingUp;

  return (
    <Tile eyebrow="Rendimento (TWR)" aside={aside} reading={reading} className={className} ariaLabel="Rendimento">
      <div className="mt-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className={cn('font-mono text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums desktop:text-[54px]', getMetricValueColor(heroReturn.value, 'percentage'))}>
          {heroReturn.value === null ? '—' : <HeroValue value={heroReturn.value} />}
        </p>
        <span className="text-[11px] text-muted-foreground">
          {heroReturn.label} · <span className="font-mono tabular-nums">{numberOfMonths}</span> {numberOfMonths === 1 ? 'mese' : 'mesi'}
        </span>
      </div>

      <div className="mt-3.5 flex flex-col gap-2.5 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:gap-x-2.5 tablet:gap-y-2">
        {benchmarkLoading ? (
          <Chip value={null} caption={`vs ${benchmarkName}`}>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden="true" />
            <span className="font-sans font-medium">in arrivo</span>
          </Chip>
        ) : (
          benchmark && (
            <Chip value={benchmark.delta} caption={`vs ${benchmark.name}`}>
              <DeltaIcon className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
              {formatPoints(benchmark.delta)}
            </Chip>
          )
        )}
        {periodReturn && (
          <Chip value={periodReturn.value} caption={periodReturn.label}>
            {periodReturn.value > 0 ? '+' : periodReturn.value < 0 ? '−' : ''}
            {formatPercentage(Math.abs(periodReturn.value), 1)}
          </Chip>
        )}
        {drawdown && (
          <Chip value={drawdown.atPeak ? null : drawdown.current} caption={drawdown.atPeak ? 'oggi' : 'dal massimo del periodo'}>
            {drawdown.atPeak ? <span className="font-sans font-medium">Massimo del periodo</span> : `−${formatPercentage(Math.abs(drawdown.current), 1)}`}
          </Chip>
        )}
      </div>

      {series.points.length >= 2 && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className={TILE_SUB_EYEBROW_CLASS}>Crescita di 100</p>
            <div className="flex gap-3 text-[11px] text-muted-foreground" aria-hidden="true">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-1)' }} />
                Portafoglio
              </span>
              {series.benchmarkEnd !== null && (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-[2px] bg-muted-foreground" />
                  {benchmarkName}
                </span>
              )}
            </div>
          </div>
          <GrowthOfHundredChart series={series} benchmarkName={benchmarkName} minHeight={160} className="mt-2 flex-1" />
        </>
      )}

      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">{footer}</p>
    </Tile>
  );
}
