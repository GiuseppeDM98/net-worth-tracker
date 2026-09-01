'use client';

/**
 * TransactionFeed — the canonical transaction list for the Cashflow "Tracciamento" tab.
 *
 * The redesign collapses the two old list paradigms (desktop = paginated 8-column table,
 * mobile = day-grouped feed) into ONE pattern shared by both surfaces, so a movement, its
 * delete model, and its temporal rhythm read identically everywhere. Desktop keeps the
 * dense `ExpenseTable` available behind a "Vista tabella" toggle, but this feed is the
 * default on both.
 *
 * Tapping a row opens a detail drawer with edit/delete (a single, consistent delete model
 * across desktop and mobile). When `grouped` is true, rows are bucketed by day with
 * Oggi / Ieri / "EEE d MMM" headers; otherwise they render as one flat list.
 */

import { Suspense, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { it } from 'date-fns/locale';
import { Pencil, Trash2 } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getItalyDate } from '@/lib/utils/dateHelpers';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import { describeRecurrence } from '@/lib/utils/recurrenceDates';
import { isScheduledRow } from '@/lib/utils/tracciamentoSummary';
import type { Expense, ExpenseType } from '@/types/expenses';
import { CompactExpenseRow, TYPE_DOT_CLASS } from '@/components/cashflow/CompactExpenseRow';
import { getLazyIcon } from '@/components/expenses/IconPickerPopover';

// ─── Italian type labels ───────────────────────────────────────────────────────

const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  income: 'Entrata',
  fixed: 'Spesa fissa',
  variable: 'Spesa variabile',
  debt: 'Debito',
  transfer: 'Trasferimento',
};

// Module-level component required by the React Compiler — getLazyIcon calls React.lazy()
// which must never be called inside a render function (it would reset the component each
// render).
function TransactionDetailIcon({
  iconName,
  color,
  type,
}: {
  iconName?: string;
  color?: string;
  type: ExpenseType;
}) {
  const Icon = iconName ? getLazyIcon(iconName) : null;
  const dot = (
    <span className={cn('h-2.5 w-2.5 rounded-full', TYPE_DOT_CLASS[type] ?? 'bg-muted-foreground')} />
  );
  return (
    <div
      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg"
      style={{ backgroundColor: color ? `${color}20` : 'var(--muted)' }}
    >
      {Icon ? (
        <Suspense fallback={dot}>
          <Icon
            className="h-4.5 w-4.5"
            style={{ color: color || 'var(--muted-foreground)' }}
            aria-hidden="true"
          />
        </Suspense>
      ) : (
        dot
      )}
    </div>
  );
}

// ─── Transaction Detail Drawer ─────────────────────────────────────────────────

interface TransactionDetailDrawerProps {
  expense: Expense | null;
  now: Date;
  onOpenChange: (open: boolean) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  isDemo: boolean;
  categoryMetaMap: Map<string, { icon?: string; color?: string }>;
}

function TransactionDetailDrawer({
  expense,
  now,
  onOpenChange,
  onEdit,
  onDelete,
  isDemo,
  categoryMetaMap,
}: Readonly<TransactionDetailDrawerProps>) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!expense)
    return (
      <Drawer open={false} onOpenChange={onOpenChange}>
        <DrawerContent />
      </Drawer>
    );

  const isIncome = expense.type === 'income';
  const isTransfer = expense.type === 'transfer';
  const scheduled = isScheduledRow(expense, now);
  const date = getExpenseDate(expense.date);
  const catMeta = categoryMetaMap.get(expense.categoryId);

  const amountLabel = `${isIncome ? '+' : ''}${cachedFormatCurrencyEUR(Math.abs(expense.amount))}`;

  const details: { label: string; value: string }[] = [
    { label: 'Data', value: format(date, 'd MMMM yyyy', { locale: it }) },
    { label: 'Tipo', value: EXPENSE_TYPE_LABELS[expense.type] },
    { label: 'Categoria', value: expense.categoryName },
  ];

  // The one line that says why this row is in the list and not in the totals above it.
  if (scheduled) {
    details.push({ label: 'Stato', value: 'In calendario — non ancora avvenuta' });
  }

  if (expense.subCategoryName) {
    details.push({ label: 'Sottocategoria', value: expense.subCategoryName });
  }
  if (expense.notes?.trim()) {
    details.push({ label: 'Note', value: expense.notes.trim() });
  }
  if (expense.costCenterName) {
    details.push({ label: 'Centro di costo', value: expense.costCenterName });
  }
  if (expense.isInstallment && expense.installmentNumber && expense.installmentTotal) {
    details.push({
      label: 'Rata',
      value: `${expense.installmentNumber} di ${expense.installmentTotal}${
        expense.installmentTotalAmount
          ? ` (totale ${cachedFormatCurrencyEUR(Math.abs(expense.installmentTotalAmount))})`
          : ''
      }`,
    });
  }
  const recurrenceDetail = describeRecurrence(
    expense.recurringFrequency,
    expense.recurringDay,
    expense.date
  );
  if (expense.isRecurring && recurrenceDetail) {
    details.push({ label: 'Ricorrenza', value: recurrenceDetail });
  }
  if (expense.link) {
    details.push({ label: 'Link', value: expense.link });
  }

  return (
    <Drawer open onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        {/* Header: icon + title + amount */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-3">
            <TransactionDetailIcon
              iconName={catMeta?.icon}
              color={catMeta?.color}
              type={expense.type}
            />
            <div className="min-w-0 flex-1">
              <DrawerTitle className="text-foreground truncate text-lg font-semibold">
                {expense.notes?.trim() || expense.categoryName}
              </DrawerTitle>
              <DrawerDescription className="text-muted-foreground mt-0.5 text-sm">
                {format(date, 'd MMM yyyy', { locale: it })}
              </DrawerDescription>
            </div>
          </div>
          <p
            className={cn(
              'mt-4 font-mono text-2xl font-bold tabular-nums',
              scheduled
                ? 'text-muted-foreground'
                : isIncome
                  ? 'text-positive'
                  : isTransfer
                    ? 'text-foreground'
                    : 'text-destructive',
            )}
          >
            {amountLabel}
          </p>
        </div>

        {/* Details list */}
        <div className="px-6 pb-4">
          <div className="bg-muted/40 divide-border/40 divide-y rounded-xl">
            {details.map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4 px-4 py-3">
                <span className="text-muted-foreground flex-shrink-0 text-sm">{label}</span>
                <span className="text-foreground min-w-0 text-right text-sm font-medium break-words">
                  {label === 'Link' ? (
                    <a
                      href={value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary break-all underline underline-offset-2"
                    >
                      {value.length > 40 ? `${value.slice(0, 40)}...` : value}
                    </a>
                  ) : (
                    value
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 px-6 pb-8">
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => onEdit(expense)}
            disabled={isDemo}
            aria-label={isDemo ? 'Modifica — non disponibile in modalità demo' : 'Modifica voce'}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Modifica
          </Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => setConfirmDelete(true)}
            disabled={isDemo}
            aria-label={isDemo ? 'Elimina — non disponibile in modalità demo' : 'Elimina voce'}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Elimina
          </Button>
        </div>
      </DrawerContent>

      {/* Delete confirmation sub-drawer */}
      <Drawer open={confirmDelete} onOpenChange={setConfirmDelete} nested>
        <DrawerContent>
          <div className="px-6 pt-6 pb-8 text-center">
            <div className="bg-destructive/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
              <Trash2 className="text-destructive h-5 w-5" />
            </div>
            <DrawerTitle className="text-lg font-semibold">Eliminare questa voce?</DrawerTitle>
            <DrawerDescription className="text-muted-foreground mt-1 text-sm">
              {expense.notes?.trim() || expense.categoryName} &middot;{' '}
              {cachedFormatCurrencyEUR(Math.abs(expense.amount))}
            </DrawerDescription>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" className="h-11 flex-1" onClick={() => setConfirmDelete(false)}>
                Annulla
              </Button>
              <Button
                variant="destructive"
                className="h-11 flex-1"
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete(expense);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Elimina
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </Drawer>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface TransactionFeedProps {
  /** Full sorted list (not yet sliced). The feed slices to `showCount` internally. */
  transactions: Expense[];
  /**
   * The page's clock. A row dated after it is marked «in calendario» — the list carries
   * scheduled rows (instalments, recurring occurrences) that the figures above do not count.
   */
  now: Date;
  /** Total count before slicing, used for the load-more display. */
  totalCount: number;
  showCount: number;
  onLoadMore: () => void;
  /** When true, rows are grouped by day (use only when sorting by date). */
  grouped: boolean;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  isDemo: boolean;
  hasActiveFilters: boolean;
  /** Map of categoryId → { icon?, color? } for row icon badges. */
  categoryMetaMap: Map<string, { icon?: string; color?: string }>;
  /** Hint shown in the empty state when no filters are active. */
  emptyHint?: string;
  /**
   * How each day-group is framed:
   *   - `'card'` (default): a standalone rounded card per day. Use on mobile, where the
   *     feed sits directly on the page background.
   *   - `'flat'`: plain `divide-y` rows with no inner card chrome. Use on desktop, where
   *     the feed already lives inside a Card (a card-in-card would be box-within-box).
   */
  surface?: 'card' | 'flat';
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function TransactionFeed({
  transactions,
  now,
  totalCount,
  showCount,
  onLoadMore,
  grouped,
  onEdit,
  onDelete,
  isDemo,
  hasActiveFilters,
  categoryMetaMap,
  emptyHint = 'Nessun movimento registrato nel periodo: aggiungi la prima voce per iniziare a tracciare.',
  surface = 'card',
  className,
}: Readonly<TransactionFeedProps>) {
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // Slice the visible window.
  const sliced = useMemo(() => transactions.slice(0, showCount), [transactions, showCount]);

  // Bucket by day with Oggi / Ieri / "EEE d MMM" labels; flat when not grouped.
  const dateGroups = useMemo(() => {
    if (!grouped) {
      return [{ label: null as string | null, items: sliced }];
    }

    const todayDate = getItalyDate(new Date());
    const yesterdayDate = subDays(todayDate, 1);
    const todayStr = format(todayDate, 'yyyy-MM-dd');
    const yesterdayStr = format(yesterdayDate, 'yyyy-MM-dd');

    const groupMap = new Map<string, Expense[]>();
    for (const expense of sliced) {
      const key = format(getExpenseDate(expense.date), 'yyyy-MM-dd');
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(expense);
    }

    return Array.from(groupMap.entries()).map(([key, items]) => {
      let label: string;
      if (key === todayStr) {
        label = 'Oggi';
      } else if (key === yesterdayStr) {
        label = 'Ieri';
      } else {
        const [y, m, d] = key.split('-').map(Number);
        label = format(new Date(y, m - 1, d), 'EEE d MMM', { locale: it });
      }
      return { label, items };
    });
  }, [sliced, grouped]);

  if (transactions.length === 0) {
    return (
      <EmptyState
        className={className}
        message={
          hasActiveFilters
            ? 'Nessun movimento passa i filtri applicati: azzerali per rivedere il periodo intero.'
            : emptyHint
        }
      />
    );
  }

  return (
    <div className={cn('space-y-5', className)}>
      {dateGroups.map((group, idx) => (
        <div key={group.label ?? idx}>
          {/* Date group header */}
          {group.label !== null && (
            <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-2 pl-1 font-mono tabular-nums')}>{group.label}</p>
          )}

          {/* All rows for this date. On mobile a standalone card; on desktop flat rows,
              since the feed already sits inside the list Card. */}
          <div
            className={cn(
              'divide-border/40 divide-y',
              surface === 'card' && 'bg-card ring-border/10 overflow-hidden rounded-2xl ring-1',
            )}
          >
            {group.items.map((expense) => {
              const catMeta = categoryMetaMap.get(expense.categoryId);
              return (
                <div key={expense.id} className="px-2">
                  <CompactExpenseRow
                    expense={expense}
                    onSelect={setSelectedExpense}
                    categoryIcon={catMeta?.icon}
                    categoryColor={catMeta?.color}
                    scheduled={isScheduledRow(expense, now)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Load more */}
      {showCount < totalCount && (
        <div className="pt-2 text-center">
          <Button variant="outline" size="sm" onClick={onLoadMore}>
            Carica altri {Math.min(20, totalCount - showCount)}
          </Button>
          <p className="text-muted-foreground mt-2 font-mono text-xs tabular-nums">
            {showCount} di {totalCount} voci
          </p>
        </div>
      )}

      {/* Detail drawer — single, consistent edit/delete model for desktop and mobile. */}
      <TransactionDetailDrawer
        expense={selectedExpense}
        now={now}
        onOpenChange={(open) => {
          if (!open) setSelectedExpense(null);
        }}
        onEdit={(expense) => {
          setSelectedExpense(null);
          onEdit(expense);
        }}
        onDelete={(expense) => {
          setSelectedExpense(null);
          onDelete(expense);
        }}
        isDemo={isDemo}
        categoryMetaMap={categoryMetaMap}
      />
    </div>
  );
}
