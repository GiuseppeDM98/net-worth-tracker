/**
 * Donut chart showing portfolio distribution across goals.
 * Each slice uses the goal's user-chosen color; unassigned slice uses a
 * neutral derived from --muted-foreground (read after paint so it adapts to the theme).
 *
 * SVG text elements use inline style={{ fill }} instead of className="fill-*" because
 * Tailwind generates `color:` not `fill:` for text-color utilities on SVG elements.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { GoalProgress } from '@/types/goals';
import { CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/formatters';

interface GoalAllocationPieChartProps {
  progressList: GoalProgress[];
  unassignedValue: number;
  activeGoalId: string | null;
}

// Module-level (React Compiler: no components defined inside another component's
// body) so the Legend content= prop gets a stable reference. Square swatch —
// DESIGN.md: rounded-[2px] reads as a color key, rounded-full reads as a status dot.
function GoalLegendContent({ payload }: { payload?: Array<{ value?: string; color?: string }> }) {
  if (!payload || payload.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
      {payload.map((entry, i) => (
        <li key={`${entry.value}-${i}`} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          <span className="text-[11px] text-muted-foreground">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function GoalAllocationPieChart({
  progressList,
  unassignedValue,
  activeGoalId,
}: GoalAllocationPieChartProps) {
  const reducedMotion = useReducedMotion();

  // Read the muted-foreground CSS var after paint so it adapts to theme switches
  const [unassignedColor, setUnassignedColor] = useState('#94a3b8');

  useEffect(() => {
    const rAF = requestAnimationFrame(() => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--muted-foreground')
        .trim();
      if (raw) setUnassignedColor(`oklch(${raw})`);
    });
    return () => cancelAnimationFrame(rAF);
  }, []);

  const chartData = useMemo(() => {
    const data = progressList
      .filter((p) => p.currentValue > 0)
      .map((p) => ({
        id: p.goalId,
        name: p.goalName,
        value: p.currentValue,
        color: p.goalColor,
      }));

    if (unassignedValue > 0) {
      data.push({
        id: '__unassigned__',
        name: 'Non Assegnato',
        value: unassignedValue,
        color: unassignedColor,
      });
    }

    return data;
  }, [progressList, unassignedValue, unassignedColor]);

  const totalValue = useMemo(
    () => chartData.reduce((sum, d) => sum + d.value, 0),
    [chartData]
  );
  const activeSlice = chartData.find((entry) => entry.id === activeGoalId) ?? null;

  if (chartData.length === 0) return null;

  return (
    <CardContent className="pt-0 pb-4">
      <p className="text-xs text-muted-foreground mb-3 px-0">
        Seleziona un obiettivo nella lista per evidenziare la quota corrispondente.
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
            animationBegin={0}
            animationDuration={reducedMotion ? 0 : 600}
            animationEasing="ease-out"
          >
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.color}
                opacity={!activeGoalId || activeGoalId === entry.id ? 1 : 0.3}
                stroke={
                  activeGoalId === entry.id ? 'var(--foreground)' : 'transparent'
                }
                strokeWidth={activeGoalId === entry.id ? 1 : 0}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [
              `${formatCurrency(value as number)} (${
                totalValue > 0
                  ? (((value as number) / totalValue) * 100).toFixed(1)
                  : 0
              }%)`,
              '',
            ]}
            labelFormatter={(label) => label}
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--card-foreground)',
            }}
            itemStyle={{ color: 'var(--card-foreground)' }}
            labelStyle={{ color: 'var(--foreground)' }}
          />
          <Legend content={<GoalLegendContent />} />
          {/* SVG text uses inline style={{ fill }} — Tailwind fill-* classes don't work on <text> */}
          {activeSlice && (
            <>
              <text
                x="50%"
                y="46%"
                textAnchor="middle"
                style={{ fill: 'var(--foreground)', fontSize: '0.875rem', fontWeight: 500 }}
              >
                {activeSlice.name}
              </text>
              <text
                x="50%"
                y="56%"
                textAnchor="middle"
                style={{ fill: 'var(--foreground)', fontSize: '1rem', fontWeight: 600 }}
              >
                {formatCurrency(activeSlice.value)}
              </text>
            </>
          )}
        </PieChart>
      </ResponsiveContainer>
    </CardContent>
  );
}
