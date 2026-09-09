'use client';

import type { TimelinePoint } from '@/lib/utils/hallOfFameSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

interface RecordBarsProps {
  points: TimelinePoint[];
  ariaLabel: string;
  minHeight?: number;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 180;
/** Share of a slot the bar takes; the rest is the gap between bars. */
const BAR_SHARE = 0.62;
/** Head-room above the tallest bar, in viewBox units, so an outline is never clipped. */
const HEAD_ROOM = 6;

/**
 * The record months in chronological order, as a hand-written SVG bar chart
 * (DESIGN.md → In-tile Bars): the plot stretches to the tile's free height
 * (`absolute inset-0` + `preserveAspectRatio="none"`) while the axis labels live OUTSIDE the
 * SVG in a CSS grid, so they never stretch with it.
 *
 * It does NOT repeat the podium above it. The podium ranks; this dates — whether the records
 * are clustered in the last year or scattered across the history is a different question, and
 * the One-Tile-One-Question Rule forbids the same rows twice.
 *
 * Colour is `--chart-1`, the slot the app already uses for net worth. A month still RUNNING is
 * drawn at reduced fill AND outlined: it is real data, and it is not yet comparable with the
 * closed months it is ranked against.
 */
export function RecordBars({ points, ariaLabel, minHeight = 130, className }: RecordBarsProps) {
  const hover = useChartHover(points.length, 'slot');
  const hovered = hover.index !== null ? points[hover.index] : null;

  if (points.length === 0) return null;

  const max = Math.max(...points.map((point) => Math.abs(point.value)), 1);
  const slot = VIEW_W / points.length;
  const barWidth = slot * BAR_SHARE;
  const heightOf = (value: number) => (Math.abs(value) / max) * (VIEW_H - HEAD_ROOM);

  const spoken = points
    .map((point) => `${point.caption}: ${cachedFormatCurrencyEUR(point.value, true)}`)
    .join('; ');

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight }} {...(hover.enabled ? hover.handlers : {})}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`${ariaLabel} ${spoken}.`}
        >
          <line x1={0} y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {hover.index !== null && (
            <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />
          )}
          {points.map((point, index) => {
            const height = heightOf(point.value);
            return (
              <g key={point.key}>
                <title>{`${point.caption}: ${cachedFormatCurrencyEUR(point.value, true)}`}</title>
                <rect
                  x={index * slot + (slot - barWidth) / 2}
                  y={VIEW_H - height}
                  width={barWidth}
                  height={height}
                  fill="var(--chart-1)"
                  fillOpacity={point.isCurrent ? 0.55 : 1}
                  stroke={point.isCurrent ? 'var(--foreground)' : 'none'}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / points.length} label={hovered.caption}>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-positive">
              +{cachedFormatCurrencyEUR(Math.abs(hovered.value), true)}
            </span>
          </ChartHoverTip>
        )}
      </div>
      {/* Outside the SVG: a label inside a `preserveAspectRatio="none"` plot stretches with it. */}
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
        {points.map((point) => (
          <span
            key={point.key}
            className={cn(
              'text-center font-mono text-[10px] tabular-nums',
              point.isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
