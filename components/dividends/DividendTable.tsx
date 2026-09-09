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
 * footer prints two totals, and an announced row's net is muted instead of sign-coloured.
 */
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Dividend } from '@/types/dividend';
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
        className="inline-flex w-full items-center justify-end gap-1 transition-colors hover:text-foreground"
        aria-label={`Ordina per ${label}`}
      >
        <span>{label}</span>
        {active && (sortDirection === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
      </button>
    </th>
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stored WITH the list length it was opened under: when the filters change the length, the
  // key stops matching and the page falls back to the first one with no effect and no extra render.
  const [pageState, setPageState] = useState<{ key: number; page: number }>({ key: 0, page: 1 });
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    return () => {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    };
  }, []);

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

  const formatDay = (date: Date | string | Timestamp): string => format(toDate(date), 'dd/MM/yyyy', { locale: it });

  /**
   * 2-click inline delete — first click arms (3s auto-disarm), second executes. Unchanged from
   * before the redesign, including the timer: the WCAG 2.2.1 debt it carries is shared with the
   * assets table and is tracked in CLAUDE.md → Known Issues.
   */
  const handleDeleteClick = (dividend: Dividend, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (pendingDeleteId === dividend.id) {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(null);
      void executeDelete(dividend);
    } else {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(dividend.id);
      pendingDeleteTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  const executeDelete = async (dividend: Dividend) => {
    try {
      setDeletingId(dividend.id);
      const response = await authenticatedFetch(`/api/dividends/${dividend.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Errore nell'eliminazione del dividendo");
      }
      toast.success('Dividendo eliminato con successo');
      onRefresh();
    } catch (error) {
      console.error('Error deleting dividend:', error);
      toast.error(error instanceof Error ? error.message : "Errore nell'eliminazione del dividendo");
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
      {/* Below desktop: flat rows, no cards. Tapping one opens the record dialog. */}
      <div className="flex flex-col divide-y divide-border desktop:hidden">
        {paginatedDividends.map((dividend) => {
          const announced = !isPaid(dividend, now);
          return (
            <button
              key={dividend.id}
              type="button"
              onClick={(event) => onOpenDetails(dividend, event.currentTarget)}
              className={cn(
                'flex min-h-11 w-full items-center gap-3 py-2.5 text-left transition-colors motion-reduce:transition-none',
                'hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                activeDividendId === dividend.id && 'bg-muted/40'
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium">{dividend.assetTicker || dividend.assetName}</span>
                <span className="truncate text-[11px] text-muted-foreground">
                  {dividendTypeLabels[dividend.dividendType]} · {formatDay(dividend.paymentDate)}
                  {dividend.isProvisional && ' · provvisoria'}
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
                <span className="sr-only">Azioni</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedDividends.map((dividend) => {
              const announced = !isPaid(dividend, now);
              return (
                <tr
                  key={dividend.id}
                  onClick={(event) => onOpenDetails(dividend, event.currentTarget as HTMLElement)}
                  className={cn(
                    'cursor-pointer border-t border-border transition-colors motion-reduce:transition-none hover:bg-muted/30',
                    activeDividendId === dividend.id && 'bg-muted/40'
                  )}
                >
                  <th scope="row" className={cn(CELL, 'pr-3 text-left font-medium')}>
                    <span className="flex items-center gap-1.5">
                      <span className="truncate">{dividend.assetTicker || dividend.assetName}</span>
                      {announced && (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 border-warning-border px-1.5 py-0 text-[10px] font-normal text-warning-foreground"
                        >
                          Attesa
                        </Badge>
                      )}
                      {dividend.isProvisional && (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 border-warning-border px-1.5 py-0 text-[10px] font-normal text-warning-foreground"
                        >
                          Provvisoria
                        </Badge>
                      )}
                    </span>
                  </th>
                  <td className={cn(CELL, 'pl-3 text-muted-foreground')}>
                    {dividendTypeLabels[dividend.dividendType]}
                  </td>
                  <td className={cn(CELL, NUM, 'pl-3 text-muted-foreground')}>{formatDay(dividend.exDate)}</td>
                  <td className={cn(CELL, NUM, 'pl-3')}>{formatDay(dividend.paymentDate)}</td>
                  <td className={cn(CELL, NUM, 'pl-3 text-muted-foreground')}>
                    {dividend.dividendPerShare > 0 ? formatNumber(dividend.dividendPerShare, 4) : '—'}
                  </td>
                  <td className={cn(CELL, NUM, 'pl-3 text-muted-foreground')}>{formatNumber(dividend.quantity, 0)}</td>
                  <td className={cn(CELL, NUM, 'pl-3')}>
                    <AmountWithConversion
                      originalAmount={dividend.grossAmount}
                      eurAmount={dividend.grossAmountEur}
                      currency={dividend.currency}
                    />
                  </td>
                  <td className={cn(CELL, NUM, 'pl-3 text-muted-foreground')}>
                    <AmountWithConversion
                      originalAmount={dividend.taxAmount}
                      eurAmount={dividend.taxAmountEur}
                      currency={dividend.currency}
                    />
                  </td>
                  <td className={cn(CELL, NUM, 'pl-3 font-semibold', announced ? 'text-muted-foreground' : 'text-positive')}>
                    <AmountWithConversion
                      originalAmount={dividend.netAmount}
                      eurAmount={dividend.netAmountEur}
                      currency={dividend.currency}
                    />
                  </td>
                  <td className={cn(CELL, 'pl-3')}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(dividend);
                        }}
                        disabled={isDemo || deletingId === dividend.id}
                        aria-label={isDemo ? 'Modifica — non disponibile in modalità demo' : 'Modifica'}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant={pendingDeleteId === dividend.id ? 'destructive' : 'ghost'}
                        size="sm"
                        onClick={(e) => handleDeleteClick(dividend, e)}
                        disabled={isDemo || deletingId === dividend.id}
                        aria-label={isDemo ? 'Elimina — non disponibile in modalità demo' : 'Elimina'}
                      >
                        {pendingDeleteId === dividend.id ? 'Conferma' : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>

          {showTotals && (
            <tfoot>
              {totals.received.count > 0 && (
                <tr className="border-t border-border">
                  <th scope="row" colSpan={6} className="py-3 text-left text-[12px] font-medium text-muted-foreground">
                    Incassate · {totals.received.count} {totals.received.count === 1 ? 'voce' : 'voci'}
                  </th>
                  <td className={cn(NUM, 'py-3 pl-3 text-[13px] font-semibold')}>{formatCurrency(totals.received.gross)}</td>
                  <td className={cn(NUM, 'py-3 pl-3 text-[13px] text-muted-foreground')}>
                    {formatCurrency(totals.received.tax)}
                  </td>
                  <td className={cn(NUM, 'py-3 pl-3 text-[13px] font-semibold text-positive')}>
                    {formatCurrency(totals.received.net)}
                  </td>
                  <td />
                </tr>
              )}
              {/* Never a single grand total: announced money is not in the account. */}
              {totals.announced.count > 0 && (
                <tr>
                  <th scope="row" colSpan={6} className="pb-3 text-left text-[12px] font-medium text-muted-foreground">
                    Annunciate · {totals.announced.count} {totals.announced.count === 1 ? 'voce' : 'voci'}
                  </th>
                  <td className={cn(NUM, 'pb-3 pl-3 text-[13px] text-muted-foreground')}>
                    {formatCurrency(totals.announced.gross)}
                  </td>
                  <td className={cn(NUM, 'pb-3 pl-3 text-[13px] text-muted-foreground')}>
                    {formatCurrency(totals.announced.tax)}
                  </td>
                  <td className={cn(NUM, 'pb-3 pl-3 text-[13px] font-semibold text-muted-foreground')}>
                    {formatCurrency(totals.announced.net)}
                  </td>
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
              className="h-8 w-8"
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
              className="h-8 w-8"
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              aria-label="Pagina successiva"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
