/**
 * Paginated dividend table with sorting, currency conversion, and inline delete.
 *
 * Features:
 * - Three-way sort toggle: asc → desc → default (exDate desc)
 * - Smart currency display: shows EUR conversion when available
 * - Pagination: 50 items per page
 * - 2-click inline delete (consistent with ExpenseTrackingTab and Patrimonio pages)
 */
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Dividend } from '@/types/dividend';
import { Timestamp } from 'firebase/firestore';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Edit, Trash2, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { tableShellSettle } from '@/lib/utils/motionVariants';
import { cn } from '@/lib/utils';
import { dividendTypeLabels, dividendTypeBadgeColor } from '@/lib/constants/dividendTypes';

const ITEMS_PER_PAGE = 50;

interface DividendTableProps {
  dividends: Dividend[];
  onEdit: (dividend: Dividend) => void;
  onOpenDetails: (dividend: Dividend, triggerElement: HTMLElement) => void;
  onRefresh: () => void;
  showTotals?: boolean;
  activeDividendId?: string | null;
  isDemo?: boolean;
}

/**
 * Displays an amount with an optional EUR-conversion tooltip.
 * Extracted to module level to avoid re-creation on every parent render.
 *
 * When the original currency is EUR (or no conversion is available), the raw
 * amount is shown. Otherwise the EUR equivalent is shown with an info icon
 * and a tooltip that reveals the original value.
 */
function AmountWithConversion({
  originalAmount,
  eurAmount,
  currency,
  textColor = '',
}: {
  originalAmount: number;
  eurAmount?: number;
  currency: string;
  textColor?: string;
}) {
  const isEur = currency.toUpperCase() === 'EUR';
  const hasConversion = !isEur && eurAmount !== undefined;

  if (isEur || !hasConversion) {
    return (
      <span className={textColor}>
        {formatCurrency(originalAmount, currency)}
      </span>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center justify-end gap-1 ${textColor} cursor-help`}>
            <span>{formatCurrency(eurAmount, 'EUR')}</span>
            <Info className="h-3 w-3 text-muted-foreground" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="left">
          <div className="text-xs space-y-1">
            <div>Originale: {formatCurrency(originalAmount, currency)}</div>
            <div className="text-muted-foreground">Convertito al tasso corrente</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
}: DividendTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<'exDate' | 'paymentDate' | 'totalNet' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Clear pending-delete timer on unmount to prevent state updates on unmounted component
  useEffect(() => {
    return () => {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    };
  }, []);

  const totals = useMemo(() => {
    return dividends.reduce(
      (acc, div) => {
        const grossAmount = div.grossAmountEur ?? div.grossAmount;
        const taxAmount = div.taxAmountEur ?? div.taxAmount;
        const netAmount = div.netAmountEur ?? div.netAmount;
        return { gross: acc.gross + grossAmount, tax: acc.tax + taxAmount, net: acc.net + netAmount };
      },
      { gross: 0, tax: 0, net: 0 }
    );
  }, [dividends]);

  const formatDate = (date: Date | string | Timestamp): string => {
    return format(toDate(date), 'dd/MM/yyyy', { locale: it });
  };

  /**
   * 2-click inline delete — first click arms (3s auto-disarm), second click executes.
   * Consistent with ExpenseTrackingTab and the assets page patterns.
   */
  const handleDeleteClick = (dividend: Dividend, e?: React.MouseEvent) => {
    e?.stopPropagation();

    if (pendingDeleteId === dividend.id) {
      // Second click: confirm and execute
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(null);
      void executeDelete(dividend);
    } else {
      // First click: arm with 3-second auto-disarm
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(dividend.id);
      pendingDeleteTimerRef.current = setTimeout(() => setPendingDeleteId(null), 3000);
    }
  };

  const executeDelete = async (dividend: Dividend) => {
    try {
      setDeletingId(dividend.id);

      const response = await authenticatedFetch(`/api/dividends/${dividend.id}`, {
        method: 'DELETE',
      });

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

  const handleSort = (column: 'exDate' | 'paymentDate' | 'totalNet') => {
    if (sortColumn === column) {
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
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
      return [...dividends].sort((a, b) => {
        const dateA = toDate(a.exDate);
        const dateB = toDate(b.exDate);
        return dateB.getTime() - dateA.getTime();
      });
    }

    const sorted = [...dividends];
    sorted.sort((a, b) => {
      let comparison = 0;
      if (sortColumn === 'exDate' || sortColumn === 'paymentDate') {
        const dateA = toDate(a[sortColumn]);
        const dateB = toDate(b[sortColumn]);
        comparison = dateA.getTime() - dateB.getTime();
      } else if (sortColumn === 'totalNet') {
        comparison = a.netAmount - b.netAmount;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }, [dividends, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sortedDividends.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;

  const paginatedDividends = useMemo(
    () => sortedDividends.slice(startIndex, endIndex),
    [sortedDividends, startIndex, endIndex]
  );

  // Reset to page 1 when the filtered set changes
  useEffect(() => {
    setCurrentPage(1);
  }, [dividends.length]);

  const handlePreviousPage = () => setCurrentPage((prev) => Math.max(1, prev - 1));
  const handleNextPage = () => setCurrentPage((prev) => Math.min(totalPages, prev + 1));

  const SortButton = ({ column, label }: { column: 'exDate' | 'paymentDate' | 'totalNet'; label: string }) => (
    <button
      onClick={() => handleSort(column)}
      className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors w-full"
      aria-label={`Ordina per ${label}`}
    >
      <span>{label}</span>
      {sortColumn === column && (
        sortDirection === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />
      )}
    </button>
  );

  if (dividends.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-muted-foreground">Nessun dividendo trovato</p>
        <p className="text-sm text-muted-foreground mt-2">
          Clicca su "Aggiungi Dividendo" per registrare il primo dividendo
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-4"
      variants={tableShellSettle}
      initial="inactive"
      animate="visible"
    >
      {/* Mobile card view — the desktop table has 13 columns, unusable on small screens */}
      <div className="desktop:hidden space-y-3">
        {paginatedDividends.map((dividend) => (
          <div
            key={dividend.id}
            onClick={(event) => onOpenDetails(dividend, event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpenDetails(dividend, event.currentTarget);
              }
            }}
            role="button"
            tabIndex={0}
            className={cn(
              'w-full rounded-md border p-3 text-left space-y-2 transition-colors motion-reduce:transition-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'hover:bg-muted/30',
              activeDividendId === dividend.id && 'border-primary/50 bg-primary/5'
            )}
          >
            {/* Header: asset + type badge + actions */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm">{dividend.assetTicker}</div>
                <div className="text-xs text-muted-foreground truncate">{dividend.assetName}</div>
                {dividend.isProvisional && (
                  <span className="mt-0.5 inline-block text-[10px] font-medium text-amber-600 dark:text-amber-400">
                    Provvisoria · in attesa tasso FOI
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline" className={`text-xs ${dividendTypeBadgeColor[dividend.dividendType]}`}>
                  {dividendTypeLabels[dividend.dividendType]}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onEdit(dividend); }}
                  disabled={isDemo || deletingId === dividend.id}
                  title={isDemo ? 'Non disponibile in modalità demo' : 'Modifica'}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant={pendingDeleteId === dividend.id ? 'destructive' : 'ghost'}
                  size="sm"
                  onClick={(e) => handleDeleteClick(dividend, e)}
                  disabled={isDemo || deletingId === dividend.id}
                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                >
                  {pendingDeleteId === dividend.id
                    ? 'Conferma'
                    : <Trash2 className="h-4 w-4 text-destructive" />
                  }
                </Button>
              </div>
            </div>

            {/* Dates */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Ex-Date: <span className="text-foreground">{formatDate(dividend.exDate)}</span></span>
              <span>Pagamento: <span className="text-foreground">{formatDate(dividend.paymentDate)}</span></span>
            </div>

            {/* Amounts */}
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div>Lordo: <AmountWithConversion originalAmount={dividend.grossAmount} eurAmount={dividend.grossAmountEur} currency={dividend.currency} /></div>
                <div>Tasse: <AmountWithConversion originalAmount={dividend.taxAmount} eurAmount={dividend.taxAmountEur} currency={dividend.currency} textColor="text-destructive" /></div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground mb-0.5">Totale Netto</div>
                <AmountWithConversion
                  originalAmount={dividend.netAmount}
                  eurAmount={dividend.netAmountEur}
                  currency={dividend.currency}
                  textColor="text-emerald-600 dark:text-emerald-400 font-semibold text-base"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden desktop:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Asset</TableHead>
              <TableHead className="w-[100px]">
                <SortButton column="exDate" label="Ex-Date" />
              </TableHead>
              <TableHead className="w-[100px]">
                <SortButton column="paymentDate" label="Pagamento" />
              </TableHead>
              <TableHead className="text-right w-[90px]">Lordo/Azione</TableHead>
              <TableHead className="text-right w-[90px]">Tax/Azione</TableHead>
              <TableHead className="text-right w-[90px]">Netto/Azione</TableHead>
              <TableHead className="text-right w-[90px]">Costo/Az.</TableHead>
              <TableHead className="text-right w-[70px]">Azioni</TableHead>
              <TableHead className="text-right w-[110px]">Totale Lordo</TableHead>
              <TableHead className="text-right w-[110px]">Tasse</TableHead>
              <TableHead className="text-right w-[110px]">
                <SortButton column="totalNet" label="Totale Netto" />
              </TableHead>
              <TableHead className="w-[100px]">Tipo</TableHead>
              <TableHead className="w-[100px] text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedDividends.map((dividend) => (
              <TableRow
                key={dividend.id}
                className={cn(
                  'cursor-pointer transition-colors motion-reduce:transition-none',
                  'hover:bg-muted/30',
                  activeDividendId === dividend.id && 'bg-primary/5'
                )}
                onClick={(event) => onOpenDetails(dividend, event.currentTarget as HTMLElement)}
              >
                <TableCell className="font-medium text-sm">
                  <div>
                    <div className="font-semibold">{dividend.assetTicker}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[160px]">
                      {dividend.assetName}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{formatDate(dividend.exDate)}</TableCell>
                <TableCell className="text-sm">{formatDate(dividend.paymentDate)}</TableCell>
                <TableCell className="text-right text-sm">
                  {new Intl.NumberFormat('it-IT', {
                    style: 'currency',
                    currency: dividend.currency,
                    minimumFractionDigits: 4,
                  }).format(dividend.dividendPerShare)}
                </TableCell>
                <TableCell className="text-right text-sm text-destructive">
                  {new Intl.NumberFormat('it-IT', {
                    style: 'currency',
                    currency: dividend.currency,
                    minimumFractionDigits: 4,
                  }).format(dividend.taxAmount / dividend.quantity)}
                </TableCell>
                <TableCell className="text-right text-sm text-emerald-600 dark:text-emerald-400">
                  {new Intl.NumberFormat('it-IT', {
                    style: 'currency',
                    currency: dividend.currency,
                    minimumFractionDigits: 4,
                  }).format(dividend.netAmount / dividend.quantity)}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">
                  {dividend.costPerShare !== undefined
                    ? new Intl.NumberFormat('it-IT', {
                        style: 'currency',
                        currency: 'EUR',
                        minimumFractionDigits: 4,
                      }).format(dividend.costPerShare)
                    : '—'}
                </TableCell>
                <TableCell className="text-right text-sm">{dividend.quantity}</TableCell>
                <TableCell className="text-right font-medium">
                  <AmountWithConversion
                    originalAmount={dividend.grossAmount}
                    eurAmount={dividend.grossAmountEur}
                    currency={dividend.currency}
                  />
                </TableCell>
                <TableCell className="text-right font-medium">
                  <AmountWithConversion
                    originalAmount={dividend.taxAmount}
                    eurAmount={dividend.taxAmountEur}
                    currency={dividend.currency}
                    textColor="text-destructive"
                  />
                </TableCell>
                <TableCell className="text-right font-medium">
                  <AmountWithConversion
                    originalAmount={dividend.netAmount}
                    eurAmount={dividend.netAmountEur}
                    currency={dividend.currency}
                    textColor="text-emerald-600 dark:text-emerald-400"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <Badge variant="outline" className={dividendTypeBadgeColor[dividend.dividendType]}>
                      {dividendTypeLabels[dividend.dividendType]}
                    </Badge>
                    {dividend.isProvisional && (
                      <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                        Provvisoria
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); onEdit(dividend); }}
                      disabled={isDemo || deletingId === dividend.id}
                      title={isDemo ? 'Non disponibile in modalità demo' : 'Modifica'}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={pendingDeleteId === dividend.id ? 'destructive' : 'ghost'}
                      size="sm"
                      onClick={(e) => handleDeleteClick(dividend, e)}
                      disabled={isDemo || deletingId === dividend.id}
                      title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                    >
                      {pendingDeleteId === dividend.id
                        ? 'Conferma'
                        : <Trash2 className="h-4 w-4 text-destructive" />
                      }
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>

          {showTotals && dividends.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={8} className="text-right font-semibold">
                  Totale ({dividends.length}{' '}
                  {dividends.length === 1 ? 'dividendo' : 'dividendi'}):
                </TableCell>
                <TableCell className="text-right font-bold">
                  {formatCurrency(totals.gross)}
                </TableCell>
                <TableCell className="text-right font-bold text-destructive">
                  {formatCurrency(totals.tax)}
                </TableCell>
                <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(totals.net)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Visualizzati {startIndex + 1}-{Math.min(endIndex, sortedDividends.length)} di{' '}
            {sortedDividends.length} dividendi
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePreviousPage} disabled={currentPage === 1}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Precedente
            </Button>
            <div className="text-sm font-medium">
              Pagina {currentPage} di {totalPages}
            </div>
            <Button variant="outline" size="sm" onClick={handleNextPage} disabled={currentPage === totalPages}>
              Successiva
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
