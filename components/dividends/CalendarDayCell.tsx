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
  /** Pre-built accessible label passed from the parent calendar grid. */
  ariaLabel: string;
}

export function CalendarDayCell({
  date,
  isCurrentMonth,
  isToday,
  isSelected,
  dividends,
  onClick,
  ariaLabel,
}: CalendarDayCellProps) {
  const dayNumber = date.getDate();
  const hasDividends = dividends.length > 0;

  // EUR amount if available (for converted dividends), otherwise original currency
  const totalNet = dividends.reduce((sum, div) => {
    const amount = div.netAmountEur ?? div.netAmount;
    return sum + amount;
  }, 0);

  const handleClick = () => {
    if (hasDividends) {
      onClick(date);
    }
  };

  return (
    <button
      type="button"
      role="gridcell"
      onClick={handleClick}
      disabled={!hasDividends}
      aria-label={ariaLabel}
      aria-selected={isSelected}
      // aria-current="date" marks today — screen readers announce it as the current date
      aria-current={isToday ? 'date' : undefined}
      className={cn(
        'relative border border-border p-1 text-left desktop:p-2',
        'min-h-[60px] desktop:min-h-[80px]',
        'flex flex-col gap-1',
        'transition-colors motion-reduce:transition-none',

        hasDividends && 'cursor-pointer hover:bg-accent',
        !hasDividends && 'cursor-default',

        isCurrentMonth ? 'text-foreground' : 'text-muted-foreground opacity-50',

        // ring-primary uses the active theme's primary color instead of a hardcoded blue
        isToday && !isSelected && 'ring-2 ring-inset ring-primary',

        isSelected && 'border-primary bg-primary/8 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]',

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
        'relative z-10 text-xs font-medium desktop:text-sm',
        isSelected && 'text-primary'
      )}>
        {dayNumber}
      </div>

      {/* Dividend information */}
      {hasDividends && (
        <div className="relative z-10 flex flex-1 flex-col gap-1 text-xs">
          {dividends.length === 1 ? (
            <>
              <div className="font-semibold truncate">
                {dividends[0].assetTicker}
              </div>
              <div className="text-emerald-600 dark:text-emerald-400 font-medium truncate">
                {formatCurrency(dividends[0].netAmountEur ?? dividends[0].netAmount)}
              </div>
            </>
          ) : (
            <>
              <Badge variant="secondary" className="w-fit text-xs px-1 py-0">
                {dividends.length}
              </Badge>
              <div className="text-emerald-600 dark:text-emerald-400 font-medium truncate">
                {formatCurrency(totalNet)}
              </div>
            </>
          )}
        </div>
      )}
    </button>
  );
}
