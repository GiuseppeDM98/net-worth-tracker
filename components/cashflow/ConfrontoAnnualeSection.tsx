/**
 * Year-over-year comparison section for AnalisiTab.
 *
 * Three display variants depending on periodMode:
 * - current/year: side-by-side bar chart (monthly or per-category toggle)
 * - history: multi-year annual totals bar chart
 *
 * Always rendered — shows "Dati insufficienti" placeholder when
 * comparison data doesn't exist (single year of history).
 *
 * Colors: chartColors[0] = current year, chartColors[1] = previous year.
 * Never hardcoded hex — always useChartColors() per AGENTS.md.
 */
'use client';

import { useMemo, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { type Expense } from '@/types/expenses';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { type PeriodMode } from '@/components/cashflow/AnalisiTab';
import { cn } from '@/lib/utils';

// ── Shared tooltip style ──────────────────────────────────────────────────────
// Defined once to avoid duplication across the three sub-charts.
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

// ── MensileBarChart ───────────────────────────────────────────────────────────

/**
 * Side-by-side monthly bar chart for YoY comparison.
 * Colors: colors[0] = current year, colors[1] = previous year.
 */
function MensileBarChart({
  data,
  currentYear,
  prevYear,
  colors,
}: {
  data: Array<{ month: string; current: number; prev: number }>;
  currentYear: number;
  prevYear: number;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 4, left: -16, bottom: 0 }}
        barCategoryGap="20%"
        barGap={2}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(Number(value ?? 0)),
            name === 'current' ? currentYear.toString() : prevYear.toString(),
          ]}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Legend
          formatter={(value) => (value === 'current' ? currentYear.toString() : prevYear.toString())}
          wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
        />
        <Bar
          dataKey="current"
          fill={colors[0] ?? '#6366f1'}
          animationDuration={600}
          animationEasing="ease-out"
          radius={[3, 3, 0, 0]}
        />
        <Bar
          dataKey="prev"
          fill={colors[1] ?? '#8b5cf6'}
          animationDuration={600}
          animationEasing="ease-out"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── CategoriaBarChart ─────────────────────────────────────────────────────────

/**
 * Horizontal grouped bar chart for category comparison.
 * layout="vertical" gives more room to category labels on mobile.
 */
function CategoriaBarChart({
  data,
  currentYear,
  prevYear,
  colors,
}: {
  data: Array<{ category: string; current: number; prev: number }>;
  currentYear: number;
  prevYear: number;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 4, left: 60, bottom: 0 }}
        barGap={2}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip
          formatter={(value, name) => [
            formatCurrency(Number(value ?? 0)),
            name === 'current' ? currentYear.toString() : prevYear.toString(),
          ]}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Legend
          formatter={(value) => (value === 'current' ? currentYear.toString() : prevYear.toString())}
          wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}
        />
        <Bar
          dataKey="current"
          fill={colors[0] ?? '#6366f1'}
          animationDuration={600}
          animationEasing="ease-out"
          radius={[0, 3, 3, 0]}
        />
        <Bar
          dataKey="prev"
          fill={colors[1] ?? '#8b5cf6'}
          animationDuration={600}
          animationEasing="ease-out"
          radius={[0, 3, 3, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── HistoryLineChart ──────────────────────────────────────────────────────────

/**
 * Multi-year annual totals bar chart for historical mode.
 * Single bar per year — no side-by-side comparison needed.
 */
function HistoryLineChart({
  data,
  colors,
}: {
  data: Array<{ year: string; spese: number }>;
  colors: string[];
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="year"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={formatCurrencyCompact}
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Spese']}
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: 'var(--muted)', fillOpacity: 0.4 }}
        />
        <Bar
          dataKey="spese"
          fill={colors[0] ?? '#6366f1'}
          animationDuration={600}
          animationEasing="ease-out"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── ConfrontoAnnualeSection ───────────────────────────────────────────────────

interface ConfrontoAnnualeSectionProps {
  allExpenses: Expense[];
  /** null only when periodMode === 'history' */
  selectedYear: number | null;
  selectedMonth: number | null;
  periodMode: PeriodMode;
  historyStartYear: number;
}

export function ConfrontoAnnualeSection({
  allExpenses,
  selectedYear,
  selectedMonth,
  periodMode,
  historyStartYear,
}: ConfrontoAnnualeSectionProps) {
  const chartColors = useChartColors();
  const [viewMode, setViewMode] = useState<'mensile' | 'categoria'>('mensile');

  // ── Derived year labels ───────────────────────────────────────────────────

  const currentYearLabel = useMemo(() => {
    if (periodMode === 'current') return getItalyYear();
    if (periodMode === 'year' && selectedYear !== null) return selectedYear;
    return null;
  }, [periodMode, selectedYear]);

  const prevYearLabel = useMemo(() => {
    return currentYearLabel !== null ? currentYearLabel - 1 : null;
  }, [currentYearLabel]);

  // ── hasComparisonData ─────────────────────────────────────────────────────
  // history mode needs ≥2 distinct years; current/year needs prev year present.

  const hasComparisonData = useMemo(() => {
    if (periodMode === 'history') {
      const years = new Set(allExpenses.map((e) => getItalyYear(toDate(e.date))));
      return years.size >= 2;
    }
    if (prevYearLabel === null) return false;
    return allExpenses.some((e) => getItalyYear(toDate(e.date)) === prevYearLabel);
  }, [allExpenses, periodMode, prevYearLabel]);

  // ── mensileData ───────────────────────────────────────────────────────────
  // For each month in range: total expenses (absolute) for current and prev year.
  // Future months in 'current' mode: currentValue stays 0 (no bars rendered by Recharts).

  const mensileData = useMemo(() => {
    if (periodMode === 'history' || currentYearLabel === null || prevYearLabel === null) return [];

    const maxMonth = periodMode === 'current' ? getItalyMonth() : 12;
    // Single-month selection: show only that month for direct comparison.
    const monthsToShow =
      selectedMonth !== null
        ? [selectedMonth]
        : Array.from({ length: maxMonth }, (_, i) => i + 1);

    return monthsToShow.map((month) => {
      // MONTH_NAMES is 0-indexed; slice to 3 chars for axis labels ("Gennaio" → "Gen").
      const monthName = MONTH_NAMES[month - 1].slice(0, 3);

      const currentValue = allExpenses
        .filter(
          (e) =>
            e.type !== 'income' && e.type !== 'transfer' &&
            getItalyYear(toDate(e.date)) === currentYearLabel &&
            getItalyMonth(toDate(e.date)) === month,
        )
        .reduce((s, e) => s + Math.abs(e.amount), 0);

      const prevValue = allExpenses
        .filter(
          (e) =>
            e.type !== 'income' && e.type !== 'transfer' &&
            getItalyYear(toDate(e.date)) === prevYearLabel &&
            getItalyMonth(toDate(e.date)) === month,
        )
        .reduce((s, e) => s + Math.abs(e.amount), 0);

      return { month: monthName, current: currentValue, prev: prevValue };
    });
  }, [allExpenses, currentYearLabel, prevYearLabel, periodMode, selectedMonth]);

  // ── categoriaData ─────────────────────────────────────────────────────────
  // Group expenses by category for both years. Cap at 8 — remainder → "Altro".

  const categoriaData = useMemo(() => {
    if (periodMode === 'history' || currentYearLabel === null || prevYearLabel === null) return [];

    // YTD comparison: only include months up to the current month in both years.
    const filterByYear = (year: number) =>
      allExpenses.filter((e) => {
        const d = toDate(e.date);
        if (e.type === 'income' || e.type === 'transfer') return false;
        if (getItalyYear(d) !== year) return false;
        if (periodMode === 'current') return getItalyMonth(d) <= getItalyMonth();
        if (selectedMonth !== null) return getItalyMonth(d) === selectedMonth;
        return true;
      });

    const currentExp = filterByYear(currentYearLabel);
    const prevExp = filterByYear(prevYearLabel);

    // Collect all categories present in either year to avoid silent omissions.
    const categories = new Set([
      ...currentExp.map((e) => e.categoryName),
      ...prevExp.map((e) => e.categoryName),
    ]);

    const data = Array.from(categories)
      .map((cat) => ({
        // Truncate long labels to keep the horizontal axis readable.
        category: cat.length > 12 ? cat.slice(0, 11) + '…' : cat,
        current: currentExp
          .filter((e) => e.categoryName === cat)
          .reduce((s, e) => s + Math.abs(e.amount), 0),
        prev: prevExp
          .filter((e) => e.categoryName === cat)
          .reduce((s, e) => s + Math.abs(e.amount), 0),
      }))
      .sort((a, b) => b.current - a.current);

    if (data.length <= 8) return data;

    // Group categories beyond the top 8 into a single "Altro" bucket.
    const top8 = data.slice(0, 8);
    const rest = data.slice(8);
    top8.push({
      category: 'Altro',
      current: rest.reduce((s, d) => s + d.current, 0),
      prev: rest.reduce((s, d) => s + d.prev, 0),
    });
    return top8;
  }, [allExpenses, currentYearLabel, prevYearLabel, periodMode, selectedMonth]);

  // ── multiYearData ─────────────────────────────────────────────────────────
  // Annual expense totals from historyStartYear forward — used only in history mode.

  const multiYearData = useMemo(() => {
    if (periodMode !== 'history') return [];

    const years = new Set(allExpenses.map((e) => getItalyYear(toDate(e.date))));
    return Array.from(years)
      .filter((y) => y >= historyStartYear)
      .sort((a, b) => b - a)
      .map((year) => ({
        year: year.toString(),
        spese: allExpenses
          .filter((e) => e.type !== 'income' && e.type !== 'transfer' && getItalyYear(toDate(e.date)) === year)
          .reduce((s, e) => s + Math.abs(e.amount), 0),
      }));
  }, [allExpenses, periodMode, historyStartYear]);

  // ── comparisonSubtitle ────────────────────────────────────────────────────
  // Contextual label under the card title ("2025 vs 2024", "Gen 2025 vs Gen 2024", etc.)

  const comparisonSubtitle = useMemo(() => {
    if (periodMode === 'history') return null;
    if (currentYearLabel === null || prevYearLabel === null) return null;
    if (selectedMonth !== null) {
      const monthName = MONTH_NAMES[selectedMonth - 1];
      return `${monthName} ${currentYearLabel} vs ${monthName} ${prevYearLabel}`;
    }
    if (periodMode === 'current') {
      return `${currentYearLabel} YTD vs ${prevYearLabel} (stessi mesi)`;
    }
    return `${currentYearLabel} vs ${prevYearLabel}`;
  }, [periodMode, currentYearLabel, prevYearLabel, selectedMonth]);

  // Type assertions are safe: currentYearLabel/prevYearLabel are non-null
  // whenever periodMode !== 'history' and hasComparisonData is true.
  const safeCurrentYear = currentYearLabel as number;
  const safePrevYear = prevYearLabel as number;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Confronto Annuale
          </CardTitle>

          {/* Toggle visible only in current/year mode — history uses its own single-chart layout */}
          {periodMode !== 'history' && (
            <SegmentedPill
              ariaLabel="Vista confronto"
              layoutId="confronto-view-pill"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'mensile', label: 'Mensile' },
                { value: 'categoria', label: 'Per Categoria' },
              ]}
            />
          )}
        </div>

        {comparisonSubtitle && (
          <p className="text-xs text-muted-foreground">{comparisonSubtitle}</p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Placeholder when not enough historical data for a meaningful comparison */}
        {!hasComparisonData && (
          <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
            {periodMode === 'history'
              ? 'Servono almeno 2 anni di dati per il confronto'
              : 'Servono dati sull’anno precedente per il confronto'}
          </div>
        )}

        {/* History mode: multi-year totals — no year toggle */}
        {periodMode === 'history' && hasComparisonData && (
          <HistoryLineChart data={multiYearData} colors={chartColors} />
        )}

        {/* Current/year mode: monthly side-by-side bars */}
        {periodMode !== 'history' && hasComparisonData && viewMode === 'mensile' && (
          <MensileBarChart
            data={mensileData}
            currentYear={safeCurrentYear}
            prevYear={safePrevYear}
            colors={chartColors}
          />
        )}

        {/* Current/year mode: per-category horizontal bars */}
        {periodMode !== 'history' && hasComparisonData && viewMode === 'categoria' && (
          <CategoriaBarChart
            data={categoriaData}
            currentYear={safeCurrentYear}
            prevYear={safePrevYear}
            colors={chartColors}
          />
        )}
      </CardContent>
    </Card>
  );
}
