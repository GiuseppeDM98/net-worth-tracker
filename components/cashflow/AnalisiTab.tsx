/**
 * Unified cashflow analysis tab
 *
 * THREE PERIOD MODES:
 * - "Anno Corrente": current year, all months (selectedYear = current, selectedMonth = null)
 * - "Anno": user-selected year + optional month
 * - "Storico": all available data (selectedYear = null)
 *
 * Merges the logic from the former CurrentYearTab and TotalHistoryTab into a single
 * component with a segmented pill selector at the top. The drill-down state machine,
 * Sankey chart, and trend charts are preserved in full.
 *
 * DRILL-DOWN STATE MACHINE:
 * Level 1 (category) → Level 2 (subcategory) → Level 3 (expenseList)
 * Back button returns one level at a time.
 * Drill-down resets on every period change.
 *
 * TREND SECTION:
 * Collapsible (open=false by default) to reduce initial cognitive load.
 * Contains monthly + yearly trend charts, grouped by type and category.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { MONTH_NAMES } from '@/lib/constants/months';
import { AnimatePresence, motion } from 'framer-motion';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { calculateTotalExpenses, calculateTotalIncome } from '@/lib/services/expenseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronLeft, ExternalLink } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  PieChart as RechartsPC,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/services/chartService';
import { getItalyMonth, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { CashflowSankeyChart } from '@/components/cashflow/CashflowSankeyChart';
import { ConfrontoAnnualeSection } from '@/components/cashflow/ConfrontoAnnualeSection';
import { SavingsRateTrendSection } from '@/components/cashflow/SavingsRateTrendSection';
import { CategoryTrendsGrid } from '@/components/cashflow/CategoryTrendsGrid';
import { AnomalieBlock, AnomaliaItem } from '@/components/cashflow/AnomalieBlock';
import { chartShellSettle, fadeVariants } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';

interface ChartData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}


const ChartTooltip = ({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string; fill?: string; payload?: { fill?: string } }>;
  label?: string | number;
  formatter?: (value: number) => string;
}) => {
  if (!active || !payload || !payload.length) return null;
  const fmt = formatter ?? formatCurrency;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-sm min-w-[140px]">
      {label !== undefined && (
        <p className="font-medium text-popover-foreground mb-1">{label}</p>
      )}
      {payload.map((entry, index) => {
        const color = entry.color || entry.fill || entry.payload?.fill || 'var(--popover-foreground)';
        return (
          <p key={index} className="tabular-nums" style={{ color }}>
            {entry.name} : {fmt(entry.value)}
          </p>
        );
      })}
    </div>
  );
};

type DrillDownLevel = 'category' | 'subcategory' | 'expenseList';
type ChartType = 'expenses' | 'income';

interface DrillDownState {
  level: DrillDownLevel;
  chartType: ChartType | null;
  selectedCategory: string | null;
  selectedCategoryColor: string | null;
  selectedSubCategory: string | null;
}

export type PeriodMode = 'current' | 'year' | 'history';

// ── TopExpenseRow ────────────────────────────────────────────────────────────
// Module-level component required by React Compiler (no nested components).

function TopExpenseRow({ expense }: { expense: Expense }) {
  const date = toDate(expense.date);
  const dateStr = format(date, 'd MMM', { locale: it });
  const typeLabel = EXPENSE_TYPE_LABELS[expense.type as ExpenseType] ?? expense.type;

  return (
    <div className="flex items-center justify-between px-6 py-3.5 gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{dateStr}</span>
          <span className="text-sm font-medium text-foreground truncate">{expense.categoryName}</span>
          {expense.subCategoryName && (
            <span className="text-xs text-muted-foreground truncate">{'·'} {expense.subCategoryName}</span>
          )}
          <span className="text-xs text-muted-foreground/60 shrink-0">[{typeLabel}]</span>
        </div>
        {expense.notes && (
          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{expense.notes}</p>
        )}
      </div>
      <span className="text-sm font-semibold font-mono tabular-nums text-destructive shrink-0">
        {formatCurrency(Math.abs(expense.amount))}
      </span>
    </div>
  );
}

// ── TopExpensesBlock ─────────────────────────────────────────────────────────
// Shows top N expenses for the selected period, sorted by absolute amount desc.
// Default: 5 visible + collapsible "Mostra tutte" for the rest.

const TOP_EXPENSES_DEFAULT_LIMIT = 5;

function TopExpensesBlock({
  expenses,
  periodLabel,
}: {
  expenses: Expense[];
  periodLabel: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? expenses : expenses.slice(0, TOP_EXPENSES_DEFAULT_LIMIT);

  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 flex items-center justify-between border-b border-border">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
            Spese Maggiori
          </p>
          <p className="text-sm font-medium text-foreground">{periodLabel}</p>
        </div>
        <span className="text-xs text-muted-foreground">{expenses.length} spese</span>
      </div>
      <div className="divide-y divide-border">
        {visible.map(e => (
          <TopExpenseRow key={e.id} expense={e} />
        ))}
      </div>
      {expenses.length > TOP_EXPENSES_DEFAULT_LIMIT && (
        <div className="px-6 py-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="w-full text-muted-foreground"
            aria-expanded={showAll}
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? 'Mostra meno' : `Mostra tutte (${expenses.length})`}
            <ChevronDown className={cn('h-4 w-4 ml-1 transition-transform duration-200 motion-reduce:transition-none', showAll && 'rotate-180')} />
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Pure chart-data helpers (module-level for stable references) ─────────────
// Each takes `colors` explicitly so useMemo deps are correct when the theme
// switches — avoids re-renders on unrelated state changes.

function getExpensesByCategory(expenses: Expense[], colors: string[]): ChartData[] {
  const categoryMap = new Map<string, number>();
  expenses.filter(e => e.type !== 'income').forEach(e => {
    categoryMap.set(e.categoryName, (categoryMap.get(e.categoryName) || 0) + Math.abs(e.amount));
  });
  const total = Array.from(categoryMap.values()).reduce((s, v) => s + v, 0);
  return Array.from(categoryMap.entries())
    .map(([name, value], index) => ({
      name, value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: colors[index % colors.length],
    }))
    .sort((a, b) => b.value - a.value);
}

function getIncomeByCategory(expenses: Expense[], colors: string[]): ChartData[] {
  const categoryMap = new Map<string, number>();
  expenses.filter(e => e.type === 'income').forEach(e => {
    categoryMap.set(e.categoryName, (categoryMap.get(e.categoryName) || 0) + e.amount);
  });
  const total = Array.from(categoryMap.values()).reduce((s, v) => s + v, 0);
  return Array.from(categoryMap.entries())
    .map(([name, value], index) => ({
      name, value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: colors[index % colors.length],
    }))
    .sort((a, b) => b.value - a.value);
}

function getExpensesByType(expenses: Expense[], colors: string[]): ChartData[] {
  const typeMap = new Map<string, number>();
  expenses.filter(e => e.type !== 'income').forEach(e => {
    const label = EXPENSE_TYPE_LABELS[e.type as ExpenseType] || e.type;
    typeMap.set(label, (typeMap.get(label) || 0) + Math.abs(e.amount));
  });
  const total = Array.from(typeMap.values()).reduce((s, v) => s + v, 0);
  return Array.from(typeMap.entries())
    .map(([name, value], index) => ({
      name, value,
      percentage: total > 0 ? (value / total) * 100 : 0,
      color: colors[index % colors.length],
    }))
    .sort((a, b) => b.value - a.value);
}

// ── LegendItems ──────────────────────────────────────────────────────────────
// Module-level component so the Legend content= prop gets a stable reference.
// Clickable items render as <button> for keyboard accessibility (WCAG 2.1.1).

function LegendItems({
  items,
  onItemClick,
  className,
  maxItems,
  isMobile,
}: {
  items: ChartData[];
  onItemClick?: (item: ChartData) => void;
  className?: string;
  maxItems?: number;
  isMobile: boolean;
}) {
  const filtered = items.filter(item => item.percentage >= 5).sort((a, b) => b.value - a.value);
  const visible = maxItems ? filtered.slice(0, maxItems) : filtered;
  const baseClass = isMobile ? 'mt-4 flex flex-wrap gap-3' : 'pl-5';
  return (
    <div className={cn(baseClass, className)}>
      {visible.map((item, index) =>
        onItemClick ? (
          <button
            key={`legend-${index}`}
            type="button"
            className="flex items-center gap-2 text-sm text-left"
            onClick={() => onItemClick(item)}
            aria-label={`Filtra per ${item.name} (${item.percentage.toFixed(1)}%)`}
          >
            <div className="h-3.5 w-3.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.name} ({item.percentage.toFixed(1)}%)</span>
          </button>
        ) : (
          <div key={`legend-${index}`} className="flex items-center gap-2 text-sm">
            <div className="h-3.5 w-3.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.name} ({item.percentage.toFixed(1)}%)</span>
          </div>
        )
      )}
    </div>
  );
}

interface AnalisiTabProps {
  allExpenses: Expense[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  historyStartYear?: number;
}

export function AnalisiTab({ allExpenses, loading, historyStartYear = 2024 }: AnalisiTabProps) {
  const COLORS = useChartColors();
  const controlClassName = 'transition-colors duration-200 border-border/70 hover:border-primary/40 focus-visible:ring-primary/30 data-[placeholder]:text-muted-foreground';

  const currentYear = getItalyYear();

  // Three-state period selector
  const [periodMode, setPeriodMode] = useState<PeriodMode>('current');
  const [selectedYear, setSelectedYear] = useState<number | null>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // useMediaQuery avoids the manual matchMedia + listener pattern and integrates with the
  // project's standard breakpoint hook (all callers are 'use client' post-login).
  const isMobile = useMediaQuery('(max-width: 639px)');

  // Drill-down state machine
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    level: 'category',
    chartType: null,
    selectedCategory: null,
    selectedCategoryColor: null,
    selectedSubCategory: null,
  });

  const expensesChartRef = useRef<HTMLDivElement>(null);
  const incomeChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (drillDown.level !== 'category' && drillDown.chartType) {
      const targetRef = drillDown.chartType === 'expenses' ? expensesChartRef : incomeChartRef;
      if (targetRef.current) {
        setTimeout(() => {
          targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [drillDown.level, drillDown.chartType]);

  const resetDrillDown = () => {
    setDrillDown({
      level: 'category',
      chartType: null,
      selectedCategory: null,
      selectedCategoryColor: null,
      selectedSubCategory: null,
    });
  };

  const handlePeriodModeChange = (mode: PeriodMode) => {
    setPeriodMode(mode);
    if (mode === 'current') {
      setSelectedYear(currentYear);
      setSelectedMonth(null);
    } else if (mode === 'history') {
      setSelectedYear(null);
      setSelectedMonth(null);
    } else if (mode === 'year') {
      // Initialize to the most recent *past* year — current year is handled by "Anno Corrente"
      const firstPastYear = availableYears.find(y => y < currentYear) ?? currentYear - 1;
      setSelectedYear(firstPastYear);
      setSelectedMonth(null);
    }
    resetDrillDown();
  };

  // True whenever a month filter is active — drives the "Ripristina" button
  // in both "Anno Corrente" (month picker) and "Anno" (year + month picker)
  const isMonthFiltered = selectedMonth !== null;

  const handleResetFilters = () => {
    // Clear month only — year is intentional in "Anno" mode, currentYear is fixed in "Anno Corrente"
    setSelectedMonth(null);
    resetDrillDown();
  };

  const handleYearChange = (value: string) => {
    setSelectedYear(parseInt(value));
    setSelectedMonth(null);
    resetDrillDown();
  };

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value === '__all__' ? null : parseInt(value));
    resetDrillDown();
  };

  // Data visible in "Analisi Periodo" section — respects historyStartYear filter
  const baseExpenses = useMemo(() => {
    return allExpenses.filter(e => getItalyYear(toDate(e.date)) >= historyStartYear);
  }, [allExpenses, historyStartYear]);

  // All years with data — used for baseExpenses filtering and "Anno Corrente" context.
  // The "Anno" dropdown uses pastYears (excludes currentYear) since Anno Corrente
  // is the dedicated entry point for the current year.
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    baseExpenses.forEach(e => years.add(getItalyYear(toDate(e.date))));
    return Array.from(years).sort((a, b) => b - a);
  }, [baseExpenses]);

  const pastYears = useMemo(
    () => availableYears.filter(y => y < currentYear),
    [availableYears, currentYear]
  );

  const periodFilteredExpenses = useMemo(() => {
    if (selectedYear === null) return baseExpenses;
    return baseExpenses.filter(e => {
      const date = toDate(e.date);
      if (getItalyYear(date) !== selectedYear) return false;
      if (selectedMonth !== null && getItalyMonth(date) !== selectedMonth) return false;
      return true;
    });
  }, [baseExpenses, selectedYear, selectedMonth]);

  const periodLabel = selectedYear === null
    ? 'Storico Completo'
    : selectedMonth
      ? `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`
      : `${selectedYear}`;

  const totalIncome = calculateTotalIncome(periodFilteredExpenses);
  const totalExpenses = calculateTotalExpenses(periodFilteredExpenses);
  const netBalance = totalIncome - totalExpenses;
  // Savings rate as percentage (0–100). Drives the hero KPI color threshold.
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

  // Sort non-income expenses by amount ascending — most negative amount = largest expense first
  const topExpenses = useMemo(() => {
    return periodFilteredExpenses
      .filter(e => e.type !== 'income')
      .sort((a, b) => a.amount - b.amount);
  }, [periodFilteredExpenses]);

  // Memoized pie chart datasets — computed here (before early returns) so hooks
  // are never called conditionally and renders inside drill-down don't recompute.
  const expensesByCategoryData = useMemo(
    () => getExpensesByCategory(periodFilteredExpenses, COLORS),
    [periodFilteredExpenses, COLORS]
  );
  const incomeByCategoryData = useMemo(
    () => getIncomeByCategory(periodFilteredExpenses, COLORS),
    [periodFilteredExpenses, COLORS]
  );
  const expensesByTypeData = useMemo(
    () => getExpensesByType(periodFilteredExpenses, COLORS),
    [periodFilteredExpenses, COLORS]
  );

  /**
   * Compute spending anomalies for the current month context.
   *
   * Anomalies are only meaningful at a monthly granularity.
   * For annual or historical views, returns empty array.
   *
   * Algorithm: for each expense category in the anomaly month,
   * compare current month total vs rolling 6-month average.
   * Flag if delta > 25% AND absolute delta > €50.
   * Skip categories with fewer than 3 months of history.
   */
  const anomalieData = useMemo<AnomaliaItem[]>(() => {
    // Determine the anomaly month based on the current period mode
    let anomalyMonth: number | null = null;
    let anomalyYear: number | null = null;

    if (periodMode === 'current') {
      anomalyMonth = getItalyMonth();
      anomalyYear = getItalyYear();
    } else if (periodMode === 'year' && selectedMonth !== null && selectedYear !== null) {
      anomalyMonth = selectedMonth;
      anomalyYear = selectedYear;
    } else {
      return []; // Annual or historical view — no anomaly detection
    }

    // Collect non-income expenses for the anomaly month
    const anomalyExpenses = allExpenses.filter(e => {
      const d = toDate(e.date);
      return (
        e.type !== 'income' &&
        getItalyYear(d) === anomalyYear &&
        getItalyMonth(d) === anomalyMonth
      );
    });

    // Build per-category totals for the anomaly month
    const currentTotals = new Map<string, number>();
    anomalyExpenses.forEach(e => {
      currentTotals.set(e.categoryName, (currentTotals.get(e.categoryName) ?? 0) + Math.abs(e.amount));
    });

    if (currentTotals.size === 0) return [];

    // Build 6-month reference window immediately preceding the anomaly month.
    // We iterate backward from anomalyMonth-1, wrapping across year boundaries.
    const referenceMonths: Array<{ year: number; month: number }> = [];
    let refYear = anomalyYear!;
    let refMonth = anomalyMonth! - 1;
    for (let i = 0; i < 6; i++) {
      if (refMonth < 1) { refMonth = 12; refYear--; }
      referenceMonths.push({ year: refYear, month: refMonth });
      refMonth--;
    }

    // For each category in the anomaly month, check against the reference window
    const results: AnomaliaItem[] = [];

    currentTotals.forEach((currentTotal, category) => {
      const monthlyTotals = referenceMonths.map(({ year, month }) => {
        return allExpenses
          .filter(e => {
            const d = toDate(e.date);
            return (
              e.type !== 'income' &&
              e.categoryName === category &&
              getItalyYear(d) === year &&
              getItalyMonth(d) === month
            );
          })
          .reduce((s, e) => s + Math.abs(e.amount), 0);
      });

      const monthsWithData = monthlyTotals.filter(t => t > 0).length;
      // Skip categories with insufficient history — too new or too irregular
      if (monthsWithData < 3) return;

      // Average over all 6 months (not just months with data) — penalizes sparse spenders
      const referenceAverage = monthlyTotals.reduce((s, t) => s + t, 0) / 6;
      // Skip if category was never spent before — avoids division by zero
      if (referenceAverage === 0) return;

      const deltaPercent = ((currentTotal - referenceAverage) / referenceAverage) * 100;
      const absoluteDelta = currentTotal - referenceAverage;

      // Only flag increases: reductions are good news, not anomalies (v1)
      if (deltaPercent > 25 && absoluteDelta > 50) {
        results.push({ category, currentTotal, referenceAverage, deltaPercent, absoluteDelta });
      }
    });

    return results.sort((a, b) => b.deltaPercent - a.deltaPercent);
  }, [allExpenses, periodMode, selectedMonth, selectedYear]);

  // Ref for scrolling to the distribution section (Sankey + Pie) from anomaly chips
  const distributionRef = useRef<HTMLDivElement>(null);

  /**
   * Navigate from anomaly chip to the pie chart drill-down for that category.
   * Scrolls to the distribution section and pre-selects the category.
   * Uses 'instant' (not 'smooth') per AGENTS.md scrollIntoView convention.
   */
  const handleAnomaliaClick = useCallback((categoryName: string) => {
    // Use the already-memoized pie data to look up the category color — avoids
    // re-running the full aggregation inside a callback.
    const categoryColor = expensesByCategoryData
      .find(d => d.name === categoryName)?.color ?? COLORS[0];

    // Pre-select the category in the drill-down state machine
    setDrillDown({
      level: 'subcategory',
      chartType: 'expenses',
      selectedCategory: categoryName,
      selectedCategoryColor: categoryColor,
      selectedSubCategory: null,
    });

    // Scroll to distribution section after state update settles
    setTimeout(() => {
      distributionRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, 50);
  }, [expensesByCategoryData, COLORS]);

  // ── Pie/drill-down helpers ─────────────────────────────────────────────

  const deriveSubcategoryColors = (baseColor: string, count: number): string[] => {
    if (count === 0) return [];
    return Array.from({ length: count }, (_, i) => {
      const opacity = 0.4 + (i / Math.max(count - 1, 1)) * 0.6;
      const hex = baseColor.startsWith('#') ? baseColor : '#6366f1';
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${opacity.toFixed(2)})`;
    });
  };

  const getSubcategoriesData = (expenses: Expense[], categoryName: string, chartType: ChartType): ChartData[] => {
    const filtered = expenses.filter(e =>
      e.categoryName === categoryName &&
      (chartType === 'income' ? e.type === 'income' : e.type !== 'income')
    );
    const total = filtered.reduce((s, e) => s + Math.abs(e.amount), 0);
    const subcategoryMap = new Map<string, number>();
    filtered.forEach(e => {
      const name = e.subCategoryName || 'Altro';
      subcategoryMap.set(name, (subcategoryMap.get(name) || 0) + Math.abs(e.amount));
    });
    const baseColor = drillDown.selectedCategoryColor || COLORS[0];
    const colors = deriveSubcategoryColors(baseColor, subcategoryMap.size);
    let colorIndex = 0;
    const data: ChartData[] = [];
    subcategoryMap.forEach((value, name) => {
      data.push({ name, value, percentage: total > 0 ? (value / total) * 100 : 0, color: colors[colorIndex++ % colors.length] });
    });
    return data.sort((a, b) => b.value - a.value);
  };

  const getFilteredExpenses = (): Expense[] => {
    if (!drillDown.selectedCategory) return [];
    return periodFilteredExpenses.filter(e => {
      if (e.categoryName !== drillDown.selectedCategory) return false;
      if (drillDown.chartType === 'income' ? e.type !== 'income' : e.type === 'income') return false;
      if (drillDown.selectedSubCategory) {
        if (drillDown.selectedSubCategory === 'Altro') return !e.subCategoryName;
        return e.subCategoryName === drillDown.selectedSubCategory;
      }
      return true;
    });
  };

  const handleCategoryClick = (data: ChartData, chartType: ChartType) => {
    setDrillDown({ level: 'subcategory', chartType, selectedCategory: data.name, selectedCategoryColor: data.color, selectedSubCategory: null });
  };

  const handleSubcategoryClick = (data: ChartData) => {
    setDrillDown(prev => ({ ...prev, level: 'expenseList', selectedSubCategory: data.name }));
  };

  const handleBack = () => {
    if (drillDown.level === 'expenseList') {
      setDrillDown(prev => ({ ...prev, level: 'subcategory', selectedSubCategory: null }));
    } else if (drillDown.level === 'subcategory') {
      resetDrillDown();
    }
  };

  // ── Computed chart data ────────────────────────────────────────────────

  const currentSubcategoriesData = drillDown.level === 'subcategory' && drillDown.selectedCategory && drillDown.chartType
    ? getSubcategoriesData(periodFilteredExpenses, drillDown.selectedCategory, drillDown.chartType)
    : [];

  const currentFilteredExpenses = drillDown.level === 'expenseList' ? getFilteredExpenses() : [];

  const pieChartHeight = isMobile ? 320 : 500;
  const pieOuterRadius = isMobile ? 110 : 140;

  // Show structural skeleton only on initial load (no data yet).
  // Re-fetches while data is present show stale data, not a skeleton — avoids jarring blank flash.
  if (loading && allExpenses.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Period pill placeholder */}
        <div className="h-9 w-64 rounded-full bg-muted" />
        {/* Hero KPI trio */}
        <div className="grid grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
          {[0, 1, 2].map(i => (
            <div key={i} className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 space-y-2">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-8 w-28 rounded bg-muted" />
            </div>
          ))}
        </div>
        {/* Sankey placeholder */}
        <div className="h-64 rounded-xl bg-muted" />
        {/* Charts placeholder */}
        <div className="grid gap-4 desktop:grid-cols-2">
          <div className="h-48 rounded-xl bg-muted" />
          <div className="h-48 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (allExpenses.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-muted-foreground">Nessun dato disponibile.</p>
        <p className="text-sm text-muted-foreground mt-2">Aggiungi alcune spese per visualizzare le analisi.</p>
      </div>
    );
  }

  // ── Drill-down breadcrumb path ─────────────────────────────────────────
  // Wrapped in <nav> so screen readers announce it as a navigation landmark.
  // Separator spans are aria-hidden — they're purely visual dividers.
  const drillBreadcrumb = drillDown.level !== 'category' && drillDown.chartType ? (
    <nav aria-label="Posizione nel drill-down">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <button
          className="hover:text-foreground transition-colors"
          onClick={resetDrillDown}
        >
          {drillDown.chartType === 'expenses' ? 'Spese' : 'Entrate'}
        </button>
        {drillDown.selectedCategory && (
          <>
            <span className="text-border" aria-hidden="true">/</span>
            <button
              className="hover:text-foreground transition-colors"
              onClick={() => setDrillDown(prev => ({ ...prev, level: 'subcategory', selectedSubCategory: null }))}
            >
              {drillDown.selectedCategory}
            </button>
          </>
        )}
        {drillDown.level === 'expenseList' && drillDown.selectedSubCategory && (
          <>
            <span className="text-border" aria-hidden="true">/</span>
            <span className="text-foreground font-medium">{drillDown.selectedSubCategory}</span>
          </>
        )}
      </div>
    </nav>
  ) : null;

  return (
    <div className="space-y-6">
      {/* ── Period selector ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Three-state pill */}
        <div
          role="tablist"
          aria-label="Periodo di analisi"
          className="inline-flex items-center gap-1 rounded-full bg-muted p-1"
        >
          {([
            ['current', 'Anno Corrente'],
            ['year', 'Anno'],
            ['history', 'Storico'],
          ] as [PeriodMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={periodMode === mode}
              onClick={() => handlePeriodModeChange(mode)}
              className={cn(
                'relative px-3 py-1.5 text-sm font-medium rounded-full transition-colors',
                periodMode === mode
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {periodMode === mode && (
                <motion.span
                  layoutId="analisi-period-pill"
                  className="absolute inset-0 rounded-full bg-background shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>

        {/* Month picker — wrapped in AnimatePresence so the exit animation plays
            when switching between period modes (not just on mount). */}
        <AnimatePresence mode="wait">
        {periodMode === 'current' && (
          <motion.div
            key="picker-current"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <Select
              value={selectedMonth?.toString() || '__all__'}
              onValueChange={handleMonthChange}
            >
              <SelectTrigger className={cn('w-full sm:w-[160px]', controlClassName)}>
                <SelectValue placeholder="Tutto l'anno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutto l&apos;anno</SelectItem>
                {MONTH_NAMES.map((month, index) => (
                  <SelectItem key={index + 1} value={(index + 1).toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isMonthFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-muted-foreground hover:text-foreground whitespace-nowrap self-start sm:self-auto"
              >
                Ripristina
              </Button>
            )}
          </motion.div>
        )}

        {/* Year + Month dropdowns — "Anno" mode (past years only) */}
        {periodMode === 'year' && (
          <motion.div
            key="picker-year"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <Select
              value={selectedYear?.toString() || pastYears[0]?.toString()}
              onValueChange={handleYearChange}
            >
              <SelectTrigger className={cn('w-full sm:w-[140px]', controlClassName)}>
                <SelectValue placeholder="Anno" />
              </SelectTrigger>
              <SelectContent>
                {/* currentYear excluded — Anno Corrente is the dedicated entry point */}
                {pastYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedMonth?.toString() || '__all__'}
              onValueChange={handleMonthChange}
              disabled={selectedYear === null}
            >
              <SelectTrigger className={cn('w-full sm:w-[160px]', controlClassName)}>
                <SelectValue placeholder="Tutto l'anno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutto l&apos;anno</SelectItem>
                {MONTH_NAMES.map((month, index) => (
                  <SelectItem key={index + 1} value={(index + 1).toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isMonthFiltered && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="text-muted-foreground hover:text-foreground whitespace-nowrap self-start sm:self-auto"
              >
                Ripristina
              </Button>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* ── Hero KPI trio ─────────────────────────────────────────────── */}
      {/* Three dominant metrics in flat layout (Trade Republic hierarchy).
          Mobile: stacked rows (full width). Desktop: 3 columns side by side.
          Savings rate sits below Risparmio as a secondary metric, not a 4th column. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
        {/* Entrate
            Mobile: flex row — label+count left, value right.
            Desktop (sm:block): vertical stack — label → value → count. */}
        <div className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 flex items-center justify-between sm:block">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Entrate</p>
            <p className="text-xs text-muted-foreground sm:hidden">
              {periodFilteredExpenses.filter(e => e.type === 'income').length} voci
            </p>
          </div>
          <div className="text-right sm:text-left sm:mt-1">
            <p className="text-2xl desktop:text-4xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(totalIncome)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
              {periodFilteredExpenses.filter(e => e.type === 'income').length} voci
            </p>
          </div>
        </div>

        {/* Spese */}
        <div className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 flex items-center justify-between sm:block">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Spese</p>
            <p className="text-xs text-muted-foreground sm:hidden">
              {periodFilteredExpenses.filter(e => e.type !== 'income').length} voci
            </p>
          </div>
          <div className="text-right sm:text-left sm:mt-1">
            <p className="text-2xl desktop:text-4xl font-bold font-mono text-destructive tabular-nums">
              {formatCurrency(totalExpenses)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
              {periodFilteredExpenses.filter(e => e.type !== 'income').length} voci
            </p>
          </div>
        </div>

        {/* Risparmio — netBalance drives sign color, savingsRate drives the secondary label */}
        <div className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 flex items-center justify-between sm:block">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Risparmio</p>
            {totalIncome > 0 && (
              <p className={cn(
                'text-xs font-medium font-mono sm:hidden',
                savingsRate >= 20
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : savingsRate >= 10
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-destructive'
              )}>
                {savingsRate >= 0 ? `${savingsRate.toFixed(1)}% risparmiato` : `${savingsRate.toFixed(1)}% (deficit)`}
              </p>
            )}
          </div>
          <div className="text-right sm:text-left sm:mt-1">
            <p className={cn(
              'text-2xl desktop:text-4xl font-bold font-mono tabular-nums',
              netBalance >= 0 ? 'text-foreground' : 'text-destructive'
            )}>
              {formatCurrency(netBalance)}
            </p>
            {totalIncome > 0 && (
              <p className={cn(
                'text-xs font-medium font-mono mt-0.5 hidden sm:block',
                savingsRate >= 20
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : savingsRate >= 10
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-destructive'
              )}>
                {savingsRate >= 0 ? `${savingsRate.toFixed(1)}% risparmiato` : `${savingsRate.toFixed(1)}% (deficit)`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Anomalie (condizionale) ───────────────────────────────────── */}
      {/* Rendered only when anomalies detected — no "all clear" empty state */}
      <AnomalieBlock anomalie={anomalieData} onCategoryClick={handleAnomaliaClick} />

      {/* ── Spese Maggiori ────────────────────────────────────────────── */}
      {topExpenses.length > 0 && (
        <TopExpensesBlock key={periodLabel} expenses={topExpenses} periodLabel={periodLabel} />
      )}

      {/* ── Analisi flusso ────────────────────────────────────────────── */}
      {periodFilteredExpenses.length === 0 ? (
        <div className="rounded-md border border-dashed p-10 text-center">
          <p className="text-muted-foreground">Nessuna transazione trovata per {periodLabel}.</p>
        </div>
      ) : (
        <motion.div
          ref={distributionRef}
          variants={chartShellSettle}
          initial={false}
          animate="settle"
          className="grid gap-4 sm:gap-6 desktop:grid-cols-2"
        >
          {/* Sankey */}
          <div className="desktop:col-span-2">
            <CashflowSankeyChart
              expenses={periodFilteredExpenses}
              isMobile={isMobile}
              title={`Flusso Cashflow ${periodLabel}`}
            />
          </div>

          {/* Spese per Categoria drill-down */}
          {(expensesByCategoryData.length > 0 || (drillDown.chartType === 'expenses' && drillDown.level !== 'category')) && (
            <Card ref={expensesChartRef} className="desktop:col-span-2">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    {drillDown.chartType === 'expenses' && drillDown.level !== 'category' ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleBack} className="h-7 px-2">
                            <ChevronLeft className="h-4 w-4" />
                            Indietro
                          </Button>
                        </div>
                        {drillBreadcrumb}
                      </>
                    ) : (
                      <CardTitle>Spese per Categoria — {periodLabel}</CardTitle>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {drillDown.level === 'category' && expensesByCategoryData.length > 0 && (
                  <ResponsiveContainer width="100%" height={pieChartHeight}>
                    <RechartsPC>
                      <Pie
                        data={expensesByCategoryData as any}
                        cx="50%" cy="50%" labelLine={false}
                        label={!isMobile ? (entry: any) => entry.percentage >= 5 ? `${entry.name}: ${entry.percentage.toFixed(1)}%` : '' : false}
                        outerRadius={pieOuterRadius} dataKey="value"
                        onClick={(data: any) => handleCategoryClick(data, 'expenses')} cursor="pointer"
                        animationBegin={0} animationDuration={600} animationEasing="ease-out"
                      >
                        {expensesByCategoryData.map((entry, i) => <Cell key={i} fill={entry.color} style={{ cursor: 'pointer' }} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend layout={isMobile ? 'horizontal' : 'vertical'} align={isMobile ? 'center' : 'right'} verticalAlign={isMobile ? 'bottom' : 'middle'}
                        content={() => <LegendItems items={expensesByCategoryData} onItemClick={e => handleCategoryClick(e, 'expenses')} isMobile={isMobile} maxItems={isMobile ? 3 : undefined} />} />
                    </RechartsPC>
                  </ResponsiveContainer>
                )}
                {drillDown.level === 'subcategory' && drillDown.chartType === 'expenses' && currentSubcategoriesData.length > 0 && (
                  <ResponsiveContainer width="100%" height={pieChartHeight}>
                    <RechartsPC>
                      <Pie
                        data={currentSubcategoriesData as any}
                        cx="50%" cy="50%" labelLine={false}
                        label={!isMobile ? (entry: any) => entry.percentage >= 5 ? `${entry.name}: ${entry.percentage.toFixed(1)}%` : '' : false}
                        outerRadius={pieOuterRadius} dataKey="value"
                        onClick={(data: any) => handleSubcategoryClick(data)} cursor="pointer"
                        animationBegin={0} animationDuration={600} animationEasing="ease-out"
                      >
                        {currentSubcategoriesData.map((entry, i) => <Cell key={i} fill={entry.color} style={{ cursor: 'pointer' }} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend layout={isMobile ? 'horizontal' : 'vertical'} align={isMobile ? 'center' : 'right'} verticalAlign={isMobile ? 'bottom' : 'middle'}
                        content={() => <LegendItems items={currentSubcategoriesData} onItemClick={e => handleSubcategoryClick(e)} isMobile={isMobile} />} />
                    </RechartsPC>
                  </ResponsiveContainer>
                )}
                {drillDown.level === 'expenseList' && drillDown.chartType === 'expenses' && (
                  <ExpenseList expenses={currentFilteredExpenses} isIncome={false} />
                )}
              </CardContent>
            </Card>
          )}

          {/* Spese per Tipo */}
          {expensesByTypeData.length > 0 && (
            <Card className="desktop:col-span-2">
              <CardHeader><CardTitle>Spese per Tipo — {periodLabel}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={pieChartHeight}>
                  <RechartsPC>
                    <Pie
                      data={expensesByTypeData as any} cx="50%" cy="50%" labelLine={false}
                      label={!isMobile ? (entry: any) => entry.percentage >= 5 ? `${entry.name}: ${entry.percentage.toFixed(1)}%` : '' : false}
                      outerRadius={pieOuterRadius} dataKey="value"
                      animationBegin={0} animationDuration={600} animationEasing="ease-out"
                    >
                      {expensesByTypeData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend layout={isMobile ? 'horizontal' : 'vertical'} align={isMobile ? 'center' : 'right'} verticalAlign={isMobile ? 'bottom' : 'middle'}
                      content={() => <LegendItems items={expensesByTypeData} isMobile={isMobile} />} />
                  </RechartsPC>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Entrate per Categoria drill-down */}
          {(incomeByCategoryData.length > 0 || (drillDown.chartType === 'income' && drillDown.level !== 'category')) && (
            <Card ref={incomeChartRef} className="desktop:col-span-2">
              <CardHeader>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-col gap-1">
                    {drillDown.chartType === 'income' && drillDown.level !== 'category' ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={handleBack} className="h-7 px-2">
                            <ChevronLeft className="h-4 w-4" />
                            Indietro
                          </Button>
                        </div>
                        {drillBreadcrumb}
                      </>
                    ) : (
                      <CardTitle>Entrate per Categoria — {periodLabel}</CardTitle>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {drillDown.level === 'category' && incomeByCategoryData.length > 0 && (
                  <ResponsiveContainer width="100%" height={pieChartHeight}>
                    <RechartsPC>
                      <Pie
                        data={incomeByCategoryData as any} cx="50%" cy="50%" labelLine={false}
                        label={!isMobile ? (entry: any) => entry.percentage >= 5 ? `${entry.name}: ${entry.percentage.toFixed(1)}%` : '' : false}
                        outerRadius={pieOuterRadius} dataKey="value"
                        onClick={(data: any) => handleCategoryClick(data, 'income')} cursor="pointer"
                        animationBegin={0} animationDuration={600} animationEasing="ease-out"
                      >
                        {incomeByCategoryData.map((entry, i) => <Cell key={i} fill={entry.color} style={{ cursor: 'pointer' }} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend layout={isMobile ? 'horizontal' : 'vertical'} align={isMobile ? 'center' : 'right'} verticalAlign={isMobile ? 'bottom' : 'middle'}
                        content={() => <LegendItems items={incomeByCategoryData} onItemClick={e => handleCategoryClick(e, 'income')} isMobile={isMobile} />} />
                    </RechartsPC>
                  </ResponsiveContainer>
                )}
                {drillDown.level === 'subcategory' && drillDown.chartType === 'income' && currentSubcategoriesData.length > 0 && (
                  <ResponsiveContainer width="100%" height={pieChartHeight}>
                    <RechartsPC>
                      <Pie
                        data={currentSubcategoriesData as any} cx="50%" cy="50%" labelLine={false}
                        label={!isMobile ? (entry: any) => entry.percentage >= 5 ? `${entry.name}: ${entry.percentage.toFixed(1)}%` : '' : false}
                        outerRadius={pieOuterRadius} dataKey="value"
                        onClick={(data: any) => handleSubcategoryClick(data)} cursor="pointer"
                        animationBegin={0} animationDuration={600} animationEasing="ease-out"
                      >
                        {currentSubcategoriesData.map((entry, i) => <Cell key={i} fill={entry.color} style={{ cursor: 'pointer' }} />)}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend layout={isMobile ? 'horizontal' : 'vertical'} align={isMobile ? 'center' : 'right'} verticalAlign={isMobile ? 'bottom' : 'middle'}
                        content={() => <LegendItems items={currentSubcategoriesData} onItemClick={e => handleSubcategoryClick(e)} isMobile={isMobile} />} />
                    </RechartsPC>
                  </ResponsiveContainer>
                )}
                {drillDown.level === 'expenseList' && drillDown.chartType === 'income' && (
                  <ExpenseList expenses={currentFilteredExpenses} isIncome={true} />
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* ── Confronto Annuale ─────────────────────────────────────────── */}
      {/* Always rendered — shows placeholder when comparison data unavailable */}
      <ConfrontoAnnualeSection
        allExpenses={allExpenses}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        periodMode={periodMode}
        historyStartYear={historyStartYear}
      />

      {/* ── Andamento Risparmio + Trend per Categoria ────────────────── */}
      {/* Hidden in "Anno" mode — the rolling windows (24m / 12m from today)
          are discordant with a specific past-year filter. "Anno" always shows
          a past year now (currentYear is handled by "Anno Corrente"). */}
      {periodMode !== 'year' && (
        <>
          <SavingsRateTrendSection
            allExpenses={allExpenses}
            historyStartYear={historyStartYear}
            monthsToShow={24}
          />

          <CategoryTrendsGrid
            allExpenses={allExpenses}
            historyStartYear={historyStartYear}
            monthsToShow={12}
          />
        </>
      )}
    </div>
  );
}

// ── Shared expense/income list renderer ───────────────────────────────────
function ExpenseList({ expenses, isIncome }: { expenses: Expense[]; isIncome: boolean }) {
  if (expenses.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {isIncome ? 'Nessuna entrata trovata' : 'Nessuna spesa trovata'}
      </div>
    );
  }

  // Sum all amounts — income entries are positive, expense entries are negative.
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const amountClass = isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';

  return (
    <div className="space-y-4">
      {/* Mobile list */}
      <div className="space-y-3 desktop:hidden">
        {expenses.map(e => {
          const date = toDate(e.date);
          return (
            <div key={e.id} className="rounded-md border p-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{format(date, 'dd/MM/yyyy', { locale: it })}</span>
                <span className={cn('font-medium', amountClass)}>{formatCurrency(e.amount)}</span>
              </div>
              {e.notes && <p className="text-sm text-muted-foreground">{e.notes}</p>}
              {e.link && (
                <a href={e.link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
                  Apri link <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          );
        })}

        {/* Mobile total row — mirrors the desktop tfoot style */}
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex items-center justify-between">
          <span className="text-sm font-semibold">
            Totale ({expenses.length} {expenses.length === 1 ? 'voce' : 'voci'})
          </span>
          <span className={cn('text-sm font-semibold font-mono', amountClass)}>
            {formatCurrency(totalAmount)}
          </span>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden desktop:block rounded-md border">
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Data</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Importo</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Note</th>
                <th className="px-4 py-3 text-center text-sm font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(e => {
                const date = toDate(e.date);
                return (
                  <tr key={e.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm">{format(date, 'dd/MM/yyyy', { locale: it })}</td>
                    <td className={cn('px-4 py-3 text-sm text-right font-medium', amountClass)}>{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{e.notes || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noopener noreferrer" className="inline-flex text-primary hover:text-primary/80">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Total footer row — not sticky, appears naturally at end of table */}
            <tfoot className="bg-muted/50 border-t">
              <tr>
                <td className="px-4 py-3 text-sm font-semibold">
                  Totale ({expenses.length} {expenses.length === 1 ? 'voce' : 'voci'})
                </td>
                <td className={cn('px-4 py-3 text-sm text-right font-semibold font-mono', amountClass)}>
                  {formatCurrency(totalAmount)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
