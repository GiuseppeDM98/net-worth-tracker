'use client';

/**
 * CoastFireProjectionChart visualises how the current patrimonio would evolve
 * without new retirement contributions under the three Coast FIRE scenarios.
 *
 * The target line is flat because Coast FIRE uses a real-return model: inflation is already
 * netted out of each scenario, so the capital required at the target age is expressed in
 * today's money throughout the chart.
 *
 * With the pension bridge model active, the unlock year shows a visible step in all three
 * series AND in the target line — the locked fund re-enters the spendable capital there, and
 * the requirement (net of the fund until then) becomes the gross one (`fireService`, 2026-08-25).
 * The tooltip names it, so the step never reads as a data glitch (same treatment as
 * `FIREProjectionChart`). Inside a tile the chart takes `height="100%"` and stretches with the
 * absolutely positioned box around it.
 */

import { CoastFIREProjectionPoint } from '@/lib/services/fireService';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface CoastFireProjectionChartProps {
  projectionData: CoastFIREProjectionPoint[];
  /** Chart height: pixels, or "100%" inside an absolutely positioned box (a tile's chart area). */
  height?: number | `${number}%`;
  marginLeft?: number;
  /** Calendar year the locked pension capital re-enters — the tooltip names the step. */
  pensionUnlockCalendarYear?: number | null;
}

const LEGEND_WRAPPER_STYLE = { fontSize: 12, paddingTop: 4 } as const;

interface CoastTooltipProps {
  active?: boolean;
  payload?: { payload?: CoastFIREProjectionPoint }[];
  label?: string | number;
  pensionUnlockCalendarYear?: number | null;
  colors: { bear: string; base: string; bull: string; target: string };
}

/**
 * Module-level custom tooltip — an inline arrow would make a new component type every render.
 * Reports exactly the four series the chart draws, in a fixed order so the eye can compare
 * across years instead of re-reading a value-sorted list.
 */
function CoastTooltip({
  active,
  payload,
  label,
  pensionUnlockCalendarYear,
  colors,
}: CoastTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const rows = [
    { name: 'Patrimonio Orso', value: row.bearPortfolioValue, color: colors.bear },
    { name: 'Patrimonio Base', value: row.basePortfolioValue, color: colors.base },
    { name: 'Patrimonio Toro', value: row.bullPortfolioValue, color: colors.bull },
    { name: 'Capitale richiesto al target', value: row.fireNumberTarget, color: colors.target },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <p className="font-semibold text-foreground">
        Anno {label} · Età {row.age}
      </p>
      {pensionUnlockCalendarYear !== null &&
        pensionUnlockCalendarYear !== undefined &&
        row.calendarYear === pensionUnlockCalendarYear && (
          <p className="mt-1 text-xs text-muted-foreground">
            Sblocco del fondo pensione: il capitale bloccato rientra quest&apos;anno (il gradino
            nelle tre serie e nella linea del capitale richiesto).
          </p>
        )}
      <div className="mt-2 space-y-1.5">
        {rows.map((item) => (
          <div key={item.name} className="flex items-baseline gap-2 text-xs">
            <span
              className="h-2 w-2 shrink-0 self-center rounded-[2px]"
              style={{ background: item.color }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
              {formatCurrency(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CoastFireProjectionChart({
  projectionData,
  height = 340,
  marginLeft = 50,
  pensionUnlockCalendarYear = null,
}: CoastFireProjectionChartProps) {
  const chartColors = useChartColors();
  const bearColor = chartColors[4] || 'var(--chart-5)';
  const baseColor = chartColors[0] || 'var(--chart-1)';
  const bullColor = chartColors[1] || 'var(--chart-2)';
  const targetColor = chartColors[2] || 'var(--chart-3)';

  if (projectionData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Nessun dato di proiezione disponibile.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={projectionData}
        margin={{ left: marginLeft, bottom: 20 }}
        role="img"
        aria-label="Grafico proiezione Coast FIRE: il patrimonio che cresce senza nuovi versamenti negli scenari Orso (rosso), Base (primario) e Toro (verde), con la linea tratteggiata del capitale richiesto al target"
        accessibilityLayer={false}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
        <XAxis dataKey="calendarYear" tick={CHART_TICK_STYLE} tickMargin={6} />
        <YAxis
          width={marginLeft <= 20 ? 70 : 100}
          tickFormatter={(value) => formatCurrencyCompact(Number(value))}
          tick={CHART_TICK_STYLE}
        />
        <Tooltip
          content={
            <CoastTooltip
              pensionUnlockCalendarYear={pensionUnlockCalendarYear}
              colors={{
                bear: bearColor,
                base: baseColor,
                bull: bullColor,
                target: targetColor,
              }}
            />
          }
        />
        <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
        <Line
          type="monotone"
          dataKey="bearPortfolioValue"
          stroke={bearColor}
          strokeWidth={2}
          name="Patrimonio Orso"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="basePortfolioValue"
          stroke={baseColor}
          strokeWidth={2}
          name="Patrimonio Base"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="bullPortfolioValue"
          stroke={bullColor}
          strokeWidth={2}
          name="Patrimonio Toro"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        {/* Target line is a static reference — no animation needed */}
        <Line
          type="monotone"
          dataKey="fireNumberTarget"
          stroke={targetColor}
          strokeWidth={2}
          strokeDasharray="8 4"
          name="Capitale richiesto al target"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
