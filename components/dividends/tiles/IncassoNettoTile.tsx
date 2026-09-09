'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import type { Narrative } from '@/lib/utils/narrative';
import type { DividendNetComparison, MonthlyNetPoint, UpcomingPayment } from '@/lib/utils/dividendAnalytics';
import { printedDelta } from '@/lib/utils/dividendiNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatPercentage } from '@/lib/services/chartService';
import { signChipClass } from '@/lib/utils/metricColors';
import { cn } from '@/lib/utils';
import { Tile, TILE_SUB_EYEBROW_CLASS } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';
import { resolveHeroValueClass } from '@/components/dashboard/overview/PatrimonioTile';
import { NetIncomeBars, type NetIncomeBarPoint } from './NetIncomeBars';
import { MONTH_NAMES } from '@/lib/constants/months';

interface IncassoNettoTileProps {
  eyebrow: string;
  reading: Narrative | null;
  net: number;
  count: number;
  comparison: DividendNetComparison;
  /** How the previous window is named ("gen–ago 2025"); null when there is none. */
  comparisonLabel: string | null;
  /** The months the bars draw, oldest first. */
  months: MonthlyNetPoint[];
  highlightKey: string | null;
  /** The chart's sub-eyebrow — it names the bars' own window, which is not always the period's. */
  windowLabel: Narrative;
  /** The announced payments, soonest first; empty when nothing is announced. */
  upcoming: UpcomingPayment[];
  upcomingNet: number;
  className?: string;
}

/**
 * The dominant tile: what actually landed in the account over the period, the change against
 * the comparable previous window, the month-by-month shape, and — pinned to the bottom — what
 * is already announced.
 *
 * The announced total is a CHIP OF ITS OWN, never added to the hero: money with a future
 * payment date is a promise, and one figure covering both would tell the user they have what
 * they do not (DESIGN.md → The Narrative Honesty Rule).
 */
export function IncassoNettoTile({
  eyebrow,
  reading,
  net,
  count,
  comparison,
  comparisonLabel,
  months,
  highlightKey,
  windowLabel,
  upcoming,
  upcomingNet,
  className,
}: IncassoNettoTileProps) {
  const deltaPct = comparison.deltaPct;
  const printed = deltaPct === null ? null : printedDelta(deltaPct);
  const deltaValue = comparison.current - comparison.previous;
  const rising = (deltaPct ?? 0) >= 0;
  const Icon = rising ? TrendingUp : TrendingDown;

  const points: NetIncomeBarPoint[] = months.map((month) => ({
    key: `${month.year}-${month.month}`,
    label: month.shortLabel,
    value: month.net,
    caption: `${MONTH_NAMES[month.month - 1]} ${month.year}`,
  }));

  return (
    <Tile
      eyebrow={eyebrow}
      aside={
        count > 0 ? (
          <span>
            <span className="font-mono font-medium tabular-nums">{count}</span>{' '}
            {count === 1 ? 'pagamento' : 'pagamenti'}
          </span>
        ) : undefined
      }
      reading={reading}
      className={className}
      ariaLabel="Incasso netto del periodo"
    >
      <p className={cn('mt-2.5 block leading-none', resolveHeroValueClass(net))}>
        {cachedFormatCurrencyEUR(net, true)}
      </p>

      {/* Grouped chips: the change, then what is announced — same kind of fact, one row. */}
      {(printed !== null || upcomingNet > 0) && (
        <div className="mt-4 flex flex-col gap-2.5 tablet:flex-row tablet:flex-wrap tablet:items-start tablet:gap-x-2.5 tablet:gap-y-2">
          {printed !== null && comparisonLabel && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span
                className={cn(
                  'inline-flex w-fit max-w-full items-center gap-1.5 whitespace-nowrap rounded-[9px] px-[11px] py-[6px]',
                  'font-mono text-[12px] font-semibold leading-none tracking-[-0.01em] tabular-nums',
                  printed === 0 ? 'bg-muted text-muted-foreground' : signChipClass(deltaValue),
                )}
              >
                {printed !== 0 && <Icon className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />}
                {printed === 0 ? (
                  'invariato'
                ) : (
                  <>
                    {rising ? '+' : '−'}
                    {cachedFormatCurrencyEUR(Math.abs(deltaValue), true)} ({rising ? '+' : '−'}
                    {formatPercentage(printed, 1)})
                  </>
                )}
              </span>
              <span className="text-[11px] text-muted-foreground">su {comparisonLabel}</span>
            </div>
          )}
          {upcomingNet > 0 && (
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="inline-flex w-fit items-center whitespace-nowrap rounded-[9px] bg-muted px-[11px] py-[6px] font-mono text-[12px] font-semibold leading-none tabular-nums text-foreground">
                {cachedFormatCurrencyEUR(upcomingNet, true)}
              </span>
              <span className="text-[11px] text-muted-foreground">già annunciati</span>
            </div>
          )}
        </div>
      )}

      {months.length >= 2 && (
        <>
          <div className="mt-5 flex items-center justify-between gap-3">
            <NarrativeText segments={windowLabel} className={TILE_SUB_EYEBROW_CLASS} figureClassName="font-semibold" />
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 rounded-[2px]" style={{ background: 'var(--chart-2)' }} aria-hidden="true" />
              Netto incassato
            </span>
          </div>
          <NetIncomeBars
            points={points}
            highlightKey={highlightKey}
            ariaLabel="Netto incassato per mese."
            minHeight={150}
            className="mt-2.5 flex-1"
          />
        </>
      )}

      {upcoming.length > 0 && (
        <div className="mt-auto flex flex-col border-t border-border pt-3.5">
          <p className={cn(TILE_SUB_EYEBROW_CLASS, 'mb-0.5')}>Prossimi pagamenti</p>
          <div className="flex flex-col divide-y divide-border">
            {upcoming.map((payment) => (
              <div key={payment.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                  {payment.assetTicker || payment.assetName}
                  {/* An inflation-linked coupon still at its fixed floor is not a final figure. */}
                  {payment.isProvisional && <span className="ml-1.5 text-[11px] text-muted-foreground">provvisorio</span>}
                </span>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
                  {payment.paymentDate.getDate()} {MONTH_NAMES[payment.paymentDate.getMonth()].slice(0, 3).toLowerCase()}
                </span>
                <span className="w-[68px] shrink-0 text-right font-mono text-[13px] tabular-nums text-foreground">
                  {cachedFormatCurrencyEUR(payment.net, true)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Tile>
  );
}
