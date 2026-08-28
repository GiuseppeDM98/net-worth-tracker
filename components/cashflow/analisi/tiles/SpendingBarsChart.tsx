'use client';

import type { SpendingPoint } from '@/lib/utils/analisiSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

interface SpendingBarsChartProps {
  points: SpendingPoint[];
  /** Months of a year (beside the previous year's same months) or whole years. */
  kind: 'month' | 'year';
  /** Minimum height of the plot; the tile's flex column lets it stretch past it. */
  minHeight?: number;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 180;
/** Share of a slot taken by each bar of a pair, and by the single bar when there is no baseline. */
const PAIR_BAR_SHARE = 0.3;
const PAIR_GAP_SHARE = 0.06;
const SINGLE_BAR_SHARE = 0.56;

/** The calendar year a point belongs to, from its key ('2026-08' / '2026'). */
const yearOf = (point: SpendingPoint): string => point.key.slice(0, 4);

/**
 * Spending per bucket as hand-written SVG bars (the In-tile Bars pattern): the period's
 * spending in `--chart-1`, the same month of the previous year beside it in
 * `--muted-foreground` — a neutral, because a baseline is neither a gain nor a loss — and a
 * gap, never a zero, where that baseline is unknowable. The bucket still running is drawn at
 * half tone AND outlined: real data the reader must see, not comparable with the closed ones.
 * Labels live outside the SVG so they never stretch with it.
 */
export function SpendingBarsChart({ points, kind, minHeight = 150, className }: SpendingBarsChartProps) {
  const hasBaseline = points.some((point) => point.prevYearValue !== null);
  const max = Math.max(...points.map((point) => Math.max(point.value, point.prevYearValue ?? 0)), 1);
  const slot = VIEW_W / Math.max(points.length, 1);
  const barWidth = slot * (hasBaseline ? PAIR_BAR_SHARE : SINGLE_BAR_SHARE);
  const gap = slot * PAIR_GAP_SHARE;
  const groupWidth = hasBaseline ? barWidth * 2 + gap : barWidth;

  const describe = (point: SpendingPoint): string => {
    const name = kind === 'month' ? `${point.label} ${yearOf(point)}` : point.label;
    const baseline = point.prevYearValue !== null ? `, ${Number(yearOf(point)) - 1}: ${cachedFormatCurrencyEUR(point.prevYearValue, true)}` : '';
    return `${name}: ${cachedFormatCurrencyEUR(point.value, true)}${baseline}${point.ongoing ? ' (in corso)' : ''}${point.scheduled ? ' (in calendario)' : ''}`;
  };

  // A mouse over a bucket reads its figures (desktop only; the SVG titles serve the rest).
  const hover = useChartHover(points.length, 'slot');
  const hovered = hover.index !== null ? points[hover.index] : null;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight }} {...(hover.enabled ? hover.handlers : {})}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Spese ${kind === 'month' ? 'per mese' : 'per anno'}. ${points.map(describe).join('; ')}`}
        >
          <line x1={0} y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {hover.index !== null && (
            <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />
          )}
          {points.map((point, i) => {
            const x = i * slot + (slot - groupWidth) / 2;
            const currentHeight = (point.value / max) * (VIEW_H - 8);
            const baselineHeight = point.prevYearValue !== null ? (point.prevYearValue / max) * (VIEW_H - 8) : 0;
            const currentX = hasBaseline ? x + barWidth + gap : x;
            return (
              <g key={point.key}>
                <title>{describe(point)}</title>
                {point.prevYearValue !== null && (
                  <rect x={x} y={VIEW_H - baselineHeight} width={barWidth} height={baselineHeight} fill="var(--muted-foreground)" />
                )}
                <rect
                  x={currentX}
                  y={VIEW_H - currentHeight}
                  width={barWidth}
                  height={currentHeight}
                  fill="var(--chart-1)"
                  // A month that has not started holds only what is already in the calendar:
                  // drawn lighter still, and never outlined — it is not the month in progress.
                  fillOpacity={point.scheduled ? 0.3 : point.ongoing ? 0.55 : 1}
                  stroke={point.ongoing ? 'var(--foreground)' : 'none'}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / points.length} label={kind === 'month' ? `${hovered.label} ${yearOf(hovered)}` : hovered.label}>
            <span className="font-mono tabular-nums">
              <span className="text-muted-foreground">{kind === 'month' ? `${yearOf(hovered)} ` : 'Spese '}</span>
              <span className="text-destructive">{cachedFormatCurrencyEUR(hovered.value, true)}</span>
              {hovered.ongoing && <span className="text-muted-foreground"> in corso</span>}
              {hovered.scheduled && <span className="text-muted-foreground"> in calendario</span>}
            </span>
            {hovered.prevYearValue !== null && (
              <span className="font-mono tabular-nums">
                <span className="text-muted-foreground">{Number(yearOf(hovered)) - 1} </span>
                <span className="text-foreground">{cachedFormatCurrencyEUR(hovered.prevYearValue, true)}</span>
              </span>
            )}
          </ChartHoverTip>
        )}
      </div>
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${Math.max(points.length, 1)}, minmax(0, 1fr))` }} aria-hidden="true">
        {points.map((point) => (
          <span
            key={point.key}
            className={cn('truncate text-center font-mono text-[10px] tabular-nums', point.ongoing ? 'font-semibold text-foreground' : 'text-muted-foreground', point.scheduled && 'opacity-60')}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
