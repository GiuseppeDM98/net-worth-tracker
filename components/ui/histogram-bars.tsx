'use client';

/**
 * A histogram as a hand-written SVG bar chart (DESIGN.md → In-tile Bars): bars of equal slot
 * width stretching with the tile's free height (`absolute inset-0` + `preserveAspectRatio="none"`),
 * the axis labels OUTSIDE the SVG in a CSS grid so they never stretch. The reference bar (the bin
 * with the median, the base scenario's year) is outlined in `--foreground` — never the others
 * dimmed. With a mouse the plot reads the bar under it through the app's one hover primitive; on
 * a phone the `<title>`s carry the figures, and the `aria-label` reads the whole chart as a sentence.
 *
 * ONE component for the three histograms of the FIRE page (Rule of Three, 2026-09-24): the final
 * values of the Monte Carlo (`FinalValueBars`), the FIRE year and the ruin year of the paths
 * (`YearBars`). The callers name the bins; this knows only bars. Colour is `--chart-1`, the slot
 * every base scenario on the page already wears; a `neutral` bar (a bin that is not a value of the
 * quantity — the paths that never get there) takes the muted ink instead.
 */

import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

export interface HistogramBar {
  key: string;
  /** Under the bar, in the axis grid («420k», «2031», «oltre»). */
  axisLabel: string;
  /** The bar's range in words, for the `<title>`, the hover tip and the accessible label («2031–2032»). */
  caption: string;
  /** The bar's count and share in words («123 percorsi (12,3%)»). */
  figures: string;
  count: number;
  /** The second line of the hover tip («12,3% dei percorsi · anno del base»). */
  hoverDetail: string;
  /** Outlined: the bar the page is about. */
  outlined?: boolean;
  /** Muted ink: a bar that is not a value of the quantity charted. */
  neutral?: boolean;
}

interface HistogramBarsProps {
  bars: HistogramBar[];
  /** The chart's subject; the bars' captions and figures are appended to it. */
  ariaLabel: string;
  minHeight?: number;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 180;
const BAR_SHARE = 0.78;
const HEAD_ROOM = 6;
/** Up to this many four-digit labels fit a phone-wide plot side by side; past it they alternate. */
const LABELS_THAT_FIT_NARROW = 9;

export function HistogramBars({ bars, ariaLabel, minHeight = 120, className }: HistogramBarsProps) {
  const max = Math.max(...bars.map((bar) => bar.count), 1);
  const slot = VIEW_W / Math.max(bars.length, 1);
  const barWidth = slot * BAR_SHARE;
  const heightOf = (count: number) => (count / max) * (VIEW_H - HEAD_ROOM);

  const hover = useChartHover(bars.length, 'slot');
  const hovered = hover.index !== null ? bars[hover.index] : null;

  const label = bars.map((bar) => `${bar.caption}: ${bar.figures}`).join('; ');

  // Thirteen four-digit labels on a phone-wide plot touch (measured on the mirror, 2026-09-24,
  // «20442046…olt…»): a 10px mono year needs ~30px, so below 400px of plot (the most bins are
  // thirteen) every other label steps aside — the first, the outlined and the last kept — and the
  // `<title>`s still name every bar. A 5-column tile at 1440 gives the plot ~430px: every label.
  const crowded = bars.length > LABELS_THAT_FIT_NARROW;
  const last = bars.length - 1;
  // Every other label from the first, the outlined one and the last — and the last never with a
  // neighbour (measured: «2066olt…» when the last index was odd and the even one before it stayed).
  const keepNarrow = (index: number) =>
    index === 0 || index === last || bars[index].outlined || (index % 2 === 0 && index !== last - 1);

  return (
    <div className={cn('@container flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight }} {...(hover.enabled ? hover.handlers : {})}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`${ariaLabel} ${label}.`}>
          <line x1={0} y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {hover.index !== null && <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />}
          {bars.map((bar, i) => {
            const height = heightOf(bar.count);
            return (
              <g key={bar.key}>
                <title>{`${bar.caption}: ${bar.figures}`}</title>
                <rect
                  x={i * slot + (slot - barWidth) / 2}
                  y={VIEW_H - height}
                  width={barWidth}
                  height={height}
                  fill={bar.neutral ? 'var(--muted-foreground)' : 'var(--chart-1)'}
                  stroke={bar.outlined ? 'var(--foreground)' : 'none'}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / bars.length} label={hovered.caption}>
            <span className="font-mono text-[13px] font-semibold tabular-nums text-foreground">{hovered.count.toLocaleString('it-IT')}</span>
            <span className="text-muted-foreground">{hovered.hoverDetail}</span>
          </ChartHoverTip>
        )}
      </div>
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {bars.map((bar, index) => (
          <span
            key={bar.key}
            className={cn(
              // No clipping: a five-character label («oltre», «1,3M») is wider than a phone's
              // 26px cell, and once its neighbours step aside it may spill into their room.
              'whitespace-nowrap text-center font-mono text-[10px] tabular-nums',
              bar.outlined ? 'font-semibold text-foreground' : 'text-muted-foreground',
              crowded && !keepNarrow(index) && 'invisible @[400px]:visible',
            )}
          >
            {bar.axisLabel}
          </span>
        ))}
      </div>
    </div>
  );
}
