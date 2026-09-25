'use client';

import { useEffect, useId, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { UnderwaterDrawdownData } from '@/types/performance';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPercentage } from '@/lib/services/chartService';
import { chartShellSettle } from '@/lib/utils/motionVariants';
import { MONTH_NAMES } from '@/lib/constants/months';

interface UnderwaterDrawdownChartProps {
  data: UnderwaterDrawdownData[];
  height?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
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
        <div className="w-3 h-3 rounded-full bg-destructive" />
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

/** «−12,3%», the typographic minus the page uses; a point at the peak reads «0,0%». */
function formatDepth(drawdown: number): string {
  const magnitude = formatPercentage(Math.abs(drawdown), 1);
  return drawdown < 0 ? `−${magnitude}` : magnitude;
}

function monthLabel(point: UnderwaterDrawdownData): string {
  return `${MONTH_NAMES[point.month - 1].toLowerCase()} ${point.year}`;
}

/**
 * The chart's accessible name, which has to carry its content: `role="img"` makes the SVG one
 * opaque node, so the two facts a sighted reader takes from the curve — how deep it went and
 * when, and where it stands now — are said here (AGENTS.md → Recharts, 2026-09-20).
 */
export function describeUnderwaterChart(data: ReadonlyArray<UnderwaterDrawdownData>): string {
  if (data.length === 0) return 'Distanza dal massimo: nessun mese misurato.';
  const first = data[0];
  const last = data[data.length - 1];
  const deepest = data.reduce((low, point) => (point.drawdown < low.drawdown ? point : low), first);
  const span = `Distanza dal massimo, da ${monthLabel(first)} a ${monthLabel(last)}`;
  if (deepest.drawdown >= 0) return `${span}: sempre sul massimo.`;
  // «a fine periodo», not «oggi»: a custom range can end years ago.
  const atEnd =
    last.drawdown < 0
      ? `a fine periodo ${formatDepth(last.drawdown)} dal massimo`
      : 'a fine periodo di nuovo sul massimo';
  return `${span}: punto più basso ${formatDepth(deepest.drawdown)} a ${monthLabel(deepest)}, ${atEnd}.`;
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
}: UnderwaterDrawdownChartProps) {
  const prefersReducedMotion = useReducedMotion();
  const gradientId = useId();

  // Read --destructive once after paint so the color is theme-aware
  const [destructiveColor, setDestructiveColor] = useState('oklch(0.5771 0.2152 27.325)');
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const c = getComputedStyle(document.documentElement).getPropertyValue('--destructive').trim();
      if (c) setDestructiveColor(c.startsWith('oklch') ? c : `oklch(${c})`);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Dati insufficienti per visualizzare il grafico underwater
      </div>
    );
  }

  return (
    <motion.div
      variants={chartShellSettle}
      initial={prefersReducedMotion ? false : 'idle'}
      animate={prefersReducedMotion ? 'idle' : 'settle'}
      className="space-y-3"
    >
      <ResponsiveContainer width="100%" height={height}>
      {/* Recharts puts `role="application"` + `tabIndex=0` on its svg: an unnamed Tab stop with
          nothing to operate. An image with a name that says what the curve says instead. */}
      <AreaChart data={data} role="img" aria-label={describeUnderwaterChart(data)} accessibilityLayer={false}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={destructiveColor} stopOpacity={0.72} />
            <stop offset="55%" stopColor={destructiveColor} stopOpacity={0.45} />
            <stop offset="100%" stopColor={destructiveColor} stopOpacity={0.18} />
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
          stroke={destructiveColor}
          strokeWidth={2}
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
