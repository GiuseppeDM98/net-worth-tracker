'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Expense } from '@/types/expenses';
import { getAllExpenses, getExpensesByMonth, getExpensesByDateRange, calculateTotalIncome, calculateTotalExpenses, calculateNetBalance, calculateIncomeExpenseRatio } from '@/lib/services/expenseService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, TrendingUp, TrendingDown, Wallet, RefreshCw, Filter, ChevronDown, Scale } from 'lucide-react';
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

export function ExpenseTrackingTab() {
  const { user } = useAuth();
  const currentYear = new Date().getFullYear();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]); // Keep all expenses for year calculation
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [filtersOpen, setFiltersOpen] = useState<boolean>(true);

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

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    // Reset month when changing year
    setSelectedMonth('all');
  };

  // Load all expenses in background to get available years
  useEffect(() => {
    if (user) {
      loadAllExpensesForYears();
    }
  }, [user]);

  // Load filtered expenses based on selected year and month
  useEffect(() => {
    if (user) {
      loadExpenses();
    }
  }, [user, selectedYear, selectedMonth]);

  const loadAllExpensesForYears = async () => {
    if (!user) return;

    try {
      const data = await getAllExpenses(user.uid);
      setAllExpenses(data);
    } catch (error) {
      console.error('Error loading all expenses for years:', error);
    }
  };

  const loadExpenses = async () => {
    if (!user) return;

    try {
      setLoading(true);
      let data: Expense[];

      if (selectedMonth !== 'all') {
        // Filter by specific month and year
        data = await getExpensesByMonth(user.uid, selectedYear, parseInt(selectedMonth));
      } else {
        // Filter by year only
        const startDate = new Date(selectedYear, 0, 1);
        const endDate = new Date(selectedYear, 11, 31, 23, 59, 59);
        data = await getExpensesByDateRange(user.uid, startDate, endDate);
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
    await loadAllExpensesForYears();
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
  const incomeExpenseRatio = calculateIncomeExpenseRatio(expenses);

  // Determine ratio color based on thresholds
  const getRatioColor = (ratio: number | null): string => {
    if (ratio === null) return 'text-muted-foreground';
    if (ratio >= 1.2) return 'text-green-600';
    if (ratio >= 0.8) return 'text-yellow-600';
    return 'text-red-600';
  };

  const formatRatio = (ratio: number | null): string => {
    if (ratio === null) return 'N/A';
    return ratio.toFixed(2);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Caricamento spese...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">
            {selectedMonth !== 'all' ? `${MONTHS.find(m => m.value === selectedMonth)?.label} ` : ''}{selectedYear}
          </h2>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rapporto Entrate/Spese</CardTitle>
            <Scale className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getRatioColor(incomeExpenseRatio)}`}>
              {formatRatio(incomeExpenseRatio)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {incomeExpenseRatio !== null && incomeExpenseRatio >= 1.2 && 'Salute finanziaria ottima'}
              {incomeExpenseRatio !== null && incomeExpenseRatio >= 0.8 && incomeExpenseRatio < 1.2 && 'In equilibrio'}
              {incomeExpenseRatio !== null && incomeExpenseRatio < 0.8 && 'Attenzione alle spese'}
              {incomeExpenseRatio === null && 'Nessuna spesa registrata'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Year Selection */}
      {availableYears.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Seleziona Anno</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {availableYears.map(year => (
                <Button
                  key={year}
                  variant={selectedYear === year ? "default" : "outline"}
                  onClick={() => handleYearChange(year)}
                  className="min-w-[100px]"
                >
                  {year}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Card>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer w-full">
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Filtri</CardTitle>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-2 min-w-[150px]">
                  <label className="text-sm font-medium">Mese</label>
                  <Select
                    value={selectedMonth}
                    onValueChange={setSelectedMonth}
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

                {selectedMonth !== 'all' && (
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedMonth('all');
                      }}
                    >
                      Ripristina Filtri
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedMonth !== 'all'
              ? `Voci di ${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
              : `Voci del ${selectedYear}`}
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
