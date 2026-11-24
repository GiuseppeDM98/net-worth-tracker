/**
 * The daily archive on the server (Admin SDK): the snapshot route files today's row, a server
 * reader takes a window of days. The browser reads the same documents through
 * `lib/services/dailySnapshotService.ts`; the rules let nobody write them from there.
 */
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  DAILY_SNAPSHOTS_COLLECTION, DAILY_SNAPSHOTS_SUBCOLLECTION, flattenDailyMonths, monthKeysBetween, splitIsoDay,
  type DailyPoint, type DailySnapshotDay, type DailySnapshotMonth,
} from '@/lib/utils/dailySnapshot';

function monthRef(db: Firestore, userId: string, monthKey: string) {
  return db.collection(DAILY_SNAPSHOTS_COLLECTION).doc(userId).collection(DAILY_SNAPSHOTS_SUBCOLLECTION).doc(monthKey);
}

/**
 * Files one day. `mergeFields` names the day's own path, so the row is REPLACED whole and the other
 * days are not read nor touched; `{ merge: true }` would merge the nested maps key by key and keep
 * the row of an instrument sold since the morning.
 */
export async function writeDailySnapshotDay(db: Firestore, userId: string, isoDay: string, day: DailySnapshotDay): Promise<void> {
  const { monthKey, day: dayKey } = splitIsoDay(isoDay);
  await monthRef(db, userId, monthKey).set(
    { userId, month: monthKey, updatedAt: Timestamp.now(), days: { [dayKey]: day } },
    { mergeFields: ['userId', 'month', 'updatedAt', `days.${dayKey}`] },
  );
}

export async function readDailyPoints(db: Firestore, userId: string, fromIso: string, toIso: string): Promise<DailyPoint[]> {
  const snaps = await Promise.all(monthKeysBetween(fromIso, toIso).map((key) => monthRef(db, userId, key).get()));
  const months = snaps.filter((snap) => snap.exists).map((snap) => snap.data() as DailySnapshotMonth);
  return flattenDailyMonths(months, fromIso, toIso);
}
