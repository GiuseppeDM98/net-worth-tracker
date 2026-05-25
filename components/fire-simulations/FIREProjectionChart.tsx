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
import { useChartColors } from '@/lib/hooks/useChartColors';
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
  /** Chart height in pixels — pass responsive value from parent via useMediaQuery */
  height?: number;
  /** Left margin for YAxis labels */
  marginLeft?: number;
}

export function FIREProjectionChart({ yearlyData, bearYearsToFIRE, baseYearsToFIRE, bullYearsToFIRE, height = 400, marginLeft = 50 }: FIREProjectionChartProps) {
  const chartColors = useChartColors();
  // Semantic mapping: Orso (bear/pessimistic) → red token [4], Base → primary [0], Toro (bull) → green token [1]
  const bearColor = chartColors[4];
  const baseColor = chartColors[0];
  const bullColor = chartColors[1];

  if (yearlyData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Nessun dato di proiezione disponibile.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={yearlyData} margin={{ left: marginLeft, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="calendarYear" />
        <YAxis
          width={marginLeft <= 20 ? 70 : 100}
          tickFormatter={(value) => formatCurrencyCompact(value)}
        />
        <Tooltip
          formatter={(value, name) => [formatCurrency(value as number), name]}
          labelFormatter={(label) => `Anno ${label}`}
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
          dataKey="bearNetWorth"
          stroke={bearColor}
          strokeWidth={2}
          name="Scenario Orso"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="baseNetWorth"
          stroke={baseColor}
          strokeWidth={2}
          name="Scenario Base"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="bullNetWorth"
          stroke={bullColor}
          strokeWidth={2}
          name="Scenario Toro"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="bearFireNumber"
          stroke={bearColor}
          strokeWidth={1.5}
          strokeDasharray="8 4"
          name="FIRE Nr. Orso"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="baseFireNumber"
          stroke={baseColor}
          strokeWidth={2}
          strokeDasharray="8 4"
          name="FIRE Nr. Base"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="bullFireNumber"
          stroke={bullColor}
          strokeWidth={1.5}
          strokeDasharray="8 4"
          name="FIRE Nr. Toro"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        {/* Vertical lines marking the year FIRE is reached per scenario */}
        {bullYearsToFIRE !== null && (
          <ReferenceLine
            x={yearlyData[0].calendarYear - 1 + bullYearsToFIRE}
            stroke={bullColor}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: 'FIRE Toro', position: 'top', fill: bullColor, fontSize: 11 }}
          />
        )}
        {baseYearsToFIRE !== null && (
          <ReferenceLine
            x={yearlyData[0].calendarYear - 1 + baseYearsToFIRE}
            stroke={baseColor}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: 'FIRE Base', position: 'top', fill: baseColor, fontSize: 11 }}
          />
        )}
        {bearYearsToFIRE !== null && (
          <ReferenceLine
            x={yearlyData[0].calendarYear - 1 + bearYearsToFIRE}
            stroke={bearColor}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: 'FIRE Orso', position: 'top', fill: bearColor, fontSize: 11 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
