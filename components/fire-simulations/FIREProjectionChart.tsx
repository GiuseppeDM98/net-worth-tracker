'use client';

/**
 * FIREProjectionChart Component
 *
 * Recharts line chart showing projected net worth under 3 market scenarios
 * (Bear/Base/Bull) plus 3 dashed FIRE Number lines (one per scenario).
 *
 * Design: Uses the same Recharts pattern as FireCalculatorTab's historical chart.
 * Each scenario has its own FIRE Number line because different inflation rates
 * produce different expense targets over time.
 *
 * Color coding follows semantic meaning:
 *   - Bear (red): pessimistic outcome — solid for portfolio, dashed for FIRE target
 *   - Base (indigo): expected outcome — solid for portfolio, dashed for FIRE target
 *   - Bull (green): optimistic outcome — solid for portfolio, dashed for FIRE target
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
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface FIREProjectionChartProps {
  yearlyData: FIREProjectionYearData[];
  bearYearsToFIRE: number | null;
  baseYearsToFIRE: number | null;
  bullYearsToFIRE: number | null;
}

export function FIREProjectionChart({ yearlyData, bearYearsToFIRE, baseYearsToFIRE, bullYearsToFIRE }: FIREProjectionChartProps) {
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
          dataKey="bearFireNumber"
          stroke="#EF4444"
          strokeWidth={1.5}
          strokeDasharray="8 4"
          name="FIRE Nr. Orso"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="baseFireNumber"
          stroke="#6366F1"
          strokeWidth={2}
          strokeDasharray="8 4"
          name="FIRE Nr. Base"
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="bullFireNumber"
          stroke="#10B981"
          strokeWidth={1.5}
          strokeDasharray="8 4"
          name="FIRE Nr. Toro"
          dot={false}
          isAnimationActive={false}
        />
        {/* Vertical lines marking the year FIRE is reached per scenario */}
        {bullYearsToFIRE !== null && (
          <ReferenceLine
            x={yearlyData[0].calendarYear - 1 + bullYearsToFIRE}
            stroke="#10B981"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: `FIRE Toro`, position: 'top', fill: '#10B981', fontSize: 11 }}
          />
        )}
        {baseYearsToFIRE !== null && (
          <ReferenceLine
            x={yearlyData[0].calendarYear - 1 + baseYearsToFIRE}
            stroke="#6366F1"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: `FIRE Base`, position: 'top', fill: '#6366F1', fontSize: 11 }}
          />
        )}
        {bearYearsToFIRE !== null && (
          <ReferenceLine
            x={yearlyData[0].calendarYear - 1 + bearYearsToFIRE}
            stroke="#EF4444"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: `FIRE Orso`, position: 'top', fill: '#EF4444', fontSize: 11 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
