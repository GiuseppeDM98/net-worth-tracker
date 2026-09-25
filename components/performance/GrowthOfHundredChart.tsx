'use client';

import { useId, useMemo, type PointerEvent } from 'react';
import type { GrowthOfHundredSeries } from '@/lib/utils/performanceSummary';
import { formatNumber } from '@/lib/services/chartService';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';
import { useMorphingSeries } from '@/lib/hooks/useMorphingSeries';

interface GrowthOfHundredChartProps {
  series: GrowthOfHundredSeries;
  benchmarkName: string;
  /** Minimum height of the plot; the tile's flex column lets it stretch past it, up to `maxHeight`. */
  minHeight?: number;
  /** The plot stops growing here whatever flex space it is given: see the component's note. */
  maxHeight?: number;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 180;
const PAD = 4;
/** How many axis labels a plot carries at most — one per month would collide past a year. */
const MAX_AXIS_LABELS = 7;

function monthLabel(year: number, month: number, withYear: boolean): string {
  const short = MONTH_NAMES_SHORT[month - 1].toLowerCase();
  return withYear ? `${short} ${String(year).slice(-2)}` : short;
}

/** Fewest labels an exact division is worth: below it the integer-step walk reads better than three ticks. */
const MIN_EXACT_LABELS = 4;
/** The x labels' row under the plot: 6px of air plus a 14px line. The y gutter stops above it. */
const X_AXIS_ROW_PX = 20;
/** Two y ticks closer than this share of the plot would print over each other (a 10px label on a 160px plot). */
const MIN_TICK_GAP = 0.09;

/**
 * Indices at a WHOLE step, the first and the last always included.
 *
 * A fractional step rounded per label landed on irregular months — ten points on seven labels gave
 * dic, feb, mar, mag, giu, ago, set, steps of 2-1-2-1-2-1 (2026-09-20). When some label count divides
 * the span exactly every gap is equal; otherwise the walk keeps one whole step and the LAST gap
 * alone is longer, because the closing month is always named.
 */
export function pickAxisIndices(count: number, max = MAX_AXIS_LABELS): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const lastIndex = count - 1;
  for (let labels = max; labels >= MIN_EXACT_LABELS; labels--) {
    if (lastIndex % (labels - 1) === 0) {
      const exactStep = lastIndex / (labels - 1);
      return Array.from({ length: labels }, (_, i) => i * exactStep);
    }
  }
  const step = Math.ceil(lastIndex / (max - 1));
  const indices: number[] = [];
  for (let i = 0; i < lastIndex; i += step) indices.push(i);
  // The label before the last would sit closer to it than a step: it leaves, the last one stays.
  if (lastIndex - indices[indices.length - 1] < step && indices.length > 1) indices.pop();
  indices.push(lastIndex);
  return indices;
}

/**
 * The Rendimento tile's plot: the portfolio and the reference model compounded from 100 over the
 * measured window. Hand-written SVG (DESIGN.md → In-tile Bars): it stretches with the tile's
 * free height, the labels live outside the SVG, and a mouse reads the month under it. The
 * benchmark is a baseline, so it takes the neutral `--muted-foreground`, never a series colour:
 * a coloured benchmark would compete with the one line the tile is about.
 *
 * A period switch does not redraw the plot: both lines glide from the window they showed to the
 * new one (`useMorphingSeries`), scale included, and the hover reads the landed figures only.
 *
 * Three things the plot owes its reader (critique of 2026-09-20):
 * - a SCALE. Min–max scaling with no y labels made a −4,1% dip fall to the floor of a 669px plot
 *   and read as a crash. Three mono ticks in a left gutter — the window's low, 100, its high —
 *   say how much the picture is worth; 100 wins a collision, being the base the title names.
 * - a fill that means something. The tint runs from the line to the 100 BASELINE and only above
 *   it (what was gained); filled down to a non-zero floor it measured nothing.
 * - a bounded height. The tile is `row-span-2` and the plot is `flex-1`: it was 428×669. It still
 *   stretches, but stops at `maxHeight` — past a 4:3 box the slope exaggerates every move.
 */
export function GrowthOfHundredChart({ series, benchmarkName, minHeight = 160, maxHeight = 320, className }: GrowthOfHundredChartProps) {
  const clipId = useId();
  const { points } = series;
  // The drawn series: the landed points, or a frame of the glide towards them.
  const portfolioTarget = useMemo(() => points.map((p) => p.portfolio), [points]);
  const benchmarkTarget = useMemo(() => points.map((p) => p.benchmark), [points]);
  const portfolio = useMorphingSeries(portfolioTarget);
  const benchmark = useMorphingSeries(benchmarkTarget);

  const values = portfolio.flatMap((v, i) => {
    const b = benchmark[i];
    return v === null ? [] : b === null || b === undefined ? [v] : [v, b];
  });
  // 100 is always inside the scale: the baseline and its tick must exist even on a window that never touched it.
  const min = Math.min(...values, 100);
  const max = Math.max(...values, 100);
  const span = max - min || 1;
  const sx = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * VIEW_W : 0);
  const sy = (v: number) => PAD + (1 - (v - min) / span) * (VIEW_H - PAD * 2);

  const portfolioPath = portfolio.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v ?? 100).toFixed(1)}`).join(' ');
  const baselineY = sy(100);
  // Closed on the baseline, then clipped to what lies above it: below 100 the line runs alone.
  const areaPath = `${portfolioPath} L${VIEW_W},${baselineY.toFixed(1)} L0,${baselineY.toFixed(1)} Z`;
  // The benchmark may have gaps (a month not yet published): each run of months is its own path.
  const benchmarkPaths: string[] = [];
  let run: string[] = [];
  benchmark.forEach((v, i) => {
    if (v === null || v === undefined) {
      if (run.length > 1) benchmarkPaths.push(run.join(' '));
      run = [];
      return;
    }
    run.push(`${run.length === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`);
  });
  if (run.length > 1) benchmarkPaths.push(run.join(' '));

  const spansYears = points.length > 0 && points[0].year !== points[points.length - 1].year;
  const hover = useChartHover(points.length, 'nearest');
  const hovered = hover.index !== null ? points[hover.index] : null;

  // The ticks print the LANDED window's extremes, never a frame of the glide (the rule of the hover);
  // only 100's height follows the gliding scale, with the dashed line it labels.
  const landed = points.flatMap((p) => (p.benchmark === null ? [p.portfolio] : [p.portfolio, p.benchmark]));
  const landedMin = Math.min(...landed, 100);
  const landedMax = Math.max(...landed, 100);
  const baselineAt = baselineY / VIEW_H;
  const yTicks = [
    { key: 'max', value: landedMax, at: PAD / VIEW_H },
    { key: 'base', value: 100, at: baselineAt },
    { key: 'min', value: landedMin, at: (VIEW_H - PAD) / VIEW_H },
  ].filter((tick) => tick.key === 'base' || Math.abs(tick.at - baselineAt) >= MIN_TICK_GAP);
  const widestTick = formatNumber(landedMax, 1);

  const axisIndices = pickAxisIndices(points.length);

  const first = points[0];
  const last = points[points.length - 1];
  const label = first && last
    ? `Crescita di 100 da ${monthLabel(first.year, first.month, true)} a ${monthLabel(last.year, last.month, true)}: portafoglio ${formatNumber(last.portfolio, 1)}${series.benchmarkEnd !== null ? `, ${benchmarkName} ${formatNumber(series.benchmarkEnd, 1)}` : ''}`
    : 'Crescita di 100';

  return (
    <div className={cn('flex gap-2', className)} style={{ maxHeight: maxHeight + X_AXIS_ROW_PX }}>
      {/* The y gutter: HTML like the x labels, so the figures keep their size while the SVG stretches. */}
      <div className="relative shrink-0" aria-hidden="true">
        {/* Sizes the gutter: the ticks themselves are absolute and give it no width. */}
        <span className="invisible block font-mono text-[10px] tabular-nums">{widestTick}</span>
        <div className="absolute inset-x-0 top-0" style={{ bottom: X_AXIS_ROW_PX }}>
          {yTicks.map((tick) => (
            <span
              key={tick.key}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] leading-none tabular-nums text-muted-foreground"
              style={{ top: `${tick.at * 100}%` }}
            >
              {formatNumber(tick.value, 1)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* A lifted or cancelled touch clears the reading: on a hybrid device (fine pointer AND a touch screen) a tap moved the pointer and never left. */}
        <div
          className="relative flex-1"
          style={{ minHeight }}
          {...(hover.enabled
            ? {
                ...hover.handlers,
                onPointerUp: (event: PointerEvent<HTMLElement>) => {
                  if (event.pointerType !== 'mouse') hover.handlers.onPointerLeave();
                },
                onPointerCancel: hover.handlers.onPointerLeave,
              }
            : {})}
        >
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={label}>
            <defs>
              <clipPath id={clipId}>
                <rect x={0} y={0} width={VIEW_W} height={Math.max(baselineY, 0)} />
              </clipPath>
            </defs>
            <line x1={0} x2={VIEW_W} y1={baselineY} y2={baselineY} stroke="var(--foreground)" strokeOpacity={0.6} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <path d={areaPath} fill="var(--chart-1)" fillOpacity={0.16} clipPath={`url(#${clipId})`} />
            {benchmarkPaths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="var(--muted-foreground)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={portfolioPath} fill="none" stroke="var(--chart-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {hovered && hover.index !== null && (
              <>
                <line x1={sx(hover.index)} x2={sx(hover.index)} y1={0} y2={VIEW_H} stroke="var(--foreground)" strokeOpacity={0.25} vectorEffect="non-scaling-stroke" />
                <circle cx={sx(hover.index)} cy={sy(hovered.portfolio)} r={3} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              </>
            )}
          </svg>
          {hovered && hover.index !== null && (
            <ChartHoverTip x={points.length > 1 ? hover.index / (points.length - 1) : 0} label={`${MONTH_NAMES_SHORT[hovered.month - 1]} ${hovered.year}`}>
              <span className="font-mono tabular-nums">
                <span className="text-muted-foreground">Portafoglio </span>
                <span className={hovered.portfolio >= 100 ? 'text-positive' : 'text-destructive'}>{formatNumber(hovered.portfolio, 1)}</span>
              </span>
              {hovered.benchmark !== null && (
                <span className="font-mono tabular-nums">
                  <span className="text-muted-foreground">{benchmarkName} </span>
                  <span className="text-foreground">{formatNumber(hovered.benchmark, 1)}</span>
                </span>
              )}
            </ChartHoverTip>
          )}
        </div>
        <div className="relative mt-1.5 h-[14px]" aria-hidden="true">
          {axisIndices.map((i, position) => {
            const x = points.length > 1 ? (i / (points.length - 1)) * 100 : 0;
            const p = points[i];
            // The year is printed where it CHANGES from the label before: with a whole step January may never be a tick.
            const previous = position > 0 ? points[axisIndices[position - 1]] : null;
            const withYear = spansYears && (previous === null || previous.year !== p.year);
            return (
              <span
                key={i}
                className="absolute top-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground"
                style={{ left: `${x}%`, transform: i === 0 ? 'none' : i === points.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
              >
                {monthLabel(p.year, p.month, withYear)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
