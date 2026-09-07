import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Asset } from '@/types/assets';
import {
  GoalBasedInvestingData,
  GoalAssetAssignment,
  InvestmentGoal,
} from '@/types/goals';
import { calculateAssetValue } from './assetService';
import { serializeGoalForFirestore } from '@/lib/utils/goalMath';

// Goal-Based Investing Service
//
// Manages CRUD operations for investment goals and provides pure calculation
// functions for goal progress, allocation analysis, and validation.
// Data is stored as a single Firestore document per user.
//
// The math the server also needs — calculateGoalProgress and
// deriveTargetAllocationFromGoals — lives in lib/utils/goalMath.ts and is
// re-exported here: this module imports the client Firestore SDK at top level,
// so server-only code can never import it (doc/guide/panoramica.md § Panoramica and Dashboard
// Data Isolation). Client call sites keep importing them from here.

export {
  calculateGoalProgress,
  deriveTargetAllocationFromGoals,
} from '@/lib/utils/goalMath';

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
    // Strip undefined values — Firestore rejects them inside an array element.
    // The allowlist is shared with POST /api/goals via serializeGoalForFirestore.
    const cleanGoals = data.goals.map(serializeGoalForFirestore);
    await setDoc(docRef, {
      goals: cleanGoals,
      assignments: data.assignments,
      userId,
      updatedAt: new Date(),
    });
  } catch (error) {
    console.error('Error saving goal data:', error);
    throw error;
  }
}

// ==================== Pure Calculation Functions ====================

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
