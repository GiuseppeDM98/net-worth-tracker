/**
 * Allocation Progress Bar - Visual Progress Indicator for Asset Allocation
 *
 * Shows current allocation percentage with target marker.
 *
 * Key Features:
 * - Filled bar shows current percentage (colored by action: green/orange/red)
 * - Circular marker indicates target percentage position
 * - Handles edge case: >100% allocation (overallocated positions)
 *
 * Why handle >100% allocation?
 * If an asset class exceeds 100% of target (e.g., current 120%, target 100%),
 * we scale the bar width to prevent visual overflow and layout breaks.
 * This can happen when asset values increase significantly without rebalancing.
 *
 * Visual Accessibility:
 * Color-coded with sufficient contrast for readability (green/orange/red backgrounds).
 */
'use client';

import { cn } from '@/lib/utils';
import { formatPercentage } from '@/lib/services/chartService';
import { motion, useReducedMotion } from 'framer-motion';
import { progressSettleTransition } from '@/lib/utils/motionVariants';

interface AllocationProgressBarProps {
  currentPercentage: number;
  targetPercentage: number;
  action: 'COMPRA' | 'VENDI' | 'OK';
  showLabels?: boolean;
  height?: number;
  className?: string;
}

export function AllocationProgressBar({
  currentPercentage,
  targetPercentage,
  action,
  showLabels = true,
  height = 24,
  className,
}: AllocationProgressBarProps) {
  const reducedMotion = useReducedMotion();

  // Color mapping based on action (green: OK, orange: buy, red: sell)
  const getColors = (action: 'COMPRA' | 'VENDI' | 'OK') => {
    switch (action) {
      case 'OK':
        return {
          fill: 'bg-green-500 dark:bg-green-500',
          text: 'text-green-700 dark:text-green-400',
          marker: 'bg-green-500 dark:bg-green-500',
          markerBorder: 'border-green-700 dark:border-green-500',
        };
      case 'COMPRA':
        return {
          fill: 'bg-orange-500 dark:bg-orange-500',
          text: 'text-orange-700 dark:text-orange-400',
          marker: 'bg-orange-500 dark:bg-orange-500',
          markerBorder: 'border-orange-700 dark:border-orange-500',
        };
      case 'VENDI':
        return {
          fill: 'bg-red-500 dark:bg-red-500',
          text: 'text-red-700 dark:text-red-400',
          marker: 'bg-red-500 dark:bg-red-500',
          markerBorder: 'border-red-700 dark:border-red-500',
        };
    }
  };

  const colors = getColors(action);

  // Handle edge case: percentages > 100% (overallocation)
  // Scale bar width to prevent overflow and layout breaks
  const maxPercentage = Math.max(currentPercentage, targetPercentage, 100);
  const currentWidth = Math.min((currentPercentage / maxPercentage) * 100, 100);
  const targetPosition = Math.min((targetPercentage / maxPercentage) * 100, 100);
  const difference = currentPercentage - targetPercentage;

  return (
    <div className={cn('w-full', className)}>
      {/* Labels */}
      {showLabels && (
        <div className="flex justify-between items-center text-xs mb-1">
          <span className={cn('font-medium', colors.text)}>
            Corrente: {formatPercentage(currentPercentage)}
          </span>
          <span className="text-muted-foreground">
            Target: {formatPercentage(targetPercentage)}
          </span>
        </div>
      )}

      {/* Progress bar track */}
      <div
        className="relative w-full overflow-hidden rounded-full border border-border/70 bg-muted/70"
        style={{ height: `${height}px` }}
      >
        {/* Current allocation fill */}
        <motion.div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            colors.fill
          )}
          animate={reducedMotion ? undefined : { width: `${currentWidth}%` }}
          initial={reducedMotion ? false : { width: 0 }}
          transition={reducedMotion ? undefined : progressSettleTransition}
          style={reducedMotion ? { width: `${currentWidth}%` } : undefined}
        />

        {/* Target marker */}
        <motion.div
          className="absolute inset-y-0"
          animate={reducedMotion ? undefined : { left: `${targetPosition}%` }}
          initial={reducedMotion ? false : { left: 0 }}
          transition={reducedMotion ? undefined : { ...progressSettleTransition, stiffness: 320 }}
          style={reducedMotion ? { left: `${targetPosition}%` } : undefined}
        >
          {/* Marker dot */}
          <motion.div
            className={cn(
              'absolute left-0 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background',
              colors.marker,
              colors.markerBorder
            )}
            animate={reducedMotion ? undefined : { scale: 1 }}
            initial={reducedMotion ? false : { scale: 0.9 }}
            transition={reducedMotion ? undefined : { duration: 0.16 }}
          />
        </motion.div>
      </div>

      {/* Difference indicator */}
      {showLabels && (
        <div className={cn('text-xs mt-1 font-semibold', colors.text)}>
          {difference > 0 ? '+' : ''}
          {formatPercentage(difference)} differenza
        </div>
      )}
    </div>
  );
}
