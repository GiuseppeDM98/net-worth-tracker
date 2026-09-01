import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test for backfillAverageCostEur (assetTransactionUseCase.ts) — the one-shot,
 * per-user projection that fixes G/P for foreign-currency positions predating averageCostEur (see
 * lib/utils/patrimonioSummary.ts → costBasisPerUnitEur). Runs the REAL use-case function against a
 * minimal fake Admin SDK (get/update only — no transaction needed here), with getUserAssetsAdmin
 * mocked to sidestep Firestore Timestamp plumbing unrelated to what this function does.
 */

const mocks = vi.hoisted(() => ({
  assetsStore: new Map<string, Record<string, unknown>>(),
  tradesStore: new Map<string, Record<string, unknown>>(),
  metaStore: new Map<string, Record<string, unknown>>(),
  invalidate: vi.fn().mockResolvedValue(undefined),
  ledgerAssets: [] as { id: string; type: string; quantity: number }[],
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/services/dashboardOverviewInvalidation.server', () => ({
  invalidateDashboardOverviewSummaryServer: (...args: unknown[]) => mocks.invalidate(...args),
}));

// Sidesteps the real query + Timestamp.toDate() plumbing: the backfill only needs id/type/quantity
// from this call, all of which the test fixtures below control directly.
vi.mock('@/lib/server/assetAdminRepository', () => ({
  getUserAssetsAdmin: vi.fn(async () => mocks.ledgerAssets),
}));

vi.mock('@/lib/firebase/admin', () => {
  const { assetsStore, tradesStore, metaStore } = mocks;
  const storeFor = (collection: string) =>
    collection === 'assets' ? assetsStore : collection === 'assetTransactionsMeta' ? metaStore : tradesStore;

  const makeDocRef = (collection: string, id: string) => ({
    id,
    get: async () => {
      const data = storeFor(collection).get(id);
      return { exists: data !== undefined, id, data: () => data };
    },
    update: async (data: Record<string, unknown>) => {
      const store = storeFor(collection);
      const existing = store.get(id) ?? {};
      store.set(id, { ...existing, ...data });
    },
  });

  const adminDb = {
    collection: (name: string) => ({
      doc: (id: string) => makeDocRef(name, id),
      where: (field: string, _op: string, value: unknown) => {
        const filters = [{ field, value }];
        const query = {
          where: (f2: string, _op2: string, v2: unknown) => {
            filters.push({ field: f2, value: v2 });
            return query;
          },
          get: async () => {
            const docs: { id: string; data: () => Record<string, unknown> }[] = [];
            for (const [id, value] of storeFor(name)) {
              if (filters.every((f) => value[f.field] === f.value)) {
                docs.push({ id, data: () => value });
              }
            }
            return { docs, empty: docs.length === 0 };
          },
        };
        return query;
      },
    }),
  };

  return { adminDb };
});

import { backfillAverageCostEur } from '@/lib/server/assetTransactionUseCase';

const OWNER = 'owner-1';

function seedMeta(overrides: Record<string, unknown> = {}) {
  mocks.metaStore.set(OWNER, {
    userId: OWNER,
    migratedAt: new Date(2026, 0, 1),
    baselineDate: new Date(2026, 0, 1),
    migratedAssetCount: 1,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...overrides,
  });
}

function seedTrade(assetId: string, id: string, data: Record<string, unknown>) {
  mocks.tradesStore.set(id, {
    userId: OWNER,
    assetId,
    isBaseline: false,
    fees: undefined,
    linkedCashAssetId: undefined,
    note: undefined,
    createdAt: data.date,
    updatedAt: data.date,
    ...data,
  });
}

describe('backfillAverageCostEur', () => {
  beforeEach(() => {
    mocks.assetsStore.clear();
    mocks.tradesStore.clear();
    mocks.metaStore.clear();
    mocks.invalidate.mockClear();
    mocks.ledgerAssets = [];
  });

  it('is a no-op before migration has run (no meta doc)', async () => {
    const result = await backfillAverageCostEur(OWNER);
    expect(result).toEqual({ alreadyBackfilled: true });
    expect(mocks.metaStore.has(OWNER)).toBe(false); // never creates a partial meta doc
  });

  it('is a no-op once already backfilled', async () => {
    seedMeta({ averageCostEurBackfilledAt: new Date(2026, 0, 2) });
    const result = await backfillAverageCostEur(OWNER);
    expect(result).toEqual({ alreadyBackfilled: true });
  });

  it('projects a EUR-side PMC distinct from the native PMC for a foreign-currency asset', async () => {
    seedMeta();
    mocks.assetsStore.set('asset-usd', { userId: OWNER, type: 'etf', currency: 'USD', quantity: 10 });
    mocks.ledgerAssets = [{ id: 'asset-usd', type: 'etf', quantity: 10 }];
    // 10 units at 100 USD/quota, but the trade-date rate made it 90 EUR/quota.
    seedTrade('asset-usd', 't1', { type: 'buy', date: new Date(2026, 0, 5), quantity: 10, pricePerUnit: 100, priceEur: 90 });

    const result = await backfillAverageCostEur(OWNER);

    expect(result).toEqual({ recomputedAssetCount: 1 });
    const asset = mocks.assetsStore.get('asset-usd')!;
    expect(asset.quantity).toBe(10);
    expect(asset.averageCost).toBe(100); // native PMC, unchanged
    expect(asset.averageCostEur).toBe(90); // the field this backfill exists to add
    expect(mocks.metaStore.get(OWNER)!.averageCostEurBackfilledAt).toBeInstanceOf(Date);
    expect(mocks.invalidate).toHaveBeenCalledWith(OWNER, 'average_cost_eur_backfilled');
  });

  it('skips a ledger asset with no trades and never touches holdingStartDate', async () => {
    seedMeta();
    mocks.assetsStore.set('asset-empty', {
      userId: OWNER,
      type: 'etf',
      currency: 'EUR',
      quantity: 5,
      holdingStartDate: new Date(2020, 0, 1),
    });
    mocks.ledgerAssets = [{ id: 'asset-empty', type: 'etf', quantity: 5 }];
    // No matching trade docs seeded — the by-asset query comes back empty.

    const result = await backfillAverageCostEur(OWNER);

    expect(result).toEqual({ recomputedAssetCount: 0 });
    const asset = mocks.assetsStore.get('asset-empty')!;
    expect(asset.averageCostEur).toBeUndefined();
    expect(asset.holdingStartDate).toEqual(new Date(2020, 0, 1));
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('is idempotent: re-running after a successful backfill is a no-op', async () => {
    seedMeta();
    mocks.assetsStore.set('asset-usd', { userId: OWNER, type: 'etf', currency: 'USD', quantity: 10 });
    mocks.ledgerAssets = [{ id: 'asset-usd', type: 'etf', quantity: 10 }];
    seedTrade('asset-usd', 't1', { type: 'buy', date: new Date(2026, 0, 5), quantity: 10, pricePerUnit: 100, priceEur: 90 });

    await backfillAverageCostEur(OWNER);
    mocks.invalidate.mockClear();
    const second = await backfillAverageCostEur(OWNER);

    expect(second).toEqual({ alreadyBackfilled: true });
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
