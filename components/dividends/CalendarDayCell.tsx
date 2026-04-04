/**
 * Individual day cell in the dividend calendar grid
 *
 * Displays dividend information for a specific date:
 * - Single dividend: Shows ticker and net amount
 * - Multiple dividends: Shows badge with count and total sum
 * - No dividends: Empty cell with muted styling if outside current month
 *
 * Visual indicators:
 * - Green background for dates with dividends
 * - Blue border for today's date
 * - Muted appearance for dates outside current month
 */
'use client';

import { motion } from 'framer-motion';
import { Dividend } from '@/types/dividend';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { metricSettleTransition } from '@/lib/utils/motionVariants';

interface CalendarDayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  dividends: Dividend[];
  onClick: (date: Date) => void;
}

export function CalendarDayCell({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  dividends,
  onClick,
}: CalendarDayCellProps) {
  const dayNumber = date.getDate();
  const hasDividends = dividends.length > 0;

  // Calculate total net amount for all dividends on this date
  // Uses EUR amount if available (for converted dividends), otherwise original currency
  const totalNet = dividends.reduce((sum, div) => {
    const amount = div.netAmountEur ?? div.netAmount;
    return sum + amount;
  }, 0);

  // Handle click - only if cell has dividends
  const handleClick = () => {
    if (hasDividends) {
      onClick(date);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!hasDividends}
      className={cn(
        // Base styling
        'relative border border-border p-1 text-left md:p-2',
        'min-h-[60px] md:min-h-[70px] desktop:min-h-[80px]',
        'flex flex-col gap-1',
        'transition-colors motion-reduce:transition-none',

        // Cursor and hover state
        hasDividends && 'cursor-pointer hover:bg-accent',
        !hasDividends && 'cursor-default',

        // Current month vs overflow days
        isCurrentMonth ? 'text-foreground' : 'text-muted-foreground opacity-50',

        // Today indicator (blue border)
        isToday && !isSelected && 'border-2 border-blue-500',

        // Selected date focus
        isSelected && 'border-primary bg-primary/8 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]',

        // Dates with dividends (green background)
        hasDividends && !isSelected && 'bg-green-50 dark:bg-green-950/20',
        hasDividends && !isSelected && 'hover:bg-green-100 dark:hover:bg-green-900/30'
      )}
    >
      {isSelected && (
        <motion.div
          layout
          aria-hidden="true"
          className="pointer-events-none absolute inset-1 rounded-md border border-primary/20 bg-primary/5"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={metricSettleTransition}
        />
      )}

      {/* Day number */}
      <div className={cn(
        'relative z-10 text-xs font-medium md:text-sm',
        isSelected && 'text-primary'
      )}>
        {dayNumber}
      </div>

      {/* Dividend information */}
      {hasDividends && (
        <div className="relative z-10 flex flex-1 flex-col gap-1 text-xs">
          {dividends.length === 1 ? (
            // Single dividend: show ticker + amount
            <>
              <div className="font-semibold truncate">
                {dividends[0].assetTicker}
              </div>
              <div className="text-green-600 dark:text-green-400 font-medium truncate">
                {formatCurrency(dividends[0].netAmountEur ?? dividends[0].netAmount)}
              </div>
            </>
          ) : (
            // Multiple dividends: show badge with count + total amount
            <>
              <Badge
                variant="secondary"
                className="w-fit text-xs px-1 py-0"
              >
                {dividends.length}
              </Badge>
              <div className="text-green-600 dark:text-green-400 font-medium truncate">
                {formatCurrency(totalNet)}
              </div>
            </>
          )}
        </div>
      )}
    </button>
  );
}
