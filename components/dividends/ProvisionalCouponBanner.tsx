/**
 * ProvisionalCouponBanner (B1) — surfaces inflation-linked coupons that were
 * materialized at the guaranteed fixed floor and still await their announced FOI
 * rate, so the recurring (≈ semestral) update is never forgotten.
 *
 * The caller gates rendering on a non-empty list of FUTURE provisional coupons.
 */
'use client';

import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dividend } from '@/types/dividend';
import { toDate } from '@/lib/utils/dateHelpers';
import { formatDate } from '@/lib/utils/formatters';

interface ProvisionalCouponBannerProps {
  /** Future, isProvisional coupons, sorted by payment date ascending. */
  coupons: Dividend[];
  isDemo: boolean;
  onSelect: (coupon: Dividend) => void;
}

export function ProvisionalCouponBanner({ coupons, isDemo, onSelect }: ProvisionalCouponBannerProps) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">
              {coupons.length === 1
                ? 'Una cedola in attesa del tasso di inflazione'
                : `${coupons.length} cedole in attesa del tasso di inflazione`}
            </p>
            <p className="text-xs text-muted-foreground">
              Cedola provvisoria al solo tasso fisso. Inserisci il tasso FOI del periodo annunciato per ricalcolarla.
            </p>
          </div>
          <ul className="divide-y divide-amber-200/60 dark:divide-amber-900/40">
            {coupons.map((coupon) => (
              <li key={coupon.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{coupon.assetTicker}</p>
                  <p className="text-xs text-muted-foreground">
                    Stacco {formatDate(toDate(coupon.paymentDate))}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSelect(coupon)}
                  disabled={isDemo}
                  title={isDemo ? 'Non disponibile in modalità demo' : undefined}
                >
                  Imposta tasso
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
