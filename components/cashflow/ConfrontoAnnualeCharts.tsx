'use client';

/**
 * The two plots of Analisi's «Confronto annuale»: the monthly bars of a year against its baseline
 * and the multi-year totals of the history. A module of their own so the disclosure — closed by
 * default — loads them, and recharts with them, only when it is opened (2026-09-30).
 * The section keeps the tile, the reading and the delta ranking; these draw inside the box the
 * section reserves at the heights exported below.
 */

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from '@/components/ui/charts/recharts';
import { formatCurrency as formatCurrencyWithCents, formatCurrencyCompact } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

// ── Shared chart styles (module-level, as-const — see doc/guide/grafici.md § Recharts) ──

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const TOOLTIP_LABEL_STYLE = {
  fontWeight: 600,
  color: 'var(--card-foreground)',
} as const;

const TOOLTIP_ITEM_STYLE = {
  color: 'var(--card-foreground)',
} as const;

/** Whole euros, like every aggregate on the page; the tooltips keep the cents of a plotted sum. */
const formatCurrency = (value: number): string => cachedFormatCurrencyEUR(value, true);

// ── MensileBarChart ───────────────────────────────────────────────────────────

/** Side-by-side monthly bars for the YoY comparison. colors[0] = current year; the comparison year is the neutral baseline. */
export function MensileBarChart({
  data,
  currentYear,
  comparisonYear,
  colors,
  height,
}: {
  data: Array<{ month: string; current: number; comparison: number }>;
  currentYear: number;
  comparisonYear: number;
  colors: string[];
  height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
        barCategoryGap="20%"
        barGap={2}
        role="img"
        accessibilityLayer={false}
        aria-label={`Spese per mese, ${currentYear} contro ${comparisonYear}. ${data.map((d) => `${d.month}: ${formatCurrency(d.current)} contro ${formatCurrency(d.comparison)}`).join('; ')}`}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCurrencyCompact} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value, name) => [formatCurrencyWithCents(Number(value ?? 0)), name === 'current' ? currentYear.toString() : comparisonYear.toString()]}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Legend formatter={(value) => (value === 'current' ? currentYear.toString() : comparisonYear.toString())} wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        <Bar dataKey="current" fill={colors[0]} animationDuration={600} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
        {/* The baseline year is a neutral, as on the Periodo tile — never a series colour. */}
        <Bar dataKey="comparison" fill="var(--muted-foreground)" animationDuration={600} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── HistoryBarChart ───────────────────────────────────────────────────────────

/** Multi-year annual totals for the history — one bar per year. */
export function HistoryBarChart({ data, colors, height }: { data: Array<{ year: string; spese: number }>; colors: string[]; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
        role="img"
        accessibilityLayer={false}
        aria-label={`Spese per anno. ${data.map((d) => `${d.year}: ${formatCurrency(d.spese)}`).join('; ')}`}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="year" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCurrencyCompact} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value) => [formatCurrencyWithCents(Number(value ?? 0)), 'Spese']}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Bar dataKey="spese" fill={colors[0]} animationDuration={600} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
