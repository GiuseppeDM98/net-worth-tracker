/**
 * Asset Class History Table - Monthly EUR totals by asset class from snapshots
 *
 * Displays how each asset class (Azioni, Obbligazioni, etc.) has evolved month by
 * month, sourced from the `byAssetClass` field of monthly snapshots.
 *
 * Key features:
 * - One row per asset class with a color-coded left-border badge
 * - Monthly EUR values with MoM color coding (green/red/gray)
 * - Summary columns: Mese Prec. % + YTD % (when filterYear is set),
 *   From Start % (when filterStartDate is set)
 * - Total row showing the sum of all classes per month
 *
 * Checklist: If modifying display logic, also check:
 * - lib/utils/assetClassHistoryUtils.ts (transformation algorithm)
 * - Ensure YTD, fromStart and lastMonthChange stay consistent across row and total
 */
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { MonthlySnapshot, AssetHistoryDateFilter } from '@/types/assets';
import { transformAssetClassHistoryData } from '@/lib/utils/assetClassHistoryUtils';
import { formatCurrency, formatNumber } from '@/lib/services/chartService';
import { Button } from '@/components/ui/button';
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

interface AssetClassHistoryTableProps {
  snapshots: MonthlySnapshot[];
  filterYear?: number;
  filterStartDate?: AssetHistoryDateFilter;
  includePreviousMonthBaseline?: boolean;
  excludeCash?: boolean;
  loading: boolean;
  onRefresh: () => Promise<void>;
  isRefreshing?: boolean;
  isActiveView?: boolean;
  isLatestRefreshedView?: boolean;
  refreshToken?: number;
  lastRefreshAt?: Date | null;
}

// CSS classes for MoM color-coded cells (same palette as AssetPriceHistoryTable)
// Dark variants use low-opacity overlays to avoid harsh contrast on dark backgrounds
const colorClasses = {
  green: 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 font-medium',
  red: 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 font-medium',
  neutral: 'bg-gray-50 dark:bg-gray-800/60 text-gray-700 dark:text-gray-300',
};

// Renders a percentage value with sign and color, or a dash if undefined
function PercentCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <span className="text-gray-400">-</span>;
  return (
    <div className="font-bold">
      <span
        className={cn(
          'text-base',
          value > 0 && 'text-green-600',
          value < 0 && 'text-red-600',
          value === 0 && 'text-gray-600 dark:text-gray-400'
        )}
      >
        {value > 0 ? '+' : ''}
        {formatNumber(value, 2)}%
      </span>
    </div>
  );
}

export function AssetClassHistoryTable({
  snapshots,
  filterYear,
  filterStartDate,
  includePreviousMonthBaseline = false,
  excludeCash = false,
  loading,
  onRefresh,
  isRefreshing = false,
  isActiveView = false,
  isLatestRefreshedView = false,
  refreshToken = 0,
  lastRefreshAt = null,
}: AssetClassHistoryTableProps) {
  const prefersReducedMotion = useReducedMotion();
  const [isRefreshHighlighted, setIsRefreshHighlighted] = useState(false);

  const tableData = useMemo(
    () => transformAssetClassHistoryData(snapshots, {
      filterYear,
      filterStartDate,
      includePreviousMonthBaseline,
      excludeCash,
    }),
    [snapshots, filterYear, filterStartDate, includePreviousMonthBaseline, excludeCash]
  );

  const { rows, monthColumns, totalRow } = tableData;

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
      {/* Header */}
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
            Asset Class {filterYear ?? 'Storico'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Totale mensile per classe di asset con variazioni month-over-month
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

      {/* Table container */}
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
        {rows.length === 0 ? (
          <EmptyState
            icon={<ChartEmptyIcon />}
            title="Nessun dato storico disponibile"
            description="Crea uno snapshot mensile per iniziare a tracciare le asset class."
          />
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-white dark:bg-gray-900 z-20">
              <TableRow>
                {/* Sticky first column */}
                <TableHead className="sticky left-0 bg-white dark:bg-gray-900 z-10 min-w-[130px] sm:min-w-[180px] border-r">
                  Asset Class
                </TableHead>
                {/* Month columns */}
                {monthColumns.map((month) => (
                  <TableHead key={month.key} className="text-right min-w-[80px] sm:min-w-[120px]">
                    {month.label}
                  </TableHead>
                ))}
                {/* Mese Prec. % — only for year filter */}
                {filterYear !== undefined && (
                  <TableHead className="text-right min-w-[70px] sm:min-w-[100px] bg-amber-50 dark:bg-amber-950/20 border-l-2 border-amber-300 dark:border-amber-800">
                    Mese Prec. %
                  </TableHead>
                )}
                {/* YTD — only for year filter */}
                {filterYear !== undefined && (
                  <TableHead className="text-right min-w-[70px] sm:min-w-[100px] bg-blue-50 dark:bg-blue-950/20 border-l-2 border-blue-300 dark:border-blue-800">
                    YTD %
                  </TableHead>
                )}
                {/* From Start % — only for date filter */}
                {filterStartDate !== undefined && (
                  <TableHead className="text-right min-w-[70px] sm:min-w-[100px] bg-purple-50 dark:bg-purple-950/20 border-l-2 border-purple-300 dark:border-purple-800">
                    From Start %
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.assetClass}>
                  {/* Asset class label with color badge */}
                  <TableCell className="sticky left-0 bg-white dark:bg-gray-900 z-10 border-r">
                    <div className="flex items-center gap-2">
                      {/* Color swatch matching the chart palette */}
                      <div
                        className="h-3 w-3 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="font-semibold text-sm">{row.label}</span>
                    </div>
                  </TableCell>

                  {/* Monthly value cells */}
                  {monthColumns.map((month) => {
                    const cell = row.months[month.key];
                    return (
                      <TableCell
                        key={month.key}
                        className={cn(
                          'text-right min-w-[100px]',
                          cell.value === null ? 'text-gray-400' : colorClasses[cell.colorCode]
                        )}
                      >
                        {cell.value === null ? (
                          <span className="text-gray-400">-</span>
                        ) : (
                          <div>
                            <div className="font-medium">{formatCurrency(cell.value)}</div>
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

                  {/* Mese Prec. % */}
                  {filterYear !== undefined && (
                    <TableCell className="text-right min-w-[70px] sm:min-w-[100px] bg-amber-50 dark:bg-amber-950/20 border-l-2 border-amber-300 dark:border-amber-800">
                      <PercentCell value={row.lastMonthChange} />
                    </TableCell>
                  )}

                  {/* YTD % */}
                  {filterYear !== undefined && (
                    <TableCell className="text-right min-w-[70px] sm:min-w-[100px] bg-blue-50 dark:bg-blue-950/20 border-l-2 border-blue-300 dark:border-blue-800">
                      <PercentCell value={row.ytd} />
                    </TableCell>
                  )}

                  {/* From Start % */}
                  {filterStartDate !== undefined && (
                    <TableCell className="text-right min-w-[70px] sm:min-w-[100px] bg-purple-50 dark:bg-purple-950/20 border-l-2 border-purple-300 dark:border-purple-800">
                      <PercentCell value={row.fromStart} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>

            {/* Total row */}
            {totalRow && (
              <TableFooter>
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell className="sticky left-0 bg-muted z-10">Totale</TableCell>

                  {monthColumns.map((monthCol) => {
                    const total = totalRow.totals[monthCol.key] || 0;
                    const change = totalRow.monthlyChanges?.[monthCol.key];
                    return (
                      <TableCell key={monthCol.key} className="text-right min-w-[100px]">
                        <div className="font-medium">{formatCurrency(total)}</div>
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

                  {filterYear !== undefined && (
                    <TableCell className="text-right min-w-[100px] bg-muted border-l-2 border-amber-300 dark:border-amber-800">
                      <PercentCell value={totalRow.lastMonthChange} />
                    </TableCell>
                  )}
                  {filterYear !== undefined && (
                    <TableCell className="text-right min-w-[100px] bg-muted border-l-2 border-blue-300 dark:border-blue-800">
                      <PercentCell value={totalRow.ytd} />
                    </TableCell>
                  )}
                  {filterStartDate !== undefined && (
                    <TableCell className="text-right min-w-[100px] bg-muted border-l-2 border-purple-300 dark:border-purple-800">
                      <PercentCell value={totalRow.fromStart} />
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
