/**
 * Summary cards showing progress for each goal plus unassigned portfolio value.
 * Displays as a horizontal scrollable row on mobile.
 */

'use client';

import { GoalProgress } from '@/types/goals';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/formatters';

interface GoalSummaryCardsProps {
  progressList: GoalProgress[];
  unassignedValue: number;
}

export function GoalSummaryCards({
  progressList,
  unassignedValue,
}: GoalSummaryCardsProps) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {progressList.map((progress) => (
        <Card
          key={progress.goalId}
          className="min-w-[200px] flex-shrink-0"
        >
          <CardContent className="p-4">
            {/* Goal name with color indicator */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: progress.goalColor }}
              />
              <span className="text-sm font-medium text-gray-700 truncate">
                {progress.goalName}
              </span>
            </div>

            {/* Progress bar (only if target is set) */}
            {progress.progressPercentage != null ? (
              <>
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, progress.progressPercentage)}%`,
                      backgroundColor: progress.goalColor,
                    }}
                  />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-500">
                    {formatCurrency(progress.currentValue)}
                  </span>
                  <span className="text-xs font-medium text-gray-700">
                    {progress.progressPercentage.toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Target: {formatCurrency(progress.targetAmount!)}
                </p>
              </>
            ) : (
              <p className="text-lg font-semibold text-gray-700">
                {formatCurrency(progress.currentValue)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Unassigned value card */}
      <Card className="min-w-[200px] flex-shrink-0 border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-gray-300 shrink-0" />
            <span className="text-sm font-medium text-gray-500">
              Non Assegnato
            </span>
          </div>
          <p className="text-lg font-semibold text-gray-600">
            {formatCurrency(unassignedValue)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
