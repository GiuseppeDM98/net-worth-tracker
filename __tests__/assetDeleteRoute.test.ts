/**
 * Tests for DELETE /api/assets/[assetId] — the asset leaves, its trades' fee rows stay as plain
 * spending (2026-11-12): each row a trade names loses `feeOfTradeId` in the same batch, so Cashflow
 * no longer locks it and the owner can delete it there.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const DELETE_FIELD = { __delete: true };
  const docRef = (collection: string, id: string) => ({
    id,
    path: `${collection}/${id}`,
    get: async () => {
      const value = store.get(`${collection}/${id}`);
      return { id, exists: value !== undefined, ref: docRef(collection, id), data: () => value };
    },
  });
  const query = (collection: string, filters: { field: string; op: string; value: unknown }[]) => ({
    where: (field: string, op: string, value: unknown) => query(collection, [...filters, { field, op, value }]),
    get: async () => {
      const docs = [...store.entries()]
        .filter(([k]) => k.startsWith(`${collection}/`))
        .filter(([, v]) => filters.every((f) => (f.op === '==' ? v[f.field] === f.value : true)))
        .map(([k, v]) => {
          const id = k.slice(collection.length + 1);
          return { id, ref: docRef(collection, id), data: () => v };
        });
      return { docs, size: docs.length };
    },
  });
  const adminDb = {
    collection: (collection: string) => ({
      doc: (id: string) => docRef(collection, id),
      where: (field: string, op: string, value: unknown) => query(collection, [{ field, op, value }]),
    }),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        delete: (ref: { path: string }) => ops.push(() => store.delete(ref.path)),
        update: (ref: { path: string }, data: Record<string, unknown>) =>
          ops.push(() => {
            const next = { ...store.get(ref.path)! };
            for (const [k, v] of Object.entries(data)) {
              if (v === DELETE_FIELD) delete next[k];
              else next[k] = v;
            }
            store.set(ref.path, next);
          }),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { store, adminDb, DELETE_FIELD, verifyIdToken: vi.fn() };
});

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => mocks.DELETE_FIELD },
  Timestamp: { fromDate: (d: Date) => d },
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: mocks.verifyIdToken },
  adminDb: mocks.adminDb,
}));
vi.mock('@/lib/services/dashboardOverviewInvalidation.server', () => ({
  invalidateDashboardOverviewSummaryServer: vi.fn(async () => undefined),
}));

import { DELETE } from '@/app/api/assets/[assetId]/route';

const OWNER = 'owner-1';
const { store } = mocks;

function del(assetId: string) {
  return DELETE(
    new NextRequest(`http://localhost/api/assets/${assetId}`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: OWNER }),
    }),
    { params: Promise.resolve({ assetId }) }
  );
}

describe('DELETE /api/assets/[assetId]', () => {
  beforeEach(() => {
    store.clear();
    mocks.verifyIdToken.mockResolvedValue({ uid: OWNER });
  });

  it('deletes the asset and keeps its trades’ fee rows as plain spending', async () => {
    store.set('assets/asset-1', { userId: OWNER, name: 'Ornitorinco', type: 'etf' });
    store.set('assetTransactions/t1', { userId: OWNER, assetId: 'asset-1', type: 'buy', fees: 5, feeExpenseId: 'fee-1' });
    store.set('assetTransactions/t2', { userId: OWNER, assetId: 'asset-1', type: 'buy' });
    store.set('expenses/fee-1', { userId: OWNER, amount: -5, feeOfTradeId: 't1' });
    store.set('expenses/other', { userId: OWNER, amount: -20 });

    const response = await del('asset-1');

    expect(response.status).toBe(200);
    expect(store.has('assets/asset-1')).toBe(false);
    const row = store.get('expenses/fee-1')!;
    expect(row.amount).toBe(-5);
    expect('feeOfTradeId' in row).toBe(false);
    expect(store.get('expenses/other')).toEqual({ userId: OWNER, amount: -20 });
  });

  it('skips a named fee row that no longer exists', async () => {
    store.set('assets/asset-1', { userId: OWNER, type: 'etf' });
    store.set('assetTransactions/t1', { userId: OWNER, assetId: 'asset-1', type: 'buy', fees: 5, feeExpenseId: 'gone' });

    const response = await del('asset-1');

    expect(response.status).toBe(200);
    expect(store.has('expenses/gone')).toBe(false);
  });
});
