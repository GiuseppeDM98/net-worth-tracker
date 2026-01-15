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
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';

interface SimulationChartProps {
  data: PercentilesData[];
  retirementYears: number;
}

/**
 * "Fan chart" showing the evolution of portfolio value percentiles over retirement period.
 *
 * Percentile interpretation guide:
 * - 90th percentile (top green): 90% of simulations ended with portfolio values below this line
 * - 75th percentile (light green): 75% of simulations below this line
 * - 50th percentile/Median (bold blue): Half of simulations above, half below (typical outcome)
 * - 25th percentile (orange): 25% of simulations below this line
 * - 10th percentile (bottom red): Only 10% of simulations did worse than this
 *
 * Visual interpretation:
 * - Green shaded areas: Better-than-median outcomes (success zone)
 * - Orange/Red shaded areas: Worse-than-median outcomes (risk zone)
 * - Reference line at €0 (red dashed): Portfolio depletion (failure threshold)
 * - Wide spread between percentiles: High uncertainty/volatility
 * - Narrow spread: More predictable outcomes
 *
 * The "fan" shape emerges because compounding returns create increasing variance over time.
 * Early years show tight clustering, but outcomes diverge significantly after many years
 * due to accumulated random market variations.
 *
 * @param data - Array of percentile data for each year of retirement
 * @param retirementYears - Total duration of simulation in years
 */
export function SimulationChart({ data, retirementYears }: SimulationChartProps) {
  /**
   * Custom tooltip displaying all five percentile values on hover.
   *
   * Why use dataKey lookup instead of array indices?
   * Recharts can render chart elements in different orders depending on configuration changes,
   * library version updates, or conditional rendering. Using payload.find() with dataKey
   * ensures we always get the correct value for each percentile, regardless of rendering order.
   * This is more robust than hardcoded indices like payload[0], payload[1], etc.
   */
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Look up percentile values by dataKey (resilient to rendering order changes)
      const p90 = payload.find((p: any) => p.dataKey === 'p90')?.value || 0;
      const p75 = payload.find((p: any) => p.dataKey === 'p75')?.value || 0;
      const p50 = payload.find((p: any) => p.dataKey === 'p50')?.value || 0;
      const p25 = payload.find((p: any) => p.dataKey === 'p25')?.value || 0;
      const p10 = payload.find((p: any) => p.dataKey === 'p10')?.value || 0;

      return (
        <div className="bg-background border border-border p-4 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">Anno {label}</p>
          <div className="space-y-1 text-sm">
            <p className="text-green-600">
              90° percentile: {formatCurrency(p90)}
            </p>
            <p className="text-green-500">
              75° percentile: {formatCurrency(p75)}
            </p>
            <p className="text-blue-600 font-semibold">
              Mediana (50°): {formatCurrency(p50)}
            </p>
            <p className="text-orange-500">
              25° percentile: {formatCurrency(p25)}
            </p>
            <p className="text-red-600">
              10° percentile: {formatCurrency(p10)}
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
          <LineChart data={data} margin={{ left: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
            <XAxis
              dataKey="year"
              label={{ value: 'Anni', position: 'insideBottom', offset: -5 }}
              stroke="#9CA3AF"
            />
            <YAxis
              width={100}
              tickFormatter={(value) => formatCurrencyCompact(value)}
              label={{ value: 'Patrimonio', angle: -90, position: 'insideLeft' }}
              stroke="#9CA3AF"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            {/* Reference line at €0 (failure threshold).
                Red dashed line marks portfolio depletion point - when simulations cross
                below this line, they've run out of money (failure). */}
            <ReferenceLine
              y={0}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{
                value: 'Fallimento',
                fill: '#ef4444',
                fontSize: 14,
                fontWeight: 'bold',
                position: 'right'
              }}
            />

            {/* Area charts for percentile ranges creating the "fan" visualization.
                Color gradient from green (good outcomes) to red (poor outcomes):
                - p90 & p75: Green fills (above-median, success zone)
                - p25: Orange fill (below-median, caution zone)
                - p10: Red fill (bottom 10%, risk zone)

                Fill opacity varies (0.1-0.15) to create visual depth when areas overlap.
                Lower percentiles render later to ensure they appear on top in the stack. */}
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
