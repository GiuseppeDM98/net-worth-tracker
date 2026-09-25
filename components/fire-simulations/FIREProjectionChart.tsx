'use client';

/**
 * FIREProjectionChart Component — the "Scenari" view of the projection.
 *
 * Recharts line chart with the 3 scenario net-worth series and ONE dashed FIRE target
 * line (base scenario). The previous 6-series version drew a target per scenario and was
 * unreadable; the bear/bull targets did not disappear — they moved into the tooltip,
 * which lists all six numbers for the hovered year.
 *
 * Colour: each scenario takes a chart SLOT (bear → slot 5, base → slot 1, bull → slot 2, the
 * same mapping the Scenari tile's swatches use), never a named hue — on a themed palette the
 * bear is not red and the bull is not green, so neither the legend nor the accessible name says
 * so. The legend is `SeriesLegend` under the plot (AGENTS.md → Recharts): Recharts' own
 * `<Legend>` paints each label in its series colour, which measured 3,11:1 and 3,77:1 here.
 *
 * The year each scenario reaches FIRE is a vertical reference line. Scenarios that reach it in
 * the SAME year share one line and one label («FIRE Base · Toro»): three labels stacked on one
 * x overlapped and clipped each other. A scenario reached at year 0 has no line — its year is
 * before the plot, and the Scenari tile says «già raggiunto».
 *
 * With the pension bridge model active, the unlock year shows a visible step in every
 * series; the tooltip names it so the step never reads as a data glitch.
 */

import { FIREProjectionYearData } from '@/types/assets';
import { formatCurrencyCompact } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { SeriesLegend } from '@/components/ui/series-legend';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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
 * Whole euros: a fifty-year projection has no cents to show.
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
            <span className="h-2 w-2 shrink-0 self-center rounded-[2px]" style={{ background: scenario.color }} aria-hidden="true" />
            <span className="text-muted-foreground">{scenario.name}</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(scenario.netWorth, true)}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              target {cachedFormatCurrencyEUR(scenario.fireNumber, true)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface FireYearMarker {
  calendarYear: number;
  /** «FIRE Base · Toro» when two scenarios share the year. */
  label: string;
  color: string;
}

/**
 * One marker per DISTINCT FIRE year, in bear · base · bull order; a year shared by several
 * scenarios takes the base's colour when the base is among them, else the first one's. Year 0
 * (reached today) draws nothing: the plot starts at year 1.
 */
function buildFireYearMarkers(
  scenarios: { name: string; years: number | null; color: string; isBase: boolean }[],
  firstCalendarYear: number,
): FireYearMarker[] {
  const byYear = new Map<number, { names: string[]; color: string; hasBase: boolean }>();
  for (const scenario of scenarios) {
    if (scenario.years === null || scenario.years <= 0) continue;
    const calendarYear = firstCalendarYear - 1 + scenario.years;
    const entry = byYear.get(calendarYear);
    if (!entry) {
      byYear.set(calendarYear, { names: [scenario.name], color: scenario.color, hasBase: scenario.isBase });
    } else {
      entry.names.push(scenario.name);
      if (scenario.isBase && !entry.hasBase) {
        entry.color = scenario.color;
        entry.hasBase = true;
      }
    }
  }
  return Array.from(byYear.entries()).map(([calendarYear, entry]) => ({
    calendarYear,
    label: `FIRE ${entry.names.join(' · ')}`,
    color: entry.color,
  }));
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
  // Slots, not hues: bear → [4], base → [0], bull → [1] — the Scenari tile's `SCENARIO_SLOT`.
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

  const markers = buildFireYearMarkers(
    [
      { name: 'Orso', years: bearYearsToFIRE, color: bearColor, isBase: false },
      { name: 'Base', years: baseYearsToFIRE, color: baseColor, isBase: true },
      { name: 'Toro', years: bullYearsToFIRE, color: bullColor, isBase: false },
    ],
    yearlyData[0].calendarYear,
  );

  return (
    <div className="flex h-full min-h-0 flex-col" style={typeof height === 'number' ? { height } : undefined}>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={yearlyData}
            margin={{ top: 12, left: marginLeft, bottom: 4 }}
            role="img"
            aria-label="Grafico proiezione scenari: patrimonio anno per anno negli scenari Orso, Base e Toro, con la linea tratteggiata del numero FIRE dello scenario base e una linea verticale nell'anno in cui ogni scenario lo raggiunge; i target Orso e Toro sono nel tooltip"
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
            {/* A reference series, not a part of the total: neutral ink, dashed (AGENTS → Recharts). */}
            <Line
              type="monotone"
              dataKey="baseFireNumber"
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="8 4"
              name="Numero FIRE (base)"
              dot={false}
              animationDuration={800}
              animationEasing="ease-out"
            />
            {/* One vertical line per distinct FIRE year; the label sits inside the plot, under
                the top margin, so it is never clipped. */}
            {markers.map((marker) => (
              <ReferenceLine
                key={marker.calendarYear}
                x={marker.calendarYear}
                stroke={marker.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: marker.label, position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 10 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SeriesLegend
        className="mt-1.5 justify-center"
        items={[
          { label: 'Scenario Orso', colors: [bearColor] },
          { label: 'Scenario Base', colors: [baseColor] },
          { label: 'Scenario Toro', colors: [bullColor] },
          { label: 'Numero FIRE (base)', colors: ['var(--muted-foreground)'] },
        ]}
      />
    </div>
  );
}
