/**
 * Allocation Card - Displays Asset Class Allocation Progress
 *
 * Shows current vs target allocation percentage with action badges.
 *
 * Action Indicators:
 * - COMPRA (Buy): Current < Target → need to buy more (orange)
 * - VENDI (Sell): Current > Target → need to sell some (red)
 * - OK (Balanced): Current ≈ Target → allocation is balanced (green)
 *
 * Features:
 * - AllocationProgressBar visualization with target marker
 * - Difference banner showing how much to buy/sell
 * - Drill-down capability for hierarchical allocation view (asset class → subcategory → specific asset)
 * - Responsive card layout for mobile and desktop
 */
'use client';

import { MouseEvent, forwardRef } from 'react';
import { AllocationData } from '@/types/assets';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AllocationProgressBar } from './AllocationProgressBar';
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
  onDrillDown?: (payload: {
    sourceId?: string;
    rect: DOMRect;
  }) => void;
  className?: string;
  continuityId?: string;
  isOrigin?: boolean;
}

export const AllocationCard = forwardRef<HTMLDivElement, AllocationCardProps>(function AllocationCard({
  name,
  data,
  level,
  hasChildren = false,
  onDrillDown,
  className,
  continuityId,
  isOrigin = false,
}, ref) {
  // Get action icon
  const getActionIcon = (action: 'COMPRA' | 'VENDI' | 'OK') => {
    switch (action) {
      case 'COMPRA':
        return <TrendingUp className="h-3 w-3" />;
      case 'VENDI':
        return <TrendingDown className="h-3 w-3" />;
      case 'OK':
        return <Minus className="h-3 w-3" />;
    }
  };

  // Get action badge colors
  const getActionBadgeColor = (action: 'COMPRA' | 'VENDI' | 'OK') => {
    switch (action) {
      case 'COMPRA':
        return 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800';
      case 'VENDI':
        return 'bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800';
      case 'OK':
        return 'bg-green-100 text-green-700 border-green-300 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800';
    }
  };

  // Get difference banner colors
  const getDifferenceBannerColor = (action: 'COMPRA' | 'VENDI' | 'OK') => {
    switch (action) {
      case 'COMPRA':
        return 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800';
      case 'VENDI':
        return 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800';
      case 'OK':
        return 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800';
    }
  };

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
      className={cn('h-full', className)}
      layout={false}
    >
      <Card
        data-continuity-id={continuityId}
        className={cn(
          'h-full border-border bg-card transition-[transform,box-shadow,border-color] duration-200',
          hasChildren && onDrillDown && 'cursor-pointer active:scale-[0.985] hover:border-primary/30 hover:shadow-md',
          isOrigin && 'border-primary/40 shadow-md shadow-primary/10',
        )}
        onClick={handleClick}
      >
      <CardContent className="p-4">
        {/* Header: Name + Action Badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              {level === 'assetClass' ? 'Livello 1' : level === 'subCategory' ? 'Livello 2' : 'Livello 3'}
            </p>
            <h3 className="truncate text-base font-semibold text-foreground" title={name}>
              {name}
            </h3>
          </div>
          <Badge
            className={cn(
              'ml-2 shrink-0 border',
              getActionBadgeColor(data.action)
            )}
          >
            <span className="flex items-center gap-1">
              {getActionIcon(data.action)}
              {data.action}
            </span>
          </Badge>
        </div>

        {/* Progress Bar Section */}
        <div className="mb-3">
          <AllocationProgressBar
            currentPercentage={data.currentPercentage}
            targetPercentage={data.targetPercentage}
            action={data.action}
            showLabels={true}
            height={20}
          />
        </div>

        {/* Values Section (2 columns: Attuale | Target) */}
        <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg border border-border/70 bg-muted/35 p-3">
          {/* Attuale */}
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Attuale</p>
            <p className="text-sm font-bold text-foreground">
              {formatCurrency(data.currentValue)}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {formatPercentage(data.currentPercentage)}
            </p>
          </div>

          {/* Target */}
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Target</p>
            <p className="text-sm font-bold text-foreground">
              {formatCurrency(data.targetValue)}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {formatPercentage(data.targetPercentage)}
            </p>
          </div>
        </div>

        {/* Difference Banner */}
        <div
          className={cn(
            'p-3 rounded-lg border flex items-center justify-between',
            getDifferenceBannerColor(data.action)
          )}
        >
          <div className="flex-1">
            {/* Contextual label instead of generic "Differenza" — tells user what action the number implies */}
            <p className="mb-0.5 text-xs text-muted-foreground">
              {data.action === 'COMPRA' ? 'Da acquistare' : data.action === 'VENDI' ? 'Da ridurre' : 'Bilanciato'}
            </p>
            <p className="text-sm font-bold tabular-nums">
              <span className={cn(
                data.difference > 0 ? 'text-red-700 dark:text-red-400' : data.difference < 0 ? 'text-orange-700 dark:text-orange-400' : 'text-green-700 dark:text-green-400'
              )}>
                {data.differenceValue > 0 ? '+' : ''}
                {formatCurrency(data.differenceValue)}
              </span>
              <span className="ml-2 text-muted-foreground">
                ({data.difference > 0 ? '+' : ''}
                {formatPercentage(data.difference)})
              </span>
            </p>
          </div>

          {/* Chevron icon if has children */}
          {hasChildren && onDrillDown && (
            <ChevronRight className="ml-2 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
        </div>
      </CardContent>
      </Card>
    </motion.div>
  );
});
