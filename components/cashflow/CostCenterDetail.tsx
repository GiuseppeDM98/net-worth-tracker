'use client';

/**
 * CostCenterDetail
 *
 * Drill-down view for a single cost center, showing:
 * - KPI row: lifetime total, number of transactions, average monthly spend, active period
 * - Monthly bar chart (last 12 months by default, full history on toggle)
 * - Table of all linked transactions
 *
 * DATA AGGREGATION:
 * Expenses are aggregated client-side after a single Firestore query per cost center.
 * This avoids composite indexes for groupBy queries and works well given that cost centers
 * are expected to have at most a few hundred expenses each.
 *
 * SIGN CONVENTION:
 * Expenses are stored as negative numbers. We display them as positive values (Math.abs)
 * throughout this component so the user sees intuitive "cost" numbers.
 */

import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CostCenter, CostCenterMonthlyData } from '@/types/costCenters';
import { Expense } from '@/types/expenses';
import { getExpensesForCostCenter } from '@/lib/services/costCenterService';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { getItalyMonth, getItalyYear } from '@/lib/utils/dateHelpers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface CostCenterDetailProps {
  costCenter: CostCenter;
  onBack: () => void;
  onEdit: (costCenter: CostCenter) => void;
  onDelete: (costCenter: CostCenter) => void;
}

export function CostCenterDetail({
  costCenter,
  onBack,
  onEdit,
  onDelete,
}: CostCenterDetailProps) {
  const { user } = useAuth();
  const chartColors = useChartColors();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  // Show full history or just the last 12 months in the chart
  const [showFullHistory, setShowFullHistory] = useState(false);
  // Two-click delete safety: first click arms, second click executes
  const [deleteArmed, setDeleteArmed] = useState(false);
  // Defer chart mount by one RAF so ResponsiveContainer measures after browser layout
  const [chartReady, setChartReady] = useState(false);
  const chartRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    setChartReady(false);
    loadExpenses();
  }, [user, costCenter.id]);

  // Once data is loaded, wait one animation frame before mounting the chart.
  // This ensures the container div has been laid out by the browser so
  // ResponsiveContainer gets a positive width/height on its first measurement.
  useEffect(() => {
    if (loading) return;
    chartRafRef.current = requestAnimationFrame(() => setChartReady(true));
    return () => {
      if (chartRafRef.current !== null) cancelAnimationFrame(chartRafRef.current);
    };
  }, [loading]);

  const loadExpenses = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await getExpensesForCostCenter(user.uid, costCenter.id);
      // Only count actual outgoing expenses (exclude income entries linked to this center)
      setExpenses(data.filter(e => e.amount < 0));
    } catch (error) {
      console.error('Error loading cost center expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  // Aggregate stats derived from the expense list
  const stats = useMemo(() => {
    if (expenses.length === 0) return null;

    const totalSpent = expenses.reduce((sum, e) => sum + Math.abs(e.amount), 0);
    const dates = expenses.map(e => toDate(e.date));
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];

    // Number of distinct calendar months with at least one expense
    const monthKeys = new Set(
      expenses.map(e => {
        const d = toDate(e.date);
        return `${getItalyYear(d)}-${getItalyMonth(d)}`;
      })
    );
    const activeMonths = monthKeys.size;
    const averageMonthly = activeMonths > 0 ? totalSpent / activeMonths : 0;

    return { totalSpent, transactionCount: expenses.length, averageMonthly, firstDate, lastDate };
  }, [expenses]);

  // Monthly aggregates for the bar chart
  const monthlyData = useMemo((): CostCenterMonthlyData[] => {
    const byMonth: Record<string, CostCenterMonthlyData> = {};

    for (const expense of expenses) {
      const d = toDate(expense.date);
      const year = getItalyYear(d);
      const month = getItalyMonth(d);
      const key = `${year}-${String(month).padStart(2, '0')}`;
      if (!byMonth[key]) {
        byMonth[key] = {
          label: format(d, 'MMM yy', { locale: it }),
          year,
          month,
          total: 0,
        };
      }
      byMonth[key].total += Math.abs(expense.amount);
    }

    const all = Object.values(byMonth).sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );

    // Limit to last 12 months unless the user toggled full history
    return showFullHistory ? all : all.slice(-12);
  }, [expenses, showFullHistory]);

  const accentColor = costCenter.color ?? (chartColors[0] || '#3b82f6');

  // Disarm delete after 3 seconds if the user doesn't confirm
  useEffect(() => {
    if (!deleteArmed) return;
    const timer = setTimeout(() => setDeleteArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [deleteArmed]);

  return (
    <div className="space-y-6">
      {/* Header: on mobile stacks vertically with full-width action buttons;
          on sm+ reverts to the classic side-by-side layout. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Torna alla lista">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              {costCenter.color && (
                <span
                  className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: costCenter.color }}
                />
              )}
              <h2 className="text-xl font-semibold">{costCenter.name}</h2>
            </div>
          </div>
          {costCenter.description && (
            <p className="text-sm text-muted-foreground pl-11">{costCenter.description}</p>
          )}
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => onEdit(costCenter)}>
            <Pencil className="h-4 w-4 mr-1" />
            Modifica
          </Button>
          <Button
            variant={deleteArmed ? 'destructive' : 'outline'}
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => {
              if (deleteArmed) {
                onDelete(costCenter);
              } else {
                setDeleteArmed(true);
              }
            }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            {deleteArmed ? 'Conferma eliminazione' : 'Elimina'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">Caricamento...</div>
      ) : expenses.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nessuna spesa assegnata a questo centro di costo ancora.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Totale lifetime</p>
                <p className="mt-1 text-lg desktop:text-2xl font-bold">
                  {formatCurrency(stats!.totalSpent)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Transazioni</p>
                <p className="mt-1 text-lg desktop:text-2xl font-bold">{stats!.transactionCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Media mensile</p>
                <p className="mt-1 text-lg desktop:text-2xl font-bold">
                  {formatCurrency(stats!.averageMonthly)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Periodo attivo</p>
                <p className="mt-1 text-sm font-semibold leading-snug">
                  {stats!.firstDate && formatDate(stats!.firstDate)}
                  {stats!.firstDate && stats!.lastDate && ' – '}
                  {stats!.lastDate && formatDate(stats!.lastDate)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Monthly spending chart */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-base">Spese nel tempo</CardTitle>
                <CardDescription>
                  {showFullHistory ? 'Storico completo' : 'Ultimi 12 mesi'}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFullHistory(prev => !prev)}
                className="text-xs"
              >
                {showFullHistory ? 'Ultimi 12 mesi' : 'Tutto lo storico'}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="h-48 desktop:h-64 min-w-0">
                {chartReady && <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `${Math.round(v)}€`}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={55}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Spesa']}
                      labelStyle={{ fontWeight: 600, color: '#111827' }}
                      cursor={{ fill: 'rgba(128, 128, 128, 0.1)' }}
                    />
                    <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                      {monthlyData.map((_, i) => (
                        <Cell key={i} fill={accentColor} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>}
              </div>
            </CardContent>
          </Card>

          {/* Transaction table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transazioni collegate</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categoria</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden desktop:table-cell">Note</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...expenses]
                      .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime())
                      .map((expense) => (
                        <tr key={expense.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {formatDate(toDate(expense.date))}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{expense.categoryName}</span>
                              {expense.subCategoryName && (
                                <Badge variant="outline" className="text-xs px-1.5 py-0">
                                  {expense.subCategoryName}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground hidden desktop:table-cell">
                            {expense.notes ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatCurrency(Math.abs(expense.amount))}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
