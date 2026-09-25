'use client';

import { useMemo, type PointerEvent } from 'react';
import type { PerformanceChartData } from '@/types/performance';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';
import { pickAxisIndices } from './GrowthOfHundredChart';
import { useMorphingSeries } from '@/lib/hooks/useMorphingSeries';

interface CapitalMarketChartProps {
  /** From `preparePerformanceChartData`: the invested base under the net worth, month by month. */
  data: PerformanceChartData[];
  minHeight?: number;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 180;
const PAD = 4;

/**
 * One word, one colour per page (AGENTS.md → Recharts): the portfolio's value is `--chart-1` here
 * as in the Rendimento tile's growth plot — until 2026-09-20 blue was «Capitale immesso» and the
 * portfolio was amber, two tiles apart. The invested base is a REFERENCE quantity, not a part of
 * a total, so it takes the neutral ink, like the benchmark line of the growth plot. Exported so
 * the tile's legend cannot drift from the plot.
 */
export const CAPITAL_NET_WORTH_COLOR = 'var(--chart-1)';
export const CAPITAL_BASE_COLOR = 'var(--muted-foreground)';

/** «03/2026» → { month: 3, year: 2026 }. */
function parseDate(date: string): { month: number; year: number } {
  const [m, y] = date.split('/');
  return { month: parseInt(m, 10), year: parseInt(y, 10) };
}

function shortLabel(date: string, withYear: boolean): string {
  const { month, year } = parseDate(date);
  const short = MONTH_NAMES_SHORT[month - 1].toLowerCase();
  return withYear ? `${short} ${String(year).slice(-2)}` : short;
}

function signedEuro(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${cachedFormatCurrencyEUR(Math.abs(value), true)}`;
}

/**
 * «Capitale e mercato»: the invested base (what was there at the start plus the net cash paid in
 * since) as an area under the net worth as a line — the distance between the two IS the market.
 * One area under one line, never two stacked bands: cumulative contributions go negative whenever
 * tracked spending outpaces tracked income, and a stacked band drawn downward stops meeting the
 * total (AGENTS.md → Recharts). Hand-written, so it stretches with the tile and reads on hover.
 * On a period switch the area and the line glide into the new window (`useMorphingSeries`).
 */
export function CapitalMarketChart({ data, minHeight = 150, className }: CapitalMarketChartProps) {
  const netWorthTarget = useMemo(() => data.map((d) => d.netWorth), [data]);
  const baseTarget = useMemo(() => data.map((d) => d.investedBase), [data]);
  const netWorth = useMorphingSeries(netWorthTarget);
  const base = useMorphingSeries(baseTarget);

  const values = [...netWorth, ...base].filter((v): v is number => v !== null);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // A little air above and below so neither line touches the frame; the area still reaches the floor.
  const min = rawMin - (rawMax - rawMin) * 0.08;
  const max = rawMax + (rawMax - rawMin) * 0.04;
  const span = max - min || 1;
  const sx = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * VIEW_W : 0);
  const sy = (v: number) => PAD + (1 - (v - min) / span) * (VIEW_H - PAD * 2);

  const basePath = base.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v ?? 0).toFixed(1)}`).join(' ');
  const areaPath = `${basePath} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;
  const netWorthPath = netWorth.map((v, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(v ?? 0).toFixed(1)}`).join(' ');

  const spansYears = data.length > 0 && parseDate(data[0].date).year !== parseDate(data[data.length - 1].date).year;
  const axisIndices = pickAxisIndices(data.length);
  const hover = useChartHover(data.length, 'nearest');
  const hovered = hover.index !== null ? data[hover.index] : null;

  // A summary, not the series: one clause per month ran to thousands of characters on «Storico»,
  // read out in full before anything else in the tile (2026-09-20). The window and the landing
  // point are what the plot says; the months in between are in the hover and the Dettaglio.
  const firstPoint = data[0];
  const lastPoint = data[data.length - 1];
  const label =
    firstPoint && lastPoint
      ? `Patrimonio e capitale immesso da ${shortLabel(firstPoint.date, true)} a ${shortLabel(lastPoint.date, true)}. A ${shortLabel(lastPoint.date, true)}: patrimonio ${cachedFormatCurrencyEUR(lastPoint.netWorth, true)}, capitale immesso ${cachedFormatCurrencyEUR(lastPoint.investedBase, true)}, mercato ${signedEuro(lastPoint.returns)}.`
      : 'Patrimonio e capitale immesso';

  return (
    <div className={cn('flex flex-col', className)}>
      {/* A lifted or cancelled touch clears the reading, as in the growth plot: on a hybrid device a tap moved the pointer and never left. */}
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
          {/* A neutral wash under a neutral edge: the wash is deliberately faint in either theme, so the 1.5px edge is what carries the base's shape. */}
          <path d={areaPath} fill={CAPITAL_BASE_COLOR} fillOpacity={0.16} />
          <path d={basePath} fill="none" stroke={CAPITAL_BASE_COLOR} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={netWorthPath} fill="none" stroke={CAPITAL_NET_WORTH_COLOR} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {hovered && hover.index !== null && (
            <>
              <line x1={sx(hover.index)} x2={sx(hover.index)} y1={0} y2={VIEW_H} stroke="var(--foreground)" strokeOpacity={0.25} vectorEffect="non-scaling-stroke" />
              <circle cx={sx(hover.index)} cy={sy(hovered.netWorth)} r={3} fill={CAPITAL_NET_WORTH_COLOR} stroke="var(--card)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={data.length > 1 ? hover.index / (data.length - 1) : 0} label={shortLabel(hovered.date, true)}>
            <span className="font-mono tabular-nums">
              <span className="text-muted-foreground">Patrimonio </span>
              <span className="text-foreground">{cachedFormatCurrencyEUR(hovered.netWorth, true)}</span>
            </span>
            <span className="font-mono tabular-nums">
              <span className="text-muted-foreground">Capitale immesso </span>
              <span className="text-foreground">{cachedFormatCurrencyEUR(hovered.investedBase, true)}</span>
            </span>
            <span className="font-mono tabular-nums">
              <span className="text-muted-foreground">Mercato </span>
              <span className={hovered.returns >= 0 ? 'text-positive' : 'text-destructive'}>{signedEuro(hovered.returns)}</span>
            </span>
          </ChartHoverTip>
        )}
      </div>
      <div className="relative mt-1.5 h-[14px]" aria-hidden="true">
        {axisIndices.map((i, position) => {
          const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 0;
          // The year is printed where it CHANGES from the label before: with a whole step January may never be a tick.
          const withYear = spansYears && (position === 0 || parseDate(data[axisIndices[position - 1]].date).year !== parseDate(data[i].date).year);
          return (
            <span
              key={i}
              className="absolute top-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground"
              style={{ left: `${x}%`, transform: i === 0 ? 'none' : i === data.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              {shortLabel(data[i].date, withYear)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
