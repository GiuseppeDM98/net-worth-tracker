'use client';

/**
 * The Prima e dopo chart: the plan of today and the plan after the event, base scenario, drawn
 * OVER each other with the FIRE number as a dashed line. The plan of today is a BASELINE and
 * takes `--muted-foreground` — neither the gain nor the loss colour, and never a series hue that
 * would compete with the one line the tile is about (DESIGN.md → In-tile Bars, the neutral
 * baseline rule); the plan after the event takes the base scenario's slot (`--chart-1`), the
 * same hue the Calcolatore's base series has. Two dashed targets are drawn only when the event
 * changes the expenses (a cashflow change): otherwise the two coincide and one is enough.
 *
 * With the pension bridge on, the unlock year shows a step in both series; the tooltip names it
 * so the step never reads as a data glitch. Vertical reference lines mark the two FIRE years.
 */

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WhatIfComparisonPoint } from '@/lib/utils/whatIfSummary';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

const BASELINE_STROKE = 'var(--muted-foreground)';

interface WhatIfProjectionChartProps {
  series: WhatIfComparisonPoint[];
  /** The base scenario's FIRE year on each side; null when not reached within the horizon. */
  calendarBefore: number | null;
  calendarAfter: number | null;
  /** True when the event moves the FIRE number (a cashflow change): both targets are drawn. */
  targetsDiffer: boolean;
  /** Chart height: pixels, or "100%" inside an absolutely positioned box (a tile's chart area). */
  height?: number | `${number}%`;
  /** Calendar year the pension fund unlocks — the tooltip names the step. */
  pensionUnlockCalendarYear?: number | null;
}

interface ComparisonTooltipProps {
  active?: boolean;
  payload?: { payload?: WhatIfComparisonPoint }[];
  label?: string | number;
  afterColor: string;
  pensionUnlockCalendarYear: number | null;
}

/** Module-level custom tooltip: both capitals and both targets of the hovered year. */
function ComparisonTooltip({ active, payload, label, afterColor, pensionUnlockCalendarYear }: ComparisonTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  const rows = [
    { name: 'Piano di oggi', value: row.before, target: row.targetBefore, color: BASELINE_STROKE },
    { name: "Dopo l'evento", value: row.after, target: row.targetAfter, color: afterColor },
  ];

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <p className="font-semibold text-foreground">Anno {label}</p>
      {pensionUnlockCalendarYear !== null && row.calendarYear === pensionUnlockCalendarYear && (
        <p className="mt-1 text-xs text-muted-foreground">Sblocco del fondo pensione: il capitale bloccato rientra quest&apos;anno (il gradino nelle serie).</p>
      )}
      <div className="mt-2 space-y-1.5">
        {rows.map((entry) => (
          <div key={entry.name} className="flex items-baseline gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 self-center rounded-[2px]" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-mono font-medium tabular-nums text-foreground">{entry.value === null ? '—' : formatCurrency(entry.value)}</span>
            {entry.target !== null && <span className="font-mono text-[11px] tabular-nums text-muted-foreground">target {formatCurrency(entry.target)}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WhatIfProjectionChart({
  series,
  calendarBefore,
  calendarAfter,
  targetsDiffer,
  height = 400,
  pensionUnlockCalendarYear = null,
}: WhatIfProjectionChartProps) {
  const chartColors = useChartColors();
  const afterColor = chartColors[0] || 'var(--chart-1)';

  if (series.length === 0) {
    return <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">Nessun dato di proiezione disponibile.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={series}
        margin={{ left: 0, right: 8, bottom: 4 }}
        role="img"
        aria-label={`Grafico prima e dopo: il patrimonio del piano di oggi (linea grigia) e dopo l'evento (linea colorata) nello scenario base, con la linea tratteggiata del numero FIRE${
          targetsDiffer ? ' di entrambi i piani' : ''
        }; il FIRE di oggi ${calendarBefore !== null ? `nel ${calendarBefore}` : 'non arriva entro la proiezione'}, dopo l'evento ${
          calendarAfter !== null ? `nel ${calendarAfter}` : 'non arriva entro la proiezione'
        }`}
        accessibilityLayer={false}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="calendarYear" tick={CHART_TICK_STYLE} tickMargin={6} />
        <YAxis width={64} tickFormatter={(value) => formatCurrencyCompact(Number(value))} tick={CHART_TICK_STYLE} />
        <Tooltip content={<ComparisonTooltip afterColor={afterColor} pensionUnlockCalendarYear={pensionUnlockCalendarYear} />} />
        {targetsDiffer && (
          <Line type="monotone" dataKey="targetBefore" stroke={BASELINE_STROKE} strokeWidth={1.5} strokeDasharray="8 4" name="Numero FIRE di oggi" dot={false} connectNulls={false} animationDuration={800} animationEasing="ease-out" />
        )}
        <Line type="monotone" dataKey="targetAfter" stroke={afterColor} strokeWidth={1.5} strokeDasharray="8 4" name="Numero FIRE" dot={false} connectNulls={false} animationDuration={800} animationEasing="ease-out" />
        <Line type="monotone" dataKey="before" stroke={BASELINE_STROKE} strokeWidth={2} name="Piano di oggi" dot={false} connectNulls={false} animationDuration={800} animationEasing="ease-out" />
        <Line type="monotone" dataKey="after" stroke={afterColor} strokeWidth={2} name="Dopo l'evento" dot={false} connectNulls={false} animationDuration={800} animationEasing="ease-out" />
        {calendarBefore !== null && (
          <ReferenceLine x={calendarBefore} stroke={BASELINE_STROKE} strokeWidth={1} strokeDasharray="4 3" label={{ value: 'FIRE oggi', position: 'top', fill: 'var(--muted-foreground)', fontSize: 11 }} />
        )}
        {calendarAfter !== null && calendarAfter !== calendarBefore && (
          <ReferenceLine x={calendarAfter} stroke={afterColor} strokeWidth={1} strokeDasharray="4 3" label={{ value: 'FIRE dopo', position: 'insideTopRight', fill: afterColor, fontSize: 11 }} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
