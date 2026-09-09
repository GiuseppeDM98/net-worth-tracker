'use client';

/**
 * DRIVER DELLA CRESCITA — «da dove viene la crescita?»: for every year since the cashflow floor,
 * the year's growth split between savings (income minus spending) and the market (what the
 * savings do not explain), as flat rows with a split 3px bar; then the last twelve months as
 * hand-written bars (savings beside market, a losing month drawn under the baseline).
 *
 * The yearly and monthly rows come from chartService (`prepareSavingsVsInvestmentData`,
 * `prepareSavingsVsInvestmentDataAllMonths`), filtered and summed in `storicoSummary.ts`; the
 * words from `describeDrivers`. Before the cashflow floor there are no transactions, so the
 * split is not shown there at all — "market = everything" would be a lie, not a number.
 */

import Link from 'next/link';
import type { Narrative } from '@/lib/utils/narrative';
import { resolveDriverShares, type DriverYear } from '@/lib/utils/storicoSummary';
import { describeRunningWindowShort, type MonthlyDriverRow } from '@/lib/utils/storicoNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

interface DriverTileProps {
  reading: Narrative | null;
  /** Newest first, already floored at the cashflow start year. */
  years: DriverYear[];
  /** The year the reading is about. */
  featured: { row: DriverYear; isRunning: boolean } | null;
  /** The sum over `years`, for the footer. */
  total: Pick<DriverYear, 'netSavings' | 'investmentGrowth' | 'netWorthGrowth'> | null;
  startYear: number;
  /** The rows inside the last `windowMonths` calendar months, chronological (a missing month stays a gap). */
  months: MonthlyDriverRow[];
  windowMonths: number;
  className?: string;
}

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(value), true)}`;
const signedPct = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPercentage(Math.abs(value), 1)}`;

// ─── Year rows ────────────────────────────────────────────────────────────────

/**
 * A year: the growth in euro and in percent of the baseline, the split bar with the two positive
 * halves as shares of what was ADDED (a negative half has no width — a share of a mixed-sign
 * total means nothing — and reads in the sub-line), then each driver with its share when both
 * added. A running year names its window («gen–ago»): its savings are counted on those months.
 */
function YearRow({ row, isRunning }: { row: DriverYear; isRunning: boolean }) {
  const positive = Math.max(row.netSavings, 0) + Math.max(row.investmentGrowth, 0);
  const savingsWidth = positive > 0 ? (Math.max(row.netSavings, 0) / positive) * 100 : 0;
  const marketWidth = positive > 0 ? (Math.max(row.investmentGrowth, 0) / positive) * 100 : 0;
  const shares = resolveDriverShares(row);
  return (
    <div className="flex flex-col gap-1.5 py-[9px]">
      <div className="flex items-center gap-3">
        <span className="w-[84px] shrink-0 text-[13px] text-foreground">
          {row.year}
          {isRunning && <span className="ml-1 font-mono text-[11px] tabular-nums text-muted-foreground">{describeRunningWindowShort(row)}</span>}
        </span>
        <div className="flex h-[3px] min-w-[40px] flex-1 overflow-hidden rounded-full bg-muted" role="presentation">
          <div className="h-full" style={{ width: `${savingsWidth}%`, background: 'var(--chart-2)' }} />
          <div className="h-full" style={{ width: `${marketWidth}%`, background: 'var(--chart-1)' }} />
        </div>
        <span className={cn('shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums', signTextClass(row.netWorthGrowth))}>
          {signed(row.netWorthGrowth)}
          {row.growthPct !== null && <span className="ml-1.5 text-[11px] font-normal">({signedPct(row.growthPct)})</span>}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-2 font-mono text-[11px] tabular-nums text-muted-foreground">
        <span className="whitespace-nowrap">
          risparmio {row.netSavings < 0 ? '−' : ''}{cachedFormatCurrencyEUR(Math.abs(row.netSavings), true)}
          {shares && ` (${shares.savings}%)`}
        </span>
        <span aria-hidden="true">·</span>
        <span className="whitespace-nowrap">
          mercato <span className={row.investmentGrowth < 0 ? 'text-destructive' : undefined}>{signed(row.investmentGrowth)}</span>
          {shares && ` (${shares.market}%)`}
        </span>
      </div>
    </div>
  );
}

// ─── The last twelve months ───────────────────────────────────────────────────

const VIEW_W = 600;
const VIEW_H = 160;
const HEAD_ROOM = 6;
const BAR_SHARE = 0.34;
const BAR_GAP = 0.06;

/**
 * Savings beside market per month (DESIGN.md → In-tile Bars): never stacked, because the market
 * can be negative and a stack with a negative segment stops meeting its total. A losing market
 * month is drawn under the baseline in the loss token; a month of negative savings keeps the
 * savings colour under the baseline (the position carries the sign, and the legend has one loss
 * entry: the market's); the last month is outlined, never the others dimmed.
 */
function DriverBars({ months, className }: { months: MonthlyDriverRow[]; className?: string }) {
  const maxPositive = Math.max(...months.flatMap((m) => [m.netSavings, m.investmentGrowth, 0]), 1);
  const maxNegative = Math.max(...months.map((m) => Math.max(-m.investmentGrowth, -m.netSavings, 0)), 0);
  const scale = (VIEW_H - HEAD_ROOM * 2) / (maxPositive + maxNegative);
  const baseline = HEAD_ROOM + maxPositive * scale;
  const slot = VIEW_W / months.length;
  const barWidth = slot * BAR_SHARE;

  const hover = useChartHover(months.length, 'slot');
  const hovered = hover.index !== null ? months[hover.index] : null;

  const caption = (m: MonthlyDriverRow) => `${MONTH_NAMES[m.month - 1].toLowerCase()} ${m.year}`;
  const label = months.map((m) => `${caption(m)}: risparmio ${signed(m.netSavings)}, mercato ${signed(m.investmentGrowth)}`).join('; ');

  const bar = (value: number, x: number, color: string, lossColor: string) => {
    const height = Math.abs(value) * scale;
    const y = value >= 0 ? baseline - height : baseline;
    return <rect x={x} y={y} width={barWidth} height={height} fill={value < 0 ? lossColor : color} />;
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight: 110 }} {...(hover.enabled ? hover.handlers : {})}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`Risparmio e mercato per mese, ultimi ${months.length} mesi. ${label}.`}>
          {hover.index !== null && <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />}
          {months.map((m, i) => {
            const x0 = i * slot + (slot - barWidth * 2 - slot * BAR_GAP) / 2;
            const isLast = i === months.length - 1;
            const top = baseline - Math.max(m.netSavings, m.investmentGrowth, 0) * scale;
            const bottom = baseline + Math.max(-m.netSavings, -m.investmentGrowth, 0) * scale;
            return (
              <g key={`${m.year}-${m.month}`}>
                <title>{`${caption(m)}: risparmio ${signed(m.netSavings)}, mercato ${signed(m.investmentGrowth)}`}</title>
                {bar(m.netSavings, x0, 'var(--chart-2)', 'var(--chart-2)')}
                {bar(m.investmentGrowth, x0 + barWidth + slot * BAR_GAP, 'var(--chart-1)', 'var(--destructive)')}
                {isLast && (
                  <rect x={x0 - 3} y={top - 3} width={barWidth * 2 + slot * BAR_GAP + 6} height={bottom - top + 6} fill="none" stroke="var(--foreground)" vectorEffect="non-scaling-stroke" />
                )}
              </g>
            );
          })}
          <line x1={0} y1={baseline} x2={VIEW_W} y2={baseline} stroke="var(--foreground)" strokeOpacity={0.6} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        </svg>
        {hovered && hover.index !== null && (
          <ChartHoverTip x={(hover.index + 0.5) / months.length} label={caption(hovered)}>
            <span className="font-mono text-[12px] tabular-nums">
              risparmio <span className={cn('font-semibold', signTextClass(hovered.netSavings))}>{signed(hovered.netSavings)}</span>
            </span>
            <span className="font-mono text-[12px] tabular-nums">
              mercato <span className={cn('font-semibold', signTextClass(hovered.investmentGrowth))}>{signed(hovered.investmentGrowth)}</span>
            </span>
          </ChartHoverTip>
        )}
      </div>
      <div className="mt-1.5 grid" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {months.map((m, i) => (
          <span key={`${m.year}-${m.month}`} className={cn('text-center font-mono text-[10px] tabular-nums', i === months.length - 1 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
            {MONTH_NAMES_SHORT[m.month - 1].toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function Legend() {
  const item = (color: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: color }} />
      {label}
    </span>
  );
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground" aria-hidden="true">
      {item('var(--chart-2)', 'Risparmio')}
      {item('var(--chart-1)', 'Mercato')}
      {item('var(--destructive)', 'Mercato in perdita')}
    </div>
  );
}

export function DriverTile({ reading, years, featured, total, startYear, months, windowMonths, className }: DriverTileProps) {
  const hasYears = years.length > 0;
  return (
    <Tile eyebrow="Driver della crescita" aside={hasYears ? `dal ${startYear} · cashflow` : undefined} reading={reading} className={className} ariaLabel="Driver della crescita">
      {!hasYears ? (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
          La scomposizione parte dal {startYear}, l&apos;anno da cui il cashflow è completo: senza entrate e spese registrate non si può dire quanto è risparmio e quanto è mercato.{' '}
          <Link href="/dashboard/cashflow" className="text-foreground underline-offset-2 hover:underline">
            Vai al Cashflow
          </Link>
        </p>
      ) : (
        <>
          <Legend />
          <div className="mt-2 flex flex-col divide-y divide-border border-t border-border">
            {years.map((row) => (
              <YearRow key={row.year} row={row} isRunning={featured?.isRunning === true && featured.row.year === row.year} />
            ))}
          </div>
          {months.length > 0 && (
            <>
              <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mt-4')}>
                Ultimi {windowMonths} mesi
                {months.length < windowMonths && <> · {months.length} con dati</>}
              </p>
              <DriverBars months={months} className="mt-2 flex-1" />
            </>
          )}
        </>
      )}

      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        Risparmio = entrate meno spese del cashflow; mercato = crescita del patrimonio non spiegata dal risparmio.
        {total && (
          <>
            {' '}
            Dal {startYear}: <span className="font-mono tabular-nums text-foreground">{signed(total.netSavings)}</span> dal risparmio
            {resolveDriverShares(total) && <span className="font-mono tabular-nums"> ({resolveDriverShares(total)!.savings}%)</span>},{' '}
            <span className={cn('font-mono tabular-nums', total.investmentGrowth < 0 ? 'text-destructive' : 'text-foreground')}>{signed(total.investmentGrowth)}</span> dal mercato
            {resolveDriverShares(total) && <span className="font-mono tabular-nums"> ({resolveDriverShares(total)!.market}%)</span>}. Un anno in corso conta il risparmio degli stessi mesi della crescita.
          </>
        )}
      </p>
    </Tile>
  );
}
