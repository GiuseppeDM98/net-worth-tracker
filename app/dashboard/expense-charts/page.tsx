'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { getAllExpenses, calculateTotalIncome, calculateTotalExpenses } from '@/lib/services/expenseService';
import { Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, ChevronLeft, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
} from 'recharts';
import { formatCurrency } from '@/lib/services/chartService';

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

type DrillDownLevel = 'category' | 'subcategory' | 'expenseList';
type ChartType = 'expenses' | 'income';

interface DrillDownState {
  level: DrillDownLevel;
  chartType: ChartType | null;
  selectedCategory: string | null;
  selectedCategoryColor: string | null;
  selectedSubCategory: string | null;
}

export default function ExpenseChartsPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill-down state
  const [drillDown, setDrillDown] = useState<DrillDownState>({
    level: 'category',
    chartType: null,
    selectedCategory: null,
    selectedCategoryColor: null,
    selectedSubCategory: null,
  });

  // Get current year
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (user) {
      loadExpenses();
    }
  }, [user]);

  const loadExpenses = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getAllExpenses(user.uid);
      setExpenses(data);
    } catch (error) {
      console.error('Error loading expenses:', error);
      toast.error('Errore nel caricamento delle spese');
    } finally {
      setLoading(false);
    }
  };

  // Filter expenses for current year only
  const currentYearExpenses = expenses.filter(expense => {
    const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
    return date.getFullYear() === currentYear;
  });

  // Prepare data for expenses by category
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
      const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
      const monthKey = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
      const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      const current = monthlyMap.get(monthKey) || { income: 0, expenses: 0, sortKey };

      if (expense.type === 'income') {
        current.income += expense.amount;
      } else {
        current.expenses += Math.abs(expense.amount);
      }

      monthlyMap.set(monthKey, current);
    });

    const data = Array.from(monthlyMap.entries())
      .map(([month, values]) => ({
        month,
        Entrate: values.income,
        Spese: values.expenses,
        Netto: values.income - values.expenses,
        sortKey: values.sortKey,
      }))
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
        const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
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
        const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
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
        const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
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

  // Helper function to derive subcategory colors from parent category color
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

  const expensesByCategoryData = getExpensesByCategory();
  const incomeByCategoryData = getIncomeByCategory();
  const expensesByTypeData = getExpensesByType();
  const monthlyTrendData = getMonthlyTrend();
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

  if (expenses.length === 0) {
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
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Cashflow {currentYear}</h1>
        <p className="text-muted-foreground mt-1">
          Visualizza l&apos;andamento delle tue finanze
        </p>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Expenses by Category - Interactive Drill-Down */}
        {(expensesByCategoryData.length > 0 || (drillDown.chartType === 'expenses' && drillDown.level !== 'category')) && (
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {drillDown.chartType === 'expenses' && drillDown.level !== 'category' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBack}
                      className="gap-1"
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
                <ResponsiveContainer width="100%" height={500}>
                  <RechartsPC>
                    <Pie
                      data={expensesByCategoryData as any}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) =>
                        entry.percentage >= 5
                          ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                          : ''
                      }
                      outerRadius={140}
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
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      content={() => {
                        const filteredData = expensesByCategoryData
                          .filter(d => d.percentage >= 5)
                          .sort((a, b) => b.value - a.value);
                        return (
                          <div style={{ paddingLeft: '20px' }}>
                            {filteredData.map((entry, index) => (
                              <div
                                key={`legend-item-${index}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  marginBottom: '8px',
                                  fontSize: '14px',
                                  cursor: 'pointer',
                                }}
                                onClick={() => handleCategoryClick(entry, 'expenses')}
                              >
                                <div
                                  style={{
                                    width: '14px',
                                    height: '14px',
                                    backgroundColor: entry.color,
                                    marginRight: '8px',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ color: '#374151' }}>
                                  {entry.name} ({entry.percentage.toFixed(1)}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                  </RechartsPC>
                </ResponsiveContainer>
              )}

              {/* Level 2: Subcategory Pie Chart */}
              {drillDown.level === 'subcategory' && drillDown.chartType === 'expenses' && currentSubcategoriesData.length > 0 && (
                <ResponsiveContainer width="100%" height={500}>
                  <RechartsPC>
                    <Pie
                      data={currentSubcategoriesData as any}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) =>
                        entry.percentage >= 5
                          ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                          : ''
                      }
                      outerRadius={140}
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
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      content={() => {
                        const filteredData = currentSubcategoriesData
                          .filter(d => d.percentage >= 5)
                          .sort((a, b) => b.value - a.value);
                        return (
                          <div style={{ paddingLeft: '20px' }}>
                            {filteredData.map((entry, index) => (
                              <div
                                key={`legend-item-${index}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  marginBottom: '8px',
                                  fontSize: '14px',
                                  cursor: 'pointer',
                                }}
                                onClick={() => handleSubcategoryClick(entry)}
                              >
                                <div
                                  style={{
                                    width: '14px',
                                    height: '14px',
                                    backgroundColor: entry.color,
                                    marginRight: '8px',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ color: '#374151' }}>
                                  {entry.name} ({entry.percentage.toFixed(1)}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                  </RechartsPC>
                </ResponsiveContainer>
              )}

              {/* Level 3: Expense List */}
              {drillDown.level === 'expenseList' && drillDown.chartType === 'expenses' && currentFilteredExpenses.length > 0 && (
                <div className="space-y-4">
                  <div className="rounded-md border">
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
                            const date = expense.date instanceof Date
                              ? expense.date
                              : (expense.date as Timestamp).toDate();
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
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {drillDown.chartType === 'income' && drillDown.level !== 'category' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBack}
                      className="gap-1"
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
                <ResponsiveContainer width="100%" height={500}>
                  <RechartsPC>
                    <Pie
                      data={incomeByCategoryData as any}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) =>
                        entry.percentage >= 5
                          ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                          : ''
                      }
                      outerRadius={140}
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
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      content={() => {
                        const filteredData = incomeByCategoryData
                          .filter(d => d.percentage >= 5)
                          .sort((a, b) => b.value - a.value);
                        return (
                          <div style={{ paddingLeft: '20px' }}>
                            {filteredData.map((entry, index) => (
                              <div
                                key={`legend-item-${index}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  marginBottom: '8px',
                                  fontSize: '14px',
                                  cursor: 'pointer',
                                }}
                                onClick={() => handleCategoryClick(entry, 'income')}
                              >
                                <div
                                  style={{
                                    width: '14px',
                                    height: '14px',
                                    backgroundColor: entry.color,
                                    marginRight: '8px',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ color: '#374151' }}>
                                  {entry.name} ({entry.percentage.toFixed(1)}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                  </RechartsPC>
                </ResponsiveContainer>
              )}

              {/* Level 2: Subcategory Pie Chart */}
              {drillDown.level === 'subcategory' && drillDown.chartType === 'income' && currentSubcategoriesData.length > 0 && (
                <ResponsiveContainer width="100%" height={500}>
                  <RechartsPC>
                    <Pie
                      data={currentSubcategoriesData as any}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) =>
                        entry.percentage >= 5
                          ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                          : ''
                      }
                      outerRadius={140}
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
                      layout="vertical"
                      align="right"
                      verticalAlign="middle"
                      content={() => {
                        const filteredData = currentSubcategoriesData
                          .filter(d => d.percentage >= 5)
                          .sort((a, b) => b.value - a.value);
                        return (
                          <div style={{ paddingLeft: '20px' }}>
                            {filteredData.map((entry, index) => (
                              <div
                                key={`legend-item-${index}`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  marginBottom: '8px',
                                  fontSize: '14px',
                                  cursor: 'pointer',
                                }}
                                onClick={() => handleSubcategoryClick(entry)}
                              >
                                <div
                                  style={{
                                    width: '14px',
                                    height: '14px',
                                    backgroundColor: entry.color,
                                    marginRight: '8px',
                                    flexShrink: 0,
                                  }}
                                />
                                <span style={{ color: '#374151' }}>
                                  {entry.name} ({entry.percentage.toFixed(1)}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                  </RechartsPC>
                </ResponsiveContainer>
              )}

              {/* Level 3: Expense List */}
              {drillDown.level === 'expenseList' && drillDown.chartType === 'income' && currentFilteredExpenses.length > 0 && (
                <div className="space-y-4">
                  <div className="rounded-md border">
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
                            const date = expense.date instanceof Date
                              ? expense.date
                              : (expense.date as Timestamp).toDate();
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
              <ResponsiveContainer width="100%" height={500}>
                <RechartsPC>
                  <Pie
                    data={expensesByTypeData as any}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) =>
                      entry.percentage >= 5
                        ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                        : ''
                    }
                    outerRadius={140}
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
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    content={() => {
                      const filteredData = expensesByTypeData
                        .filter(d => d.percentage >= 5)
                        .sort((a, b) => b.value - a.value);
                      return (
                        <div style={{ paddingLeft: '20px' }}>
                          {filteredData.map((entry, index) => (
                            <div
                              key={`legend-item-${index}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                marginBottom: '8px',
                                fontSize: '14px',
                              }}
                            >
                              <div
                                style={{
                                  width: '14px',
                                  height: '14px',
                                  backgroundColor: entry.color,
                                  marginRight: '8px',
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ color: '#374151' }}>
                                {entry.name} ({entry.percentage.toFixed(1)}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
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
              <CardTitle>Trend Mensile</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
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
                  <Line type="monotone" dataKey="Entrate" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="Spese" stroke="#ef4444" strokeWidth={2} />
                  <Line type="monotone" dataKey="Netto" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
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
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={monthlyExpensesByType.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
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
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={monthlyExpensesByCategory.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
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
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={monthlyIncomeByCategory.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
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
      </div>
    </div>
  );
}
