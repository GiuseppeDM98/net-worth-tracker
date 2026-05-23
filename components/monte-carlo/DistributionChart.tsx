import { useEffect, useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
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
import { useChartColors } from '@/lib/hooks/useChartColors';

interface DistributionChartProps {
  data: {
    range: string;
    count: number;
    percentage: number;
  }[];
  retirementYears: number;
  revealKey?: number;
}

/**
 * Custom tooltip at module level — safe for React Compiler.
 * Recharts cloneElement preserves extra props passed at instantiation.
 */
function DistributionTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
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
      <p className="font-semibold mb-2">{payload[0].payload.range}</p>
      <div className="space-y-1 text-sm">
        <p>Simulazioni: {payload[0].value.toLocaleString('it-IT')}</p>
        <p>Percentuale: {payload[0].payload.percentage.toFixed(1)}%</p>
      </div>
    </div>
  );
}

/**
 * Histogram showing the distribution of final portfolio values across all simulations.
 *
 * Bars enter in sequence — each bucket reveals left-to-right to let the reader parse
 * the distribution shape before it completes. isAnimationActive={false} on the Bar
 * prevents Recharts from animating the staged data changes (which would fight the
 * progressive reveal timing).
 *
 * @param data - Distribution bins with range labels, counts, and percentages
 * @param retirementYears - Simulation duration in years (used in subtitle)
 * @param revealKey - Incrementing key triggers a fresh bar reveal on each new run
 */
export function DistributionChart({ data, retirementYears, revealKey = 0 }: DistributionChartProps) {
  const reducedMotion = useReducedMotion();
  const chartColors = useChartColors();
  const [visibleBars, setVisibleBars] = useState(reducedMotion ? data.length : 0);

  useEffect(() => {
    if (reducedMotion) {
      setVisibleBars(data.length);
      return;
    }
    setVisibleBars(0);
    const timers = data.map((_, index) =>
      window.setTimeout(() => setVisibleBars(index + 1), 80 + index * 45)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [data, reducedMotion, revealKey]);

  const stagedData = useMemo(
    () => data.map((entry, index) => ({ ...entry, count: index < visibleBars ? entry.count : 0 })),
    [data, visibleBars]
  );

  const tooltipEl = <DistributionTooltip />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuzione Valori Finali</CardTitle>
        <p className="text-sm text-muted-foreground">
          Distribuzione dei valori del patrimonio dopo {retirementYears} anni
        </p>
        <p className="text-xs text-muted-foreground">
          I bucket entrano in sequenza per aiutare a leggere la probabilità relativa dei risultati finali.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={stagedData} margin={{ left: 50 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="range"
              angle={-45}
              textAnchor="end"
              height={80}
              stroke="var(--border)"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            />
            <YAxis
              width={100}
              label={{ value: 'Numero di Simulazioni', angle: -90, position: 'insideLeft' }}
              stroke="var(--border)"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(128, 128, 128, 0.1)' }}
              content={tooltipEl}
            />
            <Bar
              dataKey="count"
              fill={chartColors[0]}
              radius={[4, 4, 0, 0]}
              animationDuration={600}
              animationEasing="ease-out"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
