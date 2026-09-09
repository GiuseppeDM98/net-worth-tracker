/**
 * The history of the budget configuration, month by month — what makes a closed month
 * readable against the ceiling it HAD, not the one set today.
 *
 * `budgets/{userId}` holds only the current configuration: raise the ceiling in August and
 * nothing remembers June's. The daily cron (lib/server/budgetHistoryService.ts) copies the
 * configuration into `budgetHistory/{userId}/months/{YYYY-MM}` every day, so at the end of
 * a month its record is the configuration of the month's last captured day. This module is
 * the pure half: building the record, and resolving which ceiling each trailing month reads
 * against — its own when recorded, today's otherwise, and the source is carried along so the
 * reading can say which (The Narrative Honesty Rule). SDK-free: the server and the tab share it.
 */

import type { BudgetConfig, BudgetHistoryRecord } from '@/types/budget';
import { DEFAULT_ALERT_THRESHOLDS } from '@/types/budget';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

/** 'YYYY-MM' of `date` on the Italian calendar — the record's key. */
export function monthKeyOf(date: Date): string {
  const { year, month } = getItalyMonthYear(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** The configuration frozen under the month of `now`; an absent ceiling stays absent (no `undefined` for Firestore). */
export function buildBudgetHistoryRecord(
  userId: string,
  config: Pick<BudgetConfig, 'items'> & Partial<Pick<BudgetConfig, 'overallMonthlyAmount' | 'alertsEnabled' | 'alertThresholds'>>,
  now: Date,
): BudgetHistoryRecord {
  const record: BudgetHistoryRecord = {
    userId,
    month: monthKeyOf(now),
    items: config.items,
    alertsEnabled: config.alertsEnabled ?? true,
    alertThresholds: config.alertThresholds ?? DEFAULT_ALERT_THRESHOLDS,
    capturedAt: now,
  };
  if (config.overallMonthlyAmount !== undefined && config.overallMonthlyAmount !== null) {
    record.overallMonthlyAmount = config.overallMonthlyAmount;
  }
  return record;
}

export interface MonthCeiling {
  /** The ceiling the month is read against; null when there is none to read against. */
  ceiling: number | null;
  /** 'recorded' = the month's own record; 'current' = today's configuration stood in for it. */
  source: 'recorded' | 'current';
}

/**
 * Which ceiling each month of `monthKeys` reads against. A closed month with a record reads
 * its own (even when that is "none"); the running month and every month before the records
 * began read today's, flagged `current` so the caption can say «tetto attuale» for them.
 */
export function resolveMonthCeilings(
  records: BudgetHistoryRecord[],
  monthKeys: string[],
  runningKey: string,
  currentCeiling: number | null,
): Map<string, MonthCeiling> {
  const byMonth = new Map(records.map((record) => [record.month, record]));
  const out = new Map<string, MonthCeiling>();
  for (const key of monthKeys) {
    const record = key === runningKey ? undefined : byMonth.get(key);
    if (record) {
      out.set(key, { ceiling: record.overallMonthlyAmount && record.overallMonthlyAmount > 0 ? record.overallMonthlyAmount : null, source: 'recorded' });
    } else {
      out.set(key, { ceiling: currentCeiling && currentCeiling > 0 ? currentCeiling : null, source: 'current' });
    }
  }
  return out;
}
