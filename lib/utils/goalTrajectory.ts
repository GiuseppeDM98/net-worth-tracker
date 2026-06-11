/**
 * Goal trajectory — the pure layer behind the "Obiettivi" redesign.
 *
 * Turns a goal's static target/date into the decision metrics the page exists for:
 *   - required monthly contribution to hit the target by its date (annuity formula),
 *   - projected completion date at the current contribution + expected return,
 *   - an on-track / off-track / reached verdict.
 *
 * Plus the derivations for the redesign's new features:
 *   - expectedAnnualReturn() from a goal's recommended allocation (B1),
 *   - buildGoalProjectionSeries() glide-path points for the mini chart (B2),
 *   - allocateContributionAcrossGoals() weighted split of new cash (B3),
 *   - sortGoalRowsByUrgency() + buildGoalsVerdictSummary() for the list order and hero (A1/A4).
 *
 * Everything is pure and time-injectable (`now`) so it can be unit-tested. No Firestore,
 * no React. The component layer only fetches, memoizes, and renders.
 *
 * Return assumptions are nominal and indicative, NOT financial advice — surfaced as such
 * in the UI copy.
 */

import { AssetClass } from '@/types/assets';
import {
  InvestmentGoal,
  GoalProgress,
  GoalPriority,
} from '@/types/goals';

// Nominal annual return assumptions per asset class (%). Deliberately conservative.
export const GOAL_CLASS_RETURNS: Record<AssetClass, number> = {
  equity: 7,
  bonds: 2.5,
  cash: 1,
  crypto: 12,
  realestate: 4,
  commodity: 3,
};

// Used when a goal has no recommended allocation to weight the return.
export const DEFAULT_GOAL_RETURN = 4;

// Priority multipliers for the cross-goal contribution split. Mirrors the
// weighting used by deriveTargetAllocationFromGoals so the two planners agree.
export const GOAL_PRIORITY_WEIGHTS: Record<GoalPriority, number> = {
  alta: 3,
  media: 2,
  bassa: 1,
};

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export type GoalVerdict =
  | 'reached' // currentValue >= target
  | 'onTrack' // dated goal, current pace reaches target by the deadline
  | 'offTrack' // dated goal, current pace falls short
  | 'noDeadline' // target set but no date — timing can't be judged
  | 'noTarget'; // open-ended goal

export interface GoalTrajectory {
  verdict: GoalVerdict;
  /** Expected nominal annual return used for this goal (%). */
  annualReturn: number;
  /** Months from `now` to the target date (>= 0), null if no date. */
  monthsToDeadline: number | null;
  /** Monthly contribution needed to hit the target by its date, null if not computable. */
  requiredMonthlyContribution: number | null;
  /** The contribution currently planned for this goal (0 if unset). */
  currentMonthlyContribution: number;
  /** Projected completion date at the current pace, null if never reached (or no target). */
  projectedDate: Date | null;
  /** Months to reach the target at the current pace, null if never / not applicable. */
  monthsToTarget: number | null;
  /** Projected value at the deadline at the current pace (only for dated goals). */
  projectedValueAtDeadline: number | null;
}

export interface GoalTrajectoryInput {
  currentValue: number;
  targetAmount?: number;
  targetDate?: string; // ISO
  monthlyContribution?: number;
  /** Override the derived return (mainly for tests). */
  annualReturn?: number;
  recommendedAllocation?: Partial<Record<AssetClass, number>>;
  now?: Date;
}

/**
 * Weighted nominal annual return implied by a goal's recommended allocation.
 * Falls back to DEFAULT_GOAL_RETURN when no usable allocation is given.
 */
export function expectedAnnualReturn(
  allocation?: Partial<Record<AssetClass, number>>
): number {
  if (!allocation) return DEFAULT_GOAL_RETURN;
  const entries = Object.entries(allocation) as [AssetClass, number][];
  const total = entries.reduce((s, [, pct]) => s + (pct || 0), 0);
  if (total <= 0) return DEFAULT_GOAL_RETURN;
  const weighted = entries.reduce(
    (s, [cls, pct]) => s + (GOAL_CLASS_RETURNS[cls] ?? DEFAULT_GOAL_RETURN) * (pct || 0),
    0
  );
  return weighted / total;
}

function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / MS_PER_MONTH));
}

/**
 * Future value of a starting balance plus a fixed monthly contribution,
 * compounded monthly. Handles the zero-rate case.
 */
export function futureValue(
  presentValue: number,
  monthlyContribution: number,
  annualReturn: number,
  months: number
): number {
  if (months <= 0) return presentValue;
  const r = annualReturn / 100 / 12;
  if (r === 0) return presentValue + monthlyContribution * months;
  const growth = Math.pow(1 + r, months);
  return presentValue * growth + monthlyContribution * ((growth - 1) / r);
}

/**
 * Monthly contribution required to reach `target` in `months`, starting from
 * `presentValue` and compounding at `annualReturn`. Returns 0 when growth alone
 * already gets there. `months` is clamped to >= 1.
 */
export function requiredMonthlyContribution(
  presentValue: number,
  target: number,
  annualReturn: number,
  months: number
): number {
  const n = Math.max(1, months);
  const r = annualReturn / 100 / 12;
  if (r === 0) {
    return Math.max(0, (target - presentValue) / n);
  }
  const growth = Math.pow(1 + r, n);
  const grownPv = presentValue * growth;
  if (grownPv >= target) return 0;
  return (target - grownPv) / ((growth - 1) / r);
}

/**
 * Months needed to reach `target` from `presentValue` at the given monthly
 * contribution and return. Returns null when the target is never reached.
 */
export function monthsToReach(
  presentValue: number,
  target: number,
  monthlyContribution: number,
  annualReturn: number
): number | null {
  if (presentValue >= target) return 0;
  const r = annualReturn / 100 / 12;
  if (r === 0) {
    if (monthlyContribution <= 0) return null;
    return Math.ceil((target - presentValue) / monthlyContribution);
  }
  // x = (1+r)^n ; PV*x + (c/r)(x-1) = T  →  x = (T + c/r) / (PV + c/r)
  const base = presentValue + monthlyContribution / r;
  if (base <= 0) return null;
  const x = (target + monthlyContribution / r) / base;
  if (x <= 1) return 0;
  const n = Math.log(x) / Math.log(1 + r);
  if (!isFinite(n) || n <= 0) return null;
  return Math.ceil(n);
}

export function computeGoalTrajectory(input: GoalTrajectoryInput): GoalTrajectory {
  const now = input.now ?? new Date();
  const annualReturn =
    input.annualReturn ?? expectedAnnualReturn(input.recommendedAllocation);
  const currentMonthlyContribution = Math.max(0, input.monthlyContribution ?? 0);
  const currentValue = Math.max(0, input.currentValue);
  const hasTarget = input.targetAmount != null && input.targetAmount > 0;
  const target = input.targetAmount ?? 0;

  const monthsToDeadline = input.targetDate
    ? monthsBetween(now, new Date(input.targetDate))
    : null;

  // Months / projected date at the current pace.
  const monthsToTarget = hasTarget
    ? monthsToReach(currentValue, target, currentMonthlyContribution, annualReturn)
    : null;
  const projectedDate =
    monthsToTarget != null
      ? new Date(now.getTime() + monthsToTarget * MS_PER_MONTH)
      : null;

  // Required contribution + value-at-deadline only make sense for dated goals.
  let required: number | null = null;
  let projectedValueAtDeadline: number | null = null;
  if (hasTarget && monthsToDeadline != null) {
    required = requiredMonthlyContribution(currentValue, target, annualReturn, monthsToDeadline);
    projectedValueAtDeadline = futureValue(
      currentValue,
      currentMonthlyContribution,
      annualReturn,
      monthsToDeadline
    );
  }

  // Verdict.
  let verdict: GoalVerdict;
  if (!hasTarget) {
    verdict = 'noTarget';
  } else if (currentValue >= target) {
    verdict = 'reached';
  } else if (monthsToDeadline == null) {
    verdict = 'noDeadline';
  } else {
    // On track if the projected value at the deadline covers the target
    // (1% tolerance to avoid flapping on rounding).
    const onTrack =
      projectedValueAtDeadline != null && projectedValueAtDeadline >= target * 0.999;
    verdict = onTrack ? 'onTrack' : 'offTrack';
  }

  return {
    verdict,
    annualReturn,
    monthsToDeadline,
    requiredMonthlyContribution: required,
    currentMonthlyContribution,
    projectedDate,
    monthsToTarget,
    projectedValueAtDeadline,
  };
}

/**
 * Glide-path points for the per-goal projection chart (B2). Produces at most
 * ~`maxPoints` samples from now to the horizon (the deadline if dated, otherwise
 * the projected completion, capped at 50 years). Each point carries the projected
 * value and the flat target line.
 */
export interface GoalProjectionPoint {
  monthIndex: number;
  /** Epoch ms — the component formats the label. */
  timestamp: number;
  value: number;
  target: number;
}

export function buildGoalProjectionSeries(
  input: GoalTrajectoryInput & { targetAmount: number },
  maxPoints = 48
): GoalProjectionPoint[] {
  const now = input.now ?? new Date();
  const annualReturn =
    input.annualReturn ?? expectedAnnualReturn(input.recommendedAllocation);
  const contribution = Math.max(0, input.monthlyContribution ?? 0);
  const currentValue = Math.max(0, input.currentValue);
  const target = input.targetAmount;

  const deadlineMonths = input.targetDate
    ? monthsBetween(now, new Date(input.targetDate))
    : null;
  const reachMonths = monthsToReach(currentValue, target, contribution, annualReturn);

  // Horizon: prefer the deadline; otherwise the projected reach; cap at 600 months.
  let horizon = deadlineMonths ?? reachMonths ?? 0;
  if (horizon <= 0) horizon = Math.max(reachMonths ?? 12, 12);
  horizon = Math.min(Math.max(horizon, 1), 600);

  const step = Math.max(1, Math.ceil(horizon / maxPoints));
  const points: GoalProjectionPoint[] = [];
  for (let m = 0; m <= horizon; m += step) {
    points.push({
      monthIndex: m,
      timestamp: now.getTime() + m * MS_PER_MONTH,
      value: Math.round(futureValue(currentValue, contribution, annualReturn, m)),
      target,
    });
  }
  // Ensure the final horizon point is included.
  if (points[points.length - 1]?.monthIndex !== horizon) {
    points.push({
      monthIndex: horizon,
      timestamp: now.getTime() + horizon * MS_PER_MONTH,
      value: Math.round(futureValue(currentValue, contribution, annualReturn, horizon)),
      target,
    });
  }
  return points;
}

/**
 * Split a new contribution across goals (B3), weighted by remaining gap × priority.
 * Mirrors deriveTargetAllocationFromGoals' weighting. Only goals with an unfilled
 * money gap participate; fully-funded and open-ended goals are skipped.
 */
export interface GoalContributionSlice {
  goalId: string;
  goalName: string;
  color: string;
  add: number;
  gap: number;
  priority: GoalPriority;
}

export function allocateContributionAcrossGoals(
  goals: InvestmentGoal[],
  progressList: GoalProgress[],
  amount: number
): GoalContributionSlice[] {
  if (amount <= 0) return [];
  const progressById = new Map(progressList.map((p) => [p.goalId, p]));

  const weighted = goals
    .map((goal) => {
      const progress = progressById.get(goal.id);
      if (!progress || goal.targetAmount == null || goal.targetAmount <= 0) return null;
      const gap = Math.max(0, goal.targetAmount - progress.currentValue);
      if (gap <= 0) return null;
      const weight = gap * (GOAL_PRIORITY_WEIGHTS[goal.priority] ?? 1);
      return { goal, gap, weight };
    })
    .filter((e): e is { goal: InvestmentGoal; gap: number; weight: number } => e != null);

  const totalWeight = weighted.reduce((s, e) => s + e.weight, 0);
  if (totalWeight === 0) return [];

  return weighted
    .map(({ goal, gap, weight }) => ({
      goalId: goal.id,
      goalName: goal.name,
      color: goal.color,
      // Never propose adding more than the remaining gap.
      add: Math.min(gap, (amount * weight) / totalWeight),
      gap,
      priority: goal.priority,
    }))
    .sort((a, b) => b.add - a.add);
}

// ==================== List ordering + hero summary (A1/A4) ====================

export interface GoalRow {
  goal: InvestmentGoal;
  progress: GoalProgress;
  trajectory: GoalTrajectory;
}

// Lower rank = higher in the list. Off-track first (most urgent), reached last.
const VERDICT_RANK: Record<GoalVerdict, number> = {
  offTrack: 0,
  onTrack: 1,
  noDeadline: 2,
  noTarget: 3,
  reached: 4,
};

export function sortGoalRowsByUrgency(rows: GoalRow[]): GoalRow[] {
  return [...rows].sort((a, b) => {
    const rankDiff = VERDICT_RANK[a.trajectory.verdict] - VERDICT_RANK[b.trajectory.verdict];
    if (rankDiff !== 0) return rankDiff;
    // Within the same verdict, the nearest deadline first; undated sink below dated.
    const am = a.trajectory.monthsToDeadline;
    const bm = b.trajectory.monthsToDeadline;
    if (am != null && bm != null) return am - bm;
    if (am != null) return -1;
    if (bm != null) return 1;
    return 0;
  });
}

export interface GoalsVerdictSummary {
  total: number;
  reached: number;
  onTrack: number;
  offTrack: number;
  /** Goals with a target+date that are not yet reached. */
  withDeadline: number;
  /** Sum of required monthly contributions across dated, not-reached goals. */
  totalRequiredMonthly: number;
  /** Nearest upcoming deadline among not-reached dated goals. */
  nearest: {
    goalName: string;
    color: string;
    monthsToDeadline: number;
    verdict: GoalVerdict;
  } | null;
}

export function buildGoalsVerdictSummary(rows: GoalRow[]): GoalsVerdictSummary {
  let reached = 0;
  let onTrack = 0;
  let offTrack = 0;
  let withDeadline = 0;
  let totalRequiredMonthly = 0;
  let nearest: GoalsVerdictSummary['nearest'] = null;

  for (const { goal, trajectory } of rows) {
    if (trajectory.verdict === 'reached') reached++;
    else if (trajectory.verdict === 'onTrack') onTrack++;
    else if (trajectory.verdict === 'offTrack') offTrack++;

    const dated =
      trajectory.verdict !== 'reached' &&
      trajectory.monthsToDeadline != null &&
      trajectory.requiredMonthlyContribution != null;

    if (dated) {
      withDeadline++;
      totalRequiredMonthly += trajectory.requiredMonthlyContribution ?? 0;
      if (nearest == null || trajectory.monthsToDeadline! < nearest.monthsToDeadline) {
        nearest = {
          goalName: goal.name,
          color: goal.color,
          monthsToDeadline: trajectory.monthsToDeadline!,
          verdict: trajectory.verdict,
        };
      }
    }
  }

  return {
    total: rows.length,
    reached,
    onTrack,
    offTrack,
    withDeadline,
    totalRequiredMonthly,
    nearest,
  };
}
