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
}

const UNASSIGNED_COLOR = '#D1D5DB'; // gray-300

export function GoalAllocationPieChart({
  progressList,
  unassignedValue,
}: GoalAllocationPieChartProps) {
  const chartData = useMemo(() => {
    const data = progressList
      .filter((p) => p.currentValue > 0)
      .map((p) => ({
        name: p.goalName,
        value: p.currentValue,
        color: p.goalColor,
      }));

    if (unassignedValue > 0) {
      data.push({
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

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Allocazione per Obiettivo</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [
                  `${formatCurrency(value)} (${totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : 0}%)`,
                  '',
                ]}
                labelFormatter={(label: string) => label}
              />
              <Legend
                formatter={(value: string) => (
                  <span className="text-sm text-gray-700">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
