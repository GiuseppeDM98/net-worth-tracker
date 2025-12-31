'use client';

import { useMemo } from 'react';
import type {
  Asset,
  MonthlySnapshot,
  AssetHistoryDisplayMode,
  AssetHistoryDateFilter
} from '@/types/assets';
import { transformPriceHistoryData } from '@/lib/utils/assetPriceHistoryUtils';
import { formatCurrency, formatNumber } from '@/lib/services/chartService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AssetPriceHistoryTableProps {
  assets: Asset[];
  snapshots: MonthlySnapshot[];
  filterYear?: number; // undefined = show all years
  filterStartDate?: AssetHistoryDateFilter; // Optional start date filter (overrides filterYear)
  displayMode?: AssetHistoryDisplayMode; // 'price' or 'totalValue' (default: 'price')
  showTotalRow?: boolean; // Show total row at bottom (default: false)
  loading: boolean;
  onRefresh: () => Promise<void>;
}

// CSS classes for cell color coding
const colorClasses = {
  green: 'bg-green-50 text-green-700 font-medium',
  red: 'bg-red-50 text-red-700 font-medium',
  neutral: 'bg-gray-50 text-gray-700',
};

export function AssetPriceHistoryTable({
  assets,
  snapshots,
  filterYear,
  filterStartDate,
  displayMode = 'price',
  showTotalRow = false,
  loading,
  onRefresh,
}: AssetPriceHistoryTableProps) {
  // Transform snapshot data into table format
  const tableData = useMemo(
    () => transformPriceHistoryData(snapshots, assets, filterYear, filterStartDate, displayMode),
    [snapshots, assets, filterYear, filterStartDate, displayMode]
  );

  const { assets: assetRows, monthColumns, totalRow } = tableData;

  return (
    <div className="space-y-4">
      {/* Header with title and refresh button */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Storico Prezzi {filterYear || 'Completo'}
          </h2>
          <p className="text-sm text-gray-600">
            Prezzi mensili da snapshot con variazioni month-over-month
          </p>
        </div>
        <Button onClick={onRefresh} disabled={loading} variant="outline">
          <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Aggiorna
        </Button>
      </div>

      {/* Table Container - Horizontal Scroll */}
      <div className="overflow-x-auto max-h-[600px] border rounded-lg">
        {assetRows.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <p className="text-lg font-semibold">Nessun dato storico disponibile</p>
            <p className="text-sm mt-2">
              Crea uno snapshot mensile per iniziare a tracciare i prezzi.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-white z-20">
              <TableRow>
                {/* Sticky first column - Asset name */}
                <TableHead className="sticky left-0 bg-white z-10 min-w-[200px] border-r">
                  Asset
                </TableHead>
                {/* Month columns */}
                {monthColumns.map((month) => (
                  <TableHead key={month.key} className="text-right min-w-[120px]">
                    {month.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetRows.map((asset) => (
                <TableRow key={asset.assetId}>
                  {/* Sticky first column: asset ticker + name + "Venduto" badge */}
                  <TableCell className="sticky left-0 bg-white z-10 border-r">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold text-sm">{asset.ticker}</div>
                        <div className="text-xs text-gray-500">{asset.name}</div>
                      </div>
                      {asset.isDeleted && (
                        <Badge variant="outline" className="text-red-600 border-red-300">
                          Venduto
                        </Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Price cells with color coding */}
                  {monthColumns.map((month) => {
                    const cell = asset.months[month.key];

                    return (
                      <TableCell
                        key={month.key}
                        className={cn(
                          'text-right min-w-[100px]',
                          cell.price === null ? 'text-gray-400' : colorClasses[cell.colorCode]
                        )}
                      >
                        {cell.price === null ? (
                          <span className="text-gray-400">-</span>
                        ) : (
                          <div>
                            {/* CONDITIONAL DISPLAY LOGIC */}
                            <div className="font-medium">
                              {displayMode === 'totalValue' || cell.price === 1
                                ? formatCurrency(cell.totalValue || 0)  // Show totalValue if mode=totalValue OR price=1
                                : formatCurrency(cell.price)             // Otherwise show price
                              }
                            </div>
                            {cell.change !== undefined && (
                              <div
                                className={cn(
                                  'text-xs mt-0.5',
                                  cell.change > 0 && 'text-green-600',
                                  cell.change < 0 && 'text-red-600'
                                )}
                              >
                                {cell.change > 0 ? '+' : ''}
                                {formatNumber(cell.change, 2)}%
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>

            {/* Total Row - Only shown if showTotalRow is true */}
            {showTotalRow && totalRow && (
              <TableFooter>
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell className="sticky left-0 bg-muted z-10">
                    Totale
                  </TableCell>
                  {monthColumns.map((monthCol) => {
                    const total = totalRow.totals[monthCol.key] || 0;
                    return (
                      <TableCell key={monthCol.key} className="text-right min-w-[100px]">
                        {formatCurrency(total)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </div>
    </div>
  );
}
