/**
 * GoalProjectionChart — the glide path from today's value to the goal's target.
 *
 * An area chart of the projected balance (the goal's identity colour) with the target as a
 * dashed reference line and the deadline as a vertical marker: the gap between «current pace»
 * and «what the goal needs» is visible at a glance inside the Traiettoria tile.
 *
 * The series is the pure layer's (`summarizeTrajectory`); this component only renders. With a
 * percentage height it needs a definite parent: the tile positions it `absolute inset-0` inside
 * a `relative flex-1` box (the EvoluzioneTile technique).
 */

'use client';

import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GoalProjectionPoint } from '@/lib/utils/goalTrajectory';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';

interface GoalProjectionChartProps {
  series: GoalProjectionPoint[];
  /** The deadline as epoch ms, null without one. */
  deadlineTs: number | null;
  /** The goal's identity colour for the projected line and area. */
  color: string;
  height?: number | `${number}%`;
  ariaLabel: string;
}

/** «giu 2029» — the axis and tooltip label. */
function formatShortMonthYear(date: Date): string {
  return date.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
}

export function GoalProjectionChart({ series, deadlineTs, color, height = '100%', ariaLabel }: GoalProjectionChartProps) {
  const gradientId = useId();
  if (series.length < 2) return null;

  return (
    <div role="img" aria-label={ariaLabel} className="h-full w-full">
      <ResponsiveContainer width="100%" height={height}>
        {/* The right margin keeps the last month label («giu 2029») inside the plot box. */}
        <AreaChart data={series} margin={{ top: 8, right: 28, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(ts) => formatShortMonthYear(new Date(ts))}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-geist-mono)' }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            width={48}
            tickFormatter={(v) => formatCurrencyCompact(v)}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)', fontFamily: 'var(--font-geist-mono)' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value, name) => [formatCurrency(value as number), name === 'target' ? 'Target' : 'Proiezione']}
            labelFormatter={(ts) => formatShortMonthYear(new Date(ts as number))}
            contentStyle={{
              backgroundColor: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              color: 'var(--popover-foreground)',
              fontSize: 12,
            }}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} animationDuration={600} animationEasing="ease-out" />
          <ReferenceLine y={series[0].target} stroke="var(--muted-foreground)" strokeDasharray="6 4" strokeWidth={1.25} />
          {deadlineTs !== null && <ReferenceLine x={deadlineTs} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeWidth={1.25} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
