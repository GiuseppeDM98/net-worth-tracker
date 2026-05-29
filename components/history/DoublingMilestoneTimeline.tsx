import { useEffect, useState } from 'react';
import { DoublingMilestone } from '@/types/assets';
import { formatCurrency } from '@/lib/services/chartService';
import { cn } from '@/lib/utils';
import { motion, useReducedMotion } from 'framer-motion';
import { fastStaggerContainer, listItem, progressSettleTransition } from '@/lib/utils/motionVariants';
import { hasCelebrated, markCelebrated, shouldReduceMotion } from '@/lib/utils/celebrationUtils';
import { EmptyState, SeedlingIcon } from '@/components/ui/EmptyState';

// Module-level helpers — stable references, not recreated on every render.

/**
 * Format a duration in months to a compact "Ya Xm" string.
 * Example: 27 months → "2a 3m"
 */
function formatMonthDuration(months: number): string {
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years > 0) return `${years}a ${remainingMonths}m`;
  return `${remainingMonths}m`;
}

/**
 * Return the display label for a milestone.
 * Threshold mode shows the target value (e.g. "€100.000"); geometric shows "N° Raddoppio".
 */
function getMilestoneLabel(milestone: DoublingMilestone): string {
  if (milestone.milestoneType === 'threshold' && milestone.thresholdValue) {
    return formatCurrency(milestone.thresholdValue);
  }
  return `${milestone.milestoneNumber}° Raddoppio`;
}

interface DoublingMilestoneTimelineProps {
  milestones: DoublingMilestone[];
  currentInProgress: DoublingMilestone | null;
}

/**
 * Timeline of completed and in-progress doubling milestones.
 *
 * Complete milestones use the positive token (green); the in-progress card uses
 * the primary token so it stays theme-aware across all 6 color themes.
 * Progress bar uses var(--chart-1) for the same reason — no hardcoded blue.
 */
export function DoublingMilestoneTimeline({
  milestones,
  currentInProgress,
}: DoublingMilestoneTimelineProps) {
  const prefersReducedMotion = useReducedMotion();

  const allMilestones = [...milestones];
  if (currentInProgress) {
    allMilestones.push(currentInProgress);
  }

  const [visibleMilestones, setVisibleMilestones] = useState(
    prefersReducedMotion ? allMilestones.length : 1
  );

  useEffect(() => {
    if (prefersReducedMotion || allMilestones.length <= 1) {
      setVisibleMilestones(allMilestones.length);
      return;
    }

    setVisibleMilestones(1);
    const timers = allMilestones.slice(1).map((_, index) =>
      window.setTimeout(() => {
        setVisibleMilestones((current) => Math.min(current + 1, allMilestones.length));
      }, 120 * (index + 1))
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [allMilestones.length, prefersReducedMotion]);

  // Celebrate each newly-seen completed milestone once.
  // Delay 800ms so the stagger animation finishes before confetti fires.
  // canvas-confetti is lazily imported to stay out of the main bundle.
  useEffect(() => {
    if (shouldReduceMotion()) return;

    const completedMilestones = milestones.filter((m) => m.isComplete);
    if (completedMilestones.length === 0) return;

    const uncelebrated = completedMilestones.filter((m) => {
      const key = `milestone_${m.milestoneType}_${m.milestoneNumber}`;
      return !hasCelebrated(key);
    });

    if (uncelebrated.length === 0) return;

    const timer = setTimeout(async () => {
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
        // Mark before animation resolves — prevents retry if the tab closes mid-animation
        markCelebrated(key);
      }
    }, 800);

    return () => clearTimeout(timer);
    // Re-runs when milestones changes (initial load delivers [] then real data).
    // hasCelebrated + markCelebrated guarantee each milestone fires exactly once.
  }, [milestones]);

  if (allMilestones.length === 0) {
    return (
      <EmptyState
        icon={<SeedlingIcon />}
        title="Nessuna milestone ancora completata"
        description="Continua a costruire il tuo patrimonio!"
      />
    );
  }

  return (
    <motion.div
      variants={fastStaggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {allMilestones.slice(0, visibleMilestones).map((milestone) => (
        <motion.div
          key={`${milestone.milestoneType}-${milestone.milestoneNumber}`}
          variants={listItem}
          initial="hidden"
          animate="visible"
          className={cn(
            'rounded-lg border p-4 transition-colors',
            // In-progress card uses primary token so accent color tracks the active theme
            !milestone.isComplete && 'border-primary/30 bg-primary/5'
          )}
        >
          {/* Badge + duration */}
          <div className="flex items-center justify-between mb-2">
            <span
              className={cn(
                'px-2 py-1 rounded-md text-xs font-semibold',
                milestone.isComplete
                  ? 'bg-positive/10 text-positive'
                  : 'bg-primary/10 text-primary'
              )}
            >
              {getMilestoneLabel(milestone)}
              {!milestone.isComplete && ' - In Corso'}
            </span>
            <span className="text-sm font-medium text-foreground">
              {formatMonthDuration(milestone.durationMonths)}
            </span>
          </div>

          {/* Values row */}
          <div className="flex items-center gap-2 text-sm mb-2">
            <span className="font-medium text-foreground">
              {formatCurrency(milestone.startValue)}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="font-medium text-foreground">
              {formatCurrency(milestone.endValue)}
            </span>
          </div>

          {/* Period label */}
          <div className="text-xs text-muted-foreground">
            {milestone.periodLabel}
          </div>

          {/* Progress bar for incomplete milestones */}
          {!milestone.isComplete && milestone.progressPercentage !== undefined && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progresso</span>
                <span>{milestone.progressPercentage.toFixed(0)}%</span>
              </div>
              {/* role="progressbar" on the track container, not the fill — WCAG 4.1.2 */}
              <div
                className="h-2 bg-muted rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(milestone.progressPercentage)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progresso verso il prossimo traguardo"
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'var(--chart-1)' }}
                  initial={false}
                  animate={{ width: `${milestone.progressPercentage}%` }}
                  transition={progressSettleTransition}
                />
              </div>
            </div>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}
