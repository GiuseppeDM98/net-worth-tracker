'use client';

import { Dividend } from '@/types/dividend';
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
import { dividendTypeLabels, dividendTypeBadgeColor } from '@/lib/constants/dividendTypes';

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
            const displayAmount = dividend.netAmountEur ?? dividend.netAmount;
            const isEur = dividend.currency.toUpperCase() === 'EUR';
            const hasConversion = !isEur && dividend.netAmountEur !== undefined;

            return (
              <div
                key={dividend.id}
                className="border border-border rounded-lg p-3 space-y-2"
              >
                <div className="space-y-1">
                  <div className="font-semibold text-sm">{dividend.assetTicker}</div>
                  <div className="text-xs text-muted-foreground">{dividend.assetName}</div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={dividendTypeBadgeColor[dividend.dividendType]}
                  >
                    {dividendTypeLabels[dividend.dividendType]}
                  </Badge>

                  <div className="text-right">
                    <div className="font-medium text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(displayAmount)}
                    </div>
                    {hasConversion && (
                      <div className="text-xs text-muted-foreground">
                        {formatCurrency(dividend.netAmount, dividend.currency)}
                      </div>
                    )}
                  </div>
                </div>

                {dividend.notes && (
                  <div className="text-xs text-muted-foreground border-t border-border pt-2">
                    {dividend.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Totals footer — only shown when more than one dividend on the same date */}
        {dividends.length > 1 && (
          <div className="border-t border-border pt-3 flex items-center justify-between">
            <span className="text-sm font-medium">Totale</span>
            <span className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {formatCurrency(
                dividends.reduce((sum, div) => sum + (div.netAmountEur ?? div.netAmount), 0)
              )}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
