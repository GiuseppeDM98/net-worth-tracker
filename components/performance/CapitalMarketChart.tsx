'use client';

import type { PerformanceChartData } from '@/types/performance';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';
import { pickAxisIndices } from './GrowthOfHundredChart';

interface CapitalMarketChartProps {
  /** From `preparePerformanceChartData`: the invested base under the net worth, month by month. */
  data: PerformanceChartData[];
  minHeight?: number;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 180;
const PAD = 4;

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

/**
 * «Capitale e mercato»: the invested base (what was there at the start plus the net cash paid in
 * since) as an area under the net worth as a line — the distance between the two IS the market.
 * One area under one line, never two stacked bands: cumulative contributions go negative whenever
 * tracked spending outpaces tracked income, and a stacked band drawn downward stops meeting the
 * total (AGENTS.md → Recharts). Hand-written, so it stretches with the tile and reads on hover.
 */
export function CapitalMarketChart({ data, minHeight = 150, className }: CapitalMarketChartProps) {
  const values = data.flatMap((d) => [d.netWorth, d.investedBase]);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  // A little air above and below so neither line touches the frame; the area still reaches the floor.
  const min = rawMin - (rawMax - rawMin) * 0.08;
  const max = rawMax + (rawMax - rawMin) * 0.04;
  const span = max - min || 1;
  const sx = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * VIEW_W : 0);
  const sy = (v: number) => PAD + (1 - (v - min) / span) * (VIEW_H - PAD * 2);

  const basePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(d.investedBase).toFixed(1)}`).join(' ');
  const areaPath = `${basePath} L${VIEW_W},${VIEW_H} L0,${VIEW_H} Z`;
  const netWorthPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(d.netWorth).toFixed(1)}`).join(' ');

  const spansYears = data.length > 0 && parseDate(data[0].date).year !== parseDate(data[data.length - 1].date).year;
  const hover = useChartHover(data.length, 'nearest');
  const hovered = hover.index !== null ? data[hover.index] : null;

  const label = data
    .map((d) => `${shortLabel(d.date, true)}: patrimonio ${cachedFormatCurrencyEUR(d.netWorth, true)}, capitale immesso ${cachedFormatCurrencyEUR(d.investedBase, true)}`)
    .join('; ');

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight }} {...(hover.enabled ? hover.handlers : {})}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={`Capitale immesso e patrimonio per mese. ${label}`}>
          <path d={areaPath} fill="var(--chart-1)" fillOpacity={0.35} />
          <path d={basePath} fill="none" stroke="var(--chart-1)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <path d={netWorthPath} fill="none" stroke="var(--chart-3)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {hovered && hover.index !== null && (
            <>
              <line x1={sx(hover.index)} x2={sx(hover.index)} y1={0} y2={VIEW_H} stroke="var(--foreground)" strokeOpacity={0.25} vectorEffect="non-scaling-stroke" />
              <circle cx={sx(hover.index)} cy={sy(hovered.netWorth)} r={3} fill="var(--chart-3)" stroke="var(--card)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
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
              <span className={hovered.returns >= 0 ? 'text-positive' : 'text-destructive'}>
                {hovered.returns >= 0 ? '+' : '−'}
                {cachedFormatCurrencyEUR(Math.abs(hovered.returns), true)}
              </span>
            </span>
          </ChartHoverTip>
        )}
      </div>
      <div className="relative mt-1.5 h-[14px]" aria-hidden="true">
        {pickAxisIndices(data.length).map((i) => {
          const x = data.length > 1 ? (i / (data.length - 1)) * 100 : 0;
          return (
            <span
              key={i}
              className="absolute top-0 whitespace-nowrap font-mono text-[10px] tabular-nums text-muted-foreground"
              style={{ left: `${x}%`, transform: i === 0 ? 'none' : i === data.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              {shortLabel(data[i].date, spansYears && (parseDate(data[i].date).month === 1 || i === 0))}
            </span>
          );
        })}
      </div>
    </div>
  );
}
