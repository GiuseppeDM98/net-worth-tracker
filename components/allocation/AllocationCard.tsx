/**
 * AllocationCard — flat list item, Trade Republic hierarchy.
 *
 * Visual hierarchy:
 *   Row 1: name  +  action chip
 *   Row 2: currentValue (dominant — text-2xl mono bold)
 *   Row 3: currentPct · target targetPct · delta€ (muted micro row, only if not OK)
 *
 * No card box, no progress bar, no eyebrow level label.
 * The parent container (divided list) supplies the visual structure.
 */
'use client';

import { KeyboardEvent, MouseEvent, forwardRef } from 'react';
import { AllocationData } from '@/types/assets';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { listItem } from '@/lib/utils/motionVariants';

interface AllocationCardProps {
  name: string;
  data: AllocationData;
  level: 'assetClass' | 'subCategory' | 'specificAsset';
  hasChildren?: boolean;
  onDrillDown?: (payload: { sourceId?: string; rect: DOMRect }) => void;
  className?: string;
  continuityId?: string;
  isOrigin?: boolean;
}

/**
 * Renders a compact status badge for an allocation action.
 * Used in both mobile cards (AllocationCard) and the desktop table (page.tsx).
 * Colors map to design tokens so all 6 themes stay consistent.
 */
export function ActionChip({ action }: { action: 'COMPRA' | 'VENDI' | 'OK' }) {
  switch (action) {
    case 'COMPRA':
      return (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-warning-border bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-warning-foreground">
          <TrendingUp className="h-2.5 w-2.5" aria-hidden="true" />
          COMPRA
        </span>
      );
    case 'VENDI':
      return (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
          <TrendingDown className="h-2.5 w-2.5" aria-hidden="true" />
          VENDI
        </span>
      );
    case 'OK':
      return (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-green-200 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:border-green-800 dark:text-green-400">
          <Minus className="h-2.5 w-2.5" aria-hidden="true" />
          OK
        </span>
      );
  }
}

export const AllocationCard = forwardRef<HTMLDivElement, AllocationCardProps>(
  function AllocationCard(
    { name, data, hasChildren = false, onDrillDown, className, continuityId, isOrigin = false },
    ref
  ) {
    const handleClick = (event: MouseEvent<HTMLDivElement>) => {
      if (!hasChildren || !onDrillDown) return;
      onDrillDown({
        sourceId: continuityId,
        rect: event.currentTarget.getBoundingClientRect(),
      });
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!hasChildren || !onDrillDown) return;
      if (event.key === 'Enter' || event.key === ' ') {
        // Prevent Space from scrolling the page while activating the drill-down.
        event.preventDefault();
        onDrillDown({
          sourceId: continuityId,
          rect: event.currentTarget.getBoundingClientRect(),
        });
      }
    };

    const isDrillable = hasChildren && !!onDrillDown;

    return (
      <motion.div
        ref={ref}
        variants={listItem}
        className={cn(
          'px-4 py-4',
          isDrillable && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
          className
        )}
        layout={false}
        data-continuity-id={continuityId}
        role={isDrillable ? 'button' : undefined}
        tabIndex={isDrillable ? 0 : undefined}
        aria-label={isDrillable ? `Apri ${name}` : undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className={cn('flex items-start gap-3', isDrillable && 'cursor-pointer')}>
          <div className="min-w-0 flex-1">
            {/* Row 1: name + action chip */}
            <div className="mb-2 flex items-center gap-2">
              <span
                className={cn(
                  'truncate text-sm font-medium',
                  isOrigin ? 'text-primary' : 'text-foreground'
                )}
                title={name}
              >
                {name}
              </span>
              <ActionChip action={data.action} />
            </div>

            {/* Row 2: dominant value */}
            <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
              {formatCurrency(data.currentValue)}
            </p>

            {/* Row 3: muted micro context */}
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-xs text-muted-foreground">
              <span>{formatPercentage(data.currentPercentage)}</span>
              <span className="opacity-30">·</span>
              <span>target {formatPercentage(data.targetPercentage)}</span>
              {data.action !== 'OK' && (
                <>
                  <span className="opacity-30">·</span>
                  <span
                    className={cn(
                      'font-medium',
                      data.action === 'COMPRA'
                        ? 'text-warning-foreground'
                        : 'text-destructive'
                    )}
                  >
                    {data.differenceValue > 0 ? '+' : ''}
                    {formatCurrency(data.differenceValue)}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Chevron — only for drillable items */}
          {hasChildren && onDrillDown && (
            <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </motion.div>
    );
  }
);
