/**
 * Client read of the monthly budget records the cron writes to
 * budgetHistory/{userId}/months/{YYYY-MM} (lib/server/budgetHistoryService.ts).
 *
 * One `getDoc` per month key rather than a query: the documents have deterministic ids, a
 * missing month must read as "no record" (not a permission error), and an equality + `in`
 * query on two fields would need a composite index for six reads that need none.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { BudgetHistoryRecord, BudgetItem } from '@/types/budget';
import { DEFAULT_ALERT_THRESHOLDS } from '@/types/budget';

const COLLECTION = 'budgetHistory';

/** The records of `monthKeys` ('YYYY-MM') that exist, in no particular order. */
export async function getBudgetHistory(userId: string, monthKeys: string[]): Promise<BudgetHistoryRecord[]> {
  const snaps = await Promise.all(monthKeys.map((key) => getDoc(doc(db, COLLECTION, userId, 'months', key))));
  const records: BudgetHistoryRecord[] = [];
  for (const snap of snaps) {
    if (!snap.exists()) continue;
    const data = snap.data();
    records.push({
      userId: data.userId,
      month: data.month,
      overallMonthlyAmount: data.overallMonthlyAmount,
      items: (data.items ?? []) as BudgetItem[],
      alertsEnabled: data.alertsEnabled ?? true,
      alertThresholds: data.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS,
      capturedAt: data.capturedAt?.toDate ? data.capturedAt.toDate() : new Date(data.capturedAt),
    });
  }
  return records;
}
