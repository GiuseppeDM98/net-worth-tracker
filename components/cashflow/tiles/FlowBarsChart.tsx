'use client';

import type { MonthFlow } from '@/lib/utils/tracciamentoSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

interface FlowBarsChartProps {
  flows: MonthFlow[];
  /** The month the page is about — drawn at full strength, the others recede. */
  highlightKey: string | null;
  /** Minimum height of the plot; the tile's flex column lets it stretch past it. */
  minHeight?: number;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 180;
/** Share of a month's slot taken by each of its two bars, and the gap between them. */
const BAR_SHARE = 0.3;
const BAR_GAP_SHARE = 0.06;

/**
 * Income beside spending, one pair of bars per month, in the two chart slots the category
 * tiles use (jade income, indigo spending) so the same colour means the same thing across
 * the page. Hand-written SVG, no Recharts: the chart stretches to the tile's free height
 * (`absolute inset-0` + `preserveAspectRatio="none"`, the Panoramica's sparkline technique)
 * and the labels live outside the SVG so they never stretch with it.
 */
export function FlowBarsChart({ flows, highlightKey, minHeight = 150, className }: FlowBarsChartProps) {
  const max = Math.max(...flows.map((f) => Math.max(f.income, f.expenses)), 1);
  const slot = VIEW_W / flows.length;
  const barWidth = slot * BAR_SHARE;
  const gap = slot * BAR_GAP_SHARE;
  const pairWidth = barWidth * 2 + gap;

  const label = flows
    .map((f) => `${f.label}: entrate ${cachedFormatCurrencyEUR(f.income, true)}, spese ${cachedFormatCurrencyEUR(f.expenses, true)}${f.scheduled ? ' (in calendario)' : ''}`)
    .join('; ');

  // A mouse over a month reads its two figures (desktop only; the SVG titles serve the rest).
  const hover = useChartHover(flows.length, 'slot');
  const hovered = hover.index !== null ? flows[hover.index] : null;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight }} {...(hover.enabled ? hover.handlers : {})}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Entrate e spese per mese. ${label}`}
        >
          <line x1={0} y1={VIEW_H - 0.5} x2={VIEW_W} y2={VIEW_H - 0.5} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {hover.index !== null && (
            <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />
          )}
          {flows.map((flow, i) => {
            const x = i * slot + (slot - pairWidth) / 2;
            const incomeHeight = (flow.income / max) * (VIEW_H - 8);
            const expensesHeight = (flow.expenses / max) * (VIEW_H - 8);
            // The month the page is about is outlined, never the others dimmed: a dimmed slot
            // falls under the 3:1 floor for graphical objects on the light card.
            const stroke = flow.key === highlightKey ? 'var(--foreground)' : 'none';
            // A month that has not started holds only what is already in the calendar: drawn
            // lighter, so a recurring-only bar is never read as a month that was lived.
            const opacity = flow.scheduled ? 0.45 : 1;
            return (
              <g key={flow.key}>
                <title>{`${flow.label}: entrate ${cachedFormatCurrencyEUR(flow.income, true)}, spese ${cachedFormatCurrencyEUR(flow.expenses, true)}${flow.scheduled ? ' (in calendario)' : ''}`}</title>
                <rect x={x} y={VIEW_H - incomeHeight} width={barWidth} height={incomeHeight} fill="var(--chart-2)" fillOpacity={opacity} stroke={stroke} vectorEffect="non-scaling-stroke" />
                <rect x={x + barWidth + gap} y={VIEW_H - expensesHeight} width={barWidth} height={expensesHeight} fill="var(--chart-1)" fillOpacity={opacity} stroke={stroke} vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / flows.length} label={`${hovered.label} ${hovered.year}${hovered.scheduled ? ' · in calendario' : ''}`}>
            <span className="font-mono tabular-nums">
              <span className="text-muted-foreground">Entrate </span>
              <span className="text-positive">{cachedFormatCurrencyEUR(hovered.income, true)}</span>
            </span>
            <span className="font-mono tabular-nums">
              <span className="text-muted-foreground">Spese </span>
              <span className="text-destructive">{cachedFormatCurrencyEUR(hovered.expenses, true)}</span>
            </span>
          </ChartHoverTip>
        )}
      </div>
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${flows.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {flows.map((flow) => (
          <span
            key={flow.key}
            className={cn(
              'text-center font-mono text-[10px] tabular-nums',
              flow.key === highlightKey ? 'font-semibold text-foreground' : 'text-muted-foreground',
              flow.scheduled && 'opacity-60',
            )}
          >
            {flow.label}
          </span>
        ))}
      </div>
    </div>
  );
}
