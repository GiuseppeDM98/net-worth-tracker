'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseCategory, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { getAllExpenses, getExpensesByMonth, getExpensesByDateRange, calculateTotalIncome, calculateTotalExpenses, calculateNetBalance, calculateIncomeExpenseRatio } from '@/lib/services/expenseService';
import { getAllCategories } from '@/lib/services/expenseCategoryService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, TrendingUp, TrendingDown, Wallet, RefreshCw, Filter, ChevronDown, Scale, Check } from 'lucide-react';
import { toast } from 'sonner';
import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
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

  // New filter states
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('all');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  // Search states for comboboxes
  const [searchQueryType, setSearchQueryType] = useState<string>('');
  const [searchQueryCategory, setSearchQueryCategory] = useState<string>('');
  const [searchQuerySubCategory, setSearchQuerySubCategory] = useState<string>('');

  // Dropdown open states
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isSubCategoryDropdownOpen, setIsSubCategoryDropdownOpen] = useState(false);

  // Refs for click outside detection
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

  // Handler functions for filter selections
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

  // Check if any filter is active
  const hasActiveFilters = selectedMonth !== 'all' || selectedType !== 'all' || selectedCategoryId !== 'all' || selectedSubCategoryId !== 'all';

  // Load categories
  useEffect(() => {
    if (user) {
      loadCategories();
    }
  }, [user]);

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

  // Close dropdowns when clicking outside
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

  const loadCategories = async () => {
    if (!user) return;

    try {
      const data = await getAllCategories(user.uid);
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Errore nel caricamento delle categorie');
    }
  };

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

  // Apply cumulative filtering (AND logic)
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
              <div className="flex flex-wrap gap-4">
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
            expenses={filteredExpenses}
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
