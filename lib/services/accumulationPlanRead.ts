/**
 * The read of the `accumulationPlans` collection, apart from the writes (2026-11-12): the
 * Allocazione page reads it on its first load for the Piano's note, and must not pull the service
 * that writes plans (its schema, engine and words).
 *
 * Filtered by `userId` equality only (no `orderBy`, no composite index): the rules refuse a list
 * that does not carry it, and the sort by `createdAt` happens in memory.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { ACCUMULATION_PLANS_COLLECTION, docToAccumulationPlan } from '@/lib/utils/accumulationPlanDoc';
import type { AccumulationPlan } from '@/types/accumulationPlan';

/** All of an owner's plans, newest first. */
export async function getAccumulationPlans(ownerId: string): Promise<AccumulationPlan[]> {
  const snapshot = await getDocs(
    query(collection(db, ACCUMULATION_PLANS_COLLECTION), where('userId', '==', ownerId))
  );
  return snapshot.docs
    .map((snap) => docToAccumulationPlan(snap.id, snap.data() as Record<string, unknown>))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
