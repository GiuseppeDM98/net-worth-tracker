import { useEffect } from 'react';
import { DoublingMilestone } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { fastStaggerContainer, listItem } from '@/lib/utils/motionVariants';
import { hasCelebrated, markCelebrated, shouldReduceMotion } from '@/lib/utils/celebrationUtils';
import { EmptyState, SeedlingIcon } from '@/components/ui/EmptyState';

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

  // Celebrate each newly-seen completed milestone once.
  // Delay by 800ms so the stagger list animation finishes before confetti fires.
  // Canvas-confetti is loaded lazily to keep it out of the main bundle.
  useEffect(() => {
    if (shouldReduceMotion()) return;

    const completedMilestones = milestones.filter((m) => m.isComplete);
    if (completedMilestones.length === 0) return;

    // Build the list of milestones that still need a celebration this session
    const uncelebrated = completedMilestones.filter((m) => {
      const key = `milestone_${m.milestoneType}_${m.milestoneNumber}`;
      return !hasCelebrated(key);
    });

    if (uncelebrated.length === 0) return;

    const timer = setTimeout(async () => {
      // Dynamic import keeps canvas-confetti out of the initial page bundle
      const confetti = (await import('canvas-confetti')).default;

      for (const milestone of uncelebrated) {
        const key = `milestone_${milestone.milestoneType}_${milestone.milestoneNumber}`;
        confetti({
          colors: ['#10B981', '#F59E0B', '#ffffff', '#6EE7B7'],
          particleCount: 60,
          spread: 70,
          origin: { y: 0.6 },
          gravity: 1.2,
          scalar: 0.8,
        });
        // Mark before the animation resolves — we don't want to retry if the
        // tab is closed mid-animation
        markCelebrated(key);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [milestones]);
  // Re-runs when milestones changes (initial load delivers [] then real data).
  // hasCelebrated + markCelebrated ensure each milestone fires exactly once,
  // even if milestones reference changes on subsequent re-renders.

  // Guide comment: Empty state handling
  // Show encouraging message when no milestones exist yet
  if (allMilestones.length === 0) {
    return (
      <EmptyState
        icon={<SeedlingIcon />}
        title="Nessuna milestone ancora completata"
        description="Continua a costruire il tuo patrimonio!"
      />
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
    <motion.div
      variants={fastStaggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {/* Guide comment: Render milestone cards with visual distinction
          Complete milestones: green badge with checkmark
          In-progress milestones: blue badge with progress bar
          This creates clear visual hierarchy for user engagement */}
      {allMilestones.map((milestone) => (
        <motion.div
          key={`${milestone.milestoneType}-${milestone.milestoneNumber}`}
          variants={listItem}
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
                <motion.div
                  className="h-full bg-blue-500 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${milestone.progressPercentage}%` }}
                  transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1] }}
                />
              </div>
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}
