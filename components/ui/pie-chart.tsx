'use client';

import { PieChart as RechartsPC, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PieChartData } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

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

  // Detect mobile screen for responsive sizing
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Responsive configuration
  const chartConfig = {
    height: isMobile ? 350 : 500,
    outerRadius: isMobile ? 90 : 140,
    labelThreshold: isMobile ? 10 : 5,
    legendLayout: isMobile ? 'horizontal' : 'vertical',
    legendAlign: isMobile ? 'center' : 'right',
    legendVerticalAlign: isMobile ? 'bottom' : 'middle',
  };

  return (
    <ResponsiveContainer width="100%" height={chartConfig.height}>
      <RechartsPC>
        <Pie
          data={sortedData as any}
          cx="50%"
          cy={isMobile ? "45%" : "50%"}
          labelLine={false}
          label={isMobile ? false : (entry: any) => entry.percentage >= chartConfig.labelThreshold ? `${entry.name}: ${(entry.percentage as number).toFixed(1)}%` : ''}
          outerRadius={chartConfig.outerRadius}
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
          layout={chartConfig.legendLayout as any}
          align={chartConfig.legendAlign as any}
          verticalAlign={chartConfig.legendVerticalAlign as any}
          content={() => {
            // On mobile, filter legend to show only items >= 7%
            const legendData = isMobile
              ? sortedData.filter(entry => entry.percentage >= 7)
              : sortedData;

            return (
              <div
                className={isMobile ? "flex flex-wrap justify-center gap-3 px-4" : ""}
                style={isMobile ? { paddingTop: '20px' } : { paddingLeft: '20px' }}
              >
                {legendData.map((entry, index) => (
                <div
                  key={`legend-item-${index}`}
                  className={isMobile ? "flex items-center" : "flex items-center mb-2"}
                  style={{ fontSize: '14px' }}
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
            );
          }}
        />
      </RechartsPC>
    </ResponsiveContainer>
  );
}
