import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
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
import { useChartColors } from '@/lib/hooks/useChartColors';

interface SimulationChartProps {
  data: PercentilesData[];
  retirementYears: number;
  revealKey?: number;
}

/**
 * Custom tooltip at module level — safe for React Compiler.
 * Recharts cloneElement preserves extra props (e.g. chartColors) passed at instantiation.
 */
function SimulationPercentileTooltip({ active, payload, label, chartColors }: any) {
  if (!active || !payload?.length) return null;
  const find = (key: string) => payload.find((p: any) => p.dataKey === key)?.value ?? 0;
  const colors: string[] = chartColors ?? [];
  return (
    <div
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '16px',
        color: 'var(--card-foreground)',
      }}
    >
      <p className="font-semibold mb-2">Anno {label}</p>
      <div className="space-y-1 text-sm">
        <p style={{ color: colors[1] }}>90° percentile: {formatCurrency(find('p90'))}</p>
        <p style={{ color: colors[1] }}>75° percentile: {formatCurrency(find('p75'))}</p>
        <p className="font-semibold" style={{ color: colors[0] }}>
          Mediana (50°): {formatCurrency(find('p50'))}
        </p>
        <p style={{ color: colors[4] }}>25° percentile: {formatCurrency(find('p25'))}</p>
        <p style={{ color: 'var(--destructive)' }}>10° percentile: {formatCurrency(find('p10'))}</p>
      </div>
    </div>
  );
}

/**
 * "Fan chart" showing the evolution of portfolio value percentiles over the retirement period.
 *
 * Percentile bands enter progressively to help the reader parse the spread before it fills.
 * The median line (p50) animates cleanly while the background bands use isAnimationActive={false}
 * to avoid the chaotic multi-area animation sequence.
 *
 * @param data - Percentile data for each year of retirement
 * @param retirementYears - Total simulation duration in years
 * @param revealKey - Incrementing key triggers a fresh band reveal on each new run
 */
export function SimulationChart({ data, retirementYears, revealKey = 0 }: SimulationChartProps) {
  const reducedMotion = useReducedMotion();
  const chartColors = useChartColors();
  const [visibleBands, setVisibleBands] = useState(reducedMotion ? 4 : 0);

  useEffect(() => {
    if (reducedMotion) {
      setVisibleBands(4);
      return;
    }
    setVisibleBands(0);
    const timers = [0, 1, 2, 3].map((index) =>
      window.setTimeout(() => setVisibleBands(index + 1), 90 + index * 70)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [data, reducedMotion, revealKey]);

  // Instantiated here so chartColors are captured; Recharts cloneElement adds active/payload/label
  const tooltipEl = <SimulationPercentileTooltip chartColors={chartColors} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Proiezione Patrimonio ({retirementYears} anni)</CardTitle>
        <p className="text-sm text-muted-foreground">
          La linea solida rappresenta il valore mediano (50° percentile). Le bande mostrano la
          dispersione degli esiti.
        </p>
        <p className="text-xs text-muted-foreground">
          Le bande percentile entrano progressivamente per rendere più leggibile l&apos;ampiezza degli esiti.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data} margin={{ left: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="year"
              label={{ value: 'Anni', position: 'insideBottom', offset: -5 }}
              stroke="var(--border)"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <YAxis
              width={100}
              tickFormatter={(value) => formatCurrencyCompact(value)}
              label={{ value: 'Patrimonio', angle: -90, position: 'insideLeft' }}
              stroke="var(--border)"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
            />
            <Tooltip content={tooltipEl} cursor={{ fill: 'rgba(128, 128, 128, 0.1)' }} />
            <Legend />
            {/* Reference line at €0 marks portfolio depletion (failure threshold) */}
            <ReferenceLine
              y={0}
              stroke="var(--destructive)"
              strokeDasharray="3 3"
              label={{
                value: 'Fallimento',
                fill: 'var(--destructive)',
                fontSize: 14,
                fontWeight: 'bold',
                position: 'right',
              }}
            />
            {/* Percentile band areas — isAnimationActive={false} because 4 stacked decorative
                areas animating individually produces a chaotic sequence. The median line
                animates cleanly in their place. */}
            {visibleBands >= 1 && (
              <Area
                type="monotone"
                dataKey="p90"
                stroke="none"
                fill={chartColors[1]}
                fillOpacity={0.12}
                name="90° percentile"
                isAnimationActive={false}
              />
            )}
            {visibleBands >= 2 && (
              <Area
                type="monotone"
                dataKey="p75"
                stroke="none"
                fill={chartColors[1]}
                fillOpacity={0.16}
                name="75° percentile"
                isAnimationActive={false}
              />
            )}
            {visibleBands >= 3 && (
              <Area
                type="monotone"
                dataKey="p25"
                stroke="none"
                fill={chartColors[4]}
                fillOpacity={0.14}
                name="25° percentile"
                isAnimationActive={false}
              />
            )}
            {visibleBands >= 4 && (
              <Area
                type="monotone"
                dataKey="p10"
                stroke="none"
                fill="var(--destructive)"
                fillOpacity={0.10}
                name="10° percentile"
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="p50"
              stroke={chartColors[0]}
              strokeWidth={3}
              dot={false}
              name="Mediana (50° percentile)"
              animationDuration={800}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
