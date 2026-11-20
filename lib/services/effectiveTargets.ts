import type { Asset, AssetAllocationSettings, AssetAllocationTarget } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';
import { deriveTargetAllocationFromGoals } from '@/lib/utils/goalMath';
import { buildTargetsFromGoalAllocation, getDefaultTargets } from '@/lib/services/assetAllocationService';

/**
 * The targets Allocazione measures: derived from the goals when goal-driven allocation is on and a
 * goal yields an allocation, else the stored targets, else the defaults. ONE rule for the page and
 * for the plan the Consulente's «Applica» creates (2026-11-20), so the plan measures what the page
 * does. Not in `allocationUtils`, because the goal derivation pulls the client SDK (owner, 2026-11-20), nor in
 * `assetAllocationService`, which every page loads: `goalMath` cost the shared code 0,9 KB gz (perf:budget, 2026-11-20). Goal-derived targets read the full asset list: a goal is funded by total wealth.
 */
export function resolveEffectiveTargets(
  settings: AssetAllocationSettings | null | undefined,
  goalData: GoalBasedInvestingData | null | undefined,
  assets: Asset[]
): { targets: AssetAllocationTarget; fromGoals: boolean } {
  if (settings?.goalBasedInvestingEnabled && settings?.goalDrivenAllocationEnabled && goalData && goalData.goals.length > 0) {
    const derived = deriveTargetAllocationFromGoals(goalData.goals, goalData.assignments, assets);
    if (derived) return { targets: buildTargetsFromGoalAllocation(derived, settings?.targets), fromGoals: true };
  }
  return { targets: settings?.targets || getDefaultTargets(), fromGoals: false };
}
