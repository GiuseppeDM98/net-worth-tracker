import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DistributionChartProps {
  data: {
    range: string;
    count: number;
    percentage: number;
  }[];
  retirementYears: number;
}

export function DistributionChart({ data, retirementYears }: DistributionChartProps) {
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-4 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{payload[0].payload.range}</p>
          <div className="space-y-1 text-sm">
            <p>Simulazioni: {payload[0].value.toLocaleString('it-IT')}</p>
            <p>Percentuale: {payload[0].payload.percentage.toFixed(1)}%</p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuzione Valori Finali</CardTitle>
        <p className="text-sm text-muted-foreground">
          Distribuzione dei valori del patrimonio dopo {retirementYears} anni
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
            <XAxis
              dataKey="range"
              angle={-45}
              textAnchor="end"
              height={80}
              stroke="#9CA3AF"
              tick={{ fontSize: 11 }}
            />
            <YAxis
              label={{
                value: 'Numero di Simulazioni',
                angle: -90,
                position: 'insideLeft',
              }}
              stroke="#9CA3AF"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
