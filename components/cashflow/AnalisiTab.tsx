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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { AnimatePresence, motion } from 'framer-motion';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { calculateIncomeExpenseRatio, calculateTotalExpenses, calculateTotalIncome } from '@/lib/services/expenseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronLeft, ExternalLink } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import {
  PieChart as RechartsPC,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import { formatCurrency, formatCurrencyCompact } from '@/lib/services/chartService';
import { getItalyMonth, getItalyMonthYear, getItalyYear, toDate } from '@/lib/utils/dateHelpers';
import { CashflowSankeyChart } from '@/components/cashflow/CashflowSankeyChart';
import { chartShellSettle, fadeVariants } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';

interface ChartData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

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

type PeriodMode = 'current' | 'year' | 'history';

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
      <span className="text-sm font-semibold font-mono tabular-nums text-red-600 dark:text-red-500 shrink-0">
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

  // Trend section collapsible
  const [trendOpen, setTrendOpen] = useState(false);

  // Percentage toggles for trend charts
  const [showMonthlyTrendPercentage, setShowMonthlyTrendPercentage] = useState(false);
  const [showYearlyTrendPercentage, setShowYearlyTrendPercentage] = useState(false);
  const [showFullMonthlyHistory, setShowFullMonthlyHistory] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

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
      // Initialize to most recent year with data (or current year) so data is never null
      setSelectedYear(prev => prev ?? availableYears[0] ?? currentYear);
      setSelectedMonth(null);
    }
    resetDrillDown();
  };

  const isFiltered = periodMode === 'year' && (selectedYear !== currentYear || selectedMonth !== null);

  const handleResetFilters = () => {
    setSelectedYear(currentYear);
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

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    baseExpenses.forEach(e => years.add(getItalyYear(toDate(e.date))));
    return Array.from(years).sort((a, b) => b - a);
  }, [baseExpenses]);

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
      ? `${ITALIAN_MONTHS[selectedMonth - 1]} ${selectedYear}`
      : `${selectedYear}`;

  const totalIncome = calculateTotalIncome(periodFilteredExpenses);
  const totalExpenses = calculateTotalExpenses(periodFilteredExpenses);
  const netBalance = totalIncome - totalExpenses;
  const ratio = calculateIncomeExpenseRatio(periodFilteredExpenses);

  // Sort non-income expenses by amount ascending — most negative amount = largest expense first
  const topExpenses = useMemo(() => {
    return periodFilteredExpenses
      .filter(e => e.type !== 'income')
      .sort((a, b) => a.amount - b.amount);
  }, [periodFilteredExpenses]);

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

  const getExpensesByCategory = (expenses: Expense[]): ChartData[] => {
    const categoryMap = new Map<string, number>();
    expenses.filter(e => e.type !== 'income').forEach(e => {
      categoryMap.set(e.categoryName, (categoryMap.get(e.categoryName) || 0) + Math.abs(e.amount));
    });
    const total = Array.from(categoryMap.values()).reduce((s, v) => s + v, 0);
    return Array.from(categoryMap.entries())
      .map(([name, value], index) => ({
        name, value,
        percentage: total > 0 ? (value / total) * 100 : 0,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  };

  const getIncomeByCategory = (expenses: Expense[]): ChartData[] => {
    const categoryMap = new Map<string, number>();
    expenses.filter(e => e.type === 'income').forEach(e => {
      categoryMap.set(e.categoryName, (categoryMap.get(e.categoryName) || 0) + e.amount);
    });
    const total = Array.from(categoryMap.values()).reduce((s, v) => s + v, 0);
    return Array.from(categoryMap.entries())
      .map(([name, value], index) => ({
        name, value,
        percentage: total > 0 ? (value / total) * 100 : 0,
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  };

  const getExpensesByType = (expenses: Expense[]): ChartData[] => {
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
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
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

  // ── Trend chart helpers ────────────────────────────────────────────────

  const clampPercentage = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  const getMonthlyTrend = (expenses: Expense[]) => {
    const map = new Map<string, { income: number; expenses: number; sortKey: string }>();
    expenses.forEach(e => {
      const date = toDate(e.date);
      const { month, year } = getItalyMonthYear(date);
      const key = `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
      const sortKey = `${year}-${String(month).padStart(2, '0')}`;
      const cur = map.get(key) || { income: 0, expenses: 0, sortKey };
      if (e.type === 'income') cur.income += e.amount; else cur.expenses += Math.abs(e.amount);
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([month, v]) => {
      const total = v.income + v.expenses;
      const rawSavingRate = v.income > 0 ? ((v.income - v.expenses) / v.income) * 100 : 0;
      return {
        month, sortKey: v.sortKey,
        Entrate: v.income, Spese: v.expenses, Netto: v.income - v.expenses,
        'Entrate %': clampPercentage(total > 0 ? (v.income / total) * 100 : 0, 0, 100),
        'Spese %': clampPercentage(total > 0 ? (v.expenses / total) * 100 : 0, 0, 100),
        'Saving Rate %': clampPercentage(rawSavingRate, -100, 100),
      };
    }).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  };

  const getYearlyTrend = (expenses: Expense[]) => {
    const map = new Map<number, { income: number; expenses: number }>();
    expenses.forEach(e => {
      const year = getItalyYear(toDate(e.date));
      const cur = map.get(year) || { income: 0, expenses: 0 };
      if (e.type === 'income') cur.income += e.amount; else cur.expenses += Math.abs(e.amount);
      map.set(year, cur);
    });
    return Array.from(map.entries()).map(([year, v]) => {
      const total = v.income + v.expenses;
      const rawSavingRate = v.income > 0 ? ((v.income - v.expenses) / v.income) * 100 : 0;
      return {
        year: year.toString(),
        Entrate: v.income, Spese: v.expenses, Netto: v.income - v.expenses,
        'Entrate %': clampPercentage(total > 0 ? (v.income / total) * 100 : 0, 0, 100),
        'Spese %': clampPercentage(total > 0 ? (v.expenses / total) * 100 : 0, 0, 100),
        'Saving Rate %': clampPercentage(rawSavingRate, -100, 100),
      };
    }).sort((a, b) => parseInt(a.year) - parseInt(b.year));
  };

  const getMonthlyExpensesByType = (expenses: Expense[]) => {
    const map = new Map<string, Record<string, number | string>>();
    expenses.filter(e => e.type !== 'income').forEach(e => {
      const date = toDate(e.date);
      const { month, year } = getItalyMonthYear(date);
      const key = `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
      const sortKey = `${year}-${String(month).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, { sortKey });
      const cur = map.get(key)!;
      const typeName = EXPENSE_TYPE_LABELS[e.type as ExpenseType];
      cur[typeName] = ((cur[typeName] as number) || 0) + Math.abs(e.amount);
    });
    return Array.from(map.entries())
      .map(([month, v]) => { const { sortKey, ...rest } = v; return { month, sortKey, ...rest }; })
      .sort((a, b) => (a.sortKey as string).localeCompare(b.sortKey as string));
  };

  const getYearlyExpensesByType = (expenses: Expense[]) => {
    const map = new Map<number, Record<string, number>>();
    expenses.filter(e => e.type !== 'income').forEach(e => {
      const year = getItalyYear(toDate(e.date));
      if (!map.has(year)) map.set(year, {});
      const cur = map.get(year)!;
      const typeName = EXPENSE_TYPE_LABELS[e.type as ExpenseType];
      cur[typeName] = (cur[typeName] || 0) + Math.abs(e.amount);
    });
    return Array.from(map.entries())
      .map(([year, v]) => ({ year: year.toString(), ...v }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
  };

  const getMonthlyByCategory = (expenses: Expense[], income: boolean) => {
    const catTotals = new Map<string, number>();
    expenses.filter(e => income ? e.type === 'income' : e.type !== 'income').forEach(e => {
      catTotals.set(e.categoryName, (catTotals.get(e.categoryName) || 0) + Math.abs(e.amount));
    });
    const top5 = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
    const map = new Map<string, Record<string, number | string>>();
    expenses.filter(e => income ? e.type === 'income' : e.type !== 'income').forEach(e => {
      const date = toDate(e.date);
      const { month, year } = getItalyMonthYear(date);
      const key = `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
      const sortKey = `${year}-${String(month).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, { sortKey, Altro: 0 });
      const cur = map.get(key)!;
      const cat = top5.includes(e.categoryName) ? e.categoryName : 'Altro';
      cur[cat] = ((cur[cat] as number) || 0) + Math.abs(e.amount);
    });
    const data = Array.from(map.entries())
      .map(([month, v]) => { const { sortKey, ...rest } = v; return { month, sortKey, ...rest }; })
      .sort((a, b) => (a.sortKey as string).localeCompare(b.sortKey as string));
    return { data, categories: [...top5, 'Altro'] };
  };

  const getYearlyByCategory = (expenses: Expense[], income: boolean) => {
    const catTotals = new Map<string, number>();
    expenses.filter(e => income ? e.type === 'income' : e.type !== 'income').forEach(e => {
      catTotals.set(e.categoryName, (catTotals.get(e.categoryName) || 0) + Math.abs(e.amount));
    });
    const top5 = Array.from(catTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
    const map = new Map<number, Record<string, number>>();
    expenses.filter(e => income ? e.type === 'income' : e.type !== 'income').forEach(e => {
      const year = getItalyYear(toDate(e.date));
      if (!map.has(year)) map.set(year, { Altro: 0 });
      const cur = map.get(year)!;
      const cat = top5.includes(e.categoryName) ? e.categoryName : 'Altro';
      cur[cat] = (cur[cat] || 0) + Math.abs(e.amount);
    });
    const data = Array.from(map.entries())
      .map(([year, v]) => ({ year: year.toString(), ...v }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
    return { data, categories: [...top5, 'Altro'] };
  };

  const getYearlyIncomeExpenseRatio = () => {
    const yearlyMap = new Map<number, Expense[]>();
    allExpenses.forEach(e => {
      const year = getItalyYear(toDate(e.date));
      if (!yearlyMap.has(year)) yearlyMap.set(year, []);
      yearlyMap.get(year)!.push(e);
    });
    return Array.from(yearlyMap.entries())
      .map(([year, expenses]) => ({ year: year.toString(), ratio: calculateIncomeExpenseRatio(expenses) }))
      .filter(item => item.ratio !== null)
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));
  };

  // ── Computed chart data ────────────────────────────────────────────────

  const expensesFrom2025 = useMemo(() =>
    allExpenses.filter(e => getItalyYear(toDate(e.date)) >= historyStartYear),
    [allExpenses, historyStartYear]
  );

  const monthlyTrendData = useMemo(() => getMonthlyTrend(baseExpenses), [baseExpenses]);
  const yearlyTrendData = useMemo(() => getYearlyTrend(baseExpenses), [baseExpenses]);
  const monthlyExpensesByType = useMemo(() => getMonthlyExpensesByType(expensesFrom2025), [expensesFrom2025]);
  const yearlyExpensesByType = useMemo(() => getYearlyExpensesByType(expensesFrom2025), [expensesFrom2025]);
  const monthlyExpensesByCategory = useMemo(() => getMonthlyByCategory(expensesFrom2025, false), [expensesFrom2025]);
  const yearlyExpensesByCategory = useMemo(() => getYearlyByCategory(expensesFrom2025, false), [expensesFrom2025]);
  const monthlyIncomeByCategory = useMemo(() => getMonthlyByCategory(expensesFrom2025, true), [expensesFrom2025]);
  const yearlyIncomeByCategory = useMemo(() => getYearlyByCategory(expensesFrom2025, true), [expensesFrom2025]);
  const yearlyIncomeExpenseRatioData = useMemo(() => getYearlyIncomeExpenseRatio(), [allExpenses]);

  const currentSubcategoriesData = drillDown.level === 'subcategory' && drillDown.selectedCategory && drillDown.chartType
    ? getSubcategoriesData(periodFilteredExpenses, drillDown.selectedCategory, drillDown.chartType)
    : [];

  const currentFilteredExpenses = drillDown.level === 'expenseList' ? getFilteredExpenses() : [];

  const pieChartHeight = isMobile ? 320 : 500;
  const pieOuterRadius = isMobile ? 110 : 140;
  const lineChartHeight = isMobile ? 260 : 350;
  const xAxisProps = isMobile
    ? { angle: -45, textAnchor: 'end' as const, height: 60, interval: 0 }
    : { interval: 'preserveStartEnd' as const };
  const axisTickProps = { fontSize: isMobile ? 10 : 12 };
  const recentMonthsLimit = 24;

  const filterRecentMonths = <T extends { sortKey?: string | number }>(data: T[], months: number) => {
    if (data.length <= months) return data;
    return data.slice(-months);
  };

  const monthlyTrendChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyTrendData, recentMonthsLimit) : monthlyTrendData;
  const monthlyTrendPercentChartData = monthlyTrendChartData.map(item => ({
    month: item.month,
    'Entrate %': item['Entrate %'],
    'Spese %': item['Spese %'],
    'Saving Rate %': item['Saving Rate %'],
  }));
  const monthlyExpensesByTypeChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyExpensesByType, recentMonthsLimit) : monthlyExpensesByType;
  const monthlyExpensesByCategoryChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyExpensesByCategory.data, recentMonthsLimit) : monthlyExpensesByCategory.data;
  const monthlyIncomeByCategoryChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyIncomeByCategory.data, recentMonthsLimit) : monthlyIncomeByCategory.data;
  const yearlyTrendPercentChartData = yearlyTrendData.map(item => ({
    year: item.year,
    'Entrate %': item['Entrate %'],
    'Spese %': item['Spese %'],
    'Saving Rate %': item['Saving Rate %'],
  }));

  const renderLegendItems = (
    items: ChartData[],
    onItemClick?: (item: ChartData) => void,
    className?: string,
    maxItems?: number
  ) => {
    const filtered = items.filter(item => item.percentage >= 5).sort((a, b) => b.value - a.value);
    const visible = maxItems ? filtered.slice(0, maxItems) : filtered;
    const baseClass = isMobile ? 'mt-4 flex flex-wrap gap-3' : 'pl-5';
    return (
      <div className={cn(baseClass, className)}>
        {visible.map((item, index) => (
          <div
            key={`legend-${index}`}
            className={cn('flex items-center gap-2 text-sm', onItemClick && 'cursor-pointer')}
            onClick={onItemClick ? () => onItemClick(item) : undefined}
          >
            <div className="h-3.5 w-3.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.name} ({item.percentage.toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    );
  };

  const renderLegendContent = (maxItems?: number) => (props: any) => {
    const payload = props?.payload || [];
    const items = maxItems ? payload.slice(0, maxItems) : payload;
    return (
      <div className={isMobile ? 'mt-3 flex flex-wrap gap-3' : ''}>
        {items.map((entry: any) => (
          <div key={entry.value} className="flex items-center gap-2 text-sm">
            <span className="h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-72 rounded-full bg-muted animate-pulse" />
        <div className="grid gap-4 grid-cols-2 desktop:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              <div className="h-7 w-28 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border p-6">
          <div className="h-64 bg-muted animate-pulse rounded" />
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
  const drillBreadcrumb = drillDown.level !== 'category' && drillDown.chartType ? (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <button
        className="hover:text-foreground transition-colors"
        onClick={resetDrillDown}
      >
        {drillDown.chartType === 'expenses' ? 'Spese' : 'Entrate'}
      </button>
      {drillDown.selectedCategory && (
        <>
          <span className="text-border">/</span>
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
          <span className="text-border">/</span>
          <span className="text-foreground font-medium">{drillDown.selectedSubCategory}</span>
        </>
      )}
    </div>
  ) : null;

  const expensesByCategoryData = getExpensesByCategory(periodFilteredExpenses);
  const incomeByCategoryData = getIncomeByCategory(periodFilteredExpenses);
  const expensesByTypeData = getExpensesByType(periodFilteredExpenses);

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
              role="tab"
              aria-selected={periodMode === mode}
              onClick={() => handlePeriodModeChange(mode)}
              className={cn(
                'relative px-3 py-1.5 text-sm font-medium rounded-full transition-colors',
                periodMode === mode
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Year + Month dropdowns — visible only in "Anno" mode */}
        {periodMode === 'year' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <Select
              value={selectedYear?.toString() || availableYears[0]?.toString()}
              onValueChange={handleYearChange}
            >
              <SelectTrigger className={cn('w-full sm:w-[140px]', controlClassName)}>
                <SelectValue placeholder="Anno" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
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
                {ITALIAN_MONTHS.map((month, index) => (
                  <SelectItem key={index + 1} value={(index + 1).toString()}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isFiltered && (
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
      </div>

      {/* ── KPI block ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 desktop:grid-cols-4">
        {/* Entrate */}
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Entrate</p>
          <p className="text-xl font-bold font-mono text-green-600 dark:text-green-500 tabular-nums">
            {formatCurrency(totalIncome)}
          </p>
          <p className="text-xs text-muted-foreground">
            {periodFilteredExpenses.filter(e => e.type === 'income').length} voci
          </p>
        </div>

        {/* Spese */}
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Spese</p>
          <p className="text-xl font-bold font-mono text-red-600 dark:text-red-500 tabular-nums">
            {formatCurrency(totalExpenses)}
          </p>
          <p className="text-xs text-muted-foreground">
            {periodFilteredExpenses.filter(e => e.type !== 'income').length} voci
          </p>
        </div>

        {/* Bilancio Netto */}
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bilancio</p>
          <p className={cn(
            'text-xl font-bold font-mono tabular-nums',
            netBalance >= 0 ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500'
          )}>
            {formatCurrency(netBalance)}
          </p>
          <p className="text-xs text-muted-foreground">Netto periodo</p>
        </div>

        {/* Rapporto */}
        <div className="rounded-lg border p-4 space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Rapporto</p>
          <p className={cn(
            'text-xl font-bold font-mono tabular-nums',
            ratio === null ? 'text-muted-foreground' :
              ratio >= 1.2 ? 'text-green-600 dark:text-green-500' :
              ratio >= 0.8 ? 'text-yellow-600 dark:text-yellow-500' :
              'text-red-600 dark:text-red-500'
          )}>
            {ratio !== null ? ratio.toFixed(2) : 'N/A'}
          </p>
          <p className="text-xs text-muted-foreground">
            {ratio === null ? 'Nessun dato' :
              ratio >= 1.2 ? 'Ottima salute' :
              ratio >= 0.8 ? 'In equilibrio' : 'Attenzione'}
          </p>
        </div>
      </div>

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
                        content={() => renderLegendItems(expensesByCategoryData, e => handleCategoryClick(e, 'expenses'), undefined, isMobile ? 3 : undefined)} />
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
                        content={() => renderLegendItems(currentSubcategoriesData, e => handleSubcategoryClick(e))} />
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
                      content={() => renderLegendItems(expensesByTypeData)} />
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
                        content={() => renderLegendItems(incomeByCategoryData, e => handleCategoryClick(e, 'income'))} />
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
                        content={() => renderLegendItems(currentSubcategoriesData, e => handleSubcategoryClick(e))} />
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

      {/* ── Trend section (collapsible) ───────────────────────────────── */}
      <Collapsible open={trendOpen} onOpenChange={setTrendOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left py-2">
            <ChevronDown className={cn('h-4 w-4 transition-transform', trendOpen && 'rotate-180')} />
            Trend storici
            <span className="text-xs text-muted-foreground/60 font-normal ml-1">
              {yearlyTrendData.length} anni di dati
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-4 sm:gap-6 desktop:grid-cols-2 mt-2">

            {/* Monthly Trend */}
            {monthlyTrendData.length > 0 && (
              <Card className="desktop:col-span-2">
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Trend Mensile</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      {isMobile && (
                        <Button variant="outline" size="sm" onClick={() => setShowFullMonthlyHistory(!showFullMonthlyHistory)}>
                          {showFullMonthlyHistory ? 'Ultimi 24 mesi' : 'Mostra tutto'}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setShowMonthlyTrendPercentage(!showMonthlyTrendPercentage)}>
                        {showMonthlyTrendPercentage ? '€ Valori Assoluti' : '% Percentuali'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={lineChartHeight}>
                    {showMonthlyTrendPercentage ? (
                      <LineChart data={monthlyTrendPercentChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[-100, 100]} allowDataOverflow />
                        <Tooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(2)}%`} />} />
                        <Legend />
                        <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="Entrate %" stroke={COLORS[1] || '#10b981'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="Spese %" stroke={COLORS[0] || '#ef4444'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="Saving Rate %" stroke={COLORS[2] || '#3b82f6'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                      </LineChart>
                    ) : (
                      <LineChart data={monthlyTrendChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                        <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="Entrate" stroke={COLORS[1] || '#10b981'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="Spese" stroke={COLORS[0] || '#ef4444'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="Netto" stroke={COLORS[2] || '#3b82f6'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Yearly Trend */}
            {yearlyTrendData.length > 0 && (
              <Card className="desktop:col-span-2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Trend Annuale</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setShowYearlyTrendPercentage(!showYearlyTrendPercentage)}>
                      {showYearlyTrendPercentage ? '€ Valori Assoluti' : '% Percentuali'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={lineChartHeight}>
                    {showYearlyTrendPercentage ? (
                      <LineChart data={yearlyTrendPercentChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                        <YAxis tickFormatter={(v) => `${v.toFixed(0)}%`} domain={[-100, 100]} allowDataOverflow />
                        <Tooltip content={<ChartTooltip formatter={(v) => `${v.toFixed(2)}%`} />} />
                        <Legend />
                        <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                        <Line type="monotone" dataKey="Entrate %" stroke={COLORS[1] || '#10b981'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="Spese %" stroke={COLORS[0] || '#ef4444'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="Saving Rate %" stroke={COLORS[2] || '#3b82f6'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                      </LineChart>
                    ) : (
                      <LineChart data={yearlyTrendData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                        <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="Entrate" stroke={COLORS[1] || '#10b981'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="Spese" stroke={COLORS[0] || '#ef4444'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                        <Line type="monotone" dataKey="Netto" stroke={COLORS[2] || '#3b82f6'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Yearly ratio */}
            {yearlyIncomeExpenseRatioData.length > 0 && (
              <Card className="desktop:col-span-2">
                <CardHeader><CardTitle>Rapporto Entrate/Spese Annuale</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={lineChartHeight}>
                    <LineChart data={yearlyIncomeExpenseRatioData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                      <YAxis tickFormatter={(v) => v.toFixed(2)} domain={[0, 'auto']} />
                      <Tooltip content={<ChartTooltip formatter={(v) => v.toFixed(2)} />} />
                      <ReferenceArea y1={1.2} y2={5} fill="#10b981" fillOpacity={0.1} />
                      <ReferenceArea y1={0.8} y2={1.2} fill="#eab308" fillOpacity={0.1} />
                      <ReferenceArea y1={0} y2={0.8} fill="#ef4444" fillOpacity={0.1} />
                      <ReferenceLine y={1.0} stroke="#6b7280" strokeDasharray="5 5"
                        label={{ value: 'Break-even', position: 'right', fill: '#6b7280', fontSize: 11 }} />
                      <Line type="monotone" dataKey="ratio" stroke={COLORS[3] || '#8b5cf6'} strokeWidth={3}
                        name="Rapporto" dot={{ r: 5 }} animationDuration={800} animationEasing="ease-out" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-600/30 mr-1" />≥ 1.2 Ottima salute</span>
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-600/30 mr-1" />0.8–1.2 Equilibrio</span>
                    <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-600/30 mr-1" />&lt; 0.8 Attenzione</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Monthly expenses by type */}
            {monthlyExpensesByType.length > 0 && (
              <Card className="desktop:col-span-2">
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Trend Mensile Spese per Tipo</CardTitle>
                    {isMobile && (
                      <Button variant="outline" size="sm" onClick={() => setShowFullMonthlyHistory(!showFullMonthlyHistory)}>
                        {showFullMonthlyHistory ? 'Ultimi 24 mesi' : 'Mostra tutto'}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={lineChartHeight}>
                    <LineChart data={monthlyExpensesByTypeChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                      <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend content={renderLegendContent(isMobile ? 3 : undefined)} />
                      <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.fixed} stroke={COLORS[2] || '#3b82f6'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                      <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.variable} stroke={COLORS[3] || '#8b5cf6'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                      <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.debt} stroke={COLORS[4] || '#f59e0b'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Yearly expenses by type */}
            {yearlyExpensesByType.length > 0 && (
              <Card className="desktop:col-span-2">
                <CardHeader><CardTitle>Trend Annuale Spese per Tipo</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={lineChartHeight}>
                    <LineChart data={yearlyExpensesByType}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                      <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend content={renderLegendContent(isMobile ? 3 : undefined)} />
                      <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.fixed} stroke={COLORS[2] || '#3b82f6'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                      <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.variable} stroke={COLORS[3] || '#8b5cf6'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                      <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.debt} stroke={COLORS[4] || '#f59e0b'} strokeWidth={2} dot={!isMobile} animationDuration={800} animationEasing="ease-out" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Monthly expenses by category */}
            {monthlyExpensesByCategory.data.length > 0 && (
              <Card className="desktop:col-span-2">
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Trend Mensile Spese per Categoria (Top 5)</CardTitle>
                    {isMobile && (
                      <Button variant="outline" size="sm" onClick={() => setShowFullMonthlyHistory(!showFullMonthlyHistory)}>
                        {showFullMonthlyHistory ? 'Ultimi 24 mesi' : 'Mostra tutto'}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={lineChartHeight}>
                    <LineChart data={monthlyExpensesByCategoryChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                      <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend content={renderLegendContent(isMobile ? 3 : undefined)} />
                      {monthlyExpensesByCategory.categories.filter(c => c !== 'Altro').map((cat, i) => (
                        <Line key={cat} type="monotone" dataKey={cat} stroke={COLORS[i % COLORS.length]} strokeWidth={2} animationDuration={800} animationEasing="ease-out" />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Yearly expenses by category */}
            {yearlyExpensesByCategory.data.length > 0 && (
              <Card className="desktop:col-span-2">
                <CardHeader><CardTitle>Trend Annuale Spese per Categoria (Top 5)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={lineChartHeight}>
                    <LineChart data={yearlyExpensesByCategory.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                      <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      {yearlyExpensesByCategory.categories.filter(c => c !== 'Altro').map((cat, i) => (
                        <Line key={cat} type="monotone" dataKey={cat} stroke={COLORS[i % COLORS.length]} strokeWidth={2} animationDuration={800} animationEasing="ease-out" />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Monthly income by category */}
            {monthlyIncomeByCategory.data.length > 0 && (
              <Card className="desktop:col-span-2">
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Trend Mensile Entrate per Categoria (Top 5)</CardTitle>
                    {isMobile && (
                      <Button variant="outline" size="sm" onClick={() => setShowFullMonthlyHistory(!showFullMonthlyHistory)}>
                        {showFullMonthlyHistory ? 'Ultimi 24 mesi' : 'Mostra tutto'}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={lineChartHeight}>
                    <LineChart data={monthlyIncomeByCategoryChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                      <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      {monthlyIncomeByCategory.categories.filter(c => c !== 'Altro').map((cat, i) => (
                        <Line key={cat} type="monotone" dataKey={cat} stroke={COLORS[i % COLORS.length]} strokeWidth={2} animationDuration={800} animationEasing="ease-out" />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Yearly income by category */}
            {yearlyIncomeByCategory.data.length > 0 && (
              <Card className="desktop:col-span-2">
                <CardHeader><CardTitle>Trend Annuale Entrate per Categoria (Top 5)</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={lineChartHeight}>
                    <LineChart data={yearlyIncomeByCategory.data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                      <YAxis tickFormatter={(v) => formatCurrencyCompact(v)} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      {yearlyIncomeByCategory.categories.filter(c => c !== 'Altro').map((cat, i) => (
                        <Line key={cat} type="monotone" dataKey={cat} stroke={COLORS[i % COLORS.length]} strokeWidth={2} animationDuration={800} animationEasing="ease-out" />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

          </div>
        </CollapsibleContent>
      </Collapsible>
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
  const amountClass = isIncome ? 'text-green-600 dark:text-green-500' : 'text-red-600 dark:text-red-500';

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
            <thead className="sticky top-0 bg-muted/50 border-b">
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
