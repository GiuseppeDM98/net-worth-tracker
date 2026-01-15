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

import { AllocationData } from '@/types/assets';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AllocationProgressBar } from './AllocationProgressBar';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { TrendingUp, TrendingDown, Minus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AllocationCardProps {
  name: string;
  data: AllocationData;
  level: 'assetClass' | 'subCategory' | 'specificAsset';
  hasChildren?: boolean;
  onDrillDown?: () => void;
  className?: string;
}

export function AllocationCard({
  name,
  data,
  level,
  hasChildren = false,
  onDrillDown,
  className,
}: AllocationCardProps) {
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
        return 'bg-orange-100 text-orange-700 border-orange-300';
      case 'VENDI':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'OK':
        return 'bg-green-100 text-green-700 border-green-300';
    }
  };

  // Get difference banner colors
  const getDifferenceBannerColor = (action: 'COMPRA' | 'VENDI' | 'OK') => {
    switch (action) {
      case 'COMPRA':
        return 'bg-orange-50 border-orange-200';
      case 'VENDI':
        return 'bg-red-50 border-red-200';
      case 'OK':
        return 'bg-green-50 border-green-200';
    }
  };

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        hasChildren && onDrillDown && 'cursor-pointer active:scale-[0.98] hover:shadow-md',
        className
      )}
      onClick={hasChildren && onDrillDown ? onDrillDown : undefined}
    >
      <CardContent className="p-4">
        {/* Header: Name + Action Badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base text-gray-900 truncate" title={name}>
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
        <div className="grid grid-cols-2 gap-3 mb-3 p-3 bg-gray-50 rounded-lg">
          {/* Attuale */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Attuale</p>
            <p className="text-sm font-bold text-gray-900">
              {formatCurrency(data.currentValue)}
            </p>
            <p className="text-xs text-gray-600">
              {formatPercentage(data.currentPercentage)}
            </p>
          </div>

          {/* Target */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Target</p>
            <p className="text-sm font-bold text-gray-900">
              {formatCurrency(data.targetValue)}
            </p>
            <p className="text-xs text-gray-600">
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
            <p className="text-xs text-gray-600 mb-0.5">Differenza</p>
            <p className="text-sm font-bold">
              <span className={cn(
                data.difference > 0 ? 'text-red-700' : data.difference < 0 ? 'text-orange-700' : 'text-green-700'
              )}>
                {data.differenceValue > 0 ? '+' : ''}
                {formatCurrency(data.differenceValue)}
              </span>
              <span className="text-gray-600 ml-2">
                ({data.difference > 0 ? '+' : ''}
                {formatPercentage(data.difference)})
              </span>
            </p>
          </div>

          {/* Chevron icon if has children */}
          {hasChildren && onDrillDown && (
            <ChevronRight className="h-5 w-5 text-gray-400 shrink-0 ml-2" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
