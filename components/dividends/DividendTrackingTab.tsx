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

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Dividend, DividendType } from '@/types/dividend';
import { Asset } from '@/types/assets';
import { DividendDialog } from './DividendDialog';
import { DividendTable } from './DividendTable';
import { DividendStats } from './DividendStats';
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
import { Plus, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { toDate } from '@/lib/utils/dateHelpers';

const dividendTypeLabels: Record<DividendType, string> = {
  ordinary: 'Ordinario',
  extraordinary: 'Straordinario',
  interim: 'Interim',
  final: 'Finale',
};

interface DividendTrackingTabProps {
  dividends: Dividend[];
  assets: Asset[];
  loading: boolean;
  onRefresh: () => Promise<void>;
}

export function DividendTrackingTab({ dividends, assets, loading, onRefresh }: DividendTrackingTabProps) {
  const { user } = useAuth();
  const [filteredDividends, setFilteredDividends] = useState<Dividend[]>([]);
  const [scraping, setScraping] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDividend, setSelectedDividend] = useState<Dividend | null>(null);

  // Filters
  const [assetFilter, setAssetFilter] = useState<string>('__all__');
  const [typeFilter, setTypeFilter] = useState<string>('__all__');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Apply filters whenever dividends or filter values change
  useEffect(() => {
    applyFilters();
  }, [dividends, assetFilter, typeFilter, startDate, endDate]);

  const applyFilters = () => {
    let filtered = [...dividends];

    // Filter by asset
    if (assetFilter && assetFilter !== '__all__') {
      filtered = filtered.filter((d) => d.assetId === assetFilter);
    }

    // Filter by type
    if (typeFilter && typeFilter !== '__all__') {
      filtered = filtered.filter((d) => d.dividendType === typeFilter);
    }

    // Filter by date range
    if (startDate) {
      filtered = filtered.filter((d) => toDate(d.exDate) >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter((d) => toDate(d.exDate) <= endDate);
    }

    setFilteredDividends(filtered);
  };

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
          const response = await fetch('/api/dividends/scrape', {
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Buttons Row */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleCreate}>
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
      </div>

      {/* Stats Component */}
      <DividendStats startDate={startDate} endDate={endDate} />

      {/* Filters Row */}
      <div className="rounded-md border p-4 bg-muted/50">
        <h3 className="font-semibold mb-4">Filtri</h3>
        <div className="grid gap-4 md:grid-cols-4">
          {/* Asset Filter */}
          <div className="space-y-2">
            <Label htmlFor="assetFilter">Asset</Label>
            <Select value={assetFilter} onValueChange={setAssetFilter}>
              <SelectTrigger id="assetFilter">
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
              <SelectTrigger id="typeFilter">
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
        {(assetFilter !== '__all__' || typeFilter !== '__all__' || startDate || endDate) && (
          <div className="mt-4">
            <Button onClick={clearFilters} variant="ghost" size="sm">
              Cancella Filtri
            </Button>
          </div>
        )}
      </div>

      {/* Dividend Table */}
      <DividendTable
        dividends={filteredDividends}
        onEdit={handleEdit}
        onRefresh={onRefresh}
      />

      {/* Dividend Dialog */}
      <DividendDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        dividend={selectedDividend}
        onSuccess={handleDialogSuccess}
      />
    </div>
  );
}
