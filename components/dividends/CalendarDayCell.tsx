'use client';

import type { RefCallback } from 'react';
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
  /** Roving tabindex: the grid keeps ONE cell in the Tab order and moves it with the arrows. */
  tabIndex: 0 | -1;
  onFocus: () => void;
  cellRef: RefCallback<HTMLButtonElement>;
}

/**
 * One day of the payments calendar.
 *
 * Two colour decisions, both token-driven since the 2026-08-23 redesign. A day that PAID is
 * washed with `--muted`, not with a green fill: twenty green cells in a month would make the
 * calendar the loudest surface on the page, and the amount already carries the sign colour.
 * A day whose payments are only ANNOUNCED keeps a fainter wash and a muted amount — and, since
 * 2026-09-14, a hairline in the warning border and the word «attesa» under the amount: the two
 * washes measured 1,10:1 and 1,05:1 against the tile, a difference no eye is asked to see.
 *
 * The cell is never `disabled`: a day with nothing is still a day the arrows pass through
 * (the grid's roving tabindex); it has nothing to open, and says so in its name.
 */
export function CalendarDayCell({
  date,
  isCurrentMonth,
  isToday,
  dividends,
  onClick,
  ariaLabel,
  announced,
  tabIndex,
  onFocus,
  cellRef,
}: CalendarDayCellProps) {
  const hasDividends = dividends.length > 0;
  const totalNet = dividends.reduce((sum, div) => sum + (div.netAmountEur ?? div.netAmount), 0);

  return (
    <button
      ref={cellRef}
      type="button"
      role="gridcell"
      onClick={() => hasDividends && onClick(date)}
      onFocus={onFocus}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      aria-current={isToday ? 'date' : undefined}
      aria-disabled={hasDividends ? undefined : true}
      className={cn(
        'relative flex min-h-[58px] flex-col gap-1 border-b border-r border-border p-1.5 text-left desktop:min-h-[76px] desktop:p-2',
        'transition-colors motion-reduce:transition-none focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        hasDividends ? 'cursor-pointer hover:bg-muted' : 'cursor-default',
        isCurrentMonth ? 'text-foreground' : 'text-muted-foreground opacity-50',
        hasDividends && (announced ? 'bg-muted/35 shadow-[inset_0_0_0_1px_var(--warning-border)]' : 'bg-muted/60'),
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
          {announced && <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-warning-foreground">attesa</span>}
        </span>
      )}
    </button>
  );
}
