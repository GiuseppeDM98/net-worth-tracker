'use client';

import { Dividend } from '@/types/dividend';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

interface CalendarDayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  dividends: Dividend[];
  onClick: (date: Date) => void;
  /** Pre-built accessible label passed from the parent calendar grid. */
  ariaLabel: string;
  /** Every payment on this day is still in the future: a promise, not income. */
  announced: boolean;
}

/**
 * One day of the payments calendar.
 *
 * Two colour decisions, both token-driven since the 2026-08-23 redesign. A day that PAID is
 * washed with `--muted`, not with a green fill: twenty green cells in a month would make the
 * calendar the loudest surface on the page, and the amount already carries the sign colour.
 * A day whose payments are only ANNOUNCED keeps a fainter wash and a muted amount — the
 * distinction the old cell did not draw at all, so an expected coupon read exactly like cash
 * in the account.
 */
export function CalendarDayCell({
  date,
  isCurrentMonth,
  isToday,
  dividends,
  onClick,
  ariaLabel,
  announced,
}: CalendarDayCellProps) {
  const hasDividends = dividends.length > 0;
  const totalNet = dividends.reduce((sum, div) => sum + (div.netAmountEur ?? div.netAmount), 0);

  return (
    <button
      type="button"
      role="gridcell"
      onClick={() => hasDividends && onClick(date)}
      disabled={!hasDividends}
      aria-label={ariaLabel}
      aria-current={isToday ? 'date' : undefined}
      className={cn(
        'relative flex min-h-[58px] flex-col gap-1 border-b border-r border-border p-1.5 text-left desktop:min-h-[76px] desktop:p-2',
        'transition-colors motion-reduce:transition-none',
        hasDividends ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
        isCurrentMonth ? 'text-foreground' : 'text-muted-foreground opacity-50',
        hasDividends && (announced ? 'bg-muted/35' : 'bg-muted/60'),
        isToday && 'shadow-[inset_0_0_0_2px_var(--primary)]',
      )}
    >
      <span className="text-[12px] font-medium desktop:text-[13px]">{date.getDate()}</span>

      {hasDividends && (
        <span className="flex min-w-0 flex-col gap-0.5">
          {dividends.length === 1 ? (
            <span className="hidden truncate text-[11px] font-medium desktop:block">
              {dividends[0].assetTicker || dividends[0].assetName}
            </span>
          ) : (
            <span className="hidden w-fit rounded-[4px] bg-background px-1 font-mono text-[10px] tabular-nums text-muted-foreground desktop:block">
              {dividends.length}
            </span>
          )}
          <span
            className={cn(
              'truncate font-mono text-[11px] font-semibold tabular-nums desktop:text-[12px]',
              announced ? 'text-muted-foreground' : 'text-positive',
            )}
          >
            {cachedFormatCurrencyEUR(totalNet, true)}
          </span>
        </span>
      )}
    </button>
  );
}
