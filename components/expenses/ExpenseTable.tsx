'use client';

/**
 * ExpenseTable — the dense «Tabella» view of the Movimenti tile (desktop only; the feed is the
 * default and the only view below `desktop:`).
 *
 * - Pagination: 20 rows by default, 10 · 20 · 50 · 100 offered
 * - Sort: three columns (date, category, amount), each a three-state cycle
 * - Delete: a plain row is a two-click confirm ON the row (`useArmedDelete`, no timer, the row
 *   prints the consequence — «il conto viene riaccreditato di 373,81 €» — beside a compact
 *   «Conferma»); a row of an instalment plan or a recurring series opens `SeriesDeleteDialog`,
 *   the one question a series adds («solo questa o tutte?»). Until 2026-09-14 every delete went
 *   through a raw `AlertDialog` that asked «Sei sicuro?» and named neither the row nor the balance
 *   it moved back (one of the eight surfaces then outside the modal vocabulary — DESIGN.md → §5 Modal, Coverage).
 * - Every figure is mono (the Mono Mandate): dates and amounts share one tabular column each.
 *
 * Pagination behaviour: page 1 again when the list changes (add/delete/filter) or the sort or
 * page size changes; the page survives an edit.
 */

import { useState, useMemo, useRef, useEffect, useCallback, Suspense } from 'react';
import { formatCurrency } from '@/lib/utils/formatters';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { Expense, ExpenseCategory, EXPENSE_TYPE_LABELS } from '@/types/expenses';
import { LAZY_CATEGORY_ICONS } from '@/components/expenses/IconPickerPopover';
import {
  deleteExpenseRows,
  getTransferFeeOf,
  deleteRecurringExpenses,
  deleteInstallmentExpenses,
  getExpensesByRecurringParentId,
  getExpensesByInstallmentParentId,
} from '@/lib/services/expenseService';
import { reverseAppliedBalances } from '@/lib/services/cashBalanceReconciliation';
import { rowsDeletedWith } from '@/lib/utils/transferFee';
import { queryKeys } from '@/lib/query/queryKeys';
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
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, Trash2, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight, ExternalLink, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import { isScheduledRow } from '@/lib/utils/tracciamentoSummary';
import { resolveOwnerLabel } from '@/lib/utils/movementsOwnerFilter';
import { describeExpenseDeleteConsequence } from '@/lib/utils/dialogNarrative';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
import { EXPENSE_TYPE_BADGE_CLASS } from '@/lib/constants/expenseTypeColors';
import { SeriesDeleteDialog, resolveSeriesDeleteMode, type SeriesDeleteRequest } from '@/components/expenses/SeriesDeleteDialog';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

/** Every figure of the table in the mono face, tabular, at the table's 13px. */
const FIGURE_CLASS = 'font-mono text-[13px] tabular-nums';

interface ExpenseTableProps {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onRefresh: () => void;
  isDemo?: boolean;
  hasActiveFilters?: boolean;
  categories?: ExpenseCategory[];
  /**
   * The page's clock. Rows dated after it are marked «in calendario» and lose the sign
   * colour on their amount: the list carries scheduled rows (instalments, recurring
   * occurrences) that the figures above it do not count. Omitted → nothing is marked.
   */
  now?: Date;
  /**
   * memberId → name for the owner chip (Cashflow › Divisione); null or omitted when the feature
   * is off, so no row is labelled by a feature the account does not use.
   */
  memberNames?: Map<string, string> | null;
}

// ─── The row ──────────────────────────────────────────────────────────────────

interface ExpenseTableRowProps {
  expense: Expense;
  scheduled: boolean;
  ownerLabel: string | null;
  /** Every listed row shares one type: the badge adds nothing and gives way to plain text. */
  singleType: boolean;
  categoryMeta: { icon?: string; color?: string } | undefined;
  isDemo: boolean;
  /** A delete touching this row (or its series) is in flight. */
  busy: boolean;
  onEdit: (expense: Expense) => void;
  /** A plain row: called by the row's own armed confirm. A series row: opens the series modal. */
  onDelete: (expense: Expense) => void;
  /** The table's one live region: arm and disarm are sentences, spoken there. */
  announce: (text: string) => void;
}

/**
 * A module-level row, because the armed state of its delete lives here: the button stays a
 * compact «Conferma» and the ROW prints what the second press does to the account (AGENTS.md →
 * Accessibility, the Versamenti precedent). A row of a series does not arm — its first click
 * opens the question the series adds — and says so in its name.
 */
function ExpenseTableRow({ expense, scheduled, ownerLabel, singleType, categoryMeta, isDemo, busy, onEdit, onDelete, announce }: ExpenseTableRowProps) {
  const rowName = expense.notes?.trim() || expense.categoryName;
  const isSeries = resolveSeriesDeleteMode(expense) !== null;
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick: onArmedClick, onBlur } = useArmedDelete(deleteRef, () => onDelete(expense));
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per eliminare ${rowName}`);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Eliminazione annullata');
    }
  }, [armed, announce, rowName]);

  const consequence = armed
    ? describeExpenseDeleteConsequence({ type: expense.type, amount: expense.amount, hasAccount: !!expense.linkedCashAssetId, hasFee: !!expense.transferFeeExpenseId })
    : null;
  const disabled = isDemo || busy;
  // A LOOKUP in the module-level map, never a call: a component obtained from a call during
  // render is a new type every render (`react-hooks/static-components`).
  const CatIcon = categoryMeta?.icon ? LAZY_CATEGORY_ICONS[categoryMeta.icon] : undefined;

  return (
    <TableRow className={cn(armed && 'bg-destructive/5')}>
      <TableCell className={cn(FIGURE_CLASS, 'text-foreground')}>
        <div className="flex items-center gap-1.5">
          {format(getExpenseDate(expense.date), 'dd/MM/yyyy', { locale: it })}
          {expense.isRecurring && <Calendar className="h-3 w-3 text-muted-foreground" aria-label="Voce ricorrente" />}
          {scheduled && (
            <Badge variant="outline" className="flex-shrink-0 font-sans text-[10px] font-normal text-muted-foreground">
              In calendario
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        {singleType ? (
          <span className="text-xs text-muted-foreground">{EXPENSE_TYPE_LABELS[expense.type]}</span>
        ) : (
          <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', EXPENSE_TYPE_BADGE_CLASS[expense.type])}>
            {EXPENSE_TYPE_LABELS[expense.type]}
          </span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {CatIcon ? (
            <div
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded"
              style={{ backgroundColor: categoryMeta?.color ? `${categoryMeta.color}20` : 'var(--muted)' }}
            >
              <Suspense fallback={null}>
                <CatIcon className="h-3 w-3" style={{ color: categoryMeta?.color || 'var(--muted-foreground)' }} aria-hidden="true" />
              </Suspense>
            </div>
          ) : categoryMeta?.color ? (
            <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: categoryMeta.color }} />
          ) : null}
          {expense.categoryName}
          {ownerLabel && (
            <Badge variant="outline" className="flex-shrink-0 text-[10px] font-normal text-muted-foreground">
              {ownerLabel}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{expense.subCategoryName || '-'}</TableCell>
      <TableCell className={cn('text-right', FIGURE_CLASS)}>
        {/* The sign colour means money gained or lost; a scheduled row is neither yet. */}
        <div
          className={cn(
            'flex items-center justify-end gap-1 font-medium',
            scheduled ? 'text-muted-foreground' : expense.type === 'income' ? 'text-positive' : 'text-destructive',
          )}
        >
          {expense.type === 'income' ? <TrendingUp className="h-4 w-4" aria-hidden="true" /> : <TrendingDown className="h-4 w-4" aria-hidden="true" />}
          <span>{formatCurrency(Math.abs(expense.amount))}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-[200px] text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate">{expense.notes || '-'}</span>
          {expense.isInstallment && (
            <Badge variant="outline" className="flex-shrink-0 text-xs">
              Rata {expense.installmentNumber}/{expense.installmentTotal}
            </Badge>
          )}
        </div>
        {/* The consequence of the armed delete: the row says it, the button stays short. A block
            with its own max-width, because `max-w` on a `td` does not bind an auto-layout table and
            the sentence widened the column until the table ran past the tile (seen on the mirror). */}
        {consequence && <p className="mt-1 max-w-[220px] text-xs leading-snug text-destructive">{consequence}</p>}
      </TableCell>
      <TableCell className="text-center">
        {expense.link && (
          <a
            href={expense.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center text-primary transition-colors hover:text-primary/70"
            aria-label="Apri link esterno"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          {/* While the delete is armed the row has one action; the pencil gives its room to «Conferma»
              so the column keeps its width (the armed row grew the table 40px past the tile). */}
          {!armed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(expense)}
              // Disabled during a delete: an edit racing a delete could leave a balance moved twice.
              disabled={disabled}
              aria-label={isDemo ? 'Modifica — non disponibile in modalità demo' : `Modifica ${rowName}`}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
            >
              <Edit className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            ref={deleteRef}
            variant={armed ? 'destructive' : 'ghost'}
            size="sm"
            onClick={isSeries ? () => onDelete(expense) : onArmedClick}
            onBlur={isSeries ? undefined : onBlur}
            disabled={disabled}
            aria-pressed={isSeries ? undefined : armed}
            aria-label={
              isDemo
                ? 'Elimina — non disponibile in modalità demo'
                : isSeries
                  ? `Elimina ${rowName} o la sua serie`
                  : armed
                    ? `Premi di nuovo per eliminare ${rowName}`
                    : `Elimina ${rowName}`
            }
            title={isDemo ? 'Non disponibile in modalità demo' : undefined}
          >
            {armed ? <span className="px-1 text-xs">Conferma</span> : <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── The table ────────────────────────────────────────────────────────────────

export function ExpenseTable({ expenses, onEdit, onRefresh, isDemo = false, hasActiveFilters = false, categories = [], now, memberNames = null }: ExpenseTableProps) {
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
  // The one question a series adds to a delete: «solo questa o tutte?»
  const [seriesRequest, setSeriesRequest] = useState<SeriesDeleteRequest | null>(null);
  // One live region for the whole table (one per row made a reader hear «annullata» on every Tab).
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => setAnnouncement(text), []);

  // ========== Delete Handlers ==========

  const deleteSingleExpense = async (expense: Expense) => {
    try {
      setDeletingId(expense.id);
      // Give back what the row has applied — both accounts of a transfer — before deleting it;
      // a row still waiting for its date moved nothing (lib/utils/cashSettlement.ts).
      // A transfer's fee row goes with it (lib/utils/transferFee.ts), its balance given back too.
      const rows = rowsDeletedWith(expense, await getTransferFeeOf(expense));
      if ((await reverseAppliedBalances(rows)) && user && ownerId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      }
      await deleteExpenseRows(expense.userId, rows);
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
    // The series query is scoped by owner (firestore.rules refuses an unscoped list), so
    // without an owner there is nothing to delete — and no way to ask for it.
    if (!ownerId) return;
    try {
      setDeletingId(recurringParentId);
      // Give back what the occurrences already happened have applied, in one transaction; the
      // ones still waiting for their date moved nothing.
      const seriesExpenses = await getExpensesByRecurringParentId(ownerId, recurringParentId);
      if ((await reverseAppliedBalances(seriesExpenses)) && user && ownerId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      }
      await deleteRecurringExpenses(ownerId, recurringParentId);
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
    // The series query is scoped by owner (firestore.rules refuses an unscoped list), so
    // without an owner there is nothing to delete — and no way to ask for it.
    if (!ownerId) return;
    try {
      setDeletingId(installmentParentId);
      // Give back what the instalments already due have applied, in one transaction; the ones
      // still waiting for their date moved nothing.
      const seriesExpenses = await getExpensesByInstallmentParentId(ownerId, installmentParentId);
      if ((await reverseAppliedBalances(seriesExpenses)) && user && ownerId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(ownerId) });
      }
      await deleteInstallmentExpenses(ownerId, installmentParentId);
      toast.success('Tutte le rate sono state eliminate');
      onRefresh();
    } catch (error) {
      console.error('Error deleting installment expenses:', error);
      toast.error('Errore nell\'eliminazione delle rate');
    } finally {
      setDeletingId(null);
    }
  };

  /** A plain row arrives here from its own armed confirm; a series row opens the question. */
  const handleDelete = (expense: Expense) => {
    const mode = resolveSeriesDeleteMode(expense);
    if (mode) {
      setSeriesRequest({ expense, mode });
      return;
    }
    void deleteSingleExpense(expense);
  };

  const handleDeleteSeries = (expense: Expense) => {
    setSeriesRequest(null);
    if (expense.isInstallment && expense.installmentParentId) {
      void deleteAllInstallmentExpenses(expense.installmentParentId);
    } else if (expense.isRecurring && expense.recurringParentId) {
      void deleteAllRecurringExpenses(expense.recurringParentId);
    }
  };

  // When all visible expenses share the same type, the badge adds no information.
  // Compute the set of distinct types in the full (non-paginated) filtered list
  // so the column stays consistent as the user pages through.
  const uniqueExpenseTypes = useMemo(
    () => new Set(expenses.map(e => e.type)),
    [expenses],
  );
  const singleType = uniqueExpenseTypes.size === 1;

  // ========== Pagination and Sorting Logic ==========

  const totalPages = Math.ceil(expenses.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  /**
   * Three-state sort: a column cycles through its default direction, the other, then no sort
   * (the original date order) — the third state is the way back to the default view.
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
   * Why reset sort when the expenses array changes, and page 1 when the view changes?
   *
   * The expenses prop is pre-filtered by parent (e.g., by month, type, category).
   * When filters change, user likely wants to see the new filtered data in default
   * date order, not in whatever sort state was previously active. Clearing sort
   * provides a predictable "reset" behavior when switching filters.
   *
   * - If expenses.length changes (add/delete), staying on page 3 might show empty results
   * - If sort or page size changes, the "page 3" items are now completely different items
   *
   * Both adjustments happen during render, keyed on the previous values (React's "adjusting
   * state when a prop changes"): a setter called synchronously in an effect is banned by
   * `react-hooks/set-state-in-effect`, and this way the reset lands in the same commit.
   */
  const [prevView, setPrevView] = useState({ length: expenses.length, sortCol, sortDir, pageSize });
  if (prevView.length !== expenses.length) {
    // A new list clears the sort, and the cleared sort is what the next render will see.
    setPrevView({ length: expenses.length, sortCol: null, sortDir, pageSize });
    setSortCol(null);
    setCurrentPage(1);
  } else if (prevView.sortCol !== sortCol || prevView.sortDir !== sortDir || prevView.pageSize !== pageSize) {
    setPrevView({ length: expenses.length, sortCol, sortDir, pageSize });
    setCurrentPage(1);
  }

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

  /** `aria-sort` of a sortable header: the sorted column says its direction, the others nothing. */
  const ariaSortOf = (col: 'amount' | 'date' | 'category'): 'ascending' | 'descending' | undefined =>
    sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined;

  const sortIcon = (col: 'amount' | 'date' | 'category') =>
    sortCol === col ? (
      sortDir === 'desc' ? <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
    ) : (
      <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/50" aria-hidden="true" />
    );

  // ========== Render ==========

  if (expenses.length === 0) {
    return (
      <EmptyState
        message={
          hasActiveFilters
            ? 'Nessun movimento passa i filtri applicati: azzerali per rivedere il periodo intero.'
            : 'Nessun movimento registrato nel periodo: aggiungi la prima voce per iniziare a tracciare.'
        }
      />
    );
  }

  const busyFor = (expense: Expense) =>
    deletingId === expense.id || (!!expense.recurringParentId && deletingId === expense.recurringParentId) || (!!expense.installmentParentId && deletingId === expense.installmentParentId);

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]" aria-sort={ariaSortOf('date')}>
                  <button
                    onClick={() => handleSort('date')}
                    className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
                    aria-label="Ordina per data"
                    type="button"
                  >
                    <span>Data</span>
                    {sortIcon('date')}
                  </button>
                </TableHead>
                <TableHead className="w-[120px]">Tipo</TableHead>
                <TableHead aria-sort={ariaSortOf('category')}>
                  <button
                    onClick={() => handleSort('category')}
                    className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground"
                    aria-label="Ordina per categoria"
                    type="button"
                  >
                    <span>Categoria</span>
                    {sortIcon('category')}
                  </button>
                </TableHead>
                <TableHead>Sottocategoria</TableHead>
                <TableHead className="w-[120px] text-right" aria-sort={ariaSortOf('amount')}>
                  <button
                    onClick={() => handleSort('amount')}
                    className="flex w-full cursor-pointer items-center justify-end gap-1 transition-colors hover:text-foreground"
                    aria-label="Ordina per importo"
                    type="button"
                  >
                    <span>Importo</span>
                    {sortIcon('amount')}
                  </button>
                </TableHead>
                <TableHead className="max-w-[200px]">Note</TableHead>
                <TableHead className="w-[50px] text-center">Link</TableHead>
                <TableHead className="w-[100px] text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginatedExpenses.map((expense: Expense) => (
                <ExpenseTableRow
                  key={expense.id}
                  expense={expense}
                  scheduled={now ? isScheduledRow(expense, now) : false}
                  ownerLabel={memberNames ? resolveOwnerLabel(expense, memberNames) : null}
                  singleType={singleType}
                  categoryMeta={categoryMetaMap.get(expense.categoryId)}
                  isDemo={isDemo}
                  busy={busyFor(expense)}
                  onEdit={onEdit}
                  onDelete={handleDelete}
                  announce={announce}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-2">
          {/* Left: rows-per-page selector + count */}
          <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
            <span className="hidden shrink-0 sm:inline">Righe per pagina</span>
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
            <span className={cn('shrink-0', FIGURE_CLASS)}>
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
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                Precedente
              </Button>
              <div className={cn('text-sm font-medium', FIGURE_CLASS)}>
                {currentPage} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
              >
                Successiva
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>

        {/* The table's one live region: arm and disarm are sentences, spoken here. */}
        <span className="sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
      </div>

      <SeriesDeleteDialog
        request={seriesRequest}
        onClose={() => setSeriesRequest(null)}
        busy={!!deletingId}
        onDeleteOne={(expense) => {
          setSeriesRequest(null);
          void deleteSingleExpense(expense);
        }}
        onDeleteAll={handleDeleteSeries}
      />
    </>
  );
}
