'use client';

/**
 * EVOLUZIONE — the dominant tile of Storico: the value today, the three grouped chips (the
 * growth since the first snapshot, the wealth CAGR named as such, the last twelve months), then
 * the net-worth series as the element that stretches when the tile spans two rows, with the
 * notes as markers on the line and a tooltip that names the month, its change and its note.
 *
 * Every figure comes from `storicoSummary.ts` (growth, pace, the per-month deltas); the words
 * from `storicoNarrative.ts`. The chart is Recharts (the app's rule for a plotted series with a
 * tooltip): ticks in `CHART_TICK_STYLE`, the three tooltip styles, `role="img"` on the chart.
 */

import { useId } from 'react';
import { useReducedMotion } from 'framer-motion';
import { MessageSquare, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Narrative } from '@/lib/utils/narrative';
import type { EvolutionPoint, GrowthPace, GrowthSummary } from '@/lib/utils/storicoSummary';
import { formatPeriodMonth } from '@/lib/utils/storicoNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatCurrencyCompact, formatPercentage } from '@/lib/services/chartService';
import { signChipClass, signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { OverviewAnimatedCurrency } from '@/components/dashboard/OverviewAnimatedCurrency';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';

interface EvoluzioneTileProps {
  aside: string;
  reading: Narrative | null;
  growth: GrowthSummary;
  pace: GrowthPace;
  /** Chronological, with each month's change (`withMonthDeltas`). */
  points: EvolutionPoint[];
  noteCount: number;
  onAddNote: () => void;
  /** Demo mode: the note dialog would write into the shared demo snapshots. */
  disabled?: boolean;
  className?: string;
}

// ─── Chips ────────────────────────────────────────────────────────────────────

function Chip({ value, caption, children }: { value: number | null; caption: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span
        className={cn(
          'inline-flex w-fit max-w-full items-center gap-1.5 whitespace-nowrap rounded-[9px] px-[11px] py-[6px] font-mono text-[12px] font-semibold leading-none tracking-[-0.01em] tabular-nums',
          value === null ? 'bg-muted text-foreground' : signChipClass(value),
        )}
      >
        {children}
      </span>
      <span className="text-[11px] text-muted-foreground">{caption}</span>
    </div>
  );
}

function signed(value: number): string {
  return `${value >= 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(value), true)}`;
}

function signedPct(value: number): string {
  return `${value >= 0 ? '+' : '−'}${formatPercentage(Math.abs(value), 1)}`;
}

// ─── Chart pieces (module-level: an inline component is a new type every render) ──

/** A note is a marker on the line; a month without one draws nothing. */
function NoteDot(props: { cx?: number; cy?: number; payload?: EvolutionPoint }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload?.note) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill="var(--warning-foreground)" stroke="var(--card)" strokeWidth={2} />;
}

const renderNoteDot = (props: { key?: React.Key | null; cx?: number; cy?: number; payload?: EvolutionPoint }) => {
  const { key, ...rest } = props;
  return <NoteDot key={key ?? undefined} {...rest} />;
};

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '8px 10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  maxWidth: 260,
} as const;

interface EvolutionTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: EvolutionPoint }>;
}

/** The month, its value, its change against the previous month and — when there is one — its note. */
function EvolutionTooltip({ active, payload }: EvolutionTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div style={TOOLTIP_STYLE} className="flex flex-col gap-1 text-[11px]">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{formatPeriodMonth(point)}</span>
      <span className="font-mono text-[13px] font-semibold tabular-nums text-card-foreground">{cachedFormatCurrencyEUR(point.totalNetWorth)}</span>
      {point.delta !== null && (
        <span className="text-muted-foreground">
          sul mese prima <span className={cn('font-mono font-semibold tabular-nums', signTextClass(point.delta))}>{signed(point.delta)}</span>
        </span>
      )}
      {point.note && <span className="whitespace-pre-line border-t border-border pt-1 text-card-foreground">{point.note}</span>}
    </div>
  );
}

/** `MM/YY` → the year, for the axis. */
const yearOfTick = (date: string) => `20${date.slice(3)}`;

// ─── Tile ─────────────────────────────────────────────────────────────────────

export function EvoluzioneTile({ aside, reading, growth, pace, points, noteCount, onAddNote, disabled = false, className }: EvoluzioneTileProps) {
  const prefersReducedMotion = useReducedMotion();
  const gradientId = `evo-${useId().replace(/:/g, '')}`;

  // One tick per January; with fewer than two years of history Recharts picks its own.
  const januaryTicks = points.filter((p) => p.month === 1).map((p) => p.date);
  const ticks = januaryTicks.length >= 2 ? januaryTicks : undefined;
  const GrowthIcon = growth.delta >= 0 ? TrendingUp : TrendingDown;
  const hasChart = points.length >= 2;
  // A narrow range (8 snapshots a few hundred euro apart) rounds every compact tick to the same
  // «€30k»: below ten thousand euro of span the ticks print the full amount instead.
  const values = points.map((p) => p.totalNetWorth);
  const isNarrowRange = values.length > 0 && Math.max(...values) - Math.min(...values) < 10000;
  const formatTick = (value: number) => (isNarrowRange ? cachedFormatCurrencyEUR(value, true) : formatCurrencyCompact(value));

  return (
    <Tile eyebrow="Evoluzione" aside={aside} reading={reading} className={className} ariaLabel="Evoluzione del patrimonio">
      <OverviewAnimatedCurrency
        value={growth.latest.value}
        animateOnMount={true}
        className="mt-2.5 block font-mono text-[32px] font-bold leading-none tracking-[-0.03em] tabular-nums desktop:text-[36px]"
      />

      {/* The three chips, one grouped row from tablet up (The Grouped Chip Rule). */}
      <div className="mt-4 flex flex-col gap-2.5 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:gap-x-2.5 tablet:gap-y-2">
        {growth.snapshotCount > 1 && (
          <Chip value={growth.delta} caption="dal primo snapshot">
            <GrowthIcon className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
            {signed(growth.delta)}
            {growth.growthPct !== null && ` (${signedPct(growth.growthPct)})`}
          </Chip>
        )}
        {growth.cagr !== null && (
          <Chip value={growth.cagr} caption="versamenti inclusi, non un rendimento">
            {/* One string: a flex container drops the leading space of a separate text node. */}
            {`${signedPct(growth.cagr)} l'anno`}
          </Chip>
        )}
        {pace.trailingDelta !== null && (
          <Chip value={pace.trailingDelta} caption="ultimi 12 mesi">
            {signed(pace.trailingDelta)}
            {pace.trailingPct !== null && ` (${signedPct(pace.trailingPct)})`}
          </Chip>
        )}
      </div>

      {hasChart && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className={TILE_SUB_EYEBROW_CLASS}>
              Andamento · <span className="font-mono tabular-nums">{growth.snapshotCount}</span> rilevazioni
            </p>
            {noteCount > 0 && (
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground" aria-hidden="true">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--warning-foreground)' }} />
                con nota
              </span>
            )}
          </div>
          {/* The chart is the element that stretches: the container is absolute inside a flex-1 box,
              so the SVG's 100% height resolves against the row and never against its own ratio. */}
          <div className="relative mt-2 min-h-[220px] flex-1">
            <div className="absolute inset-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={points}
                  margin={{ top: 8, right: 20, left: 0, bottom: 0 }}
                  role="img"
                  aria-label={`Evoluzione del patrimonio da ${formatPeriodMonth(growth.first)} a ${formatPeriodMonth(growth.latest)}: da ${cachedFormatCurrencyEUR(growth.first.value, true)} a ${cachedFormatCurrencyEUR(growth.latest.value, true)}, ${growth.snapshotCount} rilevazioni.`}
                  accessibilityLayer={false}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" ticks={ticks} tickFormatter={ticks ? yearOfTick : undefined} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tickFormatter={formatTick} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={isNarrowRange ? 72 : 56} domain={['auto', 'auto']} />
                  <Tooltip content={<EvolutionTooltip />} cursor={{ stroke: 'var(--foreground)', strokeOpacity: 0.25, strokeWidth: 1 }} />
                  <Area
                    type="monotone"
                    dataKey="totalNetWorth"
                    name="Patrimonio"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    dot={renderNoteDot}
                    activeDot={{ r: 4, strokeWidth: 1.5, stroke: 'var(--foreground)', fill: 'var(--chart-1)' }}
                    isAnimationActive={!prefersReducedMotion}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      <div className={cn('flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground', hasChart ? 'mt-3.5' : 'mt-auto pt-4')}>
        <span>
          Il primo snapshot è {formatPeriodMonth(growth.first)} (<span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(growth.first.value, true)}</span>); ogni punto è la fotografia di fine mese.
        </span>
        <button
          type="button"
          onClick={onAddNote}
          disabled={disabled}
          aria-label={disabled ? 'Aggiungi una nota — non disponibile in modalità demo' : undefined}
          className="inline-flex min-h-11 items-center gap-1 text-[11px] text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 desktop:min-h-[28px]"
        >
          <MessageSquare className="h-3 w-3" aria-hidden="true" />
          <span className="font-mono tabular-nums">{noteCount}</span> {noteCount === 1 ? 'nota' : 'note'} · aggiungi una nota
        </button>
      </div>
    </Tile>
  );
}
