'use client';

/**
 * FIREProjectionChart Component
 *
 * Recharts line chart showing projected net worth under 3 market scenarios
 * (Bear/Base/Bull) plus a dashed FIRE Number reference line.
 *
 * Design: Uses the same Recharts pattern as FireCalculatorTab's historical chart.
 * The FIRE Number line uses base scenario inflation to show a single reference.
 *
 * Color coding follows semantic meaning:
 *   - Bear (red): pessimistic outcome
 *   - Base (indigo): expected outcome
 *   - Bull (green): optimistic outcome
 *   - FIRE Number (amber dashed): target threshold
 */

import { FIREProjectionYearData } from '@/types/assets';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface FIREProjectionChartProps {
  yearlyData: FIREProjectionYearData[];
}

export function FIREProjectionChart({ yearlyData }: FIREProjectionChartProps) {
  if (yearlyData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Nessun dato di proiezione disponibile.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={yearlyData} margin={{ left: 50 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="calendarYear" />
        <YAxis
          width={100}
          tickFormatter={(value) => formatCurrencyCompact(value)}
        />
        <Tooltip
          formatter={(value: number, name: string) => [formatCurrency(value), name]}
          labelFormatter={(label) => `Anno ${label}`}
          labelStyle={{ color: '#000' }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="bearNetWorth"
          stroke="#EF4444"
          strokeWidth={2}
          name="Scenario Orso"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="baseNetWorth"
          stroke="#6366F1"
          strokeWidth={2}
          name="Scenario Base"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="bullNetWorth"
          stroke="#10B981"
          strokeWidth={2}
          name="Scenario Toro"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="baseFireNumber"
          stroke="#F59E0B"
          strokeWidth={2}
          strokeDasharray="8 4"
          name="FIRE Number"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
