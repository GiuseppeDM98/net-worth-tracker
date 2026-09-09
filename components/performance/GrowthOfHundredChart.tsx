'use client';

import type { GrowthOfHundredSeries } from '@/lib/utils/performanceSummary';
import { formatNumber } from '@/lib/services/chartService';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

interface GrowthOfHundredChartProps {
  series: GrowthOfHundredSeries;
  benchmarkName: string;
  /** Minimum height of the plot; the tile's flex column lets it stretch past it. */
  minHeight?: number;
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

/** Evenly spaced indices, the first and the last always included. */
export function pickAxisIndices(count: number, max = MAX_AXIS_LABELS): number[] {
  if (count <= max) return Array.from({ length: count }, (_, i) => i);
  const step = (count - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => Math.round(i * step));
}

/**
 * The Rendimento tile's plot: the portfolio and the reference model compounded from 100 over the
 * measured window. Hand-written SVG (DESIGN.md → In-tile Bars): it stretches with the tile's
 * free height, the labels live outside the SVG, and a mouse reads the month under it. The
 * benchmark is a baseline, so it takes the neutral `--muted-foreground`, never a series colour:
 * a coloured benchmark would compete with the one line the tile is about.
 */
export function GrowthOfHundredChart({ series, benchmarkName, minHeight = 160, className }: GrowthOfHundredChartProps) {
  const { points } = series;
  const values = points.flatMap((p) => (p.benchmark === null ? [p.portfolio] : [p.portfolio, p.benchmark]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const sx = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * VIEW_W : 0);
  const sy = (v: number) => PAD + (1 - (v - min) / span) * (VIEW_H - PAD * 2);

  const portfolioPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(p.portfolio).toFixed(1)}`).join(' ');
  const areaPath = `${portfolioPath} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;
  // The benchmark may have gaps (a month not yet published): each run of months is its own path.
  const benchmarkPaths: string[] = [];
  let run: string[] = [];
  points.forEach((p, i) => {
    if (p.benchmark === null) {
      if (run.length > 1) benchmarkPaths.push(run.join(' '));
      run = [];
      return;
    }
    run.push(`${run.length === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(p.benchmark).toFixed(1)}`);
  });
  if (run.length > 1) benchmarkPaths.push(run.join(' '));

  const spansYears = points.length > 0 && points[0].year !== points[points.length - 1].year;
  const hover = useChartHover(points.length, 'nearest');
  const hovered = hover.index !== null ? points[hover.index] : null;

  const first = points[0];
  const last = points[points.length - 1];
  const label = first && last
    ? `Crescita di 100 da ${monthLabel(first.year, first.month, true)} a ${monthLabel(last.year, last.month, true)}: portafoglio ${formatNumber(last.portfolio, 1)}${series.benchmarkEnd !== null ? `, ${benchmarkName} ${formatNumber(series.benchmarkEnd, 1)}` : ''}`
    : 'Crescita di 100';

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight }} {...(hover.enabled ? hover.handlers : {})}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={label}>
          <line x1={0} x2={VIEW_W} y1={sy(100)} y2={sy(100)} stroke="var(--foreground)" strokeOpacity={0.6} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          <path d={areaPath} fill="var(--chart-1)" fillOpacity={0.16} />
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
        {pickAxisIndices(points.length).map((i) => {
          const x = points.length > 1 ? (i / (points.length - 1)) * 100 : 0;
          const p = points[i];
          return (
            <span
              key={i}
              className="absolute top-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground"
              style={{ left: `${x}%`, transform: i === 0 ? 'none' : i === points.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              {monthLabel(p.year, p.month, spansYears && (p.month === 1 || i === 0))}
            </span>
          );
        })}
      </div>
    </div>
  );
}
