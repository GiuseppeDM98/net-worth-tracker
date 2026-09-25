'use client';

/**
 * FireFanChart — the Ventaglio view of the FIRE projection.
 *
 * Renders the output of `runAccumulationSimulation` (pure, tested) as a fan:
 * p10–p90 band (weak tint), p25–p75 band (medium tint), the median path, ~40 sample
 * paths ("spaghetti") picked DETERMINISTICALLY (every k-th path — no Math.random at
 * render time), and the moving FIRE target as a dashed line.
 *
 * The one number the deterministic projection cannot give — the cumulative probability of
 * having reached FIRE by the base-scenario year — is resolved by `resolveFanVerdict` in the pure
 * layer and read by the Traguardo tile's footer; the chart only names it in its `aria-label`.
 *
 * All series share ONE data array (percentile fields + s0..sN spaghetti fields):
 * per-child `data` props inside a ComposedChart are unreliable, and a single array
 * keeps the tooltip/axis logic trivial. The tooltip uses a module-level custom
 * content component because the default one would list every spaghetto.
 */

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AccumulationSimulationResult } from '@/lib/services/monteCarloService';
import type { FanVerdict } from '@/lib/utils/fireSummary';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { SeriesLegend } from '@/components/ui/series-legend';

interface FireFanChartProps {
  result: AccumulationSimulationResult;
  /** Calendar year of the simulation's year 0. */
  startCalendarYear: number;
  /** `resolveFanVerdict(result, …)` — named in the accessible label. */
  verdict: FanVerdict;
  /** Pixels, or "100%" inside an absolutely positioned box (a tile's chart area). */
  height: number | `${number}%`;
}

/** Draw at most this many sample paths — enough to show dispersion without smearing the chart. */
const SPAGHETTI_TARGET_COUNT = 40;

interface FanChartRow {
  calendarYear: number;
  band1090: [number, number];
  band2575: [number, number];
  p50: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  fireTarget: number;
  fireProbability: number;
  [spaghettiKey: `s${number}`]: number;
}

// Hand-rolled props, matching the codebase's other custom tooltips (Recharts' own
// TooltipProps no longer exposes payload in a usable shape — see MonthlyAssetBreakdownSection).
interface FanChartTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: FanChartRow }[];
  label?: string | number;
}

/**
 * Custom tooltip: percentiles + moving target + cumulative FIRE probability for the hovered
 * year. A module-level component (AGENTS → Recharts); card tokens so it follows the theme.
 */
function FanChartTooltip({ active, payload, label }: FanChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as FanChartRow | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="mt-2 space-y-1 font-mono text-xs tabular-nums text-muted-foreground">
        <p>
          90° percentile:{' '}
          <span className="font-medium text-foreground">{formatCurrency(row.p90)}</span>
        </p>
        <p>
          75° percentile:{' '}
          <span className="font-medium text-foreground">{formatCurrency(row.p75)}</span>
        </p>
        <p>
          Mediana:{' '}
          <span className="font-semibold text-foreground">{formatCurrency(row.p50)}</span>
        </p>
        <p>
          25° percentile:{' '}
          <span className="font-medium text-foreground">{formatCurrency(row.p25)}</span>
        </p>
        <p>
          10° percentile:{' '}
          <span className="font-medium text-foreground">{formatCurrency(row.p10)}</span>
        </p>
        <p className="border-t border-border/60 pt-1">
          Target FIRE:{' '}
          <span className="font-medium text-foreground">{formatCurrency(row.fireTarget)}</span>
        </p>
        <p>
          Probabilità di FIRE raggiunto:{' '}
          <span className="font-medium text-foreground">{Math.round(row.fireProbability)}%</span>
        </p>
      </div>
    </div>
  );
}


export function FireFanChart({ result, startCalendarYear, verdict, height }: FireFanChartProps) {
  const chartColors = useChartColors();
  // Fan + median share the base scenario's slot (the same one the Scenari view gives it); the
  // moving target is a reference series, so it takes the neutral ink, dashed (AGENTS → Recharts).
  const fanColor = chartColors[0] || 'var(--chart-1)';
  const targetColor = 'var(--muted-foreground)';

  const { rows, spaghettiKeys } = useMemo(() => {
    // Deterministic sample: every k-th path. No randomness at render time.
    const step = Math.max(1, Math.floor(result.paths.length / SPAGHETTI_TARGET_COUNT));
    const sampledPaths = result.paths.filter((_, index) => index % step === 0).slice(0, SPAGHETTI_TARGET_COUNT);
    const keys = sampledPaths.map((_, index) => `s${index}` as const);

    const builtRows: FanChartRow[] = result.percentiles.map((point) => {
      const row: FanChartRow = {
        calendarYear: startCalendarYear + point.year,
        band1090: [point.p10, point.p90],
        band2575: [point.p25, point.p75],
        p50: point.p50,
        p10: point.p10,
        p25: point.p25,
        p75: point.p75,
        p90: point.p90,
        fireTarget: point.fireTarget,
        fireProbability: point.fireProbability,
      };
      sampledPaths.forEach((path, index) => {
        row[`s${index}`] = path[point.year].value;
      });
      return row;
    });

    return { rows: builtRows, spaghettiKeys: keys };
  }, [result, startCalendarYear]);

  return (
    <div className="flex h-full min-h-0 flex-col" style={typeof height === 'number' ? { height } : undefined}>
      <div className="min-h-0 flex-1">
      <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={rows}
        margin={{ left: 10, bottom: 4 }}
        role="img"
        aria-label={
          `Ventaglio Monte Carlo del patrimonio: bande dei percentili 10–90 e 25–75 e mediana, ` +
          `${spaghettiKeys.length} percorsi campione in trasparenza, linea tratteggiata del target FIRE. ` +
          (verdict.atStart
            ? 'FIRE già raggiunto oggi in tutti i percorsi.'
            : `Probabilità di FIRE entro il ${verdict.calendarYear}: ${verdict.probabilityPct}%.`)
        }
        accessibilityLayer={false}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="calendarYear" tick={CHART_TICK_STYLE} tickMargin={6} />
        <YAxis
          width={70}
          tickFormatter={(value) => formatCurrencyCompact(Number(value))}
          tick={CHART_TICK_STYLE}
        />
        <Tooltip content={FanChartTooltip} />
        <Area
          dataKey="band1090"
          name="10°–90° percentile"
          stroke="none"
          fill={fanColor}
          fillOpacity={0.1}
          isAnimationActive={false}
          activeDot={false}
        />
        <Area
          dataKey="band2575"
          name="25°–75° percentile"
          stroke="none"
          fill={fanColor}
          fillOpacity={0.18}
          isAnimationActive={false}
          activeDot={false}
        />
        {spaghettiKeys.map((key) => (
          <Line
            key={key}
            dataKey={key}
            name="spaghetti"
            legendType="none"
            stroke={fanColor}
            strokeWidth={1}
            strokeOpacity={0.12}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        ))}
        <Line
          dataKey="p50"
          name="Mediana"
          stroke={fanColor}
          strokeWidth={2.5}
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          dataKey="fireTarget"
          name="Target FIRE"
          stroke={targetColor}
          strokeWidth={1.5}
          strokeDasharray="6 4"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </ComposedChart>
      </ResponsiveContainer>
      </div>
      {/* The band swatches carry the band's own transparency, so the key matches the plot. */}
      <SeriesLegend
        className="mt-1.5 justify-center"
        items={[
          { label: '10°–90° percentile', colors: [`color-mix(in oklab, ${fanColor} 22%, transparent)`] },
          { label: '25°–75° percentile', colors: [`color-mix(in oklab, ${fanColor} 40%, transparent)`] },
          { label: 'Mediana', colors: [fanColor] },
          { label: 'Target FIRE', colors: [targetColor] },
        ]}
      />
    </div>
  );
}
