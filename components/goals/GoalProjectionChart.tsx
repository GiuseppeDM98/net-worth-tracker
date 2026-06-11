/**
 * GoalProjectionChart (B2) — the glide path from today's value to the goal's target.
 *
 * A compact area chart of the projected balance (goal identity color) with the target as a
 * dashed reference line and the deadline as a vertical marker. Makes the gap between
 * "current pace" and "what the goal needs" visible at a glance inside the expanded row.
 *
 * Pure series come from buildGoalProjectionSeries; this component only renders.
 */

'use client';

import { useMemo, useId } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { buildGoalProjectionSeries, GoalTrajectoryInput } from '@/lib/utils/goalTrajectory';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { formatShortMonthYear } from './goalVerdictMeta';

interface GoalProjectionChartProps {
  input: GoalTrajectoryInput & { targetAmount: number };
  /** Goal identity color for the projected line/area. */
  color: string;
  height?: number;
}

export function GoalProjectionChart({ input, color, height = 170 }: GoalProjectionChartProps) {
  const gradientId = useId();
  const data = useMemo(() => buildGoalProjectionSeries(input), [input]);

  const deadlineTs = input.targetDate ? new Date(input.targetDate).getTime() : null;

  if (data.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
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
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          minTickGap={40}
        />
        <YAxis
          width={56}
          tickFormatter={(v) => formatCurrencyCompact(v)}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(value as number),
            name === 'target' ? 'Obiettivo' : 'Proiezione',
          ]}
          labelFormatter={(ts) => formatShortMonthYear(new Date(ts as number))}
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            color: 'var(--card-foreground)',
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          animationDuration={600}
          animationEasing="ease-out"
        />
        <ReferenceLine
          y={data[0].target}
          stroke="var(--muted-foreground)"
          strokeDasharray="6 4"
          strokeWidth={1.25}
        />
        {deadlineTs != null && (
          <ReferenceLine
            x={deadlineTs}
            stroke="var(--muted-foreground)"
            strokeDasharray="3 3"
            strokeWidth={1.25}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
