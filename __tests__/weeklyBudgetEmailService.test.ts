/**
 * Tests for the weekly budget email service — Sunday detection, data builder and
 * HTML render. The Admin SDK, Resend and firebase-admin Timestamp are mocked;
 * the budget maths is the real pure layer (budgetUtils).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock state, filled per test (mock-prefixed so it can be referenced in factories).
let mockBudgetDoc: { exists: boolean; data?: () => unknown } = { exists: false };
let mockExpenseDocs: Array<{ data: () => unknown }> = [];

vi.mock('firebase-admin/firestore', () => ({ Timestamp: { fromDate: (d: Date) => d } }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: async () => ({ error: null }) };
  },
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => {
      const chain: Record<string, unknown> = {
        doc: () => ({ get: () => Promise.resolve(mockBudgetDoc) }),
        where: () => chain,
        get: () => Promise.resolve({ docs: mockExpenseDocs }),
      };
      return chain;
    },
  },
}));

import {
  isWeeklyBudgetDayItaly,
  buildWeeklyBudgetData,
  buildWeeklyBudgetEmailHtml,
} from '@/lib/server/weeklyBudgetEmailService';

function expenseDoc(amount: number, date: Date, categoryId = 'c1', type = 'fixed') {
  return { data: () => ({ type, categoryId, amount, date: { toDate: () => date } }) };
}

describe('isWeeklyBudgetDayItaly', () => {
  it('is true on a Sunday and false otherwise', () => {
    expect(isWeeklyBudgetDayItaly(new Date(2026, 2, 1, 12))).toBe(true); // 2026-03-01 is a Sunday
    expect(isWeeklyBudgetDayItaly(new Date(2026, 2, 2, 12))).toBe(false); // Monday
  });
});

describe('buildWeeklyBudgetData', () => {
  const now = new Date(2026, 5, 15, 12); // June 15 2026 (30-day month)

  beforeEach(() => {
    mockBudgetDoc = { exists: false };
    mockExpenseDocs = [];
  });

  it('returns null when the user has no budget document', async () => {
    expect(await buildWeeklyBudgetData('u1', now)).toBeNull();
  });

  it('builds rows, the overall row and at-risk counts from the pure layer', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'g', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c1', categoryName: 'Spesa', amount: 400, order: 0 }],
        overallMonthlyAmount: 1000,
      }),
    };
    mockExpenseDocs = [expenseDoc(-360, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    expect(data).not.toBeNull();
    expect(data!.rows).toHaveLength(1);
    expect(data!.rows[0].label).toBe('Spesa');
    expect(data!.rows[0].spent).toBeCloseTo(360);
    // 360/400 = 0.9, and the projection (360/15×30 = 720) exceeds 400 → over
    expect(data!.rows[0].status).toBe('over');
    expect(data!.atRiskCount).toBe(1);
    expect(data!.overall).not.toBeNull();
    expect(data!.overall!.spent).toBeCloseTo(360);
    expect(data!.yearElapsedPct).toBeGreaterThan(0);
  });

  it('renders an HTML email containing the budget label and header', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'a', kind: 'expense', scope: 'category', period: 'annual', categoryId: 'c1', categoryName: 'Vacanze', amount: 2000, order: 0 }],
      }),
    };
    mockExpenseDocs = [expenseDoc(-500, new Date(2026, 4, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    const html = buildWeeklyBudgetEmailHtml(data!);
    expect(html).toContain('Riepilogo settimanale budget');
    expect(html).toContain('Vacanze');
    expect(html).toContain('Budget annuali');
  });
});
