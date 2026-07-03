'use client';

/**
 * CostCenterDetail
 *
 * Drill-down view for a single cost center, rebuilt around the Trade Republic
 * hierarchy used across the app: one dominant number, a Δ chip, then flat divide-y
 * rows of context — no KPI box grid.
 *
 * What it answers, top to bottom:
 * 1. How much has this cost, in the selected period, and is it up or down? (hero)
 * 2. Am I within my ceiling, and what will the full year cost? (budget verdict + forecast)
 * 3. What is the cost MADE of? (per-category composition + per-subcategory breakdown
 *    with a "net of X" exclusion toggle + stacked-by-category chart)
 * 4. Which transactions drove it? (table)
 *
 * All derivation lives in lib/utils/costCenterUtils.ts; this component only fetches,
 * memoizes and renders.
 *
 * SIGN CONVENTION: expenses are stored negative; the pure layer returns positive costs.
 */

import { useEffect, useState, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { queryKeys } from '@/lib/query/queryKeys';
import { CostCenter, CostCenterPeriod } from '@/types/costCenters';
import { getExpensesForCostCenter } from '@/lib/services/costCenterService';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import {
  filterExpensesByPeriod,
  computeCenterStats,
  computePeriodComparison,
  evaluateCenterBudget,
  projectAnnualCost,
  buildCategoryComposition,
  buildSubCategoryComposition,
  splitRecurringVsOneOff,
  buildMonthlySeriesByCategory,
} from '@/lib/utils/costCenterUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Pencil, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { cn } from '@/lib/utils';

// Shared with other cashflow charts. Recharts defaults to a white tooltip that breaks dark mode.
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const TOOLTIP_LABEL_STYLE = { fontWeight: 600, color: 'var(--card-foreground)' } as const;
const TOOLTIP_ITEM_STYLE = { color: 'var(--card-foreground)' } as const;

const PERIOD_LABELS: Record<CostCenterPeriod, string> = {
  month: 'questo mese',
  year: "quest'anno",
  rolling12: 'ultimi 12 mesi',
  all: 'dall’inizio',
};

interface CostCenterDetailProps {
  costCenter: CostCenter;
  /** Period axis selected on the Panoramica; the hero and figures follow it. */
  period: CostCenterPeriod;
  onBack: () => void;
  onEdit: (costCenter: CostCenter) => void;
  onDelete: (costCenter: CostCenter) => void;
  onArchiveToggle: (costCenter: CostCenter) => void;
  isDemo?: boolean;
}

export function CostCenterDetail({
  costCenter,
  period,
  onBack,
  onEdit,
  onDelete,
  onArchiveToggle,
  isDemo = false,
}: CostCenterDetailProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const chartColors = useChartColors();

  // Shares the ['cost-centers', userId] prefix invalidated by ExpenseDialog, so the
  // detail stays in sync with expense mutations elsewhere.
  const { data: allExpenses = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.costCenters.expenses(ownerId ?? '', costCenter.id),
    enabled: !!user,
    queryFn: async () => {
      const data = await getExpensesForCostCenter(user!.uid, costCenter.id);
      // Only outgoing expenses (exclude any income entries linked to this center).
      return data.filter((e) => e.amount < 0);
    },
  });

  // Chart granularity is independent of the page period: last 12 months vs full history.
  const [showFullHistory, setShowFullHistory] = useState(false);
  // Two-click delete safety: first click arms, second executes.
  const [deleteArmed, setDeleteArmed] = useState(false);
  // Defer chart mount one RAF so ResponsiveContainer measures after layout.
  const [chartReady, setChartReady] = useState(false);
  const chartRafRef = useRef<number | null>(null);
  // Subcategories the user has toggled off in the breakdown card to read a "net of X"
  // total. Session-only (resets when switching center); never persisted nor applied to
  // the hero/budget/chart — those always reflect the real spend.
  const [excludedSubKeys, setExcludedSubKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExcludedSubKeys(new Set());
  }, [costCenter.id]);

  useEffect(() => {
    if (loading) return;
    chartRafRef.current = requestAnimationFrame(() => setChartReady(true));
    return () => {
      if (chartRafRef.current !== null) cancelAnimationFrame(chartRafRef.current);
    };
  }, [loading]);

  useEffect(() => {
    if (!deleteArmed) return;
    const timer = setTimeout(() => setDeleteArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [deleteArmed]);

  // Expenses scoped to the selected period drive the hero, composition and table.
  const periodExpenses = useMemo(
    () => filterExpensesByPeriod(allExpenses, period, new Date()),
    [allExpenses, period],
  );

  const stats = useMemo(() => computeCenterStats(allExpenses, period), [allExpenses, period]);
  const comparison = useMemo(
    () => computePeriodComparison(allExpenses, period),
    [allExpenses, period],
  );
  const budget = useMemo(() => evaluateCenterBudget(costCenter, allExpenses), [costCenter, allExpenses]);
  const forecast = useMemo(() => projectAnnualCost(allExpenses), [allExpenses]);
  const composition = useMemo(() => buildCategoryComposition(periodExpenses), [periodExpenses]);
  const subComposition = useMemo(() => buildSubCategoryComposition(periodExpenses), [periodExpenses]);
  const recurringSplit = useMemo(() => splitRecurringVsOneOff(periodExpenses), [periodExpenses]);

  // Net total + share are derived over the still-included subcategories so excluding a
  // row recomputes the breakdown without touching the hero/budget figures above.
  const hasMultipleCategories = useMemo(
    () => new Set(subComposition.map((s) => s.categoryName)).size > 1,
    [subComposition],
  );
  const netSubTotal = useMemo(
    () => subComposition.filter((s) => !excludedSubKeys.has(s.key)).reduce((sum, s) => sum + s.total, 0),
    [subComposition, excludedSubKeys],
  );
  const excludedSlices = useMemo(
    () => subComposition.filter((s) => excludedSubKeys.has(s.key)),
    [subComposition, excludedSubKeys],
  );

  const toggleSubKey = (key: string) =>
    setExcludedSubKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const series = useMemo(
    () => buildMonthlySeriesByCategory(allExpenses, showFullHistory ? undefined : 12),
    [allExpenses, showFullHistory],
  );

  // Flatten stacked buckets into recharts rows: { label, [category]: value }.
  const chartData = useMemo(
    () => series.buckets.map((b) => ({ label: b.label, ...b.byCategory })),
    [series],
  );

  const accentColor = costCenter.color ?? (chartColors[0] || 'var(--chart-1)');
  const colorForCategory = (i: number) =>
    chartColors.length > 0 ? chartColors[i % chartColors.length] : 'var(--chart-1)';

  const isArchived = !!costCenter.archivedAt;

  return (
    <div className="space-y-8">
      {/* Header: back + name on the left, actions on the right (stacked on mobile). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Torna alla lista">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              {costCenter.color && (
                <span
                  className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: costCenter.color }}
                />
              )}
              <h2 className="text-xl font-semibold">{costCenter.name}</h2>
              {isArchived && (
                <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                  Archiviato
                </Badge>
              )}
            </div>
          </div>
          {costCenter.description && (
            <p className="text-sm text-muted-foreground pl-11">{costCenter.description}</p>
          )}
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => onArchiveToggle(costCenter)}
            disabled={isDemo}
            aria-label={
              isDemo
                ? 'Archivia — non disponibile in modalità demo'
                : isArchived
                  ? 'Ripristina il centro di costo'
                  : 'Archivia il centro di costo'
            }
          >
            {isArchived ? (
              <ArchiveRestore className="h-4 w-4 mr-1" />
            ) : (
              <Archive className="h-4 w-4 mr-1" />
            )}
            {isArchived ? 'Ripristina' : 'Archivia'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => onEdit(costCenter)}
            disabled={isDemo}
            aria-label={isDemo ? 'Modifica — non disponibile in modalità demo' : 'Modifica centro di costo'}
          >
            <Pencil className="h-4 w-4 mr-1" />
            Modifica
          </Button>
          <Button
            variant={deleteArmed ? 'destructive' : 'outline'}
            size="sm"
            className="flex-1 sm:flex-none"
            disabled={isDemo}
            aria-label={
              isDemo
                ? 'Elimina — non disponibile in modalità demo'
                : deleteArmed
                  ? 'Conferma eliminazione del centro di costo'
                  : 'Elimina centro di costo'
            }
            onClick={() => (deleteArmed ? onDelete(costCenter) : setDeleteArmed(true))}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            {deleteArmed ? 'Conferma' : 'Elimina'}
          </Button>
        </div>
      </div>

      {loading ? (
        <DetailSkeleton />
      ) : allExpenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nessuna spesa assegnata a questo centro di costo ancora.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* HERO — dominant period total + Δ chip. */}
          <section>
            <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              Speso {PERIOD_LABELS[period]}
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-3">
              <span className="text-[40px] leading-none font-bold font-mono tabular-nums">
                {formatCurrency(stats.totalSpent)}
              </span>
              {comparison.deltaPct !== null && (
                <DeltaChip deltaPct={comparison.deltaPct} />
              )}
            </div>

            {/* Secondary metrics as a flat divide-y line — no boxes. */}
            <dl className="mt-5 divide-y divide-border/60 rounded-xl border border-border/60">
              <FlatRow label="Transazioni" value={String(stats.transactionCount)} />
              <FlatRow label="Media mensile" value={formatCurrency(stats.averageMonthly)} />
              <FlatRow
                label="Periodo attivo"
                value={
                  stats.firstActivityDate
                    ? `${formatDate(stats.firstActivityDate)}${
                        stats.lastActivityDate && stats.lastActivityDate !== stats.firstActivityDate
                          ? ` – ${formatDate(stats.lastActivityDate)}`
                          : ''
                      }`
                    : '—'
                }
              />
              {recurringSplit.recurring > 0 && (
                <FlatRow
                  label="Costo fisso (ricorrente)"
                  value={`${formatCurrency(recurringSplit.recurring)} · ${Math.round(
                    recurringSplit.recurringPct * 100,
                  )}%`}
                />
              )}
            </dl>
          </section>

          {/* CONTROL — budget verdict (B1) + annual forecast (B2). */}
          {(budget || forecast.spentYtd > 0) && (
            <section className="grid gap-4 desktop:grid-cols-2">
              {budget && (
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        Tetto {budget.budgetPeriod === 'monthly' ? 'mensile' : 'annuale'}
                      </p>
                      <span
                        className={cn(
                          'text-sm font-semibold font-mono',
                          budget.status === 'over'
                            ? 'text-destructive'
                            : budget.status === 'warning'
                              ? 'text-[var(--chart-3)]'
                              : 'text-positive',
                        )}
                      >
                        {Math.round(budget.ratio * 100)}%
                      </span>
                    </div>
                    <p className="mt-1 text-lg font-semibold font-mono tabular-nums">
                      {formatCurrency(budget.spent)}{' '}
                      <span className="text-sm font-normal text-muted-foreground">
                        / {formatCurrency(budget.budgetAmount)}
                      </span>
                    </p>
                    <BudgetMeter ratio={budget.ratio} status={budget.status} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {budget.remaining >= 0
                        ? `${formatCurrency(budget.remaining)} ancora disponibili`
                        : `${formatCurrency(Math.abs(budget.remaining))} oltre il tetto`}
                    </p>
                  </CardContent>
                </Card>
              )}

              {forecast.spentYtd > 0 && (
                <Card>
                  <CardContent className="p-5">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      Proiezione costo annuo
                    </p>
                    <p className="mt-1 text-lg font-semibold font-mono tabular-nums">
                      {formatCurrency(forecast.projectedTotal)}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {formatCurrency(forecast.spentYtd)} spesi finora ·{' '}
                      {forecast.yearProgress < 0.25
                        ? 'stima iniziale, ancora poco affidabile'
                        : `${Math.round(forecast.yearProgress * 100)}% dell’anno trascorso`}
                    </p>
                  </CardContent>
                </Card>
              )}
            </section>
          )}

          {/* COMPOSITION — what the cost is made of (A4). */}
          {composition.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold mb-3">Composizione per categoria</h3>
              <div className="divide-y divide-border/60 rounded-xl border border-border/60">
                {composition.map((slice, i) => (
                  <div key={slice.categoryName} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: colorForCategory(i) }}
                    />
                    <span className="flex-1 truncate text-sm">{slice.categoryName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                      {Math.round(slice.pct * 100)}%
                    </span>
                    <span className="text-sm font-mono tabular-nums w-24 text-right">
                      {formatCurrency(slice.total)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SUBCATEGORY BREAKDOWN — one level deeper, with per-subcategory exclusion so
              the user can read a "net of X" total (e.g. car spend net of fuel). */}
          {subComposition.length > 0 && (
            <section>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold">Dettaglio per sottocategoria</h3>
                  {excludedSubKeys.size > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Totale al netto{' '}
                      <span className="font-mono text-foreground">{formatCurrency(netSubTotal)}</span>
                      {' · '}
                      {excludedSlices.length === 1
                        ? `escl. ${excludedSlices[0].subCategoryName}`
                        : `${excludedSlices.length} escluse`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Tocca una voce per escluderla dal totale</p>
                  )}
                </div>
                {excludedSubKeys.size > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs shrink-0"
                    onClick={() => setExcludedSubKeys(new Set())}
                  >
                    Reimposta
                  </Button>
                )}
              </div>
              <div className="divide-y divide-border/60 rounded-xl border border-border/60">
                {subComposition.map((slice) => {
                  const excluded = excludedSubKeys.has(slice.key);
                  const pct = !excluded && netSubTotal > 0 ? slice.total / netSubTotal : 0;
                  return (
                    <button
                      key={slice.key}
                      type="button"
                      aria-pressed={excluded}
                      onClick={() => toggleSubKey(slice.key)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 motion-reduce:transition-none',
                        excluded && 'opacity-50',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn('truncate text-sm', excluded && 'line-through')}>
                          {slice.subCategoryName}
                        </span>
                        {hasMultipleCategories && (
                          <span className="truncate text-[11px] text-muted-foreground">{slice.categoryName}</span>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                        {excluded ? '—' : `${Math.round(pct * 100)}%`}
                      </span>
                      <span
                        className={cn(
                          'text-sm font-mono tabular-nums w-24 text-right',
                          excluded && 'line-through',
                        )}
                      >
                        {formatCurrency(slice.total)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* TREND — stacked-by-category monthly chart. */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold">Spese nel tempo</h3>
                <p className="text-xs text-muted-foreground">
                  {showFullHistory ? 'Storico completo' : 'Ultimi 12 mesi'} · per categoria
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFullHistory((p) => !p)}
                aria-pressed={showFullHistory}
                className="text-xs"
              >
                {showFullHistory ? 'Ultimi 12 mesi' : 'Tutto lo storico'}
              </Button>
            </div>
            <div className="h-52 desktop:h-64 min-w-0">
              {chartReady && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tickFormatter={(v) => `${Math.round(v as number)}€`}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={55}
                    />
                    <Tooltip
                      formatter={(value, name) => [formatCurrency(value as number), name as string]}
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                    />
                    {series.categories.map((cat, i) => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        stackId="spesa"
                        fill={
                          // Single-category centers keep their own accent; multi-category cycle the palette.
                          series.categories.length === 1 ? accentColor : colorForCategory(i)
                        }
                        radius={i === series.categories.length - 1 ? [3, 3, 0, 0] : undefined}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* TRANSACTIONS — drivers for the selected period. */}
          <section>
            <h3 className="text-sm font-semibold mb-3">
              Transazioni collegate{' '}
              <span className="font-normal text-muted-foreground">({PERIOD_LABELS[period]})</span>
            </h3>
            {periodExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground px-1 py-6">
                Nessuna spesa in questo periodo.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categoria</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden desktop:table-cell">
                        Note
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...periodExpenses]
                      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
                      .map((expense) => (
                        <tr
                          key={expense.id}
                          className="border-b border-border last:border-0 hover:bg-muted/30"
                        >
                          <td className="px-4 py-3 whitespace-nowrap font-mono tabular-nums text-xs">
                            {formatDate(toDate(expense.date))}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{expense.categoryName}</span>
                              {expense.subCategoryName && (
                                <Badge variant="outline" className="text-xs px-1.5 py-0">
                                  {expense.subCategoryName}
                                </Badge>
                              )}
                              {(expense.isRecurring || expense.isInstallment) && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {expense.isInstallment ? 'Rata' : 'Ricorrente'}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden desktop:table-cell">
                            {expense.notes ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium font-mono tabular-nums">
                            {formatCurrency(Math.abs(expense.amount))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// --- Presentational helpers -------------------------------------------------

/** One flat label→value row inside the secondary divide-y block. */
function FlatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono tabular-nums">{value}</span>
    </div>
  );
}

/** Signed delta chip for the hero. Up = more spending = destructive; down = positive. */
function DeltaChip({ deltaPct }: { deltaPct: number }) {
  const up = deltaPct > 0;
  const flat = Math.abs(deltaPct) < 0.005;
  return (
    <span
      className={cn(
        'text-[13px] font-semibold font-mono rounded-[9px] px-2.5 py-1',
        flat
          ? 'bg-muted text-muted-foreground'
          : up
            ? 'bg-destructive/10 text-destructive'
            : 'bg-positive/10 text-positive',
      )}
    >
      {flat ? '±0%' : `${up ? '+' : ''}${Math.round(deltaPct * 100)}%`}
      <span className="font-normal text-muted-foreground ml-1">vs precedente</span>
    </span>
  );
}

/** Thin budget meter. Functional (encodes spend vs ceiling), not decorative. */
function BudgetMeter({ ratio, status }: { ratio: number; status: 'ok' | 'warning' | 'over' }) {
  const pct = Math.min(100, Math.round(ratio * 100));
  const color =
    status === 'over' ? 'var(--destructive)' : status === 'warning' ? 'var(--chart-3)' : 'var(--positive)';
  return (
    <div
      className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

/** Structural skeleton matching hero + control + composition + chart. */
function DetailSkeleton() {
  return (
    <div className="space-y-8 animate-pulse" aria-hidden="true">
      <div className="space-y-3">
        <div className="h-3 w-24 bg-muted rounded" />
        <div className="h-10 w-48 bg-muted rounded" />
        <div className="h-32 bg-muted rounded-xl" />
      </div>
      <div className="grid gap-4 desktop:grid-cols-2">
        <div className="h-28 bg-muted rounded-xl" />
        <div className="h-28 bg-muted rounded-xl" />
      </div>
      <div className="h-52 bg-muted rounded-xl" />
    </div>
  );
}
