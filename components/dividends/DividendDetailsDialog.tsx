/**
 * Dialog showing detailed dividend list for a specific date
 *
 * Displays when user clicks a date with dividends in the calendar view.
 * Shows all dividends scheduled for payment on that date with:
 * - Asset ticker and name
 * - Dividend type (with color-coded badge)
 * - Net amount (with EUR conversion if applicable)
 *
 * Design decisions:
 * - Uses Dialog (not Popover) for consistent behavior across all screen sizes
 * - Scrollable content area for handling many dividends on same date
 * - Reuses dividend type badge colors from DividendTable for consistency
 */
'use client';

import { Dividend, DividendType } from '@/types/dividend';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/formatters';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

// Italian labels for dividend types
const dividendTypeLabels: Record<DividendType, string> = {
  ordinary: 'Ordinario',
  extraordinary: 'Straordinario',
  interim: 'Interim',
  final: 'Finale',
};

// Badge colors for dividend types (consistent with DividendTable)
const dividendTypeBadgeColor: Record<DividendType, string> = {
  ordinary: 'bg-blue-100 text-blue-800 border-blue-200',
  extraordinary: 'bg-purple-100 text-purple-800 border-purple-200',
  interim: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  final: 'bg-green-100 text-green-800 border-green-200',
};

interface DividendDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  dividends: Dividend[];
}

export function DividendDetailsDialog({
  open,
  onOpenChange,
  date,
  dividends,
}: DividendDetailsDialogProps) {
  // Format date in Italian locale (DD/MM/YYYY)
  const formattedDate = format(date, 'dd/MM/yyyy', { locale: it });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Dividendi - {formattedDate}</DialogTitle>
        </DialogHeader>

        {/* Scrollable dividend list */}
        <div className="flex-1 overflow-y-auto space-y-3">
          {dividends.map((dividend) => {
            // Use EUR amount if available (for converted dividends)
            const displayAmount = dividend.netAmountEur ?? dividend.netAmount;
            const isEur = dividend.currency.toUpperCase() === 'EUR';
            const hasConversion = !isEur && dividend.netAmountEur !== undefined;

            return (
              <div
                key={dividend.id}
                className="border border-border rounded-lg p-3 space-y-2"
              >
                {/* Asset ticker and name */}
                <div className="space-y-1">
                  <div className="font-semibold text-sm">
                    {dividend.assetTicker}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dividend.assetName}
                  </div>
                </div>

                {/* Dividend type and amount */}
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={dividendTypeBadgeColor[dividend.dividendType]}
                  >
                    {dividendTypeLabels[dividend.dividendType]}
                  </Badge>

                  <div className="text-right">
                    <div className="font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(displayAmount)}
                    </div>
                    {hasConversion && (
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(dividend.netAmount, dividend.currency)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes (if any) */}
                {dividend.notes && (
                  <div className="text-xs text-muted-foreground border-t border-border pt-2">
                    {dividend.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary footer */}
        {dividends.length > 1 && (
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="text-sm font-medium">Totale</span>
            <span className="text-lg font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(
                dividends.reduce((sum, div) => {
                  const amount = div.netAmountEur ?? div.netAmount;
                  return sum + amount;
                }, 0)
              )}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
