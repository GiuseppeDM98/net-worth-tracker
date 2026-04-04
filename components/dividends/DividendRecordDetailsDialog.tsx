/**
 * Read-only dividend details opened from a table row or mobile card.
 *
 * The dialog accepts an inline style so callers can set a contextual
 * transform-origin derived from the clicked trigger.
 */
'use client';

import type { CSSProperties, RefObject } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { Dividend, DividendType } from '@/types/dividend';

const dividendTypeLabels: Record<DividendType, string> = {
  ordinary: 'Ordinario',
  extraordinary: 'Straordinario',
  interim: 'Interim',
  final: 'Finale',
  coupon: 'Cedola',
  finalPremium: 'Premio Finale',
};

const dividendTypeBadgeColor: Record<DividendType, string> = {
  ordinary: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800',
  extraordinary: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800',
  interim: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800',
  final: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800',
  coupon: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
  finalPremium: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
};

interface DividendRecordDetailsDialogProps {
  open: boolean;
  dividend: Dividend | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (dividend: Dividend) => void;
  dialogRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
}

export function DividendRecordDetailsDialog({
  open,
  dividend,
  onOpenChange,
  onEdit,
  dialogRef,
  style,
}: DividendRecordDetailsDialogProps) {
  if (!dividend) return null;

  const grossAmount = dividend.grossAmountEur ?? dividend.grossAmount;
  const taxAmount = dividend.taxAmountEur ?? dividend.taxAmount;
  const netAmount = dividend.netAmountEur ?? dividend.netAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dialogRef} style={style} className="max-w-xl">
        <DialogHeader className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-xl">{dividend.assetTicker}</DialogTitle>
              <DialogDescription className="mt-1">
                {dividend.assetName}
              </DialogDescription>
            </div>
            <Badge variant="outline" className={dividendTypeBadgeColor[dividend.dividendType]}>
              {dividendTypeLabels[dividend.dividendType]}
            </Badge>
          </div>
        </DialogHeader>

        <div className="grid gap-4 desktop:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4 rounded-lg border border-border/70 bg-muted/30 p-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Timeline
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Ex-Date</p>
                  <p className="font-medium">{formatDate(toDate(dividend.exDate))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagamento</p>
                  <p className="font-medium">{formatDate(toDate(dividend.paymentDate))}</p>
                </div>
              </div>
            </div>

            <div className="space-y-1 border-t border-border/60 pt-4">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Quantita' e base
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Azioni al pagamento</p>
                  <p className="font-medium">{dividend.quantity}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Costo storico / azione</p>
                  <p className="font-medium">
                    {dividend.costPerShare !== undefined ? formatCurrency(dividend.costPerShare) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border/70 p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Netto
              </p>
              <p className="text-2xl font-semibold text-green-600 desktop:text-3xl">
                {formatCurrency(netAmount)}
              </p>
              {dividend.currency.toUpperCase() !== 'EUR' && dividend.netAmountEur !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Originale {formatCurrency(dividend.netAmount, dividend.currency)}
                </p>
              )}
            </div>

            <div className="space-y-2 border-t border-border/60 pt-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Lordo / azione</span>
                <span className="font-medium">{formatCurrency(dividend.dividendPerShare, dividend.currency, 4)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Lordo totale</span>
                <span className="font-medium">{formatCurrency(grossAmount)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Tasse</span>
                <span className="font-medium text-red-600">{formatCurrency(taxAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {dividend.notes && (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Note
            </p>
            <p className="mt-2 text-sm">{dividend.notes}</p>
          </div>
        )}

        <DialogFooter className="sm:justify-between">
          <p className="text-xs text-muted-foreground">
            Dettaglio contestuale del pagamento selezionato
          </p>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onEdit(dividend);
            }}
          >
            Modifica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
