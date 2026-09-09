'use client';

import type { CenterMonthStack } from '@/lib/utils/costCenterSummary';
import { resolveCostCenterColor } from '@/lib/utils/costCenterColors';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

interface CenterStackBarsProps {
  stack: CenterMonthStack;
  /** `useChartColors()`'s palette — a center's slot is resolved against it at render time. */
  palette: string[];
  /** Minimum height of the plot; the tile's flex column lets it stretch past it. */
  minHeight?: number;
  /** The swatch legend under the axis; off when the stack has one series (the detail's bars). */
  legend?: boolean;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 150;
const BAR_SHARE = 0.68;

/**
 * The trailing months stacked by center — the element that stretches when the Totale tile
 * spans two rows. Hand-written SVG, the In-tile Bars pattern: one band per center in the
 * center's own slot (`resolveCostCenterColor`, so the list's swatch, the band and the legend
 * are one colour), the running month at reduced fill AND outlined (real data, not comparable
 * with the closed months), the axis labels outside the SVG so they never stretch with it. It
 * replaced the Recharts line chart of the old «Confronta l'andamento» disclosure, and with a
 * one-center stack it is also the detail's bars — one implementation of the same quantity.
 */
export function CenterStackBars({ stack, palette, minHeight = 120, legend = true, className }: CenterStackBarsProps) {
  const { months, centers } = stack;
  const max = Math.max(...months.map((month) => month.total), 1) * 1.08;
  const slot = VIEW_W / months.length;
  const barWidth = slot * BAR_SHARE;
  const colorOf = new Map(centers.map((center) => [center.id, resolveCostCenterColor(center.color, center.id, palette)]));

  const description = months.map((month) => `${month.label}: ${cachedFormatCurrencyEUR(month.total, true)}`).join('; ');
  const names = centers.map((center) => center.name).join(', ');

  const hover = useChartHover(months.length, 'slot');
  const hovered = hover.index !== null ? months[hover.index] : null;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight }} {...(hover.enabled ? hover.handlers : {})}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Spese mensili per centro (${names}). ${description}`}
        >
          <line x1={0} y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {hover.index !== null && <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />}
          {months.map((month, i) => {
            const x = i * slot + (slot - barWidth) / 2;
            let top = VIEW_H;
            const bands = centers.map((center) => {
              const value = month.byCenter[center.id] ?? 0;
              const height = (value / max) * VIEW_H;
              top -= height;
              return { id: center.id, y: top, height, fill: colorOf.get(center.id) };
            });
            const detail = centers
              .filter((center) => (month.byCenter[center.id] ?? 0) > 0)
              .map((center) => `${center.name} ${cachedFormatCurrencyEUR(month.byCenter[center.id], true)}`)
              .join(', ');
            return (
              <g key={month.key}>
                <title>{`${month.label}: ${cachedFormatCurrencyEUR(month.total, true)}${detail ? ` (${detail})` : ''}${month.ongoing ? ' · mese in corso' : ''}`}</title>
                {bands.map(
                  (band) =>
                    band.height > 0 && (
                      <rect key={band.id} x={x} y={band.y} width={barWidth} height={band.height} fill={band.fill} fillOpacity={month.ongoing ? 0.55 : 1} />
                    ),
                )}
                {month.ongoing && month.total > 0 && (
                  <rect x={x} y={top} width={barWidth} height={VIEW_H - top} fill="none" stroke="var(--foreground)" vectorEffect="non-scaling-stroke" />
                )}
              </g>
            );
          })}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / months.length} label={`${hovered.label}${hovered.ongoing ? ' · in corso' : ''}`}>
            <span className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(hovered.total, true)}</span>
            {centers
              .filter((center) => (hovered.byCenter[center.id] ?? 0) > 0)
              .map((center) => (
                <span key={center.id} className="flex items-center gap-1.5 font-mono tabular-nums text-muted-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: colorOf.get(center.id) }} aria-hidden="true" />
                  {center.name} {cachedFormatCurrencyEUR(hovered.byCenter[center.id], true)}
                </span>
              ))}
          </ChartHoverTip>
        )}
      </div>
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {months.map((month) => (
          <span
            key={month.key}
            className={cn('text-center font-mono text-[10px] tabular-nums', month.ongoing ? 'font-semibold text-foreground' : 'text-muted-foreground')}
          >
            {month.label}
          </span>
        ))}
      </div>
      {legend && centers.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5" aria-hidden="true">
          {centers.map((center) => (
            <span key={center.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: colorOf.get(center.id) }} />
              {center.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
