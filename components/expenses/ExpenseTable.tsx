'use client';

import { useState, useMemo, useEffect } from 'react';
import { Expense, ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { deleteExpense, deleteRecurringExpenses, deleteInstallmentExpenses } from '@/lib/services/expenseService';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState<'asc' | 'desc' | null>(null);

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

  const handleDelete = async (expense: Expense) => {
    // Check if this is an installment expense
    if (expense.isInstallment && expense.installmentParentId) {
      const confirmMessage = `Questa è la rata ${expense.installmentNumber}/${expense.installmentTotal}. Vuoi eliminare:\n\n` +
        `[SOLO QUESTA RATA] - Solo questa rata singola\n` +
        `[TUTTE LE RATE] - Tutte le ${expense.installmentTotal} rate\n\n` +
        `Clicca OK per eliminare solo questa rata, Annulla per tornare indietro.`;

      const deleteSingle = window.confirm(confirmMessage);

      if (deleteSingle) {
        await deleteSingleExpense(expense.id, expense.notes || 'questa voce');
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
        await deleteSingleExpense(expense.id, expense.notes || 'questa voce');
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
        await deleteSingleExpense(expense.id, expense.notes || 'questa voce');
      }
    }
  };

  const deleteSingleExpense = async (expenseId: string, description: string) => {
    try {
      setDeletingId(expenseId);
      await deleteExpense(expenseId);
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

  // Calculate pagination
  const totalPages = Math.ceil(expenses.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;

  // Sort expenses based on sortBy state
  const sortedExpenses = useMemo(() => {
    if (sortBy === null) {
      return expenses; // No sort: keep date order
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

  // Reset to page 1 when expenses array length changes (add/delete) or sort changes
  useEffect(() => {
    setCurrentPage(1);
  }, [expenses.length, sortBy]);

  // Reset sort when expenses change (new filters applied)
  useEffect(() => {
    setSortBy(null);
  }, [expenses]);

  const handlePreviousPage = () => {
    setCurrentPage((prev: number) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev: number) => Math.min(totalPages, prev + 1));
  };

  const handleSortByAmount = () => {
    setSortBy(prevSort => {
      if (prevSort === null) return 'desc';
      if (prevSort === 'desc') return 'asc';
      return null; // Reset to no sort
    });
  };

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
