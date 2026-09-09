/**
 * Goal-Based Investing — the pure math layer.
 *
 * Extracted from `goalService.ts` so the server can reuse it: that module imports the
 * client Firestore SDK (`doc`/`getDoc`/`setDoc` + `db`) at top level, which makes it
 * off-limits to server-only code. Nothing here touches Firestore, so `goalService.ts`
 * re-exports these functions verbatim and no client call site changed.
 *
 * `calculateAssetValue` is imported directly rather than injected as a `valueOf`
 * parameter. That is the second sanctioned route for a pure module (AGENTS.md →
 * *Dynamic Imports and Module Hygiene*) and the exact precedent set by
 * `dashboardOverviewUtils.ts`, which computes goal progress the same way for the
 * server-only overview service. Keeping the signature intact is what lets
 * `goalService.ts` re-export instead of wrapping.
 */

import { Asset, AssetClass } from '@/types/assets';
import {
  GoalAssetAssignment,
  GoalPriority,
  GoalProgress,
  GOAL_COLORS,
  InvestmentGoal,
} from '@/types/goals';
import { calculateAssetValue } from '@/lib/services/assetService';

/**
 * Priority multipliers used when computing goal-based allocation targets.
 *
 * The weight of each goal in the blended target is:
 *   weight = gap_to_fill × priority_multiplier
 *
 * This means a high-priority goal with a large outstanding gap dominates the target,
 * which reflects where the user should direct new investment dollars most urgently.
 * Goals that are already fully funded (gap ≤ 0) are excluded from the calculation.
 */
const GOAL_PRIORITY_WEIGHTS: Record<GoalPriority, number> = {
  alta:  3,
  media: 2,
  bassa: 1,
};

/**
 * Calculate progress for a single goal.
 *
 * Sums the assigned portions of each asset (by percentage) to determine
 * how much value is currently allocated to this goal. Silently skips
 * orphaned assignments (asset deleted from portfolio).
 */
export function calculateGoalProgress(
  goal: InvestmentGoal,
  assignments: GoalAssetAssignment[],
  assets: Asset[]
): GoalProgress {
  const goalAssignments = assignments.filter((a) => a.goalId === goal.id);
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  let currentValue = 0;
  const allocationByClass: Record<string, number> = {};

  for (const assignment of goalAssignments) {
    const asset = assetMap.get(assignment.assetId);
    if (!asset) continue; // Skip orphaned assignments

    const assetValue = calculateAssetValue(asset);
    const assignedValue = (assetValue * assignment.percentage) / 100;
    currentValue += assignedValue;

    // Track allocation by asset class for comparison with recommended
    // For composite assets, distribute across their component classes
    if (asset.composition && asset.composition.length > 0) {
      for (const comp of asset.composition) {
        const compValue = (assignedValue * comp.percentage) / 100;
        allocationByClass[comp.assetClass] =
          (allocationByClass[comp.assetClass] || 0) + compValue;
      }
    } else {
      allocationByClass[asset.assetClass] =
        (allocationByClass[asset.assetClass] || 0) + assignedValue;
    }
  }

  // Convert absolute values to percentages
  const actualAllocation: Partial<Record<AssetClass, number>> = {};
  if (currentValue > 0) {
    for (const [cls, val] of Object.entries(allocationByClass)) {
      actualAllocation[cls as AssetClass] = (val / currentValue) * 100;
    }
  }

  // Progress metrics are only meaningful when a target amount is set
  const hasTarget = goal.targetAmount != null && goal.targetAmount > 0;
  const progressPercentage = hasTarget
    ? (currentValue / goal.targetAmount!) * 100
    : undefined;
  const remainingAmount = hasTarget
    ? Math.max(0, goal.targetAmount! - currentValue)
    : undefined;

  return {
    goalId: goal.id,
    goalName: goal.name,
    goalColor: goal.color,
    currentValue,
    targetAmount: goal.targetAmount,
    progressPercentage,
    remainingAmount,
    actualAllocation,
  };
}

/**
 * Derive portfolio-level target allocation from goal recommended allocations.
 *
 * Computes a weighted average of each goal's recommendedAllocation, where the
 * weight is the remaining gap × the goal's priority multiplier.
 * Goals without recommendedAllocation are excluded from the calculation.
 *
 * Returns null when no usable data is available (no goals with recommended
 * allocation, or total weight is zero).
 */
export function deriveTargetAllocationFromGoals(
  goals: InvestmentGoal[],
  assignments: GoalAssetAssignment[],
  assets: Asset[]
): Partial<Record<AssetClass, number>> | null {
  // Only consider goals that have both a target amount and a recommended allocation.
  // Open-ended goals (no targetAmount) are excluded because there is no gap to fill.
  const eligibleGoals = goals.filter(
    (g) =>
      g.targetAmount != null &&
      g.targetAmount > 0 &&
      g.recommendedAllocation &&
      Object.keys(g.recommendedAllocation).length > 0
  );

  if (eligibleGoals.length === 0) return null;

  // Build weighted entries: weight = gap_to_fill × priority_multiplier
  const weighted: { allocation: Partial<Record<AssetClass, number>>; weight: number }[] = [];
  let totalWeight = 0;

  for (const goal of eligibleGoals) {
    const progress = calculateGoalProgress(goal, assignments, assets);
    const gap = Math.max(0, goal.targetAmount! - progress.currentValue);

    // Skip goals that are already fully funded — no more dollars needed there
    if (gap <= 0) continue;

    const priorityMultiplier = GOAL_PRIORITY_WEIGHTS[goal.priority] ?? 1;
    const weight = gap * priorityMultiplier;

    weighted.push({ allocation: goal.recommendedAllocation!, weight });
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;

  // Compute weighted average of recommendedAllocation across all eligible goals
  const result: Partial<Record<AssetClass, number>> = {};

  for (const { allocation, weight } of weighted) {
    for (const [cls, pct] of Object.entries(allocation)) {
      const current = result[cls as AssetClass] || 0;
      result[cls as AssetClass] = current + ((pct as number) * weight) / totalWeight;
    }
  }

  // Round to 1 decimal and guarantee sum = 100% via remainder strategy.
  // Sort descending so rounding error lands on the smallest asset class.
  const entries = Object.entries(result) as [AssetClass, number][];
  if (entries.length === 0) return null;

  entries.sort((a, b) => b[1] - a[1]);

  const rounded: Partial<Record<AssetClass, number>> = {};
  let allocated = 0;

  for (let i = 0; i < entries.length - 1; i++) {
    const pct = Math.round(entries[i][1] * 10) / 10;
    rounded[entries[i][0]] = pct;
    allocated += pct;
  }

  // Last class absorbs remainder to guarantee exact 100% sum
  rounded[entries[entries.length - 1][0]] =
    Math.round((100 - allocated) * 10) / 10;

  return rounded;
}

/**
 * Picks the identity colour for a newly created goal: the first palette entry the
 * user is not already using, falling back to a round-robin over the palette once
 * every colour is taken.
 *
 * Exists because a goal created outside `GoalFormDialog` (the assistant's proposal
 * card) has no colour picker to read from, and two goals sharing a hex are
 * indistinguishable in every chart that keys on it.
 */
export function pickNextGoalColor(existingGoals: InvestmentGoal[]): string {
  const used = new Set(existingGoals.map((g) => g.color));
  const free = GOAL_COLORS.find((color) => !used.has(color));
  return free ?? GOAL_COLORS[existingGoals.length % GOAL_COLORS.length];
}

/**
 * Serialises one goal into the shape Firestore accepts.
 *
 * Firestore rejects `undefined` inside an array element and the goals array is
 * written whole, so every optional field is spread conditionally.
 *
 * WARNING: this allowlist IS the persistence contract for `InvestmentGoal`. A new
 * optional field added to the type is silently dropped on save until it is added
 * here — and this is now the single copy, shared by `saveGoalData` (client) and
 * `POST /api/goals` (server), so the two can no longer drift apart.
 */
export function serializeGoalForFirestore(goal: InvestmentGoal): Record<string, unknown> {
  return {
    id: goal.id,
    name: goal.name,
    priority: goal.priority,
    color: goal.color,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    ...(goal.targetAmount != null ? { targetAmount: goal.targetAmount } : {}),
    ...(goal.targetDate != null ? { targetDate: goal.targetDate } : {}),
    ...(goal.monthlyContribution != null ? { monthlyContribution: goal.monthlyContribution } : {}),
    ...(goal.recommendedAllocation != null ? { recommendedAllocation: goal.recommendedAllocation } : {}),
    ...(goal.notes != null ? { notes: goal.notes } : {}),
  };
}
