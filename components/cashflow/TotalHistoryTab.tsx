'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { getAllExpenses, calculateIncomeExpenseRatio } from '@/lib/services/expenseService';
import { Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
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
import { formatCurrency } from '@/lib/services/chartService';

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

export function TotalHistoryTab() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Prepare monthly trend data (all years, all months)
  const getMonthlyTrend = () => {
    const monthlyMap = new Map<string, { income: number; expenses: number; sortKey: string }>();

    expenses.forEach((expense: Expense) => {
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

  // Prepare yearly trend data (years on x-axis)
  const getYearlyTrend = () => {
    const yearlyMap = new Map<number, { income: number; expenses: number }>();

    expenses.forEach((expense: Expense) => {
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
      .map(([year, values]) => ({
        year: year.toString(),
        Entrate: values.income,
        Spese: values.expenses,
        Netto: values.income - values.expenses,
      }))
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));

    return data;
  };

  // Prepare monthly trend for expenses by type (all months)
  const getMonthlyExpensesByType = () => {
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
  const getYearlyExpensesByType = () => {
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
  const getMonthlyExpensesByCategory = () => {
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
  const getYearlyExpensesByCategory = () => {
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
  const getMonthlyIncomeByCategory = () => {
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
  const getYearlyIncomeByCategory = () => {
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
    expenses.forEach((expense: Expense) => {
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

  const monthlyTrendData = getMonthlyTrend();
  const yearlyTrendData = getYearlyTrend();
  const monthlyExpensesByType = getMonthlyExpensesByType();
  const yearlyExpensesByType = getYearlyExpensesByType();
  const monthlyExpensesByCategory = getMonthlyExpensesByCategory();
  const yearlyExpensesByCategory = getYearlyExpensesByCategory();
  const monthlyIncomeByCategory = getMonthlyIncomeByCategory();
  const yearlyIncomeByCategory = getYearlyIncomeByCategory();
  const yearlyIncomeExpenseRatioData = getYearlyIncomeExpenseRatio();

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

        {/* Yearly Trend */}
        {yearlyTrendData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Trend Annuale</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={yearlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
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

        {/* Yearly Income/Expense Ratio */}
        {yearlyIncomeExpenseRatioData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Rapporto Entrate/Spese Annuale</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={yearlyIncomeExpenseRatioData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
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
                  <Legend />
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
              <CardTitle>Trend Mensile Spese per Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={monthlyExpensesByType}>
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

        {/* Yearly Trend - Expenses by Type */}
        {yearlyExpensesByType.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Trend Annuale Spese per Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={yearlyExpensesByType}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
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
          <Card>
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

        {/* Yearly Trend - Expenses by Category */}
        {yearlyExpensesByCategory.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Trend Annuale Spese per Categoria (Top 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={yearlyExpensesByCategory.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
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

        {/* Yearly Trend - Income by Category */}
        {yearlyIncomeByCategory.data.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Trend Annuale Entrate per Categoria (Top 5)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={yearlyIncomeByCategory.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
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
