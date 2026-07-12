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
  buildCommentContext,
} from '@/lib/server/weeklyBudgetEmailService';

function expenseDoc(
  amount: number,
  date: Date,
  categoryId = 'c1',
  type = 'fixed',
  notes?: string,
  subCategoryName?: string
) {
  return { data: () => ({ type, categoryId, amount, notes, subCategoryName, date: { toDate: () => date } }) };
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

  it('attaches the contributing expenses to a category budget that exceeded its limit', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'cf', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c1', categoryName: 'Cibo fuori', amount: 70, order: 0 }],
      }),
    };
    mockExpenseDocs = [
      expenseDoc(-100, new Date(2026, 5, 10), 'c1', 'variable', 'Cena con amici', 'Ristoranti'),
      expenseDoc(-63, new Date(2026, 5, 12), 'c1', 'variable', undefined, 'Fast food'),
    ];

    const data = await buildWeeklyBudgetData('u1', now);
    const row = data!.rows[0];
    expect(row.ratio).toBeGreaterThan(1); // 163 / 70
    expect(row.overspendExpenses).toHaveLength(2);
    // Sorted by absolute amount descending; note used as description, label as fallback.
    expect(row.overspendExpenses![0]).toMatchObject({ description: 'Cena con amici', subCategory: 'Ristoranti', amount: 100 });
    expect(row.overspendExpenses![1]).toMatchObject({ description: 'Cibo fuori', subCategory: 'Fast food', amount: 63 });

    const html = buildWeeklyBudgetEmailHtml(data!);
    expect(html).toContain('Cena con amici');
    expect(html).toContain('Ristoranti');
  });

  it('omits the subcategory for a subcategory-scoped budget (avoids repeating the budget title)', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 's', kind: 'expense', scope: 'subcategory', period: 'monthly', categoryId: 'c1', categoryName: 'Cibo', subCategoryId: 's1', subCategoryName: 'Ristoranti', amount: 50, order: 0 }],
      }),
    };
    mockExpenseDocs = [
      { data: () => ({ type: 'variable', categoryId: 'c1', subCategoryId: 's1', subCategoryName: 'Ristoranti', amount: -80, notes: 'Cena', date: { toDate: () => new Date(2026, 5, 10) } }) },
    ];

    const data = await buildWeeklyBudgetData('u1', now);
    expect(data!.rows[0].overspendExpenses![0]).toMatchObject({ description: 'Cena', amount: 80 });
    expect(data!.rows[0].overspendExpenses![0].subCategory).toBeUndefined();
  });

  it('does not attach expenses to a row that is over by projection only (ratio ≤ 1)', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [{ id: 'g', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c1', categoryName: 'Spesa', amount: 400, order: 0 }],
      }),
    };
    mockExpenseDocs = [expenseDoc(-360, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    expect(data!.rows[0].status).toBe('over'); // projection overrun
    expect(data!.rows[0].ratio).toBeLessThanOrEqual(1);
    expect(data!.rows[0].overspendExpenses).toBeUndefined();
  });

  it('never attaches a breakdown to the overall budget', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({ items: [], overallMonthlyAmount: 100 }),
    };
    mockExpenseDocs = [expenseDoc(-500, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    expect(data!.overall!.ratio).toBeGreaterThan(1);
    expect(data!.overall!.overspendExpenses).toBeUndefined();
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

  it('states in the email that the amounts are month-to-date, not weekly', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({ items: [], overallMonthlyAmount: 2200 }),
    };
    mockExpenseDocs = [expenseDoc(-1800, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    const html = buildWeeklyBudgetEmailHtml(data!);
    expect(html).toContain('dal 1° del mese a oggi');
    expect(html).toContain('non sono settimanali');
    // A bare "proiezione €X" was read as a year-end figure — the horizon must be spelled out.
    expect(html).toContain('proiezione a fine mese');
  });
});

describe('buildCommentContext', () => {
  const now = new Date(2026, 5, 15, 12); // June 15 2026 (30-day month)

  it('declares the monthly horizon of the overall budget and its end-of-month projection', async () => {
    // Reproduces the production error: the model called the overall projection a
    // year-end figure because the prompt never said the ceiling was monthly.
    mockBudgetDoc = {
      exists: true,
      data: () => ({ items: [], overallMonthlyAmount: 2200 }),
    };
    mockExpenseDocs = [expenseDoc(-1800, new Date(2026, 5, 10))];

    const data = await buildWeeklyBudgetData('u1', now);
    const context = buildCommentContext(data!);

    expect(context).toContain('tetto MENSILE');
    expect(context).toContain('proiezione A FINE MESE');
    expect(context).toContain('dal 1° giugno a oggi');
    expect(context).toContain('giorno 15 di 30');
  });

  it('scopes annual budgets to the year and monthly budgets to the month', async () => {
    mockBudgetDoc = {
      exists: true,
      data: () => ({
        items: [
          { id: 'a', kind: 'expense', scope: 'category', period: 'annual', categoryId: 'c1', categoryName: 'Vacanze', amount: 2000, order: 0 },
          { id: 'b', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'c2', categoryName: 'Tecnologia', amount: 200, order: 1 },
        ],
      }),
    };
    mockExpenseDocs = [
      expenseDoc(-500, new Date(2026, 2, 10), 'c1'),
      expenseDoc(-150, new Date(2026, 5, 10), 'c2'),
    ];

    const data = await buildWeeklyBudgetData('u1', now);
    const context = buildCommentContext(data!);

    expect(context).toContain('Vacanze (budget di spesa ANNUALE): 500€ da inizio anno a oggi');
    expect(context).toContain('Tecnologia (budget di spesa MENSILE): 150€ dal 1° giugno a oggi');
  });
});
