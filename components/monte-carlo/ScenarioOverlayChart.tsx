'use client';

/**
 * The three scenarios' medians drawn over each other, with the base scenario's 10–90 band faintly
 * behind them — the Dettaglio's «Traiettorie a confronto». Bear takes `--chart-5`, base
 * `--chart-1`, bull `--chart-2`: the same slots the Scenari tile's swatches and the Calcolatore's
 * scenarios use, so a colour means one scenario across the FIRE page. No legend on the plot: the
 * tile's footer carries the swatches.
 */

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { OverlayPoint } from '@/lib/utils/monteCarloSummary';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

/** Chart slot per scenario — bear 4, base 0, bull 1 (the Calcolatore's `SCENARIO_META`). */
export const SCENARIO_SLOT = { bear: 4, base: 0, bull: 1 } as const;

interface ScenarioOverlayChartProps {
  series: OverlayPoint[];
  height: number | `${number}%`;
  ariaLabel: string;
}

interface OverlayTooltipProps {
  active?: boolean;
  payload?: readonly { payload?: OverlayPoint }[];
  label?: string | number;
  colors?: { bear: string; base: string; bull: string };
}

function OverlayTooltip({ active, payload, label, colors }: OverlayTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const rows: [string, number, string][] = [
    ['Orso', row.bearP50, colors?.bear ?? 'var(--chart-5)'],
    ['Base', row.baseP50, colors?.base ?? 'var(--chart-1)'],
    ['Toro', row.bullP50, colors?.bull ?? 'var(--chart-2)'],
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        {rows.map(([name, value, color]) => (
          <p key={name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
            {name}: <span className="font-mono font-medium tabular-nums text-foreground">{value > 0 ? formatCurrency(value) : 'esaurito'}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function ScenarioOverlayChart({ series, height, ariaLabel }: ScenarioOverlayChartProps) {
  const chartColors = useChartColors();
  const colors = {
    bear: chartColors[SCENARIO_SLOT.bear] || 'var(--chart-5)',
    base: chartColors[SCENARIO_SLOT.base] || 'var(--chart-1)',
    bull: chartColors[SCENARIO_SLOT.bull] || 'var(--chart-2)',
  };
  // Instantiated here so the colours are captured; Recharts adds active/payload/label by cloning.
  const tooltip = <OverlayTooltip colors={colors} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={series} margin={{ left: 4, right: 8, top: 8, bottom: 4 }} role="img" aria-label={ariaLabel} accessibilityLayer={false}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="calendarYear" tick={CHART_TICK_STYLE} tickMargin={6} />
        <YAxis width={64} tickFormatter={(value) => formatCurrencyCompact(Number(value))} tick={CHART_TICK_STYLE} />
        <Tooltip content={tooltip} />
        <Area dataKey="baseBand" name="10°–90° base" stroke="none" fill={colors.base} fillOpacity={0.1} isAnimationActive={false} activeDot={false} />
        <Line dataKey="bearP50" name="Orso" stroke={colors.bear} strokeWidth={2} dot={false} animationDuration={800} animationEasing="ease-out" />
        <Line dataKey="bullP50" name="Toro" stroke={colors.bull} strokeWidth={2} dot={false} animationDuration={800} animationEasing="ease-out" />
        <Line dataKey="baseP50" name="Base" stroke={colors.base} strokeWidth={2.5} dot={false} animationDuration={800} animationEasing="ease-out" />
        <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="3 3" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
