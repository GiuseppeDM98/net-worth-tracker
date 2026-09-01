'use client';

import { Dividend } from '@/types/dividend';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { describeDividendDayReading } from '@/lib/utils/dialogNarrative';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/formatters';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { dividendTypeLabels } from '@/lib/constants/dividendTypes';
import { isPaid } from '@/lib/utils/dividendAnalytics';

interface DividendDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date;
  dividends: Dividend[];
  /** "Now", so a payment announced for a future day reads as announced here too. */
  now: Date;
}

/**
 * What a calendar day holds. Flat rows, not boxed cards, and — like everywhere else on the tab
 * — a payment still in the future keeps a muted amount and an "Attesa" badge instead of the
 * income colour, with its own subtotal so the two are never added together.
 */
export function DividendDetailsDialog({ open, onOpenChange, date, dividends, now }: DividendDetailsDialogProps) {
  const formattedDate = format(date, 'dd MMMM yyyy', { locale: it });
  const received = dividends.filter((d) => isPaid(d, now));
  const announced = dividends.filter((d) => !isPaid(d, now));
  const sum = (list: Dividend[]) => list.reduce((total, d) => total + (d.netAmountEur ?? d.netAmount), 0);

  return (
    <ResponsiveModal
      open={open}
      onClose={() => onOpenChange(false)}
      eyebrow="Dividendi · Calendario"
      title={formattedDate}
      reading={{
        narrative: describeDividendDayReading({
          received: received.length,
          announced: announced.length,
          receivedEur: sum(received),
          announcedEur: sum(announced),
        }),
        tone: 'neutral',
      }}
      width="sm"
    >
        <div className="flex flex-col divide-y divide-border">
          {dividends.map((dividend) => {
            const isAnnounced = !isPaid(dividend, now);
            const displayAmount = dividend.netAmountEur ?? dividend.netAmount;
            const hasConversion = dividend.currency.toUpperCase() !== 'EUR' && dividend.netAmountEur !== undefined;

            return (
              <div key={dividend.id} className="flex items-start gap-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[13px] font-medium">{dividend.assetTicker || dividend.assetName}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                      {dividendTypeLabels[dividend.dividendType]}
                    </Badge>
                    {isAnnounced && (
                      <Badge
                        variant="outline"
                        className="h-4 border-warning-border px-1.5 py-0 text-[10px] font-normal text-warning-foreground"
                      >
                        Attesa
                      </Badge>
                    )}
                    {dividend.isProvisional && (
                      <Badge
                        variant="outline"
                        className="h-4 border-warning-border px-1.5 py-0 text-[10px] font-normal text-warning-foreground"
                      >
                        Provvisoria
                      </Badge>
                    )}
                  </span>
                  {dividend.notes && <span className="text-[11px] text-muted-foreground">{dividend.notes}</span>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span
                    className={cn(
                      'font-mono text-[13px] font-semibold tabular-nums',
                      isAnnounced ? 'text-muted-foreground' : 'text-positive',
                    )}
                  >
                    {formatCurrency(displayAmount)}
                  </span>
                  {hasConversion && (
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatCurrency(dividend.netAmount, dividend.currency)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {dividends.length > 1 && (
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            {received.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted-foreground">Incassato</span>
                <span className="font-mono text-[15px] font-semibold tabular-nums text-positive">
                  {formatCurrency(sum(received))}
                </span>
              </div>
            )}
            {announced.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-muted-foreground">Atteso</span>
                <span className="font-mono text-[15px] font-semibold tabular-nums text-muted-foreground">
                  {formatCurrency(sum(announced))}
                </span>
              </div>
            )}
          </div>
        )}
    </ResponsiveModal>
  );
}
