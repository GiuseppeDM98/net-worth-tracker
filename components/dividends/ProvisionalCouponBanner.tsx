/**
 * ProvisionalCouponBanner — inflation-linked coupons materialized at the guaranteed fixed
 * floor, still waiting for their announced FOI rate, so the recurring (≈ semestral) update is
 * never forgotten.
 *
 * Since the 2026-08-23 redesign it lives INSIDE the Pagamenti tile, above the toolbar, and it
 * is painted with the warning TOKENS (`--warning`, `--warning-border`, `--warning-foreground`)
 * rather than literal `amber-*` classes: those stayed the same hue on every theme while the
 * rest of the surface moved, and `--warning` is near-white in light mode, which is exactly why
 * the text has to be `--warning-foreground` (AGENTS.md → Layout and Color Tokens).
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
    <div className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning p-3.5">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-0.5 text-warning-foreground">
          <p className="text-[13px] font-semibold">
            {coupons.length === 1
              ? 'Una cedola in attesa del tasso di inflazione.'
              : `${coupons.length} cedole in attesa del tasso di inflazione.`}
          </p>
          <p className="text-[12px] leading-[1.45] opacity-90">
            Calcolata al solo tasso fisso garantito. Inserisci il tasso FOI del periodo annunciato per ricalcolarla.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-warning-border">
          {coupons.map((coupon) => (
            <li key={coupon.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-warning-foreground">
                  {coupon.assetTicker || coupon.assetName}
                </p>
                <p className="font-mono text-[11px] tabular-nums text-warning-foreground opacity-80">
                  Stacco {formatDate(toDate(coupon.paymentDate))}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onSelect(coupon)}
                disabled={isDemo}
                className="h-8 shrink-0 border-warning-border bg-transparent text-warning-foreground hover:bg-warning-border/30"
                aria-label={
                  isDemo
                    ? 'Imposta tasso — non disponibile in modalità demo'
                    : `Imposta il tasso FOI per ${coupon.assetTicker || coupon.assetName}`
                }
              >
                Imposta tasso
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
