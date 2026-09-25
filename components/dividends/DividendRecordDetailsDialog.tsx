/**
 * Read-only dividend details opened from a table row or mobile card.
 *
 * It grows from the row that opened it: the caller resolves `triggerOrigin` at the click
 * (`resolveCenteredModalOrigin`), so the origin is on the window from its first frame.
 */
'use client';

import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import { Dividend } from '@/types/dividend';
import { dividendTypeLabels } from '@/lib/constants/dividendTypes';
import { TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

const FIGURE_CLASS = 'font-mono text-[13px] font-medium tabular-nums';

interface DividendRecordDetailsDialogProps {
  open: boolean;
  dividend: Dividend | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (dividend: Dividend) => void;
  /** Provisional inflation-linked coupons: opens the FOI-rate dialog from here. */
  onSetInflationRate?: (dividend: Dividend) => void;
  triggerOrigin?: string;
  /** The row's button that opened the record, so the focus goes back to it on close. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

export function DividendRecordDetailsDialog({
  open,
  dividend,
  onOpenChange,
  onEdit,
  onSetInflationRate,
  triggerOrigin,
  returnFocusTo,
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
          ? 'La cedola è provvisoria: manca il dato d’inflazione del periodo, quindi il netto qui sotto è una stima, non l’incasso finale.'
          : `${dividend.assetName}. Il netto è già al netto della ritenuta e, per una valuta estera, convertito al cambio del pagamento.`
      }
      width="md"
      triggerOrigin={triggerOrigin}
      returnFocusTo={returnFocusTo}
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
              Imposta inflazione
            </Button>
          )}
        </>
      }
    >
        {/* Two `bg-muted` blocks, never bordered cards inside a modal (doc/guide/dialog.md); the
            labels inside are the tile's sub-eyebrow, the figures the mono face. The withholding
            is muted like the table's: a tax is not a loss. */}
        <div className="grid gap-4 desktop:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="space-y-4 rounded-lg bg-muted p-4">
            <div className="space-y-1.5">
              <p className={TILE_SUB_EYEBROW_CLASS}>Date</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-[12px] text-muted-foreground">Ex-date</dt>
                  <dd className={FIGURE_CLASS}>{formatDate(toDate(dividend.exDate))}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted-foreground">Pagamento</dt>
                  <dd className={FIGURE_CLASS}>{formatDate(toDate(dividend.paymentDate))}</dd>
                </div>
              </dl>
            </div>

            <div className="space-y-1.5 border-t border-border pt-4">
              <p className={TILE_SUB_EYEBROW_CLASS}>Quantità e base</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-[12px] text-muted-foreground">Unità al pagamento</dt>
                  <dd className={FIGURE_CLASS}>{dividend.quantity}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-muted-foreground">Costo storico per unità</dt>
                  <dd className={cn(FIGURE_CLASS, dividend.costPerShare === undefined && 'text-muted-foreground')}>
                    {dividend.costPerShare !== undefined ? formatCurrency(dividend.costPerShare) : '—'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="space-y-4 rounded-lg bg-muted p-4">
            <div>
              <p className={TILE_SUB_EYEBROW_CLASS}>Netto</p>
              <p className="mt-1.5 font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-positive">
                {formatCurrency(netAmount)}
              </p>
              {dividend.currency.toUpperCase() !== 'EUR' && dividend.netAmountEur !== undefined && (
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  Originale <span className="font-mono tabular-nums">{formatCurrency(dividend.netAmount, dividend.currency)}</span>
                </p>
              )}
            </div>

            <dl className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[13px] text-muted-foreground">Lordo per unità</dt>
                <dd className={FIGURE_CLASS}>{formatCurrency(dividend.dividendPerShare, dividend.currency, 4)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[13px] text-muted-foreground">Lordo totale</dt>
                <dd className={FIGURE_CLASS}>{formatCurrency(grossAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-[13px] text-muted-foreground">Ritenute</dt>
                <dd className={cn(FIGURE_CLASS, 'text-muted-foreground')}>{formatCurrency(taxAmount)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {dividend.notes && (
          <div className="mt-4 rounded-lg bg-muted p-4">
            <p className={TILE_SUB_EYEBROW_CLASS}>Note</p>
            <p className="mt-1.5 text-[13px] leading-[1.45]">{dividend.notes}</p>
          </div>
        )}

    </ResponsiveModal>
  );
}
