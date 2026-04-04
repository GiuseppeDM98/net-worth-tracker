/**
 * Dividend tracking with filtering, CSV export, and Borsa Italiana scraping
 *
 * Features:
 * - Multi-filter: Asset, Type, Date Range
 * - CSV Export: Proper escaping for Excel/Sheets compatibility
 * - Borsa Italiana Scraping: Sequential API calls to avoid rate limits
 *
 * Scraping Strategy: Sequential (not parallel) to prevent server overload
 * and potential IP blocking from Borsa Italiana.
 */
'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cardItem, pageVariants, tableShellSettle } from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { Dividend, DividendType } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { DividendDialog } from './DividendDialog';
import { DividendTable } from './DividendTable';
import { DividendCalendar } from './DividendCalendar';
import { DividendStats } from './DividendStats';
import { DividendStatsSkeleton } from './DividendStatsSkeleton';
import { DividendRecordDetailsDialog } from './DividendRecordDetailsDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { CalendarDays, Download, Filter, ListFilter, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { toDate } from '@/lib/utils/dateHelpers';
import { cn } from '@/lib/utils';

const dividendTypeLabels: Record<DividendType, string> = {
  ordinary: 'Ordinario',
  extraordinary: 'Straordinario',
  interim: 'Interim',
  final: 'Finale',
  coupon: 'Cedola',
  finalPremium: 'Premio Finale',
};

interface DividendTrackingTabProps {
  dividends: Dividend[];
  assets: Asset[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function DividendTrackingTab({ dividends, assets, loading, onRefresh }: DividendTrackingTabProps) {
  const { user } = useAuth();
  const [scraping, setScraping] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDividend, setSelectedDividend] = useState<Dividend | null>(null);
  const [detailDividend, setDetailDividend] = useState<Dividend | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailDialogStyle, setDetailDialogStyle] = useState<CSSProperties | undefined>(undefined);
  const detailDialogRef = useRef<HTMLDivElement | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);

  // Filters
  const [assetFilter, setAssetFilter] = useState<string>('__all__');
  const [typeFilter, setTypeFilter] = useState<string>('__all__');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // View mode (table or calendar)
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const hasActiveFilters = assetFilter !== '__all__' || typeFilter !== '__all__' || startDate !== undefined || endDate !== undefined;

  // Derive filtered list synchronously — no extra render on filter change.
  const filteredDividends = useMemo(() => {
    let filtered = [...dividends];

    // Filter by asset
    if (assetFilter && assetFilter !== '__all__') {
      filtered = filtered.filter((d) => d.assetId === assetFilter);
    }

    // Filter by type
    if (typeFilter && typeFilter !== '__all__') {
      filtered = filtered.filter((d) => d.dividendType === typeFilter);
    }

    // Filter by date range (using paymentDate for better UX - users care when money arrives)
    if (startDate) {
      filtered = filtered.filter((d) => toDate(d.paymentDate) >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((d) => toDate(d.paymentDate) <= endDate);
    }

    return filtered;
  }, [dividends, assetFilter, typeFilter, startDate, endDate]);

  const focusedDate = useMemo(() => {
    if (!startDate || !endDate) return null;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (
      start.getFullYear() === end.getFullYear() &&
      start.getMonth() === end.getMonth() &&
      start.getDate() === end.getDate()
    ) {
      return start;
    }

    return null;
  }, [startDate, endDate]);
  const focusSummary = useMemo(() => {
    if (!focusedDate) return null;

    const matchingDividends = filteredDividends.filter((dividend) => {
      const paymentDate = toDate(dividend.paymentDate);
      return (
        paymentDate.getFullYear() === focusedDate.getFullYear() &&
        paymentDate.getMonth() === focusedDate.getMonth() &&
        paymentDate.getDate() === focusedDate.getDate()
      );
    });
    const totalNet = matchingDividends.reduce((sum, dividend) => sum + (dividend.netAmountEur ?? dividend.netAmount), 0);

    return {
      count: matchingDividends.length,
      totalNet,
    };
  }, [filteredDividends, focusedDate]);

  const handleCreate = () => {
    setSelectedDividend(null);
    setDialogOpen(true);
  };

  const handleEdit = (dividend: Dividend) => {
    setSelectedDividend(dividend);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setSelectedDividend(null);
  };

  const handleDialogSuccess = async () => {
    await onRefresh();
  };

  useEffect(() => {
    if (!detailDialogOpen) {
      setDetailDialogStyle(undefined);
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDetailDialogStyle(undefined);
      return;
    }

    const frameId = requestAnimationFrame(() => {
      const trigger = detailTriggerRef.current;
      const dialog = detailDialogRef.current;

      if (!trigger || !dialog) {
        setDetailDialogStyle(undefined);
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const dialogRect = dialog.getBoundingClientRect();
      const originX = triggerRect.left + (triggerRect.width / 2) - dialogRect.left;
      const originY = triggerRect.top + (triggerRect.height / 2) - dialogRect.top;

      setDetailDialogStyle({
        transformOrigin: `${originX}px ${originY}px`,
      });
    });

    return () => cancelAnimationFrame(frameId);
  }, [detailDialogOpen]);

  const handleScrapeAll = async () => {
    if (!user) return;

    const assetsWithIsin = assets.filter((a) => a.isin && a.isin.trim() !== '');

    if (assetsWithIsin.length === 0) {
      toast.error('Nessun asset con ISIN trovato per lo scraping');
      return;
    }

    const confirmScrape = window.confirm(
      `Vuoi scaricare i dividendi per ${assetsWithIsin.length} asset con ISIN?\n\n` +
      `Questa operazione potrebbe richiedere alcuni minuti.`
    );

    if (!confirmScrape) return;

    try {
      setScraping(true);
      let successCount = 0;
      let failedCount = 0;

      for (const asset of assetsWithIsin) {
        try {
          const response = await authenticatedFetch('/api/dividends/scrape', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: user.uid,
              assetId: asset.id,
            }),
          });

          if (response.ok) {
            const result = await response.json();
            if (result.scraped > 0) {
              successCount++;
            }
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error(`Error scraping ${asset.ticker}:`, error);
          failedCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`Scaricati dividendi per ${successCount} asset`);
        await onRefresh();
      } else {
        toast.warning('Nessun nuovo dividendo trovato');
      }

      if (failedCount > 0) {
        toast.warning(`${failedCount} asset hanno fallito lo scraping`);
      }
    } catch (error) {
      console.error('Error scraping dividends:', error);
      toast.error('Errore durante lo scraping dei dividendi');
    } finally {
      setScraping(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredDividends.length === 0) {
      toast.error('Nessun dividendo da esportare');
      return;
    }

    // CSV headers
    const headers = [
      'Asset Ticker',
      'Asset Name',
      'Ex-Date',
      'Payment Date',
      'Dividend Per Share',
      'Quantity',
      'Gross Amount',
      'Tax Amount',
      'Net Amount',
      'Currency',
      'Type',
      'Notes',
    ];

    // CSV rows
    const rows = filteredDividends.map((d) => {
      const exDate = toDate(d.exDate);
      const paymentDate = toDate(d.paymentDate);

      return [
        d.assetTicker,
        d.assetName,
        format(exDate, 'dd/MM/yyyy', { locale: it }),
        format(paymentDate, 'dd/MM/yyyy', { locale: it }),
        d.dividendPerShare.toFixed(4),
        d.quantity.toString(),
        d.grossAmount.toFixed(2),
        d.taxAmount.toFixed(2),
        d.netAmount.toFixed(2),
        d.currency,
        dividendTypeLabels[d.dividendType],
        d.notes || '',
      ];
    });

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => {
          // Escape commas and quotes in cell content
          const escaped = cell.toString().replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',')
      ),
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `dividendi_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`Esportati ${filteredDividends.length} dividendi in CSV`);
  };

  const clearFilters = () => {
    setAssetFilter('__all__');
    setTypeFilter('__all__');
    setStartDate(undefined);
    setEndDate(undefined);
  };

  /**
   * Handle date click from calendar view
   * Filters dividends to show only those on the selected date.
   * A visual indicator is shown to make the filter clear to users.
   */
  const handleCalendarDateClick = (date: Date) => {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    setStartDate(startOfDay);
    setEndDate(endOfDay);
  };

  const handleOpenDetails = (dividend: Dividend, triggerElement: HTMLElement) => {
    detailTriggerRef.current = triggerElement;
    setDetailDividend(dividend);
    setDetailDialogOpen(true);
  };

  // Use the same skeleton as DividendStats so the outer fetch (dividends/assets)
  // and the inner fetch (stats API) share a continuous visual — no flash between the two.
  if (loading) {
    return <DividendStatsSkeleton />;
  }

  return (
    <motion.div variants={pageVariants} initial="hidden" animate="visible" className="space-y-6">
      {/* Action Buttons Row */}
      <motion.div variants={cardItem} initial="hidden" animate="visible" transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1], delay: 0 }} className="space-y-2">
        <div className="flex flex-col desktop:flex-row desktop:flex-wrap desktop:items-center gap-2">
          <Button onClick={handleCreate} className="dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600">
            <Plus className="h-4 w-4 mr-2" />
            Aggiungi Dividendo
          </Button>
          <Button
            onClick={handleScrapeAll}
            variant="outline"
            disabled={scraping}
            title="Scarica manualmente tutti i dividendi storici per i tuoi asset con ISIN"
          >
            {scraping ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Scaricamento...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Scarica Tutti (Manuale)
              </>
            )}
          </Button>
          <Button onClick={handleExportCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Esporta CSV
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          💡 I dividendi recenti vengono scaricati automaticamente ogni giorno.
          Usa "Scarica Tutti" solo per importare dividendi storici o forzare un refresh.
        </p>
      </motion.div>

      {/* Filters Row — positioned at top so they affect both charts and table */}
      <motion.div variants={cardItem} initial="hidden" animate="visible" transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1], delay: 0.1 }} className="rounded-md border p-4 bg-muted/50">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Filtri</h3>
            <p className="text-xs text-muted-foreground">
              Calendario, metriche e lista restano allineati sullo stesso contesto.
            </p>
          </div>
          {hasActiveFilters && (
            <div className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
              {filteredDividends.length} risultati
            </div>
          )}
        </div>
        <div className="grid gap-4 desktop:grid-cols-4">
          {/* Asset Filter */}
          <div className="space-y-2">
            <Label htmlFor="assetFilter">Asset</Label>
            <Select value={assetFilter} onValueChange={setAssetFilter}>
              <SelectTrigger id="assetFilter" className="w-full">
                <SelectValue placeholder="Tutti gli asset" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutti gli asset</SelectItem>
                {assets.map((asset) => (
                  <SelectItem key={asset.id} value={asset.id}>
                    {asset.ticker || asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type Filter */}
          <div className="space-y-2">
            <Label htmlFor="typeFilter">Tipo</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="typeFilter" className="w-full">
                <SelectValue placeholder="Tutti i tipi" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutti i tipi</SelectItem>
                {Object.entries(dividendTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Start Date */}
          <div className="space-y-2">
            <Label htmlFor="startDate">Data Inizio</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate ? format(startDate, 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                const dateString = e.target.value;
                if (dateString) {
                  const date = new Date(dateString + 'T00:00:00');
                  if (!isNaN(date.getTime())) {
                    setStartDate(date);
                  }
                } else {
                  setStartDate(undefined);
                }
              }}
            />
          </div>

          {/* End Date */}
          <div className="space-y-2">
            <Label htmlFor="endDate">Data Fine</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate ? format(endDate, 'yyyy-MM-dd') : ''}
              onChange={(e) => {
                const dateString = e.target.value;
                if (dateString) {
                  const date = new Date(dateString + 'T00:00:00');
                  if (!isNaN(date.getTime())) {
                    setEndDate(date);
                  }
                } else {
                  setEndDate(undefined);
                }
              }}
            />
          </div>
        </div>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {focusedDate
                ? `Focus attivo su ${format(focusedDate, 'dd/MM/yyyy', { locale: it })}`
                : 'I filtri attivi aggiornano statistiche, calendario e tabella in modo coerente.'}
            </p>
            <Button onClick={clearFilters} variant="ghost" size="sm">
              Cancella Filtri
            </Button>
          </div>
        )}
      </motion.div>

      {/* Stats Component — receives active filters so charts reflect current selection */}
      <motion.div variants={cardItem} initial="hidden" animate="visible" transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1], delay: 0.2 }}>
      <DividendStats
        startDate={startDate}
        endDate={endDate}
        assetId={assetFilter !== '__all__' ? assetFilter : undefined}
      />
      </motion.div>

      {/* View Mode Toggle */}
      <motion.div variants={cardItem} initial="hidden" animate="visible" transition={{ duration: 0.4, ease: [0.25, 1, 0.5, 1], delay: 0.3 }}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-border pb-3 desktop:flex-row desktop:items-end desktop:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Workspace</p>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                onClick={() => setViewMode('table')}
                className={cn('rounded-b-none', viewMode === 'table' && 'dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600')}
              >
                <ListFilter className="mr-2 h-4 w-4" />
                Tabella
              </Button>
              <Button
                variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                onClick={() => setViewMode('calendar')}
                className={cn('rounded-b-none', viewMode === 'calendar' && 'dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600')}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Calendario
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {viewMode === 'table'
              ? 'Apri un record per leggere il dettaglio senza entrare subito in modifica.'
              : 'Seleziona un giorno per filtrare la lista sullo stesso contesto temporale.'}
          </div>
        </div>

        {focusedDate && focusSummary && (
          <motion.div
            variants={tableShellSettle}
            initial="inactive"
            animate="visible"
            className="flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:bg-blue-950/20 desktop:flex-row desktop:items-center desktop:justify-between"
          >
            <div className="flex items-start gap-3">
              <Filter className="mt-0.5 h-4 w-4 text-blue-700 dark:text-blue-400" />
              <div className="text-sm">
                <p className="font-medium text-blue-900 dark:text-blue-200">
                  Focus attivo: {format(focusedDate, 'dd/MM/yyyy', { locale: it })}
                </p>
                <p className="text-blue-800/80 dark:text-blue-300/80">
                  {focusSummary.count} {focusSummary.count === 1 ? 'pagamento' : 'pagamenti'} · netto previsto {focusSummary.totalNet.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                </p>
              </div>
            </div>
            <Button
              onClick={clearFilters}
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-blue-700 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/30"
            >
              Cancella
            </Button>
          </motion.div>
        )}

        {/* Conditional Rendering: Table or Calendar */}
        {viewMode === 'table' ? (
          <DividendTable
            dividends={filteredDividends}
            onEdit={handleEdit}
            onOpenDetails={handleOpenDetails}
            onRefresh={onRefresh}
            showTotals={hasActiveFilters}
            activeDividendId={detailDividend?.id ?? null}
          />
        ) : (
          <DividendCalendar
            dividends={filteredDividends}
            onDateClick={handleCalendarDateClick}
            selectedDate={focusedDate}
          />
        )}
      </div>

      </motion.div>

      {/* Dividend Dialog */}
      <DividendDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        dividend={selectedDividend}
        onSuccess={handleDialogSuccess}
      />

      <DividendRecordDetailsDialog
        open={detailDialogOpen}
        dividend={detailDividend}
        onOpenChange={(open) => {
          setDetailDialogOpen(open);
          if (!open) {
            setDetailDialogStyle(undefined);
          }
        }}
        onEdit={handleEdit}
        dialogRef={detailDialogRef}
        style={detailDialogStyle}
      />
    </motion.div>
  );
}
