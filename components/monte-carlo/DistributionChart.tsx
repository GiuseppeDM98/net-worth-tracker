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

/**
 * Histogram showing the distribution of final portfolio values across all Monte Carlo simulations.
 *
 * What this chart shows:
 * After running N simulations (e.g., 10,000), each simulation ends with a different final
 * portfolio value. This chart groups those final values into bins (ranges) and displays
 * how many simulations ended in each range.
 *
 * Interpretation guide:
 * - Tall bars = Many simulations ended in that value range (more likely outcome)
 * - Short bars = Few simulations ended in that range (less likely outcome)
 * - Bars near €0 = Failed simulations (portfolio depleted before retirement end)
 * - Distribution shape reveals risk profile (wide spread = high uncertainty, narrow = predictable)
 *
 * The x-axis shows portfolio value ranges (e.g., "€0-€50k", "€50k-€100k").
 * The y-axis shows the count of simulations that ended in each range.
 *
 * @param data - Array of distribution bins with range labels, counts, and percentages
 * @param retirementYears - Simulation duration in years (used in subtitle)
 */
export function DistributionChart({ data, retirementYears }: DistributionChartProps) {
  /**
   * Custom tooltip displayed on bar hover.
   *
   * Shows:
   * - Range label (e.g., "€100k-€150k")
   * - Number of simulations in that range
   * - Percentage of total simulations
   *
   * Note: Uses `any` type due to Recharts' loosely typed tooltip props.
   * Ideally would use proper Recharts TooltipProps<ValueType, NameType> typing.
   */
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
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data} margin={{ left: 50 }}>
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
              width={100}
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
