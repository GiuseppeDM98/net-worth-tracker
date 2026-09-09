/**
 * Tests for lib/utils/budgetHistory.ts — the monthly record of the budget configuration the
 * cron captures, and how the trailing months resolve THEIR ceiling from it: a month with a
 * record reads against its own ceiling, the running month against today's, a closed month
 * before the records began against today's too — and says so.
 */

import { describe, expect, it } from 'vitest';
import type { BudgetHistoryRecord, BudgetItem } from '@/types/budget';
import { buildBudgetHistoryRecord, monthKeyOf, resolveMonthCeilings } from '@/lib/utils/budgetHistory';

const NOW = new Date(2026, 7, 23, 12);
const item: BudgetItem = { id: 'i', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c', categoryName: 'Casa', amount: 1250, order: 0 };

describe('monthKeyOf', () => {
  it('is the Italian calendar month, zero-padded', () => {
    expect(monthKeyOf(NOW)).toBe('2026-08');
    expect(monthKeyOf(new Date(2026, 0, 1, 12))).toBe('2026-01');
  });
});

describe('buildBudgetHistoryRecord', () => {
  it('freezes the configuration under the month of capture, defaults filled', () => {
    const record = buildBudgetHistoryRecord('u1', { items: [item], overallMonthlyAmount: 4000 }, NOW);
    expect(record).toEqual({
      userId: 'u1',
      month: '2026-08',
      overallMonthlyAmount: 4000,
      items: [item],
      alertsEnabled: true,
      alertThresholds: [50, 75, 90, 100],
      capturedAt: NOW,
    });
  });

  it('leaves the ceiling out when there is none — undefined never reaches Firestore', () => {
    const record = buildBudgetHistoryRecord('u1', { items: [], alertsEnabled: false, alertThresholds: [90] }, NOW);
    expect('overallMonthlyAmount' in record).toBe(false);
    expect(record.alertsEnabled).toBe(false);
    expect(record.alertThresholds).toEqual([90]);
  });
});

describe('resolveMonthCeilings', () => {
  const rec = (month: string, ceiling?: number): BudgetHistoryRecord => ({ userId: 'u1', month, overallMonthlyAmount: ceiling, items: [], alertsEnabled: true, alertThresholds: [], capturedAt: NOW });
  const keys = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

  it('gives each closed month its own recorded ceiling, the running month today\'s', () => {
    const out = resolveMonthCeilings([rec('2026-06', 3500), rec('2026-07', 3500)], keys, '2026-08', 4000);
    expect(out.get('2026-06')).toEqual({ ceiling: 3500, source: 'recorded' });
    expect(out.get('2026-07')).toEqual({ ceiling: 3500, source: 'recorded' });
    expect(out.get('2026-08')).toEqual({ ceiling: 4000, source: 'current' });
  });

  it('falls back to today\'s ceiling for a closed month before the records began, and says so', () => {
    const out = resolveMonthCeilings([rec('2026-07', 3500)], keys, '2026-08', 4000);
    expect(out.get('2026-03')).toEqual({ ceiling: 4000, source: 'current' });
    expect(out.get('2026-07')).toEqual({ ceiling: 3500, source: 'recorded' });
  });

  it('a recorded month WITHOUT a ceiling has none — it is not compared', () => {
    const out = resolveMonthCeilings([rec('2026-07')], keys, '2026-08', 4000);
    expect(out.get('2026-07')).toEqual({ ceiling: null, source: 'recorded' });
  });

  it('without a ceiling today, the unrecorded months have none either', () => {
    const out = resolveMonthCeilings([rec('2026-07', 3500)], keys, '2026-08', null);
    expect(out.get('2026-08')).toEqual({ ceiling: null, source: 'current' });
    expect(out.get('2026-06')).toEqual({ ceiling: null, source: 'current' });
    expect(out.get('2026-07')).toEqual({ ceiling: 3500, source: 'recorded' });
  });
});
