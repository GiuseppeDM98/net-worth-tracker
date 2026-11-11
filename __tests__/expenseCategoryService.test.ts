/**
 * updateCategory and the 50/30/20 role (lib/services/expenseCategoryService.ts).
 *
 * «Da classificare» is the absence of `spendingRole`, and the write path strips undefined fields —
 * so without an explicit deleteField a user who clears a role sees «salvata» and gets the old role
 * back on the next load. The opposite mistake is as bad: a dialog that never showed the role (the
 * setting is off) must leave a stored role untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/expenseService', () => ({
  updateExpensesCategoryName: vi.fn(),
  updateExpensesType: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  deleteField: vi.fn(() => DELETE_SENTINEL),
}));

const DELETE_SENTINEL = { __deleteField: true };

import { updateDoc } from 'firebase/firestore';
import { updateCategory } from '@/lib/services/expenseCategoryService';

function writtenPayload(): Record<string, unknown> {
  const calls = vi.mocked(updateDoc).mock.calls;
  return calls[calls.length - 1][1] as unknown as Record<string, unknown>;
}

describe('updateCategory — spendingRole', () => {
  beforeEach(() => vi.mocked(updateDoc).mockClear());

  it('writes a role that is set', async () => {
    await updateCategory('cat-1', { spendingRole: 'need' });
    expect(writtenPayload().spendingRole).toBe('need');
  });

  it('deletes the stored role when the key is present without a value', async () => {
    await updateCategory('cat-1', { color: '#3b82f6', spendingRole: undefined });
    expect(writtenPayload().spendingRole).toBe(DELETE_SENTINEL);
  });

  it('leaves the stored role alone when the key is absent', async () => {
    await updateCategory('cat-1', { color: '#3b82f6' });
    expect('spendingRole' in writtenPayload()).toBe(false);
  });

  it('drops a cleared subcategory override inside the rewritten array', async () => {
    await updateCategory('cat-1', {
      subCategories: [{ id: 's1', name: 'WiFi', spendingRole: undefined }],
    });
    const [sub] = writtenPayload().subCategories as Record<string, unknown>[];
    expect('spendingRole' in sub).toBe(false);
  });
});

import { newSubCategoryId } from '@/lib/services/expenseCategoryService';

describe('newSubCategoryId (2026-11: one rule for the dialog, the import and the Assistente)', () => {
  it('is the time, a dash and up to nine base-36 characters, and unique call to call', () => {
    const ids = Array.from({ length: 50 }, () => newSubCategoryId());
    for (const id of ids) expect(id).toMatch(/^\d+-[a-z0-9]{1,9}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
