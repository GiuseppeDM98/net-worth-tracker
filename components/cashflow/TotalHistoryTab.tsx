/**
 * Historical trend analysis across all years
 *
 * Two main sections:
 * 1. Analisi Periodo: Year+month filtered view with Sankey, pie charts, drill-down
 * 2. Trend Charts: Monthly and Yearly aggregations across all time
 *
 * Pattern Duplication: getMonthlyX and getYearlyX functions share logic
 * but operate on different time granularities (month vs year key).
 *
 * Mobile Optimization: 24-month limit for mobile to prevent chart overcrowding
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { calculateIncomeExpenseRatio, calculateTotalExpenses, calculateTotalIncome } from '@/lib/services/expenseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ExternalLink, RefreshCw } from 'lucide-react';
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

interface ChartData {
  name: string;
  value: number;
  percentage: number;
  color: string;
}

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
];

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

type DrillDownLevel = 'category' | 'subcategory' | 'expenseList';
type ChartType = 'expenses' | 'income';

interface DrillDownState {
  level: DrillDownLevel;
  chartType: ChartType | null;
  selectedCategory: string | null;
  selectedCategoryColor: string | null;
  selectedSubCategory: string | null;
}

interface TotalHistoryTabProps {
  allExpenses: Expense[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function TotalHistoryTab({ allExpenses, loading }: TotalHistoryTabProps) {
  // Percentage toggles for trend charts
  const [showMonthlyTrendPercentage, setShowMonthlyTrendPercentage] = useState(false);
  const [showYearlyTrendPercentage, setShowYearlyTrendPercentage] = useState(false);
  const [showFullMonthlyHistory, setShowFullMonthlyHistory] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Analisi Periodo: year+month filter state
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // Drill-down state for pie charts in Analisi Periodo
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    level: 'category',
    chartType: null,
    selectedCategory: null,
    selectedCategoryColor: null,
    selectedSubCategory: null,
  });

  // Refs for auto-scroll on drill-down
  const expensesChartRef = useRef<HTMLDivElement>(null);
  const incomeChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  // Auto-scroll to the appropriate chart when drill-down changes
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

  // Excludes pre-2025 bulk imports (same filter used by trend charts)
  const expensesFrom2025ForAnalysis = useMemo(() => {
    return allExpenses.filter(expense => getItalyYear(toDate(expense.date)) >= 2025);
  }, [allExpenses]);

  // Extract available years from expenses (2025+), sorted newest first
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    expensesFrom2025ForAnalysis.forEach(expense => {
      years.add(getItalyYear(toDate(expense.date)));
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [expensesFrom2025ForAnalysis]);

  // Filter expenses by selected year and optional month
  // Default (no year selected): show all expenses from 2025+
  const periodFilteredExpenses = useMemo(() => {
    if (selectedYear === null) return expensesFrom2025ForAnalysis;

    return expensesFrom2025ForAnalysis.filter(expense => {
      const date = toDate(expense.date);
      if (getItalyYear(date) !== selectedYear) return false;
      if (selectedMonth !== null && getItalyMonth(date) !== selectedMonth) return false;
      return true;
    });
  }, [expensesFrom2025ForAnalysis, selectedYear, selectedMonth]);

  /**
   * Reset drill-down state to initial category level
   * Called when year or month filter changes to prevent stale drill-down
   */
  const resetDrillDown = () => {
    setDrillDown({
      level: 'category',
      chartType: null,
      selectedCategory: null,
      selectedCategoryColor: null,
      selectedSubCategory: null,
    });
  };

  const handleYearChange = (value: string) => {
    if (value === '__all_years__') {
      setSelectedYear(null);
      setSelectedMonth(null);
    } else {
      setSelectedYear(parseInt(value));
      setSelectedMonth(null);
    }
    resetDrillDown();
  };

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value === '__all__' ? null : parseInt(value));
    resetDrillDown();
  };

  /**
   * Clamp percentage to valid chart domain
   * Prevents rendering bugs when values exceed expected range (0-100 or -100 to +100)
   */
  const clampPercentage = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));

  /**
   * Aggregate all months with income, expenses, and saving rate
   *
   * Algorithm:
   * 1. Create Map<"YYYY-MM", amounts>
   * 2. Iterate expenses/income, accumulate by month key
   * 3. Calculate saving rate: (income - expenses) / income
   * 4. Clamp percentages to valid chart domain
   * 5. Sort by month ascending
   *
   * Why Map? Efficient O(1) lookups for accumulation
   */
  const getMonthlyTrend = () => {
    const monthlyMap = new Map<string, { income: number; expenses: number; sortKey: string }>();

    allExpenses.forEach((expense: Expense) => {
      const date = toDate(expense.date);
      const { month, year } = getItalyMonthYear(date);
      const monthKey = `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
      const sortKey = `${year}-${String(month).padStart(2, '0')}`;

      const current = monthlyMap.get(monthKey) || { income: 0, expenses: 0, sortKey };

      if (expense.type === 'income') {
        current.income += expense.amount;
      } else {
        current.expenses += Math.abs(expense.amount);
      }

      monthlyMap.set(monthKey, current);
    });

    const data = Array.from(monthlyMap.entries())
      .map(([month, values]) => {
        const total = values.income + values.expenses;
        const incomePercentage = total > 0 ? (values.income / total) * 100 : 0;
        const expensesPercentage = total > 0 ? (values.expenses / total) * 100 : 0;
        const rawSavingRate = values.income > 0 ? ((values.income - values.expenses) / values.income) * 100 : 0;

        return {
          month,
          Entrate: values.income,
          Spese: values.expenses,
          Netto: values.income - values.expenses,
          'Entrate %': clampPercentage(incomePercentage, 0, 100),
          'Spese %': clampPercentage(expensesPercentage, 0, 100),
          'Saving Rate %': clampPercentage(rawSavingRate, -100, 100),
          sortKey: values.sortKey,
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    return data;
  };

  // Prepare yearly trend data (years on x-axis)
  const getYearlyTrend = () => {
    const yearlyMap = new Map<number, { income: number; expenses: number }>();

    allExpenses.forEach((expense: Expense) => {
      const date = toDate(expense.date);
      const year = getItalyYear(date);

      const current = yearlyMap.get(year) || { income: 0, expenses: 0 };

      if (expense.type === 'income') {
        current.income += expense.amount;
      } else {
        current.expenses += Math.abs(expense.amount);
      }

      yearlyMap.set(year, current);
    });

    const data = Array.from(yearlyMap.entries())
      .map(([year, values]) => {
        const total = values.income + values.expenses;
        const incomePercentage = total > 0 ? (values.income / total) * 100 : 0;
        const expensesPercentage = total > 0 ? (values.expenses / total) * 100 : 0;
        const rawSavingRate = values.income > 0 ? ((values.income - values.expenses) / values.income) * 100 : 0;

        return {
          year: year.toString(),
          Entrate: values.income,
          Spese: values.expenses,
          Netto: values.income - values.expenses,
          'Entrate %': clampPercentage(incomePercentage, 0, 100),
          'Spese %': clampPercentage(expensesPercentage, 0, 100),
          'Saving Rate %': clampPercentage(rawSavingRate, -100, 100),
        };
      })
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));

    return data;
  };

  // Prepare monthly trend for expenses by type (all months)
  const getMonthlyExpensesByType = (expenses: Expense[]) => {
    const monthlyMap = new Map<string, Record<string, number | string>>();

    expenses
      .filter((e: Expense) => e.type !== 'income')
      .forEach((expense: Expense) => {
        const date = toDate(expense.date);
        const { month, year } = getItalyMonthYear(date);
        const monthKey = `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
        const sortKey = `${year}-${String(month).padStart(2, '0')}`;

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { sortKey });
        }

        const current = monthlyMap.get(monthKey)!;
        const typeName = EXPENSE_TYPE_LABELS[expense.type as ExpenseType];
        current[typeName] = ((current[typeName] as number) || 0) + Math.abs(expense.amount);
      });

    const data = Array.from(monthlyMap.entries())
      .map(([month, values]) => {
        const { sortKey, ...rest } = values;
        return { month, sortKey, ...rest };
      })
      .sort((a, b) => (a.sortKey as string).localeCompare(b.sortKey as string));

    return data;
  };

  // Prepare yearly trend for expenses by type (years on x-axis)
  const getYearlyExpensesByType = (expenses: Expense[]) => {
    const yearlyMap = new Map<number, Record<string, number>>();

    expenses
      .filter((e: Expense) => e.type !== 'income')
      .forEach((expense: Expense) => {
        const date = toDate(expense.date);
        const year = getItalyYear(date);

        if (!yearlyMap.has(year)) {
          yearlyMap.set(year, {});
        }

        const current = yearlyMap.get(year)!;
        const typeName = EXPENSE_TYPE_LABELS[expense.type as ExpenseType];
        current[typeName] = (current[typeName] || 0) + Math.abs(expense.amount);
      });

    const data = Array.from(yearlyMap.entries())
      .map(([year, values]) => ({
        year: year.toString(),
        ...values,
      }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));

    return data;
  };

  // Prepare monthly trend for expenses by category (top 5, all months)
  const getMonthlyExpensesByCategory = (expenses: Expense[]) => {
    // First, get top 5 expense categories overall
    const categoryTotals = new Map<string, number>();
    expenses
      .filter((e: Expense) => e.type !== 'income')
      .forEach((expense: Expense) => {
        const current = categoryTotals.get(expense.categoryName) || 0;
        categoryTotals.set(expense.categoryName, current + Math.abs(expense.amount));
      });

    const top5Categories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Now build monthly data
    const monthlyMap = new Map<string, Record<string, number | string>>();

    expenses
      .filter((e: Expense) => e.type !== 'income')
      .forEach((expense: Expense) => {
        const date = toDate(expense.date);
        const { month, year } = getItalyMonthYear(date);
        const monthKey = `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
        const sortKey = `${year}-${String(month).padStart(2, '0')}`;

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { sortKey, Altro: 0 });
        }

        const current = monthlyMap.get(monthKey)!;
        const categoryName = top5Categories.includes(expense.categoryName)
          ? expense.categoryName
          : 'Altro';
        current[categoryName] = ((current[categoryName] as number) || 0) + Math.abs(expense.amount);
      });

    const data = Array.from(monthlyMap.entries())
      .map(([month, values]) => {
        const { sortKey, ...rest } = values;
        return { month, sortKey, ...rest };
      })
      .sort((a, b) => (a.sortKey as string).localeCompare(b.sortKey as string));

    return { data, categories: [...top5Categories, 'Altro'] };
  };

  // Prepare yearly trend for expenses by category (top 5, years on x-axis)
  const getYearlyExpensesByCategory = (expenses: Expense[]) => {
    // First, get top 5 expense categories overall
    const categoryTotals = new Map<string, number>();
    expenses
      .filter((e: Expense) => e.type !== 'income')
      .forEach((expense: Expense) => {
        const current = categoryTotals.get(expense.categoryName) || 0;
        categoryTotals.set(expense.categoryName, current + Math.abs(expense.amount));
      });

    const top5Categories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Now build yearly data
    const yearlyMap = new Map<number, Record<string, number>>();

    expenses
      .filter((e: Expense) => e.type !== 'income')
      .forEach((expense: Expense) => {
        const date = toDate(expense.date);
        const year = getItalyYear(date);

        if (!yearlyMap.has(year)) {
          yearlyMap.set(year, { Altro: 0 });
        }

        const current = yearlyMap.get(year)!;
        const categoryName = top5Categories.includes(expense.categoryName)
          ? expense.categoryName
          : 'Altro';
        current[categoryName] = (current[categoryName] || 0) + Math.abs(expense.amount);
      });

    const data = Array.from(yearlyMap.entries())
      .map(([year, values]) => ({
        year: year.toString(),
        ...values,
      }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));

    return { data, categories: [...top5Categories, 'Altro'] };
  };

  // Prepare monthly trend for income by category (top 5, all months)
  const getMonthlyIncomeByCategory = (expenses: Expense[]) => {
    // First, get top 5 income categories overall
    const categoryTotals = new Map<string, number>();
    expenses
      .filter((e: Expense) => e.type === 'income')
      .forEach((expense: Expense) => {
        const current = categoryTotals.get(expense.categoryName) || 0;
        categoryTotals.set(expense.categoryName, current + expense.amount);
      });

    const top5Categories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Now build monthly data
    const monthlyMap = new Map<string, Record<string, number | string>>();

    expenses
      .filter((e: Expense) => e.type === 'income')
      .forEach((expense: Expense) => {
        const date = toDate(expense.date);
        const { month, year } = getItalyMonthYear(date);
        const monthKey = `${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
        const sortKey = `${year}-${String(month).padStart(2, '0')}`;

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { sortKey, Altro: 0 });
        }

        const current = monthlyMap.get(monthKey)!;
        const categoryName = top5Categories.includes(expense.categoryName)
          ? expense.categoryName
          : 'Altro';
        current[categoryName] = ((current[categoryName] as number) || 0) + expense.amount;
      });

    const data = Array.from(monthlyMap.entries())
      .map(([month, values]) => {
        const { sortKey, ...rest } = values;
        return { month, sortKey, ...rest };
      })
      .sort((a, b) => (a.sortKey as string).localeCompare(b.sortKey as string));

    return { data, categories: [...top5Categories, 'Altro'] };
  };

  // Prepare yearly trend for income by category (top 5, years on x-axis)
  const getYearlyIncomeByCategory = (expenses: Expense[]) => {
    // First, get top 5 income categories overall
    const categoryTotals = new Map<string, number>();
    expenses
      .filter((e: Expense) => e.type === 'income')
      .forEach((expense: Expense) => {
        const current = categoryTotals.get(expense.categoryName) || 0;
        categoryTotals.set(expense.categoryName, current + expense.amount);
      });

    const top5Categories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Now build yearly data
    const yearlyMap = new Map<number, Record<string, number>>();

    expenses
      .filter((e: Expense) => e.type === 'income')
      .forEach((expense: Expense) => {
        const date = toDate(expense.date);
        const year = getItalyYear(date);

        if (!yearlyMap.has(year)) {
          yearlyMap.set(year, { Altro: 0 });
        }

        const current = yearlyMap.get(year)!;
        const categoryName = top5Categories.includes(expense.categoryName)
          ? expense.categoryName
          : 'Altro';
        current[categoryName] = (current[categoryName] || 0) + expense.amount;
      });

    const data = Array.from(yearlyMap.entries())
      .map(([year, values]) => ({
        year: year.toString(),
        ...values,
      }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));

    return { data, categories: [...top5Categories, 'Altro'] };
  };

  // ============================================
  // ANALISI PERIODO: Pie chart helpers
  // ============================================

  /**
   * Aggregate expenses by category name with percentage calculation
   * @param expenses - Expense array to aggregate (filtered by year+month)
   */
  const getExpensesByCategory = (expenses: Expense[]): ChartData[] => {
    const expenseItems = expenses.filter(e => e.type !== 'income');
    const total = calculateTotalExpenses(expenses);

    if (total === 0) return [];

    const categoryMap = new Map<string, number>();

    expenseItems.forEach(expense => {
      const current = categoryMap.get(expense.categoryName) || 0;
      categoryMap.set(expense.categoryName, current + Math.abs(expense.amount));
    });

    const data: ChartData[] = [];
    categoryMap.forEach((value, name) => {
      data.push({
        name,
        value,
        percentage: (value / total) * 100,
        color: COLORS[data.length % COLORS.length],
      });
    });

    return data.sort((a, b) => b.value - a.value);
  };

  /**
   * Aggregate income by category name with percentage calculation
   * @param expenses - Expense array to aggregate (filtered by year+month)
   */
  const getIncomeByCategory = (expenses: Expense[]): ChartData[] => {
    const incomeItems = expenses.filter(e => e.type === 'income');
    const total = calculateTotalIncome(expenses);

    if (total === 0) return [];

    const categoryMap = new Map<string, number>();

    incomeItems.forEach(expense => {
      const current = categoryMap.get(expense.categoryName) || 0;
      categoryMap.set(expense.categoryName, current + expense.amount);
    });

    const data: ChartData[] = [];
    categoryMap.forEach((value, name) => {
      data.push({
        name,
        value,
        percentage: (value / total) * 100,
        color: COLORS[data.length % COLORS.length],
      });
    });

    return data.sort((a, b) => b.value - a.value);
  };

  /**
   * Color derivation for subcategory visualization
   * Gradually darkens parent color so subcategories are visually related but distinct
   */
  const deriveSubcategoryColors = (baseColor: string, count: number): string[] => {
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      const factor = 1 - (i * 0.15);
      const newR = Math.round(Math.max(0, Math.min(255, r * factor)));
      const newG = Math.round(Math.max(0, Math.min(255, g * factor)));
      const newB = Math.round(Math.max(0, Math.min(255, b * factor)));
      colors.push(`#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`);
    }
    return colors;
  };

  /**
   * Get subcategories data for a selected category drill-down
   */
  const getSubcategoriesData = (expenses: Expense[], categoryName: string, chartType: ChartType): ChartData[] => {
    const filteredExpenses = expenses.filter(e =>
      e.categoryName === categoryName &&
      (chartType === 'income' ? e.type === 'income' : e.type !== 'income')
    );

    const total = filteredExpenses.reduce((sum, e) => sum + Math.abs(e.amount), 0);
    if (total === 0) return [];

    const subcategoryMap = new Map<string, number>();

    filteredExpenses.forEach(expense => {
      const subCatName = expense.subCategoryName || 'Altro';
      const current = subcategoryMap.get(subCatName) || 0;
      subcategoryMap.set(subCatName, current + Math.abs(expense.amount));
    });

    const baseColor = drillDown.selectedCategoryColor || COLORS[0];
    const subcatCount = subcategoryMap.size;
    const colors = deriveSubcategoryColors(baseColor, subcatCount);

    const data: ChartData[] = [];
    let colorIndex = 0;
    subcategoryMap.forEach((value, name) => {
      data.push({
        name,
        value,
        percentage: (value / total) * 100,
        color: colors[colorIndex % colors.length],
      });
      colorIndex++;
    });

    return data.sort((a, b) => b.value - a.value);
  };

  /**
   * Get filtered expenses for drill-down expense list view
   * Uses periodFilteredExpenses to respect year+month filter
   */
  const getFilteredExpenses = (): Expense[] => {
    if (!drillDown.selectedCategory) return [];

    return periodFilteredExpenses.filter(expense => {
      const matchesCategory = expense.categoryName === drillDown.selectedCategory;
      const matchesType = drillDown.chartType === 'income'
        ? expense.type === 'income'
        : expense.type !== 'income';

      if (!matchesCategory || !matchesType) return false;

      if (drillDown.selectedSubCategory) {
        if (drillDown.selectedSubCategory === 'Altro') {
          return !expense.subCategoryName;
        }
        return expense.subCategoryName === drillDown.selectedSubCategory;
      }

      return true;
    });
  };

  const handleCategoryClick = (data: ChartData, chartType: ChartType) => {
    setDrillDown({
      level: 'subcategory',
      chartType,
      selectedCategory: data.name,
      selectedCategoryColor: data.color,
      selectedSubCategory: null,
    });
  };

  const handleSubcategoryClick = (data: ChartData) => {
    setDrillDown(prev => ({
      ...prev,
      level: 'expenseList',
      selectedSubCategory: data.name,
    }));
  };

  const handleBack = () => {
    if (drillDown.level === 'expenseList') {
      setDrillDown(prev => ({
        ...prev,
        level: 'subcategory',
        selectedSubCategory: null,
      }));
    } else if (drillDown.level === 'subcategory') {
      resetDrillDown();
    }
  };

  const pieChartHeight = isMobile ? 320 : 500;
  const pieOuterRadius = isMobile ? 110 : 140;

  const renderLegendItems = (
    items: ChartData[],
    onItemClick?: (item: ChartData) => void,
    className?: string,
    maxItems?: number
  ) => {
    const filteredItems = items
      .filter(item => item.percentage >= 5)
      .sort((a, b) => b.value - a.value);
    const visibleItems = maxItems ? filteredItems.slice(0, maxItems) : filteredItems;
    const baseClassName = isMobile ? 'mt-4 flex flex-wrap gap-3' : 'pl-5';
    return (
      <div className={`${baseClassName} ${className || ''}`.trim()}>
        {visibleItems.map((item, index) => (
          <div
            key={`legend-item-${index}`}
            className={`flex items-center gap-2 text-sm ${onItemClick ? 'cursor-pointer' : ''}`}
            onClick={onItemClick ? () => onItemClick(item) : undefined}
          >
            <div className="h-3.5 w-3.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">
              {item.name} ({item.percentage.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Drill-down data computed from filtered expenses
  const currentSubcategoriesData = drillDown.level === 'subcategory' && drillDown.selectedCategory && drillDown.chartType
    ? getSubcategoriesData(periodFilteredExpenses, drillDown.selectedCategory, drillDown.chartType)
    : [];

  const currentFilteredExpenses = drillDown.level === 'expenseList'
    ? getFilteredExpenses()
    : [];

  // Period label for dynamic titles
  const periodLabel = selectedYear === null
    ? 'Storico Completo'
    : selectedMonth
      ? `${ITALIAN_MONTHS[selectedMonth - 1]} ${selectedYear}`
      : `${selectedYear}`;

  // Prepare yearly income/expense ratio data
  const getYearlyIncomeExpenseRatio = () => {
    const yearlyMap = new Map<number, Expense[]>();

    // Group expenses by year
    allExpenses.forEach((expense: Expense) => {
      const date = toDate(expense.date);
      const year = getItalyYear(date);

      if (!yearlyMap.has(year)) {
        yearlyMap.set(year, []);
      }

      yearlyMap.get(year)!.push(expense);
    });

    // Calculate ratio for each year
    const data = Array.from(yearlyMap.entries())
      .map(([year, yearExpenses]) => {
        const ratio = calculateIncomeExpenseRatio(yearExpenses);
        return {
          year: year.toString(),
          ratio: ratio,
        };
      })
      .filter((item) => item.ratio !== null) // Filter out years with no expenses
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));

    return data;
  };

  // Filter expenses from 2025 onwards for trend charts (excludes bulk-imported pre-2025 data)
  const expensesFrom2025 = allExpenses.filter((expense: Expense) => {
    const date = toDate(expense.date);
    return getItalyYear(date) >= 2025;
  });

  const monthlyTrendData = getMonthlyTrend();
  const yearlyTrendData = getYearlyTrend();
  const monthlyExpensesByType = getMonthlyExpensesByType(expensesFrom2025);
  const yearlyExpensesByType = getYearlyExpensesByType(expensesFrom2025);
  const monthlyExpensesByCategory = getMonthlyExpensesByCategory(expensesFrom2025);
  const yearlyExpensesByCategory = getYearlyExpensesByCategory(expensesFrom2025);
  const monthlyIncomeByCategory = getMonthlyIncomeByCategory(expensesFrom2025);
  const yearlyIncomeByCategory = getYearlyIncomeByCategory(expensesFrom2025);
  const yearlyIncomeExpenseRatioData = getYearlyIncomeExpenseRatio();

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
    ? filterRecentMonths(monthlyTrendData, recentMonthsLimit)
    : monthlyTrendData;
  const monthlyTrendPercentChartData = monthlyTrendChartData.map((item) => ({
    month: item.month,
    'Entrate %': item['Entrate %'],
    'Spese %': item['Spese %'],
    'Saving Rate %': item['Saving Rate %'],
  }));
  const monthlyExpensesByTypeChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyExpensesByType, recentMonthsLimit)
    : monthlyExpensesByType;
  const monthlyExpensesByCategoryChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyExpensesByCategory.data, recentMonthsLimit)
    : monthlyExpensesByCategory.data;
  const monthlyIncomeByCategoryChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyIncomeByCategory.data, recentMonthsLimit)
    : monthlyIncomeByCategory.data;
  const yearlyTrendPercentChartData = yearlyTrendData.map((item) => ({
    year: item.year,
    'Entrate %': item['Entrate %'],
    'Spese %': item['Spese %'],
    'Saving Rate %': item['Saving Rate %'],
  }));

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
      <div className="p-8">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Caricamento grafici...</p>
          </div>
        </div>
      </div>
    );
  }

  if (allExpenses.length === 0) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Cashflow Totale</h1>
          <div className="rounded-md border border-dashed p-8">
            <p className="text-muted-foreground">
              Nessun dato disponibile per i grafici
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Aggiungi alcune spese per visualizzare i grafici
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">Storico Completo</h2>
        <p className="text-muted-foreground mt-1">
          Visualizza l'andamento delle tue finanze nel tempo (tutti gli anni)
        </p>
      </div>

      {/* ==============================================
          ANALISI PERIODO: Year+month filtered charts
          (Sankey + Spese per Categoria + Entrate per Categoria)
          ============================================== */}
      <div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-800 p-4 sm:p-6">
        {/* Filter Controls */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Year + Month filter dropdowns */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              📊 Analisi Periodo
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {/* Year dropdown */}
              <Select
                value={selectedYear?.toString() || '__all_years__'}
                onValueChange={handleYearChange}
              >
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Tutti gli anni" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_years__">Tutti gli anni</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Month dropdown - enabled only when year is selected */}
              <Select
                value={selectedMonth?.toString() || '__all__'}
                onValueChange={handleMonthChange}
                disabled={selectedYear === null}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Tutto l'anno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Tutto l&apos;anno</SelectItem>
                  {ITALIAN_MONTHS.map((month, index) => (
                    <SelectItem key={index + 1} value={(index + 1).toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active filter indicator - shown only when filtering by specific year */}
          {(selectedYear !== null || selectedMonth !== null) && (
            <div className="rounded-md border border-blue-300 bg-blue-100 dark:bg-blue-900/30 dark:border-blue-700 p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-blue-700 dark:text-blue-400">📅</span>
                <span className="font-medium text-blue-900 dark:text-blue-200">
                  Filtro attivo: {periodLabel}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedYear(null); setSelectedMonth(null); resetDrillDown(); }}
                className="h-7 text-xs text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200"
              >
                Cancella
              </Button>
            </div>
          )}
        </div>

        {/* Charts or empty state */}
        {periodFilteredExpenses.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            Nessuna transazione trovata per {periodLabel}
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
            {/* CHART 1: Sankey Flow Diagram */}
            <div className="md:col-span-2">
              <CashflowSankeyChart
                expenses={periodFilteredExpenses}
                isMobile={isMobile}
                title={`Flusso Cashflow ${periodLabel}`}
              />
            </div>

            {/* Pie charts rendered via IIFE to use useMemo inside conditional */}
            {(() => {
              const expensesByCategoryData = getExpensesByCategory(periodFilteredExpenses);
              const incomeByCategoryData = getIncomeByCategory(periodFilteredExpenses);

              return (
                <>
                  {/* CHART 2: Spese per Categoria - Interactive Drill-Down */}
                  {(expensesByCategoryData.length > 0 || (drillDown.chartType === 'expenses' && drillDown.level !== 'category')) && (
                    <Card ref={expensesChartRef} className="md:col-span-2">
                      <CardHeader>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                            {drillDown.chartType === 'expenses' && drillDown.level !== 'category' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleBack}
                                className="w-full justify-start gap-1 sm:w-auto"
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Indietro
                              </Button>
                            )}
                            <CardTitle>
                              {drillDown.chartType === 'expenses' && drillDown.level === 'subcategory'
                                ? `Spese - ${drillDown.selectedCategory} - ${periodLabel}`
                                : drillDown.chartType === 'expenses' && drillDown.level === 'expenseList'
                                ? `Spese - ${drillDown.selectedCategory} - ${drillDown.selectedSubCategory} - ${periodLabel}`
                                : `Spese per Categoria - ${periodLabel}`}
                            </CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* Level 1: Category Pie Chart */}
                        {drillDown.level === 'category' && expensesByCategoryData.length > 0 && (
                          <ResponsiveContainer width="100%" height={pieChartHeight}>
                            <RechartsPC>
                              <Pie
                                data={expensesByCategoryData as any}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={!isMobile
                                  ? (entry: any) =>
                                    entry.percentage >= 5
                                      ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                                      : ''
                                  : false}
                                outerRadius={pieOuterRadius}
                                fill="#8884d8"
                                dataKey="value"
                                onClick={(data: any) => handleCategoryClick(data, 'expenses')}
                                cursor="pointer"
                              >
                                {expensesByCategoryData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    style={{ cursor: 'pointer' }}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) => formatCurrency(value)}
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #ccc',
                                  borderRadius: '4px',
                                }}
                              />
                              <Legend
                                layout={isMobile ? 'horizontal' : 'vertical'}
                                align={isMobile ? 'center' : 'right'}
                                verticalAlign={isMobile ? 'bottom' : 'middle'}
                                content={() => renderLegendItems(
                                  expensesByCategoryData,
                                  entry => handleCategoryClick(entry, 'expenses'),
                                  undefined,
                                  isMobile ? 3 : undefined
                                )}
                              />
                            </RechartsPC>
                          </ResponsiveContainer>
                        )}

                        {/* Level 2: Subcategory Pie Chart */}
                        {drillDown.level === 'subcategory' && drillDown.chartType === 'expenses' && currentSubcategoriesData.length > 0 && (
                          <ResponsiveContainer width="100%" height={pieChartHeight}>
                            <RechartsPC>
                              <Pie
                                data={currentSubcategoriesData as any}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={!isMobile
                                  ? (entry: any) =>
                                    entry.percentage >= 5
                                      ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                                      : ''
                                  : false}
                                outerRadius={pieOuterRadius}
                                fill="#8884d8"
                                dataKey="value"
                                onClick={(data: any) => handleSubcategoryClick(data)}
                                cursor="pointer"
                              >
                                {currentSubcategoriesData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    style={{ cursor: 'pointer' }}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) => formatCurrency(value)}
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #ccc',
                                  borderRadius: '4px',
                                }}
                              />
                              <Legend
                                layout={isMobile ? 'horizontal' : 'vertical'}
                                align={isMobile ? 'center' : 'right'}
                                verticalAlign={isMobile ? 'bottom' : 'middle'}
                                content={() => renderLegendItems(currentSubcategoriesData, entry => handleSubcategoryClick(entry))}
                              />
                            </RechartsPC>
                          </ResponsiveContainer>
                        )}

                        {/* Level 3: Expense List */}
                        {drillDown.level === 'expenseList' && drillDown.chartType === 'expenses' && currentFilteredExpenses.length > 0 && (
                          <div className="space-y-4">
                            <div className="space-y-3 sm:hidden">
                              {currentFilteredExpenses.map((expense) => {
                                const date = toDate(expense.date);
                                return (
                                  <div key={expense.id} className="rounded-md border p-3">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">
                                        {format(date, 'dd/MM/yyyy', { locale: it })}
                                      </span>
                                      <span className="font-medium text-red-600">
                                        {formatCurrency(expense.amount)}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                      {expense.notes || '-'}
                                    </p>
                                    {expense.link && (
                                      <a
                                        href={expense.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                                      >
                                        Apri link
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="hidden rounded-md border sm:block">
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
                                    {currentFilteredExpenses.map((expense) => {
                                      const date = toDate(expense.date);
                                      return (
                                        <tr key={expense.id} className="border-b hover:bg-muted/30">
                                          <td className="px-4 py-3 text-sm">
                                            {format(date, 'dd/MM/yyyy', { locale: it })}
                                          </td>
                                          <td className="px-4 py-3 text-sm text-right font-medium text-red-600">
                                            {formatCurrency(expense.amount)}
                                          </td>
                                          <td className="px-4 py-3 text-sm text-muted-foreground">
                                            {expense.notes || '-'}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            {expense.link && (
                                              <a
                                                href={expense.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex text-blue-600 hover:text-blue-800"
                                              >
                                                <ExternalLink className="h-4 w-4" />
                                              </a>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Totale: {currentFilteredExpenses.length} {currentFilteredExpenses.length === 1 ? 'voce' : 'voci'}
                            </div>
                          </div>
                        )}

                        {drillDown.level === 'expenseList' && drillDown.chartType === 'expenses' && currentFilteredExpenses.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            Nessuna spesa trovata
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* CHART 3: Entrate per Categoria - Interactive Drill-Down */}
                  {(incomeByCategoryData.length > 0 || (drillDown.chartType === 'income' && drillDown.level !== 'category')) && (
                    <Card ref={incomeChartRef} className="md:col-span-2">
                      <CardHeader>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                            {drillDown.chartType === 'income' && drillDown.level !== 'category' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleBack}
                                className="w-full justify-start gap-1 sm:w-auto"
                              >
                                <ChevronLeft className="h-4 w-4" />
                                Indietro
                              </Button>
                            )}
                            <CardTitle>
                              {drillDown.chartType === 'income' && drillDown.level === 'subcategory'
                                ? `Entrate - ${drillDown.selectedCategory} - ${periodLabel}`
                                : drillDown.chartType === 'income' && drillDown.level === 'expenseList'
                                ? `Entrate - ${drillDown.selectedCategory} - ${drillDown.selectedSubCategory} - ${periodLabel}`
                                : `Entrate per Categoria - ${periodLabel}`}
                            </CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* Level 1: Category Pie Chart */}
                        {drillDown.level === 'category' && incomeByCategoryData.length > 0 && (
                          <ResponsiveContainer width="100%" height={pieChartHeight}>
                            <RechartsPC>
                              <Pie
                                data={incomeByCategoryData as any}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={!isMobile
                                  ? (entry: any) =>
                                    entry.percentage >= 5
                                      ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                                      : ''
                                  : false}
                                outerRadius={pieOuterRadius}
                                fill="#8884d8"
                                dataKey="value"
                                onClick={(data: any) => handleCategoryClick(data, 'income')}
                                cursor="pointer"
                              >
                                {incomeByCategoryData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    style={{ cursor: 'pointer' }}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) => formatCurrency(value)}
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #ccc',
                                  borderRadius: '4px',
                                }}
                              />
                              <Legend
                                layout={isMobile ? 'horizontal' : 'vertical'}
                                align={isMobile ? 'center' : 'right'}
                                verticalAlign={isMobile ? 'bottom' : 'middle'}
                                content={() => renderLegendItems(incomeByCategoryData, entry => handleCategoryClick(entry, 'income'))}
                              />
                            </RechartsPC>
                          </ResponsiveContainer>
                        )}

                        {/* Level 2: Subcategory Pie Chart */}
                        {drillDown.level === 'subcategory' && drillDown.chartType === 'income' && currentSubcategoriesData.length > 0 && (
                          <ResponsiveContainer width="100%" height={pieChartHeight}>
                            <RechartsPC>
                              <Pie
                                data={currentSubcategoriesData as any}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={!isMobile
                                  ? (entry: any) =>
                                    entry.percentage >= 5
                                      ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                                      : ''
                                  : false}
                                outerRadius={pieOuterRadius}
                                fill="#8884d8"
                                dataKey="value"
                                onClick={(data: any) => handleSubcategoryClick(data)}
                                cursor="pointer"
                              >
                                {currentSubcategoriesData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    style={{ cursor: 'pointer' }}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) => formatCurrency(value)}
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: '1px solid #ccc',
                                  borderRadius: '4px',
                                }}
                              />
                              <Legend
                                layout={isMobile ? 'horizontal' : 'vertical'}
                                align={isMobile ? 'center' : 'right'}
                                verticalAlign={isMobile ? 'bottom' : 'middle'}
                                content={() => renderLegendItems(currentSubcategoriesData, entry => handleSubcategoryClick(entry))}
                              />
                            </RechartsPC>
                          </ResponsiveContainer>
                        )}

                        {/* Level 3: Income List */}
                        {drillDown.level === 'expenseList' && drillDown.chartType === 'income' && currentFilteredExpenses.length > 0 && (
                          <div className="space-y-4">
                            <div className="space-y-3 sm:hidden">
                              {currentFilteredExpenses.map((expense) => {
                                const date = toDate(expense.date);
                                return (
                                  <div key={expense.id} className="rounded-md border p-3">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">
                                        {format(date, 'dd/MM/yyyy', { locale: it })}
                                      </span>
                                      <span className="font-medium text-green-600">
                                        {formatCurrency(expense.amount)}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-sm text-muted-foreground">
                                      {expense.notes || '-'}
                                    </p>
                                    {expense.link && (
                                      <a
                                        href={expense.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                                      >
                                        Apri link
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="hidden rounded-md border sm:block">
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
                                    {currentFilteredExpenses.map((expense) => {
                                      const date = toDate(expense.date);
                                      return (
                                        <tr key={expense.id} className="border-b hover:bg-muted/30">
                                          <td className="px-4 py-3 text-sm">
                                            {format(date, 'dd/MM/yyyy', { locale: it })}
                                          </td>
                                          <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                                            {formatCurrency(expense.amount)}
                                          </td>
                                          <td className="px-4 py-3 text-sm text-muted-foreground">
                                            {expense.notes || '-'}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            {expense.link && (
                                              <a
                                                href={expense.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex text-blue-600 hover:text-blue-800"
                                              >
                                                <ExternalLink className="h-4 w-4" />
                                              </a>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Totale: {currentFilteredExpenses.length} {currentFilteredExpenses.length === 1 ? 'voce' : 'voci'}
                            </div>
                          </div>
                        )}

                        {drillDown.level === 'expenseList' && drillDown.chartType === 'income' && currentFilteredExpenses.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            Nessuna entrata trovata
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Monthly Trend */}
        {monthlyTrendData.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Trend Mensile</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  {isMobile && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFullMonthlyHistory(!showFullMonthlyHistory)}
                    >
                      {showFullMonthlyHistory ? 'Ultimi 24 mesi' : 'Mostra tutto'}
                    </Button>
                  )}
                  <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMonthlyTrendPercentage(!showMonthlyTrendPercentage)}
                >
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
                    <YAxis
                      tickFormatter={(value) => `${value.toFixed(0)}%`}
                      domain={[-100, 100]}
                      allowDataOverflow
                    />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="Entrate %" stroke="#10b981" strokeWidth={2} name="Entrate %" dot={!isMobile} />
                  <Line type="monotone" dataKey="Spese %" stroke="#ef4444" strokeWidth={2} name="Spese %" dot={!isMobile} />
                  <Line type="monotone" dataKey="Saving Rate %" stroke="#3b82f6" strokeWidth={2} name="Saving Rate %" dot={!isMobile} />
                </LineChart>
                ) : (
                  <LineChart data={monthlyTrendChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                    <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Entrate" stroke="#10b981" strokeWidth={2} dot={!isMobile} />
                    <Line type="monotone" dataKey="Spese" stroke="#ef4444" strokeWidth={2} dot={!isMobile} />
                    <Line type="monotone" dataKey="Netto" stroke="#3b82f6" strokeWidth={2} dot={!isMobile} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Yearly Trend */}
        {yearlyTrendData.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Trend Annuale</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowYearlyTrendPercentage(!showYearlyTrendPercentage)}
                >
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
                    <YAxis
                      tickFormatter={(value) => `${value.toFixed(0)}%`}
                      domain={[-100, 100]}
                      allowDataOverflow
                    />
                  <Tooltip
                    formatter={(value: number) => `${value.toFixed(2)}%`}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="Entrate %" stroke="#10b981" strokeWidth={2} name="Entrate %" dot={!isMobile} />
                  <Line type="monotone" dataKey="Spese %" stroke="#ef4444" strokeWidth={2} name="Spese %" dot={!isMobile} />
                  <Line type="monotone" dataKey="Saving Rate %" stroke="#3b82f6" strokeWidth={2} name="Saving Rate %" dot={!isMobile} />
                </LineChart>
                ) : (
                  <LineChart data={yearlyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                    <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Entrate" stroke="#10b981" strokeWidth={2} dot={!isMobile} />
                    <Line type="monotone" dataKey="Spese" stroke="#ef4444" strokeWidth={2} dot={!isMobile} />
                    <Line type="monotone" dataKey="Netto" stroke="#3b82f6" strokeWidth={2} dot={!isMobile} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Yearly Income/Expense Ratio */}
        {yearlyIncomeExpenseRatioData.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Rapporto Entrate/Spese Annuale</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={lineChartHeight}>
                <LineChart data={yearlyIncomeExpenseRatioData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                  <YAxis
                    tickFormatter={(value) => value.toFixed(2)}
                    domain={[0, 'auto']}
                  />
                  <Tooltip
                    formatter={(value: number) => value.toFixed(2)}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend content={renderLegendContent(isMobile ? 3 : undefined)} />
                  {/* Colored zones */}
                  <ReferenceArea y1={1.2} y2={5} fill="#10b981" fillOpacity={0.1} />
                  <ReferenceArea y1={0.8} y2={1.2} fill="#eab308" fillOpacity={0.1} />
                  <ReferenceArea y1={0} y2={0.8} fill="#ef4444" fillOpacity={0.1} />
                  {/* Break-even line at 1.0 */}
                  <ReferenceLine
                    y={1.0}
                    stroke="#666"
                    strokeDasharray="5 5"
                    label={{ value: 'Break-even (1.0)', position: 'right', fill: '#666', fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ratio"
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    name="Rapporto"
                    dot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <div className="mt-4 text-sm text-muted-foreground">
                <p className="mb-1">
                  <span className="inline-block w-3 h-3 bg-green-600 opacity-30 mr-2"></span>
                  ≥ 1.2: Salute finanziaria ottima
                </p>
                <p className="mb-1">
                  <span className="inline-block w-3 h-3 bg-yellow-600 opacity-30 mr-2"></span>
                  0.8 - 1.2: In equilibrio
                </p>
                <p>
                  <span className="inline-block w-3 h-3 bg-red-600 opacity-30 mr-2"></span>
                  &lt; 0.8: Attenzione alle spese
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Monthly Trend - Expenses by Type */}
        {monthlyExpensesByType.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Trend Mensile Spese per Tipo</CardTitle>
                {isMobile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFullMonthlyHistory(!showFullMonthlyHistory)}
                  >
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
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend content={renderLegendContent(isMobile ? 3 : undefined)} />
                  <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.fixed} stroke="#3b82f6" strokeWidth={2} dot={!isMobile} />
                  <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.variable} stroke="#8b5cf6" strokeWidth={2} dot={!isMobile} />
                  <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.debt} stroke="#f59e0b" strokeWidth={2} dot={!isMobile} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Yearly Trend - Expenses by Type */}
        {yearlyExpensesByType.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Trend Annuale Spese per Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={lineChartHeight}>
                <LineChart data={yearlyExpensesByType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend content={renderLegendContent(isMobile ? 3 : undefined)} />
                  <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.fixed} stroke="#3b82f6" strokeWidth={2} dot={!isMobile} />
                  <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.variable} stroke="#8b5cf6" strokeWidth={2} dot={!isMobile} />
                  <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.debt} stroke="#f59e0b" strokeWidth={2} dot={!isMobile} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Monthly Trend - Expenses by Category */}
        {monthlyExpensesByCategory.data.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Trend Mensile Spese per Categoria (Top 5)</CardTitle>
                {isMobile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFullMonthlyHistory(!showFullMonthlyHistory)}
                  >
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
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend content={renderLegendContent(isMobile ? 3 : undefined)} />
                  {monthlyExpensesByCategory.categories.filter(cat => cat !== 'Altro').map((category, index) => (
                    <Line
                      key={category}
                      type="monotone"
                      dataKey={category}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Yearly Trend - Expenses by Category */}
        {yearlyExpensesByCategory.data.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Trend Annuale Spese per Categoria (Top 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={lineChartHeight}>
                <LineChart data={yearlyExpensesByCategory.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend />
                  {yearlyExpensesByCategory.categories.filter(cat => cat !== 'Altro').map((category, index) => (
                    <Line
                      key={category}
                      type="monotone"
                      dataKey={category}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Monthly Trend - Income by Category */}
        {monthlyIncomeByCategory.data.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>Trend Mensile Entrate per Categoria (Top 5)</CardTitle>
                {isMobile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFullMonthlyHistory(!showFullMonthlyHistory)}
                  >
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
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend />
                  {monthlyIncomeByCategory.categories.filter(cat => cat !== 'Altro').map((category, index) => (
                    <Line
                      key={category}
                      type="monotone"
                      dataKey={category}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Yearly Trend - Income by Category */}
        {yearlyIncomeByCategory.data.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Trend Annuale Entrate per Categoria (Top 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={lineChartHeight}>
                <LineChart data={yearlyIncomeByCategory.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                  <YAxis tickFormatter={(value) => formatCurrencyCompact(value)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend />
                  {yearlyIncomeByCategory.categories.filter(cat => cat !== 'Altro').map((category, index) => (
                    <Line
                      key={category}
                      type="monotone"
                      dataKey={category}
                      stroke={COLORS[index % COLORS.length]}
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
