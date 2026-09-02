/**
 * EntityDossier — the per-entity stats block at the heart of the Analisi focus (the «Scheda»
 * tile: a category, or one of its subcategories).
 *
 * WHY THIS EXISTS
 * The drill-down used to end in a period-scoped transaction list, so "how has this entity
 * changed over time?" (the condominio question) was unanswerable without leaving the page.
 * The dossier answers it in place: period total, run-rate, a per-year table with signed
 * deltas, and a 24-month trend.
 *
 * PERIOD SEMANTICS — deliberately split, each block declares its own horizon:
 * - Period-scoped: the hero total and its share of the period.
 * - Period-INDEPENDENT: the per-year table, the 12-month average and the monthly trend. They
 *   ignore the page's period axis on purpose — the period is a cursor over the entity's
 *   timeline, not a cage around it. This is what makes the dossier answer "this year vs last
 *   year" without ever holding two periods in state.
 *
 * SUBCATEGORY BREAKDOWN
 * On a category dossier each year row expands into its per-subcategory deltas ("how much of
 * Casa's +820 € is condominio?"). It hangs off the year row rather than sitting in a block of
 * its own precisely so the two windows compared are the row's own — resolveYearRowWindows owns
 * that pairing, which is what makes Σ(subcategory delta) === the row's delta true by
 * construction instead of by vigilance. The most recent row opens by default.
 *
 * LAYOUT
 * Inside the Scheda tile (`columns`) the blocks sit in two columns from `desktop:` — the
 * period total, the run-rate and the per-year table on the left, the trend and the caller's
 * `aside` (the subcategory ranking, or the transactions) on the right; below `desktop:` and
 * without `columns` everything stacks.
 *
 * All figures come from the pure, tested layer (lib/utils/expenseEntityStats).
 */
'use client';

import { useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Expense } from '@/types/expenses';
import {
  buildEntityMonthlySeries,
  buildEntitySubCategoryDeltas,
  buildEntityYearRows,
  computeEntityRunRate,
  resolveYearRowWindows,
  type EntityScope,
  type EntitySubCategoryDeltaRow,
  type EntityYearRow,
} from '@/lib/utils/expenseEntityStats';
import { formatCurrency, formatCurrencyCompact, formatPercentage } from '@/lib/services/chartService';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { CHART_TICK_STYLE } from '@/components/cashflow/costCenterStyles';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
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

// Resolves an expense's Italy-calendar month for the pure layer.
const monthOf = (expense: Expense): { year: number; month: number } => {
  const date = toDate(expense.date);
  return { year: getItalyYear(date), month: getItalyMonth(date) };
};

/**
 * Sign classes for a delta, with spending semantics inverted (DESIGN.md positiveGood rule):
 * spending UP is bad, income UP is good. Shared by the year rows and the subcategory rows so
 * the two can never disagree on a colour.
 */
const deltaSignClass = (delta: number | null, isIncome: boolean): string => {
  if (delta === null || delta === 0) return 'text-muted-foreground';
  return (isIncome ? delta > 0 : delta < 0) ? 'text-positive' : 'text-destructive';
};

/** «+50,00 €» / «−10,00 €» — Intl prints a hyphen for a negative amount; the Comma Rule wants the true minus (U+2212). */
const signedCurrency = (value: number): string => (value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value).replace(/^-/, '−'));

/** «(+11,8%)» / «(−11,1%)» — the Comma Rule: it-IT decimals, never `toFixed`. */
const signedPercent = (value: number, delta: number): string => `${delta > 0 ? '+' : ''}${formatPercentage(value, 1)}`.replace(/^-/, '−');

// ── CollapseRegion ───────────────────────────────────────────────────────────

/**
 * Pure-CSS `grid-template-rows: 0fr → 1fr` expansion. AGENTS.md flags Framer
 * `AnimatePresence` + `height:'auto'` as unreliable for lists of sub-items (it left rows
 * stuck at opacity 0); this needs no height measurement and nests. Content stays mounted for
 * the transition to size, so a closed region is `inert` to keep it out of the focus order and
 * the a11y tree.
 */
function CollapseRegion({ open, id, children }: { open: boolean; id: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      className={cn(
        'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
    >
      <div className="overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

// ── DossierChip ──────────────────────────────────────────────────────────────
// Module-level component required by React Compiler (no nested components).

// A flat KPI (sub-eyebrow · 18px compact hero · 11px caption), the trio's shape: a tinted
// sub-card inside the Scheda tile would be a card inside a card. Averages and projections are
// estimates, so they print without cents.
function DossierChip({ label, value, caption }: { label: string; value: number; caption?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className={TILE_SUB_EYEBROW_CLASS}>{label}</p>
      <p className="font-mono text-[18px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">{cachedFormatCurrencyEUR(value, true)}</p>
      {caption && <p className="text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
}

// ── SubCategoryDeltaRow ──────────────────────────────────────────────────────

/**
 * One subcategory inside an expanded year row. Both figures the drill-down is asked for are
 * on screen: the window's own total, and — under it — the signed change with the baseline it
 * is measured against ("da 920,00 €"), so the comparison never depends on remembering the
 * previous year's row.
 */
function SubCategoryDeltaRow({ row, isIncome }: { row: EntitySubCategoryDeltaRow; isIncome: boolean }) {
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[13px] text-muted-foreground">{row.label}</span>
          {row.status !== 'ongoing' && (
            <span className="shrink-0 rounded border border-border px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {row.status === 'new' ? 'Nuova' : 'Cessata'}
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-foreground">{formatCurrency(row.current)}</span>
      </div>
      {/* Baseline LEFT, change RIGHT — one long "+50,00 € (+20,0%) · da 250,00 €" string
          squeezed the label into an unreadable truncation at 390px. */}
      {row.delta !== null && (
        <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] tabular-nums">
          <span className="text-muted-foreground">da {formatCurrency(row.previous)}</span>
          <span className={deltaSignClass(row.delta, isIncome)}>
            {signedCurrency(row.delta)}
            {row.deltaPercent !== null && ` (${signedPercent(row.deltaPercent, row.delta)})`}
          </span>
        </div>
      )}
    </div>
  );
}

// ── YearRow ──────────────────────────────────────────────────────────────────

/**
 * One row of the per-year table, expandable into its per-subcategory deltas.
 *
 * The row is only made expandable when the breakdown carries at least two subcategories:
 * with one, the nested list would restate the row it hangs off. The chevron is always
 * rendered on an expandable row — the affordance is invisible without it (AGENTS.md).
 */
function YearRow({
  row,
  isIncome,
  historyStartYear,
  subRows,
  reserveToggleSpace,
  isExpanded,
  onToggle,
}: {
  row: EntityYearRow;
  isIncome: boolean;
  historyStartYear: number;
  /** Per-subcategory decomposition of THIS row's windows; empty at subcategory level. */
  subRows: EntitySubCategoryDeltaRow[];
  /** True when ANY row in the table is expandable — keeps the years aligned in a mixed table. */
  reserveToggleSpace: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const regionId = useId();
  const isExpandable = subRows.length > 1;

  // The partial year compares like-for-like ("stessi mesi"); a partial year whose baseline
  // predates the tracked history says so instead of showing a fake 0.
  const deltaLine = (() => {
    if (row.isPartial && row.prevSameMonthsTotal === null) {
      return <span className="text-muted-foreground">storico dal {historyStartYear}</span>;
    }
    if (row.delta === null) return <span className="text-muted-foreground">—</span>;
    const pct = row.deltaPercent !== null ? ` (${signedPercent(row.deltaPercent, row.delta)})` : '';
    const context = row.isPartial ? ` vs ${row.year - 1} stessi mesi` : ` vs ${row.year - 1}`;
    return (
      <span className={deltaSignClass(row.delta, isIncome)}>
        {signedCurrency(row.delta)}
        {pct}
        <span className="text-muted-foreground">{context}</span>
      </span>
    );
  })();

  const summary = (
    <>
      <span className="flex shrink-0 items-center gap-2">
        {isExpandable ? (
          <ChevronDown
            className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none', isExpanded && 'rotate-180')}
            aria-hidden="true"
          />
        ) : (
          // A year with nothing to decompose still holds the chevron's place, or the years
          // would step in and out by 14px down a mixed table.
          reserveToggleSpace && <span className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="font-mono text-[13px] font-medium tabular-nums text-foreground">{row.year}</span>
        {row.isPartial && (
          <span className="rounded border border-border px-1 py-px text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">YTD</span>
        )}
      </span>
      <span className="min-w-0 text-right">
        <span className="block font-mono text-[13px] font-semibold tabular-nums text-foreground">{formatCurrency(row.total)}</span>
        <span className="block font-mono text-[11px] tabular-nums">{deltaLine}</span>
      </span>
    </>
  );

  if (!isExpandable) {
    return <div className={cn('flex items-center justify-between gap-3 py-2.5', reserveToggleSpace && 'px-1')}>{summary}</div>;
  }

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={regionId}
        className="flex w-full items-center justify-between gap-3 rounded-lg py-2 pl-1 pr-1 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {summary}
      </button>
      <CollapseRegion open={isExpanded} id={regionId}>
        <div className="ml-1.5 border-l border-border/60 pb-2 pl-3">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-0.5')}>Per sottocategoria</p>
          <div className="divide-y divide-border/40">
            {subRows.map((subRow) => (
              <SubCategoryDeltaRow key={subRow.key} row={subRow} isIncome={isIncome} />
            ))}
          </div>
        </div>
      </CollapseRegion>
    </div>
  );
}

// ── EntityDossier ────────────────────────────────────────────────────────────

interface EntityDossierProps {
  /** Full expense history — the dossier floors it itself via historyStartYear. */
  allExpenses: Expense[];
  scope: EntityScope;
  /** Series colour for the trend (theme-aware, resolved by the caller through useChartColors). */
  color: string;
  /** The page's period state — scopes ONLY the hero total and its share. */
  period: { year: number | null; month: number | null };
  periodLabel: string;
  historyStartYear: number;
  /** Inverts delta sign semantics: income up = good, spending up = bad. */
  isIncome: boolean;
  /** Two columns from `desktop:` (inside the Scheda tile); stacked otherwise. */
  columns?: boolean;
  /** Rendered after the trend (the right column with `columns`): the subcategory ranking or the transactions. */
  aside?: ReactNode;
}

export function EntityDossier({ allExpenses, scope, color, period, periodLabel, historyStartYear, isIncome, columns = false, aside }: EntityDossierProps) {
  const now = { year: getItalyYear(), month: getItalyMonth() };

  const yearRows = useMemo(
    () => buildEntityYearRows(allExpenses, scope, historyStartYear, now, monthOf),
    // now derives from the clock: stable within a render session, deliberately not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allExpenses, scope, historyStartYear]
  );

  const runRate = useMemo(
    () => computeEntityRunRate(allExpenses, scope, period, historyStartYear, now, monthOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allExpenses, scope, period, historyStartYear]
  );

  const monthlySeries = useMemo(
    () => buildEntityMonthlySeries(allExpenses, scope, 24, historyStartYear, now, monthOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allExpenses, scope, historyStartYear]
  );

  /**
   * Per-subcategory decomposition of every year row, keyed by year.
   *
   * Only on a CATEGORY dossier: at subcategory level there is nothing left to break down, and
   * the map stays empty so no row becomes expandable. Each row's windows come from
   * resolveYearRowWindows, so the nested deltas always sum back to the delta printed on the
   * row above them.
   */
  const subRowsByYear = useMemo(() => {
    const byYear = new Map<number, EntitySubCategoryDeltaRow[]>();
    if (scope.subCategory) return byYear;
    for (const row of yearRows) {
      const { current, baseline } = resolveYearRowWindows(row, now.month);
      byYear.set(row.year, buildEntitySubCategoryDeltas(allExpenses, scope.category, current, baseline, historyStartYear, monthOf));
    }
    return byYear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allExpenses, scope, yearRows, historyStartYear]);

  /**
   * Which year row is open. Stored WITH the entity it belongs to instead of being reset by an
   * effect (`react-hooks/set-state-in-effect` bans the synchronous reset): when the dossier
   * switches entity — same component instance, the JSX position never changes — the stored
   * key stops matching and the default takes over again.
   */
  const scopeKey = `${scope.category.expenseType}:${scope.category.key}:${scope.subCategory?.key ?? ''}`;
  const [toggledYear, setToggledYear] = useState<{ scopeKey: string; year: number | null } | null>(null);
  // The newest row is the "this year vs last year" answer — open by default.
  const expandedYear = toggledYear && toggledYear.scopeKey === scopeKey ? toggledYear.year : (yearRows[0]?.year ?? null);

  const hasAnyData = yearRows.some((row) => row.total > 0);
  // Same threshold YearRow uses to decide it is expandable — one subcategory would only
  // restate the row, so it earns no chevron and no reserved space.
  const hasExpandableYear = Array.from(subRowsByYear.values()).some((rows) => rows.length > 1);
  const hasTrendData = monthlySeries.some((point) => point.value > 0 || (point.prevYearValue ?? 0) > 0);
  const seriesName = isIncome ? 'Entrate' : 'Spesa';

  // A single-month period's "monthly average" IS the hero total — hide the chip.
  const showPeriodAverage = runRate.periodMonthlyAverage !== null && period.month === null;

  // Hero: the period-scoped total (the ONLY period-scoped figure with the share)
  const hero = (
    <div>
      <p className={TILE_SUB_EYEBROW_CLASS}>Totale · {periodLabel}</p>
      <p className="mt-1.5 font-mono text-[22px] font-bold leading-none tracking-[-0.025em] tabular-nums text-foreground">
        {formatCurrency(runRate.periodTotal)}
      </p>
      {runRate.shareOfPeriodTotal !== null && runRate.periodTotal > 0 && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {/* The pure layer returns a 0-1 share (its tests pin that contract) — scaled here. */}
          <span className="font-mono tabular-nums">{formatPercentage(runRate.shareOfPeriodTotal * 100, 1)}</span> {isIncome ? 'delle entrate' : 'delle spese'} del periodo
        </p>
      )}
      {runRate.periodTotal === 0 && hasAnyData && (
        <p className="mt-1 text-[11px] text-muted-foreground">Nessuna transazione nel periodo — la tabella copre tutto lo storico.</p>
      )}
    </div>
  );

  if (!hasAnyData) {
    return (
      <div className="space-y-5">
        {hero}
        <p className="text-[13px] text-muted-foreground">Nessuna transazione registrata per questa voce dal {historyStartYear}.</p>
      </div>
    );
  }

  // Run-rate — period-independent except the first chip; a grid so the chips share widths.
  const chips = (
    <div className="grid grid-cols-3 gap-3.5">
      {showPeriodAverage && <DossierChip label="Media mensile (periodo)" value={runRate.periodMonthlyAverage ?? 0} />}
      {/* "ultimi" declares the anchor (today) — under a past-year or Storico period this is
          NOT the selected period's monthly average. */}
      <DossierChip
        label="Media ultimi 12 mesi"
        value={runRate.trailing12MonthlyAverage}
        caption={runRate.observedMonths < 12 ? `ultimi ${runRate.observedMonths} mesi` : undefined}
      />
      {runRate.currentYearProjection !== null && <DossierChip label={`Proiezione ${now.year}`} value={runRate.currentYearProjection} caption="al ritmo attuale" />}
    </div>
  );

  // Per anno — the year-over-year answer, period-independent
  const perAnno = (
    <div>
      <p className={TILE_SUB_EYEBROW_CLASS}>Per anno</p>
      <div className="mt-1 divide-y divide-border/60">
        {yearRows.map((row) => (
          <YearRow
            key={row.year}
            row={row}
            isIncome={isIncome}
            historyStartYear={historyStartYear}
            subRows={subRowsByYear.get(row.year) ?? []}
            reserveToggleSpace={hasExpandableYear}
            isExpanded={expandedYear === row.year}
            onToggle={() => setToggledYear({ scopeKey, year: expandedYear === row.year ? null : row.year })}
          />
        ))}
      </div>
    </div>
  );

  // Trend mensile — period-independent. Always rendered (AGENTS.md § Recharts — rolling charts always render, never
  // disappear silently); the empty window states itself.
  const trend = (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={TILE_SUB_EYEBROW_CLASS}>Trend mensile · ultimi 24 mesi</p>
        {hasTrendData && <p className="text-[11px] text-muted-foreground">La linea tratteggiata è lo stesso mese dell&apos;anno precedente</p>}
      </div>
      {hasTrendData ? (
        <div className="mt-2">
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart
              data={monthlySeries}
              margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
              role="img"
              accessibilityLayer={false}
              aria-label={`${seriesName} per mese, ultimi 24 mesi. ${monthlySeries.map((point) => `${point.label}: ${formatCurrency(point.value)}${point.prevYearValue !== null ? `, anno precedente ${formatCurrency(point.prevYearValue)}` : ''}`).join('; ')}`}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={formatCurrencyCompact} tick={CHART_TICK_STYLE} axisLine={false} tickLine={false} />
              <Tooltip
                // A null baseline (pre-floor month) is a gap, not a zero — the tooltip must
                // not resurrect the fabricated 0 the series refused.
                formatter={(value) => (value == null ? '—' : formatCurrency(Number(value)))}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
              />
              <Bar dataKey="value" name={seriesName} fill={color} animationDuration={600} animationEasing="ease-out" radius={[2, 2, 0, 0]} />
              {/* connectNulls stays false: pre-floor baseline months render as a gap. */}
              <Line dataKey="prevYearValue" name="Anno precedente" stroke="var(--muted-foreground)" strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="py-3 text-[13px] text-muted-foreground">Nessun movimento negli ultimi 24 mesi.</p>
      )}
    </div>
  );

  if (!columns) {
    return (
      <div className="space-y-5">
        {hero}
        {chips}
        {perAnno}
        {trend}
        {aside}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 desktop:grid-cols-12 desktop:gap-x-6">
      <div className="min-w-0 space-y-5 desktop:col-span-5">
        {hero}
        {chips}
        {perAnno}
      </div>
      <div className="min-w-0 space-y-5 desktop:col-span-7">
        {trend}
        {aside}
      </div>
    </div>
  );
}
