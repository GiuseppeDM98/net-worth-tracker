/**
 * The bulk rewrites of expense rows that a category edit cascades into invalidate the Panoramica's
 * materialized summary AFTER their batch commits (2026-10-03). Since the summary stays fresh
 * for the whole Italian day, a rename, a type change, a reassign or a move that did not invalidate
 * left the Panoramica printing the old category names and the old month totals for hours.
 * `reassignExpensesSubCategory` is the one that does not: the payload never reads the subcategory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { calls, getDocsMock } = vi.hoisted(() => ({
  calls: [] as string[],
  getDocsMock: vi.fn(),
}));

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(async (ownerId: string, reason: string) => {
    calls.push(`invalidate:${ownerId}:${reason}`);
  }),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collectionName: name }),
  doc: (_db: unknown, name: string, id: string) => ({ collectionName: name, id }),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string, direction?: string) => ({ orderBy: field, direction }),
  writeBatch: () => ({
    update: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => { calls.push('commit'); }),
  }),
  runTransaction: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  deleteField: () => '__deleteField__',
  Timestamp: { now: () => new Date('2026-10-03T09:00:00Z'), fromDate: (date: Date) => date },
}));

import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import {
  clearExpensesCategoryAssignment,
  moveExpensesFromSubCategory,
  moveExpensesToCategory,
  reassignExpensesCategory,
  reassignExpensesSubCategory,
  updateExpensesCategoryName,
  updateExpensesType,
} from '@/lib/services/expenseService';

const oneRow = { empty: false, docs: [{ ref: { id: 'row-1' }, data: () => ({ amount: -40 }) }] };

describe('category rewrites of expense rows → the overview summary', () => {
  beforeEach(() => {
    calls.length = 0;
    vi.mocked(invalidateDashboardOverviewSummary).mockClear();
    getDocsMock.mockResolvedValue(oneRow);
  });

  it.each([
    ['a rename', () => updateExpensesCategoryName('cat-1', 'Casa e bollette', 'owner'), 'expense_category_renamed'],
    ['a type change', () => updateExpensesType('cat-1', 'variable', 'fixed', 'owner'), 'expense_category_type_changed'],
    ['a reassign on delete', () => reassignExpensesCategory('cat-1', 'cat-2', 'Svago', 'owner'), 'expense_category_reassigned'],
    ['a clear on delete', () => clearExpensesCategoryAssignment('cat-1', 'owner'), 'expense_category_cleared'],
    ['a move of a category', () => moveExpensesToCategory('cat-1', 'variable', 'cat-2', 'Svago', 'income', 'owner'), 'expense_category_moved'],
    ['a move of a subcategory', () => moveExpensesFromSubCategory('cat-1', 'sub-1', 'variable', 'cat-2', 'Svago', 'fixed', 'owner'), 'expense_category_moved'],
  ])('invalidates the owner\'s summary after %s commits', async (_case, run, reason) => {
    await run();

    expect(calls).toEqual(['commit', `invalidate:owner:${reason}`]);
  });

  it('does not invalidate when there is no row to rewrite', async () => {
    getDocsMock.mockResolvedValue({ empty: true, docs: [] });

    await updateExpensesCategoryName('cat-1', 'Casa e bollette', 'owner');

    expect(invalidateDashboardOverviewSummary).not.toHaveBeenCalled();
  });

  it('does not invalidate a subcategory reassign, which the overview never reads', async () => {
    await reassignExpensesSubCategory('cat-1', 'sub-1', 'owner', 'sub-2', 'Bollette');

    expect(calls).toEqual(['commit']);
  });
});
