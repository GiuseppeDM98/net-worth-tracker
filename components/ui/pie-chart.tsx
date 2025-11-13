'use client';

import { PieChart as RechartsPC, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PieChartData } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';

interface PieChartProps {
  data: PieChartData[];
}

export function PieChart({ data }: PieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Nessun dato disponibile. Aggiungi assets per visualizzare il grafico.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={500}>
      <RechartsPC>
        <Pie
          data={data as any}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={(entry: any) => entry.percentage >= 5 ? `${entry.name}: ${(entry.percentage as number).toFixed(1)}%` : ''}
          outerRadius={140}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          formatter={(value, entry: any) => {
            const item = data.find((d) => d.name === value);
            if (item) {
              return `${value} (${item.percentage.toFixed(1)}%)`;
            }
            return value;
          }}
        />
      </RechartsPC>
    </ResponsiveContainer>
  );
}
