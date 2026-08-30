'use client';

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { Expense } from '@/types/expenses';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { isItalyDayAfter, toDate } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface MovimentiTileProps {
  /** Every row linked to the center, newest first — the scheduled ones included. */
  expenses: Expense[];
  now: Date;
  aside: Narrative;
  reading: Narrative;
  /** How many rows are shown; the rest sit behind «Mostra altre». */
  visibleCount: number;
  onShowMore: () => void;
  className?: string;
}

/** Rows shown per «Mostra altre» press. */
export const MOVEMENTS_PAGE_SIZE = 25;

function HeaderCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'pb-2 text-left font-semibold', className)}>
      {children}
    </th>
  );
}

function kindChip(expense: Expense, scheduled: boolean): string | null {
  if (scheduled) return 'in calendario';
  if (expense.isInstallment) return 'rata';
  if (expense.isRecurring) return 'ricorrente';
  return null;
}

function Chip({ label }: { label: string }) {
  return <span className="shrink-0 rounded-md border border-border px-1.5 text-[10px] font-medium leading-4 text-muted-foreground">{label}</span>;
}

/**
 * «Quali spese lo hanno fatto?» — the inventory: every row linked to the center, newest
 * first, as a table from `desktop:` and flat rows below (Table inside a Tile). A row dated
 * after today is marked «in calendario»: it is in the list because it is linked, and not in
 * the total because it is not spent. The list is windowed; «Mostra altre» extends it.
 */
export function MovimentiTile({ expenses, now, aside, reading, visibleCount, onShowMore, className }: MovimentiTileProps) {
  const visible = expenses.slice(0, visibleCount);
  const hidden = Math.max(0, expenses.length - visible.length);
  // By Italian calendar DAY, the app's one rule for «in calendario» (dateHelpers → isItalyDayAfter):
  // a row recorded today carries its creation time and is not scheduled.
  const isScheduled = (expense: Expense) => isItalyDayAfter(toDate(expense.date), now);

  return (
    <Tile eyebrow="Movimenti collegati" aside={<NarrativeText segments={aside} figureClassName="font-medium" />} reading={reading} className={className}>
      {visible.length > 0 && (
        <>
          {/* Desktop: the table. The first cell of each row is its header. */}
          <div className="mt-3 hidden desktop:block">
            <table className="w-full table-fixed">
              <caption className="sr-only">Movimenti collegati, dal più recente</caption>
              <colgroup>
                <col className="w-[110px]" />
                <col className="w-[22%]" />
                <col className="w-[22%]" />
                <col />
                <col className="w-[120px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <HeaderCell>Data</HeaderCell>
                  <HeaderCell>Categoria</HeaderCell>
                  <HeaderCell>Sottocategoria</HeaderCell>
                  <HeaderCell>Note</HeaderCell>
                  <HeaderCell className="text-right">Importo</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {visible.map((expense) => {
                  const scheduled = isScheduled(expense);
                  const chip = kindChip(expense, scheduled);
                  return (
                    <tr key={expense.id} className={cn('border-b border-border last:border-0', scheduled && 'text-muted-foreground')}>
                      <th scope="row" className="py-[9px] pr-3 text-left font-mono text-[13px] font-normal tabular-nums">
                        {formatDate(toDate(expense.date))}
                      </th>
                      <td className="py-[9px] pr-3 text-[13px]">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate">{expense.categoryName}</span>
                          {chip && <Chip label={chip} />}
                        </span>
                      </td>
                      <td className="truncate py-[9px] pr-3 text-[13px]">{expense.subCategoryName ?? '—'}</td>
                      <td className="truncate py-[9px] pr-3 text-[13px] text-muted-foreground">{expense.notes?.trim() || '—'}</td>
                      <td className="py-[9px] text-right font-mono text-[13px] tabular-nums">{cachedFormatCurrencyEUR(Math.abs(expense.amount))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Below desktop: flat rows. */}
          <ul className="mt-2 flex flex-col divide-y divide-border desktop:hidden">
            {visible.map((expense) => {
              const scheduled = isScheduled(expense);
              const chip = kindChip(expense, scheduled);
              return (
                <li key={expense.id} className={cn('flex min-h-[44px] items-center justify-between gap-3 py-2', scheduled && 'text-muted-foreground')}>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px]">
                        {expense.categoryName}
                        {expense.subCategoryName ? ` · ${expense.subCategoryName}` : ''}
                      </span>
                      {chip && <Chip label={chip} />}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      <span className="font-mono tabular-nums">{formatDate(toDate(expense.date))}</span>
                      {expense.notes?.trim() ? ` · ${expense.notes.trim()}` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-[13px] tabular-nums">{cachedFormatCurrencyEUR(Math.abs(expense.amount))}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {hidden > 0 && (
        <div className="mt-3">
          <Button variant="outline" size="sm" className="h-9 w-full desktop:w-auto" onClick={onShowMore}>
            Mostra altre <span className="font-mono tabular-nums">{Math.min(hidden, MOVEMENTS_PAGE_SIZE)}</span>
          </Button>
        </div>
      )}
    </Tile>
  );
}
