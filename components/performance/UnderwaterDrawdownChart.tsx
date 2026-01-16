'use client';

import { UnderwaterDrawdownData } from '@/types/performance';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPercentage } from '@/lib/services/chartService';

interface UnderwaterDrawdownChartProps {
  data: UnderwaterDrawdownData[];
  height?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

/**
 * Custom tooltip for drawdown chart showing percentage and peak indicator.
 *
 * Displays the drawdown percentage with a special message when the portfolio
 * is at its all-time high (0% drawdown = "Massimo storico").
 */
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const drawdown = payload[0].value;

  return (
    <div className="bg-background border border-border rounded-lg shadow-lg p-3">
      <p className="font-semibold mb-2">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <span className="text-muted-foreground">Drawdown:</span>
        <span className="font-medium">{formatPercentage(drawdown)}</span>
      </div>
      {/* Show "Massimo storico" when drawdown is 0% to indicate the portfolio is at peak value */}
      {drawdown === 0 && (
        <p className="text-xs text-muted-foreground mt-1">Massimo storico</p>
      )}
    </div>
  );
}

/**
 * Underwater drawdown chart visualizing portfolio decline from peak values.
 *
 * Drawdown visualization concept:
 * - Drawdown measures how far the portfolio has fallen from its all-time high
 * - 0% = Portfolio is at its peak value (all-time high)
 * - -20% = Portfolio is 20% below its peak value
 * - The chart fills the area below zero to emphasize losses
 *
 * The Y-axis is inverted (0 at top, negative values below) to visually represent
 * decline direction, making it easier to see periods of recovery vs. further decline.
 *
 * @param data - Array of date/drawdown data points
 * @param height - Chart height in pixels (default: 400)
 */
export function UnderwaterDrawdownChart({ data, height = 400 }: UnderwaterDrawdownChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Dati insufficienti per visualizzare il grafico underwater
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(value) => `${value.toFixed(1)}%`}
          // Fix 0% at top of chart to anchor the "peak" baseline, with negative
          // values extending downward. This makes the visual metaphor clearer:
          // the further down the chart goes, the deeper the drawdown.
          domain={['auto', 0]}
          tick={{ fontSize: 12 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="#EF4444" // red-500
          fill="#EF4444"
          fillOpacity={0.3}
          name="Drawdown"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
