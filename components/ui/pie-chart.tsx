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

  // Ensure data is sorted by value descending for legend order
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  return (
    <ResponsiveContainer width="100%" height={500}>
      <RechartsPC>
        <Pie
          data={sortedData as any}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={(entry: any) => entry.percentage >= 5 ? `${entry.name}: ${(entry.percentage as number).toFixed(1)}%` : ''}
          outerRadius={140}
          fill="#8884d8"
          dataKey="value"
        >
          {sortedData.map((entry, index) => (
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
          content={() => (
            <div style={{ paddingLeft: '20px' }}>
              {sortedData.map((entry, index) => (
                <div
                  key={`legend-item-${index}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '8px',
                    fontSize: '14px',
                  }}
                >
                  <div
                    style={{
                      width: '14px',
                      height: '14px',
                      backgroundColor: entry.color,
                      marginRight: '8px',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color: '#374151' }}>
                    {entry.name} ({entry.percentage.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        />
      </RechartsPC>
    </ResponsiveContainer>
  );
}
