/**
 * Interactive drill-down expense analysis for current year
 *
 * THREE-LEVEL DRILL-DOWN:
 * Level 1: Category view (e.g., "Food & Dining")
 * Level 2: Subcategory view (e.g., "Groceries", "Restaurants")
 * Level 3: Expense list (individual transactions)
 *
 * State Machine: DrillDownState tracks current level + selected items
 * Navigation: Click category → drill to subcategories → drill to expenses
 *            Back button returns to previous level
 *
 * Color Inheritance: Subcategories derive colors from parent category
 * using brightness adjustment (see deriveSubcategoryColors)
 */
'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { calculateTotalIncome, calculateTotalExpenses } from '@/lib/services/expenseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, ChevronLeft, ExternalLink, Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

// Italian month names for filter dropdown
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

interface CurrentYearTabProps {
  allExpenses: Expense[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function CurrentYearTab({ allExpenses, loading }: CurrentYearTabProps) {
  // Drill-down state
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    level: 'category',
    chartType: null,
    selectedCategory: null,
    selectedCategoryColor: null,
    selectedSubCategory: null,
  });

  // Percentage toggle for monthly trend
  const [showMonthlyTrendPercentage, setShowMonthlyTrendPercentage] = useState(false);

  // Info alert dismissal state
  const [showDrillDownInfo, setShowDrillDownInfo] = useState(true);

  // Month filter for Sankey chart (null = all year, 1-12 = specific month)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  // Responsive state for mobile-specific chart rendering
  const [isMobile, setIsMobile] = useState(false);

  // Refs for auto-scroll on drill-down
  const expensesChartRef = useRef<HTMLDivElement>(null);
  const incomeChartRef = useRef<HTMLDivElement>(null);

  // Get current year
  const currentYear = getItalyYear();

  // Load alert dismissal state from localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('drillDownInfoDismissed');
    if (dismissed === 'true') {
      setShowDrillDownInfo(false);
    }
  }, []);

  // Track mobile breakpoint to optimize chart density and legends
  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  // Auto-scroll to the appropriate chart when drill-down changes
  // Prevents user confusion when content changes during navigation.
  // 100ms setTimeout waits for DOM update before scrolling.
  useEffect(() => {
    if (drillDown.level !== 'category' && drillDown.chartType) {
      const targetRef = drillDown.chartType === 'expenses' ? expensesChartRef : incomeChartRef;
      if (targetRef.current) {
        // Small delay to allow DOM to update
        setTimeout(() => {
          targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [drillDown.level, drillDown.chartType]);

  // Filter expenses for current year only using useMemo
  const currentYearExpenses = useMemo(() => {
    return allExpenses.filter(expense => getItalyYear(toDate(expense.date)) === currentYear);
  }, [allExpenses, currentYear]);

  // Filter expenses for Sankey chart based on selected month
  // Uses timezone-aware helpers to ensure consistent filtering (server UTC vs client CET)
  const sankeyFilteredExpenses = useMemo(() => {
    if (selectedMonth === null) {
      // No month filter: return all current year expenses
      return currentYearExpenses;
    }

    // Filter by specific month using Italy timezone
    // getItalyMonth ensures consistent results between server (Vercel UTC) and client
    return currentYearExpenses.filter(expense => {
      const expenseDate = toDate(expense.date);
      const expenseMonth = getItalyMonth(expenseDate);
      return expenseMonth === selectedMonth;
    });
  }, [currentYearExpenses, selectedMonth]);

  /**
   * Aggregate expenses by category name with percentage calculation
   *
   * Algorithm:
   * 1. Filter out income (only expenses)
   * 2. Create Map<categoryName, amount>
   * 3. Accumulate amounts by category
   * 4. Calculate percentages from total
   * 5. Sort by value descending
   *
   * Why Map? O(1) lookups, preserves insertion order for debugging
   */
  const getExpensesByCategory = (): ChartData[] => {
    const expenseItems = currentYearExpenses.filter(e => e.type !== 'income');
    const total = calculateTotalExpenses(currentYearExpenses);

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

  // Prepare data for income by category
  const getIncomeByCategory = (): ChartData[] => {
    const incomeItems = currentYearExpenses.filter(e => e.type === 'income');
    const total = calculateTotalIncome(currentYearExpenses);

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

  // Prepare data for expenses by type
  const getExpensesByType = (): ChartData[] => {
    const typeMap = new Map<ExpenseType, number>();
    const total = calculateTotalExpenses(currentYearExpenses);

    if (total === 0) return [];

    currentYearExpenses
      .filter(e => e.type !== 'income')
      .forEach(expense => {
        const current = typeMap.get(expense.type) || 0;
        typeMap.set(expense.type, current + Math.abs(expense.amount));
      });

    const typeColors: Record<ExpenseType, string> = {
      fixed: '#3b82f6',
      variable: '#8b5cf6',
      debt: '#f59e0b',
      income: '#10b981',
    };

    const data: ChartData[] = [];
    typeMap.forEach((value, type) => {
      data.push({
        name: EXPENSE_TYPE_LABELS[type],
        value,
        percentage: (value / total) * 100,
        color: typeColors[type],
      });
    });

    return data.sort((a, b) => b.value - a.value);
  };

  // Prepare monthly trend data
  const getMonthlyTrend = () => {
    const monthlyMap = new Map<string, { income: number; expenses: number; sortKey: string }>();

    currentYearExpenses.forEach(expense => {
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
        const savingRate = values.income > 0 ? ((values.income - values.expenses) / values.income) * 100 : 0;

        return {
          month,
          Entrate: values.income,
          Spese: values.expenses,
          Netto: values.income - values.expenses,
          // Clamp percentages to prevent chart rendering bugs:
          // - Saving Rate can be < -100% (spending > 2x income)
          // - Charts crash on extreme values outside expected domain (-100 to +100)
          'Entrate %': Math.min(100, Math.max(0, incomePercentage)),
          'Spese %': Math.min(100, Math.max(0, expensesPercentage)),
          'Saving Rate %': Math.min(100, Math.max(-100, savingRate)),
          sortKey: values.sortKey,
        };
      })
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    return data;
  };

  // Prepare monthly trend for expenses by type
  const getMonthlyExpensesByType = () => {
    const monthlyMap = new Map<string, Record<string, number | string>>();

    const typeColors: Record<ExpenseType, string> = {
      fixed: '#3b82f6',
      variable: '#8b5cf6',
      debt: '#f59e0b',
      income: '#10b981',
    };

    currentYearExpenses
      .filter(e => e.type !== 'income')
      .forEach(expense => {
        const date = toDate(expense.date);
        const monthKey = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
        const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, { sortKey });
        }

        const current = monthlyMap.get(monthKey)!;
        const typeName = EXPENSE_TYPE_LABELS[expense.type];
        current[typeName] = ((current[typeName] as number) || 0) + Math.abs(expense.amount);
      });

    const data = Array.from(monthlyMap.entries())
      .map(([month, values]) => {
        const { sortKey, ...rest } = values;
        return { month, sortKey, ...rest };
      })
      .sort((a, b) => (a.sortKey as string).localeCompare(b.sortKey as string));

    return { data, colors: typeColors };
  };

  // Prepare monthly trend for expenses by category (top 5)
  const getMonthlyExpensesByCategory = () => {
    // First, get top 5 expense categories
    const categoryTotals = new Map<string, number>();
    currentYearExpenses
      .filter(e => e.type !== 'income')
      .forEach(expense => {
        const current = categoryTotals.get(expense.categoryName) || 0;
        categoryTotals.set(expense.categoryName, current + Math.abs(expense.amount));
      });

    const top5Categories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Now build monthly data
    const monthlyMap = new Map<string, Record<string, number | string>>();

    currentYearExpenses
      .filter(e => e.type !== 'income')
      .forEach(expense => {
        const date = toDate(expense.date);
        const monthKey = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
        const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

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

  // Prepare monthly trend for income by category (top 5)
  const getMonthlyIncomeByCategory = () => {
    // First, get top 5 income categories
    const categoryTotals = new Map<string, number>();
    currentYearExpenses
      .filter(e => e.type === 'income')
      .forEach(expense => {
        const current = categoryTotals.get(expense.categoryName) || 0;
        categoryTotals.set(expense.categoryName, current + expense.amount);
      });

    const top5Categories = Array.from(categoryTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    // Now build monthly data
    const monthlyMap = new Map<string, Record<string, number | string>>();

    currentYearExpenses
      .filter(e => e.type === 'income')
      .forEach(expense => {
        const date = toDate(expense.date);
        const monthKey = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
        const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

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

  /**
   * Color derivation algorithm for subcategory visualization
   *
   * Algorithm:
   * 1. Parse parent color from hex to RGB
   * 2. Calculate brightness factor (index * 0.15)
   * 3. Adjust RGB channels: gradually darken for each item
   * 4. Convert back to hex
   *
   * Why? Subcategories should visually relate to parent but remain distinct.
   * Brightness range: 1.0 (full) to 0.55 (darkened) of parent color.
   */
  const deriveSubcategoryColors = (baseColor: string, count: number): string[] => {
    // Parse hex color to RGB
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
      // Create variations by adjusting brightness
      const factor = 1 - (i * 0.15); // Gradually darken
      const newR = Math.round(Math.max(0, Math.min(255, r * factor)));
      const newG = Math.round(Math.max(0, Math.min(255, g * factor)));
      const newB = Math.round(Math.max(0, Math.min(255, b * factor)));
      colors.push(`#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`);
    }
    return colors;
  };

  // Get subcategories data for a selected category
  const getSubcategoriesData = (categoryName: string, chartType: ChartType): ChartData[] => {
    const filteredExpenses = currentYearExpenses.filter(e =>
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

  // Get expenses for a specific category and subcategory
  const getFilteredExpenses = (): Expense[] => {
    if (!drillDown.selectedCategory) return [];

    return currentYearExpenses.filter(expense => {
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

  // Handle category slice click
  const handleCategoryClick = (data: ChartData, chartType: ChartType) => {
    setDrillDown({
      level: 'subcategory',
      chartType,
      selectedCategory: data.name,
      selectedCategoryColor: data.color,
      selectedSubCategory: null,
    });
  };

  // Handle subcategory slice click
  const handleSubcategoryClick = (data: ChartData) => {
    setDrillDown(prev => ({
      ...prev,
      level: 'expenseList',
      selectedSubCategory: data.name,
    }));
  };

  // Handle back navigation
  const handleBack = () => {
    if (drillDown.level === 'expenseList') {
      setDrillDown(prev => ({
        ...prev,
        level: 'subcategory',
        selectedSubCategory: null,
      }));
    } else if (drillDown.level === 'subcategory') {
      setDrillDown({
        level: 'category',
        chartType: null,
        selectedCategory: null,
        selectedCategoryColor: null,
        selectedSubCategory: null,
      });
    }
  };

  // Handle dismissal of drill-down info alert
  const handleDismissInfo = () => {
    setShowDrillDownInfo(false);
    localStorage.setItem('drillDownInfoDismissed', 'true');
  };

  const pieChartHeight = isMobile ? 320 : 500;
  const pieOuterRadius = isMobile ? 110 : 140;
  const lineChartHeight = isMobile ? 260 : 350;
  const xAxisProps = isMobile
    ? { angle: -45, textAnchor: 'end' as const, height: 60, interval: 0 }
    : { interval: 'preserveStartEnd' as const };
  const axisTickProps = { fontSize: isMobile ? 10 : 12 };

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

  const expensesByCategoryData = getExpensesByCategory();
  const incomeByCategoryData = getIncomeByCategory();
  const expensesByTypeData = getExpensesByType();
  const monthlyTrendData = getMonthlyTrend();
  const monthlyTrendPercentData = monthlyTrendData.map((item) => ({
    month: item.month,
    'Entrate %': item['Entrate %'],
    'Spese %': item['Spese %'],
    'Saving Rate %': item['Saving Rate %'],
  }));
  const monthlyExpensesByType = getMonthlyExpensesByType();
  const monthlyExpensesByCategory = getMonthlyExpensesByCategory();
  const monthlyIncomeByCategory = getMonthlyIncomeByCategory();

  // Get current drill-down data
  const currentSubcategoriesData = drillDown.level === 'subcategory' && drillDown.selectedCategory && drillDown.chartType
    ? getSubcategoriesData(drillDown.selectedCategory, drillDown.chartType)
    : [];

  const currentFilteredExpenses = drillDown.level === 'expenseList'
    ? getFilteredExpenses()
    : [];

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
          <h1 className="text-3xl font-bold mb-4">Cashflow {currentYear}</h1>
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
        <h2 className="text-2xl font-bold">Anno {currentYear}</h2>
        <p className="text-muted-foreground mt-1">
          Visualizza l&apos;andamento delle tue finanze per l&apos;anno corrente
        </p>
      </div>

      {/* Info Alert for Drill-Down Functionality */}
      {showDrillDownInfo && drillDown.level === 'category' && (expensesByCategoryData.length > 0 || incomeByCategoryData.length > 0) && (
        <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
          <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="flex items-start justify-between gap-4">
            <span className="text-blue-900 dark:text-blue-100">
              💡 <strong>Suggerimento:</strong> Clicca sulle fette dei grafici &quot;Spese per Categoria&quot; e &quot;Entrate per Categoria&quot; per visualizzare i dettagli delle sottocategorie.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissInfo}
              className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800 hover:bg-blue-100 dark:text-blue-400 dark:hover:text-blue-200 dark:hover:bg-blue-900"
              aria-label="Chiudi suggerimento"
            >
              <X className="h-4 w-4" />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Charts Grid */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Expenses by Category - Interactive Drill-Down */}
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
                      ? `Spese - ${drillDown.selectedCategory}`
                      : drillDown.chartType === 'expenses' && drillDown.level === 'expenseList'
                      ? `Spese - ${drillDown.selectedCategory} - ${drillDown.selectedSubCategory}`
                      : 'Spese per Categoria'}
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

        {/* Income by Category - Interactive Drill-Down */}
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
                      ? `Entrate - ${drillDown.selectedCategory}`
                      : drillDown.chartType === 'income' && drillDown.level === 'expenseList'
                      ? `Entrate - ${drillDown.selectedCategory} - ${drillDown.selectedSubCategory}`
                      : 'Entrate per Categoria'}
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

              {/* Level 3: Expense List */}
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

        {/* Expenses by Type */}
        {expensesByTypeData.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Spese per Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={pieChartHeight}>
                <RechartsPC>
                  <Pie
                    data={expensesByTypeData as any}
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
                  >
                    {expensesByTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
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
                    content={() => renderLegendItems(expensesByTypeData)}
                  />
                </RechartsPC>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Monthly Trend */}
        {monthlyTrendData.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Trend Mensile</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMonthlyTrendPercentage(!showMonthlyTrendPercentage)}
                >
                  {showMonthlyTrendPercentage ? '€ Valori Assoluti' : '% Percentuali'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={lineChartHeight}>
                {showMonthlyTrendPercentage ? (
                  <LineChart data={monthlyTrendPercentData}>
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
                    <Line type="monotone" dataKey="Entrate %" stroke="#10b981" strokeWidth={2} name="Entrate %" />
                    <Line type="monotone" dataKey="Spese %" stroke="#ef4444" strokeWidth={2} name="Spese %" />
                    <Line type="monotone" dataKey="Saving Rate %" stroke="#3b82f6" strokeWidth={2} name="Saving Rate %" />
                  </LineChart>
                ) : (
                  <LineChart data={monthlyTrendData}>
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
                    <Line type="monotone" dataKey="Entrate" stroke="#10b981" strokeWidth={2} />
                    <Line type="monotone" dataKey="Spese" stroke="#ef4444" strokeWidth={2} />
                    <Line type="monotone" dataKey="Netto" stroke="#3b82f6" strokeWidth={2} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Monthly Trend - Expenses by Type */}
        {monthlyExpensesByType.data.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Trend Mensile Spese per Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={lineChartHeight}>
                <LineChart data={monthlyExpensesByType.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                  <YAxis tickFormatter={(value) => `€${value.toLocaleString('it-IT')}`} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.fixed} stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.variable} stroke="#8b5cf6" strokeWidth={2} />
                  <Line type="monotone" dataKey={EXPENSE_TYPE_LABELS.debt} stroke="#f59e0b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Monthly Trend - Expenses by Category */}
        {monthlyExpensesByCategory.data.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Trend Mensile Spese per Categoria (Top 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={lineChartHeight}>
                <LineChart data={monthlyExpensesByCategory.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                  <YAxis tickFormatter={(value) => `€${value.toLocaleString('it-IT')}`} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  />
                  <Legend />
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

        {/* Monthly Trend - Income by Category */}
        {monthlyIncomeByCategory.data.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Trend Mensile Entrate per Categoria (Top 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={lineChartHeight}>
                <LineChart data={monthlyIncomeByCategory.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                  <YAxis tickFormatter={(value) => `€${value.toLocaleString('it-IT')}`} />
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

        {/* Month filter for Sankey chart */}
        {currentYearExpenses.length > 0 && (
          <div className="flex flex-col gap-4 md:col-span-2">
            {/* Month selector */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Label htmlFor="sankeyMonthFilter" className="text-sm font-medium">
                Filtro Mese Sankey
              </Label>
              <Select
                value={selectedMonth?.toString() || '__all__'}
                onValueChange={(value) => setSelectedMonth(value === '__all__' ? null : parseInt(value))}
              >
                <SelectTrigger id="sankeyMonthFilter" className="w-full sm:w-[200px]">
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

            {/* Active filter indicator - shows when month is selected */}
            {selectedMonth !== null && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-blue-700 dark:text-blue-400">📅</span>
                  <span className="font-medium text-blue-900 dark:text-blue-200">
                    Filtro attivo: {ITALIAN_MONTHS[selectedMonth - 1]} {currentYear}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedMonth(null)}
                  className="h-7 text-xs text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-200"
                >
                  Cancella
                </Button>
              </div>
            )}

            {/* Empty state when filtered month has no expenses */}
            {selectedMonth !== null && sankeyFilteredExpenses.length === 0 && (
              <Card>
                <CardContent className="py-12">
                  <p className="text-center text-muted-foreground">
                    Nessuna spesa trovata per {ITALIAN_MONTHS[selectedMonth - 1]} {currentYear}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Sankey Flow Diagram - Budget View */}
            {sankeyFilteredExpenses.length > 0 && (
              <CashflowSankeyChart
                expenses={sankeyFilteredExpenses}
                isMobile={isMobile}
                title={selectedMonth
                  ? `Flusso Cashflow ${ITALIAN_MONTHS[selectedMonth - 1]} ${currentYear}`
                  : "Flusso Cashflow Anno Corrente"
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
