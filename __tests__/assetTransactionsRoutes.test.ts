import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Private-API auth + semantic-error tests for the asset trade-ledger routes.
 *
 * Mirrors apiAuthRoutes/assistantRoutes: 401 without token, 403 for a non-member on another owner's
 * data, 200 for the owner AND for a delegated member, 400 on schema violations, 422 on over-sell,
 * 409 before migration, baseline PUT/DELETE protection, and migrate idempotency. The trade FX
 * resolver is mocked (network); adminDb is a small in-memory fake so the real use-case transaction
 * runs (that is how the 422 over-sell surfaces).
 */

// Hoisted so the vi.mock factories (also hoisted) can reference them before imports run.
const mocks = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  counter: { next: 0 },
  verifyIdToken: vi.fn(),
  getUserAssetsAdmin: vi.fn(),
}));
const store = mocks.store;
const verifyIdTokenMock = mocks.verifyIdToken;
const getUserAssetsAdminMock = mocks.getUserAssetsAdmin;
const docKey = (collection: string, id: string) => `${collection}/${id}`;

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

vi.mock('@/lib/server/tradeFxService', () => ({
  resolveTradePriceEur: vi.fn(async (_currency: string, pricePerUnit: number) => pricePerUnit),
  resolveBaselinePriceEur: vi.fn(
    async (asset: { averageCost?: number; currentPrice: number }) => asset.averageCost ?? asset.currentPrice
  ),
  TradeFxUnavailableError: class TradeFxUnavailableError extends Error {},
}));

vi.mock('@/lib/services/dashboardOverviewInvalidation.server', () => ({
  invalidateDashboardOverviewSummaryServer: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/server/assetAdminRepository', () => ({
  getUserAssetsAdmin: mocks.getUserAssetsAdmin,
}));

vi.mock('@/lib/firebase/admin', () => {
  const key = (collection: string, id: string) => `${collection}/${id}`;
  type Filter = { field: string; value: unknown };
  const { store, counter } = mocks;

  const makeDocRef = (collection: string, id: string) => ({
    id,
    _collection: collection,
    get: async () => {
      const data = store.get(key(collection, id));
      return { exists: data !== undefined, id, data: () => data };
    },
    set: async (data: Record<string, unknown>) => {
      store.set(key(collection, id), { ...data });
    },
  });
  const makeQuery = (collection: string, filters: Filter[]): Record<string, unknown> => ({
    _collection: collection,
    _filters: filters,
    where: (field: string, _op: string, value: unknown) =>
      makeQuery(collection, [...filters, { field, value }]),
    run: () => {
      const docs: { id: string; data: () => Record<string, unknown> }[] = [];
      for (const [k, value] of store) {
        if (!k.startsWith(`${collection}/`)) continue;
        if (filters.every((f) => value[f.field] === f.value)) {
          docs.push({ id: k.slice(collection.length + 1), data: () => value });
        }
      }
      return { docs };
    },
  });

  const adminDb = {
    collection: (name: string) => ({
      doc: (id?: string) => makeDocRef(name, id ?? `auto-${++counter.next}`),
      where: (field: string, _op: string, value: unknown) => makeQuery(name, [{ field, value }]),
    }),
    batch: () => {
      const ops: { collection: string; id: string; data: Record<string, unknown> }[] = [];
      return {
        set: (ref: { _collection: string; id: string }, data: Record<string, unknown>) =>
          ops.push({ collection: ref._collection, id: ref.id, data }),
        commit: async () => {
          for (const op of ops) store.set(key(op.collection, op.id), { ...op.data });
        },
      };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<void>) => {
      const pending: { type: 'set' | 'update' | 'delete'; collection: string; id: string; data?: Record<string, unknown> }[] = [];
      const tx = {
        get: async (refOrQuery: { _collection: string; id?: string; _filters?: Filter[]; run?: () => unknown }) => {
          if (refOrQuery._filters) return refOrQuery.run!();
          const data = store.get(key(refOrQuery._collection, refOrQuery.id as string));
          return { exists: data !== undefined, id: refOrQuery.id, data: () => data };
        },
        set: (ref: { _collection: string; id: string }, data: Record<string, unknown>) =>
          pending.push({ type: 'set', collection: ref._collection, id: ref.id, data }),
        update: (ref: { _collection: string; id: string }, data: Record<string, unknown>) =>
          pending.push({ type: 'update', collection: ref._collection, id: ref.id, data }),
        delete: (ref: { _collection: string; id: string }) =>
          pending.push({ type: 'delete', collection: ref._collection, id: ref.id }),
      };
      await fn(tx);
      for (const write of pending) {
        const k = key(write.collection, write.id);
        if (write.type === 'delete') store.delete(k);
        else if (write.type === 'set') store.set(k, { ...(write.data as Record<string, unknown>) });
        else store.set(k, { ...(store.get(k) ?? {}), ...(write.data as Record<string, unknown>) });
      }
    },
  };

  return { adminAuth: { verifyIdToken: mocks.verifyIdToken }, adminDb };
});

import { POST as createRoute } from '@/app/api/asset-transactions/route';
import { PUT as editRoute, DELETE as deleteRoute } from '@/app/api/asset-transactions/[transactionId]/route';
import { POST as migrateRoute } from '@/app/api/asset-transactions/migrate/route';

function createJsonRequest(
  url: string,
  { method = 'GET', body, headers }: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const AUTH = { Authorization: 'Bearer valid-token' };
const PAST_BASELINE = new Date(2024, 0, 1);

function seedMeta(ownerId: string) {
  store.set(docKey('assetTransactionsMeta', ownerId), { userId: ownerId, baselineDate: PAST_BASELINE });
}
function seedLedgerAsset(assetId: string, ownerId: string) {
  store.set(docKey('assets', assetId), {
    userId: ownerId,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 0,
    currentPrice: 100,
  });
}
function validTransaction(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 'asset-1',
    type: 'buy',
    date: new Date().toISOString(),
    quantity: 5,
    pricePerUnit: 100,
    ...overrides,
  };
}

describe('Asset trade-ledger routes', () => {
  beforeEach(() => {
    store.clear();
    mocks.counter.next = 0;
    verifyIdTokenMock.mockReset();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    getUserAssetsAdminMock.mockReset();
    getUserAssetsAdminMock.mockResolvedValue([]);
  });

  it('returns 401 without an Authorization header', async () => {
    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'user-1', transaction: validTransaction() },
      })
    );
    expect(response.status).toBe(401);
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-member acting on another owner’s data', async () => {
    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'owner-2', transaction: validTransaction() },
        headers: AUTH,
      })
    );
    expect(response.status).toBe(403);
  });

  it('creates a trade for the owner (200)', async () => {
    seedMeta('user-1');
    seedLedgerAsset('asset-1', 'user-1');

    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'user-1', transaction: validTransaction() },
        headers: AUTH,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      derived: { quantity: 5, averageCost: 100 },
    });
  });

  it('creates a trade for a delegated member (200)', async () => {
    store.set(docKey('account-access', 'owner-9'), { memberUids: ['user-1'] });
    seedMeta('owner-9');
    seedLedgerAsset('asset-9', 'owner-9');

    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'owner-9', transaction: validTransaction({ assetId: 'asset-9' }) },
        headers: AUTH,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ derived: { quantity: 5 } });
  });

  it('returns 400 for a negative quantity', async () => {
    seedMeta('user-1');
    seedLedgerAsset('asset-1', 'user-1');

    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'user-1', transaction: validTransaction({ quantity: -5 }) },
        headers: AUTH,
      })
    );
    expect(response.status).toBe(400);
  });

  it('returns 400 for fees on an adjustment', async () => {
    seedMeta('user-1');
    seedLedgerAsset('asset-1', 'user-1');

    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: {
          userId: 'user-1',
          transaction: validTransaction({ type: 'adjustment', quantity: 0, fees: 5 }),
        },
        headers: AUTH,
      })
    );
    expect(response.status).toBe(400);
  });

  it('returns 422 when a sell exceeds the holding', async () => {
    seedMeta('user-1');
    seedLedgerAsset('asset-1', 'user-1');
    store.set(docKey('assetTransactions', 'baseline-asset-1'), {
      userId: 'user-1',
      assetId: 'asset-1',
      type: 'buy',
      isBaseline: true,
      date: PAST_BASELINE,
      quantity: 10,
      pricePerUnit: 100,
      priceEur: 100,
      createdAt: PAST_BASELINE,
      updatedAt: PAST_BASELINE,
    });

    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'user-1', transaction: validTransaction({ type: 'sell', quantity: 100 }) },
        headers: AUTH,
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'La vendita supera la quantità posseduta a quella data.',
    });
  });

  it('returns 409 when the ledger is not yet initialized', async () => {
    seedLedgerAsset('asset-1', 'user-1'); // asset exists, but no meta doc

    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'user-1', transaction: validTransaction() },
        headers: AUTH,
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Registro operazioni non ancora inizializzato.',
    });
  });

  it('rejects editing a locked field on the baseline (400)', async () => {
    seedMeta('user-1');
    seedLedgerAsset('asset-1', 'user-1');
    store.set(docKey('assetTransactions', 'baseline-asset-1'), {
      userId: 'user-1',
      assetId: 'asset-1',
      type: 'buy',
      isBaseline: true,
      date: PAST_BASELINE,
      quantity: 10,
      pricePerUnit: 100,
      priceEur: 100,
      createdAt: PAST_BASELINE,
      updatedAt: PAST_BASELINE,
    });

    const response = await editRoute(
      createJsonRequest('http://localhost/api/asset-transactions/baseline-asset-1', {
        method: 'PUT',
        body: { userId: 'user-1', updates: { date: new Date().toISOString() } },
        headers: AUTH,
      }),
      { params: Promise.resolve({ transactionId: 'baseline-asset-1' }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Della posizione iniziale puoi modificare solo quantità, prezzo e nota.',
    });
  });

  it('refuses to delete the baseline (400)', async () => {
    store.set(docKey('assetTransactions', 'baseline-asset-1'), {
      userId: 'user-1',
      assetId: 'asset-1',
      type: 'buy',
      isBaseline: true,
      date: PAST_BASELINE,
      quantity: 10,
      pricePerUnit: 100,
      priceEur: 100,
      createdAt: PAST_BASELINE,
      updatedAt: PAST_BASELINE,
    });

    const response = await deleteRoute(
      createJsonRequest('http://localhost/api/asset-transactions/baseline-asset-1?userId=user-1', {
        method: 'DELETE',
        headers: AUTH,
      }),
      { params: Promise.resolve({ transactionId: 'baseline-asset-1' }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'La posizione iniziale non può essere eliminata.',
    });
  });

  it('migrates once, then reports alreadyMigrated on a second call', async () => {
    getUserAssetsAdminMock.mockResolvedValue([
      { id: 'asset-1', type: 'etf', quantity: 10, averageCost: 100, currentPrice: 120, currency: 'EUR' },
      { id: 'cash-1', type: 'cash', quantity: 5000, currentPrice: 1, currency: 'EUR' }, // not a ledger type
    ]);

    const first = await migrateRoute(
      createJsonRequest('http://localhost/api/asset-transactions/migrate', {
        method: 'POST',
        body: { userId: 'user-1' },
        headers: AUTH,
      })
    );
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({ migratedAssetCount: 1 });
    // The baseline doc + meta doc were written.
    expect(store.has(docKey('assetTransactions', 'baseline-asset-1'))).toBe(true);
    expect(store.has(docKey('assetTransactionsMeta', 'user-1'))).toBe(true);

    const second = await migrateRoute(
      createJsonRequest('http://localhost/api/asset-transactions/migrate', {
        method: 'POST',
        body: { userId: 'user-1' },
        headers: AUTH,
      })
    );
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ alreadyMigrated: true });
  });
});
