/**
 * Pure helpers for the Panoramica (Overview) dashboard page.
 *
 * Deliberately import nothing from the Firebase/Firestore layer (mirrors the
 * convention in lib/utils/allocationUtils.ts) so they're directly unit-testable —
 * dashboardOverviewService.ts (server-only) calls these with data it has already
 * fetched via adminDb.
 */

import { Asset, MonthlySnapshot } from '@/types/assets';
import { GoalAssetAssignment, GoalPriority, InvestmentGoal } from '@/types/goals';
import { DashboardOverviewGoalProgress, DashboardOverviewMover } from '@/types/dashboardOverview';
import { calculateAssetValue } from '@/lib/services/assetService';
import { prepareAssetClassDistributionData } from '@/lib/services/chartService';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';

/**
 * Top 1-2 asset classes that moved the most (by absolute euro delta) between the
 * previous month's snapshot and the live portfolio — the "Guidato da" digest under
 * the hero sparkline. Deltas under €1 are dropped as noise. Returns [] when there's
 * no prior snapshot to compare against (first month) or the portfolio is empty.
 */
export function computeTopMovers(
  assets: Asset[],
  previousSnapshot: MonthlySnapshot | null,
  totalValue: number
): DashboardOverviewMover[] {
  if (!previousSnapshot || totalValue <= 0) return [];

  const currentByClass = prepareAssetClassDistributionData(assets);
  const previousByClass = previousSnapshot.byAssetClass ?? {};
  const classes = new Set<string>([
    ...currentByClass.map((d) => d.assetClass).filter((c): c is string => !!c),
    ...Object.keys(previousByClass),
  ]);

  const movers: DashboardOverviewMover[] = [];
  for (const assetClass of classes) {
    const current = currentByClass.find((d) => d.assetClass === assetClass)?.value ?? 0;
    const previous = previousByClass[assetClass] ?? 0;
    const delta = current - previous;
    if (Math.abs(delta) < 1) continue;
    movers.push({ assetClass, label: ASSET_CLASS_LABELS[assetClass] ?? assetClass, delta });
  }

  return movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 2);
}

/**
 * All-time-high check: compares the live total against the highest historical
 * snapshot, excluding the current month's own snapshot so overwriting this
 * month's snapshot never compares the value against itself.
 * previousAllTimeHigh is null (and isNewATH false) when there's no prior
 * snapshot to compare against — a first-ever snapshot is a baseline, not a record.
 */
export function computeAllTimeHigh(
  snapshots: MonthlySnapshot[],
  currentMonth: number,
  currentYear: number,
  liveTotalValue: number
): { previousAllTimeHigh: number | null; isNewATH: boolean } {
  const priorSnapshots = snapshots.filter(
    (s) => !(s.year === currentYear && s.month === currentMonth)
  );

  if (priorSnapshots.length === 0) {
    return { previousAllTimeHigh: null, isNewATH: false };
  }

  const previousAllTimeHigh = Math.max(...priorSnapshots.map((s) => s.totalNetWorth));

  return {
    previousAllTimeHigh,
    isNewATH: liveTotalValue > previousAllTimeHigh,
  };
}

const GOAL_PRIORITY_RANK: Record<GoalPriority, number> = { alta: 0, media: 1, bassa: 2 };

/**
 * Picks the single most relevant in-progress goal to surface on Overview:
 * highest priority first, then furthest along (highest progress %) among ties.
 * Fully-funded goals (progress >= 100%) and open-ended goals (no targetAmount,
 * so no percentage to show) are excluded.
 */
export function pickFeaturedGoalProgress(
  goals: InvestmentGoal[],
  assignments: GoalAssetAssignment[],
  assets: Asset[]
): DashboardOverviewGoalProgress | null {
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const candidates = goals
    .filter((g) => g.targetAmount != null && g.targetAmount > 0)
    .map((goal) => {
      let currentValue = 0;
      for (const assignment of assignments) {
        if (assignment.goalId !== goal.id) continue;
        const asset = assetMap.get(assignment.assetId);
        if (!asset) continue; // Skip orphaned assignments (asset deleted from portfolio)
        currentValue += (calculateAssetValue(asset) * assignment.percentage) / 100;
      }
      const progressPercentage = (currentValue / goal.targetAmount!) * 100;
      return { goal, currentValue, progressPercentage };
    })
    .filter((c) => c.progressPercentage < 100);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const rankDiff = GOAL_PRIORITY_RANK[a.goal.priority] - GOAL_PRIORITY_RANK[b.goal.priority];
    if (rankDiff !== 0) return rankDiff;
    return b.progressPercentage - a.progressPercentage;
  });

  const best = candidates[0];
  return {
    goalId: best.goal.id,
    goalName: best.goal.name,
    goalColor: best.goal.color,
    currentValue: best.currentValue,
    targetAmount: best.goal.targetAmount!,
    progressPercentage: best.progressPercentage,
  };
}
