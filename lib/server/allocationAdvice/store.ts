import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import { removeUndefinedDeep } from '@/lib/utils/firestoreData';
import { mapAllocationAdviceData } from '@/lib/utils/allocationAdviceDocument';
import type { AllocationAdviceDocument } from '@/types/allocationAdvice';

/**
 * The Consulente's ONE document per account, `allocationAdvice/{userId}` (2026-10-20):
 * written only here, with the Admin SDK (the run and the «applied» route); read by the client
 * through `lib/services/allocationAdviceService.ts` under the rules (`read: canAccess`,
 * `write: false`). Dates travel as Timestamps and come back as Dates field by field
 * (`mapAllocationAdviceData`), never through JSON (AGENTS.md § Caching).
 *
 * The archive `allocationAdvice/{userId}/history/{createdAt ISO}` (2026-11-08): the document a
 * new path replaces, copied whole when it has a report, before the new one is written. Admin
 * only, both ways (`rules: read, write: false`): the Consulente reads the last
 * `ALLOCATION_ADVICE_HISTORY_LIMIT` for the interview and the strategy; no page shows it yet.
 */

const COLLECTION = 'allocationAdvice';
const HISTORY = 'history';

export async function getAllocationAdviceAdmin(userId: string): Promise<AllocationAdviceDocument | null> {
  const snap = await adminDb.collection(COLLECTION).doc(userId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data ? mapAllocationAdviceData(userId, data) : null;
}

/** Replaces the document whole — a run starts from its answers and nothing of the last run survives. */
export async function setAllocationAdviceAdmin(document: AllocationAdviceDocument): Promise<void> {
  await adminDb
    .collection(COLLECTION)
    .doc(document.userId)
    .set(removeUndefinedDeep({ ...document, updatedAt: new Date() }));
}

/** Copies a finished document into the archive, keyed by its creation instant: the same path archived twice overwrites itself. */
export async function archiveAllocationAdviceAdmin(document: AllocationAdviceDocument): Promise<void> {
  await adminDb
    .collection(COLLECTION)
    .doc(document.userId)
    .collection(HISTORY)
    .doc(document.createdAt.toISOString())
    .set(removeUndefinedDeep({ ...document, archivedAt: new Date() }));
}

/** The archived paths, the most recent first, at most `limit`. */
export async function listAllocationAdviceHistoryAdmin(userId: string, limit: number): Promise<AllocationAdviceDocument[]> {
  const snap = await adminDb.collection(COLLECTION).doc(userId).collection(HISTORY).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((doc) => mapAllocationAdviceData(userId, doc.data()));
}

/** Merges a partial onto the document; only the fields present in `patch` move. */
export async function patchAllocationAdviceAdmin(userId: string, patch: Partial<AllocationAdviceDocument>): Promise<void> {
  await adminDb
    .collection(COLLECTION)
    .doc(userId)
    .set(removeUndefinedDeep({ ...patch, updatedAt: new Date() }), { merge: true });
}
