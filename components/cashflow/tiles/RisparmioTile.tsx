'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { MonthFlow, SavingsHistory } from '@/lib/utils/tracciamentoSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { SAVINGS_RATE_FLOOR } from '@/lib/utils/savingsRate';
import { describeSavingsBar } from '@/lib/utils/cashflowNarrative';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';
import { cn } from '@/lib/utils';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface RisparmioTileProps {
  history: SavingsHistory;
  /** The window as the narrative names it: «ultimi 12 mesi», or its bounds when anchored on a past period. */
  aside: Narrative;
  reading: Narrative | null;
  /** The footer line: how many of the measured months closed in deficit. */
  footer: Narrative | null;
  /** The month the page is about, drawn at full strength. */
  highlightKey: string | null;
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  /** What the closed row says beside its eyebrow («mese per mese»). */
  asideWhenClosed?: string;
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 120;
/** Share of a month's slot the bar takes; the rest is the gap. */
const BAR_SHARE = 0.8;

/**
 * One bar per month of savings rate, a deficit drawn below the baseline, the average as a
 * dashed line that the reading names («In media il 31%») — a label on the plot would paint
 * over whichever bar stands at the edge. The scale reaches below zero only when a month is
 * negative, so a history of surpluses uses the full height. A month below the savings floor, or
 * spending without income (2026-11-12), is a bar from 0 to the floor in full `--destructive` —
 * the floor then sits on the plot's bottom edge, so one month of −16.567% never flattens the
 * others; the reduced fill is reserved for a window still running (DESIGN.md), and a deficit is
 * not one. A month after today's draws no bar: it is not judged. Hand-written SVG
 * (`preserveAspectRatio="none"`, labels outside the plot), like the hero's bars.
 */
function SavingsRateBars({ history, highlightKey }: { history: SavingsHistory; highlightKey: string | null }) {
  const futureKeys = new Set(history.futureMonths.map((m) => m.key));
  const isFuture = (m: MonthFlow) => futureKeys.has(m.key);
  const isFloorMonth = (m: MonthFlow) => !isFuture(m) && (m.reading.kind === 'deficit' || m.reading.kind === 'no-income');
  const rates = history.months.filter((m) => !isFuture(m)).map((m) => m.savingsRate ?? 0);
  const top = Math.max(...rates, history.average ?? 0, 1);
  const bottom = history.months.some(isFloorMonth) ? SAVINGS_RATE_FLOOR : Math.min(...rates, 0);
  const span = top - bottom;
  const yOf = (rate: number) => ((top - rate) / span) * VIEW_H;
  const baseline = yOf(0);
  const slot = VIEW_W / history.months.length;
  const barWidth = slot * BAR_SHARE;

  const textOf = (m: MonthFlow) => describeSavingsBar(m.reading, m.label, isFuture(m));
  const label = history.months.map(textOf).join('; ');

  // A mouse over a month reads its rate and the two figures behind it (desktop only).
  const hover = useChartHover(history.months.length, 'slot');
  const hovered = hover.index !== null ? history.months[hover.index] : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="relative min-h-[110px] flex-1" {...(hover.enabled ? hover.handlers : {})}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Tasso di risparmio per mese. ${label}`}
        >
          {hover.index !== null && (
            <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />
          )}
          {history.months.map((month, i) => {
            if (isFuture(month)) return null;
            const rate = isFloorMonth(month) ? SAVINGS_RATE_FLOOR : month.savingsRate;
            if (rate === null) return null;
            const y = rate >= 0 ? yOf(rate) : baseline;
            const height = Math.abs(yOf(rate) - baseline);
            return (
              <g key={month.key}>
                <title>{textOf(month)}</title>
                <rect
                  x={i * slot + (slot - barWidth) / 2}
                  y={y}
                  width={barWidth}
                  height={height}
                  fill={rate < 0 ? 'var(--destructive)' : 'var(--chart-2)'}
                  stroke={month.key === highlightKey ? 'var(--foreground)' : 'none'}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
          <line x1={0} y1={baseline} x2={VIEW_W} y2={baseline} stroke="var(--border)" vectorEffect="non-scaling-stroke" />
          {history.average !== null && (
            <line
              x1={0}
              y1={yOf(history.average)}
              x2={VIEW_W}
              y2={yOf(history.average)}
              stroke="var(--foreground)"
              strokeOpacity={0.6}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / history.months.length} label={`${hovered.label} ${hovered.year}`}>
            <span
              className={cn(
                'font-mono text-[13px] font-semibold tabular-nums',
                isFloorMonth(hovered) || (hovered.savingsRate !== null && hovered.savingsRate < 0 && !isFuture(hovered))
                  ? 'text-destructive'
                  : hovered.savingsRate === null || isFuture(hovered)
                    ? 'text-muted-foreground'
                    : 'text-positive',
              )}
            >
              {textOf(hovered)}
            </span>
            <span className="font-mono tabular-nums text-muted-foreground">
              entrate {cachedFormatCurrencyEUR(hovered.income, true)} · spese {cachedFormatCurrencyEUR(hovered.expenses, true)}
            </span>
          </ChartHoverTip>
        )}
      </div>
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${history.months.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {history.months.map((month) => (
          <span
            key={month.key}
            className={cn('text-center font-mono text-[10px] tabular-nums', month.key === highlightKey ? 'font-semibold text-foreground' : 'text-muted-foreground')}
          >
            {month.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * "Quanto metto da parte, mese dopo mese?" — the savings rate of the trailing twelve months
 * (`summarizeSavingsHistory`), read as average, best and worst, drawn as bars around the
 * average. A month without any movement draws no bar: a missing denominator is not a zero.
 */
export function RisparmioTile({ history, aside, reading, footer, highlightKey, collapse, asideWhenClosed, className }: RisparmioTileProps) {
  return (
    <Tile eyebrow="Risparmio nel tempo" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} collapse={collapse} asideWhenClosed={asideWhenClosed} className={className}>
      {history.measuredCount === 0 && history.deficitMonths.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Nessun mese con entrate nella finestra.</p>
      ) : (
        <div className="mt-3 mb-3.5 flex flex-1 flex-col">
          <SavingsRateBars history={history} highlightKey={highlightKey} />
        </div>
      )}
      {footer && (
        <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground" figureClassName="font-medium" />
      )}
    </Tile>
  );
}
