/**
 * Asset Price History Table - Historical Price/Value Tracking from Monthly Snapshots
 *
 * Displays historical asset prices or total values across months with visual indicators.
 *
 * Key Features:
 * - Sticky column for asset names (horizontal scroll with fixed first column)
 * - Dual display mode:
 *   - Price mode: Shows price per unit (€/share, $/coin, etc.)
 *   - Total value mode: Shows total position value (quantity × price)
 * - Color coding for month-over-month changes:
 *   - Green: Price/value increased vs previous month
 *   - Red: Price/value decreased vs previous month
 *   - Gray: Unchanged or first month (no previous data)
 * - YTD vs fromStart percentage calculations
 * - Handles deleted assets appearing in old snapshots
 *
 * Special Cases:
 * - Cash assets (price = 1) always show total value instead of price
 * - Missing prices in snapshots show as "—" (em dash)
 * - First month for each asset shows gray (no previous month to compare)
 *
 * Checklist: If modifying display logic, also check:
 * - lib/utils/assetPriceHistoryUtils.ts (transformation algorithm)
 * - Ensure YTD, fromStart, and lastMonthChange calculations stay in sync
 * - Summary columns (Mese Prec. %, YTD %) appear only when filterYear is set
 */
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
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
import { EmptyState, ChartEmptyIcon } from '@/components/ui/EmptyState';
import { sectionRefreshPulse, tableShellSettle } from '@/lib/utils/motionVariants';

interface AssetPriceHistoryTableProps {
  assets: Asset[];
  snapshots: MonthlySnapshot[];
  filterYear?: number; // undefined = show all years
  filterStartDate?: AssetHistoryDateFilter; // Optional start date filter (overrides filterYear)
  displayMode?: AssetHistoryDisplayMode; // 'price' or 'totalValue' (default: 'price')
  includePreviousMonthBaseline?: boolean;
  excludeCash?: boolean;
  restrictToPassedAssets?: boolean;
  showTotalRow?: boolean; // Show total row at bottom (default: false)
  loading: boolean;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
  isActiveView?: boolean;
  isLatestRefreshedView?: boolean;
  refreshToken?: number;
  lastRefreshAt?: Date | null;
}

// CSS classes for color-coded cells (visual accessibility)
// Green/red backgrounds with sufficient contrast for readability — dark variants use low-opacity overlays
const colorClasses = {
  green: 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 font-medium',
  red: 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 font-medium',
  neutral: 'bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300',
};

export function AssetPriceHistoryTable({
  assets,
  snapshots,
  filterYear,
  filterStartDate,
  displayMode = 'price',
  includePreviousMonthBaseline = false,
  excludeCash = false,
  restrictToPassedAssets = false,
  showTotalRow = false,
  loading,
  onRefresh,
  isRefreshing = false,
  isActiveView = false,
  isLatestRefreshedView = false,
  refreshToken = 0,
  lastRefreshAt = null,
}: AssetPriceHistoryTableProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isRefreshHighlighted, setIsRefreshHighlighted] = useState(false);

  // Transform snapshot data into table format
  const tableData = useMemo(
    () => transformPriceHistoryData(snapshots, assets, {
      filterYear,
      filterStartDate,
      displayMode,
      includePreviousMonthBaseline,
      excludeCash,
      restrictToPassedAssets,
    }),
    [snapshots, assets, filterYear, filterStartDate, displayMode, includePreviousMonthBaseline, excludeCash, restrictToPassedAssets]
  );

  const { assets: assetRows, monthColumns, totalRow } = tableData;

  useEffect(() => {
    if (!isActiveView || !isLatestRefreshedView || refreshToken === 0) return;
    if (prefersReducedMotion) {
      setIsRefreshHighlighted(false);
      return;
    }

    setIsRefreshHighlighted(true);
    const timerId = window.setTimeout(() => {
      setIsRefreshHighlighted(false);
    }, 520);

    return () => window.clearTimeout(timerId);
  }, [isActiveView, isLatestRefreshedView, prefersReducedMotion, refreshToken]);

  const refreshLabel = lastRefreshAt
    ? new Intl.DateTimeFormat('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(lastRefreshAt)
    : null;

  return (
    <motion.div
      initial={false}
      animate={isActiveView ? 'visible' : 'inactive'}
      variants={tableShellSettle}
      className="space-y-4"
    >
      {/* Header with title and refresh button */}
      <motion.div
        initial={false}
        animate={isRefreshHighlighted ? 'pulse' : 'idle'}
        variants={sectionRefreshPulse}
        className={cn(
          'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between',
          'border-border bg-card',
          isRefreshHighlighted && 'border-primary/30 bg-primary/5'
        )}
      >
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">
            {displayMode === 'totalValue' ? 'Storico Valori' : 'Storico Prezzi'} {filterYear || 'Completo'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {displayMode === 'totalValue' ? 'Valori mensili' : 'Prezzi mensili'} da snapshot con variazioni month-over-month
          </p>
          {refreshLabel && isActiveView ? (
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">
              Ultimo aggiornamento: {refreshLabel}
            </p>
          ) : null}
        </div>
        <Button onClick={onRefresh} disabled={loading || isRefreshing} variant="outline">
          <RefreshCw className={cn('mr-2 h-4 w-4', (loading || isRefreshing) && 'animate-spin')} />
          Aggiorna
        </Button>
      </motion.div>

      {/* Table Container - Horizontal Scroll */}
      <motion.div
        initial={false}
        animate={isRefreshHighlighted ? 'pulse' : 'idle'}
        variants={sectionRefreshPulse}
        className={cn(
          'overflow-x-auto max-h-[600px] rounded-xl border text-xs sm:text-sm',
          'border-border bg-background',
          isRefreshHighlighted && 'border-primary/20 shadow-sm'
        )}
      >
        {assetRows.length === 0 ? (
          <EmptyState
            icon={<ChartEmptyIcon />}
            title="Nessun dato storico disponibile"
            description="Crea uno snapshot mensile per iniziare a tracciare i prezzi."
          />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-white dark:bg-gray-900 z-20">
              <TableRow>
                {/* Sticky first column - Asset name */}
                <TableHead className="sticky left-0 bg-white dark:bg-gray-900 z-10 min-w-[140px] sm:min-w-[200px] border-r">
                  Asset
                </TableHead>
                {/* Month columns */}
                {monthColumns.map((month) => (
                  <TableHead key={month.key} className="text-right min-w-[80px] sm:min-w-[120px]">
                    {month.label}
                  </TableHead>
                ))}
                {/* Mese Prec. % column - shown only for current year filter */}
                {filterYear !== undefined && (
                  <TableHead className="text-right min-w-[70px] sm:min-w-[100px] bg-amber-50 dark:bg-amber-950/20 border-l-2 border-amber-300 dark:border-amber-800">
                    Mese Prec. %
                  </TableHead>
                )}
                {/* YTD column - shown only for current year filter */}
                {filterYear !== undefined && (
                  <TableHead className="text-right min-w-[70px] sm:min-w-[100px] bg-blue-50 dark:bg-blue-950/20 border-l-2 border-blue-300 dark:border-blue-800">
                    YTD %
                  </TableHead>
                )}
                {/* From Start column - shown only when filterStartDate is set */}
                {filterStartDate !== undefined && (
                  <TableHead className="text-right min-w-[70px] sm:min-w-[100px] bg-purple-50 dark:bg-purple-950/20 border-l-2 border-purple-300 dark:border-purple-800">
                    From Start %
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetRows.map((asset) => (
                <TableRow key={asset.name}>
                  {/* Sticky first column: asset ticker + name + "Venduto" badge */}
                  <TableCell className="sticky left-0 bg-white dark:bg-gray-900 z-10 border-r">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="font-semibold text-sm">{asset.ticker}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{asset.name}</div>
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

                  {/* Mese Prec. % cell - shown only for current year filter */}
                  {filterYear !== undefined && (
                    <TableCell className="text-right min-w-[70px] sm:min-w-[100px] bg-amber-50 dark:bg-amber-950/20 border-l-2 border-amber-300 dark:border-amber-800">
                      {asset.lastMonthChange !== undefined ? (
                        <div className="font-bold">
                          <span
                            className={cn(
                              'text-base',
                              asset.lastMonthChange > 0 && 'text-green-600',
                              asset.lastMonthChange < 0 && 'text-red-600',
                              asset.lastMonthChange === 0 && 'text-gray-600 dark:text-gray-400'
                            )}
                          >
                            {asset.lastMonthChange > 0 ? '+' : ''}
                            {formatNumber(asset.lastMonthChange, 2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  )}

                  {/* YTD cell - shown only for current year filter */}
                  {filterYear !== undefined && (
                    <TableCell className="text-right min-w-[70px] sm:min-w-[100px] bg-blue-50 dark:bg-blue-950/20 border-l-2 border-blue-300 dark:border-blue-800">
                      {asset.ytd !== undefined ? (
                        <div className="font-bold">
                          <span
                            className={cn(
                              'text-base',
                              asset.ytd > 0 && 'text-green-600',
                              asset.ytd < 0 && 'text-red-600',
                              asset.ytd === 0 && 'text-gray-600 dark:text-gray-400'
                            )}
                          >
                            {asset.ytd > 0 ? '+' : ''}
                            {formatNumber(asset.ytd, 2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  )}

                  {/* From Start cell - shown only when filterStartDate is set */}
                  {filterStartDate !== undefined && (
                    <TableCell className="text-right min-w-[70px] sm:min-w-[100px] bg-purple-50 dark:bg-purple-950/20 border-l-2 border-purple-300 dark:border-purple-800">
                      {asset.fromStart !== undefined ? (
                        <div className="font-bold">
                          <span
                            className={cn(
                              'text-base',
                              asset.fromStart > 0 && 'text-green-600',
                              asset.fromStart < 0 && 'text-red-600',
                              asset.fromStart === 0 && 'text-gray-600 dark:text-gray-400'
                            )}
                          >
                            {asset.fromStart > 0 ? '+' : ''}
                            {formatNumber(asset.fromStart, 2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  )}
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
                    const change = totalRow.monthlyChanges?.[monthCol.key];

                    return (
                      <TableCell key={monthCol.key} className="text-right min-w-[100px]">
                        {/* Currency value (always shown) */}
                        <div className="font-medium">
                          {formatCurrency(total)}
                        </div>

                        {/* Percentage change (only if defined) */}
                        {change !== undefined && (
                          <div
                            className={cn(
                              'text-xs mt-0.5',
                              change > 0 && 'text-green-600',
                              change < 0 && 'text-red-600',
                              change === 0 && 'text-gray-500'
                            )}
                          >
                            {change > 0 ? '+' : ''}
                            {formatNumber(change, 2)}%
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                  {/* Mese Prec. % column */}
                  {filterYear !== undefined && (
                    <TableCell className="text-right min-w-[100px] bg-muted border-l-2 border-amber-300 dark:border-amber-800">
                      {totalRow.lastMonthChange !== undefined ? (
                        <div className="font-bold">
                          <span
                            className={cn(
                              'text-base',
                              totalRow.lastMonthChange > 0 && 'text-green-600',
                              totalRow.lastMonthChange < 0 && 'text-red-600',
                              totalRow.lastMonthChange === 0 && 'text-gray-600 dark:text-gray-400'
                            )}
                          >
                            {totalRow.lastMonthChange > 0 ? '+' : ''}
                            {formatNumber(totalRow.lastMonthChange, 2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  )}
                  {/* YTD column */}
                  {filterYear !== undefined && (
                    <TableCell className="text-right min-w-[100px] bg-muted border-l-2 border-blue-300 dark:border-blue-800">
                      {totalRow.ytd !== undefined ? (
                        <div className="font-bold">
                          <span
                            className={cn(
                              'text-base',
                              totalRow.ytd > 0 && 'text-green-600',
                              totalRow.ytd < 0 && 'text-red-600',
                              totalRow.ytd === 0 && 'text-gray-600 dark:text-gray-400'
                            )}
                          >
                            {totalRow.ytd > 0 ? '+' : ''}
                            {formatNumber(totalRow.ytd, 2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  )}
                  {/* From Start column */}
                  {filterStartDate !== undefined && (
                    <TableCell className="text-right min-w-[100px] bg-muted border-l-2 border-purple-300 dark:border-purple-800">
                      {totalRow.fromStart !== undefined ? (
                        <div className="font-bold">
                          <span
                            className={cn(
                              'text-base',
                              totalRow.fromStart > 0 && 'text-green-600',
                              totalRow.fromStart < 0 && 'text-red-600',
                              totalRow.fromStart === 0 && 'text-gray-600 dark:text-gray-400'
                            )}
                          >
                            {totalRow.fromStart > 0 ? '+' : ''}
                            {formatNumber(totalRow.fromStart, 2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </motion.div>
    </motion.div>
  );
}
