'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Expense } from '@/types/expenses';
import { formatCurrency } from '@/lib/services/chartService';
import { toDate } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';

/** Rows shown before «Mostra altre» — a subcategory's month rarely needs more at a glance. */
const PAGE_SIZE = 25;

interface FocusTransactionsProps {
  expenses: Expense[];
  isIncome: boolean;
  /** «2026», «Agosto 2026», «Storico completo» — the window the rows belong to. */
  periodLabel: string;
}

/**
 * The period's rows of a focused subcategory, in the tile's cadence: a sub-eyebrow naming
 * the window, flat `divide-y` rows below `desktop:` and a table from it, closed by the signed
 * total («netto»: a refund nets off here, while the dossier's hero above is gross by
 * magnitude — the same word on both would collide on refund rows).
 */
export function FocusTransactions({ expenses, isIncome, periodLabel }: FocusTransactionsProps) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const amountClass = isIncome ? 'text-positive' : 'text-destructive';

  if (expenses.length === 0) {
    return (
      <div>
        <p className={TILE_SUB_EYEBROW_CLASS}>Transazioni · {periodLabel}</p>
        <p className="mt-2 text-[13px] text-muted-foreground">{isIncome ? 'Nessuna entrata nel periodo.' : 'Nessuna spesa nel periodo.'}</p>
      </div>
    );
  }

  // Signed amounts on purpose: income positive, spending negative, so a refund nets off.
  const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const visible = expenses.slice(0, shown);
  const hidden = expenses.length - visible.length;
  const countLabel = `${expenses.length} ${expenses.length === 1 ? 'voce' : 'voci'}`;

  const moreButton = hidden > 0 && (
    <button type="button" onClick={() => setShown((value) => value + PAGE_SIZE)} className="inline-flex min-h-[44px] items-center text-[11px] text-foreground hover:text-muted-foreground desktop:min-h-0">
      Mostra altre {Math.min(hidden, PAGE_SIZE)}
    </button>
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={TILE_SUB_EYEBROW_CLASS}>Transazioni · {periodLabel}</p>
        <span className="text-[10px] text-muted-foreground">
          <span className="font-mono tabular-nums">{expenses.length}</span> {expenses.length === 1 ? 'voce' : 'voci'}
        </span>
      </div>

      {/* Below desktop: flat rows, never a card per row inside the tile. */}
      <ul className="mt-1 divide-y divide-border desktop:hidden">
        {visible.map((expense) => (
          <li key={expense.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{format(toDate(expense.date), 'dd/MM/yyyy', { locale: it })}</span>
              {expense.notes && <span className="truncate text-[13px] text-foreground">{expense.notes}</span>}
              {expense.link && (
                <a href={expense.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                  Apri link <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </span>
            <span className={cn('shrink-0 font-mono text-[13px] tabular-nums', amountClass)}>{formatCurrency(expense.amount)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 py-2.5">
          <span className="text-[13px] font-semibold">Totale netto ({countLabel})</span>
          <span className={cn('font-mono text-[13px] font-semibold tabular-nums', amountClass)}>{formatCurrency(totalAmount)}</span>
        </li>
      </ul>

      {/* From desktop: the table, column headers as the sub-eyebrow. */}
      <div className="mt-1 hidden desktop:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 text-left font-semibold')}>Data</th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 text-right font-semibold')}>Importo</th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-4 text-left font-semibold')}>Note</th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 text-center font-semibold')}>Link</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((expense) => (
              <tr key={expense.id} className="border-b border-border hover:bg-muted/30">
                <th scope="row" className="py-2 text-left font-mono text-[13px] font-normal tabular-nums">{format(toDate(expense.date), 'dd/MM/yyyy', { locale: it })}</th>
                <td className={cn('py-2 text-right font-mono text-[13px] tabular-nums', amountClass)}>{formatCurrency(expense.amount)}</td>
                <td className="py-2 pl-4 text-[13px] text-muted-foreground">{expense.notes || '—'}</td>
                <td className="py-2 text-center">
                  {expense.link && (
                    <a href={expense.link} target="_blank" rel="noopener noreferrer" className="inline-flex text-muted-foreground hover:text-foreground" aria-label="Apri link">
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="py-2.5 text-left text-[13px] font-semibold">Totale netto ({countLabel})</th>
              <td className={cn('py-2.5 text-right font-mono text-[13px] font-semibold tabular-nums', amountClass)}>{formatCurrency(totalAmount)}</td>
              <td colSpan={2} className="py-2.5 pl-4 text-left">{moreButton}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {hidden > 0 && <div className="mt-2 desktop:hidden">{moreButton}</div>}
    </div>
  );
}
