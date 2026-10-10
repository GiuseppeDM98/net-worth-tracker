'use client';

/**
 * The plot of Analisi's «Andamento risparmio» (inside the «Dettaglio» disclosure): the monthly
 * savings rate against the 20% target. A module of its own so the disclosure, closed by default,
 * loads it — and recharts with it — only when it is opened (2026-09-30).
 *
 * connectNulls={false} creates visible gaps for months without income — this correctly represents
 * "no data" rather than "zero savings". YAxis domain={['auto', 'auto']} scales to the actual data
 * range to prevent the flat-line problem (doc/guide/grafici.md § Recharts).
 */

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from '@/components/ui/charts/recharts';
import { formatPercentage } from '@/lib/services/chartService';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

// 20% is the commonly cited minimum savings target for Italian households.
// Above this line = "on track"; below = "needs attention" (red zone).
const SAVINGS_TARGET = 20;

export function SavingsRateLineChart({
  data,
  colors,
  height,
}: {
  data: Array<{ label: string; rate: number | null }>;
  colors: string[];
  height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 4, right: 16, left: -16, bottom: 0 }}
        role="img"
        accessibilityLayer={false}
        aria-label={`Tasso di risparmio per mese, obiettivo ${SAVINGS_TARGET}%. ${data.map((point) => `${point.label}: ${point.rate === null ? 'nessuna entrata' : formatPercentage(point.rate, 1)}`).join('; ')}`}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

        {/* Axis ticks are figures: the Mono Mandate reaches them only through `tick` (doc/guide/grafici.md § Recharts). */}
        <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis
          // Intl prints a hyphen; the page's minus is U+2212 everywhere else.
          tickFormatter={(v: number) => formatPercentage(v, 0).replace(/^-/, '−')}
          tick={CHART_TICK_STYLE}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
        />

        {/* CSS vars for tooltip — never hardcoded hex (doc/guide/grafici.md § Recharts — tooltip style props) */}
        <Tooltip
          formatter={(value) =>
            value != null ? [formatPercentage(Number(value), 1), 'Tasso di risparmio'] : ['—', '']
          }
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--card-foreground)',
            fontSize: 12,
            borderRadius: 8,
          }}
          labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
        />

        {/* Red tint below target — signals "needs improvement" zone */}
        <ReferenceArea y1={-100} y2={SAVINGS_TARGET} fill="var(--destructive)" fillOpacity={0.06} />

        {/* Dashed green reference line at 20% target */}
        <ReferenceLine
          y={SAVINGS_TARGET}
          stroke="var(--positive)"
          strokeDasharray="4 4"
          strokeWidth={1.5}
          label={{
            value: `${SAVINGS_TARGET}% obiettivo`,
            position: 'insideTopRight',
            fontSize: 10,
            fill: 'var(--positive)',
          }}
        />

        <Line
          type="monotone"
          dataKey="rate"
          stroke={colors[0] ?? '#6366f1'}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, strokeWidth: 0 }}
          // Gap at months with null income rather than connecting to zero
          connectNulls={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
