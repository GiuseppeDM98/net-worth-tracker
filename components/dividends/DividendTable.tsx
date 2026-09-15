/**
 * The payments list of Cashflow › Dividendi, INSIDE the Pagamenti tile (2026-08-23).
 *
 * It is still a table where a table is right — from `desktop:` a sortable grid of ten columns —
 * but it takes the tile's cadence: 9px sub-eyebrow headers with `scope="col"`, 13px cells with
 * every number in the mono face, rows separated by a 1px `border-border` and nothing else, and
 * no box of its own (a bordered card inside a tile is a card inside a card).
 *
 * Below `desktop:` the same records are FLAT expandable-free rows, not cards, opening the
 * record dialog on tap — the per-share figures and the cost basis live there, which is why the
 * table itself carries the totals and not the derivations.
 *
 * Announced payments (payment date in the future) are never summed with received ones: the
 * footer prints two totals, and an announced row's net is muted AND chipped «Attesa» — on the
 * phone too, where until 2026-09-14 the colour of a number was the only difference between a
 * coupon in the account and one promised for December (WCAG 1.4.1).
 *
 * Keyboard and delete (2026-09-14): the instrument's name is a real `<button>` that opens the
 * record — a `<tr onClick>` was never in the Tab order, so the record was mouse-only on desktop;
 * the row's two actions name their record; and the delete is a two-click confirm ON the row
 * through `useArmedDelete` (no timer: the 3 s auto-disarm was a WCAG 2.2.1 time limit), the
 * button reading «Conferma» in words AND in its accessible name, the consequence printed in the
 * row and one live region per table speaking arm and disarm.
 */
'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Dividend, DividendType } from '@/types/dividend';
import { Timestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Edit, Trash2, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils/formatters';
import { formatNumber } from '@/lib/services/chartService';
import { toDate } from '@/lib/utils/dateHelpers';
import { tableShellSettle } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { dividendTypeLabels } from '@/lib/constants/dividendTypes';
import { isPaid } from '@/lib/utils/dividendAnalytics';
import { dividendTypeNoun } from '@/lib/utils/dividendiNarrative';
import { describeDividendDeleteConsequence, describeWriteError } from '@/lib/utils/dialogNarrative';
import { useArmedDelete } from '@/lib/hooks/useArmedDelete';

const ITEMS_PER_PAGE = 50;

interface DividendTableProps {
  dividends: Dividend[];
  onEdit: (dividend: Dividend) => void;
  onOpenDetails: (dividend: Dividend, triggerElement: HTMLElement) => void;
  onRefresh: () => void;
  /** Print the two totals rows (received / announced) under the table. */
  showTotals?: boolean;
  activeDividendId?: string | null;
  isDemo?: boolean;
  /** "Now", passed in so the received/announced split matches the rest of the tab exactly. */
  now: Date;
}

type SortColumn = 'exDate' | 'paymentDate' | 'totalNet';

const CELL = 'py-2.5 text-[13px]';
const NUM = 'text-right font-mono tabular-nums';
const STATE_BADGE_CLASS = 'h-4 shrink-0 border-warning-border px-1.5 py-0 text-[10px] font-normal text-warning-foreground';

const formatDay = (date: Date | string | Timestamp): string => format(toDate(date), 'dd/MM/yyyy', { locale: it });

/** «la cedola di BTP Valore del 10/09/2026» — how a row names itself to an action. */
function rowName(dividend: Dividend): string {
  return `${dividendTypeNoun(dividend.dividendType as DividendType)} di ${dividend.assetTicker || dividend.assetName} del ${formatDay(dividend.paymentDate)}`;
}

/**
 * An amount with an optional EUR-conversion tooltip. Module level so it is not re-created on
 * every parent render.
 */
function AmountWithConversion({
  originalAmount,
  eurAmount,
  currency,
  className,
}: {
  originalAmount: number;
  eurAmount?: number;
  currency: string;
  className?: string;
}) {
  const isEur = currency.toUpperCase() === 'EUR';
  const hasConversion = !isEur && eurAmount !== undefined;

  if (isEur || !hasConversion) {
    return <span className={className}>{formatCurrency(originalAmount, currency)}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn('inline-flex cursor-help items-center justify-end gap-1', className)}>
            {formatCurrency(eurAmount, 'EUR')}
            <Info className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">
          <div className="space-y-1 text-xs">
            <div>Originale: {formatCurrency(originalAmount, currency)}</div>
            <div className="text-muted-foreground">Convertito al tasso corrente</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The state of a payment as words: «Attesa» for an announced one, «Provvisoria» for a coupon at its floor. */
function PaymentStateBadges({ announced, provisional }: { announced: boolean; provisional: boolean }) {
  return (
    <>
      {announced && (
        <Badge variant="outline" className={STATE_BADGE_CLASS}>
          Attesa
        </Badge>
      )}
      {provisional && (
        <Badge variant="outline" className={STATE_BADGE_CLASS}>
          Provvisoria
        </Badge>
      )}
    </>
  );
}

/**
 * A sortable column header. Module level on purpose: a component defined inside a render body
 * is a new type on every render, so React remounts it and the header loses focus mid-sort.
 */
function SortHeader({
  column,
  label,
  className,
  sortColumn,
  sortDirection,
  onSort,
}: {
  column: SortColumn;
  label: string;
  className?: string;
  sortColumn: SortColumn | null;
  sortDirection: 'asc' | 'desc';
  onSort: (column: SortColumn) => void;
}) {
  const active = sortColumn === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2', className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex w-full min-h-8 -my-1.5 items-center justify-end gap-1 transition-colors hover:text-foreground"
        aria-label={`Ordina per ${label}`}
      >
        <span>{label}</span>
        {active && (sortDirection === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
  );
}

interface RowProps {
  dividend: Dividend;
  now: Date;
  active: boolean;
  isDemo: boolean;
  busy: boolean;
  onEdit: (dividend: Dividend) => void;
  onOpenDetails: (dividend: Dividend, triggerElement: HTMLElement) => void;
  onDelete: (dividend: Dividend) => void;
  announce: (text: string) => void;
}

/**
 * A desktop row, module-level because the armed state of its delete lives here. The name cell
 * holds the button that opens the record (the row's click is a convenience for the mouse; the
 * button is what the keyboard reaches and what the focus comes back to). While armed the pencil
 * gives its room to «Conferma» and the row prints what the second press does.
 */
function DesktopRow({ dividend, now, active, isDemo, busy, onEdit, onOpenDetails, onDelete, announce }: RowProps) {
  const announced = !isPaid(dividend, now);
  const name = rowName(dividend);
  const openRef = useRef<HTMLButtonElement | null>(null);
  const deleteRef = useRef<HTMLButtonElement | null>(null);
  const { armed, onClick: onArmedClick, onBlur } = useArmedDelete(deleteRef, () => onDelete(dividend));
  const wasArmed = useRef(false);
  useEffect(() => {
    if (armed) {
      wasArmed.current = true;
      announce(`Premi di nuovo per eliminare ${name}`);
    } else if (wasArmed.current) {
      wasArmed.current = false;
      announce('Eliminazione annullata');
    }
  }, [armed, announce, name]);

  const consequence = armed
    ? describeDividendDeleteConsequence({
        what: dividendTypeNoun(dividend.dividendType as DividendType),
        paymentDate: formatDay(dividend.paymentDate),
        hasExpense: !!dividend.expenseId,
      })
    : null;
  const disabled = isDemo || busy;

  return (
    <tr
      onClick={() => onOpenDetails(dividend, openRef.current ?? document.body)}
      className={cn(
        'cursor-pointer border-t border-border transition-colors motion-reduce:transition-none hover:bg-muted/30',
        active && 'bg-muted/40',
        armed && 'bg-destructive/5',
      )}
    >
      <th scope="row" className={cn(CELL, 'pr-3 text-left font-medium')}>
        <span className="flex items-center gap-1.5">
          <button
            ref={openRef}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails(dividend, event.currentTarget);
            }}
            aria-label={`Dettagli: ${name}`}
            className="truncate rounded-sm text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dividend.assetTicker || dividend.assetName}
          </button>
          <PaymentStateBadges announced={announced} provisional={!!dividend.isProvisional} />
        </span>
        {consequence && <span className="mt-1 block text-[11px] font-normal leading-[1.4] text-destructive">{consequence}</span>}
      </th>
      <td className={cn(CELL, 'pl-3 text-muted-foreground')}>{dividendTypeLabels[dividend.dividendType]}</td>
      <td className={cn(CELL, NUM, 'pl-3 text-muted-foreground')}>{formatDay(dividend.exDate)}</td>
      <td className={cn(CELL, NUM, 'pl-3')}>{formatDay(dividend.paymentDate)}</td>
      <td className={cn(CELL, NUM, 'pl-3 text-muted-foreground')}>
        {dividend.dividendPerShare > 0 ? formatNumber(dividend.dividendPerShare, 4) : '—'}
      </td>
      <td className={cn(CELL, NUM, 'pl-3 text-muted-foreground')}>{formatNumber(dividend.quantity, 0)}</td>
      <td className={cn(CELL, NUM, 'pl-3')}>
        <AmountWithConversion originalAmount={dividend.grossAmount} eurAmount={dividend.grossAmountEur} currency={dividend.currency} />
      </td>
      <td className={cn(CELL, NUM, 'pl-3 text-muted-foreground')}>
        <AmountWithConversion originalAmount={dividend.taxAmount} eurAmount={dividend.taxAmountEur} currency={dividend.currency} />
      </td>
      <td className={cn(CELL, NUM, 'pl-3 font-semibold', announced ? 'text-muted-foreground' : 'text-positive')}>
        <AmountWithConversion originalAmount={dividend.netAmount} eurAmount={dividend.netAmountEur} currency={dividend.currency} />
      </td>
      <td className={cn(CELL, 'pl-3')}>
        <div className="flex items-center justify-end gap-1">
          {!armed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(dividend);
              }}
              disabled={disabled}
              aria-label={isDemo ? 'Modifica — non disponibile in modalità demo' : `Modifica ${name}`}
            >
              <Edit className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button
            ref={deleteRef}
            variant={armed ? 'destructive' : 'ghost'}
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onArmedClick();
            }}
            onBlur={onBlur}
            disabled={disabled}
            aria-pressed={armed}
            aria-label={isDemo ? 'Elimina — non disponibile in modalità demo' : armed ? `Premi di nuovo per eliminare ${name}` : `Elimina ${name}`}
          >
            {armed ? <span className="px-1 text-xs">Conferma</span> : <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />}
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function DividendTable({
  dividends,
  onEdit,
  onOpenDetails,
  onRefresh,
  showTotals = false,
  activeDividendId,
  isDemo = false,
  now,
}: DividendTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // The table's one live region: arm and disarm are sentences, spoken here, never per row.
  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => setAnnouncement(text), []);

  // Stored WITH the list length it was opened under: when the filters change the length, the
  // key stops matching and the page falls back to the first one with no effect and no extra render.
  const [pageState, setPageState] = useState<{ key: number; page: number }>({ key: 0, page: 1 });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Received and announced are totalled apart: one is money in the account, the other a promise.
  const totals = useMemo(() => {
    return dividends.reduce(
      (acc, div) => {
        const gross = div.grossAmountEur ?? div.grossAmount;
        const tax = div.taxAmountEur ?? div.taxAmount;
        const net = div.netAmountEur ?? div.netAmount;
        const bucket = isPaid(div, now) ? acc.received : acc.announced;
        bucket.gross += gross;
        bucket.tax += tax;
        bucket.net += net;
        bucket.count += 1;
        return acc;
      },
      {
        received: { gross: 0, tax: 0, net: 0, count: 0 },
        announced: { gross: 0, tax: 0, net: 0, count: 0 },
      }
    );
  }, [dividends, now]);

  const executeDelete = async (dividend: Dividend) => {
    try {
      setDeletingId(dividend.id);
      const response = await authenticatedFetch(`/api/dividends/${dividend.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || error.error || "Errore nell'eliminazione del dividendo");
      }
      toast.success('Pagamento eliminato');
      onRefresh();
    } catch (error) {
      console.error('Error deleting dividend:', error);
      toast.error(describeWriteError(error));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') setSortDirection('asc');
      else {
        setSortColumn(null);
        setSortDirection('desc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  const sortedDividends = useMemo(() => {
    if (sortColumn === null) {
      return [...dividends].sort((a, b) => toDate(b.exDate).getTime() - toDate(a.exDate).getTime());
    }
    return [...dividends].sort((a, b) => {
      let comparison = 0;
      if (sortColumn === 'exDate' || sortColumn === 'paymentDate') {
        comparison = toDate(a[sortColumn]).getTime() - toDate(b[sortColumn]).getTime();
      } else {
        comparison = a.netAmount - b.netAmount;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [dividends, sortColumn, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedDividends.length / ITEMS_PER_PAGE));
  const currentPage = pageState.key === dividends.length ? Math.min(pageState.page, totalPages) : 1;
  const setCurrentPage = (page: number) => setPageState({ key: dividends.length, page });
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedDividends = useMemo(
    () => sortedDividends.slice(startIndex, startIndex + ITEMS_PER_PAGE),
    [sortedDividends, startIndex]
  );

  if (dividends.length === 0) {
    return <p className="py-6 text-center text-[13px] text-muted-foreground">Nessun pagamento in questo periodo.</p>;
  }

  return (
    <motion.div className="space-y-4" variants={tableShellSettle} initial="inactive" animate="visible">
      {/* Below desktop: flat rows, no cards. Tapping one opens the record dialog. The state is
          a chip here too, never the colour of the number alone. */}
      <div className="flex flex-col divide-y divide-border desktop:hidden">
        {paginatedDividends.map((dividend) => {
          const announced = !isPaid(dividend, now);
          return (
            <button
              key={dividend.id}
              type="button"
              onClick={(event) => onOpenDetails(dividend, event.currentTarget)}
              aria-label={`Dettagli: ${rowName(dividend)}${announced ? ', attesa' : ''}`}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 py-2.5 text-left transition-colors motion-reduce:transition-none',
                'hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeDividendId === dividend.id && 'bg-muted/40'
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium">{dividend.assetTicker || dividend.assetName}</span>
                  <PaymentStateBadges announced={announced} provisional={!!dividend.isProvisional} />
                </span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {dividendTypeLabels[dividend.dividendType]} · {formatDay(dividend.paymentDate)}
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 font-mono text-[13px] font-semibold tabular-nums',
                  announced ? 'text-muted-foreground' : 'text-positive'
                )}
              >
                {formatCurrency(dividend.netAmountEur ?? dividend.netAmount)}
              </span>
            </button>
          );
        })}
        {/* The two totals the desktop `tfoot` prints, so a phone never has to add them by eye. */}
        {showTotals && (totals.received.count > 0 || totals.announced.count > 0) && (
          <dl className="flex flex-col gap-1.5 pt-3">
            {totals.received.count > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[12px] text-muted-foreground">
                  Incassate · {totals.received.count} {totals.received.count === 1 ? 'voce' : 'voci'}
                </dt>
                <dd className="font-mono text-[13px] font-semibold tabular-nums text-positive">{formatCurrency(totals.received.net)}</dd>
              </div>
            )}
            {totals.announced.count > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[12px] text-muted-foreground">
                  Annunciate · {totals.announced.count} {totals.announced.count === 1 ? 'voce' : 'voci'}
                </dt>
                <dd className="font-mono text-[13px] font-semibold tabular-nums text-muted-foreground">{formatCurrency(totals.announced.net)}</dd>
              </div>
            )}
          </dl>
        )}
      </div>

      {/* Desktop: the table, scrolling inside the tile and never taking the page with it. */}
      <div className="-mx-5 hidden overflow-x-auto px-5 desktop:block">
        <table className="w-full">
          <thead>
            <tr>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 text-left')}>
                Strumento
              </th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-3 text-left')}>
                Tipo
              </th>
              <SortHeader column="exDate" label="Ex-date" className="pl-3" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <SortHeader column="paymentDate" label="Pagamento" className="pl-3" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-3 text-right')}>
                DPS lordo
              </th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-3 text-right')}>
                Quantità
              </th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-3 text-right')}>
                Lordo
              </th>
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-3 text-right')}>
                Ritenute
              </th>
              <SortHeader column="totalNet" label="Netto" className="pl-3" sortColumn={sortColumn} sortDirection={sortDirection} onSort={handleSort} />
              <th scope="col" className={cn(TILE_SUB_EYEBROW_CLASS, 'py-2 pl-3 text-right')}>
                {/* Not «Azioni»: in a dividends table the word means shares. */}
                <span className="sr-only">Modifica o elimina</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedDividends.map((dividend) => (
              <DesktopRow
                key={dividend.id}
                dividend={dividend}
                now={now}
                active={activeDividendId === dividend.id}
                isDemo={isDemo}
                busy={deletingId === dividend.id}
                onEdit={onEdit}
                onOpenDetails={onOpenDetails}
                onDelete={executeDelete}
                announce={announce}
              />
            ))}
          </tbody>

          {showTotals && (
            <tfoot>
              {totals.received.count > 0 && (
                <tr className="border-t border-border">
                  <th scope="row" colSpan={6} className="py-3 text-left text-[12px] font-medium text-muted-foreground">
                    Incassate · {totals.received.count} {totals.received.count === 1 ? 'voce' : 'voci'}
                  </th>
                  <td className={cn(NUM, 'py-3 pl-3 text-[13px] font-semibold')}>{formatCurrency(totals.received.gross)}</td>
                  <td className={cn(NUM, 'py-3 pl-3 text-[13px] text-muted-foreground')}>{formatCurrency(totals.received.tax)}</td>
                  <td className={cn(NUM, 'py-3 pl-3 text-[13px] font-semibold text-positive')}>{formatCurrency(totals.received.net)}</td>
                  <td />
                </tr>
              )}
              {/* Never a single grand total: announced money is not in the account. */}
              {totals.announced.count > 0 && (
                <tr>
                  <th scope="row" colSpan={6} className="pb-3 text-left text-[12px] font-medium text-muted-foreground">
                    Annunciate · {totals.announced.count} {totals.announced.count === 1 ? 'voce' : 'voci'}
                  </th>
                  <td className={cn(NUM, 'pb-3 pl-3 text-[13px] text-muted-foreground')}>{formatCurrency(totals.announced.gross)}</td>
                  <td className={cn(NUM, 'pb-3 pl-3 text-[13px] text-muted-foreground')}>{formatCurrency(totals.announced.tax)}</td>
                  <td className={cn(NUM, 'pb-3 pl-3 text-[13px] font-semibold text-muted-foreground')}>{formatCurrency(totals.announced.net)}</td>
                  <td />
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, sortedDividends.length)} di {sortedDividends.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 desktop:h-8 desktop:w-8"
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              aria-label="Pagina precedente"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 desktop:h-8 desktop:w-8"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label="Pagina successiva"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* The table's one live region: arm and disarm are sentences, spoken here. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </motion.div>
  );
}
