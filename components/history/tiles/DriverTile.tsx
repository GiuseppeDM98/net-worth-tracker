'use client';

/**
 * DRIVER DELLA CRESCITA — «da dove viene la crescita?»: for every year since the cashflow floor,
 * the year's growth with a split 3px bar of the two engines, and behind each year a LEDGER — the
 * six parts as rows that add up in sight to the growth they close on (savings, the market
 * measured instrument by instrument, the estimated tax on the sales, the mortgage principal
 * repaid, the pension contributions, the other changes). The featured year opens on its ledger;
 * «Dal {startYear}» is one more row, not a footnote. Then the last twelve months as hand-written
 * bars (savings, market and tax side by side, a losing month drawn under the baseline), every
 * part in the hover and in a table for a screen reader.
 *
 * Until 2026-09-20 the parts were a sentence of eight figures, repeated as a wrapped sub-line per
 * year and again in the footer: the reader had to add them up to trust them. The rows come from
 * `lib/utils/growthDrivers.ts`, filtered and summed in `storicoSummary.ts`; the words and the
 * ledger's rows from `storicoNarrative.ts` (`describeDrivers`, `buildDriverLedger`). Before the
 * cashflow floor there are no transactions, so the split is not shown there at all.
 */

import { useId, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { GrowthDrivers } from '@/lib/utils/growthDrivers';
import { resolveDriverShares, type DriverYear, type PeriodMonth } from '@/lib/utils/storicoSummary';
import { buildDriverLedger, describeRunningWindowShort, formatPeriodMonth, type DriverLedgerRow, type MonthlyDriverRow } from '@/lib/utils/storicoNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { MONTH_NAMES } from '@/lib/constants/months';
import { MONTH_NAMES_SHORT } from '@/lib/utils/period';
import { signTextClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { TileMethodNote } from '@/components/ui/tile-method-note';
import { SeriesLegend, type SeriesLegendItem } from '@/components/ui/series-legend';
import { ChartHoverTip, useChartHover } from '@/components/ui/chart-hover';

interface DriverTileProps {
  reading: Narrative | null;
  /** Newest first, already floored at the cashflow start year. */
  years: DriverYear[];
  /** The year the reading is about. */
  featured: { row: DriverYear; isRunning: boolean } | null;
  /** The sum over `years`: the «Dal {startYear}» row, shown when it is more than one year. */
  total: GrowthDrivers | null;
  startYear: number;
  /** The first month whose market is measured per instrument (both snapshots with `byAsset`); null = none. */
  measuredSince: PeriodMonth | null;
  /** The rows inside the last `windowMonths` calendar months, chronological (a missing month stays a gap). */
  months: MonthlyDriverRow[];
  windowMonths: number;
  className?: string;
}

const SAVINGS_COLOR = 'var(--chart-2)';
const MARKET_COLOR = 'var(--chart-1)';
const TAX_COLOR = 'var(--chart-4)';

/** One entry per SERIES: the market's red is a state of its bar, not a fourth series. */
const BAR_LEGEND: readonly SeriesLegendItem[] = [
  { label: 'Risparmio', colors: [SAVINGS_COLOR] },
  { label: 'Mercato (rosso se in perdita)', colors: [MARKET_COLOR, 'var(--destructive)'] },
  { label: 'Tasse sulle vendite', colors: [TAX_COLOR] },
];

const isPrintedZero = (value: number) => Math.abs(Math.round(value)) < 1;
const signed = (value: number) => (isPrintedZero(value) ? cachedFormatCurrencyEUR(0, true) : `${value >= 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(value), true)}`);
const signedPct = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPercentage(Math.abs(value), 1)}`;

/**
 * The parts after the two engines, for the bars' hover; a part printed as zero is dropped. The
 * tax is a loss (coloured); the rest are flows (uncoloured, DESIGN → The Comma Rule).
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

/** The colour a ledger figure is printed in: a flow has none, the market and the total follow their sign, a loss is always one. */
function ledgerValueClass(row: DriverLedgerRow): string {
  if (isPrintedZero(row.value) || row.kind === 'flow') return 'text-foreground';
  if (row.kind === 'loss') return 'text-destructive';
  return signTextClass(row.value);
}

const LEDGER_SWATCH: Partial<Record<DriverLedgerRow['key'], string>> = { savings: SAVINGS_COLOR, market: MARKET_COLOR };

/** The parts as rows that add up to the closing one — the arithmetic in sight, so no sentence has to defend it. */
function Ledger({ parts }: { parts: Omit<GrowthDrivers, 'isMarketMeasured'> }) {
  return (
    <div className="flex flex-col pb-2.5 pl-[18px]">
      {buildDriverLedger(parts).map((row) => (
        <div key={row.key} className={cn('flex items-baseline justify-between gap-3 py-[3px]', row.kind === 'total' && 'mt-1 border-t border-border pt-1.5')}>
          <span className={cn('relative min-w-0 text-[12px]', row.kind === 'total' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
            {LEDGER_SWATCH[row.key] && <span className="absolute -left-[14px] top-[5px] inline-block h-2 w-2 rounded-[2px]" style={{ background: LEDGER_SWATCH[row.key] }} aria-hidden="true" />}
            {row.label}
          </span>
          <span className={cn('shrink-0 font-mono text-[12px] tabular-nums', row.kind === 'total' ? 'font-bold' : 'font-medium', ledgerValueClass(row))}>{signed(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

interface PeriodRowModel {
  id: string;
  title: string;
  /** «gen–set» on a running year: its savings are counted on those months, up to today. */
  window?: string;
  growthPct: number | null;
  parts: Omit<GrowthDrivers, 'isMarketMeasured'>;
}

/**
 * A period: its growth in euro and in percent of the baseline beside the split bar of the two
 * ENGINES (savings and market, positive halves only — a negative half has no width); the press
 * opens its ledger. The bar's shares are said to a screen reader WITH their referent («dei due
 * motori»), which is what a bare «20%» in a sentence lacked.
 */
function PeriodRow({ model, open, onToggle }: { model: PeriodRowModel; open: boolean; onToggle: () => void }) {
  const panelId = useId();
  const { parts } = model;
  const positive = Math.max(parts.netSavings, 0) + Math.max(parts.market, 0);
  const savingsWidth = positive > 0 ? (Math.max(parts.netSavings, 0) / positive) * 100 : 0;
  const marketWidth = positive > 0 ? (Math.max(parts.market, 0) / positive) * 100 : 0;
  const shares = resolveDriverShares(parts);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center gap-3 rounded-sm py-[9px] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring desktop:min-h-9"
      >
        <ChevronDown className={cn('h-3 w-3 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', !open && '-rotate-90')} aria-hidden="true" />
        <span className="shrink-0 whitespace-nowrap text-[13px] text-foreground">
          {model.title}
          {model.window && <span className="ml-1 font-mono text-[11px] tabular-nums text-muted-foreground">{model.window}</span>}
        </span>
        <span
          className="flex h-[3px] min-w-[32px] flex-1 overflow-hidden rounded-full bg-muted"
          role={shares ? 'img' : 'presentation'}
          aria-label={shares ? `Dei due motori: risparmio ${shares.savings}%, mercato ${shares.market}%` : undefined}
        >
          <span className="h-full" style={{ width: `${savingsWidth}%`, background: SAVINGS_COLOR }} />
          <span className="h-full" style={{ width: `${marketWidth}%`, background: MARKET_COLOR }} />
        </span>
        <span className={cn('shrink-0 text-right font-mono text-[13px] font-semibold tabular-nums', signTextClass(parts.netWorthGrowth))}>
          {signed(parts.netWorthGrowth)}
          {model.growthPct !== null && <span className="ml-1.5 text-[11px] font-normal">({signedPct(model.growthPct)})</span>}
        </span>
      </button>
      {/* Rows expanding into sub-rows: the CSS grid-rows technique, `inert` while closed (AGENTS → Motion). */}
      <div id={panelId} className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} inert={!open}>
        <div className="overflow-hidden">
          <Ledger parts={parts} />
        </div>
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
 *
 * The plot is a picture of twelve months × three bars: its `aria-label` names what is drawn and the
 * figures live in a visually hidden table after it — one concatenated label of 72 figures was
 * unreadable by ear, and the hover reaches neither a keyboard nor a touch screen.
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

  const bar = (value: number, x: number, color: string, lossColor: string) => {
    const height = Math.abs(value) * scale;
    const y = value >= 0 ? baseline - height : baseline;
    return <rect x={x} y={y} width={barWidth} height={height} fill={value < 0 ? lossColor : color} />;
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="relative flex-1" style={{ minHeight: 110 }} {...(hover.enabled ? hover.handlers : {})}>
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`Risparmio, mercato e tasse sulle vendite per mese, ultimi ${months.length} mesi: i valori sono nella tabella che segue.`}>
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
                {bar(m.netSavings, x0, SAVINGS_COLOR, SAVINGS_COLOR)}
                {bar(m.market, x0 + barWidth + gap, MARKET_COLOR, 'var(--destructive)')}
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
      <table className="sr-only">
        <caption>Le parti della crescita mese per mese, ultimi {months.length} mesi</caption>
        <thead>
          <tr>
            <th scope="col">Mese</th>
            <th scope="col">Risparmio</th>
            <th scope="col">Mercato</th>
            <th scope="col">Tasse sulle vendite</th>
            <th scope="col">Mutuo rimborsato</th>
            <th scope="col">Versamenti al fondo pensione</th>
            <th scope="col">Altre variazioni</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <tr key={`${m.year}-${m.month}`}>
              <th scope="row">{caption(m)}</th>
              <td>{signed(m.netSavings)}</td>
              <td>{signed(m.market)}</td>
              <td>{signed(-m.taxes)}</td>
              <td>{signed(m.debtRepaid)}</td>
              <td>{signed(m.pensionContributions)}</td>
              <td>{signed(m.other)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

export function DriverTile({ reading, years, featured, total, startYear, measuredSince, months, windowMonths, className }: DriverTileProps) {
  const hasYears = years.length > 0;
  // The featured year opens on its ledger; every row toggles on its own, so two years can be compared.
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set(featured ? [featured.row.year] : []));
  const toggle = (id: string) =>
    setOpenIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: PeriodRowModel[] = years.map((row) => ({
    id: row.year,
    title: row.year,
    window: featured?.isRunning === true && featured.row.year === row.year ? describeRunningWindowShort(row) : undefined,
    growthPct: row.growthPct,
    parts: row,
  }));
  // One year IS the total: the sum earns its row only from the second year on.
  if (total && years.length > 1) rows.push({ id: 'total', title: `Dal ${startYear}`, growthPct: null, parts: total });

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
          <div className="mt-3 flex flex-col divide-y divide-border border-t border-border">
            {rows.map((model) => (
              <PeriodRow key={model.id} model={model} open={openIds.has(model.id)} onToggle={() => toggle(model.id)} />
            ))}
          </div>
          {months.length > 0 && (
            <>
              <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1.5 border-t border-border pt-3.5">
                <p className={TILE_SUB_EYEBROW_CLASS}>
                  Ultimi {windowMonths} mesi
                  {months.length < windowMonths && <> · {months.length} con dati</>}
                </p>
                <SeriesLegend items={BAR_LEGEND} />
              </div>
              <DriverBars months={months} className="mt-2.5 flex-1" />
            </>
          )}
        </>
      )}

      <TileMethodNote
        subject="Driver della crescita"
        summary={
          hasYears
            ? measuredSince
              ? `Le voci di ogni anno sommano alla sua crescita; il mercato è misurato strumento per strumento da ${formatPeriodMonth(measuredSince)}.`
              : 'Le voci di ogni anno sommano alla sua crescita; mancano gli snapshot per strumento, quindi il mercato è la crescita che il risparmio non spiega.'
            : undefined
        }
      >
        <span>
          <strong className="font-medium text-foreground">Risparmio</strong>: entrate meno spese già avvenute; le righe ancora in calendario non contano.
        </span>
        <span>
          <strong className="font-medium text-foreground">Mercato</strong>: la variazione di prezzo di ogni strumento, dal prezzo dell&apos;operazione per quelli comprati o venduti nel mese
          {measuredSince ? `. Prima di ${formatPeriodMonth(measuredSince)} è la crescita che il risparmio non spiega.` : '.'}
        </span>
        <span>
          <strong className="font-medium text-foreground">Tasse sulle vendite</strong>: una stima sulle plusvalenze realizzate. <strong className="font-medium text-foreground">Mutuo rimborsato</strong>: la quota capitale delle rate, che resta nel patrimonio.
        </span>
        <span>
          <strong className="font-medium text-foreground">Altre variazioni</strong>: ciò che nessuna voce spiega, soprattutto saldi aggiornati in giorni diversi dalle spese (la carta di credito si addebita il mese dopo).
        </span>
      </TileMethodNote>
    </Tile>
  );
}
