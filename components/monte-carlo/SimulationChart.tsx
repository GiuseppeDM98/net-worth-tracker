import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PercentilesData } from '@/types/assets';
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { formatCurrency } from '@/lib/services/chartService';

interface SimulationChartProps {
  data: PercentilesData[];
  retirementYears: number;
}

export function SimulationChart({ data, retirementYears }: SimulationChartProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-4 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">Anno {label}</p>
          <div className="space-y-1 text-sm">
            <p className="text-green-600">
              90° percentile: {formatCurrency(payload[4]?.value || 0)}
            </p>
            <p className="text-green-500">
              75° percentile: {formatCurrency(payload[3]?.value || 0)}
            </p>
            <p className="text-blue-600 font-semibold">
              Mediana (50°): {formatCurrency(payload[2]?.value || 0)}
            </p>
            <p className="text-orange-500">
              25° percentile: {formatCurrency(payload[1]?.value || 0)}
            </p>
            <p className="text-red-600">
              10° percentile: {formatCurrency(payload[0]?.value || 0)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proiezione Patrimonio ({retirementYears} anni)</CardTitle>
        <p className="text-sm text-muted-foreground">
          Il grafico mostra i percentili delle simulazioni. La linea blu rappresenta il
          valore mediano (50° percentile).
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
            <XAxis
              dataKey="year"
              label={{ value: 'Anni', position: 'insideBottom', offset: -5 }}
              stroke="#9CA3AF"
            />
            <YAxis
              tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
              label={{ value: 'Patrimonio', angle: -90, position: 'insideLeft' }}
              stroke="#9CA3AF"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            {/* Reference line at 0 (failure threshold) */}
            <ReferenceLine
              y={0}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{ value: 'Fallimento', fill: '#ef4444', fontSize: 12 }}
            />

            {/* Area charts for percentile ranges */}
            <Area
              type="monotone"
              dataKey="p90"
              stroke="none"
              fill="#10b981"
              fillOpacity={0.1}
              name="90° percentile"
            />
            <Area
              type="monotone"
              dataKey="p75"
              stroke="none"
              fill="#10b981"
              fillOpacity={0.15}
              name="75° percentile"
            />
            <Area
              type="monotone"
              dataKey="p25"
              stroke="none"
              fill="#f97316"
              fillOpacity={0.15}
              name="25° percentile"
            />
            <Area
              type="monotone"
              dataKey="p10"
              stroke="none"
              fill="#ef4444"
              fillOpacity={0.1}
              name="10° percentile"
            />

            {/* Median line */}
            <Line
              type="monotone"
              dataKey="p50"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={false}
              name="Mediana (50° percentile)"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
