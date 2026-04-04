/**
 * Pie chart showing portfolio distribution across goals.
 * Each slice represents a goal (using its color) plus a gray "Non Assegnato" slice.
 */

'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { GoalProgress } from '@/types/goals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/formatters';

interface GoalAllocationPieChartProps {
  progressList: GoalProgress[];
  unassignedValue: number;
  activeGoalId: string | null;
}

const UNASSIGNED_COLOR = '#D1D5DB'; // gray-300

export function GoalAllocationPieChart({
  progressList,
  unassignedValue,
  activeGoalId,
}: GoalAllocationPieChartProps) {
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
        color: UNASSIGNED_COLOR,
      });
    }

    return data;
  }, [progressList, unassignedValue]);

  const totalValue = useMemo(
    () => chartData.reduce((sum, d) => sum + d.value, 0),
    [chartData]
  );
  const activeSlice = chartData.find((entry) => entry.id === activeGoalId) ?? null;

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Allocazione per Obiettivo</CardTitle>
        <p className="text-sm text-muted-foreground">
          Seleziona una card riepilogo o un obiettivo per mettere a fuoco la quota di portafoglio corrispondente.
        </p>
      </CardHeader>
      <CardContent>
        {/* Explicit height avoids Recharts measuring -1 when the tab is hidden */}
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
                animationDuration={600}
                animationEasing="ease-out"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.color}
                    opacity={!activeGoalId || activeGoalId === entry.id ? 1 : 0.3}
                    stroke={!activeGoalId || activeGoalId !== entry.id ? 'transparent' : 'var(--foreground)'}
                    strokeWidth={!activeGoalId || activeGoalId !== entry.id ? 0 : 1}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [
                  `${formatCurrency(value)} (${totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : 0}%)`,
                  '',
                ]}
                labelFormatter={(label: string) => label}
                contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', color: 'var(--card-foreground)' }}
                labelStyle={{ color: 'var(--foreground)' }}
              />
              <Legend
                formatter={(value: string) => (
                  <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>
                )}
              />
              {activeSlice && (
                <>
                  <text x="50%" y="46%" textAnchor="middle" className="fill-foreground text-sm font-medium">
                    {activeSlice.name}
                  </text>
                  <text x="50%" y="56%" textAnchor="middle" className="fill-foreground text-base font-semibold">
                    {formatCurrency(activeSlice.value)}
                  </text>
                </>
              )}
            </PieChart>
          </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
