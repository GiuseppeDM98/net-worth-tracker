'use client';

import { useMemo } from 'react';
import type { Asset, MonthlySnapshot, AssetHistoryDisplayMode, AssetHistoryDateFilter } from '@/types/assets';
import { transformPriceHistoryData } from '@/lib/utils/assetPriceHistoryUtils';
import { formatCurrency, formatNumber } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';

interface AssetMobileSummaryProps {
  assets: Asset[];
  snapshots: MonthlySnapshot[];
  filterYear?: number;
  filterStartDate?: AssetHistoryDateFilter;
  displayMode?: AssetHistoryDisplayMode;
  includePreviousMonthBaseline?: boolean;
  restrictToPassedAssets?: boolean;
}

/**
 * Compact 3-month summary for mobile — replaces the old "si consiglia desktop" banner.
 * Reuses the same transformPriceHistoryData as the full table, taking only the last 3 months.
 * Shown only below the desktop breakpoint (1440px); the full table handles desktop.
 */
export function AssetMobileSummary({
  assets,
  snapshots,
  filterYear,
  filterStartDate,
  displayMode = 'price',
  includePreviousMonthBaseline = false,
  restrictToPassedAssets = false,
}: AssetMobileSummaryProps) {
  const tableData = useMemo(
    () =>
      transformPriceHistoryData(snapshots, assets, {
        filterYear,
        filterStartDate,
        displayMode,
        includePreviousMonthBaseline,
        restrictToPassedAssets,
      }),
    [snapshots, assets, filterYear, filterStartDate, displayMode, includePreviousMonthBaseline, restrictToPassedAssets]
  );

  // Show only the last 3 available months
  const last3 = tableData.monthColumns.slice(-3);

  if (tableData.assets.length === 0 || last3.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground px-1">Ultimi 3 mesi</p>

      {/* Column headers */}
      <div className="grid items-center gap-2 px-1 text-xs text-muted-foreground" style={{ gridTemplateColumns: '1fr repeat(3, minmax(0, 80px))' }}>
        <span>Asset</span>
        {last3.map((m) => (
          <span key={m.key} className="text-right truncate">{m.label}</span>
        ))}
      </div>

      {/* Asset rows */}
      <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
        {tableData.assets.map((row) => (
          <div
            key={row.name}
            className="grid items-center gap-2 px-3 py-2 bg-card"
            style={{ gridTemplateColumns: '1fr repeat(3, minmax(0, 80px))' }}
          >
            {/* Asset identifier */}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{row.ticker || row.name}</p>
              {row.ticker && (
                <p className="text-xs text-muted-foreground truncate">{row.name}</p>
              )}
            </div>

            {/* Last 3 month cells */}
            {last3.map((month) => {
              const cell = row.months[month.key];
              if (!cell || cell.price === null) {
                return (
                  <span key={month.key} className="text-right text-xs text-muted-foreground">-</span>
                );
              }
              const displayValue =
                displayMode === 'totalValue' || cell.price === 1
                  ? formatCurrency(cell.totalValue || 0)
                  : formatCurrency(cell.price);
              const changeColor = cn(
                'text-xs tabular-nums text-right',
                cell.change !== undefined && cell.change > 0 && 'text-green-600',
                cell.change !== undefined && cell.change < 0 && 'text-red-600',
                (cell.change === undefined || cell.change === 0) && 'text-muted-foreground'
              );
              return (
                <div key={month.key} className="text-right">
                  <p className="text-xs font-medium text-foreground tabular-nums">{displayValue}</p>
                  {cell.change !== undefined && (
                    <p className={changeColor}>
                      {cell.change > 0 ? '+' : ''}
                      {formatNumber(cell.change, 2)}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
