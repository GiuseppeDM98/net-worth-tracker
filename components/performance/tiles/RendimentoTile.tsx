'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { CompanionReturnChip, DrawdownStatus, GrowthOfHundredSeries, HeroReturn } from '@/lib/utils/performanceSummary';
import { formatSignedPercentIt, formatSignedPoints, printedSign } from '@/lib/utils/formatters';
import { getMetricValueColor, signChipClass } from '@/lib/utils/metricColors';
import { useCountUp } from '@/lib/utils/useCountUp';
import { cn } from '@/lib/utils';
import { LIFTED_FIGURE_CLASS, Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { PERFORMANCE_SECTION_IDS, RENDIMENTO_BENCHMARK_CHIP_BLOCK, RENDIMENTO_HERO_BLOCK } from '@/lib/utils/performanceSummary';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { SeriesLegend } from '@/components/ui/series-legend';
import { GrowthOfHundredChart } from '@/components/performance/GrowthOfHundredChart';

/**
 * The blocks a phone's strip lifts from this tile (The Lifted-Figure Rule; doc/guide/rendimenti.md
 * § Composizione mobile): the hero with its qualifier (the return cell), the gap chip (the
 * model cell), and the «dal massimo del periodo» chip, whose figure the verdict's sequel carries.
 * The chip on the other basis stays.
 */
export type RendimentoLiftedBlock = typeof RENDIMENTO_HERO_BLOCK | typeof RENDIMENTO_BENCHMARK_CHIP_BLOCK | typeof RENDIMENTO_DRAWDOWN_CHIP_BLOCK;

export const RENDIMENTO_DRAWDOWN_CHIP_BLOCK = 'drawdown-chip';

const LIFTED_BLOCKS: readonly string[] = [RENDIMENTO_HERO_BLOCK, RENDIMENTO_BENCHMARK_CHIP_BLOCK, RENDIMENTO_DRAWDOWN_CHIP_BLOCK];

/** Narrows the `string[]` of `liftedBlocks(strip, section)` to this tile's blocks at the call site (the convention of `LIFTED_FIGURE_CLASS`). */
export function isRendimentoLiftedBlock(block: string): block is RendimentoLiftedBlock {
  return LIFTED_BLOCKS.includes(block);
}

interface RendimentoTileProps {
  aside: string;
  reading: Narrative | null;
  heroReturn: HeroReturn;
  /** Months of return the figure is measured on, for the qualifier under the number. */
  numberOfMonths: number;
  /** The reference model and the gap in points ON THE HERO'S BASIS (`resolveBenchmarkGap`); null while its series is loading or unavailable. */
  benchmark: { name: string; delta: number } | null;
  benchmarkLoading: boolean;
  benchmarkName: string;
  /** The same TWR on the basis the hero does not state (`resolveCompanionReturnChip`); null when it would repeat the hero or extrapolate. */
  companionReturn: CompanionReturnChip | null;
  /** Where the portfolio stands today against the period's peak. */
  drawdown: DrawdownStatus | null;
  series: GrowthOfHundredSeries;
  /** «fine dic 2025», the month the plot's 100 sits on; null without a series. */
  baseMonthLabel: string | null;
  /** The currency the model is measured in: EUR, or USD when the FX route failed. */
  benchmarkCurrency: 'EUR' | 'USD';
  /**
   * The blocks the phone's strip already prints, hidden below `desktop:` (`liftedBlocks(strip,
   * 'rend-twr').filter(isRendimentoLiftedBlock)` plus the drawdown chip, from the page). The
   * «in arrivo» chip is never lifted: a cell without a figure lifts nothing.
   */
  liftedFigures?: readonly RendimentoLiftedBlock[];
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
  // The sign follows the PRINTED value (AGENTS.md § Layout and Color Tokens, since 2026-10-14): «0,0%» for
  // +0,03, as the strip cell prints it.
  return <>{formatSignedPercentIt(shown, 1)}</>;
}

/** A chip's tone follows its PRINTED value (one decimal): a figure that prints as zero is uncoloured, like the strip cell that repeats it. */
function Chip({ value, caption, className, children }: { value: number | null; caption: string; className?: string; children: React.ReactNode }) {
  const sign = value === null ? null : printedSign(value, 1);
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span
        className={cn(
          'inline-flex w-fit max-w-full items-center gap-1.5 whitespace-nowrap rounded-[var(--costume-control-chip-radius,9px)] px-[11px] py-[6px] font-mono text-[12px] font-semibold leading-none tracking-[-0.01em] tabular-nums',
          sign === null || sign === 0 ? 'bg-muted text-foreground' : signChipClass(sign),
        )}
      >
        {children}
      </span>
      <span className="text-[11px] text-muted-foreground">{caption}</span>
    </div>
  );
}

/**
 * «Quanto rende?» — the dominant tile: the TWR (the period's return below a year, annualised from
 * a year on, and the qualifier says which), the gap against the reference model ON THAT BASIS, the
 * same return on the other basis (never the ROI: a gain over the first month's capital is not the
 * period's return) and today's distance from the period's peak as grouped chips, then the
 * growth-of-100 plot, which is the element that stretches when the tile spans two rows.
 */
export function RendimentoTile({
  aside,
  reading,
  heroReturn,
  numberOfMonths,
  benchmark,
  benchmarkLoading,
  benchmarkName,
  companionReturn,
  drawdown,
  series,
  baseMonthLabel,
  benchmarkCurrency,
  liftedFigures = [],
  className,
}: RendimentoTileProps) {
  const DeltaIcon = benchmark && printedSign(benchmark.delta, 1) < 0 ? TrendingDown : TrendingUp;
  const lifted = (block: RendimentoLiftedBlock) => liftedFigures.includes(block);
  // The chips' row hides whole when nothing of it would stay: a bare `gap` row is a hole on a phone.
  const benchmarkChipStays = benchmarkLoading || (benchmark !== null && !lifted(RENDIMENTO_BENCHMARK_CHIP_BLOCK));
  const drawdownChipStays = drawdown !== null && !lifted(RENDIMENTO_DRAWDOWN_CHIP_BLOCK);
  const chipsRowLifted = !benchmarkChipStays && companionReturn === null && !drawdownChipStays;
  // Two statements, not one inline expression in the JSX: the React Compiler cannot lower `||`
  // whose left side holds conditionals.
  const methodSummaryText = [baseMonthLabel ? `Base 100 a fine ${baseMonthLabel}.` : null, benchmarkCurrency === 'USD' ? 'Modello in USD: cambi non disponibili.' : null].filter(Boolean).join(' ');
  const methodSummary = methodSummaryText || undefined;

  return (
    <Tile id={PERFORMANCE_SECTION_IDS.twr} eyebrow="Rendimento (TWR)" aside={aside} reading={reading} className={className} ariaLabel="Rendimento">
      {/* The hero block is the figure WITH its qualifier: lifted, the strip's cell carries both («Rendimento nei 4 mesi»). */}
      <div className={cn('mt-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1', lifted(RENDIMENTO_HERO_BLOCK) && LIFTED_FIGURE_CLASS)}>
        <p className={cn('font-mono text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums desktop:text-[54px]', getMetricValueColor(heroReturn.value === null ? null : printedSign(heroReturn.value, 1), 'percentage'))}>
          {heroReturn.value === null ? '—' : <HeroValue value={heroReturn.value} />}
        </p>
        {/* A period return already names its months («nei 9 mesi»); the annualised one needs them beside it. */}
        <span className="text-[11px] text-muted-foreground">
          {heroReturn.isPeriodReturn ? (
            heroReturn.label
          ) : (
            <>
              {heroReturn.label} · <span className="font-mono tabular-nums">{numberOfMonths}</span> {numberOfMonths === 1 ? 'mese' : 'mesi'}
            </>
          )}
        </span>
      </div>

      <div className={cn('mt-3.5 flex flex-col gap-2.5 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:gap-x-2.5 tablet:gap-y-2', chipsRowLifted && LIFTED_FIGURE_CLASS)}>
        {benchmarkLoading ? (
          <Chip value={null} caption={`vs ${benchmarkName}`}>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden="true" />
            <span className="font-sans font-medium">in arrivo</span>
          </Chip>
        ) : (
          benchmark && (
            <Chip value={benchmark.delta} caption={`vs ${benchmark.name}`} className={lifted(RENDIMENTO_BENCHMARK_CHIP_BLOCK) ? LIFTED_FIGURE_CLASS : undefined}>
              <DeltaIcon className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
              {formatSignedPoints(benchmark.delta)}
            </Chip>
          )
        )}
        {companionReturn && (
          <Chip value={companionReturn.value} caption={companionReturn.label}>
            {formatSignedPercentIt(companionReturn.value, 1)}
          </Chip>
        )}
        {drawdown && (
          <Chip
            value={drawdown.atPeak ? null : drawdown.current}
            caption={drawdown.atPeak ? 'oggi' : 'dal massimo del periodo'}
            className={lifted(RENDIMENTO_DRAWDOWN_CHIP_BLOCK) ? LIFTED_FIGURE_CLASS : undefined}
          >
            {drawdown.atPeak ? <span className="font-sans font-medium">Massimo del periodo</span> : formatSignedPercentIt(drawdown.current, 1)}
          </Chip>
        )}
      </div>

      {series.points.length >= 2 && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className={TILE_SUB_EYEBROW_CLASS}>Crescita di 100</p>
            <SeriesLegend
              items={[
                { label: 'Portafoglio', colors: ['var(--chart-1)'] },
                ...(series.benchmarkEnd !== null ? [{ label: benchmarkName, colors: ['var(--muted-foreground)'] }] : []),
              ]}
            />
          </div>
          {/* The curve yields on a phone (120px below `desktop:`, 160 from it), never the reading (The First-Screen Rule). */}
          <GrowthOfHundredChart series={series} benchmarkName={benchmarkName} minHeight={160} className="mt-2 flex-1 [--growth-min-h:120px] desktop:[--growth-min-h:160px]" />
        </>
      )}

      <TileMethodNote subject="Rendimento (TWR)" summary={methodSummary}>
        <span className="block">
          Il TWR concatena i rendimenti mensili togliendo da ciascuno il capitale entrato o uscito: misura il portafoglio, non i versamenti.
        </span>
        <span className="block">
          Sotto l&apos;anno la cifra grande è il rendimento del periodo e quella annualizzata sta accanto; da un anno in su è l&apos;inverso. Il confronto con {benchmarkName} è sulla stessa base della cifra grande.
        </span>
        <span className="block">Il primo snapshot è la valutazione di partenza, non un mese misurato.</span>
        {benchmarkCurrency === 'EUR' && <span className="block">Il modello è convertito in EUR ai cambi di fine mese.</span>}
      </TileMethodNote>
    </Tile>
  );
}
