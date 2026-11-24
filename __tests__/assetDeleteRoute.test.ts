/**
 * Tests for DELETE /api/assets/[assetId] (2026-11-23): an asset with an operation of the owner's
 * in the Registro is refused with 409 and nothing is deleted; one with no row, or whose only row is the
 * migration's opening position, is deleted (the opening row with it).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
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
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { store, adminDb, verifyIdToken: vi.fn() };
});

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({
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

  it('refuses an asset with a trade of the owner: 409, the count, nothing deleted (S1)', async () => {
    store.set('assets/asset-1', { userId: OWNER, name: 'Ornitorinco', type: 'etf' });
    store.set('assetTransactions/t1', { userId: OWNER, assetId: 'asset-1', type: 'buy' });
    store.set('dividends/d1', { assetId: 'asset-1', exDate: new Date('2999-01-01') });
    const before = new Map(store);

    const response = await del('asset-1');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'has-ledger-operations', operations: 1 });
    expect(new Map(store)).toEqual(before);
  });

  it('counts the trades but never the opening position (S1)', async () => {
    store.set('assets/asset-1', { userId: OWNER, type: 'etf' });
    store.set('assetTransactions/baseline-asset-1', { userId: OWNER, assetId: 'asset-1', type: 'buy', isBaseline: true });
    store.set('assetTransactions/t1', { userId: OWNER, assetId: 'asset-1', type: 'buy' });

    const response = await del('asset-1');

    expect(response.status).toBe(409);
    expect((await response.json()).operations).toBe(1);
    expect(store.has('assets/asset-1')).toBe(true);
    expect(store.has('assetTransactions/baseline-asset-1')).toBe(true);
  });

  it('deletes an asset with no row in the ledger, with its future dividends (S2)', async () => {
    store.set('assets/asset-1', { userId: OWNER, name: 'Fenicottero', type: 'etf' });
    store.set('dividends/future', { assetId: 'asset-1', exDate: new Date('2999-01-01') });
    store.set('dividends/other', { assetId: 'asset-2', exDate: new Date('2999-01-01') });
    store.set('assetTransactions/other-trade', { userId: OWNER, assetId: 'asset-2', type: 'buy' });

    const response = await del('asset-1');

    expect(response.status).toBe(200);
    expect(store.has('assets/asset-1')).toBe(false);
    expect(store.has('dividends/future')).toBe(false);
    expect(store.has('dividends/other')).toBe(true);
    expect(store.has('assetTransactions/other-trade')).toBe(true);
  });

  it('deletes an asset whose only row is the opening position, with that row (S3)', async () => {
    store.set('assets/asset-1', { userId: OWNER, name: 'Ornitorinco', type: 'etf' });
    store.set('assetTransactions/baseline-asset-1', { userId: OWNER, assetId: 'asset-1', type: 'buy', isBaseline: true });

    const response = await del('asset-1');

    expect(response.status).toBe(200);
    expect(store.has('assets/asset-1')).toBe(false);
    expect(store.has('assetTransactions/baseline-asset-1')).toBe(false);
  });
});
