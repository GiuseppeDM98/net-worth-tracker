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
    <div className="grid grid-cols-2 gap-3 sm:gap-4 desktop:grid-cols-4">
      {progressList.map((progress) => (
        <Card
          key={progress.goalId}
        >
          <CardContent className="p-4">
            {/* Goal name with color indicator */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: progress.goalColor }}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                {progress.goalName}
              </span>
            </div>

            {/* Progress bar (only if target is set) */}
            {progress.progressPercentage != null ? (
              <>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, progress.progressPercentage)}%`,
                      backgroundColor: progress.goalColor,
                    }}
                  />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatCurrency(progress.currentValue)}
                  </span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {progress.progressPercentage.toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Target: {formatCurrency(progress.targetAmount!)}
                </p>
              </>
            ) : (
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                {formatCurrency(progress.currentValue)}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Unassigned value card */}
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Non Assegnato
            </span>
          </div>
          <p className="text-lg font-semibold text-gray-600 dark:text-gray-400">
            {formatCurrency(unassignedValue)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
