/**
 * Daily capture of every user's budget configuration into
 * `budgetHistory/{userId}/months/{YYYY-MM}` (phase 8 of the daily cron).
 *
 * Server-only: imports firebase-admin. One write per user with a `budgets` document, merged
 * under the month's key, so the record of a month ends up holding the configuration of its
 * last captured day — the "ceiling as it was" that `budgets/{userId}` alone cannot tell. The
 * record is built by the pure layer (lib/utils/budgetHistory.ts), which the Budget tab reads
 * the same way, so the two can never disagree on what a month's ceiling was.
 */

import { adminDb } from '@/lib/firebase/admin';
import type { BudgetItem } from '@/types/budget';
import { buildBudgetHistoryRecord } from '@/lib/utils/budgetHistory';

export interface BudgetHistoryCaptureResult {
  captured: number;
  skipped: number;
  errors: number;
}

/** Back-fills kind/period/amount for budget items saved before those fields existed (same as the emails). */
function normalizeItem(raw: BudgetItem & { monthlyAmount?: number }): BudgetItem {
  const kind =
    raw.kind === 'expense' || raw.kind === 'income'
      ? raw.kind
      : raw.scope === 'type' && raw.expenseType === 'income'
        ? 'income'
        : 'expense';
  return { ...raw, kind, period: raw.period ?? 'monthly', amount: raw.amount ?? raw.monthlyAmount ?? 0 };
}

/**
 * Captures the current configuration of every user who has one. A user without a `budgets`
 * document has nothing to record; a failed write is counted and logged, never fatal for the
 * others.
 */
export async function captureBudgetHistory(now: Date, demoUserId?: string): Promise<BudgetHistoryCaptureResult> {
  const result: BudgetHistoryCaptureResult = { captured: 0, skipped: 0, errors: 0 };
  const budgetsSnap = await adminDb.collection('budgets').get();

  for (const doc of budgetsSnap.docs) {
    const userId = doc.id;
    if (demoUserId && userId === demoUserId) {
      result.skipped++;
      continue;
    }
    try {
      const data = doc.data() ?? {};
      const items = ((data.items ?? []) as Array<BudgetItem & { monthlyAmount?: number }>).map(normalizeItem);
      const record = buildBudgetHistoryRecord(
        userId,
        {
          items,
          overallMonthlyAmount: data.overallMonthlyAmount,
          alertsEnabled: data.alertsEnabled,
          alertThresholds: data.alertThresholds,
        },
        now,
      );
      await adminDb.collection('budgetHistory').doc(userId).collection('months').doc(record.month).set(record, { merge: true });
      result.captured++;
    } catch (error) {
      console.error(`[cron] budget history capture failed for user ${userId}:`, error);
      result.errors++;
    }
  }
  return result;
}
