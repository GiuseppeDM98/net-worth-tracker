/**
 * Expense tracking with hierarchical filtering and smart deletion
 *
 * FILTER ARCHITECTURE:
 * Two-stage filtering system:
 * - Stage 1 (Time): Year → Month
 * - Stage 2 (Hierarchy): Type → Category → Subcategory
 *
 * Cascading Reset Pattern:
 * - Changing Type resets Category + Subcategory
 * - Changing Category resets Subcategory only
 * - Prevents invalid combinations (e.g., Type="income" + Category="rent")
 *
 * Custom Dropdowns:
 * Native <select> lacks search. Custom implementation uses refs for
 * click-outside detection to match native UX.
 */
'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseCategory, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetBalance,
  calculateIncomeExpenseRatio,
  getExpensesByRecurringParentId,
  getExpensesByInstallmentParentId,
} from '@/lib/services/expenseService';
import { updateCashAssetBalance } from '@/lib/services/assetService';
import { queryKeys } from '@/lib/query/queryKeys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, TrendingUp, TrendingDown, Wallet, RefreshCw, Filter, ChevronDown, Scale, Check, X } from 'lucide-react';
import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { ExpenseCard } from '@/components/expenses/ExpenseCard';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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

interface ExpenseTrackingTabProps {
  allExpenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

/**
 * CHECKLIST: When adding new ExpenseType values:
 * 1. Update EXPENSE_TYPE_LABELS in types/expenses.ts
 * 2. Add color mapping in ExpenseCard.tsx badge colors
 * 3. Update typeOptions array in this file (line ~310)
 * 4. Add type validation in ExpenseDialog schema
 */
export function ExpenseTrackingTab({ allExpenses, categories, loading, onRefresh }: ExpenseTrackingTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1); // 1-based month (1-12)
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [filtersOpen, setFiltersOpen] = useState<boolean>(true);

  // Separate state for each filter level enables independent reset logic.
  // Single state object would complicate cascading resets (Type → Category → Subcategory).
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('all');

  // Search states for comboboxes
  const [searchQueryType, setSearchQueryType] = useState<string>('');
  const [searchQueryCategory, setSearchQueryCategory] = useState<string>('');
  const [searchQuerySubCategory, setSearchQuerySubCategory] = useState<string>('');

  // Dropdown open states
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isSubCategoryDropdownOpen, setIsSubCategoryDropdownOpen] = useState(false);

  /**
   * Refs for click-outside detection on custom dropdowns
   *
   * Pattern: Listen for document mousedown, check if click target is outside ref
   * Why mousedown? Fires before blur, prevents race condition with item selection
   * See useEffect at line ~192 for implementation
   */
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const subCategoryDropdownRef = useRef<HTMLDivElement>(null);

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

  const handleCurrentMonth = () => {
    setSelectedYear(currentYear);
    setSelectedMonth(currentMonth);
  };

  /**
   * Cascading filter reset handler
   *
   * Reset Rules:
   * - Close dropdown (user made selection)
   * - Clear search query
   * - Reset downstream filters (Category + Subcategory)
   *
   * Why? Prevents invalid combinations when Type changes.
   * Example: User selects Type="fixed" → Category="rent" → Subcategory="mortgage"
   *          Then changes Type to "income"
   *          Result: Category and Subcategory reset (income has different categories)
   */
  const handleSelectType = (type: string) => {
    setSelectedType(type);
    setIsTypeDropdownOpen(false);
    setSearchQueryType('');
    // Reset category and subcategory when type changes
    setSelectedCategoryId('all');
    setSelectedSubCategoryId('all');
  };

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setIsCategoryDropdownOpen(false);
    setSearchQueryCategory('');
    // Reset subcategory when category changes
    setSelectedSubCategoryId('all');
  };

  const handleSelectSubCategory = (subCategoryId: string) => {
    setSelectedSubCategoryId(subCategoryId);
    setIsSubCategoryDropdownOpen(false);
    setSearchQuerySubCategory('');
  };

  const handleResetFilters = () => {
    setSelectedMonth('all');
    setSelectedType('all');
    setSelectedCategoryId('all');
    setSelectedSubCategoryId('all');
    setSearchQueryType('');
    setSearchQueryCategory('');
    setSearchQuerySubCategory('');
  };

  // Clearing Type also clears dependent filters AND their search queries.
  // Prevents "phantom selections" where UI shows "all" but search input
  // retains previous query text.
  const handleClearType = () => {
    setSelectedType('all');
    setSelectedCategoryId('all');
    setSelectedSubCategoryId('all');
    setSearchQueryType('');
    setSearchQueryCategory('');
    setSearchQuerySubCategory('');
  };

  const handleClearCategory = () => {
    setSelectedCategoryId('all');
    setSelectedSubCategoryId('all');
    setSearchQueryCategory('');
    setSearchQuerySubCategory('');
  };

  const handleClearSubCategory = () => {
    setSelectedSubCategoryId('all');
    setSearchQuerySubCategory('');
  };

  // Check if any filter is active
  const hasActiveFilters = selectedMonth !== 'all' || selectedType !== 'all' || selectedCategoryId !== 'all' || selectedSubCategoryId !== 'all';

  // Filter expenses based on selectedYear and selectedMonth (in-memory filtering)
  useEffect(() => {
    if (!allExpenses.length) {
      setExpenses([]);
      return;
    }

    const filtered = allExpenses.filter(expense => {
      const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
      const expenseYear = date.getFullYear();
      const expenseMonth = date.getMonth() + 1; // 1-based

      if (expenseYear !== selectedYear) return false;
      if (selectedMonth !== 'all' && expenseMonth !== parseInt(selectedMonth)) return false;

      return true;
    });

    setExpenses(filtered);
  }, [allExpenses, selectedYear, selectedMonth]);

  /**
   * Click-outside handler for custom dropdowns
   *
   * Why mousedown instead of click?
   * - mousedown fires before blur events
   * - Prevents race condition where blur closes dropdown before click registers
   *
   * Memory Management: Return cleanup function removes listener on unmount
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) {
        setIsTypeDropdownOpen(false);
      }
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (subCategoryDropdownRef.current && !subCategoryDropdownRef.current.contains(event.target as Node)) {
        setIsSubCategoryDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    // Trigger parent refresh (re-fetch all data)
    await onRefresh();
  };

  /**
   * Context-aware deletion with two-stage confirmation
   *
   * Three Deletion Modes:
   *
   * 1. INSTALLMENT EXPENSE (e.g., car payment 6/24):
   *    First OK → Delete this installment only
   *    Cancel then OK → Delete all 24 installments
   *
   * 2. RECURRING EXPENSE (e.g., Netflix subscription):
   *    First OK → Delete this occurrence
   *    Cancel then OK → Delete all recurring entries
   *
   * 3. REGULAR EXPENSE:
   *    Single confirmation with expense details
   *
   * Why two-stage? Single prompt is ambiguous ("Delete" = one OR all?).
   * Two-stage makes intent explicit, reduces accidental bulk deletion.
   */
  const handleDeleteExpense = async (expense: Expense) => {
    // Check if this is an installment expense
    if (expense.isInstallment && expense.installmentParentId) {
      const confirmMessage =
        `Questa è la rata ${expense.installmentNumber}/${expense.installmentTotal}. Vuoi eliminare:\n\n` +
        `[SOLO QUESTA RATA] - Solo questa rata singola\n` +
        `[TUTTE LE RATE] - Tutte le ${expense.installmentTotal} rate\n\n` +
        `Clicca OK per eliminare solo questa rata, Annulla per tornare indietro.`;

      const deleteSingle = window.confirm(confirmMessage);

      if (deleteSingle) {
        await deleteSingleExpense(expense);
      } else {
        const deleteAll = window.confirm(`Vuoi eliminare TUTTE le ${expense.installmentTotal} rate?`);
        if (deleteAll) {
          await deleteAllInstallmentExpenses(expense.installmentParentId);
        }
      }
    }
    // Check if this is a recurring expense
    else if (expense.isRecurring && expense.recurringParentId) {
      const confirmMessage =
        `Questa è una voce ricorrente. Vuoi eliminare:\n\n` +
        `[SOLO QUESTA] - Solo questa voce singola\n` +
        `[TUTTE] - Tutte le voci ricorrenti correlate\n\n` +
        `Clicca OK per eliminare solo questa, Annulla per tornare indietro.`;

      const deleteSingle = window.confirm(confirmMessage);

      if (deleteSingle) {
        await deleteSingleExpense(expense);
      } else {
        const deleteAll = window.confirm('Vuoi eliminare TUTTE le voci ricorrenti correlate?');
        if (deleteAll) {
          await deleteAllRecurringExpenses(expense.recurringParentId);
        }
      }
    } else {
      // Regular expense
      const confirmDelete = window.confirm(
        `Sei sicuro di voler eliminare questa voce?${expense.notes ? `\n\n"${expense.notes}"` : ''}`
      );
      if (confirmDelete) {
        await deleteSingleExpense(expense);
      }
    }
  };

  const deleteSingleExpense = async (expense: Expense) => {
    try {
      // Reverse the balance effect on the linked cash asset before deleting
      if (expense.linkedCashAssetId) {
        await updateCashAssetBalance(expense.linkedCashAssetId, -expense.amount);
        if (user) queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
      }
      const { deleteExpense } = await import('@/lib/services/expenseService');
      await deleteExpense(expense.id);
      toast.success('Voce eliminata con successo');
      await onRefresh();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error("Errore nell'eliminazione della voce");
    }
  };

  const deleteAllRecurringExpenses = async (recurringParentId: string) => {
    try {
      // Reverse balance effects before bulk-deleting (only the first entry stores linkedCashAssetId)
      const seriesExpenses = await getExpensesByRecurringParentId(recurringParentId);
      for (const exp of seriesExpenses) {
        if (exp.linkedCashAssetId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
      }
      if (user && seriesExpenses.some(e => e.linkedCashAssetId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
      }
      const { deleteRecurringExpenses } = await import('@/lib/services/expenseService');
      await deleteRecurringExpenses(recurringParentId);
      toast.success('Tutte le voci ricorrenti sono state eliminate');
      await onRefresh();
    } catch (error) {
      console.error('Error deleting recurring expenses:', error);
      toast.error("Errore nell'eliminazione delle voci ricorrenti");
    }
  };

  const deleteAllInstallmentExpenses = async (installmentParentId: string) => {
    try {
      // Reverse balance effects before bulk-deleting (only the first installment stores linkedCashAssetId)
      const seriesExpenses = await getExpensesByInstallmentParentId(installmentParentId);
      for (const exp of seriesExpenses) {
        if (exp.linkedCashAssetId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
      }
      if (user && seriesExpenses.some(e => e.linkedCashAssetId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
      }
      const { deleteInstallmentExpenses } = await import('@/lib/services/expenseService');
      await deleteInstallmentExpenses(installmentParentId);
      toast.success('Tutte le rate sono state eliminate');
      await onRefresh();
    } catch (error) {
      console.error('Error deleting installment expenses:', error);
      toast.error("Errore nell'eliminazione delle rate");
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  // Filter options for Type
  const typeOptions = useMemo(() => {
    const types = [
      { value: 'all', label: 'Tutte' },
      { value: 'income', label: EXPENSE_TYPE_LABELS.income },
      { value: 'fixed', label: EXPENSE_TYPE_LABELS.fixed },
      { value: 'variable', label: EXPENSE_TYPE_LABELS.variable },
      { value: 'debt', label: EXPENSE_TYPE_LABELS.debt },
    ];

    if (!searchQueryType.trim()) {
      return types;
    }

    const query = searchQueryType.toLowerCase();
    return types.filter(type => type.label.toLowerCase().includes(query));
  }, [searchQueryType]);

  // Filter options for Category based on selected type
  const categoryOptions = useMemo(() => {
    // Only show categories if a specific type is selected
    if (selectedType === 'all') {
      return [];
    }

    let filtered = categories.filter(cat => cat.type === selectedType);

    // Filter by search query
    if (searchQueryCategory.trim()) {
      const query = searchQueryCategory.toLowerCase();
      filtered = filtered.filter(cat => cat.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [categories, selectedType, searchQueryCategory]);

  // Filter options for Subcategory based on selected category
  const subCategoryOptions = useMemo(() => {
    // Only show subcategories if a specific category is selected
    if (selectedCategoryId === 'all') {
      return [];
    }

    // Show subcategories only from selected category
    const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
    if (!selectedCategory) return [];

    let filtered = selectedCategory.subCategories.map(sub => ({
      ...sub,
      categoryName: selectedCategory.name,
      categoryId: selectedCategory.id,
    }));

    if (searchQuerySubCategory.trim()) {
      const query = searchQuerySubCategory.toLowerCase();
      filtered = filtered.filter(sub => sub.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [categories, selectedCategoryId, searchQuerySubCategory]);

  /**
   * Cumulative AND filtering (progressive narrowing)
   *
   * Filter Logic: All active filters must match
   * - Type filter (if not "all") AND
   * - Category filter (if Type selected) AND
   * - Subcategory filter (if Category selected)
   *
   * Why AND (not OR)?
   * - OR would show too many results: Type="income" OR Category="groceries"
   * - AND progressively narrows: Type="income" AND Category="salary"
   *
   * Dependency Guards: Category only applies if Type selected (line 448)
   * This prevents filtering by Category when Type="all" (nonsensical combination).
   */
  const filteredExpenses = useMemo(() => {
    let filtered = [...expenses];

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter(expense => expense.type === selectedType);
    }

    // Filter by category (only if a type is selected)
    if (selectedType !== 'all' && selectedCategoryId !== 'all') {
      filtered = filtered.filter(expense => expense.categoryId === selectedCategoryId);
    }

    // Filter by subcategory (only if a type and category are selected)
    if (selectedType !== 'all' && selectedCategoryId !== 'all' && selectedSubCategoryId !== 'all') {
      filtered = filtered.filter(expense => expense.subCategoryId === selectedSubCategoryId);
    }

    return filtered;
  }, [expenses, selectedType, selectedCategoryId, selectedSubCategoryId]);

  // Calculate totals from filtered expenses
  const totalIncome = calculateTotalIncome(filteredExpenses);
  const totalExpenses = calculateTotalExpenses(filteredExpenses);
  const netBalance = calculateNetBalance(filteredExpenses);
  const incomeExpenseRatio = calculateIncomeExpenseRatio(filteredExpenses);

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
        <Button onClick={handleAddExpense} className="hidden sm:flex">
          <Plus className="mr-2 h-4 w-4" />
          Nuova Spesa
        </Button>
      </div>

      {/* Mobile FAB - Fixed bottom-right */}
      <Button
        onClick={handleAddExpense}
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full shadow-lg sm:hidden"
        aria-label="Nuova Spesa"
      >
        <Plus className="h-6 w-6" />
      </Button>

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
              {filteredExpenses.filter(e => e.type === 'income').length} voci
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
              {filteredExpenses.filter(e => e.type !== 'income').length} voci
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
              Totale: {filteredExpenses.length} voci
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
              <div className="flex flex-wrap items-end gap-4">
                {/* Month Filter */}
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

                {/* Current Month Quick Filter Button */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium">&nbsp;</label>
                  <Button
                    onClick={handleCurrentMonth}
                    variant="secondary"
                    size="default"
                  >
                    Mese corrente
                  </Button>
                </div>

                {/* Type Filter with Search */}
                <div className="flex flex-col gap-2 min-w-[150px]">
                  <Label htmlFor="type-combobox">Tipo</Label>
                  <div className="relative">
                    <Input
                      id="type-combobox"
                      placeholder="Cerca tipo..."
                      value={searchQueryType}
                      onChange={(e) => {
                        setSearchQueryType(e.target.value);
                        setIsTypeDropdownOpen(true);
                      }}
                      onFocus={() => setIsTypeDropdownOpen(true)}
                    />
                    {isTypeDropdownOpen && (
                      <div
                        ref={typeDropdownRef}
                        className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
                      >
                        {typeOptions.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            Nessun tipo trovato
                          </div>
                        ) : (
                          typeOptions.map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              className={cn(
                                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-left",
                                selectedType === type.value && "bg-gray-100"
                              )}
                              onClick={() => handleSelectType(type.value)}
                            >
                              <span className="flex-1">{type.label}</span>
                              {selectedType === type.value && (
                                <Check className="h-4 w-4 text-primary flex-shrink-0" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {selectedType !== 'all' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
                      <span className="text-sm font-medium">
                        {typeOptions.find(t => t.value === selectedType)?.label}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearType}
                        className="ml-1 hover:bg-gray-200 rounded-full p-0.5 transition-colors"
                        aria-label="Rimuovi filtro tipo"
                      >
                        <X className="h-3 w-3 text-gray-600" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Category Filter with Search */}
                <div className="flex flex-col gap-2 min-w-[150px]">
                  <Label htmlFor="category-combobox">Categoria</Label>
                  <div className="relative">
                    <Input
                      id="category-combobox"
                      placeholder={selectedType === 'all' ? 'Seleziona prima un tipo' : 'Cerca categoria...'}
                      value={searchQueryCategory}
                      onChange={(e) => {
                        setSearchQueryCategory(e.target.value);
                        setIsCategoryDropdownOpen(true);
                      }}
                      onFocus={() => setIsCategoryDropdownOpen(true)}
                      disabled={selectedType === 'all' || categoryOptions.length === 0}
                    />
                    {isCategoryDropdownOpen && selectedType !== 'all' && categoryOptions.length > 0 && (
                      <div
                        ref={categoryDropdownRef}
                        className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
                      >
                        {/* Always show "Tutte" option */}
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-left",
                            selectedCategoryId === 'all' && "bg-gray-100"
                          )}
                          onClick={() => handleSelectCategory('all')}
                        >
                          <span className="flex-1">Tutte</span>
                          {selectedCategoryId === 'all' && (
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </button>
                        {categoryOptions.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-left",
                              selectedCategoryId === category.id && "bg-gray-100"
                            )}
                            onClick={() => handleSelectCategory(category.id)}
                          >
                            {category.color && (
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: category.color }}
                              />
                            )}
                            <span className="flex-1">{category.name}</span>
                            {selectedCategoryId === category.id && (
                              <Check className="h-4 w-4 text-primary flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedCategoryId !== 'all' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
                      {categories.find(c => c.id === selectedCategoryId)?.color && (
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: categories.find(c => c.id === selectedCategoryId)?.color }}
                        />
                      )}
                      <span className="text-sm font-medium">
                        {categories.find(c => c.id === selectedCategoryId)?.name}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearCategory}
                        className="ml-1 hover:bg-gray-200 rounded-full p-0.5 transition-colors"
                        aria-label="Rimuovi filtro categoria"
                      >
                        <X className="h-3 w-3 text-gray-600" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Subcategory Filter with Search */}
                <div className="flex flex-col gap-2 min-w-[150px]">
                  <Label htmlFor="subcategory-combobox">Sotto-categoria</Label>
                  <div className="relative">
                    <Input
                      id="subcategory-combobox"
                      placeholder={selectedCategoryId === 'all' ? 'Seleziona prima una categoria' : 'Cerca sotto-categoria...'}
                      value={searchQuerySubCategory}
                      onChange={(e) => {
                        setSearchQuerySubCategory(e.target.value);
                        setIsSubCategoryDropdownOpen(true);
                      }}
                      onFocus={() => setIsSubCategoryDropdownOpen(true)}
                      disabled={selectedCategoryId === 'all' || subCategoryOptions.length === 0}
                    />
                    {isSubCategoryDropdownOpen && selectedCategoryId !== 'all' && subCategoryOptions.length > 0 && (
                      <div
                        ref={subCategoryDropdownRef}
                        className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto"
                      >
                        {/* Always show "Tutte" option */}
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-left",
                            selectedSubCategoryId === 'all' && "bg-gray-100"
                          )}
                          onClick={() => handleSelectSubCategory('all')}
                        >
                          <span className="flex-1">Tutte</span>
                          {selectedSubCategoryId === 'all' && (
                            <Check className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </button>
                        {subCategoryOptions.map((subCategory) => (
                          <button
                            key={subCategory.id}
                            type="button"
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer text-left",
                              selectedSubCategoryId === subCategory.id && "bg-gray-100"
                            )}
                            onClick={() => handleSelectSubCategory(subCategory.id)}
                          >
                            <span className="flex-1">{subCategory.name}</span>
                            {selectedSubCategoryId === subCategory.id && (
                              <Check className="h-4 w-4 text-primary flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedSubCategoryId !== 'all' && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-md border border-gray-200">
                      <span className="text-sm font-medium">
                        {subCategoryOptions.find(s => s.id === selectedSubCategoryId)?.name}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearSubCategory}
                        className="ml-1 hover:bg-gray-200 rounded-full p-0.5 transition-colors"
                        aria-label="Rimuovi filtro sotto-categoria"
                      >
                        <X className="h-3 w-3 text-gray-600" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Reset Filters Button */}
                {hasActiveFilters && (
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      onClick={handleResetFilters}
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

      {/* Expenses - Desktop Table / Mobile Cards */}
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedMonth !== 'all'
              ? `Voci di ${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
              : `Voci del ${selectedYear}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Desktop: Table */}
          <div className="hidden md:block">
            <ExpenseTable
              expenses={filteredExpenses}
              onEdit={handleEditExpense}
              onRefresh={onRefresh}
            />
          </div>

          {/* Mobile: Cards */}
          <div className="md:hidden space-y-3">
            {filteredExpenses.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center">
                <p className="text-muted-foreground">Nessuna voce trovata</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Clicca su "Nuova Spesa" per aggiungere la prima voce
                </p>
              </div>
            ) : (
              <>
                {filteredExpenses.slice(0, 20).map((expense) => (
                  <ExpenseCard
                    key={expense.id}
                    expense={expense}
                    onEdit={handleEditExpense}
                    onDelete={handleDeleteExpense}
                  />
                ))}
                {filteredExpenses.length > 20 && (
                  <p className="text-sm text-muted-foreground text-center pt-2">
                    Visualizzate 20 di {filteredExpenses.length} voci. Usa i filtri per ridurre i risultati.
                  </p>
                )}
              </>
            )}
          </div>
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
