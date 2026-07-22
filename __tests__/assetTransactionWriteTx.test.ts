import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test for the trade-ledger write transaction (assetTransactionUseCase).
 *
 * Runs the REAL use-case transaction body against a fake Admin `runTransaction` whose `tx.get`
 * throws once a write has happened — exactly as the live Firestore SDK does (AGENTS.md →
 * runTransaction). A regression to interleaved read/write, or a missing pre-read of a touched cash
 * account, would fail here. Template: __tests__/updateCashAssetBalancesAtomic.test.ts.
 *
 * Covers: create with cash settlement, edit moving the settlement to a different cash account (two
 * aggregated deltas), delete reversing the cash, and the holdingStartDate: undefined → field-left-
 * untouched rule on the derived asset write.
 */

// ─── In-memory Firestore, keyed by `${collection}/${id}` ────────────────────
// Hoisted so the vi.mock factory (also hoisted) can reference it before the imports run.
const mocks = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  counter: { next: 0 },
  invalidate: vi.fn().mockResolvedValue(undefined),
}));
const store = mocks.store;
const docKey = (collection: string, id: string) => `${collection}/${id}`;

vi.mock('server-only', () => ({}));

// FX is network-bound: mock it away. EUR trades → priceEur === pricePerUnit (identity).
vi.mock('@/lib/server/tradeFxService', () => ({
  resolveTradePriceEur: vi.fn(async (_currency: string, pricePerUnit: number) => pricePerUnit),
  resolveBaselinePriceEur: vi.fn(
    async (asset: { averageCost?: number; currentPrice: number }) => asset.averageCost ?? asset.currentPrice
  ),
  TradeFxUnavailableError: class TradeFxUnavailableError extends Error {},
}));

vi.mock('@/lib/services/dashboardOverviewInvalidation.server', () => ({
  invalidateDashboardOverviewSummaryServer: (...args: unknown[]) => mocks.invalidate(...args),
}));

vi.mock('@/lib/server/assetAdminRepository', () => ({
  getUserAssetsAdmin: vi.fn(async () => []),
}));

vi.mock('@/lib/firebase/admin', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { FieldValue } = require('firebase-admin/firestore');
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
      let hasWritten = false;
      const pending: { type: 'set' | 'update' | 'delete'; collection: string; id: string; data?: Record<string, unknown> }[] = [];
      const tx = {
        get: async (refOrQuery: { _collection: string; id?: string; _filters?: Filter[]; run?: () => unknown }) => {
          if (hasWritten) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          if (refOrQuery._filters) return refOrQuery.run!();
          const data = store.get(key(refOrQuery._collection, refOrQuery.id as string));
          return { exists: data !== undefined, id: refOrQuery.id, data: () => data };
        },
        set: (ref: { _collection: string; id: string }, data: Record<string, unknown>) => {
          hasWritten = true;
          pending.push({ type: 'set', collection: ref._collection, id: ref.id, data });
        },
        update: (ref: { _collection: string; id: string }, data: Record<string, unknown>) => {
          hasWritten = true;
          pending.push({ type: 'update', collection: ref._collection, id: ref.id, data });
        },
        delete: (ref: { _collection: string; id: string }) => {
          hasWritten = true;
          pending.push({ type: 'delete', collection: ref._collection, id: ref.id });
        },
      };

      await fn(tx);

      for (const write of pending) {
        const k = key(write.collection, write.id);
        if (write.type === 'delete') {
          store.delete(k);
          continue;
        }
        if (write.type === 'set') {
          store.set(k, { ...(write.data as Record<string, unknown>) });
          continue;
        }
        // update: merge, honoring FieldValue.delete() sentinels as key removals.
        const merged = { ...(store.get(k) ?? {}) };
        for (const [field, value] of Object.entries(write.data as Record<string, unknown>)) {
          if (value instanceof FieldValue) delete merged[field];
          else merged[field] = value;
        }
        store.set(k, merged);
      }
    },
  };

  return { adminDb };
});

const invalidateMock = mocks.invalidate;

import {
  createAssetTransaction,
  updateAssetTransaction,
  deleteAssetTransaction,
} from '@/lib/server/assetTransactionUseCase';

const OWNER = 'owner-1';
const BASELINE_DATE = new Date(2024, 0, 1);

function seedMeta() {
  store.set(docKey('assetTransactionsMeta', OWNER), { userId: OWNER, baselineDate: BASELINE_DATE });
}
function seedAsset(overrides: Record<string, unknown> = {}) {
  store.set(docKey('assets', 'asset-1'), {
    userId: OWNER,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 0,
    ...overrides,
  });
}
function seedCash(id: string, quantity: number) {
  store.set(docKey('assets', id), { userId: OWNER, assetClass: 'cash', quantity });
}

describe('assetTransactionUseCase — atomic write transaction', () => {
  beforeEach(() => {
    store.clear();
    invalidateMock.mockClear();
    mocks.counter.next = 0;
    seedMeta();
  });

  it('creates a buy with cash settlement, debiting the linked account (reads before writes)', async () => {
    seedAsset({ quantity: 0 });
    seedCash('cash-1', 10000);

    const result = await createAssetTransaction(OWNER, {
      assetId: 'asset-1',
      type: 'buy',
      date: new Date(),
      quantity: 10,
      pricePerUnit: 100,
      linkedCashAssetId: 'cash-1',
    });

    expect(result.derived).toEqual({ quantity: 10, averageCost: 100 });
    // 10 units × €100 debited from the cash account.
    expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(9000);
    const asset = store.get(docKey('assets', 'asset-1'))!;
    expect(asset.quantity).toBe(10);
    expect(asset.averageCost).toBe(100);
    expect(invalidateMock).toHaveBeenCalledWith(OWNER, 'asset_transaction_created');
  });

  it('moves the settlement to a different cash account with two aggregated deltas', async () => {
    seedAsset({ quantity: 10, averageCost: 100 });
    seedCash('cash-1', 9000);
    seedCash('cash-2', 5000);
    store.set(docKey('assetTransactions', 't1'), {
      userId: OWNER,
      assetId: 'asset-1',
      type: 'buy',
      date: new Date(2024, 5, 1),
      quantity: 10,
      pricePerUnit: 100,
      priceEur: 100,
      linkedCashAssetId: 'cash-1',
      note: 'primo acquisto',
      createdAt: new Date(2024, 5, 1),
      updatedAt: new Date(2024, 5, 1),
    });

    await updateAssetTransaction(OWNER, 't1', { linkedCashAssetId: 'cash-2' });

    // cash-1 is refunded (+1000), cash-2 is debited (−1000).
    expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(10000);
    expect(store.get(docKey('assets', 'cash-2'))!.quantity).toBe(4000);
    expect(store.get(docKey('assetTransactions', 't1'))!.linkedCashAssetId).toBe('cash-2');
  });

  it('deletes a trade and reverses its cash settlement', async () => {
    seedAsset({ quantity: 10, averageCost: 100 });
    seedCash('cash-1', 9000);
    store.set(docKey('assetTransactions', 't1'), {
      userId: OWNER,
      assetId: 'asset-1',
      type: 'buy',
      date: new Date(2024, 5, 1),
      quantity: 10,
      pricePerUnit: 100,
      priceEur: 100,
      linkedCashAssetId: 'cash-1',
      createdAt: new Date(2024, 5, 1),
      updatedAt: new Date(2024, 5, 1),
    });

    await deleteAssetTransaction(OWNER, 't1');

    expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(10000); // refunded
    expect(store.get(docKey('assets', 'asset-1'))!.quantity).toBe(0); // position emptied
    expect(store.has(docKey('assetTransactions', 't1'))).toBe(false);
    expect(invalidateMock).toHaveBeenCalledWith(OWNER, 'asset_transaction_deleted');
  });

  it('leaves holdingStartDate untouched when the replay yields no new holding start', async () => {
    const originalHoldingStart = new Date(2020, 0, 1);
    seedAsset({ quantity: 10, averageCost: 100, holdingStartDate: originalHoldingStart });
    // A pre-existing baseline holding: adding to it (10 → 20) is NOT a 0→>0 transition, so replay
    // returns holdingStartDate: undefined and the asset write must NOT touch the stored value.
    store.set(docKey('assetTransactions', 'baseline-asset-1'), {
      userId: OWNER,
      assetId: 'asset-1',
      type: 'buy',
      isBaseline: true,
      date: BASELINE_DATE,
      quantity: 10,
      pricePerUnit: 100,
      priceEur: 100,
      createdAt: BASELINE_DATE,
      updatedAt: BASELINE_DATE,
    });

    await createAssetTransaction(OWNER, {
      assetId: 'asset-1',
      type: 'buy',
      date: new Date(),
      quantity: 10,
      pricePerUnit: 200,
    });

    const asset = store.get(docKey('assets', 'asset-1'))!;
    expect(asset.quantity).toBe(20);
    expect(asset.averageCost).toBe(150); // (10·100 + 10·200) / 20
    expect(asset.holdingStartDate).toBe(originalHoldingStart); // untouched, never deleteField()
  });
});
