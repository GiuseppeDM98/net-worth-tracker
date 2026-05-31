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

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
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
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, X, Search, Download } from 'lucide-react';

import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';

import { CategoryBreakdownList } from '@/components/cashflow/CategoryBreakdownList';
import { CashflowHeroCard } from '@/components/cashflow/cashflow-kpi/CashflowHeroCard';
import { Badge } from '@/components/ui/badge';

import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PeriodPicker } from '@/components/ui/period-picker';
import {
  type Period,
  periodToRange,
  periodLabel,
  currentMonthPeriod,
  isCurrentMonth,
} from '@/lib/utils/period';
import { MultiSelect, type MultiSelectGroup } from '@/components/ui/multi-select';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import { CashflowTrackingMobile } from '@/components/cashflow/CashflowTrackingMobile';

// ─── Main component ───────────────────────────────────────────────────────────

interface ExpenseTrackingTabProps {
  allExpenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  /** id→name map for cash assets; built in the parent to avoid a cross-domain subscription here. */
  assetNameMap: Map<string, string>;
}

/**
 * CHECKLIST: When adding new ExpenseType values:
 * 1. Update EXPENSE_TYPE_LABELS in types/expenses.ts
 * 2. Add color mapping in ExpenseCard.tsx badge colors
 * 3. Add dot color entry in TYPE_DOT_CLASS (above)
 * 4. Update typeOptions array in this file
 * 5. Add type validation in ExpenseDialog schema
 */
export function ExpenseTrackingTab({
  allExpenses,
  categories,
  loading,
  onRefresh,
  assetNameMap,
}: ExpenseTrackingTabProps) {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  // chartColors removed — CategoryBreakdownList manages its own useChartColors() internally.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Opens the add-expense dialog when the bottom-nav "+" button fires the custom event.
  useEffect(() => {
    const handler = () => {
      setEditingExpense(null);
      setDialogOpen(true);
    };
    window.addEventListener('cashflow:add-expense', handler);
    return () => window.removeEventListener('cashflow:add-expense', handler);
  }, []);
  // Unified period filter (replaces separate selectedYear + selectedMonth)
  const [period, setPeriod] = useState<Period>(() => currentMonthPeriod());

  // Tracks which mobile row is expanded (shows Modifica + Elimina actions).
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // 2-click inline delete state
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AlertDialog for bulk delete (installments / recurring)
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
    open: boolean;
    expense: Expense | null;
    mode: 'installment' | 'recurring' | null;
  }>({ open: false, expense: null, mode: null });

  // Mobile load-more state
  const [mobileShowCount, setMobileShowCount] = useState<number>(20);

  // Free-text search — applied after type/category filters.
  const [searchQuery, setSearchQuery] = useState('');

  // Sort key for the mobile/tablet flat list.
  const [mobileSortKey, setMobileSortKey] = useState<
    'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc' | 'category-asc'
  >('date-desc');

  // Multi-select category filter: selectedTypes covers all categories of a type;
  // selectedCatIds covers individually picked categories.
  const [selectedTypes, setSelectedTypes] = useState<ExpenseType[]>([]);
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('all');

  // Conto corrente filter — 'all' means no account filter applied.
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');

  // Generate available years from ALL expenses (not filtered)
  const availableYears = useMemo(() => {
    if (allExpenses.length === 0) return [];
    const years = allExpenses.map((e) => getExpenseDate(e.date).getFullYear());
    return Array.from(new Set(years)).sort((a, b) => b - a);
  }, [allExpenses]);

  // Receives individual category IDs from MultiSelect; promotes to type-level when
  // ALL categories of a type are selected (covers deleted-category edge case).
  const handleSelectCategories = (values: string[]) => {
    const ORDER: ExpenseType[] = ['income', 'fixed', 'variable', 'debt'];
    const newTypes: ExpenseType[] = [];
    const newCatIds: string[] = [];
    for (const type of ORDER) {
      const typeCats = categories.filter((c) => c.type === type);
      if (typeCats.length === 0) continue;
      if (typeCats.every((c) => values.includes(c.id))) {
        newTypes.push(type);
      } else {
        typeCats.filter((c) => values.includes(c.id)).forEach((c) => newCatIds.push(c.id));
      }
    }
    setSelectedTypes(newTypes);
    setSelectedCatIds(newCatIds);
    setSelectedSubCategoryId('all');
  };

  const handleResetFilters = () => {
    setPeriod(currentMonthPeriod());
    setSelectedTypes([]);
    setSelectedCatIds([]);
    setSelectedSubCategoryId('all');
    setSearchQuery('');
    setSelectedAccountId('all');
    setMobileSortKey('date-desc');
  };

  // A filter is "active" (non-default) if period ≠ current month or any taxonomy filter is set.
  const hasActiveFilters =
    !isCurrentMonth(period) ||
    selectedTypes.length > 0 ||
    selectedCatIds.length > 0 ||
    selectedSubCategoryId !== 'all' ||
    searchQuery !== '' ||
    selectedAccountId !== 'all';

  // Count of active drawer-internal filters shown on the mobile "Filtri" badge.
  // Period and search are excluded — they are always visible inline on mobile.
  const mobileActiveFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim() !== '') count++;
    if (selectedTypes.length > 0 || selectedCatIds.length > 0) count++;
    if (selectedSubCategoryId !== 'all') count++;
    if (selectedAccountId !== 'all') count++;
    return count;
  }, [searchQuery, selectedTypes, selectedCatIds, selectedSubCategoryId, selectedAccountId]);

  // Derive period slice from allExpenses synchronously.
  const expenses = useMemo(() => {
    const { from, to } = periodToRange(period);
    return allExpenses.filter((expense) => {
      const date = getExpenseDate(expense.date);
      return date >= from && date <= to;
    });
  }, [allExpenses, period]);

  // Cleanup pending delete timer on unmount
  useEffect(() => {
    return () => {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    };
  }, []);

  // Reset mobile show count when filters change
  useEffect(() => {
    setMobileShowCount(20);
  }, [
    period,
    selectedTypes,
    selectedCatIds,
    selectedSubCategoryId,
    searchQuery,
    selectedAccountId,
  ]);

  // Toggling another row collapses the previously expanded one (accordion pattern).
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }, []);

  const handleAddExpense = () => {
    setEditingExpense(null);
    setDialogOpen(true);
  };

  /**
   * Export the current filtered view as a semicolon-delimited CSV.
   * Semicolon delimiter is standard in Italian Excel. BOM ensures UTF-8 recognition.
   */
  // Sanitize a cell value against CSV formula injection (OWASP A03).
  // Strings starting with =, +, -, @, TAB, or CR are prefixed with a single quote,
  // which Excel/LibreOffice treat as a text literal, not a formula.
  const sanitizeCSVCell = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

  const handleExportCSV = () => {
    const headers = [
      'Data',
      'Tipo',
      'Categoria',
      'Sottocategoria',
      'Importo (\u20ac)',
      'Note',
      'Conto',
      'Link',
    ];
    const rows = filteredExpenses.map((e) => [
      format(getExpenseDate(e.date), 'dd/MM/yyyy'),
      EXPENSE_TYPE_LABELS[e.type] || e.type,
      sanitizeCSVCell(e.categoryName),
      sanitizeCSVCell(e.subCategoryName || ''),
      e.amount.toFixed(2).replace('.', ','),
      sanitizeCSVCell(e.notes || ''),
      sanitizeCSVCell(e.linkedCashAssetId ? (assetNameMap.get(e.linkedCashAssetId) ?? '') : ''),
      sanitizeCSVCell(e.link || ''),
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashflow-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
    toast.success('Export completato');
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

  const deleteSingleExpense = useCallback(
    async (expense: Expense) => {
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
    },
    [user, queryClient, onRefresh],
  );

  /**
   * 2-click inline delete: first click arms the button (3s disarm timer),
   * second click executes. For installments/recurring, opens AlertDialog
   * so the user can choose between single or bulk delete.
   */
  const handleDeleteExpense = useCallback(
    (expense: Expense) => {
      const isComplex =
        (expense.isInstallment && expense.installmentParentId) ||
        (expense.isRecurring && expense.recurringParentId);

      if (isComplex) {
        // Open AlertDialog for bulk delete choice
        const mode = expense.isInstallment ? 'installment' : 'recurring';
        setBulkDeleteDialog({ open: true, expense, mode });
        return;
      }

      // 2-click inline for regular expenses
      if (pendingDeleteId === expense.id) {
        // Second click: confirm
        if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
        setPendingDeleteId(null);
        void deleteSingleExpense(expense);
      } else {
        // First click: arm
        if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
        setPendingDeleteId(expense.id);
        pendingDeleteTimerRef.current = setTimeout(() => {
          setPendingDeleteId(null);
        }, 3000);
      }
    },
    [pendingDeleteId, deleteSingleExpense],
  );

  const deleteAllRecurringExpenses = async (recurringParentId: string) => {
    try {
      // Reverse balance effects before bulk-deleting (only the first entry stores linkedCashAssetId)
      const seriesExpenses = await getExpensesByRecurringParentId(recurringParentId);
      for (const exp of seriesExpenses) {
        if (exp.linkedCashAssetId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
      }
      if (user && seriesExpenses.some((e) => e.linkedCashAssetId)) {
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
      if (user && seriesExpenses.some((e) => e.linkedCashAssetId)) {
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

  // Build grouped MultiSelect options: one group per ExpenseType with real categories.
  // The MultiSelect component handles group-level select-all natively via its toggleGroup.
  const categoryMultiSelectOptions = useMemo((): MultiSelectGroup[] => {
    const ORDER: ExpenseType[] = ['income', 'fixed', 'variable', 'debt', 'transfer'];
    return ORDER.map((type) => {
      const cats = categories.filter((c) => c.type === type);
      if (cats.length === 0) return null;
      return {
        heading: EXPENSE_TYPE_LABELS[type],
        options: cats.map((cat) => ({ value: cat.id, label: cat.name })),
        collapseGroupBadge: true,
      };
    }).filter((g): g is NonNullable<typeof g> => g !== null);
  }, [categories]);

  // Expand type-level selections to individual IDs so MultiSelect checkboxes stay in sync.
  const multiSelectValue = useMemo(() => {
    const result: string[] = [];
    for (const type of selectedTypes) {
      categories.filter((c) => c.type === type).forEach((c) => result.push(c.id));
    }
    result.push(...selectedCatIds);
    return result;
  }, [selectedTypes, selectedCatIds, categories]);

  // Subcategory options: only when exactly ONE plain category is selected.
  const soloSelectedCategory = useMemo(() => {
    if (selectedCatIds.length !== 1) return null;
    return categories.find((c) => c.id === selectedCatIds[0]) ?? null;
  }, [categories, selectedCatIds]);

  const subCategoryOptions = useMemo(() => {
    if (!soloSelectedCategory) return [];
    return soloSelectedCategory.subCategories.map((sub) => ({
      ...sub,
      categoryName: soloSelectedCategory.name,
      categoryId: soloSelectedCategory.id,
    }));
  }, [soloSelectedCategory]);

  // Account options: accounts that appear in the current period expenses.
  // Only shown when at least 2 distinct accounts exist (otherwise the filter is useless).
  const accountOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const e of expenses) {
      if (e.linkedCashAssetId) ids.add(e.linkedCashAssetId);
    }
    return Array.from(ids).map((id) => ({
      id,
      name: assetNameMap.get(id) ?? id,
    }));
  }, [expenses, assetNameMap]);

  // Auto-reset account filter when the selected account is no longer present in the
  // current period (e.g. user changed period to a month with no transactions for that account).
  useEffect(() => {
    if (selectedAccountId !== 'all' && !accountOptions.some((a) => a.id === selectedAccountId)) {
      setSelectedAccountId('all');
    }
  }, [accountOptions, selectedAccountId]);

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

    if (selectedTypes.length > 0 || selectedCatIds.length > 0) {
      const typeSet = new Set(selectedTypes);
      const catIdSet = new Set(selectedCatIds);
      filtered = filtered.filter((e) => typeSet.has(e.type) || catIdSet.has(e.categoryId));
    }

    // Subcategory filter only applies when a single category is selected
    if (soloSelectedCategory && selectedSubCategoryId !== 'all') {
      filtered = filtered.filter((e) => e.subCategoryId === selectedSubCategoryId);
    }

    // Free-text search across notes, category name, and subcategory name
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.notes?.toLowerCase().includes(q) ||
          e.categoryName.toLowerCase().includes(q) ||
          e.subCategoryName?.toLowerCase().includes(q),
      );
    }

    // Account (conto corrente) filter
    if (selectedAccountId !== 'all') {
      filtered = filtered.filter((e) => e.linkedCashAssetId === selectedAccountId);
    }

    return filtered;
  }, [
    expenses,
    selectedTypes,
    selectedCatIds,
    soloSelectedCategory,
    selectedSubCategoryId,
    searchQuery,
    selectedAccountId,
  ]);

  // categoryId → { icon, color } lookup for mobile row icon badges.
  const categoryMetaMap = useMemo(
    () => new Map(categories.map((c) => [c.id, { icon: c.icon, color: c.color }])),
    [categories],
  );

  // Sort the filtered list for the mobile/tablet flat list.
  // date-desc also gets an explicit sort — never rely on Firestore document order.
  const mobileSortedExpenses = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => {
      switch (mobileSortKey) {
        case 'date-desc':
          return getExpenseDate(b.date).getTime() - getExpenseDate(a.date).getTime();
        case 'date-asc':
          return getExpenseDate(a.date).getTime() - getExpenseDate(b.date).getTime();
        case 'amount-desc':
          return Math.abs(b.amount) - Math.abs(a.amount);
        case 'amount-asc':
          return Math.abs(a.amount) - Math.abs(b.amount);
        case 'category-asc':
          return a.categoryName.localeCompare(b.categoryName, 'it');
        default:
          return 0;
      }
    });
  }, [filteredExpenses, mobileSortKey]);

  // Calculate totals from filtered expenses
  const totalIncome = calculateTotalIncome(filteredExpenses);
  const totalExpenses = calculateTotalExpenses(filteredExpenses);
  const netBalance = calculateNetBalance(filteredExpenses);
  const incomeExpenseRatio = calculateIncomeExpenseRatio(filteredExpenses);

  // Transfer total — shown separately, not included in income/expenses/savings
  const totalTransfers = useMemo(
    () =>
      filteredExpenses
        .filter((e) => e.type === 'transfer')
        .reduce((sum, e) => sum + Math.abs(e.amount), 0),
    [filteredExpenses],
  );

  // ─── Hero card derived data ──────────────────────────────────────────────────

  // Header label for the hero card.
  const heroLabel = useMemo(() => periodLabel(period).toUpperCase(), [period]);

  // Expenses of the period immediately preceding the selected one.
  // Only available when viewing a single month (for MoM delta).
  const previousPeriodExpenses = useMemo(() => {
    if (period.kind !== 'month') return null;
    const prevMonthNum = period.month - 1;
    const prevYear = prevMonthNum === 0 ? period.year - 1 : period.year;
    const prevMonth = prevMonthNum === 0 ? 12 : prevMonthNum;
    return allExpenses.filter((e) => {
      const date = getExpenseDate(e.date);
      return date.getFullYear() === prevYear && date.getMonth() + 1 === prevMonth;
    });
  }, [allExpenses, period]);

  // MoM delta for income and expenses — null when viewing full year (no comparison).
  const heroDelta = useMemo(() => {
    if (!previousPeriodExpenses) return null;
    const prevIncome = calculateTotalIncome(previousPeriodExpenses);
    const prevExpenses = calculateTotalExpenses(previousPeriodExpenses);
    const calcDelta = (curr: number, prev: number) => (prev > 0 ? ((curr - prev) / prev) * 100 : 0);
    return {
      income: calcDelta(totalIncome, prevIncome),
      expenses: calcDelta(totalExpenses, prevExpenses),
    };
  }, [previousPeriodExpenses, totalIncome, totalExpenses]);

  // Savings rate as a percentage of income (shown in RISPARMIO chip).
  const heroSavingsRate = useMemo(() => {
    if (totalIncome <= 0) return 0;
    return Math.round(((totalIncome - totalExpenses) / totalIncome) * 100);
  }, [totalIncome, totalExpenses]);

  // Top-5 expense categories aggregated from filteredExpenses for the hero bar chart.
  const heroExpenseCategories = useMemo(() => {
    const items = filteredExpenses.filter((e) => e.type !== 'income' && e.type !== 'transfer');
    const total = items.reduce((s, e) => s + Math.abs(e.amount), 0);
    const byCategory = new Map<string, number>();
    for (const e of items)
      byCategory.set(e.categoryName, (byCategory.get(e.categoryName) ?? 0) + Math.abs(e.amount));
    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }));
  }, [filteredExpenses]);

  // Top-5 income categories aggregated from filteredExpenses for the hero bar chart.
  const heroIncomeCategories = useMemo(() => {
    const items = filteredExpenses.filter((e) => e.type === 'income');
    const total = items.reduce((s, e) => s + Math.abs(e.amount), 0);
    const byCategory = new Map<string, number>();
    for (const e of items)
      byCategory.set(e.categoryName, (byCategory.get(e.categoryName) ?? 0) + Math.abs(e.amount));
    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0,
      }));
  }, [filteredExpenses]);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Filters skeleton */}
        <div className="flex flex-wrap justify-end gap-2">
          <div className="bg-muted h-9 w-full animate-pulse rounded-md sm:w-[190px]" />
          <div className="bg-muted h-9 w-full animate-pulse rounded-md sm:w-[260px]" />
        </div>
        {/* Hero card skeleton */}
        <div className="space-y-4 rounded-xl border p-[22px]">
          <div className="bg-muted h-3 w-36 animate-pulse rounded" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-muted/40 space-y-2 rounded-xl p-3.5">
                <div className="bg-muted h-2.5 w-14 animate-pulse rounded" />
                <div className="bg-muted h-6 w-24 animate-pulse rounded" />
                <div className="bg-muted h-2.5 w-20 animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* List skeleton — flat rows */}
        <div className="divide-border divide-y rounded-xl border">
          <div className="flex items-center gap-2 px-6 py-4">
            <div className="bg-muted h-4 w-12 animate-pulse rounded" />
            <div className="bg-muted h-5 w-6 animate-pulse rounded-full" />
          </div>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-6 py-3">
              <div className="bg-muted h-2 w-2 flex-shrink-0 animate-pulse rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="bg-muted h-3 w-36 animate-pulse rounded" />
                <div className="bg-muted h-2.5 w-24 animate-pulse rounded" />
              </div>
              <div className="bg-muted h-3 w-16 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── MOBILE: dedicated mobile template (hidden on desktop) ────────────── */}
      <CashflowTrackingMobile
        className="desktop:hidden"
        period={period}
        onPeriodChange={setPeriod}
        availableYears={availableYears}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        categoryMultiSelectOptions={categoryMultiSelectOptions}
        multiSelectValue={multiSelectValue}
        onCategoryChange={handleSelectCategories}
        soloSelectedCategory={soloSelectedCategory}
        subCategoryOptions={subCategoryOptions}
        selectedSubCategoryId={selectedSubCategoryId}
        onSubCategoryChange={setSelectedSubCategoryId}
        accountOptions={accountOptions}
        selectedAccountId={selectedAccountId}
        onAccountChange={setSelectedAccountId}
        activeFilterCount={mobileActiveFilterCount}
        onReset={handleResetFilters}
        income={totalIncome}
        expenses={totalExpenses}
        net={netBalance}
        ratio={incomeExpenseRatio}
        incomeDelta={heroDelta?.income}
        expensesDelta={heroDelta?.expenses}
        savingsRate={heroSavingsRate}
        expenseCategories={heroExpenseCategories}
        incomeCategories={heroIncomeCategories}
        categories={categories}
        transfers={totalTransfers}
        transactions={mobileSortedExpenses}
        totalCount={filteredExpenses.length}
        showCount={mobileShowCount}
        onLoadMore={() => setMobileShowCount((prev) => prev + 20)}
        mobileSortKey={mobileSortKey}
        onSortChange={setMobileSortKey}
        onEdit={handleEditExpense}
        onDelete={handleDeleteExpense}
        pendingDeleteId={pendingDeleteId}
        isDemo={isDemo}
        hasActiveFilters={hasActiveFilters}
        onAddExpense={handleAddExpense}
        categoryMetaMap={categoryMetaMap}
      />

      {/* ── DESKTOP: filter bar ─────────────────────────────────────────────── */}
      <div className="desktop:flex hidden flex-col gap-2">
        {/* Row 1: Search + Period */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Ricerca testo */}
          <div className="relative min-w-[160px] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca note, categorie..."
              className="h-9 pr-8 pl-8 text-sm"
              aria-label="Cerca nelle note, categoria o sottocategoria"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 transition-colors"
                aria-label="Cancella ricerca"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Periodo */}
          <PeriodPicker
            value={period}
            onChange={setPeriod}
            availableYears={availableYears}
            className="shrink-0"
          />
        </div>

        {/* Row 2: Category chips + optional account filter + reset */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Categorie */}
          <div className="min-w-[200px] flex-1">
            <MultiSelect
              options={categoryMultiSelectOptions}
              defaultValue={multiSelectValue}
              onValueChange={handleSelectCategories}
              placeholder="Tutte le categorie"
              searchable
              hideSelectAll
              singleLine
              maxCount={2}
              className="w-full"
              popoverClassName="w-[280px] desktop:w-[320px]"
              resetOnDefaultValueChange={false}
            />
          </div>

          {/* Sottocategoria */}
          {soloSelectedCategory && subCategoryOptions.length > 0 && (
            <div className="w-full shrink-0 sm:w-[180px]">
              <Select value={selectedSubCategoryId} onValueChange={setSelectedSubCategoryId}>
                <SelectTrigger
                  id="filter-subcategory"
                  aria-label="Filtra per sottocategoria"
                  className="w-full"
                >
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {subCategoryOptions.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Conto corrente — only shown when 2+ accounts appear in the period */}
          {accountOptions.length >= 2 && (
            <div className="w-full shrink-0 sm:w-[180px]">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger
                  id="filter-account"
                  aria-label="Filtra per conto corrente"
                  className="w-full"
                >
                  <SelectValue placeholder="Tutti i conti" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i conti</SelectItem>
                  {accountOptions.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Ripristina — only when filters are active */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="text-muted-foreground hover:text-foreground h-9 shrink-0 gap-1.5 px-2.5"
            >
              <X className="h-3.5 w-3.5" />
              Ripristina
            </Button>
          )}
        </div>
      </div>
      {/* end desktop filter bar */}

      {/* ── DESKTOP: sticky KPI left + transaction list right ────────────────── */}
      <div className="desktop:grid desktop:grid-cols-[360px_1fr] desktop:gap-6 desktop:items-start hidden">
        <div className="desktop:sticky desktop:top-4">
          {/* ── Hero Cashflow Card ─────────────────────────────────────────────── */}
          <CashflowHeroCard
            monthLabel={heroLabel}
            income={totalIncome}
            expenses={totalExpenses}
            net={netBalance}
            ratio={incomeExpenseRatio}
            incomeDelta={heroDelta?.income}
            expensesDelta={heroDelta?.expenses}
            savingsRate={heroSavingsRate}
            expenseCategories={heroExpenseCategories}
            incomeCategories={heroIncomeCategories}
            categories={categories}
            transfers={totalTransfers}
          />
        </div>
        {/* end desktop sticky left panel */}

        {/* RIGHT: transaction list */}
        <Card className="gap-0 py-0">
          <CardHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <CardTitle className="text-base">Elenco delle spese</CardTitle>
                <Badge variant="secondary" className="text-xs tabular-nums">
                  {filteredExpenses.length}
                </Badge>
                <span className="text-muted-foreground text-sm">{periodLabel(period)}</span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCSV}
                  disabled={filteredExpenses.length === 0}
                  aria-label="Esporta voci come CSV"
                  className="text-muted-foreground hover:text-foreground h-8 gap-1.5 px-2.5 text-xs"
                >
                  <Download className="h-3.5 w-3.5" />
                  Esporta CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <ExpenseTable
              expenses={filteredExpenses}
              onEdit={handleEditExpense}
              onRefresh={onRefresh}
              isDemo={isDemo}
              hasActiveFilters={hasActiveFilters}
              categories={categories}
            />
          </CardContent>
        </Card>
      </div>
      {/* end desktop two-column grid */}

      {/* Expense Dialog */}
      <ExpenseDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        expense={editingExpense}
        onSuccess={handleSuccess}
      />

      {/* Bulk delete AlertDialog — for installments and recurring expenses */}
      <AlertDialog
        open={bulkDeleteDialog.open}
        onOpenChange={(open) => {
          if (!open) setBulkDeleteDialog({ open: false, expense: null, mode: null });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkDeleteDialog.mode === 'installment' ? 'Elimina rata' : 'Elimina voce ricorrente'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkDeleteDialog.mode === 'installment' && bulkDeleteDialog.expense
                ? `Questa è la rata ${bulkDeleteDialog.expense.installmentNumber}/${bulkDeleteDialog.expense.installmentTotal}. Vuoi eliminare solo questa rata o tutte le ${bulkDeleteDialog.expense.installmentTotal} rate?`
                : 'Questa è una voce ricorrente. Vuoi eliminare solo questa voce o tutte le occorrenze correlate?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => {
                if (bulkDeleteDialog.expense) void deleteSingleExpense(bulkDeleteDialog.expense);
                setBulkDeleteDialog({ open: false, expense: null, mode: null });
              }}
            >
              Solo questa
            </Button>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const exp = bulkDeleteDialog.expense;
                if (!exp) return;
                if (bulkDeleteDialog.mode === 'installment' && exp.installmentParentId) {
                  void deleteAllInstallmentExpenses(exp.installmentParentId);
                } else if (bulkDeleteDialog.mode === 'recurring' && exp.recurringParentId) {
                  void deleteAllRecurringExpenses(exp.recurringParentId);
                }
                setBulkDeleteDialog({ open: false, expense: null, mode: null });
              }}
            >
              {bulkDeleteDialog.mode === 'installment'
                ? `Tutte le ${bulkDeleteDialog.expense?.installmentTotal ?? ''} rate`
                : 'Tutte le ricorrenti'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
