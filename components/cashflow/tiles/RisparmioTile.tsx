'use client';

import type { Narrative } from '@/lib/utils/narrative';
import type { SavingsHistory } from '@/lib/utils/tracciamentoSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';
import { formatPercentage } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
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
  className?: string;
}

const VIEW_W = 600;
const VIEW_H = 120;
/** Share of a month's slot the bar takes; the rest is the gap. */
const BAR_SHARE = 0.8;

/**
 * One bar per month of savings rate, a deficit drawn below the baseline, the average as a
 * dashed line that the reading names («In media il 31%») — a label on the plot would paint
 * over whichever bar stands at the edge. The scale is symmetric around zero only when a month
 * is negative, so a history of surpluses uses the full height. Hand-written SVG
 * (`preserveAspectRatio="none"`, labels outside the plot), like the hero's bars.
 */
function SavingsRateBars({ history, highlightKey }: { history: SavingsHistory; highlightKey: string | null }) {
  const rates = history.months.map((m) => m.savingsRate ?? 0);
  const top = Math.max(...rates, history.average ?? 0, 1);
  const bottom = Math.min(...rates, 0);
  const span = top - bottom;
  const yOf = (rate: number) => ((top - rate) / span) * VIEW_H;
  const baseline = yOf(0);
  const slot = VIEW_W / history.months.length;
  const barWidth = slot * BAR_SHARE;

  // The typographic minus, as everywhere on the page (The Comma Rule).
  const rateText = (rate: number) => `${rate < 0 ? '−' : ''}${formatPercentage(Math.abs(rate), 0)}`;
  const label = history.months
    .map((m) => `${m.label}: ${m.savingsRate === null ? 'nessuna entrata' : rateText(m.savingsRate)}`)
    .join('; ');

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
            if (month.savingsRate === null) return null;
            const rate = month.savingsRate;
            const y = rate >= 0 ? yOf(rate) : baseline;
            const height = Math.abs(yOf(rate) - baseline);
            return (
              <g key={month.key}>
                <title>{`${month.label}: ${rateText(rate)}`}</title>
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
            <span className={cn('font-mono text-[13px] font-semibold tabular-nums', hovered.savingsRate === null ? 'text-muted-foreground' : hovered.savingsRate < 0 ? 'text-destructive' : 'text-positive')}>
              {hovered.savingsRate === null ? 'nessuna entrata' : rateText(hovered.savingsRate)}
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
 * average. Months without income draw no bar: a missing denominator is not a zero.
 */
export function RisparmioTile({ history, aside, reading, footer, highlightKey, className }: RisparmioTileProps) {
  return (
    <Tile eyebrow="Risparmio nel tempo" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className}>
      {history.measuredCount === 0 ? (
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
