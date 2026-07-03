'use client';

/**
 * ExpenseTable Component
 *
 * Paginated, sortable table for displaying and managing expense entries.
 *
 * Features:
 * - Pagination: 10 items per page with navigation controls
 * - Sortable Amount Column: 3-state cycle (none → desc → asc → none)
 * - Smart Deletion: Handles three deletion types with confirmation dialogs
 *   1. Single expense deletion
 *   2. Recurring expense series deletion (delete one or delete all)
 *   3. Installment series deletion (delete one or delete all)
 * - Visual Indicators: Icons for recurring expenses, badges for installments, colored amounts
 * - External Links: Clickable icons for expense attachments
 *
 * Pagination Behavior:
 * - Resets to page 1 when data changes (add/delete) or sort changes
 * - Maintains current page when navigating back from edit dialog
 *
 * @param expenses - Array of expenses to display (pre-filtered by parent)
 * @param onEdit - Callback to open edit dialog for an expense
 * @param onRefresh - Callback to refresh expense list after deletion
 */

import { useState, useMemo, useEffect, Suspense } from 'react';
import { formatCurrency } from '@/lib/utils/formatters';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { Expense, ExpenseCategory, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { getLazyIcon } from '@/components/expenses/IconPickerPopover';
import {
  deleteExpense,
  deleteRecurringExpenses,
  deleteInstallmentExpenses,
  getExpensesByRecurringParentId,
  getExpensesByInstallmentParentId,
} from '@/lib/services/expenseService';
import { updateCashAssetBalance } from '@/lib/services/assetService';
import { reconcileTransferDelete } from '@/lib/services/cashBalanceReconciliation';
import { queryKeys } from '@/lib/query/queryKeys';
import { Timestamp } from 'firebase/firestore';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Edit, Trash2, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, ExternalLink, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

interface ExpenseTableProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onRefresh: () => void;
  isDemo?: boolean;
  hasActiveFilters?: boolean;
  categories?: ExpenseCategory[];
}

export function ExpenseTable({ expenses, onEdit, onRefresh, isDemo = false, hasActiveFilters = false, categories = [] }: ExpenseTableProps) {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const queryClient = useQueryClient();

  // categoryId → { icon, color } for icon display in the category cell
  const categoryMetaMap = useMemo(
    () => new Map(categories.map(c => [c.id, { icon: c.icon, color: c.color }])),
    [categories]
  );

  // ========== State Management ==========

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSizeOption>(20);
  // Multi-column sort: col determines which column, dir the direction
  const [sortCol, setSortCol] = useState<'amount' | 'date' | 'category' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    expense: Expense | null;
    mode: 'simple' | 'installment' | 'recurring' | null;
  }>({ open: false, expense: null, mode: null });

  // ========== Formatting Utilities ==========

  const formatDate = (date: Date | string | Timestamp): string => {
    const dateObj = date instanceof Date ? date : (date instanceof Timestamp ? date.toDate() : new Date(date));
    return format(dateObj, 'dd/MM/yyyy', { locale: it });
  };

  // ========== Delete Handlers ==========

  /**
   * Teacher Comment: Three Types of Expense Deletion
   *
   * The system supports three distinct deletion flows:
   *
   * 1. Installment Expenses (isInstallment && installmentParentId):
   *    - Created when user splits a purchase into multiple monthly payments
   *    - Each installment is a separate expense with shared installmentParentId
   *    - User can delete single installment OR all installments in the series
   *    - Example: User bought a €300 item in 3 installments of €100 each
   *
   * 2. Recurring Expenses (isRecurring && recurringParentId):
   *    - Created when user wants same expense repeated for N months
   *    - Each month is a separate expense with shared recurringParentId
   *    - User can delete single month OR all months in the series
   *    - Example: User created 12 monthly gym membership payments
   *
   * 3. Regular Expenses:
   *    - Single, standalone expense with no series relationship
   *    - Simple confirmation and deletion
   *
   * Why two-step confirmation for series deletion?
   * First confirm deletes single item (safe default), second confirm required
   * for batch deletion to prevent accidental data loss.
   */
  const handleDelete = (expense: Expense) => {
    if (expense.isInstallment && expense.installmentParentId) {
      setDeleteDialog({ open: true, expense, mode: 'installment' });
    } else if (expense.isRecurring && expense.recurringParentId) {
      setDeleteDialog({ open: true, expense, mode: 'recurring' });
    } else {
      setDeleteDialog({ open: true, expense, mode: 'simple' });
    }
  };

  const deleteSingleExpense = async (expense: Expense) => {
    try {
      setDeletingId(expense.id);
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
      await deleteExpense(expense.id);
      toast.success('Voce eliminata con successo');
      onRefresh();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Errore nell\'eliminazione della voce');
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAllRecurringExpenses = async (recurringParentId: string) => {
    try {
      setDeletingId(recurringParentId);
      // Reverse balance effects before bulk-deleting (only the first entry stores linkedCashAssetId)
      const seriesExpenses = await getExpensesByRecurringParentId(recurringParentId);
      for (const exp of seriesExpenses) {
        if (exp.linkedCashAssetId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
      }
      if (user && ownerId && seriesExpenses.some(e => e.linkedCashAssetId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      }
      await deleteRecurringExpenses(recurringParentId);
      toast.success('Tutte le voci ricorrenti sono state eliminate');
      onRefresh();
    } catch (error) {
      console.error('Error deleting recurring expenses:', error);
      toast.error('Errore nell\'eliminazione delle voci ricorrenti');
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAllInstallmentExpenses = async (installmentParentId: string) => {
    try {
      setDeletingId(installmentParentId);
      // Reverse balance effects before bulk-deleting (only the first installment stores linkedCashAssetId)
      const seriesExpenses = await getExpensesByInstallmentParentId(installmentParentId);
      for (const exp of seriesExpenses) {
        if (exp.linkedCashAssetId) {
          await updateCashAssetBalance(exp.linkedCashAssetId, -exp.amount);
        }
      }
      if (user && ownerId && seriesExpenses.some(e => e.linkedCashAssetId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      }
      await deleteInstallmentExpenses(installmentParentId);
      toast.success('Tutte le rate sono state eliminate');
      onRefresh();
    } catch (error) {
      console.error('Error deleting installment expenses:', error);
      toast.error('Errore nell\'eliminazione delle rate');
    } finally {
      setDeletingId(null);
    }
  };

  const getTypeLabel = (type: ExpenseType): string => {
    return EXPENSE_TYPE_LABELS[type];
  };

  // When all visible expenses share the same type, the badge adds no information.
  // Compute the set of distinct types in the full (non-paginated) filtered list
  // so the column stays consistent as the user pages through.
  const uniqueExpenseTypes = useMemo(
    () => new Set(expenses.map(e => e.type)),
    [expenses],
  );
  const singleType = uniqueExpenseTypes.size === 1;

  // Badge colors keyed by expense type — theme-aware via CSS variable references.
  // chart-1: income (green-toned in most themes), chart-2: fixed, chart-4: variable, chart-3: debt.
  // color-mix() at 12% for background, 35% for border; text uses the raw chart var directly.
  const getTypeBadgeColor = (type: ExpenseType): string => {
    switch (type) {
      case 'income':
        return 'bg-[color-mix(in_oklch,var(--chart-1)_12%,transparent)] border-[color-mix(in_oklch,var(--chart-1)_35%,transparent)] text-[var(--chart-1)]';
      case 'fixed':
        return 'bg-[color-mix(in_oklch,var(--chart-2)_12%,transparent)] border-[color-mix(in_oklch,var(--chart-2)_35%,transparent)] text-[var(--chart-2)]';
      case 'variable':
        return 'bg-[color-mix(in_oklch,var(--chart-4)_12%,transparent)] border-[color-mix(in_oklch,var(--chart-4)_35%,transparent)] text-[var(--chart-4)]';
      case 'debt':
        return 'bg-[color-mix(in_oklch,var(--chart-3)_12%,transparent)] border-[color-mix(in_oklch,var(--chart-3)_35%,transparent)] text-[var(--chart-3)]';
      case 'transfer':
        return 'bg-[color-mix(in_oklch,var(--chart-5)_12%,transparent)] border-[color-mix(in_oklch,var(--chart-5)_35%,transparent)] text-[var(--chart-5)]';
      default:
        return 'bg-muted border-border text-muted-foreground';
    }
  };

  // ========== Pagination and Sorting Logic ==========

  /**
   * Teacher Comment: Pagination Calculation
   *
   * Pagination uses offset-based slicing:
   * - ITEMS_PER_PAGE = 10 (constant)
   * - totalPages = ceil(totalItems / 10)
   * - startIndex = (currentPage - 1) * 10
   * - endIndex = startIndex + 10
   *
   * Example: 25 expenses, page 2
   * - totalPages = ceil(25 / 10) = 3
   * - startIndex = (2 - 1) * 10 = 10
   * - endIndex = 10 + 10 = 20
   * - slice(10, 20) returns items 10-19 (indices), showing expenses 11-20 (1-indexed)
   */
  const totalPages = Math.ceil(expenses.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  /**
   * Teacher Comment: Three-State Sorting Cycle
   *
   * Amount column cycles through three states when clicked:
   * 1. null (no sort) → Shows expenses in original date order
   * 2. 'desc' (high to low) → Largest expenses first
   * 3. 'asc' (low to high) → Smallest expenses first
   * 4. Click again → back to null
   *
   * Why three states instead of two?
   * Users may want to see the original date-ordered list without sorting by amount.
   * A third "reset" state lets them return to the default view.
   */
  const sortedExpenses = useMemo(() => {
    if (sortCol === null) return expenses;
    return [...expenses].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'amount') {
        cmp = Math.abs(b.amount) - Math.abs(a.amount);
      } else if (sortCol === 'date') {
        cmp = getExpenseDate(b.date).getTime() - getExpenseDate(a.date).getTime();
      } else if (sortCol === 'category') {
        cmp = b.categoryName.localeCompare(a.categoryName, 'it');
      }
      return sortDir === 'desc' ? cmp : -cmp;
    });
  }, [expenses, sortCol, sortDir]);

  // Paginate sorted expenses
  const paginatedExpenses = useMemo(() => {
    return sortedExpenses.slice(startIndex, endIndex);
  }, [sortedExpenses, startIndex, endIndex]);

  /**
   * Why reset to page 1 when expenses.length or sortBy changes?
   *
   * - If expenses.length changes (add/delete), staying on page 3 might show empty results
   * - If sort changes, the "page 3" items are now completely different items, confusing UX
   *
   * Better to reset to page 1 so user sees the top of the newly sorted/filtered list.
   */
  useEffect(() => {
    setCurrentPage(1);
  }, [expenses.length, sortCol, sortDir, pageSize]);

  /**
   * Why reset sort when expenses array changes?
   *
   * The expenses prop is pre-filtered by parent (e.g., by month, type, category).
   * When filters change, user likely wants to see the new filtered data in default
   * date order, not in whatever sort state was previously active. Clearing sort
   * provides a predictable "reset" behavior when switching filters.
   */
  useEffect(() => {
    setSortCol(null);
  }, [expenses.length]);

  const handlePreviousPage = () => {
    setCurrentPage((prev: number) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev: number) => Math.min(totalPages, prev + 1));
  };

  // ========== Event Handlers ==========

  /**
   * Multi-column sort handler.
   * Click a new column: activates it with its default direction.
   * Click active column: flips direction. Click again: resets.
   * Default directions: amount=desc (high→low), date=desc (newest→oldest), category=asc (A→Z).
   */
  const handleSort = (col: 'amount' | 'date' | 'category') => {
    const defaultDir: 'asc' | 'desc' = col === 'category' ? 'asc' : 'desc';
    if (sortCol !== col) {
      setSortCol(col);
      setSortDir(defaultDir);
    } else if (sortDir === defaultDir) {
      setSortDir(defaultDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(null);
    }
  };


  // ========== Render ==========

  if (expenses.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-muted-foreground">Nessuna voce trovata</p>
        <p className="text-sm text-muted-foreground mt-2">
          {hasActiveFilters
            ? 'Nessun risultato per i filtri applicati. Prova ad azzerare i filtri.'
            : 'Clicca su "Nuova Spesa" per aggiungere la prima voce'}
        </p>
      </div>
    );
  }

  const table = (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          {/* ========== Table Header ========== */}
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">
                <button
                  onClick={() => handleSort('date')}
                  className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
                  aria-label="Ordina per data"
                  type="button"
                >
                  <span>Data</span>
                  {sortCol === 'date' ? (
                    sortDir === 'desc'
                      ? <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-[120px]">Tipo</TableHead>
              <TableHead>
                <button
                  onClick={() => handleSort('category')}
                  className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
                  aria-label="Ordina per categoria"
                  type="button"
                >
                  <span>Categoria</span>
                  {sortCol === 'category' ? (
                    sortDir === 'desc'
                      ? <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </button>
              </TableHead>
              <TableHead>Sottocategoria</TableHead>
              <TableHead className="text-right w-[120px]">
                <button
                  onClick={() => handleSort('amount')}
                  className="flex items-center justify-end gap-1 cursor-pointer hover:text-foreground transition-colors w-full"
                  aria-label="Ordina per importo"
                  type="button"
                >
                  <span>Importo</span>
                  {sortCol === 'amount' ? (
                    sortDir === 'desc'
                      ? <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                      : <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                </button>
              </TableHead>
              <TableHead className="max-w-[200px]">Note</TableHead>
              <TableHead className="w-[50px] text-center">Link</TableHead>
              <TableHead className="w-[100px] text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>

          {/* ========== Table Body ========== */}
          <TableBody>
            {paginatedExpenses.map((expense: Expense) => (
            <TableRow key={expense.id}>
              <TableCell className="font-medium text-sm">
                <div className="flex items-center gap-1">
                  {formatDate(expense.date)}
                  {expense.isRecurring && (
                    <Calendar className="h-3 w-3 text-muted-foreground" aria-label="Voce ricorrente" />
                  )}
                </div>
              </TableCell>
              <TableCell>
                {singleType ? (
                  <span className="text-xs text-muted-foreground">
                    {getTypeLabel(expense.type)}
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getTypeBadgeColor(
                      expense.type
                    )}`}
                  >
                    {getTypeLabel(expense.type)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {(() => {
                    const meta = categoryMetaMap.get(expense.categoryId);
                    const CatIcon = meta?.icon ? getLazyIcon(meta.icon) : null;
                    if (CatIcon) {
                      return (
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: meta?.color ? `${meta.color}20` : 'var(--muted)' }}
                        >
                          <Suspense fallback={null}>
                            <CatIcon className="w-3 h-3" style={{ color: meta?.color || 'var(--muted-foreground)' }} aria-hidden="true" />
                          </Suspense>
                        </div>
                      );
                    }
                    if (meta?.color) {
                      return (
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: meta.color }}
                        />
                      );
                    }
                    return null;
                  })()}
                  {expense.categoryName}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {expense.subCategoryName || '-'}
              </TableCell>
              <TableCell className="text-right font-medium">
                <div
                  className={`flex items-center justify-end gap-1 ${
                    expense.type === 'income'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-destructive'
                  }`}
                >
                  {expense.type === 'income' ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  <span>{formatCurrency(Math.abs(expense.amount))}</span>
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="truncate">{expense.notes || '-'}</span>
                  {expense.isInstallment && (
                    <Badge variant="outline" className="flex-shrink-0 text-xs">
                      Rata {expense.installmentNumber}/{expense.installmentTotal}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                {expense.link && (
                  <a
                    href={expense.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center text-primary hover:text-primary/70 transition-colors"
                    aria-label="Apri link esterno"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(expense)}
                    // Why disable during deletion: Prevents concurrent edit/delete operations
                    // that could cause data inconsistency or race conditions
                    disabled={isDemo || deletingId === expense.id || deletingId === expense.recurringParentId || deletingId === expense.installmentParentId}
                    aria-label={isDemo ? 'Modifica — non disponibile in modalità demo' : 'Modifica voce'}
                    title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(expense)}
                    disabled={isDemo || deletingId === expense.id || deletingId === expense.recurringParentId || deletingId === expense.installmentParentId}
                    aria-label={isDemo ? 'Elimina — non disponibile in modalità demo' : 'Elimina voce'}
                    title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    {/* Pagination Controls */}
    {expenses.length > 0 && (
      <div className="flex flex-wrap items-center justify-between gap-3 px-2">
        {/* Left: rows-per-page selector + count */}
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <span className="hidden sm:inline shrink-0">Righe per pagina</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v) as PageSizeOption)}
          >
            <SelectTrigger
              className="h-8 w-[70px] text-sm"
              aria-label="Righe per pagina"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(n => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="shrink-0 tabular-nums">
            {startIndex + 1}-{Math.min(endIndex, expenses.length)} di {expenses.length}
          </span>
        </div>

        {/* Right: prev / page indicator / next */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreviousPage}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Precedente
            </Button>
            <div className="text-sm font-medium tabular-nums">
              {currentPage} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
            >
              Successiva
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    )}
  </div>
  );

  return (
    <>
      {table}

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog({ open: false, expense: null, mode: null });
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteDialog.mode === 'installment'
                ? 'Elimina rata'
                : deleteDialog.mode === 'recurring'
                ? 'Elimina voce ricorrente'
                : 'Elimina voce'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog.mode === 'installment' && deleteDialog.expense
                ? `Questa è la rata ${deleteDialog.expense.installmentNumber}/${deleteDialog.expense.installmentTotal}. Vuoi eliminare solo questa rata o tutte le ${deleteDialog.expense.installmentTotal} rate?`
                : deleteDialog.mode === 'recurring'
                ? 'Questa è una voce ricorrente. Vuoi eliminare solo questa voce o tutte le occorrenze correlate?'
                : deleteDialog.expense?.notes
                ? `Sei sicuro di voler eliminare questa voce?\n\n“${deleteDialog.expense.notes}”`
                : 'Sei sicuro di voler eliminare questa voce?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            {(deleteDialog.mode === 'installment' || deleteDialog.mode === 'recurring') && (
              <Button
                variant="outline"
                disabled={!!deletingId}
                onClick={async () => {
                  if (deleteDialog.expense) {
                    await deleteSingleExpense(deleteDialog.expense);
                  }
                  setDeleteDialog({ open: false, expense: null, mode: null });
                }}
              >
                Solo questa
              </Button>
            )}
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingId}
              onClick={async (e) => {
                e.preventDefault(); // Prevent AlertDialog from auto-closing
                const exp = deleteDialog.expense;
                if (!exp) return;
                if (deleteDialog.mode === 'installment' && exp.installmentParentId) {
                  await deleteAllInstallmentExpenses(exp.installmentParentId);
                } else if (deleteDialog.mode === 'recurring' && exp.recurringParentId) {
                  await deleteAllRecurringExpenses(exp.recurringParentId);
                } else {
                  await deleteSingleExpense(exp);
                }
                setDeleteDialog({ open: false, expense: null, mode: null });
              }}
            >
              {deleteDialog.mode === 'installment'
                ? `Tutte le ${deleteDialog.expense?.installmentTotal ?? ''} rate`
                : deleteDialog.mode === 'recurring'
                ? 'Tutte le ricorrenti'
                : 'Elimina'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
