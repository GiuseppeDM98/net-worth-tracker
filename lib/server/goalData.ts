import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import {
  GoalAssetAssignment,
  GoalBasedInvestingData,
  InvestmentGoal,
} from '@/types/goals';
import { pickNextGoalColor, serializeGoalForFirestore } from '@/lib/utils/goalMath';

/**
 * Goal-Based Investing — the Admin-SDK gateway.
 *
 * `goalService.ts` is the client-SDK twin of this file and can never be imported
 * server-side (it pulls `firebase/firestore` and `db` at top level). Both read and
 * write the SAME single document per user, `goalBasedInvesting/{userId}`, rewritten
 * whole: there is no partial-update path, by design.
 */

const GOALS_COLLECTION = 'goalBasedInvesting';

/**
 * Read a user's goals and assignments with the Admin SDK.
 *
 * Returns null when the user has never opened Goal-Based Investing, which callers
 * must treat as "feature not in use" rather than "empty portfolio of goals".
 */
export async function getGoalDataAdmin(
  userId: string
): Promise<GoalBasedInvestingData | null> {
  const goalDoc = await adminDb.collection(GOALS_COLLECTION).doc(userId).get();

  if (!goalDoc.exists) {
    return null;
  }

  const data = goalDoc.data();

  if (!data) {
    return null;
  }

  return {
    goals: (data.goals ?? []) as InvestmentGoal[],
    assignments: (data.assignments ?? []) as GoalAssetAssignment[],
  };
}

/**
 * Append one goal to the user's document inside a transaction.
 *
 * The document is rewritten in full (the shape the client's `saveGoalData` also
 * writes), so the read-modify-write MUST be transactional: the FIRE page saves the
 * same document, and a plain read-then-set would drop whichever goal lost the race.
 * `assignments` and the goals already stored are carried over verbatim — they came
 * out of Firestore, so re-serialising them could only lose something.
 *
 * The colour is assigned here rather than by the caller so it is picked against the
 * very snapshot the write commits on: choosing it from an earlier read is how two
 * concurrently created goals end up the same colour.
 *
 * @returns the stored goal, colour included
 */
export async function appendInvestmentGoal(
  userId: string,
  goal: Omit<InvestmentGoal, 'color'>
): Promise<InvestmentGoal> {
  const docRef = adminDb.collection(GOALS_COLLECTION).doc(userId);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const data = snap.exists ? snap.data() : undefined;
    const storedGoals = (data?.goals ?? []) as InvestmentGoal[];
    const storedAssignments = (data?.assignments ?? []) as GoalAssetAssignment[];

    const created: InvestmentGoal = { ...goal, color: pickNextGoalColor(storedGoals) };

    tx.set(docRef, {
      goals: [...storedGoals, serializeGoalForFirestore(created)],
      assignments: storedAssignments,
      userId,
      updatedAt: new Date(),
    });

    return created;
  });
}
