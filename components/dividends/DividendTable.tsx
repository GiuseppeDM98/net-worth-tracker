'use client';

import { useState, useMemo, useEffect } from 'react';
import { Dividend, DividendType } from '@/types/dividend';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Edit, Trash2, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { formatCurrency } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';

const ITEMS_PER_PAGE = 50;

interface DividendTableProps {
  dividends: Dividend[];
  onEdit: (dividend: Dividend) => void;
  onRefresh: () => void;
}

const dividendTypeLabels: Record<DividendType, string> = {
  ordinary: 'Ordinario',
  extraordinary: 'Straordinario',
  interim: 'Interim',
  final: 'Finale',
};

const dividendTypeBadgeColor: Record<DividendType, string> = {
  ordinary: 'bg-blue-100 text-blue-800 border-blue-200',
  extraordinary: 'bg-purple-100 text-purple-800 border-purple-200',
  interim: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  final: 'bg-green-100 text-green-800 border-green-200',
};

export function DividendTable({ dividends, onEdit, onRefresh }: DividendTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortColumn, setSortColumn] = useState<'exDate' | 'paymentDate' | 'totalNet' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const formatDate = (date: Date | string | Timestamp): string => {
    return format(toDate(date), 'dd/MM/yyyy', { locale: it });
  };

  /**
   * Helper component to display amount with EUR conversion if available
   */
  const AmountWithConversion = ({
    originalAmount,
    eurAmount,
    currency,
    textColor = '',
  }: {
    originalAmount: number;
    eurAmount?: number;
    currency: string;
    textColor?: string;
  }) => {
    const isEur = currency.toUpperCase() === 'EUR';
    const hasConversion = !isEur && eurAmount !== undefined;

    if (isEur || !hasConversion) {
      // Show original amount only
      return (
        <span className={textColor}>
          {formatCurrency(originalAmount, currency)}
        </span>
      );
    }

    // Show EUR amount with tooltip showing original
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
  };

  const handleDelete = async (dividend: Dividend) => {
    const confirmDelete = window.confirm(
      `Sei sicuro di voler eliminare questo dividendo?\n\n` +
      `Asset: ${dividend.assetTicker} - ${dividend.assetName}\n` +
      `Importo netto: ${formatCurrency(dividend.netAmount)}\n` +
      `Data ex-dividendo: ${formatDate(dividend.exDate)}`
    );

    if (!confirmDelete) return;

    try {
      setDeletingId(dividend.id);

      const response = await fetch(`/api/dividends/${dividend.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Errore nell\'eliminazione del dividendo');
      }

      toast.success('Dividendo eliminato con successo');
      onRefresh();
    } catch (error) {
      console.error('Error deleting dividend:', error);
      toast.error(error instanceof Error ? error.message : 'Errore nell\'eliminazione del dividendo');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSort = (column: 'exDate' | 'paymentDate' | 'totalNet') => {
    if (sortColumn === column) {
      // Toggle direction or reset
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

  // Sort dividends based on sortColumn and sortDirection
  const sortedDividends = useMemo(() => {
    if (sortColumn === null) {
      // Default sort: by exDate desc
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

  // Calculate pagination
  const totalPages = Math.ceil(sortedDividends.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;

  // Paginate sorted dividends
  const paginatedDividends = useMemo(() => {
    return sortedDividends.slice(startIndex, endIndex);
  }, [sortedDividends, startIndex, endIndex]);

  // Reset to page 1 when dividends array length changes
  useEffect(() => {
    setCurrentPage(1);
  }, [dividends.length]);

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

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
    <div className="space-y-4">
      <div className="rounded-md border">
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
              <TableRow key={dividend.id}>
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
                <TableCell className="text-right text-sm text-red-600">
                  {new Intl.NumberFormat('it-IT', {
                    style: 'currency',
                    currency: dividend.currency,
                    minimumFractionDigits: 4,
                  }).format(dividend.taxAmount / dividend.quantity)}
                </TableCell>
                <TableCell className="text-right text-sm text-green-600">
                  {new Intl.NumberFormat('it-IT', {
                    style: 'currency',
                    currency: dividend.currency,
                    minimumFractionDigits: 4,
                  }).format(dividend.netAmount / dividend.quantity)}
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
                    textColor="text-red-600"
                  />
                </TableCell>
                <TableCell className="text-right font-medium">
                  <AmountWithConversion
                    originalAmount={dividend.netAmount}
                    eurAmount={dividend.netAmountEur}
                    currency={dividend.currency}
                    textColor="text-green-600"
                  />
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={dividendTypeBadgeColor[dividend.dividendType]}
                  >
                    {dividendTypeLabels[dividend.dividendType]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(dividend)}
                      disabled={deletingId === dividend.id}
                      title="Modifica"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(dividend)}
                      disabled={deletingId === dividend.id}
                      title="Elimina"
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
            Visualizzati {startIndex + 1}-{Math.min(endIndex, sortedDividends.length)} di {sortedDividends.length} dividendi
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
