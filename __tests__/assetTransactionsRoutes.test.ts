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
 *
 * Concurrency (2026-11-12, «every write decides inside its transaction»): the fake's
 * `runTransaction` SERIALIZES — each closure runs and applies its writes before the next one starts,
 * the fake's model of Firestore's serializable isolation — and a per-call gate (`mocks.txGate`) holds
 * chosen calls BEFORE they join that queue, so a test can let two requests prepare on the same
 * version and only then commit them. `mocks.fx.gate` defers the migration's price pre-read the same
 * way.
 */

// Hoisted so the vi.mock factories (also hoisted) can reference them before imports run.
const mocks = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  counter: { next: 0 },
  verifyIdToken: vi.fn(),
  getUserAssetsAdmin: vi.fn(),
  /** The tail of the transaction queue: every runTransaction joins it, one closure at a time. */
  txQueue: { tail: Promise.resolve() as Promise<unknown> },
  /** runTransaction calls entered so far (1-based numbering of the gate). */
  prepared: { count: 0 },
  /** The calls listed are held until `release()`, before they join the queue. */
  txGate: null as { calls: number[]; wait: Promise<void>; release: () => void } | null,
  /** Every tx.get argument, for the tests that assert a document was read inside a transaction. */
  txGet: vi.fn(),
  /** While `gate` is set, resolveBaselinePriceEur waits on it (`waiting` counts the callers held). */
  fx: { gate: null as Promise<void> | null, waiting: 0 },
}));
const store = mocks.store;
const verifyIdTokenMock = mocks.verifyIdToken;
const getUserAssetsAdminMock = mocks.getUserAssetsAdmin;
const docKey = (collection: string, id: string) => `${collection}/${id}`;

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

vi.mock('@/lib/server/tradeFxService', () => ({
  resolveTradePriceEur: vi.fn(async (_currency: string, pricePerUnit: number) => pricePerUnit),
  resolveBaselinePriceEur: vi.fn(async (asset: { averageCost?: number; currentPrice: number }) => {
    const gate = mocks.fx.gate;
    if (gate) {
      mocks.fx.waiting += 1;
      await gate;
    }
    return asset.averageCost ?? asset.currentPrice;
  }),
  TradeFxUnavailableError: class TradeFxUnavailableError extends Error {},
}));

vi.mock('@/lib/services/dashboardOverviewInvalidation.server', () => ({
  invalidateDashboardOverviewSummaryServer: vi.fn().mockResolvedValue(undefined),
}));

// The real mapAssetDoc (the migration maps its in-transaction read through it); only the
// pre-read is mocked, fed by seedAsset so pre-read and transaction agree.
vi.mock('@/lib/server/assetAdminRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/assetAdminRepository')>()),
  getUserAssetsAdmin: mocks.getUserAssetsAdmin,
}));

vi.mock('@/lib/firebase/admin', async () => {
  const { FieldValue } = await import('firebase-admin/firestore');
  const key = (collection: string, id: string) => `${collection}/${id}`;
  // A written Date comes back as Firestore gives it, a Timestamp that answers toDate() (mapAssetDoc reads it).
  class StoredTimestamp extends Date {
    toDate() {
      return new Date(this.getTime());
    }
  }
  const asStored = (data: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(data).map(([f, v]) => [f, v instanceof Date ? new StoredTimestamp(v.getTime()) : v]));
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
    update: async (data: Record<string, unknown>) => {
      store.set(key(collection, id), { ...(store.get(key(collection, id)) ?? {}), ...data });
    },
  });
  const makeQuery = (collection: string, filters: Filter[]): Record<string, unknown> => {
    const run = () => {
      const docs: { id: string; ref: ReturnType<typeof makeDocRef>; data: () => Record<string, unknown> }[] = [];
      for (const [k, value] of store) {
        if (!k.startsWith(`${collection}/`)) continue;
        if (filters.every((f) => value[f.field] === f.value)) {
          const id = k.slice(collection.length + 1);
          docs.push({ id, ref: makeDocRef(collection, id), data: () => value });
        }
      }
      return { docs, empty: docs.length === 0 };
    };
    return {
      _collection: collection,
      _filters: filters,
      where: (field: string, _op: string, value: unknown) => makeQuery(collection, [...filters, { field, value }]),
      run,
      // Outside a transaction (the backfill reads a ledger with a plain query).
      get: async () => run(),
    };
  };

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
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const call = ++mocks.prepared.count;
      if (mocks.txGate?.calls.includes(call)) await mocks.txGate.wait;

      const run = async () => {
        const pending: { type: 'set' | 'update' | 'delete'; collection: string; id: string; data?: Record<string, unknown> }[] = [];
        const tx = {
          get: async (refOrQuery: { _collection: string; id?: string; _filters?: Filter[]; run?: () => unknown }) => {
            mocks.txGet(refOrQuery);
            if (refOrQuery._filters) return refOrQuery.run!();
            const data = store.get(key(refOrQuery._collection, refOrQuery.id as string));
            return { exists: data !== undefined, id: refOrQuery.id, data: () => data };
          },
          create: (ref: { _collection: string; id: string }, data: Record<string, unknown>) => {
            const k = key(ref._collection, ref.id);
            if (store.has(k) || pending.some((w) => key(w.collection, w.id) === k)) throw new Error('ALREADY_EXISTS');
            pending.push({ type: 'set', collection: ref._collection, id: ref.id, data });
          },
          set: (ref: { _collection: string; id: string }, data: Record<string, unknown>) =>
            pending.push({ type: 'set', collection: ref._collection, id: ref.id, data }),
          update: (ref: { _collection: string; id: string }, data: Record<string, unknown>) =>
            pending.push({ type: 'update', collection: ref._collection, id: ref.id, data }),
          delete: (ref: { _collection: string; id: string }) =>
            pending.push({ type: 'delete', collection: ref._collection, id: ref.id }),
        };
        const result = await fn(tx);
        for (const write of pending) {
          const k = key(write.collection, write.id);
          if (write.type === 'delete') store.delete(k);
          else if (write.type === 'set') store.set(k, asStored(write.data as Record<string, unknown>));
          else {
            // update: merge, honoring FieldValue.delete() sentinels as key removals.
            const merged = { ...(store.get(k) ?? {}) };
            for (const [field, value] of Object.entries(asStored(write.data as Record<string, unknown>))) {
              if (value instanceof FieldValue) delete merged[field];
              else merged[field] = value;
            }
            store.set(k, merged);
          }
        }
        return result;
      };
      const settled = mocks.txQueue.tail.then(run);
      mocks.txQueue.tail = settled.catch(() => undefined);
      return settled;
    },
  };

  return { adminAuth: { verifyIdToken: mocks.verifyIdToken }, adminDb };
});

import { POST as createRoute } from '@/app/api/asset-transactions/route';
import { PUT as editRoute, DELETE as deleteRoute } from '@/app/api/asset-transactions/[transactionId]/route';
import { POST as migrateRoute } from '@/app/api/asset-transactions/migrate/route';
import { POST as backfillRoute } from '@/app/api/asset-transactions/backfill-average-cost-eur/route';
import { deleteAllAssetTransactionsForAsset } from '@/lib/server/assetTransactionUseCase';

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
/** Assets the mocked pre-read (getUserAssetsAdmin) answers with, in the shape it maps to. */
let seededAssets: Record<string, unknown>[] = [];
/** An asset in the store AND in the pre-read's answer, so both reads of the migration agree. */
function seedAsset(id: string, data: Record<string, unknown>) {
  store.set(docKey('assets', id), { ...data });
  seededAssets = [...seededAssets.filter((a) => a.id !== id), { id, ...data }];
}
/** Hold the listed runTransaction calls (1-based) until the returned release is called. */
function gateTransactions(...calls: number[]): () => void {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => (release = resolve));
  mocks.txGate = { calls, wait, release };
  return release;
}
/** Defer the migration's price pre-read until the returned release is called. */
function deferBaselinePrices(): () => void {
  let release!: () => void;
  mocks.fx.gate = new Promise<void>((resolve) => (release = resolve));
  return release;
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
    seededAssets = [];
    getUserAssetsAdminMock.mockReset();
    getUserAssetsAdminMock.mockImplementation(async () => seededAssets.map((a) => ({ ...a })));
    mocks.txQueue.tail = Promise.resolve();
    mocks.prepared.count = 0;
    mocks.txGate = null;
    mocks.txGet.mockClear();
    mocks.fx.gate = null;
    mocks.fx.waiting = 0;
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

  it('accepts a date before the ledger opened, for an asset without a baseline (200)', async () => {
    // A new account opens the ledger on its first visit to Patrimonio, so until 2026-09-13
    // «today» was the floor and no past purchase could be recorded (a user's report: ENI shares
    // bought in 2024 and 2025). The meta's baselineDate is the baselines' date, not a floor.
    seedMeta('user-1');
    seedLedgerAsset('asset-1', 'user-1');

    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'user-1', transaction: validTransaction({ date: new Date(2023, 5, 15, 12).toISOString() }) },
        headers: AUTH,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ derived: { quantity: 5, averageCost: 100 } });
  });

  it('refuses a date before the baseline of a migrated asset (422), naming the day', async () => {
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
        body: { userId: 'user-1', transaction: validTransaction({ date: new Date(2023, 5, 15, 12).toISOString() }) },
        headers: AUTH,
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Su questo asset le operazioni partono dalla posizione iniziale del 01/01/2024: una data precedente non è registrabile.',
    });
  });

  it('refuses a date in the future (422)', async () => {
    seedMeta('user-1');
    seedLedgerAsset('asset-1', 'user-1');
    // Two days ahead: clear of the Italian day bound whatever the runner's zone.
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    const response = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'user-1', transaction: validTransaction({ date: future }) },
        headers: AUTH,
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: 'La data non può essere nel futuro.' });
  });

  it('stores a BTP€i trade’s indexation coefficient beside its price, and refuses a non-positive one', async () => {
    seedMeta('user-1');
    seedLedgerAsset('asset-1', 'user-1');

    const ok = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'user-1', transaction: validTransaction({ indexationCoefficient: 1.25 }) },
        headers: AUTH,
      })
    );
    expect(ok.status).toBe(200);
    const stored = [...store.entries()].find(([key]) => key.startsWith('assetTransactions/'))?.[1] as
      | { indexationCoefficient?: number }
      | undefined;
    expect(stored?.indexationCoefficient).toBe(1.25);

    const refused = await createRoute(
      createJsonRequest('http://localhost/api/asset-transactions', {
        method: 'POST',
        body: { userId: 'user-1', transaction: validTransaction({ indexationCoefficient: 0 }) },
        headers: AUTH,
      })
    );
    expect(refused.status).toBe(400);
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
    seedAsset('asset-1', { userId: 'user-1', type: 'etf', quantity: 10, averageCost: 100, currentPrice: 120, currency: 'EUR' });
    // Not a ledger type.
    seedAsset('cash-1', { userId: 'user-1', type: 'cash', quantity: 5000, currentPrice: 1, currency: 'EUR' });

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

  describe('POST /api/asset-transactions/backfill-average-cost-eur', () => {
    const backfill = (userId: string, headers?: Record<string, string>) =>
      backfillRoute(
        createJsonRequest('http://localhost/api/asset-transactions/backfill-average-cost-eur', {
          method: 'POST',
          body: { userId },
          headers,
        })
      );

    it('returns 401 without an Authorization header', async () => {
      const response = await backfill('user-1');
      expect(response.status).toBe(401);
      expect(verifyIdTokenMock).not.toHaveBeenCalled();
    });

    it('returns 403 for a non-member acting on another owner’s data', async () => {
      seedMeta('owner-2');
      const response = await backfill('owner-2', AUTH);
      expect(response.status).toBe(403);
      expect(store.get(docKey('assetTransactionsMeta', 'owner-2'))!.averageCostEurBackfilledAt).toBeUndefined();
    });

    it('is a no-op before the ledger migration (no meta doc) and never creates one', async () => {
      const response = await backfill('user-1', AUTH);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ alreadyBackfilled: true });
      expect(store.has(docKey('assetTransactionsMeta', 'user-1'))).toBe(false);
    });

    it('projects averageCostEur for the owner once, then reports alreadyBackfilled', async () => {
      seedMeta('user-1');
      store.set(docKey('assets', 'asset-1'), { userId: 'user-1', type: 'etf', currency: 'USD', quantity: 10, averageCost: 100, currentPrice: 145 });
      store.set(docKey('assetTransactions', 't1'), {
        userId: 'user-1',
        assetId: 'asset-1',
        type: 'buy',
        date: new Date(2026, 0, 5),
        quantity: 10,
        pricePerUnit: 100,
        priceEur: 90,
        fees: 5,
        isBaseline: false,
      });
      getUserAssetsAdminMock.mockResolvedValue([{ id: 'asset-1', type: 'etf', quantity: 10 }]);

      const first = await backfill('user-1', AUTH);
      expect(first.status).toBe(200);
      await expect(first.json()).resolves.toEqual({ recomputedAssetCount: 1, skippedAssetCount: 0 });
      expect(store.get(docKey('assets', 'asset-1'))).toMatchObject({ averageCost: 100, averageCostEur: 90.5, quantity: 10 });

      const second = await backfill('user-1', AUTH);
      expect(second.status).toBe(200);
      await expect(second.json()).resolves.toEqual({ alreadyBackfilled: true });
    });
  });

  // Every write decides inside its transaction (2026-11-12): a decision read outside it is
  // re-checked inside, so a late or concurrent caller changes nothing it did not see.
  describe('concurrent writes', () => {
    const T0 = new Date(2024, 5, 1, 12);
    const ETF = {
      userId: 'user-1',
      type: 'etf',
      assetClass: 'equity',
      currency: 'EUR',
      quantity: 10,
      averageCost: 100,
      currentPrice: 120,
    };
    const CHANGED = "L'operazione è cambiata nel frattempo: riapri e riprova.";

    const migrate = () =>
      migrateRoute(
        createJsonRequest('http://localhost/api/asset-transactions/migrate', {
          method: 'POST',
          body: { userId: 'user-1' },
          headers: AUTH,
        })
      );
    const buy = (overrides: Record<string, unknown> = {}) =>
      createRoute(
        createJsonRequest('http://localhost/api/asset-transactions', {
          method: 'POST',
          body: { userId: 'user-1', transaction: validTransaction(overrides) },
          headers: AUTH,
        })
      );
    const editTrade = (id: string, updates: Record<string, unknown>, expectedUpdatedAt?: string) =>
      editRoute(
        createJsonRequest(`http://localhost/api/asset-transactions/${id}`, {
          method: 'PUT',
          body: { userId: 'user-1', updates, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) },
          headers: AUTH,
        }),
        { params: Promise.resolve({ transactionId: id }) }
      );
    const deleteTrade = (id: string, expectedUpdatedAt?: string) =>
      deleteRoute(
        createJsonRequest(
          `http://localhost/api/asset-transactions/${id}?userId=user-1` +
            (expectedUpdatedAt !== undefined ? `&expectedUpdatedAt=${encodeURIComponent(expectedUpdatedAt)}` : ''),
          { method: 'DELETE', headers: AUTH }
        ),
        { params: Promise.resolve({ transactionId: id }) }
      );
    const backfill = () =>
      backfillRoute(
        createJsonRequest('http://localhost/api/asset-transactions/backfill-average-cost-eur', {
          method: 'POST',
          body: { userId: 'user-1' },
          headers: AUTH,
        })
      );
    function seedTrade(id: string, data: Record<string, unknown>) {
      store.set(docKey('assetTransactions', id), {
        userId: 'user-1',
        assetId: 'asset-1',
        createdAt: T0,
        updatedAt: T0,
        ...data,
      });
    }
    function seedCashAccount(id: string, quantity: number) {
      store.set(docKey('assets', id), { userId: 'user-1', assetClass: 'cash', type: 'cash', currency: 'EUR', quantity });
    }
    /** A held position of 10 (baseline) less a SELL of 2 at 100 settled on cash-1. */
    function seedSettledSell() {
      seedMeta('user-1');
      store.set(docKey('assets', 'asset-1'), { ...ETF, quantity: 8 });
      seedTrade('baseline-asset-1', {
        type: 'buy',
        isBaseline: true,
        date: PAST_BASELINE,
        quantity: 10,
        pricePerUnit: 100,
        priceEur: 100,
      });
      seedTrade('sell-1', { type: 'sell', date: T0, quantity: 2, pricePerUnit: 100, priceEur: 100, linkedCashAssetId: 'cash-1' });
      seedCashAccount('cash-1', 1200);
    }
    const tradeKeys = () => [...store.keys()].filter((k) => k.startsWith('assetTransactions/'));

    it('M1: a migration that resolves after another completed writes nothing, and the corrected baseline stands', async () => {
      seedAsset('asset-1', ETF);
      const releaseLate = deferBaselinePrices();
      const late = migrate();
      await vi.waitFor(() => expect(mocks.fx.waiting).toBe(1));
      mocks.fx.gate = null;

      const first = await migrate();
      expect(first.status).toBe(200);
      await expect(first.json()).resolves.toMatchObject({ migratedAssetCount: 1 });
      expect((await editTrade('baseline-asset-1', { quantity: 12 })).status).toBe(200);

      releaseLate();
      const lateResponse = await late;
      expect(lateResponse.status).toBe(200);
      await expect(lateResponse.json()).resolves.toEqual({ alreadyMigrated: true });
      expect(store.get(docKey('assetTransactions', 'baseline-asset-1'))!.quantity).toBe(12);

      expect((await buy({ quantity: 1 })).status).toBe(200);
      expect(store.get(docKey('assets', 'asset-1'))!.quantity).toBe(13);
    });

    it('M2: never overwrites an existing baseline, even with no meta document', async () => {
      seedAsset('asset-1', ETF);
      seedTrade('baseline-asset-1', { type: 'buy', isBaseline: true, date: T0, quantity: 7, pricePerUnit: 100, priceEur: 100 });

      const response = await migrate();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ migratedAssetCount: 0 });
      expect(store.get(docKey('assetTransactions', 'baseline-asset-1'))!.quantity).toBe(7);
      expect(store.has(docKey('assetTransactionsMeta', 'user-1'))).toBe(true);
    });

    it('M3: a late migration never rewrites the meta document (averageCostEurBackfilledAt survives)', async () => {
      seedAsset('asset-1', ETF);
      const releaseLate = deferBaselinePrices();
      const late = migrate();
      await vi.waitFor(() => expect(mocks.fx.waiting).toBe(1));
      // Meanwhile another caller migrated and backfilled.
      seedTrade('baseline-asset-1', { type: 'buy', isBaseline: true, date: T0, quantity: 10, pricePerUnit: 100, priceEur: 100 });
      store.set(docKey('assetTransactionsMeta', 'user-1'), {
        userId: 'user-1',
        migratedAt: T0,
        baselineDate: T0,
        migratedAssetCount: 1,
        averageCostEurBackfilledAt: T0,
        createdAt: T0,
        updatedAt: T0,
      });

      releaseLate();
      const response = await late;

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ alreadyMigrated: true });
      expect(store.get(docKey('assetTransactionsMeta', 'user-1'))!.averageCostEurBackfilledAt).toEqual(T0);
    });

    it('M4: a ledger asset that appears between the price pre-read and the transaction is still migrated', async () => {
      seedAsset('asset-1', ETF);
      getUserAssetsAdminMock.mockImplementationOnce(async () => {
        const answer = seededAssets.map((a) => ({ ...a }));
        seedAsset('asset-2', { ...ETF, quantity: 4 });
        return answer;
      });

      const response = await migrate();

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ migratedAssetCount: 2 });
      expect(store.has(docKey('assetTransactions', 'baseline-asset-1'))).toBe(true);
      expect(store.has(docKey('assetTransactions', 'baseline-asset-2'))).toBe(true);
    });

    it('M5: refuses more than 450 baselines in one migration (422), writing nothing', async () => {
      getUserAssetsAdminMock.mockResolvedValue(
        Array.from({ length: 451 }, (_, i) => ({ ...ETF, id: `asset-${i}`, quantity: 1 }))
      );

      const response = await migrate();

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: 'Troppi strumenti per inizializzare il registro in una volta: contatta il supporto.',
      });
      expect(tradeKeys()).toEqual([]);
      expect(store.has(docKey('assetTransactionsMeta', 'user-1'))).toBe(false);
    });

    it('D1: two deletes of the same trade settle the cash account once (200, then 404)', async () => {
      seedSettledSell();
      const release = gateTransactions(1, 2);
      const first = deleteTrade('sell-1');
      const second = deleteTrade('sell-1');
      await vi.waitFor(() => expect(mocks.prepared.count).toBe(2));
      release();

      const [firstResponse, secondResponse] = await Promise.all([first, second]);

      expect([firstResponse.status, secondResponse.status]).toEqual([200, 404]);
      await expect(secondResponse.json()).resolves.toMatchObject({ error: 'Operazione non trovata.' });
      expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(1000);
    });

    it('E1: an edit prepared on a version that is no longer stored answers 409 and writes nothing', async () => {
      seedMeta('user-1');
      store.set(docKey('assets', 'asset-1'), { ...ETF, quantity: 5 });
      seedTrade('buy-1', { type: 'buy', date: T0, quantity: 5, pricePerUnit: 100, priceEur: 100 });
      const release = gateTransactions(1, 2);
      const first = editTrade('buy-1', { quantity: 3 });
      const second = editTrade('buy-1', { note: 'x' });
      await vi.waitFor(() => expect(mocks.prepared.count).toBe(2));
      release();

      const [firstResponse, secondResponse] = await Promise.all([first, second]);

      expect([firstResponse.status, secondResponse.status]).toEqual([200, 409]);
      await expect(secondResponse.json()).resolves.toMatchObject({ error: CHANGED });
      const stored = store.get(docKey('assetTransactions', 'buy-1'))!;
      expect(stored.quantity).toBe(3);
      expect(stored.note).toBeUndefined();
    });

    it('E2: a PUT carrying the version of BEFORE an edit answers 409; the same PUT without it passes', async () => {
      seedMeta('user-1');
      store.set(docKey('assets', 'asset-1'), { ...ETF, quantity: 5 });
      seedTrade('buy-1', { type: 'buy', date: T0, quantity: 5, pricePerUnit: 100, priceEur: 100 });
      expect((await editTrade('buy-1', { quantity: 3 })).status).toBe(200);

      const stale = await editTrade('buy-1', { note: 'x' }, T0.toISOString());

      expect(stale.status).toBe(409);
      await expect(stale.json()).resolves.toMatchObject({ error: CHANGED });
      const stored = store.get(docKey('assetTransactions', 'buy-1'))!;
      expect(stored.quantity).toBe(3);
      expect(stored.note).toBeUndefined();
      expect((await editTrade('buy-1', { note: 'x' })).status).toBe(200);
    });

    it('D2: a DELETE carrying a stale version answers 409 and keeps trade and settlement; a malformed one 400', async () => {
      seedSettledSell();
      expect((await editTrade('sell-1', { note: 'x' })).status).toBe(200);

      const stale = await deleteTrade('sell-1', T0.toISOString());

      expect(stale.status).toBe(409);
      await expect(stale.json()).resolves.toMatchObject({ error: CHANGED });
      expect(store.has(docKey('assetTransactions', 'sell-1'))).toBe(true);
      expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(1200);
      expect((await deleteTrade('sell-1', 'not-a-date')).status).toBe(400);
    });

    it('B1: the backfill never lowers a fresher averageCostEur (trades and asset read in its transaction)', async () => {
      seedMeta('user-1');
      seedAsset('asset-1', ETF);
      seedTrade('t1', { type: 'buy', date: T0, quantity: 10, pricePerUnit: 100, priceEur: 100 });
      const release = gateTransactions(1);
      const pending = backfill();
      await vi.waitFor(() => expect(mocks.prepared.count).toBe(1));

      expect((await buy({ quantity: 1, pricePerUnit: 210 })).status).toBe(200);
      release();
      const response = await pending;

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ recomputedAssetCount: 1, skippedAssetCount: 0 });
      expect(store.get(docKey('assets', 'asset-1'))!.averageCostEur).toBeCloseTo((1000 + 210) / 11, 9);
    });

    it('A1: deleteAllAssetTransactionsForAsset deletes in one transaction that also reads the asset', async () => {
      seedLedgerAsset('asset-1', 'user-1');
      for (const id of ['t1', 't2', 't3']) {
        seedTrade(id, { type: 'buy', date: T0, quantity: 1, pricePerUnit: 100, priceEur: 100 });
      }

      const deleted = await deleteAllAssetTransactionsForAsset('user-1', 'asset-1');

      expect(deleted).toBe(3);
      expect(tradeKeys()).toEqual([]);
      const readAsset = mocks.txGet.mock.calls.some(
        ([ref]) => (ref as { _collection: string; id?: string })._collection === 'assets' && (ref as { id?: string }).id === 'asset-1'
      );
      expect(readAsset).toBe(true);
    });

    it('T1: a trade on an asset that left the ledger before the commit answers 422 and writes nothing', async () => {
      seedMeta('user-1');
      seedLedgerAsset('asset-1', 'user-1');
      const release = gateTransactions(1);
      const pending = buy();
      await vi.waitFor(() => expect(mocks.prepared.count).toBe(1));
      store.set(docKey('assets', 'asset-1'), { ...store.get(docKey('assets', 'asset-1'))!, type: 'pensionFund' });
      release();

      const response = await pending;

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({ error: 'Questo tipo di asset non usa il registro operazioni.' });
      expect(tradeKeys()).toEqual([]);
    });

    it('S1: a settlement account that stopped being a cash account before the commit answers 422 and writes nothing', async () => {
      seedMeta('user-1');
      seedLedgerAsset('asset-1', 'user-1');
      seedCashAccount('cash-1', 1000);
      const release = gateTransactions(1);
      const pending = buy({ linkedCashAssetId: 'cash-1' });
      await vi.waitFor(() => expect(mocks.prepared.count).toBe(1));
      store.set(docKey('assets', 'cash-1'), { ...store.get(docKey('assets', 'cash-1'))!, type: 'etf' });
      release();

      const response = await pending;

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({ error: 'Il conto di regolamento selezionato non è valido.' });
      expect(tradeKeys()).toEqual([]);
      expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(1000);
    });
  });
});
