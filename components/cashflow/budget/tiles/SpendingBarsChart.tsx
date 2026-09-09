'use client';

import type { SpendingHistoryMonth } from '@/lib/utils/budgetSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

interface SpendingBarsChartProps {
  /** Each month carries the ceiling it reads against (its own when recorded, today's otherwise). */
  months: SpendingHistoryMonth[];
  /** Minimum height of the plot; the tile's flex column lets it stretch past it. */
  minHeight?: number;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 150;
const BAR_SHARE = 0.68;

/**
 * Total spending per month against today's ceiling — the element that stretches when the
 * Tetto tile spans two rows. Hand-written SVG, the In-tile Bars pattern: spending in the
 * slot the category tiles use for it (`--chart-1`), the ceiling as a dashed `--foreground`
 * line with no label (the caption beside the sub-eyebrow says what it is), the running
 * month at reduced fill AND outlined (real data, not comparable with the closed months),
 * the axis labels outside the SVG so they never stretch with it.
 */
export function SpendingBarsChart({ months, minHeight = 110, className }: SpendingBarsChartProps) {
  const max = Math.max(...months.map((m) => Math.max(m.total, m.ceiling ?? 0)), 1) * 1.08;
  const slot = VIEW_W / months.length;
  const barWidth = slot * BAR_SHARE;
  const hasCeiling = months.some((m) => m.ceiling !== null);

  const description = months
    .map((m) => `${m.label}: ${cachedFormatCurrencyEUR(m.total, true)}${m.ceiling !== null ? ` su un tetto di ${cachedFormatCurrencyEUR(m.ceiling, true)}` : ''}`)
    .join('; ');

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
          aria-label={`Spese totali per mese${hasCeiling ? ' contro il tetto di ciascuno' : ''}. ${description}`}
        >
          <line x1={0} y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {hover.index !== null && (
            <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />
          )}
          {months.map((month, i) => {
            const x = i * slot + (slot - barWidth) / 2;
            const height = (month.total / max) * VIEW_H;
            return (
              <g key={month.key}>
                <title>{`${month.label}: ${cachedFormatCurrencyEUR(month.total, true)}${month.ceiling !== null ? ` su ${cachedFormatCurrencyEUR(month.ceiling, true)}${month.ceilingSource === 'recorded' ? '' : ' (tetto attuale)'}` : ''}${month.ongoing ? ' (mese in corso)' : ''}`}</title>
                <rect
                  x={x}
                  y={VIEW_H - height}
                  width={barWidth}
                  height={height}
                  fill="var(--chart-1)"
                  fillOpacity={month.ongoing ? 0.55 : 1}
                  stroke={month.ongoing ? 'var(--foreground)' : 'none'}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
          {/* One dashed segment per month at ITS ceiling: a step where the ceiling changed, a
              straight line while it did not. A month without one has no segment. */}
          {months.map((month, i) =>
            month.ceiling === null ? null : (
              <line
                key={`ceiling-${month.key}`}
                x1={i * slot}
                y1={VIEW_H - (month.ceiling / max) * VIEW_H}
                x2={(i + 1) * slot}
                y2={VIEW_H - (month.ceiling / max) * VIEW_H}
                stroke="var(--foreground)"
                strokeOpacity={0.6}
                strokeDasharray="4 4"
                vectorEffect="non-scaling-stroke"
              />
            ),
          )}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / months.length} label={`${hovered.label}${hovered.ongoing ? ' · in corso' : ''}`}>
            <span className="font-mono tabular-nums">
              <span className="text-muted-foreground">Spese </span>
              <span className={hovered.ceiling !== null && hovered.total > hovered.ceiling ? 'text-destructive' : 'text-foreground'}>
                {cachedFormatCurrencyEUR(hovered.total, true)}
              </span>
            </span>
            {hovered.ceiling !== null && (
              <span className="font-mono tabular-nums text-muted-foreground">
                Tetto {cachedFormatCurrencyEUR(hovered.ceiling, true)}
                {hovered.ceilingSource === 'current' && !hovered.ongoing ? ' (attuale)' : ''}
              </span>
            )}
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
    </div>
  );
}
