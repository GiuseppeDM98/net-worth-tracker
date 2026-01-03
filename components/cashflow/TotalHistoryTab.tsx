'use client';

import { useEffect, useState } from 'react';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { calculateIncomeExpenseRatio } from '@/lib/services/expenseService';
import { Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import {
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

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  // Prepare monthly trend data (all years, all months)
  const getMonthlyTrend = () => {
    const monthlyMap = new Map<string, { income: number; expenses: number; sortKey: string }>();

    allExpenses.forEach((expense: Expense) => {
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
          'Entrate %': incomePercentage,
          'Spese %': expensesPercentage,
          'Saving Rate %': savingRate,
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
      const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
      const year = date.getFullYear();

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
        const savingRate = values.income > 0 ? ((values.income - values.expenses) / values.income) * 100 : 0;

        return {
          year: year.toString(),
          Entrate: values.income,
          Spese: values.expenses,
          Netto: values.income - values.expenses,
          'Entrate %': incomePercentage,
          'Spese %': expensesPercentage,
          'Saving Rate %': savingRate,
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
        const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
        const monthKey = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
        const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

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
        const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
        const year = date.getFullYear();

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
        const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
        const year = date.getFullYear();

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
        const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
        const year = date.getFullYear();

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

  // Prepare yearly income/expense ratio data
  const getYearlyIncomeExpenseRatio = () => {
    const yearlyMap = new Map<number, Expense[]>();

    // Group expenses by year
    allExpenses.forEach((expense: Expense) => {
      const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
      const year = date.getFullYear();

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
    const date = expense.date instanceof Date ? expense.date : (expense.date as Timestamp).toDate();
    return date.getFullYear() >= 2025;
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
  const monthlyExpensesByTypeChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyExpensesByType, recentMonthsLimit)
    : monthlyExpensesByType;
  const monthlyExpensesByCategoryChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyExpensesByCategory.data, recentMonthsLimit)
    : monthlyExpensesByCategory.data;
  const monthlyIncomeByCategoryChartData = isMobile && !showFullMonthlyHistory
    ? filterRecentMonths(monthlyIncomeByCategory.data, recentMonthsLimit)
    : monthlyIncomeByCategory.data;

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

      {/* Charts Grid */}
      <div className="grid gap-6">
        {/* Monthly Trend */}
        {monthlyTrendData.length > 0 && (
          <Card>
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
                  <LineChart data={monthlyTrendChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={axisTickProps} {...xAxisProps} />
                    <YAxis tickFormatter={(value) => `${value.toFixed(0)}%`} domain={[0, 100]} />
                    <Tooltip
                      formatter={(value: number) => `${value.toFixed(2)}%`}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                    />
                    <Legend />
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
          <Card>
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
                  <LineChart data={yearlyTrendData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={axisTickProps} {...xAxisProps} />
                    <YAxis tickFormatter={(value) => `${value.toFixed(0)}%`} domain={[0, 100]} />
                    <Tooltip
                      formatter={(value: number) => `${value.toFixed(2)}%`}
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                      }}
                    />
                    <Legend />
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
          <Card>
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
          <Card>
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
          <Card>
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
          <Card>
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
          <Card>
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
          <Card>
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
          <Card>
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





