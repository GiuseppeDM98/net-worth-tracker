/**
 * "Andamento nel Tempo" section for the Analisi tab (history mode only).
 *
 * Fills three gaps the existing history-mode charts left open:
 *  - Chart A: income vs expenses vs net savings in € over time (ComposedChart).
 *  - Chart B: per-category multi-line trend, switchable between income and expenses.
 *
 * A single Mese/Anno granularity toggle drives both charts. The time axis always
 * starts no earlier than `historyStartYear` (the "anno inizio storico cashflow"
 * setting) — see lib/utils/cashflowTimeSeries.ts.
 *
 * PATTERNS (AGENTS.md / sibling components):
 * - Chart sub-components are module-level (React Compiler: never nest components).
 * - Colours come exclusively from useChartColors() — no hardcoded hex.
 * - Recharts tooltips are styled via CSS vars, never inline hex.
 * - Pill toggles use the shared SegmentedPill (components/ui/segmented-pill.tsx).
 */
'use client';

import { useMemo, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { type Expense } from '@/types/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import {
  ComposedChart,
  LineChart,
  Line,
  Area,
  AreaChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import {
  buildTimeBuckets,
  buildCategoryTimeSeries,
  buildTypeTimeSeries,
  type TimeGranularity,
} from '@/lib/utils/cashflowTimeSeries';

// ── Shared tooltip style ──────────────────────────────────────────────────────
// Defined once (mirrors ConfrontoAnnualeSection) so all sub-charts stay consistent.
const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  color: 'var(--card-foreground)',
  fontSize: 12,
  borderRadius: 8,
} as const;

const TOOLTIP_LABEL_STYLE = { fontWeight: 600, color: 'var(--card-foreground)' } as const;

type CategoryChartType = 'expenses' | 'income';
type TypeChartView = 'absolute' | 'percent';

// ── FlowComposedChart ─────────────────────────────────────────────────────────
// Chart A: income/expense bars + net-savings line. Module-level (React Compiler).

function FlowComposedChart({
  data,
  colors,
}: {
  data: ReturnType<typeof buildTimeBuckets>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          // Keep the 0 baseline for the bars but extend below it when net savings
          // go negative (deficit period) so the risparmio line isn't clipped.
          domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(Number(value ?? 0)),
            name === 'income' ? 'Entrate' : name === 'expenses' ? 'Uscite' : 'Risparmio',
          ]}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Legend
          formatter={(value) =>
            value === 'income' ? 'Entrate' : value === 'expenses' ? 'Uscite' : 'Risparmio'
          }
          wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
        />
        <Bar dataKey="income" fill={colors[0] ?? '#6366f1'} radius={[3, 3, 0, 0]} animationDuration={600} animationEasing="ease-out" />
        <Bar dataKey="expenses" fill={colors[1] ?? '#8b5cf6'} radius={[3, 3, 0, 0]} animationDuration={600} animationEasing="ease-out" />
        <Line
          type="monotone"
          dataKey="net"
          stroke={colors[2] ?? '#10b981'}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          animationDuration={800}
          animationEasing="ease-out"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── CategoryLinesChart ────────────────────────────────────────────────────────
// Chart B: one line per category over time. Module-level (React Compiler).

function CategoryLinesChart({
  series,
  rows,
  colors,
  height,
}: {
  series: ReturnType<typeof buildCategoryTimeSeries>['series'];
  // Recharts wants row objects keyed by series name; we pivot in the parent.
  rows: Array<Record<string, string | number>>;
  colors: string[];
  height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          domain={['auto', 'auto']}
        />
        <Tooltip
          formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name)]}
          // Order tooltip rows by value (desc) so they mirror the vertical stacking
          // of the lines at the hovered point, instead of the fixed series order.
          itemSorter={(item) => -(item.value as number)}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        {series.map((s, i) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={colors[i % colors.length] ?? '#6366f1'}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            connectNulls
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── TypeCompositionChart ──────────────────────────────────────────────────────
// 100%-stacked area: the spending mix (Fisse/Variabili/Debiti) as a share of total
// per bucket, so diversification reads independently of the absolute spend level.
// Module-level (React Compiler).

function TypeCompositionChart({
  series,
  rows,
  colors,
  height,
}: {
  series: ReturnType<typeof buildTypeTimeSeries>['series'];
  // Rows are pre-normalised to percentages (0-100) per bucket in the parent.
  rows: Array<Record<string, string | number>>;
  colors: string[];
  height: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
        />
        <Tooltip
          formatter={(value, name) => [`${Number(value ?? 0).toFixed(1)}%`, String(name)]}
          itemSorter={(item) => -(item.value as number)}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }} />
        {series.map((s, i) => (
          <Area
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stackId="type-composition"
            stroke={colors[i % colors.length] ?? '#6366f1'}
            fill={colors[i % colors.length] ?? '#6366f1'}
            fillOpacity={0.7}
            strokeWidth={1.5}
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ── AndamentoStoricoSection ───────────────────────────────────────────────────

interface AndamentoStoricoSectionProps {
  allExpenses: Expense[];
  historyStartYear: number;
}

export function AndamentoStoricoSection({
  allExpenses,
  historyStartYear,
}: AndamentoStoricoSectionProps) {
  const chartColors = useChartColors();
  const isMobile = useMediaQuery('(max-width: 639px)');

  const [granularity, setGranularity] = useState<TimeGranularity>('year');
  const [categoryType, setCategoryType] = useState<CategoryChartType>('expenses');
  const [typeView, setTypeView] = useState<TypeChartView>('absolute');

  const flowData = useMemo(
    () => buildTimeBuckets(allExpenses, granularity, historyStartYear),
    [allExpenses, granularity, historyStartYear],
  );

  const categorySeries = useMemo(
    () => buildCategoryTimeSeries(allExpenses, granularity, categoryType, historyStartYear),
    [allExpenses, granularity, categoryType, historyStartYear],
  );

  // Pivot the per-series value arrays into Recharts row objects keyed by category name.
  // Each row carries the bucket label plus one numeric field per series.
  const categoryRows = useMemo(() => {
    return categorySeries.buckets.map((bucket, i) => {
      const row: Record<string, string | number> = { label: bucket.label };
      for (const s of categorySeries.series) row[s.name] = s.values[i];
      return row;
    });
  }, [categorySeries]);

  const typeSeries = useMemo(
    () => buildTypeTimeSeries(allExpenses, granularity, historyStartYear),
    [allExpenses, granularity, historyStartYear],
  );

  // Absolute-€ rows: one numeric field per spending type, aligned to the bucket axis.
  const typeRows = useMemo(() => {
    return typeSeries.buckets.map((bucket, i) => {
      const row: Record<string, string | number> = { label: bucket.label };
      for (const s of typeSeries.series) row[s.name] = s.values[i];
      return row;
    });
  }, [typeSeries]);

  // Percent-composition rows: each type as a share (0-100) of the bucket's total spend.
  // A zero-total bucket maps every type to 0 to avoid 0/0 = NaN.
  const typePercentRows = useMemo(() => {
    return typeSeries.buckets.map((bucket, i) => {
      const total = typeSeries.series.reduce((sum, s) => sum + s.values[i], 0);
      const row: Record<string, string | number> = { label: bucket.label };
      for (const s of typeSeries.series) {
        row[s.name] = total > 0 ? (s.values[i] / total) * 100 : 0;
      }
      return row;
    });
  }, [typeSeries]);

  // A single bucket can't show a trend — treat it as "not enough data".
  const hasFlowTrend = flowData.length >= 2;
  const hasCategoryTrend = categorySeries.buckets.length >= 2 && categorySeries.series.length > 0;
  const hasTypeTrend = typeSeries.buckets.length >= 2 && typeSeries.series.length > 0;

  const granularityLabel = granularity === 'year' ? 'per anno' : 'per mese';

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Chart A — Entrate / Uscite / Risparmio */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Entrate, Uscite e Risparmio
            </CardTitle>
            <SegmentedPill
              options={[
                { value: 'month', label: 'Mese' },
                { value: 'year', label: 'Anno' },
              ]}
              value={granularity}
              onChange={setGranularity}
              layoutId="andamento-granularity-pill"
              ariaLabel="Granularità temporale"
            />
          </div>
          <p className="text-xs text-muted-foreground">Andamento storico {granularityLabel}</p>
        </CardHeader>
        <CardContent className="pt-0">
          {hasFlowTrend ? (
            <FlowComposedChart data={flowData} colors={chartColors} />
          ) : (
            <EmptyState message="Servono almeno due periodi per mostrare l'andamento" />
          )}
        </CardContent>
      </Card>

      {/* Chart B — Per categoria (linee multiple) */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              {categoryType === 'expenses' ? 'Uscite per Categoria' : 'Entrate per Categoria'}
            </CardTitle>
            <SegmentedPill
              options={[
                { value: 'expenses', label: 'Uscite' },
                { value: 'income', label: 'Entrate' },
              ]}
              value={categoryType}
              onChange={setCategoryType}
              layoutId="andamento-category-pill"
              ariaLabel="Tipo di flusso"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Andamento storico {granularityLabel} · prime 6 categorie
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {hasCategoryTrend ? (
            <CategoryLinesChart
              series={categorySeries.series}
              rows={categoryRows}
              colors={chartColors}
              height={isMobile ? 240 : 300}
            />
          ) : (
            <EmptyState message="Servono almeno due periodi per mostrare l'andamento" />
          )}
        </CardContent>
      </Card>

      {/* Chart C — Per tipo di spesa (assoluto € o composizione 100%) */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Uscite per Tipo
            </CardTitle>
            <SegmentedPill
              options={[
                { value: 'absolute', label: '€' },
                { value: 'percent', label: '%' },
              ]}
              value={typeView}
              onChange={setTypeView}
              layoutId="andamento-type-view-pill"
              ariaLabel="Vista valore o composizione"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {typeView === 'percent'
              ? `Composizione spesa ${granularityLabel} · Fisse / Variabili / Debiti`
              : `Andamento storico ${granularityLabel} · Fisse / Variabili / Debiti`}
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {hasTypeTrend ? (
            typeView === 'percent' ? (
              <TypeCompositionChart
                series={typeSeries.series}
                rows={typePercentRows}
                colors={chartColors}
                height={isMobile ? 240 : 300}
              />
            ) : (
              <CategoryLinesChart
                series={typeSeries.series}
                rows={typeRows}
                colors={chartColors}
                height={isMobile ? 240 : 300}
              />
            )
          ) : (
            <EmptyState message="Servono almeno due periodi per mostrare l'andamento" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
