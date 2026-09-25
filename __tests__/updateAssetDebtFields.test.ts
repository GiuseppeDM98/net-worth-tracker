import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `updateAsset` and a property's debt fields (2026-09-25): the residual debt and its TAN are
 * user-clearable from the asset form (the «Debito residuo» switch off, an emptied TAN), so a key
 * sent as `undefined` must become `deleteField()` — `removeUndefinedDeep` strips it otherwise and
 * the old debt came back on the next load. A partial caller that never sends the key (a price
 * refresh) must leave both alone: the linked instalments move the debt on their own.
 */

const DELETE_SENTINEL = Symbol('deleteField');
const updateDocMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, _collection: string, id: string) => ({ id }),
  collection: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ userId: 'u1', quantity: 1 }) }),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  runTransaction: vi.fn(),
  deleteField: () => DELETE_SENTINEL,
  Timestamp: { now: () => new Date(), fromDate: (d: Date) => d },
}));

import { updateAsset } from '@/lib/services/assetService';

const written = () => updateDocMock.mock.calls.at(-1)![1] as Record<string, unknown>;

beforeEach(() => updateDocMock.mockClear());

describe('updateAsset — the debt fields of a property', () => {
  it('should delete the debt and the TAN when the form clears them', async () => {
    await updateAsset('casa', { outstandingDebt: undefined, debtInterestRate: undefined });
    expect(written().outstandingDebt).toBe(DELETE_SENTINEL);
    expect(written().debtInterestRate).toBe(DELETE_SENTINEL);
  });

  it('should write them when the form sends them', async () => {
    await updateAsset('casa', { outstandingDebt: 180_000, debtInterestRate: 3.2 });
    expect(written()).toMatchObject({ outstandingDebt: 180_000, debtInterestRate: 3.2 });
  });

  it('should leave them alone for a caller that never sends them', async () => {
    await updateAsset('casa', { currentPrice: 260_000 });
    expect(written()).not.toHaveProperty('outstandingDebt');
    expect(written()).not.toHaveProperty('debtInterestRate');
  });
});
