/**
 * Client read of the daily archive the snapshot route writes to
 * dailySnapshots/{userId}/months/{YYYY-MM} (lib/server/dailySnapshotStore.ts).
 *
 * One `getDoc` per month key rather than a query, as `getBudgetHistory` does: the documents have
 * deterministic ids, and a month never written must read as «absent», not as a permission error —
 * the rule reads the uid from the path, never from `resource.data`.
 */

import { doc, getDoc, type DocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import {
  DAILY_SNAPSHOTS_COLLECTION,
  DAILY_SNAPSHOTS_SUBCOLLECTION,
  type DailySnapshotMonth,
} from '@/lib/utils/dailySnapshot';

function readMonth(userId: string, monthKey: string): Promise<DocumentSnapshot> {
  return getDoc(doc(db, DAILY_SNAPSHOTS_COLLECTION, userId, DAILY_SNAPSHOTS_SUBCOLLECTION, monthKey));
}

/** `updatedAt`, the document's only Timestamp, is dropped: the rows carry their own instant. */
function toMonth(snap: DocumentSnapshot): DailySnapshotMonth | null {
  if (!snap.exists()) return null;
  const data = snap.data();
  return { userId: data.userId, month: data.month, days: data.days ?? {} };
}

/** The months of `monthKeys` ('YYYY-MM') that exist, in no particular order. */
export async function getDailySnapshotMonths(userId: string, monthKeys: string[]): Promise<DailySnapshotMonth[]> {
  const snaps = await Promise.all(monthKeys.map((key) => readMonth(userId, key)));
  return snaps.map(toMonth).filter((month): month is DailySnapshotMonth => month !== null);
}

/** One month, or null when it was never written. */
export async function getDailySnapshotMonth(userId: string, monthKey: string): Promise<DailySnapshotMonth | null> {
  return toMonth(await readMonth(userId, monthKey));
}
