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
  if (projectionData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Nessun dato di proiezione disponibile.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={projectionData} margin={{ left: marginLeft, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="calendarYear" />
        <YAxis width={marginLeft <= 20 ? 70 : 100} tickFormatter={(value) => formatCurrencyCompact(value)} />
        <Tooltip
          formatter={(value: number, name: string) => [formatCurrency(value), name]}
          labelFormatter={(label, payload) => {
            const age = payload?.[0]?.payload?.age;
            return age ? `Anno ${label} · Età ${age}` : `Anno ${label}`;
          }}
          labelStyle={{ color: '#000' }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="bearPortfolioValue"
          stroke="#EF4444"
          strokeWidth={2}
          name="Patrimonio Orso"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="basePortfolioValue"
          stroke="#6366F1"
          strokeWidth={2}
          name="Patrimonio Base"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="bullPortfolioValue"
          stroke="#10B981"
          strokeWidth={2}
          name="Patrimonio Toro"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="fireNumberTarget"
          stroke="#F59E0B"
          strokeWidth={2}
          strokeDasharray="8 4"
          name="Capitale richiesto a pensione"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
