'use client';

/**
 * The histogram of the final values as a hand-written SVG bar chart (DESIGN.md → In-tile Bars):
 * ten bins of equal width between zero and the largest final value, the bars stretching with the
 * tile's free height (`absolute inset-0` + `preserveAspectRatio="none"`), the axis labels OUTSIDE
 * the SVG in a CSS grid so they never stretch. The bin that holds the median of all simulations
 * is outlined in `--foreground` — never the others dimmed. With a mouse the plot reads the bin
 * under it through the app's one hover primitive; on a phone the `<title>`s carry the figures.
 *
 * Colour is `--chart-1`, the slot the Probabilità fan already uses for the base scenario.
 */

import type { HistogramBin } from '@/lib/utils/monteCarloSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

interface FinalValueBarsProps {
  bins: HistogramBin[];
  ariaLabel: string;
  minHeight?: number;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 180;
const BAR_SHARE = 0.78;
const HEAD_ROOM = 6;

/** «0», «420k», «1,3M» — the bin's lower bound, short enough for ten labels in a 4-column tile. */
function shortAmount(value: number): string {
  if (value < 1000) return '0';
  if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1_000_000).toLocaleString('it-IT', { maximumFractionDigits: 1 })}M`;
}

function binCaption(bin: HistogramBin): string {
  return `${cachedFormatCurrencyEUR(bin.from, true)} – ${cachedFormatCurrencyEUR(bin.to, true)}`;
}

function binFigures(bin: HistogramBin): string {
  return `${bin.count.toLocaleString('it-IT')} simulazioni (${formatPercentage(bin.sharePct, 1)})`;
}

export function FinalValueBars({ bins, ariaLabel, minHeight = 120, className }: FinalValueBarsProps) {
  const max = Math.max(...bins.map((bin) => bin.count), 1);
  const slot = VIEW_W / Math.max(bins.length, 1);
  const barWidth = slot * BAR_SHARE;
  const heightOf = (count: number) => (count / max) * (VIEW_H - HEAD_ROOM);

  const hover = useChartHover(bins.length, 'slot');
  const hovered = hover.index !== null ? bins[hover.index] : null;

  const label = bins.map((bin) => `${binCaption(bin)}: ${binFigures(bin)}`).join('; ');

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight }} {...(hover.enabled ? hover.handlers : {})}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`${ariaLabel} ${label}.`}>
          <line x1={0} y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {hover.index !== null && <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />}
          {bins.map((bin, i) => {
            const height = heightOf(bin.count);
            return (
              <g key={bin.from}>
                <title>{`${binCaption(bin)}: ${binFigures(bin)}`}</title>
                <rect
                  x={i * slot + (slot - barWidth) / 2}
                  y={VIEW_H - height}
                  width={barWidth}
                  height={height}
                  fill="var(--chart-1)"
                  stroke={bin.containsMedian ? 'var(--foreground)' : 'none'}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / bins.length} label={binCaption(hovered)}>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{hovered.count.toLocaleString('it-IT')}</span>
            <span className="text-muted-foreground">
              {formatPercentage(hovered.sharePct, 1)} delle simulazioni{hovered.containsMedian ? ' · contiene la mediana' : ''}
            </span>
          </ChartHoverTip>
        )}
      </div>
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {bins.map((bin) => (
          <span key={bin.from} className={cn('truncate text-center font-mono text-[10px] tabular-nums', bin.containsMedian ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
            {shortAmount(bin.from)}
          </span>
        ))}
      </div>
    </div>
  );
}
