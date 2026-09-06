/**
 * Year-over-year comparison of Analisi — the tile inside the «Confronto annuale» disclosure.
 *
 * Display variants by periodMode:
 * - current/year: the comparison year is the user's pick (the «vs» select in the aside), with
 *   two views — 'mensile' (side-by-side monthly bars) and 'categoria' (the signed delta
 *   ranking: which categories DROVE the difference, not two bars per category).
 * - history: multi-year annual totals.
 *
 * The windowing, the pacing, the baseline caption and the delta rows come from the disclosure
 * (`ConfrontoDisclosure`), which computes them once through lib/utils/comparisonDeltas.ts —
 * the same-months rule cannot diverge from the Periodo tile's pacing. This component only
 * renders; it builds the two chart series it alone needs.
 *
 * Colors: chartColors[0] = current year, chartColors[1] = comparison year (useChartColors,
 * per AGENTS.md). Delta rows use the sign tokens with inverted spending semantics.
 */
'use client';

import { useMemo, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { type Expense, type ExpenseType } from '@/types/expenses';
import type { CategoryDeltaRow, ComparisonMonthScope, TotalsPacing } from '@/lib/utils/comparisonDeltas';
import type { PeriodMode } from '@/lib/utils/analisiSummary';
import type { Narrative } from '@/lib/utils/narrative';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency, formatCurrencyCompact, formatPercentage } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { AsideToggle } from '@/components/cashflow/analisi/AsideToggle';
import { Tile } from '@/components/ui/tile';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { cn } from '@/lib/utils';

// ── Shared chart styles (module-level, as-const — see AGENTS.md Recharts rules) ──

const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const TOOLTIP_LABEL_STYLE = {
  fontWeight: 600,
  color: 'var(--card-foreground)',
} as const;

const TOOLTIP_ITEM_STYLE = {
  color: 'var(--card-foreground)',
} as const;

// ── Module-level helpers ──────────────────────────────────────────────────────

/** Resolves an expense's Italy-calendar bucket for the pure comparison layer. */
const monthOf = (expense: Expense): { year: number; month: number } => {
  const date = toDate(expense.date);
  return { year: getItalyYear(date), month: getItalyMonth(date) };
};

/** «+320,00 €» / «−400,00 €» — the Comma Rule: Intl prints a hyphen, the true minus is U+2212. */
const formatSignedCurrency = (value: number): string => (value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value).replace(/^-/, '−'));

/** «+4,2%» / «−6,3%» — the same typographic sign. */
const formatSignedPercent = (value: number): string => (value > 0 ? `+${formatPercentage(value, 1)}` : formatPercentage(value, 1).replace(/^-/, '−'));

// Spending sign semantics are inverted (DESIGN.md § Do: `positiveGood`): a positive delta means spending grew →
// destructive; a drop is good → positive token.
const deltaTextClass = (delta: number): string => (delta > 0 ? 'text-destructive' : delta < 0 ? 'text-positive' : 'text-muted-foreground');

/** e.g. "Casa, più 320 euro rispetto al 2025" — spoken form of a delta row. */
function deltaRowAriaLabel(row: CategoryDeltaRow, comparisonYear: number): string {
  const status = row.status === 'new' ? ', nuova' : row.status === 'gone' ? ', cessata' : '';
  if (row.delta === 0) return `${row.label}${status}, invariata rispetto al ${comparisonYear}`;
  const direction = row.delta > 0 ? 'più' : 'meno';
  const amount = Math.round(Math.abs(row.delta)).toLocaleString('it-IT');
  return `${row.label}${status}, ${direction} ${amount} euro rispetto al ${comparisonYear}`;
}

/** Ranking rows shown before the "Altre N voci" footer takes over. */
const MAX_DELTA_ROWS = 10;

// ── MensileBarChart ───────────────────────────────────────────────────────────

/** Side-by-side monthly bars for the YoY comparison. colors[0] = current year; the comparison year is the neutral baseline. */
function MensileBarChart({
  data,
  currentYear,
  comparisonYear,
  colors,
}: {
  data: Array<{ month: string; current: number; comparison: number }>;
  currentYear: number;
  comparisonYear: number;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
        barCategoryGap="20%"
        barGap={2}
        role="img"
        accessibilityLayer={false}
        aria-label={`Spese per mese, ${currentYear} contro ${comparisonYear}. ${data.map((d) => `${d.month}: ${formatCurrency(d.current)} contro ${formatCurrency(d.comparison)}`).join('; ')}`}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="month" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCurrencyCompact} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value, name) => [formatCurrency(Number(value ?? 0)), name === 'current' ? currentYear.toString() : comparisonYear.toString()]}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Legend formatter={(value) => (value === 'current' ? currentYear.toString() : comparisonYear.toString())} wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        <Bar dataKey="current" fill={colors[0]} animationDuration={600} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
        {/* The baseline year is a neutral, as on the Periodo tile — never a series colour. */}
        <Bar dataKey="comparison" fill="var(--muted-foreground)" animationDuration={600} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── CategoryDeltaList ─────────────────────────────────────────────────────────

/**
 * Signed delta ranking — the drivers of the YoY difference, biggest movers first. Each row is
 * a button that opens the category's Scheda. The 3px track scales on |delta| against the
 * largest mover; colour follows the inverted spending rule.
 */
function CategoryDeltaList({
  rows,
  comparisonYear,
  onCategoryFocus,
}: {
  rows: CategoryDeltaRow[];
  comparisonYear: number;
  onCategoryFocus: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">Nessuna spesa da confrontare in questo periodo</p>;
  }

  const visible = rows.slice(0, MAX_DELTA_ROWS);
  const hidden = rows.slice(MAX_DELTA_ROWS);
  // Rows arrive sorted by |delta| descending, so the first row carries the scale.
  const maxAbsDelta = Math.abs(visible[0].delta) || 1;
  const hiddenDelta = hidden.reduce((sum, row) => sum + row.delta, 0);

  return (
    <div>
      <ul className="divide-y divide-border">
        {visible.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={() => onCategoryFocus({ expenseType: row.expenseType, categoryKey: row.categoryKey })}
              aria-label={deltaRowAriaLabel(row, comparisonYear)}
              className="grid min-h-[44px] w-full grid-cols-[minmax(0,1fr)_1fr_auto] items-center gap-x-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset desktop:-mx-2 desktop:min-h-0 desktop:w-[calc(100%+16px)] desktop:rounded-md desktop:px-2"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[13px]">{row.label}</span>
                {row.status !== 'ongoing' && (
                  <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px]">
                    {row.status === 'new' ? 'Nuova' : 'Cessata'}
                  </Badge>
                )}
              </span>
              <span className="block h-[3px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
                {row.delta !== 0 && (
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${(Math.abs(row.delta) / maxAbsDelta) * 100}%`,
                      // Sanctioned sign tokens as raw CSS vars (inline style cannot take a
                      // Tailwind class) — inverted spending rule.
                      backgroundColor: row.delta > 0 ? 'var(--destructive)' : 'var(--positive)',
                    }}
                  />
                )}
              </span>
              <span className="text-right">
                <span className={cn('block font-mono text-[13px] tabular-nums', deltaTextClass(row.delta))}>{formatSignedCurrency(row.delta)}</span>
                <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">{row.deltaPercent === null ? '—' : formatSignedPercent(row.deltaPercent)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {hidden.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {hidden.length === 1 ? "Un'altra voce" : `Altre ${hidden.length} voci`} · <span className="font-mono tabular-nums">Δ {formatSignedCurrency(hiddenDelta)}</span>
        </p>
      )}
    </div>
  );
}

// ── HistoryBarChart ───────────────────────────────────────────────────────────

/** Multi-year annual totals for the history — one bar per year. */
function HistoryBarChart({ data, colors }: { data: Array<{ year: string; spese: number }>; colors: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
        role="img"
        accessibilityLayer={false}
        aria-label={`Spese per anno. ${data.map((d) => `${d.year}: ${formatCurrency(d.spese)}`).join('; ')}`}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="year" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatCurrencyCompact} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Spese']}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          itemStyle={TOOLTIP_ITEM_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Bar dataKey="spese" fill={colors[0]} animationDuration={600} animationEasing="ease-out" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── ConfrontoAnnualeSection ───────────────────────────────────────────────────

interface ConfrontoAnnualeSectionProps {
  allExpenses: Expense[];
  periodMode: PeriodMode;
  /** The year under review; null in history mode. */
  currentYear: number | null;
  /** The baseline year (the user's pick, else the year before); null when none exists. */
  comparisonYear: number | null;
  /** Years the «vs» select offers. */
  comparisonOptions: number[];
  onComparisonYearChange: (year: number) => void;
  /** Null in history mode and for a month that has not started. */
  scope: ComparisonMonthScope | null;
  pacing: TotalsPacing | null;
  deltaRows: CategoryDeltaRow[];
  historyStartYear: number;
  reading: Narrative | null;
  /** Focus a category's Scheda from a delta row click. */
  onCategoryFocus: (target: { expenseType: ExpenseType; categoryKey: string }) => void;
}

export function ConfrontoAnnualeSection({
  allExpenses,
  periodMode,
  currentYear,
  comparisonYear,
  comparisonOptions,
  onComparisonYearChange,
  scope,
  pacing,
  deltaRows,
  historyStartYear,
  reading,
  onCategoryFocus,
}: ConfrontoAnnualeSectionProps) {
  const chartColors = useChartColors();
  const [viewMode, setViewMode] = useState<'mensile' | 'categoria'>('categoria');

  /** A month picked in "Anno corrente" that has not started yet — declared, not compared. */
  const isFutureMonth = periodMode !== 'history' && scope === null;

  // history mode needs ≥2 distinct years; current/year needs a comparison year AND a comparable window.
  const hasComparisonData = useMemo(() => {
    if (periodMode === 'history') {
      const years = new Set(allExpenses.map((e) => getItalyYear(toDate(e.date))));
      return years.size >= 2;
    }
    return comparisonYear !== null && scope !== null;
  }, [allExpenses, periodMode, comparisonYear, scope]);

  // Spending per month for both years, months from the scope. Future months in 'current' mode stay 0.
  const mensileData = useMemo(() => {
    if (periodMode === 'history' || currentYear === null || comparisonYear === null || scope === null) return [];
    const monthsToShow = scope.kind === 'singleMonth' ? [scope.month] : Array.from({ length: scope.kind === 'sameMonths' ? scope.upToMonth : 12 }, (_, i) => i + 1);
    const currentTotals = new Map<number, number>();
    const comparisonTotals = new Map<number, number>();
    for (const expense of allExpenses) {
      if (expense.type === 'income' || expense.type === 'transfer') continue;
      const { year, month } = monthOf(expense);
      const target = year === currentYear ? currentTotals : year === comparisonYear ? comparisonTotals : null;
      if (!target) continue;
      target.set(month, (target.get(month) ?? 0) + Math.abs(expense.amount));
    }
    return monthsToShow.map((month) => ({
      month: MONTH_NAMES[month - 1].slice(0, 3),
      current: currentTotals.get(month) ?? 0,
      comparison: comparisonTotals.get(month) ?? 0,
    }));
  }, [allExpenses, periodMode, currentYear, comparisonYear, scope]);

  // Annual spending totals from historyStartYear forward — history mode only, oldest first.
  const multiYearData = useMemo(() => {
    if (periodMode !== 'history') return [];
    const years = new Set(allExpenses.map((e) => getItalyYear(toDate(e.date))));
    return Array.from(years)
      .filter((y) => y >= historyStartYear)
      .sort((a, b) => a - b)
      .map((year) => ({
        year: year.toString(),
        spese: allExpenses
          .filter((e) => e.type !== 'income' && e.type !== 'transfer' && getItalyYear(toDate(e.date)) === year)
          .reduce((s, e) => s + Math.abs(e.amount), 0),
      }));
  }, [allExpenses, periodMode, historyStartYear]);

  const controls =
    periodMode !== 'history' && comparisonYear !== null ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span>vs</span>
        <Select value={String(comparisonYear)} onValueChange={(value) => onComparisonYearChange(Number(value))}>
          <SelectTrigger size="sm" aria-label="Anno di confronto" className="h-7 w-[84px] font-mono text-[11px] tabular-nums">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {comparisonOptions.map((year) => (
              <SelectItem key={year} value={String(year)} className="font-mono tabular-nums">
                {String(year)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <AsideToggle
          ariaLabel="Vista confronto"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'mensile', label: 'Mensile' },
            { value: 'categoria', label: 'Per categoria' },
          ]}
        />
      </div>
    ) : periodMode === 'history' ? (
      <span>
        dal <span className="font-mono tabular-nums">{historyStartYear}</span>
      </span>
    ) : undefined;

  return (
    <Tile eyebrow="Confronto annuale" aside={controls} reading={reading}>
      {/* Baseline caption comes verbatim from the module — never rebuilt here. */}
      {pacing && currentYear !== null && (
        <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
          {currentYear} {pacing.baselineLabel}
        </p>
      )}

      <div className="mt-3">
        {!hasComparisonData && (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            {periodMode === 'history'
              ? 'Servono almeno 2 anni di dati per il confronto'
              : isFutureMonth
                ? 'Il mese selezionato non è ancora iniziato'
                : 'Servono dati di un anno precedente per il confronto'}
          </p>
        )}

        {periodMode === 'history' && hasComparisonData && <HistoryBarChart data={multiYearData} colors={chartColors} />}

        {periodMode !== 'history' && hasComparisonData && currentYear !== null && comparisonYear !== null && viewMode === 'mensile' && (
          <MensileBarChart data={mensileData} currentYear={currentYear} comparisonYear={comparisonYear} colors={chartColors} />
        )}

        {periodMode !== 'history' && hasComparisonData && comparisonYear !== null && viewMode === 'categoria' && (
          <CategoryDeltaList rows={deltaRows} comparisonYear={comparisonYear} onCategoryFocus={onCategoryFocus} />
        )}
      </div>

      {/* Honesty caption: comparing against the first tracked year may cut data. */}
      {periodMode !== 'history' && hasComparisonData && comparisonYear === historyStartYear && (
        <p className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
          Storico dal <span className="font-mono tabular-nums">{historyStartYear}</span>: il confronto potrebbe essere parziale.
        </p>
      )}
    </Tile>
  );
}
