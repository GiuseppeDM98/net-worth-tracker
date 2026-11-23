import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration test for the trade-ledger write transaction (assetTransactionUseCase).
 *
 * Runs the REAL use-case transaction body against a fake Admin `runTransaction` whose `tx.get`
 * throws once a write has happened — exactly as the live Firestore SDK does (AGENTS.md § Firestore
 * Writes → `runTransaction`). A regression to interleaved read/write, or a missing pre-read of a touched cash
 * account, would fail here. Template: __tests__/updateCashAssetBalancesAtomic.test.ts.
 *
 * Covers: create with cash settlement, edit moving the settlement to a different cash account (two
 * aggregated deltas), delete reversing the cash, the holdingStartDate: undefined → field-left-
 * untouched rule on the derived asset write, and a trade's fee row written, moved and removed in
 * the trade's own transaction.
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
      const docs: { id: string; ref: unknown; data: () => Record<string, unknown> }[] = [];
      for (const [k, value] of store) {
        if (!k.startsWith(`${collection}/`)) continue;
        if (filters.every((f) => value[f.field] === f.value)) {
          const id = k.slice(collection.length + 1);
          docs.push({ id, ref: makeDocRef(collection, id), data: () => value });
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
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
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

      const result = await fn(tx);

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
      return result;
    },
  };

  return { adminDb };
});

const invalidateMock = mocks.invalidate;

import {
  createAssetTransaction,
  updateAssetTransaction,
  deleteAssetTransaction,
  deleteAllAssetTransactionsForAsset,
} from '@/lib/server/assetTransactionUseCase';
import { resolveTradePriceEur } from '@/lib/server/tradeFxService';

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
  store.set(docKey('assets', id), { userId: OWNER, assetClass: 'cash', type: 'cash', quantity });
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

    expect(result.derived).toEqual({ quantity: 10, averageCost: 100, averageCostEur: 100 });
    // 10 units × €100 debited from the cash account.
    expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(9000);
    const asset = store.get(docKey('assets', 'asset-1'))!;
    expect(asset.quantity).toBe(10);
    expect(asset.averageCost).toBe(100);
    expect(asset.averageCostEur).toBe(100);
    expect(invalidateMock).toHaveBeenCalledWith(OWNER, 'asset_transaction_created');
  });

  it('stores the settled balance to the cent, without the binary noise of the sum (2026-10-07)', async () => {
    expect(4033.37 - 0.07).not.toBe(4033.3); // the raw sum is noisy
    seedAsset({ quantity: 0 });
    seedCash('cash-1', 4033.37);

    await createAssetTransaction(OWNER, {
      assetId: 'asset-1',
      type: 'buy',
      date: new Date(),
      quantity: 1,
      pricePerUnit: 0.07,
      linkedCashAssetId: 'cash-1',
    });

    expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(4033.3);
  });

  it('writes a EUR-side averageCostEur distinct from the native averageCost for a foreign-currency buy', async () => {
    // A USD trade at 100 USD/quota, but the trade-date rate made it 90 EUR/quota: the native PMC
    // and the EUR PMC must diverge on the asset doc, otherwise G/P math re-mixes the two currencies
    // (the bug this write path exists to prevent).
    vi.mocked(resolveTradePriceEur).mockResolvedValueOnce(90);
    seedAsset({ quantity: 0, currency: 'USD' });
    seedCash('cash-1', 10000);

    const result = await createAssetTransaction(OWNER, {
      assetId: 'asset-1',
      type: 'buy',
      date: new Date(),
      quantity: 10,
      pricePerUnit: 100,
      linkedCashAssetId: 'cash-1',
    });

    expect(result.derived).toEqual({ quantity: 10, averageCost: 100, averageCostEur: 90 });
    const asset = store.get(docKey('assets', 'asset-1'))!;
    expect(asset.averageCost).toBe(100); // native PMC, USD
    expect(asset.averageCostEur).toBe(90); // EUR PMC at the trade-date rate
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

  it('credits a sell net of fees and of the tax the broker withheld, and stores the tax on the trade', async () => {
    seedAsset({ quantity: 10, averageCost: 100 });
    seedCash('cash-1', 1000);
    store.set(docKey('assetTransactions', 'buy-1'), {
      userId: OWNER,
      assetId: 'asset-1',
      type: 'buy',
      date: new Date(2024, 5, 1),
      quantity: 10,
      pricePerUnit: 100,
      priceEur: 100,
      createdAt: new Date(2024, 5, 1),
      updatedAt: new Date(2024, 5, 1),
    });

    const result = await createAssetTransaction(OWNER, {
      assetId: 'asset-1',
      type: 'sell',
      date: new Date(),
      quantity: 10,
      pricePerUnit: 150,
      fees: 5,
      linkedCashAssetId: 'cash-1',
      withheldTaxEur: 128.7,
    });

    // 1500 − 5 − 128,70 reach the account; the realized P&L stays gross of the tax, and fee-free
    // (the sale's fee is a spending row of its own, 2026-11-12).
    expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBeCloseTo(2366.3, 9);
    expect(result.realizedPnlEur).toBeCloseTo(500, 9);
    const sell = [...store.entries()].find(([k, v]) => k.startsWith('assetTransactions/') && v.type === 'sell')![1];
    expect(sell.withheldTaxEur).toBe(128.7);
  });

  it('moves the account by the tax alone when a sell already settled is given one, and gives it back when cleared to 0', async () => {
    seedAsset({ quantity: 10, averageCost: 100 });
    seedCash('cash-1', 1000);
    store.set(docKey('assetTransactions', 'buy-1'), {
      userId: OWNER,
      assetId: 'asset-1',
      type: 'buy',
      date: new Date(2024, 5, 1),
      quantity: 10,
      pricePerUnit: 100,
      priceEur: 100,
      createdAt: new Date(2024, 5, 1),
      updatedAt: new Date(2024, 5, 1),
    });
    const created = await createAssetTransaction(OWNER, {
      assetId: 'asset-1',
      type: 'sell',
      date: new Date(),
      quantity: 10,
      pricePerUnit: 150,
      linkedCashAssetId: 'cash-1',
    });
    expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(2500);

    await updateAssetTransaction(OWNER, created.transactionId, { withheldTaxEur: 130 });
    expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(2370);

    await updateAssetTransaction(OWNER, created.transactionId, { withheldTaxEur: 0 });
    expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(2500);
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

  describe('the fee of a trade as a spending row (2026-11-12)', () => {
    const TRADE_DAY = new Date(2026, 5, 1, 12);
    function seedFeeCategory() {
      store.set(docKey('assetAllocationTargets', OWNER), { transferFeeCategoryId: 'cat-fee' });
      store.set(docKey('expenseCategories', 'cat-fee'), {
        userId: OWNER,
        name: 'Commissioni',
        type: 'variable',
        subCategories: [],
      });
    }
    /** A stored buy of 10 at 100 settled on cash-1, with what the test gives it. */
    function seedTrade(id: string, overrides: Record<string, unknown> = {}) {
      store.set(docKey('assetTransactions', id), {
        userId: OWNER, assetId: 'asset-1', type: 'buy', date: TRADE_DAY, quantity: 10,
        pricePerUnit: 100, priceEur: 100, linkedCashAssetId: 'cash-1',
        createdAt: TRADE_DAY, updatedAt: TRADE_DAY, ...overrides,
      });
    }
    const feeRows = () => [...store.entries()].filter(([k]) => k.startsWith('expenses/'));
    const trade = (id: string) => store.get(docKey('assetTransactions', id))!;
    const buyWithFee = (fees: number) => ({
      assetId: 'asset-1', type: 'buy' as const, date: new Date(), quantity: 10, pricePerUnit: 100, fees,
      linkedCashAssetId: 'cash-1',
    });

    it('commits the fee as a row that moves no account, named by the trade, out of the PMC', async () => {
      seedAsset({ quantity: 0, ticker: 'ORNI' });
      seedCash('cash-1', 10000);
      seedFeeCategory();

      const result = await createAssetTransaction(OWNER, buyWithFee(5));

      const asset = store.get(docKey('assets', 'asset-1'))!;
      expect(asset.averageCostEur).toBe(100);
      expect(asset.fiscalAverageCostEur).toBe(100.5);
      expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(8995); // the fee leaves ONCE
      const rows = feeRows();
      expect(rows).toHaveLength(1);
      const [rowKey, row] = rows[0];
      expect(row).toMatchObject({
        userId: OWNER, type: 'variable', categoryId: 'cat-fee', amount: -5,
        notes: 'Commissione su acquisto di ORNI', feeOfTradeId: result.transactionId,
      });
      expect(row.linkedCashAssetId).toBeUndefined();
      expect(trade(result.transactionId).feeExpenseId).toBe(rowKey.split('/')[1]);
      expect(result.feeRow).toBe('written');
    });

    it('gives the row to the asset’s sole holder, else to the account’s, and never rewrites it on an edit', async () => {
      seedAsset({ quantity: 0, ownerMemberId: 'm1' });
      seedCash('cash-1', 10000);
      seedFeeCategory();
      const own = await createAssetTransaction(OWNER, buyWithFee(5));
      expect(feeRows()[0][1].personalMemberId).toBe('m1');

      store.clear();
      seedMeta();
      seedAsset({ quantity: 0 });
      store.set(docKey('assets', 'cash-1'), { userId: OWNER, assetClass: 'cash', type: 'cash', quantity: 10000, ownerMemberId: 'm2' });
      seedFeeCategory();
      const shared = await createAssetTransaction(OWNER, buyWithFee(5));
      expect(shared.feeRow).toBe('written');
      const rowId = trade(shared.transactionId).feeExpenseId as string;
      expect(store.get(docKey('expenses', rowId))!.personalMemberId).toBe('m2');

      // A member set by hand in the row's form survives a later edit of the trade.
      store.set(docKey('expenses', rowId), { ...store.get(docKey('expenses', rowId))!, personalMemberId: 'm3' });
      await updateAssetTransaction(OWNER, shared.transactionId, { fees: 8 });
      expect(store.get(docKey('expenses', rowId))).toMatchObject({ amount: -8, personalMemberId: 'm3' });
      expect(own.transactionId).not.toBe(shared.transactionId);
    });

    it('writes no row and names none without a fee category, and the trade still goes through', async () => {
      seedAsset({ quantity: 0 });
      seedCash('cash-1', 10000);

      const result = await createAssetTransaction(OWNER, buyWithFee(5));

      expect(feeRows()).toHaveLength(0);
      expect(trade(result.transactionId).feeExpenseId).toBeUndefined();
      expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(8995);
      expect(result.feeRow).toBe('none');
    });

    it('moves the row with the trade’s fee and date, and removes it with the fee', async () => {
      seedAsset({ quantity: 0 });
      seedCash('cash-1', 10000);
      seedFeeCategory();
      const { transactionId } = await createAssetTransaction(OWNER, buyWithFee(5));
      const rowId = trade(transactionId).feeExpenseId as string;

      const newDate = new Date(2026, 4, 15, 12);
      await updateAssetTransaction(OWNER, transactionId, { fees: 8, date: newDate });
      expect(store.get(docKey('expenses', rowId))).toMatchObject({ amount: -8, date: newDate });
      expect(feeRows()).toHaveLength(1);

      await updateAssetTransaction(OWNER, transactionId, { fees: 0 });
      expect(feeRows()).toHaveLength(0);
      expect('feeExpenseId' in trade(transactionId)).toBe(false);
    });

    it('deletes the row with its trade', async () => {
      seedAsset({ quantity: 10, averageCost: 100, averageCostEur: 100 });
      seedCash('cash-1', 8995);
      seedFeeCategory();
      seedTrade('t1', { fees: 5, feeExpenseId: 'fee-1' });
      store.set(docKey('expenses', 'fee-1'), { userId: OWNER, amount: -5, feeOfTradeId: 't1' });

      await deleteAssetTransaction(OWNER, 't1');

      expect(feeRows()).toHaveLength(0);
      expect(store.get(docKey('assets', 'cash-1'))!.quantity).toBe(10000);
    });

    it('never gives a row to a fee saved before fees became rows', async () => {
      seedAsset({ quantity: 10, averageCost: 100, averageCostEur: 100.5 });
      seedCash('cash-1', 8995);
      seedFeeCategory();
      seedTrade('t1', { fees: 5 });

      const result = await updateAssetTransaction(OWNER, 't1', { note: 'ricontrollata' });

      expect(feeRows()).toHaveLength(0);
      expect(trade('t1').feeExpenseId).toBeUndefined();
      expect(store.get(docKey('assets', 'asset-1'))!.averageCostEur).toBe(100); // re-projected without the fee
      expect(result.feeRow).toBe('none');
    });

    it('creates a row when a fee is given to a trade that had none', async () => {
      seedAsset({ quantity: 10, averageCost: 100, averageCostEur: 100 });
      seedCash('cash-1', 9000);
      seedFeeCategory();
      seedTrade('t1');

      await updateAssetTransaction(OWNER, 't1', { fees: 3 });

      const rows = feeRows();
      expect(rows).toHaveLength(1);
      expect(rows[0][1]).toMatchObject({ amount: -3, feeOfTradeId: 't1' });
      expect(trade('t1').feeExpenseId).toBe(rows[0][0].split('/')[1]);
    });

    it('writes no row when the category the settings name is gone, and says so', async () => {
      seedAsset({ quantity: 0 });
      seedCash('cash-1', 10000);
      store.set(docKey('assetAllocationTargets', OWNER), { transferFeeCategoryId: 'cat-gone' });

      const result = await createAssetTransaction(OWNER, buyWithFee(5));

      expect(feeRows()).toHaveLength(0);
      expect(trade(result.transactionId).feeExpenseId).toBeUndefined();
      expect(store.get(docKey('assets', 'asset-1'))!.quantity).toBe(10);
      expect(result.feeRow).toBe('refused');
    });

    it('keeps the trades’ fee rows as plain spending when every trade of the asset is deleted', async () => {
      seedAsset({ quantity: 20 });
      seedTrade('t1', { fees: 5, feeExpenseId: 'fee-1' });
      seedTrade('t2');
      store.set(docKey('expenses', 'fee-1'), { userId: OWNER, amount: -5, feeOfTradeId: 't1' });

      const deleted = await deleteAllAssetTransactionsForAsset(OWNER, 'asset-1');

      expect(deleted).toBe(2);
      expect([...store.keys()].filter((k) => k.startsWith('assetTransactions/'))).toHaveLength(0);
      const row = store.get(docKey('expenses', 'fee-1'))!;
      expect(row.amount).toBe(-5);
      expect('feeOfTradeId' in row).toBe(false);
    });

    it('keeps the link to a named row that is gone, and writes the row there once a category exists', async () => {
      seedAsset({ quantity: 10, averageCost: 100, averageCostEur: 100 });
      seedCash('cash-1', 8995);
      seedTrade('t1', { fees: 5, feeExpenseId: 'fee-1' }); // its row was deleted by some other path

      await updateAssetTransaction(OWNER, 't1', { note: 'prima' });
      expect(trade('t1').feeExpenseId).toBe('fee-1');
      expect(feeRows()).toHaveLength(0);

      seedFeeCategory();
      await updateAssetTransaction(OWNER, 't1', { note: 'dopo' });
      expect(store.get(docKey('expenses', 'fee-1'))).toMatchObject({ amount: -5, feeOfTradeId: 't1' });
    });
  });
});
