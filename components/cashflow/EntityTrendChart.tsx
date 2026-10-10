'use client';

/**
 * The «Trend mensile · ultimi 24 mesi» plot of Analisi's Scheda (`EntityDossier`): the entity's
 * monthly total as bars, the same month of the year before as a dashed line. A module of its own
 * so recharts reaches Analisi only when a Scheda is opened (2026-09-30) — with the three
 * disclosures' plots lazy too, nothing else on the page draws with recharts.
 */

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from '@/components/ui/charts/recharts';
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

/** Whole euros, like every aggregate on the page. */
const formatCurrency = (value: number): string => cachedFormatCurrencyEUR(value, true);

export interface EntityTrendChartProps {
  data: Array<{ label: string; value: number; prevYearValue: number | null }>;
  /** «Entrate» or «Spesa». */
  seriesName: string;
  color: string;
  height: number;
}

export function EntityTrendChart({ data, seriesName, color, height }: EntityTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart
        data={data}
        margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
        role="img"
        accessibilityLayer={false}
        aria-label={`${seriesName} per mese, ultimi 24 mesi. ${data.map((point) => `${point.label}: ${formatCurrency(point.value)}${point.prevYearValue !== null ? `, anno precedente ${formatCurrency(point.prevYearValue)}` : ''}`).join('; ')}`}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        {/* «150 €», the page's own format — not «€150» with the symbol in front. */}
        <YAxis tickFormatter={(value: number) => formatCurrency(value)} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={56} />
        <Tooltip
          // A null baseline (pre-floor month) is a gap, not a zero — the tooltip must
          // not resurrect the fabricated 0 the series refused.
          formatter={(value) => (value == null ? '—' : formatCurrency(Number(value)))}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Bar dataKey="value" name={seriesName} fill={color} animationDuration={600} animationEasing="ease-out" radius={[2, 2, 0, 0]} />
        {/* connectNulls stays false: pre-floor baseline months render as a gap. */}
        <Line dataKey="prevYearValue" name="Anno precedente" stroke="var(--muted-foreground)" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
