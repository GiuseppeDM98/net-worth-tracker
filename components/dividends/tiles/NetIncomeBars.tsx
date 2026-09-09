'use client';

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

export interface NetIncomeBarPoint {
  key: string;
  /** The axis label under the bar ("gen", "2025"). */
  label: string;
  value: number;
  /** How the hover tip and the aria-label name the bar ("gennaio 2026", "2025"). */
  caption: string;
  /** A window still running: drawn, but softer, because it is not comparable with the others. */
  ongoing?: boolean;
}

interface NetIncomeBarsProps {
  points: NetIncomeBarPoint[];
  /** The bar the page is about — outlined, never the others dimmed. */
  highlightKey?: string | null;
  /** A dashed reference the reading names in words (the closed-year average); null for none. */
  reference?: number | null;
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
 * Net income per month or per year as a hand-written SVG bar chart (DESIGN.md → In-tile Bars):
 * the plot stretches to the tile's free height (`absolute inset-0` + `preserveAspectRatio="none"`)
 * while the axis labels live OUTSIDE the SVG in a CSS grid, so they never stretch with it.
 *
 * One component serves both the hero's monthly bars and the Per anno tile's yearly ones — two
 * windows of the same quantity, and a second implementation would drift.
 *
 * Colour is `--chart-2`, the slot the rest of the app already uses for income. A window still
 * running is drawn at reduced opacity and outlined: it is real data, but it is not yet
 * comparable with the closed ones the reading ranks.
 */
export function NetIncomeBars({
  points,
  highlightKey = null,
  reference = null,
  ariaLabel,
  minHeight = 150,
  className,
}: NetIncomeBarsProps) {
  const max = Math.max(...points.map((p) => p.value), reference ?? 0, 1);
  const slot = VIEW_W / points.length;
  const barWidth = slot * BAR_SHARE;
  const heightOf = (value: number) => (value / max) * (VIEW_H - HEAD_ROOM);

  const hover = useChartHover(points.length, 'slot');
  const hovered = hover.index !== null ? points[hover.index] : null;

  const label = points.map((p) => `${p.caption}: ${cachedFormatCurrencyEUR(p.value, true)}`).join('; ');

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight }} {...(hover.enabled ? hover.handlers : {})}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`${ariaLabel} ${label}.`}
        >
          <line x1={0} y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {hover.index !== null && (
            <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />
          )}
          {points.map((point, i) => {
            const height = heightOf(point.value);
            const outlined = point.key === highlightKey || point.ongoing === true;
            return (
              <g key={point.key}>
                <title>{`${point.caption}: ${cachedFormatCurrencyEUR(point.value, true)}`}</title>
                <rect
                  x={i * slot + (slot - barWidth) / 2}
                  y={VIEW_H - height}
                  width={barWidth}
                  height={height}
                  fill="var(--chart-2)"
                  fillOpacity={point.ongoing ? 0.55 : 1}
                  stroke={outlined ? 'var(--foreground)' : 'none'}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
          {/* The dashed reference carries no label: the reading above the chart says what it is,
              and a label on the plot would paint over whichever bar stands at the edge. */}
          {reference !== null && reference > 0 && (
            <line
              x1={0}
              y1={VIEW_H - heightOf(reference)}
              x2={VIEW_W}
              y2={VIEW_H - heightOf(reference)}
              stroke="var(--foreground)"
              strokeOpacity={0.6}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / points.length} label={hovered.caption}>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(hovered.value, true)}
            </span>
          </ChartHoverTip>
        )}
      </div>
      <div
        className="mt-1.5 grid"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {points.map((point) => (
          <span
            key={point.key}
            className={cn(
              'text-center font-mono text-[10px] tabular-nums',
              point.key === highlightKey || point.ongoing ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
