'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Unlink } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { Expense } from '@/types/expenses';
import { cachedFormatCurrencyEUR, formatDate } from '@/lib/utils/formatters';
import { isItalyDayAfter, toDate } from '@/lib/utils/dateHelpers';
import { seriesKeyOf } from '@/lib/utils/costCenterLinking';
import { UNLINK_CONSEQUENCE } from '@/lib/utils/costCenterNarrative';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';
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
  /** Opens the expense in its own form. */
  onOpen: (expense: Expense) => void;
  /** A plain row, after its two-click confirm. */
  onUnlink: (expense: Expense) => void;
  /** A row of a series: the choice («solo questa o tutta?») is a modal, not an arm. */
  onUnlinkSeries: (expense: Expense) => void;
  /** Demo mode: the rows still open nothing and unlink nothing. */
  disabled?: boolean;
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

const rowLabel = (expense: Expense) => `${expense.categoryName} del ${formatDate(toDate(expense.date))}`;

interface UnlinkButtonProps {
  expense: Expense;
  disabled: boolean;
  onUnlink: (expense: Expense) => void;
  onUnlinkSeries: (expense: Expense) => void;
  /** The tile's ONE live region: a status per row made a keyboard reader hear every disarm. */
  announce: (text: string) => void;
  /** The row prints the consequence while its button is armed. */
  onArmedChange: (armed: boolean) => void;
}

/**
 * «Scollega» on a row. A plain row arms in place (`useArmedDelete`: no timer, Escape / a
 * pointer elsewhere / blur disarm) and the ROW prints what the second press does; a row of a
 * series opens the choice instead and never arms. 44px on touch, 32 with a mouse.
 */
function UnlinkButton({ expense, disabled, onUnlink, onUnlinkSeries, announce, onArmedChange }: UnlinkButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const inSeries = seriesKeyOf(expense) !== null;
  const { armed, onClick, onBlur } = useArmedDelete(ref, () => onUnlink(expense));

  // Each transition is announced once, after the render where it flipped; the disarm only
  // when an arm preceded it (the first render is not a cancellation).
  const wasArmed = useRef(false);
  const label = rowLabel(expense);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per scollegare ${label}. ${UNLINK_CONSEQUENCE}`);
      onArmedChange(true);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Scollegamento annullato');
      onArmedChange(false);
    }
  }, [armed, announce, onArmedChange, label]);

  return (
    <Button
      ref={ref}
      size="icon"
      variant="ghost"
      className={cn(
        'h-11 w-11 shrink-0 desktop:h-8 desktop:w-8',
        armed && 'w-auto border border-destructive px-2 text-[12px] font-medium text-destructive hover:text-destructive desktop:w-auto',
      )}
      disabled={disabled}
      aria-pressed={inSeries ? undefined : armed}
      aria-haspopup={inSeries ? 'dialog' : undefined}
      aria-label={armed ? `Conferma: scollega ${label}` : `Scollega ${label}`}
      onClick={inSeries ? () => onUnlinkSeries(expense) : onClick}
      onBlur={inSeries ? undefined : onBlur}
    >
      {armed ? 'Conferma' : <Unlink className="h-3.5 w-3.5" aria-hidden="true" />}
    </Button>
  );
}

const OPEN_CLASS =
  'min-w-0 truncate rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:no-underline';

type RowProps = Pick<MovimentiTileProps, 'onOpen' | 'onUnlink' | 'onUnlinkSeries'> & {
  expense: Expense;
  scheduled: boolean;
  disabled: boolean;
  announce: (text: string) => void;
};

function MovementTableRow({ expense, scheduled, disabled, announce, onOpen, onUnlink, onUnlinkSeries }: RowProps) {
  const [armed, setArmed] = useState(false);
  const chip = kindChip(expense, scheduled);
  return (
    <tr className={cn('border-b border-border last:border-0', scheduled && 'text-muted-foreground')}>
      <th scope="row" className="py-1 pr-3 text-left font-mono text-[13px] font-normal tabular-nums">
        {formatDate(toDate(expense.date))}
      </th>
      <td className="py-1 pr-3 text-[13px]">
        <span className="flex items-center gap-1.5">
          <button type="button" className={OPEN_CLASS} disabled={disabled} aria-label={`Apri ${rowLabel(expense)}`} onClick={() => onOpen(expense)}>
            {expense.categoryName}
          </button>
          {chip && <Chip label={chip} />}
        </span>
      </td>
      <td className="truncate py-1 pr-3 text-[13px]">{expense.subCategoryName ?? '—'}</td>
      {/* Armed, the note gives way to the consequence: what the second press does is the row's
          only doubt, and a fixed-layout table keeps the sentence inside its column. */}
      <td className={cn('py-1 pr-3 text-[13px]', armed ? 'text-[12px] leading-4 text-destructive' : 'truncate text-muted-foreground')}>
        {armed ? UNLINK_CONSEQUENCE : expense.notes?.trim() || '—'}
      </td>
      <td className="py-1 text-right font-mono text-[13px] tabular-nums">{cachedFormatCurrencyEUR(Math.abs(expense.amount))}</td>
      <td className="py-1 text-right">
        <UnlinkButton expense={expense} disabled={disabled} onUnlink={onUnlink} onUnlinkSeries={onUnlinkSeries} announce={announce} onArmedChange={setArmed} />
      </td>
    </tr>
  );
}

function MovementListRow({ expense, scheduled, disabled, announce, onOpen, onUnlink, onUnlinkSeries }: RowProps) {
  const [armed, setArmed] = useState(false);
  const chip = kindChip(expense, scheduled);
  return (
    <li className={cn('flex min-h-[44px] items-center gap-2 py-1', scheduled && 'text-muted-foreground')}>
      <button
        type="button"
        className="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={disabled}
        onClick={() => onOpen(expense)}
      >
        <span className="sr-only">Apri </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px]">
              {expense.categoryName}
              {expense.subCategoryName ? ` · ${expense.subCategoryName}` : ''}
            </span>
            {chip && <Chip label={chip} />}
          </span>
          {armed ? (
            <span className="text-[12px] leading-4 text-destructive">{UNLINK_CONSEQUENCE}</span>
          ) : (
            <span className="truncate text-[11px] text-muted-foreground">
              <span className="font-mono tabular-nums">{formatDate(toDate(expense.date))}</span>
              {expense.notes?.trim() ? ` · ${expense.notes.trim()}` : ''}
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[13px] tabular-nums">{cachedFormatCurrencyEUR(Math.abs(expense.amount))}</span>
      </button>
      <UnlinkButton expense={expense} disabled={disabled} onUnlink={onUnlink} onUnlinkSeries={onUnlinkSeries} announce={announce} onArmedChange={setArmed} />
    </li>
  );
}

/**
 * «Quali spese lo hanno fatto?» — the inventory: every row linked to the center, newest
 * first, as a table from `desktop:` and flat rows below (Table inside a Tile). A row dated
 * after today is marked «in calendario»: it is in the list because it is linked, and not in
 * the total because it is not spent. The list is windowed; «Mostra altre» extends it.
 *
 * Since 2026-09-18 a row is also where a wrong link is fixed: its category opens the expense
 * in its own form, and «Scollega» takes it out of the center without leaving the page —
 * until then the only way was to find the expense again in Tracciamento.
 */
export function MovimentiTile({ expenses, now, aside, reading, visibleCount, onShowMore, onOpen, onUnlink, onUnlinkSeries, disabled = false, className }: MovimentiTileProps) {
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => setAnnouncement(text), []);
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
                <col className="w-[96px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border">
                  <HeaderCell>Data</HeaderCell>
                  <HeaderCell>Categoria</HeaderCell>
                  <HeaderCell>Sottocategoria</HeaderCell>
                  <HeaderCell>Note</HeaderCell>
                  <HeaderCell className="text-right">Importo</HeaderCell>
                  <HeaderCell className="text-right">
                    <span className="sr-only">Azioni</span>
                  </HeaderCell>
                </tr>
              </thead>
              <tbody>
                {visible.map((expense) => (
                  <MovementTableRow
                    key={expense.id}
                    expense={expense}
                    scheduled={isScheduled(expense)}
                    disabled={disabled}
                    announce={announce}
                    onOpen={onOpen}
                    onUnlink={onUnlink}
                    onUnlinkSeries={onUnlinkSeries}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Below desktop: flat rows. */}
          <ul className="mt-2 flex flex-col divide-y divide-border desktop:hidden">
            {visible.map((expense) => (
              <MovementListRow
                key={expense.id}
                expense={expense}
                scheduled={isScheduled(expense)}
                disabled={disabled}
                announce={announce}
                onOpen={onOpen}
                onUnlink={onUnlink}
                onUnlinkSeries={onUnlinkSeries}
              />
            ))}
          </ul>
        </>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {hidden > 0 && (
        <div className="mt-3">
          <Button variant="outline" size="sm" className="h-11 w-full desktop:h-8 desktop:w-auto" onClick={onShowMore}>
            Mostra altre <span className="font-mono tabular-nums">{Math.min(hidden, MOVEMENTS_PAGE_SIZE)}</span>
          </Button>
        </div>
      )}
    </Tile>
  );
}
