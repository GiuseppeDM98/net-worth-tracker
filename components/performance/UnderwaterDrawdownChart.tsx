'use client';

import { UnderwaterDrawdownData } from '@/types/performance';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPercentage } from '@/lib/services/chartService';

interface UnderwaterDrawdownChartProps {
  data: UnderwaterDrawdownData[];
  height?: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const drawdown = payload[0].value;

  return (
    <div className="bg-background border border-border rounded-lg shadow-lg p-3">
      <p className="font-semibold mb-2">{label}</p>
      <div className="flex items-center gap-2 text-sm">
        <div className="w-3 h-3 rounded-full bg-red-500" />
        <span className="text-muted-foreground">Drawdown:</span>
        <span className="font-medium">{formatPercentage(drawdown)}</span>
      </div>
      {drawdown === 0 && (
        <p className="text-xs text-muted-foreground mt-1">Massimo storico</p>
      )}
    </div>
  );
}

export function UnderwaterDrawdownChart({ data, height = 400 }: UnderwaterDrawdownChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Dati insufficienti per visualizzare il grafico underwater
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(value) => `${value.toFixed(1)}%`}
          domain={['auto', 0]} // Always show 0% at top
          tick={{ fontSize: 12 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="#EF4444" // red-500
          fill="#EF4444"
          fillOpacity={0.3}
          name="Drawdown"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
