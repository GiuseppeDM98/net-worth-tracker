'use client';

/**
 * Month-by-month labor income, savings from work and the market — the time series under the
 * «Lavoro e investimenti» rows of Storico's Dettaglio. Recharts, at the house rules:
 * `CHART_TICK_STYLE` on both axes, the three tooltip styles, `role="img"` with a label that says
 * what is drawn.
 *
 * The colours are the PAGE's, not the chart's own order: «Mercato» is `--chart-1` and the savings
 * `--chart-2` on every Storico surface (the Driver's bars and ledger, the monthly tile). Until
 * 2026-09-20 this chart painted the market in `--chart-5` and gave `--chart-1` to the labor
 * income, so one word had two colours on one page. The labor income is the reference the other
 * two are read against, not a part of the growth: it takes the neutral ink.
 *
 * The legend is `SeriesLegend`, not Recharts' `<Legend>`: that one prints each label in its series
 * colour (3,64 · 4,02 · 2,62:1 as 11px text, measured) and names its icons in English.
 */

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { prepareMonthlyLaborMetricsData } from '@/lib/services/chartService';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { SeriesLegend } from '@/components/ui/series-legend';

type LaborChartRow = ReturnType<typeof prepareMonthlyLaborMetricsData>[number];

interface LaborMetricsChartProps {
  data: LaborChartRow[];
  isMobile: boolean;
}

const TOOLTIP_CONTENT_STYLE = { backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--card-foreground)', fontSize: 12 } as const;
const TOOLTIP_LABEL_STYLE = { color: 'var(--card-foreground)', fontWeight: 600 } as const;
const TOOLTIP_ITEM_STYLE = { color: 'var(--card-foreground)' } as const;
const LABOR_INCOME_COLOR = 'var(--foreground)';

/** «gen 25» — the tick of every monthly axis on Storico, lower case like the Driver's. */
const shortPeriod = (row: Pick<LaborChartRow, 'month' | 'year'>) => `${MONTH_NAMES_SHORT[row.month - 1].toLowerCase()} ${String(row.year).slice(2)}`;

export default function LaborMetricsChart({ data, isMobile }: LaborMetricsChartProps) {
  const chartColors = useChartColors();
  if (data.length === 0) return null;
  const rows = data.map((row) => ({ ...row, tick: shortPeriod(row) }));
  const marketColor = chartColors[0] ?? 'var(--chart-1)';
  const savingsColor = chartColors[1] ?? 'var(--chart-2)';

  return (
    <div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={rows}
            // `right` reserves room for the last tick, centred on the plot's edge («set 26» lost its last digit).
            margin={{ top: 4, right: 28, left: 0, bottom: 0 }}
            role="img"
            aria-label={`Guadagnato da lavoro, risparmiato da lavoro e mercato, mese per mese da ${data[0].period} a ${data[data.length - 1].period}. I totali sono nelle righe qui sopra.`}
            accessibilityLayer={false}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="tick" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={isMobile ? 40 : 24} />
            <YAxis tickFormatter={(v: number) => formatCurrencyCompact(v)} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={52} />
            <Tooltip
              formatter={(value) => (typeof value === 'number' ? formatCurrency(value) : '—')}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.period ?? ''}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              cursor={{ stroke: 'var(--foreground)', strokeOpacity: 0.25, strokeWidth: 1 }}
            />
            <Line type="monotone" dataKey="laborIncome" stroke={LABOR_INCOME_COLOR} strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 3" name="Guadagnato da lavoro" dot={false} animationDuration={600} animationEasing="ease-out" />
            <Line type="monotone" dataKey="savedFromWork" stroke={savingsColor} strokeWidth={2} name="Risparmiato da lavoro" dot={false} animationDuration={600} animationEasing="ease-out" />
            {/* «Mercato», the same word and the same colour as the row above it and the Driver's bars. */}
            <Line type="monotone" dataKey="investmentGrowth" stroke={marketColor} strokeWidth={2} name="Mercato" dot={false} animationDuration={600} animationEasing="ease-out" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SeriesLegend
        className="mt-2"
        items={[
          { label: 'Guadagnato da lavoro (tratteggiata)', colors: ['var(--muted-foreground)'] },
          { label: 'Risparmiato da lavoro', colors: [savingsColor] },
          { label: 'Mercato', colors: [marketColor] },
        ]}
      />
    </div>
  );
}
