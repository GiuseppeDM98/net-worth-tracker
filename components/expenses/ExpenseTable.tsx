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

import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import {
  deleteExpense,
  deleteRecurringExpenses,
  deleteInstallmentExpenses,
  getExpensesByRecurringParentId,
  getExpensesByInstallmentParentId,
} from '@/lib/services/expenseService';
import { updateCashAssetBalance } from '@/lib/services/assetService';
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
import { Edit, Trash2, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, ExternalLink, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

const ITEMS_PER_PAGE = 10;

interface ExpenseTableProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onRefresh: () => void;
}

export function ExpenseTable({ expenses, onEdit, onRefresh }: ExpenseTableProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ========== State Management ==========

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'asc' | 'desc' | null>(null);

  // ========== Formatting Utilities ==========

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(Math.abs(amount));
  };

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
  const handleDelete = async (expense: Expense) => {
    // Check if this is an installment expense
    if (expense.isInstallment && expense.installmentParentId) {
      const confirmMessage = `Questa è la rata ${expense.installmentNumber}/${expense.installmentTotal}. Vuoi eliminare:\n\n` +
        `[SOLO QUESTA RATA] - Solo questa rata singola\n` +
        `[TUTTE LE RATE] - Tutte le ${expense.installmentTotal} rate\n\n` +
        `Clicca OK per eliminare solo questa rata, Annulla per tornare indietro.`;

      const deleteSingle = window.confirm(confirmMessage);

      if (deleteSingle) {
        await deleteSingleExpense(expense);
      } else {
        const deleteAll = window.confirm(
          `Vuoi eliminare TUTTE le ${expense.installmentTotal} rate?`
        );
        if (deleteAll) {
          await deleteAllInstallmentExpenses(expense.installmentParentId);
        }
      }
    }
    // Check if this is a recurring expense
    else if (expense.isRecurring && expense.recurringParentId) {
      const confirmMessage = `Questa è una voce ricorrente. Vuoi eliminare:\n\n` +
        `[SOLO QUESTA] - Solo questa voce singola\n` +
        `[TUTTE] - Tutte le voci ricorrenti correlate\n\n` +
        `Clicca OK per eliminare solo questa, Annulla per tornare indietro.`;

      const deleteSingle = window.confirm(confirmMessage);

      if (deleteSingle) {
        await deleteSingleExpense(expense);
      } else {
        const deleteAll = window.confirm(
          'Vuoi eliminare TUTTE le voci ricorrenti correlate?'
        );
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
      setDeletingId(expense.id);
      // Reverse the balance effect on the linked cash asset before deleting
      if (expense.linkedCashAssetId) {
        await updateCashAssetBalance(expense.linkedCashAssetId, -expense.amount);
        if (user) queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
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
      if (user && seriesExpenses.some(e => e.linkedCashAssetId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
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
      if (user && seriesExpenses.some(e => e.linkedCashAssetId)) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) });
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

  const getTypeBadgeColor = (type: ExpenseType): string => {
    switch (type) {
      case 'income':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'fixed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'variable':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'debt':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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
  const totalPages = Math.ceil(expenses.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;

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
    if (sortBy === null) {
      return expenses; // No sort: keep date order from parent
    }

    const sorted = [...expenses]; // Copy to avoid mutation
    sorted.sort((a, b) => {
      return sortBy === 'desc' ? b.amount - a.amount : a.amount - b.amount;
    });

    return sorted;
  }, [expenses, sortBy]);

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
  }, [expenses.length, sortBy]);

  /**
   * Why reset sort when expenses array changes?
   *
   * The expenses prop is pre-filtered by parent (e.g., by month, type, category).
   * When filters change, user likely wants to see the new filtered data in default
   * date order, not in whatever sort state was previously active. Clearing sort
   * provides a predictable "reset" behavior when switching filters.
   */
  useEffect(() => {
    setSortBy(null);
  }, [expenses]);

  const handlePreviousPage = () => {
    setCurrentPage((prev: number) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev: number) => Math.min(totalPages, prev + 1));
  };

  // ========== Event Handlers ==========

  /**
   * Handle amount column header click to cycle through sort states.
   * Cycle: null → desc → asc → null
   */
  const handleSortByAmount = () => {
    setSortBy(prevSort => {
      if (prevSort === null) return 'desc'; // First click: high to low
      if (prevSort === 'desc') return 'asc'; // Second click: low to high
      return null; // Third click: reset to date order
    });
  };

  // ========== Render ==========

  if (expenses.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-muted-foreground">Nessuna voce trovata</p>
        <p className="text-sm text-muted-foreground mt-2">
          Clicca su "Nuova Spesa" per aggiungere la prima voce
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          {/* ========== Table Header ========== */}
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Data</TableHead>
              <TableHead className="w-[120px]">Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Sotto-categoria</TableHead>
              <TableHead className="text-right w-[120px]">
                <button
                  onClick={handleSortByAmount}
                  className="flex items-center justify-end gap-1 cursor-pointer hover:text-foreground transition-colors w-full"
                  aria-label="Ordina per importo"
                >
                  <span>Importo</span>
                  {sortBy === 'desc' && <ArrowDown className="h-4 w-4 text-muted-foreground" />}
                  {sortBy === 'asc' && <ArrowUp className="h-4 w-4 text-muted-foreground" />}
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
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getTypeBadgeColor(
                    expense.type
                  )}`}
                >
                  {getTypeLabel(expense.type)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {expense.categoryName}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {expense.subCategoryName || '-'}
              </TableCell>
              <TableCell className="text-right font-medium">
                <div
                  className={`flex items-center justify-end gap-1 ${
                    expense.type === 'income' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {expense.type === 'income' ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                  <span>{formatCurrency(expense.amount)}</span>
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
                    className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800"
                    title="Apri link"
                  >
                    <ExternalLink className="h-4 w-4" />
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
                    disabled={deletingId === expense.id || deletingId === expense.recurringParentId || deletingId === expense.installmentParentId}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(expense)}
                    disabled={deletingId === expense.id || deletingId === expense.recurringParentId || deletingId === expense.installmentParentId}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>

    {/* Pagination Controls */}
    {totalPages > 1 && (
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-muted-foreground">
          Visualizzate {startIndex + 1}-{Math.min(endIndex, expenses.length)} di {expenses.length} voci
        </div>
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
          <div className="text-sm font-medium">
            Pagina {currentPage} di {totalPages}
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
      </div>
    )}
  </div>
  );
}
