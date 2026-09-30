'use client';

/**
 * The plot of a rolling tile of Rendimenti's «Dettaglio» (CAGR and Sharpe at 12 months, each with
 * its 3-month moving average). A module of its own so the Dettaglio can load it — and recharts
 * with it — only once the disclosure is opened (2026-09-30): the page's own tiles are
 * hand-written SVG, and these two plots and the underwater chart were the only reason recharts sat
 * in Rendimenti's initial JavaScript. The tile, its reading and its legend stay in
 * `PerformanceDettaglio`; this draws inside the 220px box the tile reserves.
 */

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from '@/components/ui/charts/recharts';
import type { RollingPeriodPerformance } from '@/types/performance';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

export type RollingCagrPoint = RollingPeriodPerformance & { cagrMA: number | null };
export type RollingSharpePoint = RollingPeriodPerformance & { sharpeRatioMA: number | null };

const TOOLTIP_CONTENT_STYLE = { backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--card-foreground)', fontSize: 12 } as const;
const TOOLTIP_LABEL_STYLE = { color: 'var(--card-foreground)', fontWeight: 600 } as const;
const TOOLTIP_ITEM_STYLE = { color: 'var(--card-foreground)' } as const;

const shortDate = (date: Date | string) => new Date(date).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });

export interface RollingLineChartProps {
  data: Array<RollingCagrPoint | RollingSharpePoint>;
  primaryKey: 'cagr' | 'sharpeRatio';
  averageKey: 'cagrMA' | 'sharpeRatioMA';
  primaryName: string;
  formatValue: (value: number) => string;
  primaryColor: string;
  averageColor: string;
  ariaLabel: string;
  /** The box the tile reserves for the plot, placeholder included. */
  height: number;
}

export function RollingLineChart({ data, primaryKey, averageKey, primaryName, formatValue, primaryColor, averageColor, ariaLabel, height }: RollingLineChartProps) {
  return (
    // A numeric height: with "100%" the first render measures -1 x -1 and Recharts warns twice per chart.
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }} role="img" aria-label={ariaLabel} accessibilityLayer={false}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="periodEndDate" tickFormatter={shortDate} tick={CHART_TICK_STYLE} stroke="var(--border)" interval="preserveStartEnd" />
        <YAxis tickFormatter={(v: number) => formatValue(v)} tick={CHART_TICK_STYLE} stroke="var(--border)" width={56} />
        <Tooltip
          formatter={(value) => (typeof value === 'number' && Number.isFinite(value) ? formatValue(value) : '—')}
          labelFormatter={(date) => new Date(date as string).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
        />
        <Line type="monotone" dataKey={primaryKey} stroke={primaryColor} strokeWidth={2} name={primaryName} dot={false} animationDuration={800} animationEasing="ease-out" />
        <Line type="monotone" dataKey={averageKey} stroke={averageColor} strokeWidth={1.5} name="Media mobile 3M" strokeDasharray="6 4" dot={false} animationDuration={800} animationEasing="ease-out" />
      </LineChart>
    </ResponsiveContainer>
  );
}
