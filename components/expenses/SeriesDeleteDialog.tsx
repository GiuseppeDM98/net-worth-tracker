'use client';

/**
 * «Solo questa o tutta la serie?» — the one question a delete asks when the row belongs to an
 * instalment plan or a recurring series. A single row never comes here: it is deleted by a
 * two-click confirm on its own row (`useArmedDelete`) or by the feed's detail drawer.
 *
 * One modal for the two surfaces that used to keep an `AlertDialog` apiece (the table and the
 * tab, 2026-09-14): a `ResponsiveModal` in the app's vocabulary — eyebrow · title · reading ·
 * body · footer, `sm` because it holds one question (doc/guide/dialog.md). The words come from
 * `describeSeriesDeleteReading`; the modal passes content, never chrome.
 */

import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { describeSeriesDeleteReading } from '@/lib/utils/dialogNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getExpenseDate } from '@/lib/utils/expenseHelpers';
import type { Expense } from '@/types/expenses';

export type SeriesDeleteMode = 'installment' | 'recurring';

export interface SeriesDeleteRequest {
  expense: Expense;
  mode: SeriesDeleteMode;
}

/** The series a row belongs to, or null for a plain row — the ONE rule both surfaces read. */
export function resolveSeriesDeleteMode(expense: Expense): SeriesDeleteMode | null {
  if (expense.isInstallment && expense.installmentParentId) return 'installment';
  if (expense.isRecurring && expense.recurringParentId) return 'recurring';
  return null;
}

interface SeriesDeleteDialogProps {
  /** The row and the kind of series it belongs to; null keeps the modal closed. */
  request: SeriesDeleteRequest | null;
  onClose: () => void;
  /** Delete the one row. */
  onDeleteOne: (expense: Expense) => void;
  /** Delete the whole series the row belongs to. */
  onDeleteAll: (expense: Expense) => void;
  /** A delete is in flight: the two destructive buttons wait for it. */
  busy?: boolean;
}

export function SeriesDeleteDialog({ request, onClose, onDeleteOne, onDeleteAll, busy = false }: SeriesDeleteDialogProps) {
  const expense = request?.expense ?? null;
  const mode = request?.mode ?? 'recurring';
  const label = expense?.notes?.trim() || expense?.categoryName || '';
  const allLabel = mode === 'installment' && expense?.installmentTotal ? `Tutte le ${expense.installmentTotal} rate` : 'Tutta la serie';

  return (
    <ResponsiveModal
      open={request !== null}
      onClose={onClose}
      width="sm"
      eyebrow="Movimenti · Elimina"
      title={mode === 'installment' ? 'Elimina una rata o il piano' : 'Elimina una voce o la serie'}
      reading={
        expense
          ? {
              narrative: describeSeriesDeleteReading({
                mode,
                label,
                amount: expense.amount,
                installmentNumber: expense.installmentNumber,
                installmentTotal: expense.installmentTotal,
              }),
              tone: 'neutral',
            }
          : null
      }
      description="Scegli se eliminare solo questa voce o tutta la serie a cui appartiene."
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Annulla
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !expense}
            onClick={() => {
              if (expense) onDeleteOne(expense);
            }}
          >
            Solo questa
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy || !expense}
            onClick={() => {
              if (expense) onDeleteAll(expense);
            }}
          >
            {allLabel}
          </Button>
        </>
      }
    >
      {/* The row's facts as a summary block — `bg-muted`, never a card inside the modal. */}
      {expense && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-muted px-4 py-3 text-[13px]">
          <dt className="text-muted-foreground">Voce</dt>
          <dd className="min-w-0 truncate text-foreground">{label}</dd>
          <dt className="text-muted-foreground">Data</dt>
          <dd className="font-mono tabular-nums text-foreground">{format(getExpenseDate(expense.date), 'd MMMM yyyy', { locale: it })}</dd>
          <dt className="text-muted-foreground">Importo</dt>
          <dd className="font-mono tabular-nums text-foreground">{cachedFormatCurrencyEUR(Math.abs(expense.amount))}</dd>
        </dl>
      )}
    </ResponsiveModal>
  );
}
