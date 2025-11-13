'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { getAllExpenses, calculateTotalIncome, calculateTotalExpenses } from '@/lib/services/expenseService';
import { Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
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

export default function ExpenseChartsPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

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

  const expensesByCategoryData = getExpensesByCategory();
  const incomeByCategoryData = getIncomeByCategory();
  const expensesByTypeData = getExpensesByType();
  const monthlyTrendData = getMonthlyTrend();
  const monthlyExpensesByType = getMonthlyExpensesByType();
  const monthlyExpensesByCategory = getMonthlyExpensesByCategory();
  const monthlyIncomeByCategory = getMonthlyIncomeByCategory();

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
          Visualizza l'andamento delle tue finanze
        </p>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Expenses by Category */}
        {expensesByCategoryData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Spese per Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <RechartsPC>
                  <Pie
                    data={expensesByCategoryData as any}
                    cx="40%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) =>
                      entry.percentage >= 5
                        ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                        : ''
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {expensesByCategoryData.map((entry, index) => (
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
                    formatter={(value, entry: any) => {
                      const item = expensesByCategoryData.find(d => d.name === value);
                      if (item) {
                        return `${value} (${item.percentage.toFixed(1)}%)`;
                      }
                      return value;
                    }}
                  />
                </RechartsPC>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Income by Category */}
        {incomeByCategoryData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Entrate per Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <RechartsPC>
                  <Pie
                    data={incomeByCategoryData as any}
                    cx="40%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) =>
                      entry.percentage >= 5
                        ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                        : ''
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {incomeByCategoryData.map((entry, index) => (
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
                    formatter={(value, entry: any) => {
                      const item = incomeByCategoryData.find(d => d.name === value);
                      if (item) {
                        return `${value} (${item.percentage.toFixed(1)}%)`;
                      }
                      return value;
                    }}
                  />
                </RechartsPC>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Expenses by Type */}
        {expensesByTypeData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Spese per Tipo</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <RechartsPC>
                  <Pie
                    data={expensesByTypeData as any}
                    cx="40%"
                    cy="50%"
                    labelLine={false}
                    label={(entry: any) =>
                      entry.percentage >= 5
                        ? `${entry.name}: ${entry.percentage.toFixed(1)}%`
                        : ''
                    }
                    outerRadius={80}
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
                    formatter={(value, entry: any) => {
                      const item = expensesByTypeData.find(d => d.name === value);
                      if (item) {
                        return `${value} (${item.percentage.toFixed(1)}%)`;
                      }
                      return value;
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
                <BarChart data={monthlyTrendData}>
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
                  <Bar dataKey="Entrate" fill="#10b981" />
                  <Bar dataKey="Spese" fill="#ef4444" />
                  <Bar dataKey="Netto" fill="#3b82f6" />
                </BarChart>
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
                  {monthlyExpensesByCategory.categories.map((category, index) => (
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
                  {monthlyIncomeByCategory.categories.map((category, index) => (
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
