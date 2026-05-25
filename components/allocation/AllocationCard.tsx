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

import { MouseEvent, forwardRef } from 'react';
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

function ActionChip({ action }: { action: 'COMPRA' | 'VENDI' | 'OK' }) {
  switch (action) {
    case 'COMPRA':
      return (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-orange-200 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600 dark:border-orange-800 dark:text-orange-400">
          <TrendingUp className="h-2.5 w-2.5" />
          COMPRA
        </span>
      );
    case 'VENDI':
      return (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-red-200 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-600 dark:border-red-800 dark:text-red-400">
          <TrendingDown className="h-2.5 w-2.5" />
          VENDI
        </span>
      );
    case 'OK':
      return (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-green-200 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 dark:border-green-800 dark:text-green-400">
          <Minus className="h-2.5 w-2.5" />
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

    return (
      <motion.div
        ref={ref}
        variants={listItem}
        className={cn('px-4 py-4', className)}
        layout={false}
        data-continuity-id={continuityId}
        onClick={handleClick}
      >
        <div className={cn('flex items-start gap-3', hasChildren && onDrillDown && 'cursor-pointer')}>
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
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-red-600 dark:text-red-400'
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
