'use client';

import { motion } from 'framer-motion';
/**
 * Summary cards showing progress for each goal plus unassigned portfolio value.
 * Displays as a horizontal scrollable row on mobile.
 */
import { GoalProgress } from '@/types/goals';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/formatters';
import { cardItem, simulationStagger } from '@/lib/utils/motionVariants';

interface GoalSummaryCardsProps {
  progressList: GoalProgress[];
  unassignedValue: number;
  activeGoalId: string | null;
  onSelectGoal: (goalId: string | null) => void;
}

export function GoalSummaryCards({
  progressList,
  unassignedValue,
  activeGoalId,
  onSelectGoal,
}: GoalSummaryCardsProps) {
  return (
    <motion.div
      className="grid grid-cols-2 gap-3 sm:gap-4 desktop:grid-cols-4"
      variants={simulationStagger}
      initial="hidden"
      animate="visible"
    >
      {progressList.map((progress) => (
        <motion.div key={progress.goalId} variants={cardItem}>
        <button
          type="button"
          onClick={() => onSelectGoal(activeGoalId === progress.goalId ? null : progress.goalId)}
          className="w-full text-left"
        >
        <Card className={activeGoalId === progress.goalId ? 'ring-1 ring-border shadow-sm' : 'opacity-90'}>
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
        </button>
        </motion.div>
      ))}

      {/* Unassigned value card */}
      <motion.div variants={cardItem}>
      <button
        type="button"
        onClick={() => onSelectGoal(activeGoalId === '__unassigned__' ? null : '__unassigned__')}
        className="w-full text-left"
      >
      <Card className={`border-dashed ${activeGoalId === '__unassigned__' ? 'ring-1 ring-border shadow-sm' : 'opacity-90'}`}>
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
      </button>
      </motion.div>
    </motion.div>
  );
}
