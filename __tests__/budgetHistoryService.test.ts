/**
 * Tests for lib/server/budgetHistoryService.ts — the cron's daily capture of every budget
 * configuration into budgetHistory/{userId}/months/{YYYY-MM}. The Admin SDK is mocked at the
 * collection chain; what is asserted is WHERE and WHAT gets written.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

let mockBudgetDocs: Array<{ id: string; data: () => Record<string, unknown> }> = [];
const writes: Array<{ path: string; data: Record<string, unknown>; options: unknown }> = [];

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      get: () => Promise.resolve({ docs: name === 'budgets' ? mockBudgetDocs : [] }),
      doc: (userId: string) => ({
        collection: (sub: string) => ({
          doc: (month: string) => ({
            set: (data: Record<string, unknown>, options: unknown) => {
              if (userId === 'u-broken') return Promise.reject(new Error('boom'));
              writes.push({ path: `${name}/${userId}/${sub}/${month}`, data, options });
              return Promise.resolve();
            },
          }),
        }),
      }),
    }),
  },
}));

import { captureBudgetHistory } from '@/lib/server/budgetHistoryService';

const NOW = new Date(2026, 7, 23, 12);

describe('captureBudgetHistory', () => {
  beforeEach(() => {
    mockBudgetDocs = [];
    writes.length = 0;
  });

  it('writes one merged record per user under the month key, items normalised', async () => {
    mockBudgetDocs = [
      {
        id: 'u1',
        data: () => ({
          items: [{ id: 'g', scope: 'category', categoryId: 'c1', categoryName: 'Spesa', monthlyAmount: 400, order: 0 }],
          overallMonthlyAmount: 4000,
          alertThresholds: [90, 100],
        }),
      },
    ];
    const result = await captureBudgetHistory(NOW);
    expect(result).toEqual({ captured: 1, skipped: 0, errors: 0 });
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe('budgetHistory/u1/months/2026-08');
    expect(writes[0].options).toEqual({ merge: true });
    expect(writes[0].data).toMatchObject({ userId: 'u1', month: '2026-08', overallMonthlyAmount: 4000, alertsEnabled: true, alertThresholds: [90, 100], capturedAt: NOW });
    expect(writes[0].data.items).toEqual([{ id: 'g', scope: 'category', categoryId: 'c1', categoryName: 'Spesa', monthlyAmount: 400, order: 0, kind: 'expense', period: 'monthly', amount: 400 }]);
  });

  it('skips the demo account and counts a failed write without stopping the others', async () => {
    mockBudgetDocs = [
      { id: 'demo', data: () => ({ items: [] }) },
      { id: 'u-broken', data: () => ({ items: [] }) },
      { id: 'u2', data: () => ({ items: [] }) },
    ];
    const result = await captureBudgetHistory(NOW, 'demo');
    expect(result).toEqual({ captured: 1, skipped: 1, errors: 1 });
    expect(writes.map((w) => w.path)).toEqual(['budgetHistory/u2/months/2026-08']);
    expect('overallMonthlyAmount' in writes[0].data).toBe(false);
  });
});
