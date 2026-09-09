'use client';

/**
 * «Dettaglio», below the grid behind a disclosure: the four chapters the old page carried in
 * full — the year-over-year variation, savings and market month by month over the whole
 * history, the labor-vs-investments recap (when the labor categories are configured) and the
 * notes — at the tile's cadence. Closed by default: the verdict and the five tiles already
 * answer the page's question; this is the reference material.
 *
 * Nothing is fetched here: the rows come from chartService through the page, the words from
 * `storicoNarrative.ts`, so no figure can disagree with the grid.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, MessageSquare, Settings } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Narrative } from '@/lib/utils/narrative';
import type { PeriodMonth } from '@/lib/utils/storicoSummary';
import { describeLabor, describeLaborTaxes, describeLaborWindow, describeMonthlyDrivers, describeNotes, describeOtherIncome, describeYearlyVariation, DIVIDENDS_OUTSIDE_CASHFLOW, formatPeriodMonth, type LaborMetricsInput, type MonthlyDriverRow, type YearlyVariationRow } from '@/lib/utils/storicoNarrative';
import { NarrativeText } from '@/components/ui/narrative-text';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatCurrency, formatCurrencyCompact, formatPercentage, type prepareMonthlyLaborMetricsData } from '@/lib/services/chartService';
import { signTextClass } from '@/lib/utils/metricColors';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tile, TILE_CELL_CLASS, TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { AsideToggle } from '@/components/ui/aside-toggle';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import LaborMetricsChart from '@/components/dashboard/LaborMetricsChart';

export interface StoricoNote extends PeriodMonth {
  note: string;
}

/**
 * The «Lavoro e investimenti» figures: the cumulative recap over every Driver year («Dal 2025»),
 * one recap per year for the Select, the monthly series under the rows, and whether the settings
 * carry a dividend category (without it the receipts never reach the cashflow and stay in «Mercato»).
 */
export interface LaborTileData {
  all: LaborMetricsInput;
  /** Newest first, as the Driver lists its years. */
  years: Array<{ year: number; metrics: LaborMetricsInput }>;
  chartData: ReturnType<typeof prepareMonthlyLaborMetricsData>;
  hasDividendCategory: boolean;
}

interface StoricoDettaglioProps {
  currentYear: number;
  /** The cashflow floor: the monthly rows start there, and the tile says so. */
  startYear: number;
  yearlyVariation: YearlyVariationRow[];
  /** Every month with a previous-month baseline, chronological. */
  monthlyDrivers: MonthlyDriverRow[];
  /** The years a month row exists for, newest first. */
  driverYears: number[];
  labor: LaborTileData | null;
  /** Newest first. */
  notes: StoricoNote[];
  snapshotCount: number;
  onAddNote: () => void;
  /** Demo mode: the note dialog would write into the shared demo snapshots. */
  disabled?: boolean;
}

const TOOLTIP_CONTENT_STYLE = { backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--card-foreground)', fontSize: 12 } as const;
const TOOLTIP_LABEL_STYLE = { color: 'var(--card-foreground)', fontWeight: 600 } as const;
const TOOLTIP_ITEM_STYLE = { color: 'var(--card-foreground)' } as const;
const CURSOR_FILL = { fill: 'var(--foreground)', fillOpacity: 0.06 } as const;

type YoyUnit = 'eur' | 'pct';
const YOY_UNITS: ReadonlyArray<{ value: YoyUnit; label: string }> = [
  { value: 'eur', label: '€' },
  { value: 'pct', label: '%' },
];

const signed = (value: number) => `${value >= 0 ? '+' : '−'}${cachedFormatCurrencyEUR(Math.abs(value), true)}`;

// ─── Variazione anno su anno ──────────────────────────────────────────────────

function YearlyVariationTile({ rows, currentYear }: { rows: YearlyVariationRow[]; currentYear: number }) {
  const [unit, setUnit] = useState<YoyUnit>('eur');
  const chartColors = useChartColors();
  const prefersReducedMotion = useReducedMotion();
  const reading = useMemo(() => describeYearlyVariation(rows, currentYear), [rows, currentYear]);
  const format = (value: number) => (unit === 'pct' ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatPercentage(Math.abs(value), 1)}` : signed(value));

  return (
    <Tile eyebrow="Variazione anno su anno" aside={<AsideToggle options={YOY_UNITS} value={unit} onChange={setUnit} ariaLabel="Unità della variazione" />} reading={reading}>
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">Nessuno storico disponibile.</p>
      ) : (
        <div className="mt-3 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={rows}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              role="img"
              aria-label={`Variazione del patrimonio per anno. ${rows.map((r) => `${r.year}: ${signed(r.variation)}`).join('; ')}.`}
              accessibilityLayer={false}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => (unit === 'pct' ? `${Math.round(v)}%` : formatCurrencyCompact(v))} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={52} />
              <Tooltip
                formatter={(value) => (typeof value === 'number' ? format(value) : '—')}
                labelFormatter={(year) => `Anno ${year}`}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={CURSOR_FILL}
              />
              <Bar dataKey={unit === 'pct' ? 'variationPercentage' : 'variation'} name="Variazione" fill={chartColors[0] ?? 'var(--chart-1)'} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out">
                {rows.map((row) => (
                  // A running year is drawn softer: real, but not comparable with the closed ones.
                  <Cell key={row.year} fill={row.variation >= 0 ? (chartColors[0] ?? 'var(--chart-1)') : 'var(--destructive)'} fillOpacity={Number(row.year) === currentYear ? 0.55 : 1} stroke={Number(row.year) === currentYear ? 'var(--foreground)' : undefined} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        Ogni anno è misurato da dicembre dell&apos;anno prima al suo ultimo snapshot (dal primo snapshot per il primo anno); l&apos;anno in corso è disegnato più chiaro perché non è confrontabile con quelli chiusi.
      </p>
    </Tile>
  );
}

// ─── Risparmio e mercato per mese ─────────────────────────────────────────────

function MonthlyDriversTile({ rows, years, startYear }: { rows: MonthlyDriverRow[]; years: number[]; startYear: number }) {
  const [year, setYear] = useState<'all' | number>('all');
  const chartColors = useChartColors();
  const prefersReducedMotion = useReducedMotion();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const shown = useMemo(() => (year === 'all' ? rows : rows.filter((r) => r.year === year)), [rows, year]);
  const data = useMemo(() => shown.map((r) => ({ ...r, period: `${formatPeriodMonth(r).slice(0, 3)} ${String(r.year).slice(2)}` })), [shown]);
  const reading = useMemo(() => describeMonthlyDrivers(shown), [shown]);

  const aside =
    years.length > 0 ? (
      <Select value={String(year)} onValueChange={(v) => setYear(v === 'all' ? 'all' : Number(v))}>
        <SelectTrigger size="sm" className="gap-1.5 px-2.5 text-[11px] font-medium text-foreground data-[size=sm]:h-11 desktop:data-[size=sm]:h-7" aria-label="Anno">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Dal {startYear}</SelectItem>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : undefined;

  return (
    <Tile eyebrow="Risparmio e mercato per mese" aside={aside} reading={reading}>
      {data.length === 0 ? (
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">Nessun mese con lo snapshot del mese prima: la scomposizione parte dal secondo snapshot consecutivo.</p>
      ) : (
        <div className="mt-3 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              role="img"
              aria-label={`Risparmio e mercato per mese. ${data.map((r) => `${formatPeriodMonth(r)}: risparmio ${signed(r.netSavings)}, mercato ${signed(r.investmentGrowth)}`).join('; ')}.`}
              accessibilityLayer={false}
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="period" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={isMobile ? 40 : 24} />
              <YAxis tickFormatter={(v: number) => formatCurrencyCompact(v)} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} width={52} />
              <Tooltip
                formatter={(value, name) => [typeof value === 'number' ? formatCurrency(value) : '—', name]}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={CURSOR_FILL}
              />
              <Bar dataKey="netSavings" name="Risparmio" fill={chartColors[1] ?? 'var(--chart-2)'} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out" />
              <Bar dataKey="investmentGrowth" name="Mercato" fill={chartColors[0] ?? 'var(--chart-1)'} isAnimationActive={!prefersReducedMotion} animationDuration={600} animationEasing="ease-out">
                {data.map((row) => (
                  <Cell key={`${row.year}-${row.month}`} fill={row.investmentGrowth >= 0 ? (chartColors[0] ?? 'var(--chart-1)') : 'var(--destructive)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        <span>Stessa scomposizione del Driver, mese per mese, dal {startYear} (l&apos;anno da cui il cashflow è completo); un mese senza il cashflow conta tutto come mercato.</span>
        <span className="flex gap-3" aria-hidden="true">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-2)' }} />
            Risparmio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-1)' }} />
            Mercato
          </span>
        </span>
      </div>
    </Tile>
  );
}

// ─── Lavoro e investimenti ────────────────────────────────────────────────────

/** A figure under a euro is neither a gain nor a loss: no sign, no colour (the sign is decided on the PRINTED value). */
const isPrintedZero = (value: number) => Math.abs(Math.round(value)) < 1;
const signedOrZero = (value: number) => (isPrintedZero(value) ? cachedFormatCurrencyEUR(0, true) : signed(value));
/** A figure inside an 11px caption keeps the Mono Mandate. */
const Mono = ({ value }: { value: number }) => <span className="font-mono tabular-nums">{cachedFormatCurrencyEUR(Math.abs(value), true)}</span>;

type LaborRowTone = 'cause' | 'total';

/**
 * One cause of the growth (signed and coloured on the printed value) or the total they add up
 * to (bold, the closing row of a Ranked Rows with Residual list — DESIGN.md).
 */
function LaborRow({ label, caption, value, tone = 'cause' }: { label: string; caption: React.ReactNode; value: number; tone?: LaborRowTone }) {
  return (
    <div className="flex items-center justify-between gap-3 py-[9px]">
      <span className="min-w-0">
        <span className={cn('block text-[13px] text-foreground', tone === 'total' && 'font-semibold')}>{label}</span>
        <span className="block text-[11px] text-muted-foreground">{caption}</span>
      </span>
      <span className={cn('shrink-0 font-mono text-[15px] tabular-nums', tone === 'total' ? 'font-bold' : 'font-semibold', isPrintedZero(value) ? 'text-foreground' : signTextClass(value))}>{signedOrZero(value)}</span>
    </div>
  );
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/**
 * «Lavoro e investimenti»: three causes that add up to the growth of the same window —
 * what was saved from work, what the other income categories brought in, what the market
 * added — closed by the total, so nothing is left to the eye to attribute (the old four rows
 * named two causes of three, and the reader handed the dividends to the market). The window
 * is the Driver's (baseline → last snapshot), selectable per year like the tile beside it; the
 * taxes are a footer on the cumulative recap only, since an estimate on today's latent gains
 * belongs to no year.
 */
function LaborTile({ labor, startYear }: { labor: LaborTileData | null; startYear: number }) {
  const [year, setYear] = useState<'all' | number>('all');
  const isMobile = useMediaQuery('(max-width: 767px)');
  const metrics = useMemo(() => {
    if (!labor) return null;
    if (year === 'all') return labor.all;
    return labor.years.find((entry) => entry.year === year)?.metrics ?? labor.all;
  }, [labor, year]);
  const chartData = useMemo(() => (!labor ? [] : year === 'all' ? labor.chartData : labor.chartData.filter((row) => row.year === year)), [labor, year]);
  const reading = useMemo(() => (metrics ? describeLabor(metrics) : null), [metrics]);
  const taxes = useMemo(() => (metrics && year === 'all' ? describeLaborTaxes(metrics) : null), [metrics, year]);

  if (!labor || !metrics) {
    return (
      <Tile eyebrow="Lavoro e investimenti" reading={null}>
        <p className="mt-3 text-[13px] leading-[1.45] text-muted-foreground">
          Configura le categorie «reddito da lavoro» nelle Impostazioni per leggere quanto hai guadagnato lavorando, quanto ne hai messo da parte e quanto ha aggiunto il mercato.
        </p>
        <p className="mt-auto border-t border-border pt-3.5 text-[11px]">
          <Link href="/dashboard/settings" className="inline-flex items-center gap-1.5 text-foreground underline-offset-2 hover:underline">
            <Settings className="h-3 w-3" aria-hidden="true" />
            Vai alle Impostazioni
          </Link>
        </p>
      </Tile>
    );
  }

  const aside =
    labor.years.length > 0 ? (
      <Select value={String(year)} onValueChange={(v) => setYear(v === 'all' ? 'all' : Number(v))}>
        <SelectTrigger size="sm" className="gap-1.5 px-2.5 text-[11px] font-medium text-foreground data-[size=sm]:h-11 desktop:data-[size=sm]:h-7" aria-label="Anno del recap lavoro e investimenti">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Dal {startYear}</SelectItem>
          {labor.years.map((entry) => (
            <SelectItem key={entry.year} value={String(entry.year)}>
              {entry.year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : undefined;

  return (
    <Tile eyebrow="Lavoro e investimenti" aside={aside} reading={reading}>
      <div className="mt-3 flex flex-col divide-y divide-border">
        <LaborRow
          label="Risparmiato da lavoro"
          caption={
            <>
              reddito da lavoro <Mono value={metrics.totalLaborIncome} /> meno tutte le spese <Mono value={metrics.totalExpensesSum} />
            </>
          }
          value={metrics.totalSavedFromWork}
        />
        <LaborRow label="Altre entrate" caption={describeOtherIncome(metrics.otherIncomeByCategory)} value={metrics.otherIncome} />
        <LaborRow label="Mercato" caption="la crescita che nessuna entrata spiega" value={metrics.totalInvestmentGrowthGross} />
        <LaborRow label="Crescita del patrimonio" caption={lowerFirst(describeLaborWindow(metrics))} value={metrics.netWorthGrowth} tone="total" />
      </div>
      {chartData.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <LaborMetricsChart data={chartData} isMobile={isMobile} />
        </div>
      )}
      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">
        {taxes && <NarrativeText segments={taxes} figureClassName="font-medium" />}
        {!labor.hasDividendCategory && <p className="m-0">{DIVIDENDS_OUTSIDE_CASHFLOW}</p>}
        <p className="m-0">Le tre cause sommano alla crescita della stessa finestra, chiusa sull&apos;ultimo snapshot come il Driver: le righe già in calendario per i mesi a venire non contano.</p>
      </div>
    </Tile>
  );
}

// ─── Note ─────────────────────────────────────────────────────────────────────

function NotesTile({ notes, snapshotCount, onAddNote, disabled }: { notes: StoricoNote[]; snapshotCount: number; onAddNote: () => void; disabled: boolean }) {
  const reading: Narrative = describeNotes(notes.length, snapshotCount, notes[0] ?? null);
  return (
    <Tile
      eyebrow="Note"
      aside={
        <button
          type="button"
          onClick={onAddNote}
          disabled={disabled}
          aria-label={disabled ? 'Aggiungi una nota — non disponibile in modalità demo' : undefined}
          className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 desktop:h-7 desktop:px-2.5"
        >
          <MessageSquare className="h-3 w-3" aria-hidden="true" />
          Aggiungi una nota
        </button>
      }
      reading={reading}
    >
      {notes.length > 0 && (
        <div className="mt-3 flex flex-col divide-y divide-border border-t border-border">
          {notes.map((n) => (
            <div key={`${n.year}-${n.month}`} className="py-2.5">
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{formatPeriodMonth(n)}</p>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-[1.45] text-foreground">{n.note}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground">Le note sono i punti ambrati sul grafico Evoluzione: un evento che spiega un salto, scritto nel mese in cui è successo.</p>
    </Tile>
  );
}

// ─── The disclosure ───────────────────────────────────────────────────────────

export function StoricoDettaglio({ currentYear, startYear, yearlyVariation, monthlyDrivers, driverYears, labor, notes, snapshotCount, onAddNote, disabled = false }: StoricoDettaglioProps) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 border-t border-border/40 py-3 text-left" aria-label="Dettaglio">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className={TILE_EYEBROW_CLASS}>Dettaglio</span>
          <span className="text-[13px] text-muted-foreground">Variazione anno su anno · Risparmio e mercato per mese · Lavoro e investimenti · Note</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1">
        <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <YearlyVariationTile rows={yearlyVariation} currentYear={currentYear} />
          </div>
          <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-6')}>
            <MonthlyDriversTile rows={monthlyDrivers} years={driverYears} startYear={startYear} />
          </div>
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-7')}>
            <LaborTile labor={labor} startYear={startYear} />
          </div>
          <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-5')}>
            <NotesTile notes={notes} snapshotCount={snapshotCount} onAddNote={onAddNote} disabled={disabled} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
