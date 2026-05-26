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
import { useAssets } from '@/lib/hooks/useAssets';
import { useHouseholdScopeFilter } from '@/lib/hooks/useHouseholdScopeFilter';
import { useInternalTransfers, useInvestmentOperations } from '@/lib/hooks/useInvestmentOperations';
import { Expense, ExpenseCategory, EXPENSE_TYPE_LABELS, ExpenseType } from '@/types/expenses';
import { InternalTransfer, InvestmentOperation } from '@/types/investments';
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateNetBalance,
  calculateIncomeExpenseRatio,
  getExpensesByRecurringParentId,
  getExpensesByInstallmentParentId,
} from '@/lib/services/expenseService';
import { updateCashAssetBalance, updateInvestmentAssetQuantity } from '@/lib/services/assetService';
import { deleteInvestmentOperation } from '@/lib/services/investmentOperationService';
import { queryKeys } from '@/lib/query/queryKeys';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import {
  filterExpensesByAttributionScope,
  filterInternalTransfersByOwnershipScope,
  filterInvestmentOperationsByOwnershipScope,
} from '@/lib/utils/householdUtils';
import { HouseholdScopeSelect } from '@/components/household/HouseholdScopeSelect';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { Plus, Filter, ChevronDown, Check, X, Trash2, Pencil, TrendingUp, TrendingDown, ArrowRightLeft, ChartCandlestick } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useChartColors } from '@/lib/hooks/useChartColors';

const formatCurrency = cachedFormatCurrencyEUR;

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

// Coverage ratio → Italian health label (mirrors the same function in the dashboard overview page).
function coverageHealthLabel(ratio: number): string {
  if (ratio >= 2.0) return 'Salute ottima';
  if (ratio >= 1.3) return 'Salute buona';
  if (ratio >= 1.0) return 'In pareggio';
  return 'In deficit';
}

// Safely coerce Expense.date (Date | Timestamp | string) to a native Date.
const getExpenseDate = (d: Expense['date']): Date => {
  if (d instanceof Date) return d;
  if (typeof d === 'string') return new Date(d);
  return (d as { toDate(): Date }).toDate();
};

// Tailwind dot-color classes keyed by expense type for the mobile list rows.
// Uses CSS variable references so they stay theme-aware across all 6 colour themes.
const TYPE_DOT_CLASS: Record<ExpenseType, string> = {
  income: 'bg-green-500 dark:bg-green-400',
  fixed: 'bg-[var(--chart-2)]',
  variable: 'bg-[var(--chart-4)]',
  debt: 'bg-[var(--chart-3)]',
};

// ─── MobileExpenseRow ─────────────────────────────────────────────────────────

interface MobileExpenseRowProps {
  expense: Expense;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  isPendingDelete: boolean;
  isDemo: boolean;
}

/**
 * Flat list row for mobile expense display (Trade Republic divide-y style).
 *
 * Interaction pattern:
 * - Tapping the row body toggles an inline action area (Modifica + Elimina).
 * - Elimina reuses the parent's 2-click arm pattern — isPendingDelete drives
 *   the visual "confirm" state; actual logic lives in the parent handler.
 * - Complex expenses (installments/recurring) open an AlertDialog on first tap
 *   of Elimina, so no 2-click arm is needed; the parent handles the distinction.
 */
function MobileExpenseRow({
  expense,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  isPendingDelete,
  isDemo,
}: MobileExpenseRowProps) {
  const date = getExpenseDate(expense.date);
  const isIncome = expense.type === 'income';

  // "20/5" short date shown in the subtitle (no year, no zero-padding).
  const shortDate = format(date, 'd/M');

  // Subtitle: category · subcategory · date — omit subcategory when absent.
  const subtitle = [expense.categoryName, expense.subCategoryName || null, shortDate]
    .filter(Boolean)
    .join(' · ');

  // Title: user-entered notes take priority; fall back to category name.
  const title = expense.notes?.trim() || expense.categoryName;

  const amountLabel = `${isIncome ? '+' : ''}${cachedFormatCurrencyEUR(Math.abs(expense.amount))}`;

  return (
    <div className="py-3">
      {/* Tappable row — shows dot, title, subtitle and amount */}
      <button
        type="button"
        className="w-full flex items-center gap-3 text-left"
        onClick={() => onToggleExpand(expense.id)}
        aria-expanded={isExpanded}
      >
        {/* Type color dot */}
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            TYPE_DOT_CLASS[expense.type] ?? 'bg-muted-foreground',
          )}
        />

        {/* Title + badges + subtitle */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[14px] font-medium text-foreground truncate">{title}</span>
            {expense.isInstallment && expense.installmentNumber && expense.installmentTotal && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                {expense.installmentNumber}/{expense.installmentTotal}
              </Badge>
            )}
            {expense.isRecurring && !expense.isInstallment && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 flex-shrink-0">
                Ric.
              </Badge>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground truncate mt-0.5">{subtitle}</p>
        </div>

        {/* Amount — green for income, red for expenses */}
        <span
          className={cn(
            'text-[14px] font-bold font-mono tabular-nums flex-shrink-0',
            isIncome
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400',
          )}
        >
          {amountLabel}
        </span>
      </button>

      {/* Inline action area — animated height 0 → auto on expand */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="actions"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 mt-3 pl-5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(expense)}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                className="flex-1 h-9"
              >
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Modifica
              </Button>
              {/* Delete: first tap arms (destructive style), second tap confirms */}
              <Button
                variant={isPendingDelete ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => onDelete(expense)}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                className="flex-1 h-9"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {isPendingDelete ? 'Conferma' : 'Elimina'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ExpenseTrackingTabProps {
  allExpenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

type UnifiedMovement =
  | { id: string; kind: 'expense'; date: Date; title: string; subtitle: string; amount: number; source: Expense }
  | { id: string; kind: 'investment'; date: Date; title: string; subtitle: string; amount: number; source: InvestmentOperation }
  | { id: string; kind: 'transfer'; date: Date; title: string; subtitle: string; amount: number; source: InternalTransfer };

/**
 * CHECKLIST: When adding new ExpenseType values:
 * 1. Update EXPENSE_TYPE_LABELS in types/expenses.ts
 * 2. Add color mapping in ExpenseCard.tsx badge colors
 * 3. Add dot color entry in TYPE_DOT_CLASS (above)
 * 4. Update typeOptions array in this file
 * 5. Add type validation in ExpenseDialog schema
 */
export function ExpenseTrackingTab({ allExpenses, categories, loading, onRefresh }: ExpenseTrackingTabProps) {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const chartColors = useChartColors();
  const { data: assets = [] } = useAssets(user?.uid);
  const { data: investmentOperations = [] } = useInvestmentOperations(user?.uid);
  const { data: internalTransfers = [] } = useInternalTransfers(user?.uid);
  const {
    householdConfig,
    householdEnabled,
    options: householdScopeOptions,
    selectedScopeKey,
    setSelectedScopeKey,
    scope,
  } = useHouseholdScopeFilter(user?.uid);
  const currentYear = new Date().getFullYear();
  const currentMonth = String(new Date().getMonth() + 1); // 1-based month (1-12)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);

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

  const attributionScopedExpenses = useMemo(
    () => filterExpensesByAttributionScope(allExpenses, householdConfig, scope),
    [allExpenses, householdConfig, scope]
  );

  const scopedInvestmentOperations = useMemo(
    () => filterInvestmentOperationsByOwnershipScope(investmentOperations, assets, householdConfig, scope),
    [assets, householdConfig, investmentOperations, scope]
  );

  const scopedInternalTransfers = useMemo(
    () => filterInternalTransfersByOwnershipScope(internalTransfers, assets, householdConfig, scope),
    [assets, householdConfig, internalTransfers, scope]
  );

  // Generate available years from ALL expenses (not filtered)
  const availableYears = useMemo(() => {
    if (attributionScopedExpenses.length === 0) return [];

    const years = attributionScopedExpenses.map(expense => {
      const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
      return date.getFullYear();
    });

    const uniqueYears = Array.from(new Set(years)).sort((a, b) => b - a);
    return uniqueYears;
  }, [attributionScopedExpenses]);

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
    setSelectedScopeKey('__all__');
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
  const hasActiveFilters =
    selectedMonth !== 'all' ||
    selectedType !== 'all' ||
    selectedCategoryId !== 'all' ||
    selectedSubCategoryId !== 'all' ||
    selectedScopeKey !== '__all__';

  // Derive year+month slice from allExpenses synchronously — no extra render on filter change.
  const expenses = useMemo(() => {
    return attributionScopedExpenses.filter(expense => {
      const date = expense.date instanceof Date ? expense.date : expense.date.toDate();
      const expenseYear = date.getFullYear();
      const expenseMonth = date.getMonth() + 1; // 1-based

      if (expenseYear !== selectedYear) return false;
      if (selectedMonth !== 'all' && expenseMonth !== parseInt(selectedMonth)) return false;

      return true;
    });
  }, [attributionScopedExpenses, selectedYear, selectedMonth]);

  // Cleanup pending delete timer on unmount
  useEffect(() => {
    return () => {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    };
  }, []);

  // Reset mobile show count when filters change
  useEffect(() => {
    setMobileShowCount(20);
  }, [selectedYear, selectedMonth, selectedType, selectedCategoryId, selectedSubCategoryId]);

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

  // Toggling another row collapses the previously expanded one (accordion pattern).
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedRowId(prev => (prev === id ? null : id));
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
   * 2-click inline delete: first click arms the button (3s disarm timer),
   * second click executes. For installments/recurring, opens AlertDialog
   * so the user can choose between single or bulk delete.
   */
  const handleDeleteExpense = useCallback((expense: Expense) => {
    const isComplex = (expense.isInstallment && expense.installmentParentId) ||
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
  }, [pendingDeleteId]);

  const deleteSingleExpense = async (expense: Expense) => {
    try {
      // Reverse the balance effect on the linked cash asset before deleting
      if (expense.linkedCashAssetId && !expense.investmentOperationId) {
        await updateCashAssetBalance(expense.linkedCashAssetId, -expense.amount);
        if (user) queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
      }
      if (expense.investmentOperationId) {
        await deleteInvestmentOperation(expense.investmentOperationId);
        if (user) {
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) });
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) });
        }
      } else if (expense.linkedInvestmentAssetId && expense.linkedInvestmentQuantityDelta) {
        await updateInvestmentAssetQuantity(expense.linkedInvestmentAssetId, -expense.linkedInvestmentQuantityDelta);
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
        if (exp.linkedCashAssetId && !exp.investmentOperationId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
        if (exp.investmentOperationId) {
          await deleteInvestmentOperation(exp.investmentOperationId);
        } else if (exp.linkedInvestmentAssetId && exp.linkedInvestmentQuantityDelta) {
          await updateInvestmentAssetQuantity(exp.linkedInvestmentAssetId, -exp.linkedInvestmentQuantityDelta);
        }
      }
      if (user && seriesExpenses.some(e => e.linkedCashAssetId || e.linkedInvestmentAssetId || e.investmentOperationId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) });
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
        if (exp.linkedCashAssetId && !exp.investmentOperationId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
        if (exp.investmentOperationId) {
          await deleteInvestmentOperation(exp.investmentOperationId);
        } else if (exp.linkedInvestmentAssetId && exp.linkedInvestmentQuantityDelta) {
          await updateInvestmentAssetQuantity(exp.linkedInvestmentAssetId, -exp.linkedInvestmentQuantityDelta);
        }
      }
      if (user && seriesExpenses.some(e => e.linkedCashAssetId || e.linkedInvestmentAssetId || e.investmentOperationId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) });
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) });
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

  const unifiedMovements = useMemo<UnifiedMovement[]>(() => {
    const matchesPeriod = (dateLike: Parameters<typeof toDate>[0]) => {
      const date = toDate(dateLike);
      if (date.getFullYear() !== selectedYear) return false;
      return selectedMonth === 'all' || date.getMonth() + 1 === parseInt(selectedMonth);
    };

    const expenseMovements: UnifiedMovement[] = filteredExpenses.map(expense => ({
      id: `expense-${expense.id}`,
      kind: 'expense',
      date: toDate(expense.date),
      title: expense.categoryName,
      subtitle: [
        EXPENSE_TYPE_LABELS[expense.type],
        expense.subCategoryName,
        expense.linkedCashAssetId ? 'conto cash collegato' : undefined,
      ].filter(Boolean).join(' · '),
      amount: expense.amount,
      source: expense,
    }));

    const operationMovements: UnifiedMovement[] = scopedInvestmentOperations
      .filter(operation => matchesPeriod(operation.date))
      .map(operation => ({
        id: `investment-${operation.id}`,
        kind: 'investment',
        date: toDate(operation.date),
        title: `${operation.type === 'sell' ? 'Vendita' : 'Acquisto'} ${operation.assetName}`,
        subtitle: [
          `${operation.quantity} quote a ${formatCurrency(operation.pricePerUnit)}`,
          operation.cashAssetName ? `conto ${operation.cashAssetName}` : operation.cashAssetId ? 'conto cash collegato' : 'senza conto cash',
          operation.fees > 0 ? `commissioni ${formatCurrency(operation.fees)}` : undefined,
          operation.taxes > 0 ? `tasse ${formatCurrency(operation.taxes)}` : undefined,
        ].filter(Boolean).join(' · '),
        amount: operation.netCashEffect,
        source: operation,
      }));

    const transferMovements: UnifiedMovement[] = scopedInternalTransfers
      .filter(transfer => matchesPeriod(transfer.date))
      .map(transfer => ({
        id: `transfer-${transfer.id}`,
        kind: 'transfer',
        date: toDate(transfer.date),
        title: `${transfer.fromCashAssetName} -> ${transfer.toCashAssetName}`,
        subtitle: [
          'Trasferimento interno',
          transfer.fees && transfer.fees > 0 ? `commissioni ${formatCurrency(transfer.fees)}` : undefined,
          transfer.notes,
        ].filter(Boolean).join(' · '),
        amount: 0,
        source: transfer,
      }));

    return [...expenseMovements, ...operationMovements, ...transferMovements]
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredExpenses, scopedInternalTransfers, scopedInvestmentOperations, selectedMonth, selectedYear]);

  // Calculate totals from filtered expenses
  const totalIncome = calculateTotalIncome(filteredExpenses);
  const totalExpenses = calculateTotalExpenses(filteredExpenses);
  const netBalance = calculateNetBalance(filteredExpenses);
  const incomeExpenseRatio = calculateIncomeExpenseRatio(filteredExpenses);

  // ─── Hero card derived data ──────────────────────────────────────────────────

  // Header label for the hero card: "MAGGIO 2026" when month selected, else "2026".
  const heroLabel = useMemo(() => {
    if (selectedMonth !== 'all')
      return `${MONTHS.find(m => m.value === selectedMonth)?.label.toUpperCase()} ${selectedYear}`;
    return String(selectedYear);
  }, [selectedYear, selectedMonth]);

  // Expenses of the period immediately preceding the selected month.
  // Used to compute MoM delta — only available when a specific month is selected.
  const previousPeriodExpenses = useMemo(() => {
    if (selectedMonth === 'all') return null;
    const prevMonthNum = parseInt(selectedMonth) - 1;
    const prevYear = prevMonthNum === 0 ? selectedYear - 1 : selectedYear;
    const prevMonth = prevMonthNum === 0 ? 12 : prevMonthNum;
    return allExpenses.filter(e => {
      const date = getExpenseDate(e.date);
      return date.getFullYear() === prevYear && date.getMonth() + 1 === prevMonth;
    });
  }, [allExpenses, selectedYear, selectedMonth]);

  // MoM delta for income and expenses — null when viewing full year (no comparison).
  const heroDelta = useMemo(() => {
    if (!previousPeriodExpenses) return null;
    const prevIncome = calculateTotalIncome(previousPeriodExpenses);
    const prevExpenses = calculateTotalExpenses(previousPeriodExpenses);
    const calcDelta = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : 0;
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
    const items = filteredExpenses.filter(e => e.type !== 'income');
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
    const items = filteredExpenses.filter(e => e.type === 'income');
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
        {/* Hero card skeleton */}
        <div className="rounded-2xl border p-[22px] space-y-4">
          <div className="h-3 w-36 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="bg-muted/40 rounded-xl p-3.5 space-y-2">
                <div className="h-2.5 w-14 bg-muted animate-pulse rounded" />
                <div className="h-6 w-24 bg-muted animate-pulse rounded" />
                <div className="h-2.5 w-20 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
        {/* Filters skeleton */}
        <div className="rounded-lg border p-4">
          <div className="h-4 w-16 bg-muted animate-pulse rounded mb-3" />
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-9 bg-muted animate-pulse rounded" />)}
          </div>
        </div>
        {/* List skeleton — flat rows */}
        <div className="rounded-lg border p-4 divide-y divide-border">
          <div className="h-4 w-32 bg-muted animate-pulse rounded mb-4" />
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3 py-3">
              <div className="h-2 w-2 rounded-full bg-muted animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-36 bg-muted animate-pulse rounded" />
                <div className="h-2.5 w-24 bg-muted animate-pulse rounded" />
              </div>
              <div className="h-3 w-16 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Desktop "Nuova Spesa" button — mobile uses FAB below */}
      <div className="hidden desktop:flex justify-end">
        <Button onClick={handleAddExpense} disabled={isDemo} title={isDemo ? 'Non disponibile in modalità demo' : undefined}>
          <Plus className="mr-2 h-4 w-4" />
          Nuova Spesa
        </Button>
      </div>

      {/* Mobile FAB */}
      <Button
        onClick={handleAddExpense}
        disabled={isDemo}
        className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full shadow-lg desktop:hidden"
        aria-label="Nuova Spesa"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* ── Hero Cashflow Card ─────────────────────────────────────────────── */}
      {/* Mirrors the cashflow card in the Overview/Panoramica page, but driven  */}
      {/* by filteredExpenses (honours the active time + hierarchy filters).      */}
      <Card className="rounded-2xl">
        <CardContent className="p-[22px]">
          {/* Header label: "MAGGIO 2026" or "2026" depending on filter state */}
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground mb-3">
            Cashflow · {heroLabel}
          </p>

          {/* 4 KPI chips */}
          <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
            {/* ENTRATE */}
            <div className="bg-muted/40 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
                Entrate
              </p>
              <p className="text-[22px] font-bold font-mono tabular-nums text-green-500 dark:text-green-400 leading-none">
                {cachedFormatCurrencyEUR(totalIncome, true)}
              </p>
              {heroDelta !== null && (() => {
                const pos = heroDelta.income >= 0;
                return (
                  <p className={cn('text-[12px] font-mono mt-1.5', pos ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400')}>
                    {pos ? '+' : ''}{heroDelta.income.toFixed(1)}% vs mese scorso
                  </p>
                );
              })()}
            </div>

            {/* SPESE */}
            <div className="bg-muted/40 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
                Spese
              </p>
              <p className="text-[22px] font-bold font-mono tabular-nums text-red-500 dark:text-red-400 leading-none">
                {cachedFormatCurrencyEUR(totalExpenses, true)}
              </p>
              {heroDelta !== null && (() => {
                // For expenses: +% means spent more → red (inverted logic vs income).
                const pos = heroDelta.expenses >= 0;
                return (
                  <p className={cn('text-[12px] font-mono mt-1.5', pos ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400')}>
                    {pos ? '+' : ''}{heroDelta.expenses.toFixed(1)}% vs mese scorso
                  </p>
                );
              })()}
            </div>

            {/* RISPARMIO */}
            <div className="bg-muted/40 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
                Risparmio
              </p>
              <p className={cn(
                'text-[22px] font-bold font-mono tabular-nums leading-none',
                netBalance >= 0 ? 'text-foreground' : 'text-red-500 dark:text-red-400',
              )}>
                {cachedFormatCurrencyEUR(netBalance, true)}
              </p>
              {totalIncome > 0 && (
                <p className="text-[12px] text-muted-foreground mt-1.5">
                  {heroSavingsRate}% del reddito
                </p>
              )}
            </div>

            {/* RAPPORTO */}
            <div className="bg-muted/40 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-1.5">
                Rapporto
              </p>
              <p className="text-[22px] font-bold font-mono tabular-nums text-foreground leading-none">
                {incomeExpenseRatio !== null ? `${incomeExpenseRatio.toFixed(2)}×` : '—'}
              </p>
              {incomeExpenseRatio !== null && (
                <p className="text-[12px] text-muted-foreground mt-1.5">
                  {coverageHealthLabel(incomeExpenseRatio)}
                </p>
              )}
            </div>
          </div>

          {/* Category breakdowns — only shown when there is data */}
          {(heroExpenseCategories.length > 0 || heroIncomeCategories.length > 0) && (
            <>
              <div className="mt-4 border-t border-border" />
              <div className="grid desktop:grid-cols-2 gap-x-8 gap-y-4 mt-4">
                {/* Spese per categoria */}
                {heroExpenseCategories.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-3">
                      Spese per Categoria
                    </p>
                    <div className="space-y-3">
                      {heroExpenseCategories.map(cat => (
                        <div key={cat.category} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: chartColors[0] || 'var(--chart-1)' }}
                              />
                              <span className="text-[13px] text-foreground truncate">{cat.category}</span>
                            </div>
                            <span className="text-[13px] font-mono tabular-nums text-foreground ml-3 flex-shrink-0">
                              {cachedFormatCurrencyEUR(cat.amount, true)}
                            </span>
                          </div>
                          <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${cat.percentage}%`, background: chartColors[0] || 'var(--chart-1)' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Entrate per categoria */}
                {heroIncomeCategories.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-3">
                      Entrate per Categoria
                    </p>
                    <div className="space-y-3">
                      {heroIncomeCategories.map(cat => (
                        <div key={cat.category} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: chartColors[1] || 'var(--chart-2)' }}
                              />
                              <span className="text-[13px] text-foreground truncate">{cat.category}</span>
                            </div>
                            <span className="text-[13px] font-mono tabular-nums text-foreground ml-3 flex-shrink-0">
                              {cachedFormatCurrencyEUR(cat.amount, true)}
                            </span>
                          </div>
                          <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${cat.percentage}%`, background: chartColors[1] || 'var(--chart-2)' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Filters — includes year selector (integrated, not a separate card) */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Card>
          <CardHeader>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer w-full">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Filtri</CardTitle>
                  {hasActiveFilters && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </div>
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', filtersOpen && 'rotate-180')} />
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 desktop:flex desktop:flex-wrap desktop:items-end desktop:gap-4">
                {/* Anno filter (integrated — replaces the separate Year card) */}
                {availableYears.length > 0 && (
                  <div className="flex flex-col gap-2 desktop:min-w-[110px]">
                    <label className="text-sm font-medium">Anno</label>
                    <div className="flex flex-wrap gap-1.5">
                      {availableYears.map(year => (
                        <Button
                          key={year}
                          variant={selectedYear === year ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handleYearChange(year)}
                          className="h-8 px-3 text-sm"
                        >
                          {year}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Month Filter + current month quick button */}
                <div className="flex flex-col gap-2 desktop:min-w-[150px]">
                  <label className="text-sm font-medium">Mese</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona mese" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Tutti</SelectItem>
                          {MONTHS.map(month => (
                            <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleCurrentMonth} variant="secondary" size="default" className="shrink-0">
                      Corrente
                    </Button>
                  </div>
                </div>

                {/* Type Filter with Search */}
                <div className="flex flex-col gap-2 desktop:min-w-[150px]">
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
                        className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto text-popover-foreground"
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
                                "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                                selectedType === type.value && "bg-accent text-accent-foreground"
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
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border border-border">
                      <span className="text-sm font-medium">
                        {typeOptions.find(t => t.value === selectedType)?.label}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearType}
                        className="ml-1 hover:bg-muted rounded-full p-0.5 transition-colors"
                        aria-label="Rimuovi filtro tipo"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Category Filter with Search */}
                <div className="flex flex-col gap-2 desktop:min-w-[150px]">
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
                        className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto text-popover-foreground"
                      >
                        {/* Always show "Tutte" option */}
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                            selectedCategoryId === 'all' && "bg-accent text-accent-foreground"
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
                              "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                              selectedCategoryId === category.id && "bg-accent text-accent-foreground"
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
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border border-border">
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
                        className="ml-1 hover:bg-muted rounded-full p-0.5 transition-colors"
                        aria-label="Rimuovi filtro categoria"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Subcategory Filter with Search */}
                <div className="flex flex-col gap-2 desktop:min-w-[150px]">
                  <Label htmlFor="subcategory-combobox">Sottocategoria</Label>
                  <div className="relative">
                    <Input
                      id="subcategory-combobox"
                      placeholder={selectedCategoryId === 'all' ? 'Seleziona prima una categoria' : 'Cerca sottocategoria...'}
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
                        className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto text-popover-foreground"
                      >
                        {/* Always show "Tutte" option */}
                        <button
                          type="button"
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                            selectedSubCategoryId === 'all' && "bg-accent text-accent-foreground"
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
                              "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer text-left",
                              selectedSubCategoryId === subCategory.id && "bg-accent text-accent-foreground"
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
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md border border-border">
                      <span className="text-sm font-medium">
                        {subCategoryOptions.find(s => s.id === selectedSubCategoryId)?.name}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearSubCategory}
                        className="ml-1 hover:bg-muted rounded-full p-0.5 transition-colors"
                        aria-label="Rimuovi filtro sottocategoria"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </div>

                {householdEnabled && (
                  <HouseholdScopeSelect
                    value={selectedScopeKey}
                    onValueChange={setSelectedScopeKey}
                    options={householdScopeOptions}
                    label="Attribuzione"
                    className="desktop:min-w-[220px]"
                  />
                )}

                {/* Reset Filters Button */}
                {hasActiveFilters && (
                  <div className="flex items-end desktop:flex-none">
                    <Button
                      variant="outline"
                      onClick={handleResetFilters}
                      className="w-full desktop:w-auto"
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

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedMonth !== 'all'
              ? `Tutti i movimenti di ${MONTHS.find(m => m.value === selectedMonth)?.label} ${selectedYear}`
              : `Tutti i movimenti del ${selectedYear}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unifiedMovements.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center">
              <p className="text-muted-foreground">Nessun movimento trovato</p>
            </div>
          ) : (
            <div className="space-y-3">
              {unifiedMovements.slice(0, 50).map(movement => (
                <div key={movement.id} className="flex flex-col gap-3 rounded-md border p-3 desktop:flex-row desktop:items-center desktop:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-0.5 shrink-0">
                      {movement.kind === 'investment' ? (
                        <ChartCandlestick className="h-4 w-4 text-blue-600" />
                      ) : movement.kind === 'transfer' ? (
                        <ArrowRightLeft className="h-4 w-4 text-purple-600" />
                      ) : movement.amount >= 0 ? (
                        <TrendingUp className="h-4 w-4 text-green-600" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">{movement.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {toDate(movement.date).toLocaleDateString('it-IT')}
                        {movement.subtitle ? ` · ${movement.subtitle}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {movement.kind === 'transfer' ? (
                      <p className="font-semibold text-muted-foreground">Neutro</p>
                    ) : (
                      <p className={movement.amount >= 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                        {formatCurrency(movement.amount)}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {movement.kind === 'investment' ? 'Investimento' : movement.kind === 'transfer' ? 'Trasferimento' : 'Cashflow'}
                    </p>
                  </div>
                </div>
              ))}
              {unifiedMovements.length > 50 && (
                <p className="text-sm text-muted-foreground text-center pt-2">
                  Visualizzati 50 di {unifiedMovements.length} movimenti. Usa i filtri temporali per ridurre i risultati.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
          <div className="hidden desktop:block">
            <ExpenseTable
              expenses={filteredExpenses}
              onEdit={handleEditExpense}
              onRefresh={onRefresh}
              isDemo={isDemo}
            />
          </div>

          {/* Mobile: flat divide-y list with tap-to-expand actions */}
          <div className="desktop:hidden">
            {filteredExpenses.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center">
                <p className="text-muted-foreground">Nessuna voce trovata</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Usa il pulsante + per aggiungere la prima voce
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {filteredExpenses.slice(0, mobileShowCount).map(expense => (
                    <MobileExpenseRow
                      key={expense.id}
                      expense={expense}
                      isExpanded={expandedRowId === expense.id}
                      onToggleExpand={handleToggleExpand}
                      onEdit={handleEditExpense}
                      onDelete={handleDeleteExpense}
                      isPendingDelete={pendingDeleteId === expense.id}
                      isDemo={isDemo}
                    />
                  ))}
                </div>
                {filteredExpenses.length > mobileShowCount && (
                  <div className="pt-4 text-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setMobileShowCount(prev => prev + 20)}
                    >
                      Carica altri {Math.min(20, filteredExpenses.length - mobileShowCount)}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      {mobileShowCount} di {filteredExpenses.length} voci
                    </p>
                  </div>
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
                : 'Questa è una voce ricorrente. Vuoi eliminare solo questa voce o tutte le occorrenze correlate?'
              }
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
