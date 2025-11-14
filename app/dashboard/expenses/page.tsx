'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/expenses';
import { getAllExpenses, getExpensesByMonth, getExpensesByDateRange, calculateTotalIncome, calculateTotalExpenses, calculateNetBalance } from '@/lib/services/expenseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, TrendingUp, TrendingDown, Wallet, RefreshCw, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';

const MONTHS = [
  { value: '1', label: 'Gennaio' },
  { value: '2', label: 'Febbraio' },
  { value: '3', label: 'Marzo' },
  { value: '4', label: 'Aprile' },
  { value: '5', label: 'Maggio' },
  { value: '6', label: 'Giugno' },
  { value: '7', label: 'Luglio' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Settembre' },
  { value: '10', label: 'Ottobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Dicembre' },
];

export default function ExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]); // Keep all expenses for year calculation
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  // Generate available years from ALL expenses (not filtered)
  const availableYears = useMemo(() => {
    if (allExpenses.length === 0) return [];

    const years = allExpenses.map(expense => {
      const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
      return date.getFullYear();
    });

    const uniqueYears = Array.from(new Set(years)).sort((a, b) => b - a);
    return uniqueYears;
  }, [allExpenses]);

  const handleYearChange = (value: string) => {
    setSelectedYear(value);
    // Reset month when "all" is selected for year
    if (value === 'all') {
      setSelectedMonth('all');
    }
  };

  useEffect(() => {
    if (user) {
      loadExpenses();
    }
  }, [user, selectedYear, selectedMonth]);

  const loadExpenses = async () => {
    if (!user) return;

    try {
      setLoading(true);
      let data: Expense[];

      if (selectedYear !== 'all' && selectedMonth !== 'all') {
        // Filter by specific month and year
        data = await getExpensesByMonth(user.uid, parseInt(selectedYear), parseInt(selectedMonth));
      } else if (selectedYear !== 'all') {
        // Filter by year only
        const startDate = new Date(parseInt(selectedYear), 0, 1);
        const endDate = new Date(parseInt(selectedYear), 11, 31, 23, 59, 59);
        data = await getExpensesByDateRange(user.uid, startDate, endDate);
      } else {
        // No filter, get all expenses
        data = await getAllExpenses(user.uid);
        // Update allExpenses only when loading everything
        setAllExpenses(data);
      }

      setExpenses(data);
    } catch (error) {
      console.error('Error loading expenses:', error);
      toast.error('Errore nel caricamento delle spese');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = () => {
    setEditingExpense(null);
    setDialogOpen(true);
  };

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingExpense(null);
  };

  const handleSuccess = async () => {
    // Reload filtered expenses
    await loadExpenses();
    // Also reload all expenses to update available years
    if (user && (selectedYear !== 'all' || selectedMonth !== 'all')) {
      try {
        const allData = await getAllExpenses(user.uid);
        setAllExpenses(allData);
      } catch (error) {
        console.error('Error reloading all expenses:', error);
      }
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  // Calculate totals
  const totalIncome = calculateTotalIncome(expenses);
  const totalExpenses = calculateTotalExpenses(expenses);
  const netBalance = calculateNetBalance(expenses);

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Caricamento spese...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tracciamento Spese</h1>
          <p className="text-muted-foreground mt-1">
            Gestisci le tue entrate e uscite
          </p>
        </div>
        <Button onClick={handleAddExpense}>
          <Plus className="mr-2 h-4 w-4" />
          Nuova Spesa
        </Button>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entrate Totali</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalIncome)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {expenses.filter(e => e.type === 'income').length} voci
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spese Totali</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalExpenses)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {expenses.filter(e => e.type !== 'income').length} voci
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bilancio Netto</CardTitle>
            <Wallet className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                netBalance >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatCurrency(netBalance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Totale: {expenses.length} voci
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Filtri</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-2 min-w-[150px]">
              <label className="text-sm font-medium">Anno</label>
              <Select value={selectedYear} onValueChange={handleYearChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona anno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 min-w-[150px]">
              <label className="text-sm font-medium">Mese</label>
              <Select
                value={selectedMonth}
                onValueChange={setSelectedMonth}
                disabled={selectedYear === 'all'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona mese" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {MONTHS.map(month => (
                    <SelectItem key={month.value} value={month.value}>
                      {month.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(selectedYear !== 'all' || selectedMonth !== 'all') && (
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedYear('all');
                    setSelectedMonth('all');
                  }}
                >
                  Ripristina Filtri
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedYear === 'all' && selectedMonth === 'all'
              ? 'Tutte le Voci'
              : selectedYear !== 'all' && selectedMonth !== 'all'
              ? `Voci di ${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
              : selectedYear !== 'all'
              ? `Voci del ${selectedYear}`
              : 'Tutte le Voci'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ExpenseTable
            expenses={expenses}
            onEdit={handleEditExpense}
            onRefresh={loadExpenses}
          />
        </CardContent>
      </Card>

      {/* Expense Dialog */}
      <ExpenseDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        expense={editingExpense}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
