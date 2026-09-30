'use client';

/**
 * The three plots of Analisi's «Andamento nel tempo» (history mode, inside the «Dettaglio»
 * disclosure): the flows, the categories and the spending types over time. A module of their own so
 * the disclosure, closed by default, loads them — and recharts with them — only when it is opened
 * (2026-09-30). Each draws at the height the section reserves for it.
 */

import { ComposedChart, LineChart, Line, Area, AreaChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from '@/components/ui/charts/recharts';
import { formatCurrency, formatCurrencyCompact, formatPercentage } from '@/lib/services/chartService';
import type { buildCategoryTimeSeries, buildTimeBuckets, buildTypeTimeSeries } from '@/lib/utils/cashflowTimeSeries';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

// ── Shared tooltip style ──────────────────────────────────────────────────────
// Defined once (mirrors ConfrontoAnnualeCharts) so all sub-charts stay consistent.
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const TOOLTIP_LABEL_STYLE = { fontWeight: 600, color: 'var(--card-foreground)' } as const;

// ── FlowComposedChart ─────────────────────────────────────────────────────────
// Chart A: income/expense bars + net-savings line. Module-level (React Compiler).

export function FlowComposedChart({
  data,
  colors,
  height,
}: {
  data: ReturnType<typeof buildTimeBuckets>;
  colors: string[];
  height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={CHART_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={CHART_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          // Keep the 0 baseline for the bars but extend below it when net savings
          // go negative (deficit period) so the risparmio line isn't clipped.
          domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(Number(value ?? 0)),
            name === 'income' ? 'Entrate' : name === 'expenses' ? 'Uscite' : 'Risparmio',
          ]}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Legend
          formatter={(value) =>
            value === 'income' ? 'Entrate' : value === 'expenses' ? 'Uscite' : 'Risparmio'
          }
          wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
        />
        {/* The page's slots: income is chart-2, spending chart-1 — the same two the category tiles use. */}
        <Bar dataKey="income" fill={colors[1] ?? 'var(--chart-2)'} radius={[3, 3, 0, 0]} animationDuration={600} animationEasing="ease-out" />
        <Bar dataKey="expenses" fill={colors[0] ?? 'var(--chart-1)'} radius={[3, 3, 0, 0]} animationDuration={600} animationEasing="ease-out" />
        <Line
          type="monotone"
          dataKey="net"
          stroke={colors[2] ?? '#10b981'}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── CategoryLinesChart ────────────────────────────────────────────────────────
// Chart B: one line per category over time. Module-level (React Compiler).

export function CategoryLinesChart({
  series,
  rows,
  colors,
  height,
}: {
  series: ReturnType<typeof buildCategoryTimeSeries>['series'];
  // Recharts wants row objects keyed by series name; we pivot in the parent.
  rows: Array<Record<string, string | number>>;
  colors: string[];
  height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={CHART_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={CHART_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
        />
        <Tooltip
          formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name)]}
          // Order tooltip rows by value (desc) so they mirror the vertical stacking
          // of the lines at the hovered point, instead of the fixed series order.
          itemSorter={(item) => -(item.value as number)}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        {series.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={colors[i % colors.length] ?? '#6366f1'}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── TypeCompositionChart ──────────────────────────────────────────────────────
// 100%-stacked area: the spending mix (Fisse/Variabili/Debiti) as a share of total
// per bucket, so diversification reads independently of the absolute spend level.
// Module-level (React Compiler).

export function TypeCompositionChart({
  series,
  rows,
  colors,
  height,
}: {
  series: ReturnType<typeof buildTypeTimeSeries>['series'];
  // Rows are pre-normalised to percentages (0-100) per bucket in the parent.
  rows: Array<Record<string, string | number>>;
  colors: string[];
  height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={CHART_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => formatPercentage(v, 0)}
          tick={CHART_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
        />
        <Tooltip
          formatter={(value, name) => [formatPercentage(Number(value ?? 0), 1), String(name)]}
          itemSorter={(item) => -(item.value as number)}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        {series.map((s, i) => (
          <Area
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stackId="type-composition"
            stroke={colors[i % colors.length] ?? '#6366f1'}
            fill={colors[i % colors.length] ?? '#6366f1'}
            fillOpacity={0.7}
            strokeWidth={1.5}
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
