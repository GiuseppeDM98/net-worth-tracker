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

import { Dividend } from '@/types/dividend';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';

interface CalendarDayCellProps {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  dividends: Dividend[];
  onClick: (date: Date) => void;
}

export function CalendarDayCell({
  date,
  isCurrentMonth,
  isToday,
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
    <div
      onClick={handleClick}
      className={cn(
        // Base styling
        'border border-border p-1 md:p-2',
        'min-h-[60px] md:min-h-[70px] desktop:min-h-[80px]',
        'flex flex-col gap-1',
        'transition-colors',

        // Cursor and hover state
        hasDividends && 'cursor-pointer hover:bg-accent',

        // Current month vs overflow days
        isCurrentMonth ? 'text-foreground' : 'text-muted-foreground opacity-50',

        // Today indicator (blue border)
        isToday && 'border-2 border-blue-500',

        // Dates with dividends (green background)
        hasDividends && 'bg-green-50 dark:bg-green-950/20',
        hasDividends && 'hover:bg-green-100 dark:hover:bg-green-900/30'
      )}
    >
      {/* Day number */}
      <div className="text-xs md:text-sm font-medium">
        {dayNumber}
      </div>

      {/* Dividend information */}
      {hasDividends && (
        <div className="flex-1 flex flex-col gap-1 text-xs">
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
    </div>
  );
}
