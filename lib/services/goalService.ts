import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Asset, AssetClass } from '@/types/assets';
import {
  GoalBasedInvestingData,
  GoalAssetAssignment,
  GoalProgress,
  InvestmentGoal,
} from '@/types/goals';
import { calculateAssetValue } from './assetService';

// Goal-Based Investing Service
//
// Manages CRUD operations for investment goals and provides pure calculation
// functions for goal progress, allocation analysis, and validation.
// Data is stored as a single Firestore document per user.

const GOALS_COLLECTION = 'goalBasedInvesting';

// ==================== Firestore CRUD ====================

/** Fetch all goal data for a user, returns null if no document exists */
export async function getGoalData(
  userId: string
): Promise<GoalBasedInvestingData | null> {
  try {
    const docRef = doc(db, GOALS_COLLECTION, userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      goals: (data.goals || []) as InvestmentGoal[],
      assignments: (data.assignments || []) as GoalAssetAssignment[],
    };
  } catch (error) {
    console.error('Error getting goal data:', error);
    throw new Error('Failed to fetch goal data');
  }
}

/** Save all goal data for a user (complete replacement) */
export async function saveGoalData(
  userId: string,
  data: GoalBasedInvestingData
): Promise<void> {
  try {
    const docRef = doc(db, GOALS_COLLECTION, userId);
    // Strip undefined values — Firestore rejects them
    const cleanGoals = data.goals.map((g) => {
      const clean: Record<string, unknown> = {
        id: g.id,
        name: g.name,
        priority: g.priority,
        color: g.color,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
      };
      if (g.targetAmount != null) clean.targetAmount = g.targetAmount;
      if (g.targetDate != null) clean.targetDate = g.targetDate;
      if (g.recommendedAllocation != null) clean.recommendedAllocation = g.recommendedAllocation;
      if (g.notes != null) clean.notes = g.notes;
      return clean;
    });
    await setDoc(docRef, {
      goals: cleanGoals,
      assignments: data.assignments,
      userId,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error saving goal data:', error);
    throw error;
  }
}

// ==================== Pure Calculation Functions ====================

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
 * Calculate total portfolio value not assigned to any goal.
 *
 * For each asset, sums the assigned percentages across all goals,
 * then adds the unassigned portion to the total.
 */
export function getUnassignedValue(
  assets: Asset[],
  assignments: GoalAssetAssignment[]
): number {
  // Build a map of assetId -> total assigned percentage
  const assignedByAsset = new Map<string, number>();
  for (const a of assignments) {
    assignedByAsset.set(
      a.assetId,
      (assignedByAsset.get(a.assetId) || 0) + a.percentage
    );
  }

  let unassigned = 0;
  for (const asset of assets) {
    const assetValue = calculateAssetValue(asset);
    const totalAssigned = assignedByAsset.get(asset.id) || 0;
    const unassignedPct = Math.max(0, 100 - totalAssigned);
    unassigned += (assetValue * unassignedPct) / 100;
  }

  return unassigned;
}

/**
 * Validate that no asset is over-assigned (> 100% total across all goals).
 * Returns array of error messages, empty if valid.
 */
export function validateAssignments(
  assignments: GoalAssetAssignment[],
  assets: Asset[]
): string[] {
  const errors: string[] = [];
  const assignedByAsset = new Map<string, number>();

  for (const a of assignments) {
    assignedByAsset.set(
      a.assetId,
      (assignedByAsset.get(a.assetId) || 0) + a.percentage
    );
  }

  const assetMap = new Map(assets.map((a) => [a.id, a]));

  for (const [assetId, totalPct] of assignedByAsset.entries()) {
    if (totalPct > 100) {
      const asset = assetMap.get(assetId);
      const name = asset ? asset.name : assetId;
      errors.push(`${name}: assegnato ${totalPct.toFixed(1)}% (max 100%)`);
    }
  }

  return errors;
}

/**
 * Remove orphaned assignments (references to deleted assets).
 * Returns a cleaned copy of the assignments array.
 */
export function cleanOrphanedAssignments(
  assignments: GoalAssetAssignment[],
  assets: Asset[]
): GoalAssetAssignment[] {
  const assetIds = new Set(assets.map((a) => a.id));
  return assignments.filter((a) => assetIds.has(a.assetId));
}

/**
 * Get the available (unassigned) percentage for an asset.
 * Takes into account all existing assignments except those for a specific goal
 * (useful when editing an existing assignment).
 */
export function getAvailablePercentage(
  assetId: string,
  assignments: GoalAssetAssignment[],
  excludeGoalId?: string
): number {
  let totalAssigned = 0;
  for (const a of assignments) {
    if (a.assetId === assetId && a.goalId !== excludeGoalId) {
      totalAssigned += a.percentage;
    }
  }
  return Math.max(0, 100 - totalAssigned);
}
