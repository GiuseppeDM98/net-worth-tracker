'use client';

/**
 * CoastFireProjectionChart visualises how the current patrimonio would evolve
 * without new retirement contributions under the three Coast FIRE scenarios.
 *
 * The target line stays flat because Coast FIRE uses a real-return model:
 * inflation is already netted out of each scenario, so the retirement FIRE
 * number is expressed in today's money throughout the chart.
 */

import { CoastFIREProjectionPoint } from '@/lib/services/fireService';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface CoastFireProjectionChartProps {
  projectionData: CoastFIREProjectionPoint[];
  height?: number;
  marginLeft?: number;
}

export function CoastFireProjectionChart({
  projectionData,
  height = 340,
  marginLeft = 50,
}: CoastFireProjectionChartProps) {
  const chartColors = useChartColors();

  if (projectionData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Nessun dato di proiezione disponibile.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={projectionData} margin={{ left: marginLeft, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
        <XAxis dataKey="calendarYear" />
        <YAxis width={marginLeft <= 20 ? 70 : 100} tickFormatter={(value) => formatCurrencyCompact(value)} />
        <Tooltip
          formatter={(value, name) => [formatCurrency(value as number), name]}
          labelFormatter={(label, payload) => {
            const age = payload?.[0]?.payload?.age;
            return age ? `Anno ${label} · Età ${age}` : `Anno ${label}`;
          }}
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--card-foreground)',
          }}
          labelStyle={{ fontWeight: 600, color: 'var(--card-foreground)' }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="bearPortfolioValue"
          stroke={chartColors[4]}
          strokeWidth={2}
          name="Patrimonio Orso"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="basePortfolioValue"
          stroke={chartColors[0]}
          strokeWidth={2}
          name="Patrimonio Base"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="bullPortfolioValue"
          stroke={chartColors[1]}
          strokeWidth={2}
          name="Patrimonio Toro"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        {/* Target line is a static reference — no animation needed */}
        <Line
          type="monotone"
          dataKey="fireNumberTarget"
          stroke={chartColors[2]}
          strokeWidth={2}
          strokeDasharray="8 4"
          name="Capitale richiesto a pensione"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
