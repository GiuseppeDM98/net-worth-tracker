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
 * - The plots live in AndamentoStoricoCharts.tsx and load lazily, module-level (React Compiler: never nest components).
 * - Colours come exclusively from useChartColors() — no hardcoded hex.
 * - Recharts tooltips are styled via CSS vars, never inline hex.
 * - Pill toggles use the shared SegmentedPill (components/ui/segmented-pill.tsx).
 */
'use client';

import { useMemo, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { type Expense } from '@/types/expenses';
import { Tile } from '@/components/ui/tile';
import { Skeleton } from '@/components/ui/skeleton';
import { lazyComponent } from '@/components/ui/lazy-component';
import { AsideToggle } from '@/components/cashflow/analisi/AsideToggle';
import {
  buildTimeBuckets,
  buildCategoryTimeSeries,
  buildTypeTimeSeries,
  type TimeGranularity,
} from '@/lib/utils/cashflowTimeSeries';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

/** Chart A's height; B and C take 240 on a phone and 300 above it (`seriesChartHeight`). */
const FLOW_CHART_HEIGHT = 280;

/**
 * The three plots are not in the page's initial JavaScript (PERF-04, 2026-09-30): `lazyComponent` at
 * module level (AGENTS.md § Dynamic Imports and Module Hygiene), preloaded when the page is idle by
 * `DettaglioDisclosure` (`ANDAMENTO_LAZY_CHARTS`). Each sits in a box of its own height and the
 * placeholder fills the box, so a plot lands in place; the box, not the placeholder, knows the
 * height, because B and C change theirs with the width.
 */
const chartSlotPlaceholder = <Skeleton className="h-full w-full" />;
const FlowComposedChart = lazyComponent(() => import('@/components/cashflow/AndamentoStoricoCharts').then((m) => m.FlowComposedChart));
const CategoryLinesChart = lazyComponent(() => import('@/components/cashflow/AndamentoStoricoCharts').then((m) => m.CategoryLinesChart));
const TypeCompositionChart = lazyComponent(() => import('@/components/cashflow/AndamentoStoricoCharts').then((m) => m.TypeCompositionChart));
export const ANDAMENTO_LAZY_CHARTS = [FlowComposedChart, CategoryLinesChart, TypeCompositionChart];

type CategoryChartType = 'expenses' | 'income';
type TypeChartView = 'absolute' | 'percent';

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

  // The axis closes on today's month: a materialised plan reaching 2043 is a calendar, not
  // history, and drew seventeen empty years here (2026-09-14). Read once — today is stable
  // within a render session.
  const ceiling = useMemo(() => getItalyMonthYear(), []);

  const flowData = useMemo(
    () => buildTimeBuckets(allExpenses, granularity, historyStartYear, ceiling),
    [allExpenses, granularity, historyStartYear, ceiling],
  );

  const categorySeries = useMemo(
    () => buildCategoryTimeSeries(allExpenses, granularity, categoryType, historyStartYear, 6, ceiling),
    [allExpenses, granularity, categoryType, historyStartYear, ceiling],
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
    () => buildTypeTimeSeries(allExpenses, granularity, historyStartYear, ceiling),
    [allExpenses, granularity, historyStartYear, ceiling],
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
  const seriesChartHeight = isMobile ? 240 : 300;

  return (
    <div className="flex flex-col gap-3">
      {/* Chart A — Entrate / Uscite / Risparmio */}
      <Tile
        eyebrow="Entrate, uscite e risparmio"
        aside={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span>andamento storico {granularityLabel}</span>
            <AsideToggle
              options={[
                { value: 'month', label: 'Mese' },
                { value: 'year', label: 'Anno' },
              ]}
              value={granularity}
              onChange={setGranularity}
              ariaLabel="Granularità temporale"
            />
          </div>
        }
      >
        <div className="mt-3">
          {hasFlowTrend ? (
            <div style={{ height: FLOW_CHART_HEIGHT }}>
              <FlowComposedChart data={flowData} colors={chartColors} height={FLOW_CHART_HEIGHT} fallback={chartSlotPlaceholder} />
            </div>
          ) : (
            <EmptyState message="Servono almeno due periodi per mostrare l'andamento" />
          )}
        </div>
      </Tile>

      {/* Chart B — Per categoria (linee multiple) */}
      <Tile
        eyebrow={categoryType === 'expenses' ? 'Uscite per categoria' : 'Entrate per categoria'}
        aside={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span>andamento storico {granularityLabel} · prime 6 categorie</span>
            <AsideToggle
              options={[
                { value: 'expenses', label: 'Uscite' },
                { value: 'income', label: 'Entrate' },
              ]}
              value={categoryType}
              onChange={setCategoryType}
              ariaLabel="Tipo di flusso"
            />
          </div>
        }
      >
        <div className="mt-3">
          {hasCategoryTrend ? (
            <div style={{ height: seriesChartHeight }}>
              <CategoryLinesChart series={categorySeries.series} rows={categoryRows} colors={chartColors} height={seriesChartHeight} fallback={chartSlotPlaceholder} />
            </div>
          ) : (
            <EmptyState message="Servono almeno due periodi per mostrare l'andamento" />
          )}
        </div>
      </Tile>

      {/* Chart C — Per tipo di spesa (assoluto € o composizione 100%) */}
      <Tile
        eyebrow="Uscite per tipo"
        aside={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span>
              {typeView === 'percent' ? 'composizione' : 'andamento storico'} {granularityLabel} · fisse / variabili / debiti
            </span>
            <AsideToggle
              options={[
                { value: 'absolute', label: '€' },
                { value: 'percent', label: '%' },
              ]}
              value={typeView}
              onChange={setTypeView}
              ariaLabel="Vista valore o composizione"
            />
          </div>
        }
      >
        <div className="mt-3">
          {hasTypeTrend ? (
            <div style={{ height: seriesChartHeight }}>
              {typeView === 'percent' ? (
                <TypeCompositionChart series={typeSeries.series} rows={typePercentRows} colors={chartColors} height={seriesChartHeight} fallback={chartSlotPlaceholder} />
              ) : (
                <CategoryLinesChart series={typeSeries.series} rows={typeRows} colors={chartColors} height={seriesChartHeight} fallback={chartSlotPlaceholder} />
              )}
            </div>
          ) : (
            <EmptyState message="Servono almeno due periodi per mostrare l'andamento" />
          )}
        </div>
      </Tile>
    </div>
  );
}
