'use client';

import { useId, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { UnderwaterDrawdownData } from '@/types/performance';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPercentage } from '@/lib/services/chartService';
import { chartShellSettle } from '@/lib/utils/motionVariants';

interface UnderwaterDrawdownChartProps {
  data: UnderwaterDrawdownData[];
  height?: number;
  revealKey?: string;
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
export function UnderwaterDrawdownChart({
  data,
  height = 400,
  revealKey,
}: UnderwaterDrawdownChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const gradientId = useId();

  const deepestPoint = useMemo(() => (
    data.reduce<UnderwaterDrawdownData | null>((lowestPoint, currentPoint) => {
      if (!lowestPoint || currentPoint.drawdown < lowestPoint.drawdown) {
        return currentPoint;
      }
      return lowestPoint;
    }, null)
  ), [data]);

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Dati insufficienti per visualizzare il grafico underwater
      </div>
    );
  }

  return (
    <motion.div
      key={revealKey}
      variants={chartShellSettle}
      initial={prefersReducedMotion ? false : 'idle'}
      animate={prefersReducedMotion ? 'idle' : 'settle'}
      className="space-y-3"
    >
      {deepestPoint && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
            Max Drawdown {formatPercentage(deepestPoint.drawdown)}
          </span>
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
            Punto piu&apos; profondo {deepestPoint.date}
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.42} />
            <stop offset="65%" stopColor="#ef4444" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.06} />
          </linearGradient>
        </defs>
        {/* stroke="var(--border)" makes the grid theme-aware without JS theme detection */}
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          stroke="var(--border)"
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(value) => `${value.toFixed(1)}%`}
          // Fix 0% at top of chart to anchor the "peak" baseline, with negative
          // values extending downward. This makes the visual metaphor clearer:
          // the further down the chart goes, the deeper the drawdown.
          domain={['auto', 0]}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          stroke="var(--border)"
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="#EF4444" // red-500
          fill={`url(#${gradientId})`}
          name="Drawdown"
          animationBegin={0}
          animationDuration={prefersReducedMotion ? 0 : 900}
          animationEasing="ease-out"
        />
      </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
