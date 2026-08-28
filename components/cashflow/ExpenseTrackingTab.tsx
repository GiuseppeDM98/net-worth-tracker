/**
 * Cashflow › Tracciamento — a verdict over a tile grid (2026-08-22).
 *
 * The tab answers «come sta andando il mese (o il periodo scelto)?» before any number: the
 * rule-generated verdict (lib/utils/cashflowNarrative.ts) sits at the top next to the period
 * picker, and under it a 12-column bento of tiles, each answering ONE question with a reading
 * line over its figures. The inventory (TransactionFeed / ExpenseTable) is the last tile.
 *
 *   Mobile (1 col):   Verdict → [periodo · Filtri · ordina] → Cashflow del periodo → Spese per
 *                     categoria → Entrate per categoria → Risparmio nel tempo → Movimenti
 *   Desktop (12 col): Cashflow del periodo (5, 2 rows) | Spese (4) | Entrate (3)
 *                                                      | Risparmio nel tempo (7)
 *                     Movimenti (12)
 *
 * ONE period axis governs the verdict and every tile. The toolbar filters (search, categories,
 * subcategory, account, sort) narrow ONLY the Movimenti list: a verdict computed on the
 * «Alimentari» filter would read «speso più di quanto è entrato» over a slice that has no
 * income by construction.
 *
 * FILTER ARCHITECTURE (unchanged): period → type/category → subcategory, with the cascading
 * reset (changing the category selection resets the subcategory). Every number the tiles
 * show is born in lib/utils/tracciamentoSummary.ts; the words in cashflowNarrative.ts.
 */
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { Expense, ExpenseCategory, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import {
  getExpensesByRecurringParentId,
  getExpensesByInstallmentParentId,
} from '@/lib/services/expenseService';
import { updateCashAssetBalance } from '@/lib/services/assetService';
import { reconcileTransferDelete } from '@/lib/services/cashBalanceReconciliation';
import { queryKeys } from '@/lib/query/queryKeys';
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
import { X, Search, Download, Plus, ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { ExpenseDialog } from '@/components/expenses/ExpenseDialog';
import { ExpenseTable } from '@/components/expenses/ExpenseTable';
import { TransactionFeed } from '@/components/cashflow/TransactionFeed';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MobileFiltersDrawer } from '@/components/cashflow/MobileFiltersDrawer';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_CELL_CLASS } from '@/components/ui/tile';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { CategoryTile } from '@/components/dashboard/overview/CategoryTile';
import { CashflowPeriodoTile, type SpendingProjection } from '@/components/cashflow/tiles/CashflowPeriodoTile';
import { RisparmioTile } from '@/components/cashflow/tiles/RisparmioTile';
import { MovimentiTile } from '@/components/cashflow/tiles/MovimentiTile';

import { format } from 'date-fns';
import { toast } from 'sonner';
import { PeriodPicker } from '@/components/ui/period-picker';
import {
  type Period,
  periodLabel,
  currentMonthPeriod,
} from '@/lib/utils/period';
import { MultiSelect, type MultiSelectGroup } from '@/components/ui/multi-select';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import { cn } from '@/lib/utils';
import { projectMonthEndSpending } from '@/lib/utils/overviewNarrative';
import {
  buildTrailingMonthFlows,
  computePeriodDelta,
  currentComparisonWindow,
  filterExpensesByPeriod,
  previousPeriod,
  rankCategories,
  resolveAnchorMonth,
  resolveFlowWindow,
  resolvePeriodCalendar,
  splitSpendingAtDate,
  summarizeMovements,
  summarizePeriodCashflow,
  summarizeScheduled,
  summarizeSavingsHistory,
} from '@/lib/utils/tracciamentoSummary';
import {
  buildCashflowVerdict,
  describeCategoryShare,
  describeComparisonPhrase,
  describeDeficitMonths,
  describeFlowWindow,
  describeMonthWindow,
  describeMovements,
  describeMovementsCount,
  describePeriodCashflow,
  describePreviousPeriodLabel,
  describeProjectionReference,
  describeSavingsHistory,
} from '@/lib/utils/cashflowNarrative';

/** Rows the feed reveals per «Carica altri». */
const FEED_PAGE_SIZE = 20;
/** Months of the income-vs-spending chart behind a month or a custom range. */
const FLOW_MONTHS = 6;
/** Months of the savings-rate history. */
const HISTORY_MONTHS = 12;

/** Desktop geometry of the tiles, for the loading skeleton (DESIGN.md → Tile Grid Skeleton). */
const SKELETON_CELLS = [
  { span: 5, rows: 2, lines: 8 },
  { span: 4, lines: 5 },
  { span: 3, lines: 3 },
  { span: 7, lines: 4 },
  { span: 12, lines: 8 },
];

// ─── Main component ───────────────────────────────────────────────────────────

interface ExpenseTrackingTabProps {
  allExpenses: Expense[];
  categories: ExpenseCategory[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  /** id→name map for cash assets; built in the parent to avoid a cross-domain subscription here. */
  assetNameMap: Map<string, string>;
}

interface ListFilters {
  selectedTypes: ExpenseType[];
  selectedCatIds: string[];
  /** 'all', or a subcategory id — only meaningful when ONE plain category is selected. */
  subCategoryId: string;
  searchQuery: string;
  /** 'all', or an account id present in the period. */
  accountId: string;
}

/**
 * Cumulative AND filtering (progressive narrowing): every active filter must match —
 * type/category, then subcategory, then the free-text search, then the account. OR would
 * widen the list (Type="income" OR Category="groceries"); AND narrows it.
 */
function applyListFilters(expenses: Expense[], filters: ListFilters): Expense[] {
  let filtered = expenses;

  if (filters.selectedTypes.length > 0 || filters.selectedCatIds.length > 0) {
    const typeSet = new Set(filters.selectedTypes);
    const catIdSet = new Set(filters.selectedCatIds);
    filtered = filtered.filter((e) => typeSet.has(e.type) || catIdSet.has(e.categoryId));
  }

  if (filters.subCategoryId !== 'all') {
    filtered = filtered.filter((e) => e.subCategoryId === filters.subCategoryId);
  }

  // Free-text search across notes, category name, subcategory name — plus amount. The
  // Italian decimal comma is normalised to a dot so "76,45" and "76.45" both work, then
  // substring-matched against the absolute amount with two decimals: "76" matches 76,45 /
  // 176 / 1276, "76,45" the exact amount. The sign is ignored — the UI never shows it.
  const q = filters.searchQuery.trim().toLowerCase();
  if (q) {
    const amountQuery = q.replace(',', '.');
    const isNumericQuery = amountQuery !== '' && !Number.isNaN(Number(amountQuery));
    filtered = filtered.filter((e) => {
      if (
        e.notes?.toLowerCase().includes(q) ||
        e.categoryName.toLowerCase().includes(q) ||
        e.subCategoryName?.toLowerCase().includes(q)
      ) {
        return true;
      }
      return isNumericQuery && Math.abs(e.amount).toFixed(2).includes(amountQuery);
    });
  }

  if (filters.accountId !== 'all') {
    filtered = filtered.filter((e) => e.linkedCashAssetId === filters.accountId);
  }

  return filtered;
}

/**
 * CHECKLIST: When adding new ExpenseType values:
 * 1. Update EXPENSE_TYPE_LABELS in types/expenses.ts
 * 2. Add color mapping in CompactExpenseRow.tsx dot-color classes (TYPE_DOT_CLASS)
 * 3. Update the ORDER arrays in this file
 * 4. Add type validation in ExpenseDialog schema
 */
export function ExpenseTrackingTab({
  allExpenses,
  categories,
  loading,
  onRefresh,
  assetNameMap,
}: ExpenseTrackingTabProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
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

  // AlertDialog for bulk delete (installments / recurring)
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState<{
    open: boolean;
    expense: Expense | null;
    mode: 'installment' | 'recurring' | null;
  }>({ open: false, expense: null, mode: null });

  // Desktop list view: the day-grouped feed (default, shared with mobile) or the dense table.
  const [desktopListView, setDesktopListView] = useState<'feed' | 'table'>('feed');

  // The feed's visible window, stored WITH the filters it belongs to: when the filters change
  // the key no longer matches and the window falls back to the first page, with no effect
  // and no extra render (AGENTS.md → React Query and Derived State).
  const [feedWindow, setFeedWindow] = useState<{ filterKey: string; count: number } | null>(null);

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

  // Resets what the toolbar owns — never the period, which is the page's axis (the picker's).
  const handleResetFilters = () => {
    setSelectedTypes([]);
    setSelectedCatIds([]);
    setSelectedSubCategoryId('all');
    setSearchQuery('');
    setSelectedAccountId('all');
    setMobileSortKey('date-desc');
  };

  // One clock per mount, like the Panoramica: the verdict's tense, the projection's day, the
  // end of a year still running.
  const now = useMemo(() => new Date(), []);

  // The period slice: the calendar's bounds, whole. «Il 2026» is January → December even in
  // August, so a materialised instalment due in October is in the tiles AND in the list.
  // `scheduled` is the part of it that has not happened yet: the verdict names it, the list
  // marks each such row, and no figure passes a forecast off as a fact.
  //
  // The toolbar filters below narrow `filteredExpenses` (the Movimenti list), never this.
  const expenses = useMemo(() => filterExpensesByPeriod(allExpenses, period), [allExpenses, period]);
  const scheduled = useMemo(() => summarizeScheduled(expenses, now), [expenses, now]);

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
        // Reverse the balance effect before deleting. Transfers move money between two
        // accounts, so both sides must be reconciled (mirror of ExpenseTable's delete) —
        // a plain origin-only reversal would leave the destination balance wrong.
        if (expense.type === 'transfer') {
          await reconcileTransferDelete({
            originId: expense.linkedCashAssetId,
            destId: expense.transferCashAssetId,
            amount: Math.abs(expense.amount),
          });
        } else if (expense.linkedCashAssetId) {
          await updateCashAssetBalance(expense.linkedCashAssetId, -expense.amount);
        }
        if (user && ownerId && (expense.linkedCashAssetId || expense.transferCashAssetId)) {
          queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
        }
        const { deleteExpense } = await import('@/lib/services/expenseService');
        await deleteExpense(expense.id);
        if (user && ownerId) queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(ownerId) });
        toast.success('Voce eliminata con successo');
        await onRefresh();
      } catch (error) {
        console.error('Error deleting expense:', error);
        toast.error("Errore nell'eliminazione della voce");
      }
    },
    [user, ownerId, queryClient, onRefresh],
  );

  /**
   * Delete a transaction from the feed's detail drawer. The drawer already showed an
   * explicit destructive confirmation, so a simple expense is deleted immediately. For
   * installments/recurring, open the AlertDialog so the user can choose single vs. the
   * whole series.
   */
  const handleDeleteExpense = useCallback(
    (expense: Expense) => {
      const isComplex =
        (expense.isInstallment && expense.installmentParentId) ||
        (expense.isRecurring && expense.recurringParentId);

      if (isComplex) {
        const mode = expense.isInstallment ? 'installment' : 'recurring';
        setBulkDeleteDialog({ open: true, expense, mode });
        return;
      }

      void deleteSingleExpense(expense);
    },
    [deleteSingleExpense],
  );

  const deleteAllRecurringExpenses = async (recurringParentId: string) => {
    // The series query is scoped by owner (firestore.rules refuses an unscoped list), so
    // without an owner there is nothing to delete — and no way to ask for it.
    if (!ownerId) return;
    try {
      // Reverse balance effects before bulk-deleting (only the first entry stores linkedCashAssetId)
      const seriesExpenses = await getExpensesByRecurringParentId(ownerId, recurringParentId);
      for (const exp of seriesExpenses) {
        if (exp.linkedCashAssetId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
      }
      if (user && ownerId && seriesExpenses.some((e) => e.linkedCashAssetId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      }
      const { deleteRecurringExpenses } = await import('@/lib/services/expenseService');
      await deleteRecurringExpenses(ownerId, recurringParentId);
      if (user && ownerId) queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(ownerId) });
      toast.success('Tutte le voci ricorrenti sono state eliminate');
      await onRefresh();
    } catch (error) {
      console.error('Error deleting recurring expenses:', error);
      toast.error("Errore nell'eliminazione delle voci ricorrenti");
    }
  };

  const deleteAllInstallmentExpenses = async (installmentParentId: string) => {
    // The series query is scoped by owner (firestore.rules refuses an unscoped list), so
    // without an owner there is nothing to delete — and no way to ask for it.
    if (!ownerId) return;
    try {
      // Reverse balance effects before bulk-deleting (only the first installment stores linkedCashAssetId)
      const seriesExpenses = await getExpensesByInstallmentParentId(ownerId, installmentParentId);
      for (const exp of seriesExpenses) {
        if (exp.linkedCashAssetId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
      }
      if (user && ownerId && seriesExpenses.some((e) => e.linkedCashAssetId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      }
      const { deleteInstallmentExpenses } = await import('@/lib/services/expenseService');
      await deleteInstallmentExpenses(ownerId, installmentParentId);
      if (user && ownerId) queryClient.invalidateQueries({ queryKey: queryKeys.costCenters.all(ownerId) });
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

  // Account options: accounts that appear in the LISTED rows — the filter narrows the list,
  // so an account that only a scheduled row touches must still be offered.
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

  // A selected account that no longer appears in the period (the user moved to a month with
  // no movement on it) is no filter at all: derived, never reset through an effect.
  const effectiveAccountId = accountOptions.some((a) => a.id === selectedAccountId) ? selectedAccountId : 'all';

  // A list filter is active when the toolbar narrows the inventory — the period is not a filter.
  const hasActiveFilters =
    selectedTypes.length > 0 ||
    selectedCatIds.length > 0 ||
    selectedSubCategoryId !== 'all' ||
    searchQuery !== '' ||
    effectiveAccountId !== 'all';

  // Count of active drawer-internal filters shown on the mobile "Filtri" badge.
  // Period and search are excluded — they are always visible inline on mobile.
  const mobileActiveFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim() !== '') count++;
    if (selectedTypes.length > 0 || selectedCatIds.length > 0) count++;
    if (selectedSubCategoryId !== 'all') count++;
    if (effectiveAccountId !== 'all') count++;
    return count;
  }, [searchQuery, selectedTypes, selectedCatIds, selectedSubCategoryId, effectiveAccountId]);

  // Left to the React Compiler: a manual useMemo here could not be preserved (its inputs are
  // themselves derived) and the skip would have un-memoized the whole component.
  const filteredExpenses = applyListFilters(expenses, {
    selectedTypes,
    selectedCatIds,
    subCategoryId: soloSelectedCategory ? selectedSubCategoryId : 'all',
    searchQuery,
    accountId: effectiveAccountId,
  });

  // The feed shows the first page again whenever the filters change (the stored window
  // belongs to the filters it was opened under).
  const filterKey = JSON.stringify([period, selectedTypes, selectedCatIds, selectedSubCategoryId, searchQuery, effectiveAccountId]);
  const mobileShowCount = feedWindow?.filterKey === filterKey ? feedWindow.count : FEED_PAGE_SIZE;
  const showMore = () => setFeedWindow({ filterKey, count: mobileShowCount + FEED_PAGE_SIZE });

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

  // ─── Tile figures (lib/utils/tracciamentoSummary.ts) and words (cashflowNarrative.ts) ──

  const totals = useMemo(() => summarizePeriodCashflow(expenses), [expenses]);

  // The previous period's totals, for the deltas and the projection's reference; null when
  // the period has no honest predecessor (a custom range).
  const previousTotals = useMemo(() => {
    const previous = previousPeriod(period, now);
    return previous ? summarizePeriodCashflow(filterExpensesByPeriod(allExpenses, previous)) : null;
  }, [allExpenses, period, now]);

  // The delta compares like with like. `totals` spans the whole period — for a year still
  // running that includes months the previous year cannot match — so the percentages are
  // computed on the shared window instead (`describeComparisonPhrase` names it: «su gen–ago
  // 2025»). Only the delta is scoped; every figure the tiles print stays the period's own.
  const comparableTotals = useMemo(() => {
    const window = currentComparisonWindow(period, now);
    return window ? summarizePeriodCashflow(filterExpensesByPeriod(allExpenses, window)) : totals;
  }, [allExpenses, period, now, totals]);
  const delta = useMemo(
    () => (previousTotals ? computePeriodDelta(comparableTotals, previousTotals) : null),
    [comparableTotals, previousTotals],
  );

  const verdict = useMemo(() => buildCashflowVerdict({ period, now, totals, delta, scheduled }), [period, now, totals, delta, scheduled]);
  const comparisonPhrase = describeComparisonPhrase(period, now);
  const previousLabel = describePreviousPeriodLabel(period, now);

  // The income-vs-spending bars: the trailing months for a month, the year's own months for a year.
  const flows = useMemo(() => {
    const window = resolveFlowWindow(period, now, FLOW_MONTHS);
    return buildTrailingMonthFlows(allExpenses, window.endYear, window.endMonth, window.count, now);
  }, [allExpenses, period, now]);
  const anchor = useMemo(() => resolveAnchorMonth(period, now), [period, now]);
  // Only a month is ONE bar of the chart; a year or a range is the whole axis.
  const highlightKey = period.kind === 'month' ? `${anchor.year}-${String(anchor.month).padStart(2, '0')}` : null;

  const savingsHistory = useMemo(
    () => summarizeSavingsHistory(buildTrailingMonthFlows(allExpenses, anchor.year, anchor.month, HISTORY_MONTHS), now),
    [allExpenses, anchor, now],
  );

  // Where spending lands at the current pace — only while the month is still running.
  const calendar = resolvePeriodCalendar(period, now);
  const projection = useMemo((): SpendingProjection | null => {
    const reference = describeProjectionReference(period);
    if (!calendar || !reference) return null;
    // A row dated after today (an instalment, a recurring entry) is neither spent yet nor to
    // be scaled by the days left: it is added as it is.
    const { spentToDate, scheduled } = splitSpendingAtDate(expenses, now);
    const paced = projectMonthEndSpending(spentToDate, calendar.dayOfMonth, calendar.daysInMonth);
    if (paced === null) return null;
    return { projected: paced + scheduled, previousExpenses: previousTotals?.expenses ?? null, previousLabel: reference };
  }, [period, calendar, expenses, now, previousTotals]);

  const expenseRanking = useMemo(() => rankCategories(expenses, 'expenses'), [expenses]);
  const incomeRanking = useMemo(() => rankCategories(expenses, 'income'), [expenses]);

  // The inventory describes what is LISTED: with a filter on, the reading counts the filtered
  // rows. `now` splits them into happened and scheduled — the clause the tiles above need.
  const movementsSummary = useMemo(() => summarizeMovements(filteredExpenses, now), [filteredExpenses, now]);

  if (loading) {
    return (
      <TileGridSkeleton
        cells={SKELETON_CELLS}
        className="pt-1"
        toolbar={<div className="desktop:hidden mx-auto h-9 w-[190px] animate-pulse rounded-md bg-muted" />}
      />
    );
  }

  const feed = (
    <TransactionFeed
      transactions={mobileSortedExpenses}
      now={now}
      totalCount={filteredExpenses.length}
      showCount={mobileShowCount}
      onLoadMore={showMore}
      grouped={mobileSortKey === 'date-desc' || mobileSortKey === 'date-asc'}
      onEdit={handleEditExpense}
      onDelete={handleDeleteExpense}
      isDemo={isDemo}
      hasActiveFilters={hasActiveFilters}
      categoryMetaMap={categoryMetaMap}
      emptyHint="Aggiungi la prima voce per iniziare a tracciare."
      surface="flat"
    />
  );

  // The full breakdown lives on Analisi: the tiles carry the top five and the residual.
  const analisiLink = (
    <Link href="/dashboard/analisi" className="inline-flex items-center gap-1 hover:text-foreground">
      Tutte le categorie in Analisi
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  );

  // The phone's filters sit INSIDE the tile they narrow (the period stays beside the verdict).
  const mobileToolbar = (
    <MobileFiltersDrawer
      showPeriod={false}
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
      selectedAccountId={effectiveAccountId}
      onAccountChange={setSelectedAccountId}
      activeFilterCount={mobileActiveFilterCount}
      onReset={handleResetFilters}
      mobileSortKey={mobileSortKey}
      onSortChange={(v) => setMobileSortKey(v as typeof mobileSortKey)}
      sortOptions={[
        { value: 'date-desc', label: 'Più recente', shortLabel: 'Recente' },
        { value: 'date-asc', label: 'Meno recente', shortLabel: 'Meno rec.' },
        { value: 'amount-desc', label: 'Importo maggiore', shortLabel: '€ decr.' },
        { value: 'amount-asc', label: 'Importo minore', shortLabel: '€ cresc.' },
        { value: 'category-asc', label: 'Categoria A→Z', shortLabel: 'Cat. A→Z' },
      ]}
    />
  );

  // The desktop toolbar of the Movimenti tile: the filters that narrow the list, the view
  // switch and the export. Below `desktop:` the same filters live in MobileFiltersDrawer.
  const movimentiToolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Ricerca testo */}
      <div className="relative min-w-[160px] flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cerca note, categorie, importo..."
          className="h-9 pr-8 pl-8 text-sm"
          aria-label="Cerca nelle note, categoria, sottocategoria o importo"
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

      {/* Categorie */}
      <div className="min-w-[180px] flex-1">
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

      {/* Sottocategoria — only when a single category is selected */}
      {soloSelectedCategory && subCategoryOptions.length > 0 && (
        <div className="w-[160px] shrink-0">
          <Select value={selectedSubCategoryId} onValueChange={setSelectedSubCategoryId}>
            <SelectTrigger id="filter-subcategory" aria-label="Filtra per sottocategoria" className="w-full">
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
        <div className="w-[160px] shrink-0">
          <Select value={effectiveAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger id="filter-account" aria-label="Filtra per conto corrente" className="w-full">
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

      {/* Ordina — feed only; the table sorts via its own column headers. */}
      {desktopListView === 'feed' && (
        <div className="w-[150px] shrink-0">
          <Select value={mobileSortKey} onValueChange={(v) => setMobileSortKey(v as typeof mobileSortKey)}>
            <SelectTrigger aria-label="Ordina movimenti" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Più recente</SelectItem>
              <SelectItem value="date-asc">Meno recente</SelectItem>
              <SelectItem value="amount-desc">Importo maggiore</SelectItem>
              <SelectItem value="amount-asc">Importo minore</SelectItem>
              <SelectItem value="category-asc">Categoria A→Z</SelectItem>
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

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Feed (default, shared with mobile) vs the dense table for power users. */}
        <SegmentedControl
          options={[
            { value: 'feed', label: 'Feed' },
            { value: 'table', label: 'Tabella' },
          ]}
          value={desktopListView}
          onChange={setDesktopListView}
          aria-label="Vista elenco movimenti"
          className="w-[150px]"
        />
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
  );

  return (
    <div className="space-y-4">
      {/* ── Verdict, with the one period axis beside it on desktop ──────────────── */}
      <div className="flex items-start justify-between gap-6 pt-1">
        <PageVerdict verdict={verdict} ariaLabel="Verdetto del periodo" />
        <div className="desktop:block hidden">
          <PeriodPicker value={period} onChange={setPeriod} availableYears={availableYears} className="shrink-0" />
        </div>
      </div>

      {/* ── Below desktop: the period (the page's axis) under the verdict, plus the landscape
          add button (the portrait FAB in the bottom nav is the only «add» there) ────── */}
      <div className="desktop:hidden flex flex-wrap items-center justify-center gap-2">
        <PeriodPicker value={period} onChange={setPeriod} availableYears={availableYears} className="shrink-0 max-w-[190px]" />
        <Button
          size="sm"
          onClick={handleAddExpense}
          disabled={isDemo}
          aria-label={isDemo ? 'Aggiungi — non disponibile in modalità demo' : 'Aggiungi voce'}
          title={isDemo ? 'Non disponibile in modalità demo' : undefined}
          className="max-desktop:portrait:hidden h-9 shrink-0"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Aggiungi
        </Button>
      </div>

      {/* ── Tile grid ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2 desktop:grid-cols-12">
        <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-5 desktop:row-span-2')}>
          <CashflowPeriodoTile
            eyebrow={`Cashflow · ${periodLabel(period)}`}
            aside={
              calendar ? (
                <span className="font-mono tabular-nums">
                  giorno {calendar.dayOfMonth} di {calendar.daysInMonth}
                </span>
              ) : undefined
            }
            reading={describePeriodCashflow(totals, delta, comparisonPhrase)}
            totals={totals}
            delta={delta}
            previousLabel={previousLabel}
            flows={flows}
            highlightKey={highlightKey}
            windowLabel={describeFlowWindow(flows, period.kind === 'year' || period.kind === 'ytd', now)}
            projection={projection}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-4')}>
          <CategoryTile
            eyebrow="Spese per categoria"
            total={expenseRanking.total}
            categories={expenseRanking.rows}
            reading={describeCategoryShare(expenseRanking, 'expenses')}
            color="var(--chart-1)"
            emptyCopy="Nessuna spesa registrata nel periodo."
            footer={analisiLink}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'desktop:col-span-3')}>
          <CategoryTile
            eyebrow="Entrate per categoria"
            total={incomeRanking.total}
            categories={incomeRanking.rows}
            reading={describeCategoryShare(incomeRanking, 'income')}
            color="var(--chart-2)"
            emptyCopy="Nessuna entrata registrata nel periodo."
            labelClassName="w-[72px]"
            footer={analisiLink}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-7')}>
          <RisparmioTile
            history={savingsHistory}
            aside={describeMonthWindow(savingsHistory.months, now)}
            reading={describeSavingsHistory(savingsHistory)}
            footer={describeDeficitMonths(savingsHistory, now)}
            highlightKey={highlightKey}
          />
        </div>

        <div className={cn(TILE_CELL_CLASS, 'tablet:col-span-2 desktop:col-span-12')}>
          <MovimentiTile
            aside={describeMovementsCount(filteredExpenses.length, expenses.length)}
            reading={describeMovements(movementsSummary)}
            toolbar={movimentiToolbar}
            mobileToolbar={mobileToolbar}
          >
            {desktopListView === 'feed' ? (
              feed
            ) : (
              <>
                {/* The table is a desktop view: below `desktop:` the switch is not offered, so the feed renders. */}
                <div className="hidden desktop:block">
                  <ExpenseTable
                    expenses={filteredExpenses}
                    now={now}
                    onEdit={handleEditExpense}
                    onRefresh={onRefresh}
                    isDemo={isDemo}
                    hasActiveFilters={hasActiveFilters}
                    categories={categories}
                  />
                </div>
                <div className="desktop:hidden">{feed}</div>
              </>
            )}
          </MovimentiTile>
        </div>
      </div>

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
