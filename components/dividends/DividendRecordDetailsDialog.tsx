/**
 * Read-only dividend details opened from a table row or mobile card.
 *
 * The dialog accepts an inline style so callers can set a contextual
 * transform-origin derived from the clicked trigger.
 */
'use client';

import type { CSSProperties, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
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

interface DividendRecordDetailsDialogProps {
  open: boolean;
  dividend: Dividend | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (dividend: Dividend) => void;
  /** Provisional inflation-linked coupons: opens the FOI-rate dialog from here. */
  onSetInflationRate?: (dividend: Dividend) => void;
  dialogRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
}

export function DividendRecordDetailsDialog({
  open,
  dividend,
  onOpenChange,
  onEdit,
  onSetInflationRate,
  dialogRef,
  style,
}: DividendRecordDetailsDialogProps) {
  if (!dividend) return null;

  const grossAmount = dividend.grossAmountEur ?? dividend.grossAmount;
  const taxAmount = dividend.taxAmountEur ?? dividend.taxAmount;
  const netAmount = dividend.netAmountEur ?? dividend.netAmount;

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow={`Dividendi · ${dividendTypeLabels[dividend.dividendType]}${dividend.isProvisional ? ' · Provvisoria' : ''}`}
      title={dividend.assetTicker}
      reading={
        dividend.isProvisional
          ? 'La cedola è provvisoria: manca la componente d’inflazione, quindi il netto qui sotto è un minimo, non l’incasso finale.'
          : `${dividend.assetName}. Il netto è già al netto della ritenuta e, per una valuta estera, convertito al cambio del pagamento.`
      }
      width="md"
      contentRef={dialogRef}
      triggerOrigin={style?.transformOrigin as string | undefined}
      footerNote="Dettaglio del pagamento selezionato"
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onEdit(dividend);
            }}
          >
            Modifica
          </Button>
          {dividend.isProvisional && onSetInflationRate && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onSetInflationRate(dividend);
              }}
            >
              Imposta tasso inflazione
            </Button>
          )}
        </>
      }
    >
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
              <p className="text-2xl font-semibold text-positive desktop:text-3xl">
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
                <span className="font-medium text-destructive">{formatCurrency(taxAmount)}</span>
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

    </ResponsiveModal>
  );
}
