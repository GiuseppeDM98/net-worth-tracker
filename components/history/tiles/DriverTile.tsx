'use client';

/**
 * DRIVER DELLA CRESCITA — «da dove viene la crescita?»: for every year since the cashflow floor,
 * the year's growth split into savings (income minus spending already happened), the market
 * (measured instrument by instrument), the estimated tax on the sales, the mortgage principal
 * repaid, the pension contributions and the other changes — as flat rows with a split 3px bar of
 * the two engines; then the last twelve months as hand-written bars (savings, market and tax side
 * by side, a losing month drawn under the baseline), every part in the hover.
 *
 * The rows come from `lib/utils/growthDrivers.ts` (owner, 2026-09-19: the market used to be
 * «growth − savings», which charged it with the broker's withheld tax), filtered and summed in
 * `storicoSummary.ts`; the words from `describeDrivers`. Before the cashflow floor there are no
 * transactions, so the split is not shown there at all.
 */

import Link from 'next/link';
import type { Narrative } from '@/lib/utils/narrative';
import type { GrowthDrivers } from '@/lib/utils/growthDrivers';
import { resolveDriverShares, type DriverYear, type PeriodMonth } from '@/lib/utils/storicoSummary';
import { describeRunningWindowShort, formatPeriodMonth, type MonthlyDriverRow } from '@/lib/utils/storicoNarrative';
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
  total: GrowthDrivers | null;
  startYear: number;
  /** The first month whose market is measured per instrument (both snapshots with `byAsset`); null = none. */
  measuredSince: PeriodMonth | null;
  /** The rows inside the last `windowMonths` calendar months, chronological (a missing month stays a gap). */
  months: MonthlyDriverRow[];
  windowMonths: number;
  className?: string;
}

const TAX_COLOR = 'var(--chart-4)';

const isPrintedZero = (value: number) => Math.abs(Math.round(value)) < 1;
const signed = (value: number) => (isPrintedZero(value) ? cachedFormatCurrencyEUR(0, true) : `${value >= 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(value), true)}`);
const signedPct = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPercentage(Math.abs(value), 1)}`;

/**
 * The parts after the two engines, in the order the sentence says them; a part printed as zero is
 * dropped. The tax is a loss (coloured); the rest are flows (uncoloured, DESIGN → The Comma Rule).
 */
function restParts(row: Omit<GrowthDrivers, 'isMarketMeasured'>): Array<{ label: string; value: number; isLoss: boolean }> {
  return [
    { label: 'tasse', value: -row.taxes, isLoss: true },
    { label: 'mutuo', value: row.debtRepaid, isLoss: false },
    { label: 'fondo pensione', value: row.pensionContributions, isLoss: false },
    { label: 'altre', value: row.other, isLoss: false },
  ].filter((part) => !isPrintedZero(part.value));
}

// ─── Year rows ────────────────────────────────────────────────────────────────

/**
 * A year: the growth in euro and in percent of the baseline, the split bar of the two ENGINES
 * (savings and market, positive halves only — a negative half has no width), then every part in
 * the sub-line. A running year names its window («gen–set»): its savings are counted on those
 * months, up to today.
 */
function YearRow({ row, isRunning }: { row: DriverYear; isRunning: boolean }) {
  const positive = Math.max(row.netSavings, 0) + Math.max(row.market, 0);
  const savingsWidth = positive > 0 ? (Math.max(row.netSavings, 0) / positive) * 100 : 0;
  const marketWidth = positive > 0 ? (Math.max(row.market, 0) / positive) * 100 : 0;
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
          mercato <span className={row.market < 0 ? 'text-destructive' : undefined}>{signed(row.market)}</span>
          {shares && ` (${shares.market}%)`}
        </span>
        {restParts(row).map((part) => (
          <span key={part.label} className="contents">
            <span aria-hidden="true">·</span>
            <span className="whitespace-nowrap">
              {part.label} <span className={part.isLoss ? 'text-destructive' : undefined}>{signed(part.value)}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── The last twelve months ───────────────────────────────────────────────────

const VIEW_W = 600;
const VIEW_H = 160;
const HEAD_ROOM = 6;
const BAR_SHARE = 0.24;
const BAR_GAP = 0.04;

/**
 * Savings, market and the sale tax per month (DESIGN.md → In-tile Bars): never stacked, because the
 * market can be negative and a stack with a negative segment stops meeting its total. A losing
 * market month is drawn under the baseline in the loss token; the tax is always a loss and has its
 * own colour, so it is never read as the market's; a month of negative savings keeps the savings
 * colour under the baseline. The mortgage, the pension contributions and the other changes are in
 * the hover and the rows, not in the bars (owner, 2026-09-19): twelve months of five bars would not
 * fit a four-column tile. The last month is outlined, never the others dimmed.
 */
function DriverBars({ months, className }: { months: MonthlyDriverRow[]; className?: string }) {
  const maxPositive = Math.max(...months.flatMap((m) => [m.netSavings, m.market, 0]), 1);
  const maxNegative = Math.max(...months.map((m) => Math.max(-m.market, -m.netSavings, m.taxes, 0)), 0);
  const scale = (VIEW_H - HEAD_ROOM * 2) / (maxPositive + maxNegative);
  const baseline = HEAD_ROOM + maxPositive * scale;
  const slot = VIEW_W / months.length;
  const barWidth = slot * BAR_SHARE;
  const gap = slot * BAR_GAP;

  const hover = useChartHover(months.length, 'slot');
  const hovered = hover.index !== null ? months[hover.index] : null;

  const caption = (m: MonthlyDriverRow) => `${MONTH_NAMES[m.month - 1].toLowerCase()} ${m.year}`;
  const describe = (m: MonthlyDriverRow) =>
    [`risparmio ${signed(m.netSavings)}`, `mercato ${signed(m.market)}`, ...restParts(m).map((part) => `${part.label} ${signed(part.value)}`)].join(', ');
  const label = months.map((m) => `${caption(m)}: ${describe(m)}`).join('; ');

  const bar = (value: number, x: number, color: string, lossColor: string) => {
    const height = Math.abs(value) * scale;
    const y = value >= 0 ? baseline - height : baseline;
    return <rect x={x} y={y} width={barWidth} height={height} fill={value < 0 ? lossColor : color} />;
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight: 110 }} {...(hover.enabled ? hover.handlers : {})}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`Risparmio, mercato e tasse sulle vendite per mese, ultimi ${months.length} mesi. ${label}.`}>
          {hover.index !== null && <rect x={hover.index * slot} y={0} width={slot} height={VIEW_H} fill="var(--foreground)" opacity={0.06} />}
          {months.map((m, i) => {
            const groupWidth = barWidth * 3 + gap * 2;
            const x0 = i * slot + (slot - groupWidth) / 2;
            const isLast = i === months.length - 1;
            const top = baseline - Math.max(m.netSavings, m.market, 0) * scale;
            const bottom = baseline + Math.max(-m.netSavings, -m.market, m.taxes, 0) * scale;
            return (
              <g key={`${m.year}-${m.month}`}>
                <title>{`${caption(m)}: ${describe(m)}`}</title>
                {bar(m.netSavings, x0, 'var(--chart-2)', 'var(--chart-2)')}
                {bar(m.market, x0 + barWidth + gap, 'var(--chart-1)', 'var(--destructive)')}
                {m.taxes > 0 && bar(-m.taxes, x0 + (barWidth + gap) * 2, TAX_COLOR, TAX_COLOR)}
                {isLast && (
                  <rect x={x0 - 3} y={top - 3} width={groupWidth + 6} height={bottom - top + 6} fill="none" stroke="var(--foreground)" vectorEffect="non-scaling-stroke" />
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
              mercato <span className={cn('font-semibold', signTextClass(hovered.market))}>{signed(hovered.market)}</span>
            </span>
            {restParts(hovered).map((part) => (
              <span key={part.label} className="font-mono text-[12px] tabular-nums">
                {part.label} <span className={cn('font-semibold', part.isLoss && 'text-destructive')}>{signed(part.value)}</span>
              </span>
            ))}
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
      {item(TAX_COLOR, 'Tasse sulle vendite')}
    </div>
  );
}

/** «Dal 2025: +27.793 € dal risparmio (35%), +52.529 € dal mercato (65%), tasse −4091 € …» */
function TotalLine({ total, startYear }: { total: GrowthDrivers; startYear: number }) {
  const shares = resolveDriverShares(total);
  return (
    <>
      {' '}
      Dal {startYear}: <span className="font-mono tabular-nums text-foreground">{signed(total.netSavings)}</span> dal risparmio
      {shares && <span className="font-mono tabular-nums"> ({shares.savings}%)</span>},{' '}
      <span className={cn('font-mono tabular-nums', total.market < 0 ? 'text-destructive' : 'text-foreground')}>{signed(total.market)}</span> dal mercato
      {shares && <span className="font-mono tabular-nums"> ({shares.market}%)</span>}
      {restParts(total).map((part) => (
        <span key={part.label}>
          , {part.label} <span className={cn('font-mono tabular-nums', part.isLoss ? 'text-destructive' : 'text-foreground')}>{signed(part.value)}</span>
        </span>
      ))}
      .
    </>
  );
}

export function DriverTile({ reading, years, featured, total, startYear, measuredSince, months, windowMonths, className }: DriverTileProps) {
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
        Risparmio = entrate meno spese già avvenute; mercato = la variazione di prezzo di ogni strumento, dal prezzo dell&apos;operazione per quelli comprati o venduti nel mese
        {measuredSince ? ` (da ${formatPeriodMonth(measuredSince)}; prima, la crescita non spiegata dal risparmio)` : ' (qui la crescita non spiegata dal risparmio: mancano gli snapshot per strumento)'}; tasse = stima sulle plusvalenze vendute; mutuo = capitale rimborsato; altre = ciò che nessuna voce spiega, soprattutto saldi aggiornati in giorni diversi dalle spese (la carta di credito si addebita il mese dopo).
        {total && <TotalLine total={total} startYear={startYear} />}
      </p>
    </Tile>
  );
}
