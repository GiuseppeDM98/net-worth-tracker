/**
 * `getFeeOf` asks for a row's fee by QUERY, never by `getDoc` on the pointer (2026-11-26).
 *
 * The rule on `expenses` reads `resource.data.userId`; of a document that is gone there is no
 * `resource`, so a `get` of it is `permission-denied`, not «not found». A row can point at a fee
 * that is gone — deleted by hand, or by a save the list on screen has not read yet (the list a
 * reload restores from the persisted cache) — and the edit form then called its fee «unread» and
 * kept «Commissione» disabled at every reopening. A query that matches nothing is an empty answer.
 *
 * Firestore is mocked at the module boundary (as `__tests__/expenseServiceParents.test.ts`); the
 * rule itself is exercised in the browser by `e2e/cashflow.transfer-fee.spec.ts` («a transfer still
 * pointing at a fee that is gone…»). Seen red with the lookup back on `getDoc(doc(…pointer))`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDocs = vi.fn();
const getDoc = vi.fn();

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collectionName: name }),
  doc: (_ref: unknown, name?: string, id?: string) => ({ collectionName: name, id }),
  writeBatch: vi.fn(),
  getDocs: (...args: unknown[]) => getDocs(...args),
  getDoc: (...args: unknown[]) => getDoc(...args),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ orderBy: field }),
  limit: (n: number) => ({ limit: n }),
  deleteField: () => '__deleteField__',
  Timestamp: { now: () => new Date(2026, 10, 26, 12), fromDate: (date: Date) => date },
}));

import { getFeeOf } from '@/lib/services/expenseService';

const NOON = new Date(2026, 10, 26, 12);
const stamp = { toDate: () => NOON };

function feeDoc(id: string, amount: number) {
  return { id, data: () => ({ userId: 'owner-airone', amount, feeOfTransferId: 'giro-1', date: stamp, createdAt: stamp, updatedAt: stamp }) };
}

const PARENT = { id: 'giro-1', userId: 'owner-airone', transferFeeExpenseId: 'fee-old' };

beforeEach(() => {
  getDocs.mockReset();
  getDoc.mockReset();
});

describe('getFeeOf', () => {
  it('reads nothing for a row that points at no fee', async () => {
    expect(await getFeeOf({ id: 'giro-1', userId: 'owner-airone' })).toBeNull();
    expect(getDocs).not.toHaveBeenCalled();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('asks by the fee’s back-pointer and the owner — a query, never a get of the pointed document', async () => {
    getDocs.mockResolvedValue({ docs: [feeDoc('fee-old', -2)] });
    const fee = await getFeeOf(PARENT);
    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(getDocs.mock.calls[0][0]).toEqual({
      ref: { collectionName: 'expenses' },
      constraints: [
        { field: 'userId', op: '==', value: 'owner-airone' },
        { field: 'feeOfTransferId', op: '==', value: 'giro-1' },
      ],
    });
    expect(fee).toMatchObject({ id: 'fee-old', amount: -2, date: NOON });
  });

  it('a pointer to a fee that is gone is «no fee», not a failed read', async () => {
    getDocs.mockResolvedValue({ docs: [] });
    await expect(getFeeOf(PARENT)).resolves.toBeNull();
  });

  it('a stale pointer still finds the fee the row has now; among several, the pointed one', async () => {
    getDocs.mockResolvedValue({ docs: [feeDoc('fee-new', -3)] });
    expect(await getFeeOf(PARENT)).toMatchObject({ id: 'fee-new', amount: -3 });

    getDocs.mockResolvedValue({ docs: [feeDoc('fee-new', -3), feeDoc('fee-old', -2)] });
    expect(await getFeeOf(PARENT)).toMatchObject({ id: 'fee-old', amount: -2 });
  });
});
