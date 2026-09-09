'use client';

/**
 * FIREProjectionChart Component — the "Scenari" view of the projection.
 *
 * Recharts line chart with the 3 scenario net-worth series and ONE dashed FIRE target
 * line (base scenario). The previous 6-series version drew a target per scenario and was
 * unreadable; the bear/bull targets did not disappear — they moved into the tooltip,
 * which lists all six numbers for the hovered year.
 *
 * Color coding follows semantic meaning:
 *   - Bear (red token), Base (primary token), Bull (green token);
 *   - vertical reference lines mark the year each scenario reaches FIRE.
 *
 * With the pension bridge model active, the unlock year shows a visible step in every
 * series; the tooltip names it so the step never reads as a data glitch.
 */

import { FIREProjectionYearData } from '@/types/assets';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface FIREProjectionChartProps {
  yearlyData: FIREProjectionYearData[];
  bearYearsToFIRE: number | null;
  baseYearsToFIRE: number | null;
  bullYearsToFIRE: number | null;
  /** Chart height: pixels, or "100%" inside an absolutely positioned box (a tile's chart area). */
  height?: number | `${number}%`;
  /** Left margin for YAxis labels */
  marginLeft?: number;
  /** Calendar year the pension fund unlocks — the tooltip names the step. */
  pensionUnlockCalendarYear?: number | null;
}

const LEGEND_WRAPPER_STYLE = { fontSize: 12, paddingTop: 4 } as const;

interface ScenarioTooltipProps {
  active?: boolean;
  payload?: { payload?: FIREProjectionYearData; color?: string }[];
  label?: string | number;
  pensionUnlockCalendarYear?: number | null;
  colors: { bear: string; base: string; bull: string };
}

/**
 * Module-level custom tooltip: the 3 portfolio values PLUS the 3 FIRE targets (only the base
 * one is drawn as a line — the other two live here) and, at the unlock year, the pension step.
 */
function ScenarioTooltip({
  active,
  payload,
  label,
  pensionUnlockCalendarYear,
  colors,
}: ScenarioTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const scenarioRows = [
    { name: 'Orso', netWorth: row.bearNetWorth, fireNumber: row.bearFireNumber, color: colors.bear },
    { name: 'Base', netWorth: row.baseNetWorth, fireNumber: row.baseFireNumber, color: colors.base },
    { name: 'Toro', netWorth: row.bullNetWorth, fireNumber: row.bullFireNumber, color: colors.bull },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <p className="font-semibold text-foreground">Anno {label}</p>
      {pensionUnlockCalendarYear !== null &&
        pensionUnlockCalendarYear !== undefined &&
        row.calendarYear === pensionUnlockCalendarYear && (
          <p className="mt-1 text-xs text-muted-foreground">
            Sblocco del fondo pensione: il capitale bloccato rientra quest&apos;anno (il gradino
            nelle serie).
          </p>
        )}
      <div className="mt-2 space-y-1.5">
        {scenarioRows.map((scenario) => (
          <div key={scenario.name} className="flex items-baseline gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 self-center rounded-[2px]" style={{ background: scenario.color }} />
            <span className="text-muted-foreground">{scenario.name}</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
              {formatCurrency(scenario.netWorth)}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              target {formatCurrency(scenario.fireNumber)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FIREProjectionChart({
  yearlyData,
  bearYearsToFIRE,
  baseYearsToFIRE,
  bullYearsToFIRE,
  height = 400,
  marginLeft = 50,
  pensionUnlockCalendarYear = null,
}: FIREProjectionChartProps) {
  const chartColors = useChartColors();
  // Semantic mapping: Orso (bear/pessimistic) → red token [4], Base → primary [0], Toro (bull) → green token [1]
  const bearColor = chartColors[4] || 'var(--chart-5)';
  const baseColor = chartColors[0] || 'var(--chart-1)';
  const bullColor = chartColors[1] || 'var(--chart-2)';

  if (yearlyData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        Nessun dato di proiezione disponibile.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={yearlyData}
        margin={{ left: marginLeft, bottom: 20 }}
        role="img"
        aria-label="Grafico proiezione scenari: patrimonio negli scenari Orso (rosso), Base (primario) e Toro (verde) con la linea tratteggiata del FIRE Number dello scenario base; i target Orso e Toro sono nel tooltip"
        accessibilityLayer={false}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="calendarYear" tick={CHART_TICK_STYLE} tickMargin={6} />
        <YAxis
          width={marginLeft <= 20 ? 70 : 100}
          tickFormatter={(value) => formatCurrencyCompact(Number(value))}
          tick={CHART_TICK_STYLE}
        />
        <Tooltip
          content={
            <ScenarioTooltip
              pensionUnlockCalendarYear={pensionUnlockCalendarYear}
              colors={{ bear: bearColor, base: baseColor, bull: bullColor }}
            />
          }
        />
        <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
        <Line
          type="monotone"
          dataKey="bearNetWorth"
          stroke={bearColor}
          strokeWidth={2}
          name="Scenario Orso"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="baseNetWorth"
          stroke={baseColor}
          strokeWidth={2}
          name="Scenario Base"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="bullNetWorth"
          stroke={bullColor}
          strokeWidth={2}
          name="Scenario Toro"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        <Line
          type="monotone"
          dataKey="baseFireNumber"
          stroke={baseColor}
          strokeWidth={1.5}
          strokeDasharray="8 4"
          name="Target FIRE (base)"
          dot={false}
          animationDuration={800}
          animationEasing="ease-out"
        />
        {/* Vertical lines marking the year FIRE is reached per scenario */}
        {bullYearsToFIRE !== null && (
          <ReferenceLine
            x={yearlyData[0].calendarYear - 1 + bullYearsToFIRE}
            stroke={bullColor}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: 'FIRE Toro', position: 'top', fill: bullColor, fontSize: 11 }}
          />
        )}
        {baseYearsToFIRE !== null && (
          <ReferenceLine
            x={yearlyData[0].calendarYear - 1 + baseYearsToFIRE}
            stroke={baseColor}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: 'FIRE Base', position: 'top', fill: baseColor, fontSize: 11 }}
          />
        )}
        {bearYearsToFIRE !== null && (
          <ReferenceLine
            x={yearlyData[0].calendarYear - 1 + bearYearsToFIRE}
            stroke={bearColor}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            label={{ value: 'FIRE Orso', position: 'top', fill: bearColor, fontSize: 11 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
