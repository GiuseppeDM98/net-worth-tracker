'use client';

/**
 * Month-by-month labor income, savings from work and gross investment growth — the time series
 * under the «Lavoro e investimenti» rows of Storico's Dettaglio. Recharts, at the house rules:
 * `CHART_TICK_STYLE` on both axes, the three tooltip styles, `role="img"` with a label that
 * carries the colour→series mapping (the legend is hidden from assistive tech by that role).
 */

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { prepareMonthlyLaborMetricsData } from '@/lib/services/chartService';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

interface LaborMetricsChartProps {
  data: ReturnType<typeof prepareMonthlyLaborMetricsData>;
  isMobile: boolean;
}

const TOOLTIP_CONTENT_STYLE = { backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--card-foreground)', fontSize: 12 } as const;
const TOOLTIP_LABEL_STYLE = { color: 'var(--card-foreground)', fontWeight: 600 } as const;
const TOOLTIP_ITEM_STYLE = { color: 'var(--card-foreground)' } as const;
const LEGEND_STYLE = { fontSize: 11, color: 'var(--muted-foreground)', paddingTop: 8 } as const;

export default function LaborMetricsChart({ data, isMobile }: LaborMetricsChartProps) {
  const chartColors = useChartColors();
  if (data.length === 0) return null;
  const first = data[0].period;
  const last = data[data.length - 1].period;

  return (
    <div className="h-[220px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
          role="img"
          aria-label={`Guadagnato da lavoro, risparmiato da lavoro e mercato per mese, da ${first} a ${last}: la prima serie è il primo colore del tema, la seconda il secondo, la terza il quinto.`}
          accessibilityLayer={false}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="period" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={isMobile ? 40 : 24} />
          <YAxis tickFormatter={(v: number) => formatCurrencyCompact(v)} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={52} />
          <Tooltip
            formatter={(value) => (typeof value === 'number' ? formatCurrency(value) : '—')}
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            cursor={{ stroke: 'var(--foreground)', strokeOpacity: 0.25, strokeWidth: 1 }}
          />
          <Legend wrapperStyle={LEGEND_STYLE} iconType="square" iconSize={8} />
          <Line type="monotone" dataKey="laborIncome" stroke={chartColors[0] ?? 'var(--chart-1)'} strokeWidth={2} name="Guadagnato da lavoro" dot={false} animationDuration={600} animationEasing="ease-out" />
          <Line type="monotone" dataKey="savedFromWork" stroke={chartColors[1] ?? 'var(--chart-2)'} strokeWidth={2} name="Risparmiato da lavoro" dot={false} animationDuration={600} animationEasing="ease-out" />
          {/* «Mercato», the same word as the row above it (the series is the month's gross market share). */}
          <Line type="monotone" dataKey="investmentGrowth" stroke={chartColors[4] ?? 'var(--chart-5)'} strokeWidth={2} name="Mercato" dot={false} animationDuration={600} animationEasing="ease-out" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
