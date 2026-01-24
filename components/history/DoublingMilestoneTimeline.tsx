import { DoublingMilestone } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';

interface DoublingMilestoneTimelineProps {
  milestones: DoublingMilestone[];
  currentInProgress: DoublingMilestone | null;
}

/**
 * Display timeline of doubling milestones with visual cards.
 *
 * Shows each milestone as a card with:
 * - Badge indicating milestone number and completion status
 * - Start and end values with arrow
 * - Duration in years and months
 * - Period label (MM/YY - MM/YY)
 * - Progress bar for incomplete milestones
 *
 * Visual distinction:
 * - Complete milestones: green badge, standard border
 * - In-progress milestones: blue badge, blue border, progress bar
 *
 * @param milestones - Array of completed milestones
 * @param currentInProgress - Current milestone in progress (if any)
 */
export function DoublingMilestoneTimeline({
  milestones,
  currentInProgress,
}: DoublingMilestoneTimelineProps) {
  // Combine completed milestones with current in-progress
  const allMilestones = [...milestones];
  if (currentInProgress) {
    allMilestones.push(currentInProgress);
  }

  // Guide comment: Empty state handling
  // Show encouraging message when no milestones exist yet
  if (allMilestones.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nessuna milestone ancora completata. Continua a costruire il tuo patrimonio!
      </div>
    );
  }

  /**
   * Format duration in months to readable "Ya Xm" format.
   *
   * Converts total months to years + months for better readability.
   * Example: 27 months → "2a 3m"
   *
   * @param months - Total duration in months
   * @returns Formatted duration string
   */
  function formatMonthDuration(months: number): string {
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;

    if (years > 0) {
      return `${years}a ${remainingMonths}m`;
    }
    return `${remainingMonths}m`;
  }

  /**
   * Get milestone label based on type.
   *
   * For geometric: "1° Raddoppio", "2° Raddoppio", etc.
   * For threshold: "€100k", "€200k", etc.
   *
   * @param milestone - Milestone object
   * @returns Label string for display
   */
  function getMilestoneLabel(milestone: DoublingMilestone): string {
    if (milestone.milestoneType === 'threshold' && milestone.thresholdValue) {
      return formatCurrency(milestone.thresholdValue);
    }
    return `${milestone.milestoneNumber}° Raddoppio`;
  }

  return (
    <div className="space-y-3">
      {/* Guide comment: Render milestone cards with visual distinction
          Complete milestones: green badge with checkmark
          In-progress milestones: blue badge with progress bar
          This creates clear visual hierarchy for user engagement */}
      {allMilestones.map((milestone) => (
        <div
          key={`${milestone.milestoneType}-${milestone.milestoneNumber}`}
          className={cn(
            'rounded-lg border p-4 transition-colors',
            !milestone.isComplete && 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/20'
          )}
        >
          {/* Header: Badge + Duration */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'px-2 py-1 rounded-md text-xs font-semibold',
                  milestone.isComplete
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100'
                )}
              >
                {getMilestoneLabel(milestone)}
                {!milestone.isComplete && ' - In Corso'}
              </span>
            </div>
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {formatMonthDuration(milestone.durationMonths)}
            </div>
          </div>

          {/* Values Row */}
          <div className="flex items-center gap-2 text-sm mb-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {formatCurrency(milestone.startValue)}
            </span>
            <span className="text-gray-400">→</span>
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {formatCurrency(milestone.endValue)}
            </span>
          </div>

          {/* Period Label */}
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {milestone.periodLabel}
          </div>

          {/* Progress Bar (for incomplete milestones) */}
          {!milestone.isComplete && milestone.progressPercentage !== undefined && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span>Progresso</span>
                <span>{milestone.progressPercentage.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${milestone.progressPercentage}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
