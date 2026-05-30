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

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { Plus, X, Trash2, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useChartColors } from '@/lib/hooks/useChartColors';
import { PeriodPicker } from '@/components/ui/period-picker';
import { type Period, periodToRange, periodLabel, currentMonthPeriod, isCurrentMonth } from '@/lib/utils/period';
import { MultiSelect, type MultiSelectGroup, type MultiSelectOption } from '@/components/ui/multi-select';

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
// All four entries use CSS variable / semantic token references so they remain
// theme-aware across all 6 colour themes. `income` uses emerald-* (semantic
// positive) instead of green-* for parity with the project token convention.
const TYPE_DOT_CLASS: Record<ExpenseType, string> = {
  income: 'bg-emerald-500 dark:bg-emerald-400',
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

        {/* Amount — positive income uses emerald semantic token; expenses use
            text-destructive so both adapt to the active colour theme */}
        <span
          className={cn(
            'text-[14px] font-bold font-mono tabular-nums flex-shrink-0',
            isIncome
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-destructive',
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Opens the add-expense dialog when the bottom-nav "+" button fires the custom event.
  useEffect(() => {
    const handler = () => { setEditingExpense(null); setDialogOpen(true); };
    window.addEventListener('cashflow:add-expense', handler);
    return () => window.removeEventListener('cashflow:add-expense', handler);
  }, []);
  // Unified period filter (replaces separate selectedYear + selectedMonth)
  const [period, setPeriod] = useState<Period>(currentMonthPeriod);

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

  // Multi-select category filter: values are either a real categoryId or
  // a synthetic "__type__<type>" sentinel that matches all categories of that type.
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>('all');


  // Generate available years from ALL expenses (not filtered)
  const availableYears = useMemo(() => {
    if (allExpenses.length === 0) return [];
    const years = allExpenses.map(e => getExpenseDate(e.date).getFullYear());
    return Array.from(new Set(years)).sort((a, b) => b - a);
  }, [allExpenses]);

  const handleSelectCategories = (values: string[]) => {
    const ORDER: ExpenseType[] = ['income', 'fixed', 'variable', 'debt'];
    const result: string[] = [];
    for (const type of ORDER) {
      const typeCats = categories.filter(c => c.type === type);
      if (typeCats.length === 0) continue;
      const sentinel = `${TYPE_PREFIX}${type}`;
      const sentinelSelected = values.includes(sentinel);
      const presentCatIds = typeCats.filter(c => values.includes(c.id)).map(c => c.id);
      const prevSentinelSelected = selectedCategoryIds.includes(sentinel);
      if (sentinelSelected) {
        if (!prevSentinelSelected) {
          // Sentinel just added → store sentinel only (covers all of this type)
          result.push(sentinel);
        } else {
          // Sentinel was already active — check if all individuals are still present
          const allPresent = typeCats.every(c => values.includes(c.id));
          if (allPresent) {
            result.push(sentinel);
          } else {
            // User deselected an individual → demote to remaining individual IDs
            result.push(...presentCatIds);
          }
        }
      } else {
        if (prevSentinelSelected) {
          // Sentinel was just removed → deselect ALL of this type
        } else {
          // Normal individual toggle — auto-promote when all are individually selected
          const allPresent = typeCats.length > 0 && typeCats.every(c => values.includes(c.id));
          if (allPresent) {
            result.push(sentinel);
          } else {
            result.push(...presentCatIds);
          }
        }
      }
    }
    setSelectedCategoryIds(result);
    setSelectedSubCategoryId('all');
  };

  const handleResetFilters = () => {
    setPeriod(currentMonthPeriod());
    setSelectedCategoryIds([]);
    setSelectedSubCategoryId('all');
  };

  // A filter is "active" (non-default) if period ≠ current month or any taxonomy filter is set.
  const hasActiveFilters = !isCurrentMonth(period) || selectedCategoryIds.length > 0 || selectedSubCategoryId !== 'all';

  // Derive period slice from allExpenses synchronously.
  const expenses = useMemo(() => {
    const { from, to } = periodToRange(period);
    return allExpenses.filter(expense => {
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
  }, [period, selectedCategoryIds, selectedSubCategoryId]);

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

  // Filter options for Type
  // Prefix used to distinguish type-level sentinels from real category IDs.
  const TYPE_PREFIX = '__type__';

  // Build grouped MultiSelect options: one group per ExpenseType, each with a
  // "Tutte le <tipo>" sentinel at the top followed by the real categories.
  // sentinel options use badgeLabel for short badge text and separator: true for visual divider.
  // Individual options use groupKey to suppress their badge when their sentinel is selected.
  const categoryMultiSelectOptions = useMemo((): MultiSelectGroup[] => {
    const ORDER: ExpenseType[] = ['income', 'fixed', 'variable', 'debt'];
    return ORDER
      .map(type => {
        const cats = categories.filter(c => c.type === type);
        if (cats.length === 0) return null;
        return {
          heading: EXPENSE_TYPE_LABELS[type],
          options: [
            {
              value: `${TYPE_PREFIX}${type}`,
              label: `Tutte le ${EXPENSE_TYPE_LABELS[type]}`,
              badgeLabel: EXPENSE_TYPE_LABELS[type],
              separator: true,
            } as MultiSelectOption,
            ...cats.map(cat => ({
              value: cat.id,
              label: cat.name,
              groupKey: `${TYPE_PREFIX}${type}`,
            } as MultiSelectOption)),
          ],
        };
      })
      .filter((g): g is MultiSelectGroup => g !== null);
  }, [categories]);

  // Expand sentinels to individual IDs so checkboxes appear checked in the dropdown.
  // State stores sentinels; the MultiSelect component receives the expanded set.
  const multiSelectValue = useMemo(() => {
    const result: string[] = [];
    for (const v of selectedCategoryIds) {
      if (v.startsWith(TYPE_PREFIX)) {
        const type = v.slice(TYPE_PREFIX.length) as ExpenseType;
        result.push(v); // include sentinel itself
        categories.filter(c => c.type === type).forEach(c => result.push(c.id));
      } else {
        result.push(v);
      }
    }
    return result;
  }, [selectedCategoryIds, categories]);

  // Subcategory options: only when exactly ONE plain category (not a type sentinel) is selected.
  const soloSelectedCategory = useMemo(() => {
    const plainSelected = selectedCategoryIds.filter(v => !v.startsWith(TYPE_PREFIX));
    if (plainSelected.length !== 1) return null;
    return categories.find(c => c.id === plainSelected[0]) ?? null;
  }, [categories, selectedCategoryIds]);

  const subCategoryOptions = useMemo(() => {
    if (!soloSelectedCategory) return [];
    return soloSelectedCategory.subCategories.map(sub => ({
      ...sub,
      categoryName: soloSelectedCategory.name,
      categoryId: soloSelectedCategory.id,
    }));
  }, [soloSelectedCategory]);

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

    if (selectedCategoryIds.length > 0) {
      // Collect which type sentinels and which plain category IDs are active.
      const activeTypes = new Set(
        selectedCategoryIds
          .filter(v => v.startsWith(TYPE_PREFIX))
          .map(v => v.slice(TYPE_PREFIX.length) as ExpenseType)
      );
      const activeCatIds = new Set(
        selectedCategoryIds.filter(v => !v.startsWith(TYPE_PREFIX))
      );
      filtered = filtered.filter(
        e => activeTypes.has(e.type) || activeCatIds.has(e.categoryId)
      );
    }

    // Subcategory filter only applies when a single category is selected
    if (soloSelectedCategory && selectedSubCategoryId !== 'all') {
      filtered = filtered.filter(e => e.subCategoryId === selectedSubCategoryId);
    }

    return filtered;
  }, [expenses, selectedCategoryIds, soloSelectedCategory, selectedSubCategoryId]);

  // Calculate totals from filtered expenses
  const totalIncome = calculateTotalIncome(filteredExpenses);
  const totalExpenses = calculateTotalExpenses(filteredExpenses);
  const netBalance = calculateNetBalance(filteredExpenses);
  const incomeExpenseRatio = calculateIncomeExpenseRatio(filteredExpenses);

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
    return allExpenses.filter(e => {
      const date = getExpenseDate(e.date);
      return date.getFullYear() === prevYear && date.getMonth() + 1 === prevMonth;
    });
  }, [allExpenses, period]);

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
        {/* Filters skeleton — matches compact filter card */}
        <div className="rounded-xl border py-3 desktop:py-4 px-3 desktop:px-4 space-y-2">
          <div className="h-9 bg-muted animate-pulse rounded-md" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-9 bg-muted animate-pulse rounded-md" />
            <div className="h-9 bg-muted animate-pulse rounded-md" />
          </div>
        </div>
        {/* Hero card skeleton */}
        <div className="rounded-xl border p-[22px] space-y-4">
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
        {/* List skeleton — flat rows */}
        <div className="rounded-xl border divide-y divide-border">
          <div className="px-6 py-4 flex items-center gap-2">
            <div className="h-4 w-12 bg-muted animate-pulse rounded" />
            <div className="h-5 w-6 bg-muted animate-pulse rounded-full" />
          </div>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3 px-6 py-3">
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
      {/* ── Filters bar — always visible, commands the whole page ─────────── */}
      <Card className="py-3 desktop:py-4">
        <CardContent className="px-3 desktop:px-4">
          <div className="space-y-2 desktop:flex desktop:items-center desktop:gap-2 desktop:space-y-0">
            {/* Periodo — full row on mobile, auto-width on desktop */}
            <PeriodPicker
              value={period}
              onChange={setPeriod}
              availableYears={availableYears}
              className="w-full desktop:w-auto desktop:flex-shrink-0"
            />

            {/* Categorie — MultiSelect grouped by type */}
            <MultiSelect
              options={categoryMultiSelectOptions}
              defaultValue={multiSelectValue}
              onValueChange={handleSelectCategories}
              placeholder="Tutte le categorie"
              searchable
              hideSelectAll
              maxCount={2}
              className="desktop:min-w-[220px]"
              popoverClassName="w-[280px]"
              resetOnDefaultValueChange={true}
            />

            {/* Sottocategoria — full row on mobile, inline on desktop */}
            {soloSelectedCategory && subCategoryOptions.length > 0 && (
              <Select value={selectedSubCategoryId} onValueChange={setSelectedSubCategoryId}>
                <SelectTrigger id="filter-subcategory" aria-label="Filtra per sottocategoria" className="w-full desktop:min-w-[150px]">
                  <SelectValue placeholder="Tutte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {subCategoryOptions.map(sub => (
                    <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Actions — Ripristina chip + desktop Nuova Spesa */}
            <div className="flex items-center gap-2 desktop:ml-auto">
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-9 gap-1.5 px-2.5 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                  Ripristina
                </Button>
              )}
              <Button
                onClick={handleAddExpense}
                disabled={isDemo}
                title={isDemo ? 'Non disponibile in modalit\u00e0 demo' : undefined}
                className="hidden desktop:flex ml-auto"
              >
                <Plus className="mr-2 h-4 w-4" />
                Nuova Spesa
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
              <p className="text-[22px] font-bold font-mono tabular-nums text-emerald-500 dark:text-emerald-400 leading-none">
                {cachedFormatCurrencyEUR(totalIncome, true)}
              </p>
              {heroDelta !== null && (() => {
                const pos = heroDelta.income >= 0;
                return (
                  <p className={cn('text-[12px] font-mono mt-1.5', pos ? 'text-emerald-500 dark:text-emerald-400' : 'text-destructive')}>
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
              <p className="text-[22px] font-bold font-mono tabular-nums text-destructive leading-none">
                {cachedFormatCurrencyEUR(totalExpenses, true)}
              </p>
              {heroDelta !== null && (() => {
                // For expenses: +% means spent more → destructive (inverted logic vs income).
                const pos = heroDelta.expenses >= 0;
                return (
                  <p className={cn('text-[12px] font-mono mt-1.5', pos ? 'text-destructive' : 'text-emerald-500 dark:text-emerald-400')}>
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
                netBalance >= 0 ? 'text-foreground' : 'text-destructive',
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

      {/* Expenses - Desktop Table / Mobile Cards */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-base">Voci</CardTitle>
              <Badge variant="secondary" className="tabular-nums text-xs">
                {filteredExpenses.length}
              </Badge>
            </div>
            {/* Mobile: inline add button — desktop uses the filter bar button */}
            <Button
              size="sm"
              onClick={handleAddExpense}
              disabled={isDemo}
              title={isDemo ? 'Non disponibile in modalit\u00e0 demo' : undefined}
              className="desktop:hidden flex-shrink-0 h-9"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Aggiungi
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{periodLabel(period)}</p>
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
