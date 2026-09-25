'use client';

/**
 * CoastFireProjectionChart visualises how the current patrimonio would evolve
 * without new retirement contributions under the three Coast FIRE scenarios.
 *
 * The target line is flat because Coast FIRE uses a real-return model: inflation is already
 * netted out of each scenario, so the capital required at the target age is expressed in
 * today's money throughout the chart. It is a reference, not a part of the total: neutral ink,
 * dashed (AGENTS.md → Recharts), like the Calcolatore's.
 *
 * With the pension bridge model active, the unlock year shows a visible step in all three
 * series AND in the target line — the locked fund re-enters the spendable capital there, and
 * the requirement (net of the fund until then) becomes the gross one (`fireService`, 2026-08-25).
 * The tooltip names it, so the step never reads as a data glitch.
 *
 * The savings pace (2026-09-23) is a fourth series, dotted, in the base slot: the base capital
 * WITH the current savings until the year they clear the Coast number of that year, then
 * coasting — by construction it lands on the dashed line at the target age, which is the
 * verdict's «quando» drawn. A vertical marker names that year. Absent without savings.
 *
 * Colour: each scenario takes a chart SLOT (bear → slot 5, base → slot 1, bull → slot 2, the
 * mapping the Scenari tile's swatches use), never a named hue — on a themed palette the bear is
 * not red and the bull is not green, so neither the legend nor the accessible name says so. The
 * legend is `SeriesLegend` under the plot: Recharts' own `<Legend>` paints each label in its
 * series colour, which measured 3,11 · 3,18 · 3,77:1 here. Inside a tile the chart takes
 * `height="100%"` and stretches with the absolutely positioned box around it.
 */

import { CoastFIREProjectionPoint } from '@/lib/services/fireService';
import { formatCurrencyCompact } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { CoastPace } from '@/lib/utils/coastFireView';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { SeriesLegend } from '@/components/ui/series-legend';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
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
  /** The savings pace: its series is drawn dotted, its year marked. Null draws neither. */
  pace?: CoastPace | null;
}

/** The plotted row: the projection point plus the pace series' value for that year, when drawn. */
type CoastPlotPoint = CoastFIREProjectionPoint & { paceValue?: number };

const TARGET_INK = 'var(--muted-foreground)';

interface CoastTooltipProps {
  active?: boolean;
  payload?: { payload?: CoastPlotPoint }[];
  label?: string | number;
  pensionUnlockCalendarYear?: number | null;
  paceUntilYear?: number | null;
  colors: { bear: string; base: string; bull: string };
}

/**
 * Module-level custom tooltip — an inline arrow would make a new component type every render.
 * Reports exactly the series the chart draws, in a fixed order so the eye can compare across
 * years instead of re-reading a value-sorted list. Whole euros: a thirty-year projection has no
 * cents to show.
 */
function CoastTooltip({
  active,
  payload,
  label,
  pensionUnlockCalendarYear,
  paceUntilYear,
  colors,
}: CoastTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const rows = [
    { name: 'Patrimonio Orso', value: row.bearPortfolioValue, color: colors.bear },
    { name: 'Patrimonio Base', value: row.basePortfolioValue, color: colors.base },
    { name: 'Patrimonio Toro', value: row.bullPortfolioValue, color: colors.bull },
    ...(row.paceValue !== undefined
      ? [{ name: paceUntilYear !== null && paceUntilYear !== undefined ? `Base con il risparmio fino al ${paceUntilYear}` : 'Base con il risparmio', value: row.paceValue, color: colors.base }]
      : []),
    { name: 'Capitale richiesto al target', value: row.fireNumberTarget, color: TARGET_INK },
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
      {paceUntilYear !== null && paceUntilYear !== undefined && row.calendarYear === paceUntilYear && (
        <p className="mt-1 text-xs text-muted-foreground">
          Numero Coast FIRE raggiunto al ritmo attuale: da qui il capitale arriva al target da solo.
        </p>
      )}
      <div className="mt-2 space-y-1.5">
        {rows.map((item) => (
          <div key={item.name} className="flex items-baseline gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 self-center rounded-[2px]" style={{ background: item.color }} aria-hidden="true" />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(item.value, true)}
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
  pace = null,
}: CoastFireProjectionChartProps) {
  const chartColors = useChartColors();
  // Slots, not hues: bear → [4], base → [0], bull → [1] — the Scenari tile's `SCENARIO_SLOT`.
  const bearColor = chartColors[4] || 'var(--chart-5)';
  const baseColor = chartColors[0] || 'var(--chart-1)';
  const bullColor = chartColors[1] || 'var(--chart-2)';

  if (projectionData.length === 0) {
    return (
      <p className="flex h-full items-center justify-center px-4 text-center text-[13px] text-muted-foreground">
        Nessun dato per la proiezione.
      </p>
    );
  }

  const paceUntilYear = pace?.reached?.calendarYear ?? null;
  const data: CoastPlotPoint[] = pace
    ? projectionData.map((point, index) => ({ ...point, paceValue: pace.series[index] }))
    : projectionData;

  return (
    <div className="flex h-full min-h-0 flex-col" style={typeof height === 'number' ? { height } : undefined}>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 12, left: marginLeft, bottom: 4 }}
            role="img"
            aria-label={
              pace
                ? "Grafico proiezione Coast FIRE: il patrimonio che cresce senza nuovi versamenti negli scenari Orso, Base e Toro, la linea punteggiata del base con il risparmio attuale e la linea tratteggiata del capitale richiesto al target"
                : "Grafico proiezione Coast FIRE: il patrimonio che cresce senza nuovi versamenti negli scenari Orso, Base e Toro, con la linea tratteggiata del capitale richiesto al target"
            }
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
                  paceUntilYear={paceUntilYear}
                  colors={{ bear: bearColor, base: baseColor, bull: bullColor }}
                />
              }
            />
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
            {pace && (
              // The base slot again, dotted: it IS the base scenario, fed by the savings.
              <Line
                type="monotone"
                dataKey="paceValue"
                stroke={baseColor}
                strokeWidth={1.5}
                strokeDasharray="2 3"
                name="Base con il risparmio attuale"
                dot={false}
                animationDuration={800}
                animationEasing="ease-out"
              />
            )}
            {/* A reference series, not a part of the total: neutral ink, dashed, no animation. */}
            <Line
              type="monotone"
              dataKey="fireNumberTarget"
              stroke={TARGET_INK}
              strokeWidth={1.5}
              strokeDasharray="8 4"
              name="Capitale richiesto al target"
              dot={false}
              isAnimationActive={false}
            />
            {paceUntilYear !== null && (
              <ReferenceLine
                x={paceUntilYear}
                stroke={baseColor}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                label={{ value: 'Coast FIRE al ritmo attuale', position: 'insideTopLeft', fill: 'var(--muted-foreground)', fontSize: 10 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SeriesLegend
        className="mt-1.5 justify-center"
        items={[
          { label: 'Patrimonio Orso', colors: [bearColor] },
          { label: 'Patrimonio Base', colors: [baseColor] },
          { label: 'Patrimonio Toro', colors: [bullColor] },
          ...(pace ? [{ label: 'Base con il risparmio attuale', colors: [baseColor] }] : []),
          { label: 'Capitale richiesto al target', colors: [TARGET_INK] },
        ]}
      />
    </div>
  );
}
