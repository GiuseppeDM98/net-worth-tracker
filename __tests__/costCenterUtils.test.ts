import { describe, it, expect } from 'vitest';
import { Expense } from '@/types/expenses';
import {
  buildCategoryComposition,
  buildSubCategoryComposition,
  splitRecurringVsOneOff,
  getLifecycleStatus,
  resolveLastActivityDate,
  DORMANT_THRESHOLD_DAYS,
} from '@/lib/utils/costCenterUtils';

// --- Fixtures ---------------------------------------------------------------

// Minimal expense factory. Expenses are stored negative (outgoing); the pure layer
// flips them to positive costs. `date` is a local Date; tests pin `now` explicitly.
function expense(partial: Partial<Expense> & { date: Date; amount: number }): Expense {
  return {
    id: Math.random().toString(36).slice(2),
    userId: 'u1',
    type: 'variable',
    categoryId: 'c1',
    categoryName: 'Carburante',
    currency: 'EUR',
    createdAt: partial.date,
    updatedAt: partial.date,
    ...partial,
  };
}

// 2025-06-15 in Italy (summer = UTC+2). Use a fixed reference for determinism.
const NOW = new Date('2025-06-15T10:00:00+02:00');

describe('buildCategoryComposition', () => {
  it('collapses categories past the cap into Altro and sorts by amount', () => {
    // Distinct ids: grouping is by category id, and distinct categories always
    // have distinct documents in real data.
    const expenses = [
      expense({ date: NOW, amount: -100, categoryId: 'c-carb', categoryName: 'Carburante' }),
      expense({ date: NOW, amount: -50, categoryId: 'c-assi', categoryName: 'Assicurazione' }),
      expense({ date: NOW, amount: -30, categoryId: 'c-manu', categoryName: 'Manutenzione' }),
      expense({ date: NOW, amount: -20, categoryId: 'c-boll', categoryName: 'Bollo' }),
      expense({ date: NOW, amount: -10, categoryId: 'c-peda', categoryName: 'Pedaggi' }),
      expense({ date: NOW, amount: -5, categoryId: 'c-mult', categoryName: 'Multe' }), // 6th → Altro
    ];
    const comp = buildCategoryComposition(expenses);
    expect(comp[0].categoryName).toBe('Carburante');
    expect(comp[comp.length - 1].categoryName).toBe('Altro');
    expect(comp[comp.length - 1].total).toBe(5);
    const totalPct = comp.reduce((s, c) => s + c.pct, 0);
    expect(totalPct).toBeCloseTo(1);
  });
  it('keeps two same-named categories apart, qualifying their labels', () => {
    // "Casa" exists twice (fixed and variable): two slices, never one merged bucket.
    const expenses = [
      expense({ date: NOW, amount: -300, categoryId: 'c-fix', categoryName: 'Casa', type: 'fixed' }),
      expense({ date: NOW, amount: -100, categoryId: 'c-var', categoryName: 'Casa', type: 'variable' }),
    ];
    const comp = buildCategoryComposition(expenses);
    expect(comp).toHaveLength(2);
    expect(comp[0]).toMatchObject({ key: 'c-fix', categoryName: 'Casa (Spese Fisse)', total: 300 });
    expect(comp[1]).toMatchObject({ key: 'c-var', categoryName: 'Casa (Spese Variabili)', total: 100 });
  });
});

describe('buildSubCategoryComposition', () => {
  it('aggregates by subcategory id and sorts by amount descending', () => {
    const expenses = [
      expense({ date: NOW, amount: -50, subCategoryId: 's1', subCategoryName: 'Benzina' }),
      expense({ date: NOW, amount: -130, subCategoryId: 's1', subCategoryName: 'Benzina' }),
      expense({ date: NOW, amount: -120, subCategoryId: 's2', subCategoryName: 'Manutenzione' }),
    ];
    const comp = buildSubCategoryComposition(expenses);
    expect(comp).toHaveLength(2);
    expect(comp[0]).toMatchObject({ key: 's1', subCategoryName: 'Benzina', total: 180, transactionCount: 2 });
    expect(comp[1]).toMatchObject({ key: 's2', subCategoryName: 'Manutenzione', total: 120 });
  });

  it('keys by id so same-named subcategories under different categories stay distinct', () => {
    const expenses = [
      expense({ date: NOW, amount: -40, categoryName: 'Auto', subCategoryId: 's1', subCategoryName: 'Varie' }),
      expense({ date: NOW, amount: -60, categoryName: 'Casa', subCategoryId: 's2', subCategoryName: 'Varie' }),
    ];
    const comp = buildSubCategoryComposition(expenses);
    expect(comp).toHaveLength(2);
    expect(comp.map((s) => s.categoryName).sort()).toEqual(['Auto', 'Casa']);
  });

  it('collapses expenses without a subcategory into a single "Senza sottocategoria" slice', () => {
    const expenses = [
      expense({ date: NOW, amount: -30, subCategoryName: undefined }),
      expense({ date: NOW, amount: -20, subCategoryName: undefined }),
    ];
    const comp = buildSubCategoryComposition(expenses);
    expect(comp).toHaveLength(1);
    expect(comp[0]).toMatchObject({ subCategoryName: 'Senza sottocategoria', total: 50, transactionCount: 2 });
  });

  it('returns an empty array for no expenses', () => {
    expect(buildSubCategoryComposition([])).toEqual([]);
  });
});

describe('splitRecurringVsOneOff', () => {
  it('treats recurring and installment as fixed cost', () => {
    const expenses = [
      expense({ date: NOW, amount: -100, isRecurring: true }),
      expense({ date: NOW, amount: -200, isInstallment: true }),
      expense({ date: NOW, amount: -300 }),
    ];
    const split = splitRecurringVsOneOff(expenses);
    expect(split.recurring).toBe(300);
    expect(split.oneOff).toBe(300);
    expect(split.recurringPct).toBeCloseTo(0.5);
  });
});

describe('getLifecycleStatus', () => {
  it('reports archived when archivedAt is set', () => {
    expect(getLifecycleStatus({ archivedAt: NOW }, NOW, NOW)).toBe('archived');
  });

  it('reports dormant with no activity or stale activity', () => {
    expect(getLifecycleStatus({}, null, NOW)).toBe('dormant');
    const stale = new Date(NOW.getTime() - (DORMANT_THRESHOLD_DAYS + 5) * 86_400_000);
    expect(getLifecycleStatus({}, stale, NOW)).toBe('dormant');
  });

  it('reports active for recent activity', () => {
    const recent = new Date(NOW.getTime() - 5 * 86_400_000);
    expect(getLifecycleStatus({}, recent, NOW)).toBe('active');
  });
});

describe('resolveLastActivityDate', () => {
  it('returns null with no expenses', () => {
    expect(resolveLastActivityDate([])).toBeNull();
  });

  it('returns the most recent date regardless of input order', () => {
    const expenses = [
      expense({ date: new Date('2025-01-20T12:00:00+01:00'), amount: -200 }),
      expense({ date: new Date('2025-06-05T12:00:00+02:00'), amount: -300 }),
      expense({ date: new Date('2024-03-10T12:00:00+01:00'), amount: -100 }),
    ];
    expect(resolveLastActivityDate(expenses)?.toISOString()).toBe(
      new Date('2025-06-05T12:00:00+02:00').toISOString(),
    );
  });

  it('keeps a center active on its whole history, not on the running month', () => {
    // The regression this function exists for: the center last spent 35 days ago — well
    // inside the dormancy threshold — but nothing landed in the current calendar month. A
    // month-scoped last date is null, and null maps to 'dormant'.
    const lastSpend = new Date(NOW.getTime() - 35 * 86_400_000);
    const expenses = [expense({ date: lastSpend, amount: -120 })];

    expect(getLifecycleStatus({}, null, NOW)).toBe('dormant');
    expect(getLifecycleStatus({}, resolveLastActivityDate(expenses), NOW)).toBe('active');
  });
});
