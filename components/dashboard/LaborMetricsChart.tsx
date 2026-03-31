'use client';

// Recharts line chart showing month-by-month evolution of labor income, savings from
// work, and gross investment growth — the time-series counterpart to the 4 KPI cards.
// Follows the same pattern as FireCalculatorTab "Evoluzione Storica" chart.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { prepareMonthlyLaborMetricsData, formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { EmptyState, ChartEmptyIcon } from '@/components/ui/EmptyState';

interface LaborMetricsChartProps {
  data: ReturnType<typeof prepareMonthlyLaborMetricsData>;
  isMobile: boolean;
}

export default function LaborMetricsChart({ data, isMobile }: LaborMetricsChartProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<ChartEmptyIcon />}
        title="Nessun dato disponibile"
        description="Gli snapshot mensili verranno creati automaticamente."
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 280 : 400}>
      <LineChart data={data} margin={{ left: isMobile ? 10 : 50, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="period"
          tick={{ fontSize: isMobile ? 10 : 12 }}
        />
        <YAxis
          width={isMobile ? 70 : 100}
          tickFormatter={(value) => formatCurrencyCompact(value)}
          tick={{ fontSize: isMobile ? 10 : 12 }}
        />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            backgroundColor: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--card-foreground)',
          }}
          labelStyle={{ color: 'var(--foreground)' }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="laborIncome"
          stroke="#3B82F6"
          strokeWidth={2}
          name="Guadagnato da Lavoro"
          dot={{ r: 3 }}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="savedFromWork"
          stroke="#10B981"
          strokeWidth={2}
          name="Risparmiato da Lavoro"
          dot={{ r: 3 }}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="investmentGrowth"
          stroke="#F59E0B"
          strokeWidth={2}
          name="Crescita Investimenti (Lordo)"
          dot={{ r: 3 }}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
