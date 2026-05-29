'use client';

// Recharts line chart showing month-by-month evolution of labor income, savings from
// work, and gross investment growth — the time-series counterpart to the 4 KPI cards.
// Follows the same pattern as FireCalculatorTab "Evoluzione Storica" chart.
// Colors come from useChartColors() so they respect the active theme (no hardcoded hex).

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
import { prepareMonthlyLaborMetricsData, formatCurrencyCompact } from '@/lib/services/chartService';
import { fmtCurrency } from '@/lib/utils/chartUtils';
import { EmptyState, ChartEmptyIcon } from '@/components/ui/EmptyState';
import { useChartColors } from '@/lib/hooks/useChartColors';

interface LaborMetricsChartProps {
  data: ReturnType<typeof prepareMonthlyLaborMetricsData>;
  isMobile: boolean;
}

export default function LaborMetricsChart({ data, isMobile }: LaborMetricsChartProps) {
  // Must be called unconditionally before any early return (rules of hooks)
  const chartColors = useChartColors();

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
    <>
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
            formatter={fmtCurrency}
            contentStyle={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--card-foreground)',
            }}
            labelStyle={{ color: 'var(--foreground)' }}
          />
          {/* Legend labels are long — hidden on mobile and replaced by the inline legend below */}
          <Legend wrapperStyle={{ display: isMobile ? 'none' : 'block', paddingTop: '20px' }} />
          <Line
            type="monotone"
            dataKey="laborIncome"
            stroke={chartColors[0]}
            strokeWidth={2}
            name="Guadagnato da Lavoro"
            dot={{ r: 3 }}
            animationDuration={800}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="savedFromWork"
            stroke={chartColors[1]}
            strokeWidth={2}
            name="Risparmiato da Lavoro"
            dot={{ r: 3 }}
            animationDuration={800}
            animationEasing="ease-out"
          />
          <Line
            type="monotone"
            dataKey="investmentGrowth"
            stroke={chartColors[4]}
            strokeWidth={2}
            name="Crescita Investimenti (Lordo)"
            dot={{ r: 3 }}
            animationDuration={800}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>

      {isMobile && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3 px-1">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: chartColors[0] }} />
            <span className="text-xs text-muted-foreground">Guadagnato</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: chartColors[1] }} />
            <span className="text-xs text-muted-foreground">Risparmiato</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: chartColors[4] }} />
            <span className="text-xs text-muted-foreground">Investimenti</span>
          </div>
        </div>
      )}
    </>
  );
}
