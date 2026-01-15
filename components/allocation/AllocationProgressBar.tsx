/**
 * Allocation Progress Bar - Visual Progress Indicator for Asset Allocation
 *
 * Shows current allocation percentage with target marker (diamond icon).
 *
 * Key Features:
 * - Filled bar shows current percentage (colored by action: green/orange/red)
 * - Diamond marker indicates target percentage position
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
  // Color mapping based on action (green: OK, orange: buy, red: sell)
  const getColors = (action: 'COMPRA' | 'VENDI' | 'OK') => {
    switch (action) {
      case 'OK':
        return { bg: 'bg-green-500', text: 'text-green-600', border: 'border-green-700' };
      case 'COMPRA':
        return { bg: 'bg-orange-500', text: 'text-orange-600', border: 'border-orange-700' };
      case 'VENDI':
        return { bg: 'bg-red-500', text: 'text-red-600', border: 'border-red-700' };
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
          <span className="text-gray-600">
            Target: {formatPercentage(targetPercentage)}
          </span>
        </div>
      )}

      {/* Progress bar track */}
      <div
        className="relative w-full bg-gray-200 rounded-full overflow-hidden"
        style={{ height: `${height}px` }}
      >
        {/* Current allocation fill */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-all duration-300',
            colors.bg
          )}
          style={{ width: `${currentWidth}%` }}
        />

        {/* Target marker (dashed line) */}
        <div
          className={cn('absolute inset-y-0 border-l-2 border-dashed', colors.border)}
          style={{ left: `${targetPosition}%` }}
        >
          {/* Marker dot */}
          <div
            className={cn(
              'absolute -top-1 -left-1.5 w-3 h-3 rounded-full',
              colors.bg,
              'ring-2 ring-white'
            )}
          />
        </div>
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
