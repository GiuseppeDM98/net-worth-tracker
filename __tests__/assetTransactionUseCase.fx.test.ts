import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The trade ledger's use case on an instrument in a foreign currency (2026-11-23): the statement's
 * euro total, the ECB rate of the day, the 25% guard, the edit that resolves the rate again only when
 * something that moves it changed, a euro fee saved before then inside a total typed later, and the
 * settlement account that must be in euro when a trade CHOOSES it.
 *
 * Runs the REAL use case against the in-memory Admin fake of assetTransactionWriteTx.test.ts (copied:
 * a hoisted vi.mock factory cannot be shared across files). The ECB rate is a mock: 0,90 € per dollar
 * unless a test says otherwise.
 */

// ─── In-memory Firestore, keyed by `${collection}/${id}` ────────────────────
// Hoisted so the vi.mock factory (also hoisted) can reference it before the imports run.
const mocks = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  counter: { next: 0 },
  invalidate: vi.fn().mockResolvedValue(undefined),
  // The asset's announced dividends, read and written after the commit (2026-11-23).
  getDividendsByAsset: vi.fn(async (): Promise<unknown[]> => []),
  updateDividend: vi.fn(async () => undefined),
  deleteDividend: vi.fn(async () => undefined),
  // The ECB rate of the trade's day (lib/server/tradeFxService.ts → resolveEcbRateToEur).
  ecb: vi.fn(async (): Promise<{ rate: number; isLatest: boolean } | null> => ({ rate: 0.9, isLatest: false })),
}));
const store = mocks.store;
const docKey = (collection: string, id: string) => `${collection}/${id}`;

vi.mock('server-only', () => ({}));

// FX is network-bound: mock it away. EUR trades → priceEur === pricePerUnit (identity).
vi.mock('@/lib/server/tradeFxService', () => ({
  resolveTradePriceEur: vi.fn(async (_currency: string, pricePerUnit: number) => pricePerUnit),
  resolveEcbRateToEur: (...args: unknown[]) => mocks.ecb(...(args as [])),
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
  // The committed ledger of one asset, read back from the in-memory store as the real reader would.
  getAssetTransactionsForAssetAdmin: vi.fn(async (userId: string, assetId: string) =>
    [...mocks.store.entries()]
      .filter(([k, v]) => k.startsWith('assetTransactions/') && v.userId === userId && v.assetId === assetId)
      .map(([k, v]) => ({ ...v, id: k.split('/')[1] }))
  ),
}));

vi.mock('@/lib/services/dividendService', () => ({
  getDividendsByAsset: (...args: unknown[]) => mocks.getDividendsByAsset(...(args as [])),
  updateDividend: (...args: unknown[]) => mocks.updateDividend(...(args as [])),
  deleteDividend: (...args: unknown[]) => mocks.deleteDividend(...(args as [])),
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

import {
  createAssetTransaction,
  updateAssetTransaction,
} from '@/lib/server/assetTransactionUseCase';
import { describeTotalOff } from '@/lib/utils/tradeFx';
import { roundToCents } from '@/lib/utils/cents';

const OWNER = 'owner-1';
const TRADE_DAY = new Date('2026-11-10T12:00:00Z');
const STORED_AT = new Date('2026-11-10T13:00:00Z');

function seedMeta() {
  store.set(docKey('assetTransactionsMeta', OWNER), { userId: OWNER, baselineDate: new Date('2024-01-01T12:00:00Z') });
}
function seedAsset(overrides: Record<string, unknown> = {}) {
  store.set(docKey('assets', 'asset-1'), {
    userId: OWNER, type: 'stock', assetClass: 'equity', currency: 'USD', ticker: 'ORNI', quantity: 0, ...overrides,
  });
}
function seedCash(id: string, quantity: number, currency?: string) {
  store.set(docKey('assets', id), { userId: OWNER, assetClass: 'cash', type: 'cash', quantity, ...(currency ? { currency } : {}) });
}
function seedFeeCategory() {
  store.set(docKey('assetAllocationTargets', OWNER), { transferFeeCategoryId: 'cat-fee' });
  store.set(docKey('expenseCategories', 'cat-fee'), { userId: OWNER, name: 'Commissioni', type: 'variable', subCategories: [] });
}
/** A stored buy of 10 at 50 USD settled on cash-1, with what the test gives it. */
function seedTrade(id: string, overrides: Record<string, unknown> = {}) {
  store.set(docKey('assetTransactions', id), {
    userId: OWNER, assetId: 'asset-1', type: 'buy', date: TRADE_DAY, quantity: 10,
    pricePerUnit: 50, priceEur: 45, linkedCashAssetId: 'cash-1',
    createdAt: STORED_AT, updatedAt: STORED_AT, ...overrides,
  });
}
const trade = (id: string) => store.get(docKey('assetTransactions', id))!;
const cash = (id: string) => store.get(docKey('assets', id))!.quantity as number;
const feeRows = () => [...store.entries()].filter(([k]) => k.startsWith('expenses/'));
const BUY = { assetId: 'asset-1', type: 'buy' as const, date: TRADE_DAY, quantity: 10, pricePerUnit: 50 };

async function refusalOf(run: Promise<unknown>): Promise<{ status: number; userMessage: string }> {
  try {
    await run;
  } catch (error) {
    return error as { status: number; userMessage: string };
  }
  throw new Error('expected a refusal');
}

beforeEach(() => {
  store.clear();
  mocks.counter.next = 0;
  mocks.ecb.mockReset().mockResolvedValue({ rate: 0.9, isLatest: false });
  mocks.getDividendsByAsset.mockReset().mockResolvedValue([]);
  seedMeta();
});

describe('a create on a USD instrument', () => {
  it('T1: stores the six fields, debits exactly the total, files the euro fee and answers the euro figures', async () => {
    seedAsset();
    seedCash('cash-1', 10000);
    seedFeeCategory();

    const result = await createAssetTransaction(OWNER, { ...BUY, feesNative: 5, settledTotalEur: 460, linkedCashAssetId: 'cash-1' });

    const stored = trade(result.transactionId);
    expect(stored).toMatchObject({ fees: 4.55, feesNative: 5, settledTotalEur: 460, fxSource: 'statement' });
    expect(stored.fxRate).toBeCloseTo(460 / 505, 12);
    expect(roundToCents(10 * (stored.priceEur as number) + 4.55)).toBe(460);
    expect(cash('cash-1')).toBe(9540);
    const rows = feeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toMatchObject({ amount: -4.55, feeOfTradeId: result.transactionId });
    expect(result.priceEur).toBe(stored.priceEur);
    expect(result.feesEur).toBe(4.55);
  });

  it('T1: credits a sale with its total minus the withheld tax', async () => {
    seedAsset({ quantity: 10 });
    seedCash('cash-1', 1000);
    seedTrade('t0', { linkedCashAssetId: undefined });

    await createAssetTransaction(OWNER, {
      ...BUY, type: 'sell', pricePerUnit: 100, settledTotalEur: 900, withheldTaxEur: 20, linkedCashAssetId: 'cash-1',
    });

    expect(cash('cash-1')).toBe(1880);
  });

  it('T2: without a total converts at the ECB rate and says so', async () => {
    seedAsset();

    const result = await createAssetTransaction(OWNER, { ...BUY, feesNative: 5 });

    expect(trade(result.transactionId)).toMatchObject({ fxSource: 'ecb', fxRate: 0.9, fees: 4.5, feesNative: 5 });
    expect(trade(result.transactionId).priceEur).toBeCloseTo(45, 12);
    expect('settledTotalEur' in trade(result.transactionId)).toBe(false);
  });

  it('T3: refuses a total off the day rate with the sentence that shows it', async () => {
    seedAsset();

    const refusal = await refusalOf(createAssetTransaction(OWNER, { ...BUY, settledTotalEur: 46 }));

    expect(refusal.status).toBe(422);
    expect(refusal.userMessage).toBe(describeTotalOff('USD', 0.9));
  });

  it('T3: refuses a native fee on an EUR instrument', async () => {
    seedAsset({ currency: 'EUR' });

    const refusal = await refusalOf(createAssetTransaction(OWNER, { ...BUY, feesNative: 5 }));

    expect(refusal.status).toBe(422);
    expect(refusal.userMessage).toBe('Commissione in valuta e totale in euro valgono solo per uno strumento in valuta.');
  });
});

describe('an edit of a USD trade (T4)', () => {
  const STATEMENT = { feesNative: 5, settledTotalEur: 460, fees: 4.55, fxRate: 460 / 505, fxSource: 'statement', priceEur: 45.545 };

  it('keeps the rate when every field comes back unchanged but the note, reading no rate', async () => {
    seedAsset({ quantity: 10 });
    seedCash('cash-1', 9540);
    seedTrade('t1', STATEMENT);

    await updateAssetTransaction(OWNER, 't1', {
      type: 'buy', date: new Date(TRADE_DAY.getTime()), quantity: 10, pricePerUnit: 50,
      feesNative: 5, settledTotalEur: 460, linkedCashAssetId: 'cash-1', note: 'fenicottero',
    });

    expect(mocks.ecb).not.toHaveBeenCalled();
    expect(trade('t1')).toMatchObject({ ...STATEMENT, note: 'fenicottero' });
    expect(cash('cash-1')).toBe(9540);
  });

  it('resolves the rate again when the quantity changes', async () => {
    seedAsset({ quantity: 10 });
    seedCash('cash-1', 9540);
    seedTrade('t1', STATEMENT);

    await updateAssetTransaction(OWNER, 't1', { quantity: 9, feesNative: 5, settledTotalEur: 460 });

    expect(mocks.ecb).toHaveBeenCalledTimes(1);
    expect(trade('t1').fxRate).toBeCloseTo(460 / 455, 12);
    expect(cash('cash-1')).toBe(9540);
  });

  it('falls back to the ECB rate and deletes the total when it is cleared', async () => {
    seedAsset({ quantity: 10 });
    seedCash('cash-1', 9540);
    seedTrade('t1', STATEMENT);

    await updateAssetTransaction(OWNER, 't1', { settledTotalEur: null });

    expect('settledTotalEur' in trade('t1')).toBe(false);
    expect(trade('t1')).toMatchObject({ fxSource: 'ecb', fxRate: 0.9, fees: 4.5 });
  });

  describe('a trade saved with a euro fee of 5', () => {
    const LEGACY = { fees: 5, priceEur: 45 };

    it('keeps the euro fee when the quantity changes, and writes no fee row', async () => {
      seedAsset({ quantity: 10 });
      seedCash('cash-1', 9545);
      seedFeeCategory();
      seedTrade('t1', LEGACY);

      await updateAssetTransaction(OWNER, 't1', { quantity: 8 });

      expect(trade('t1').fees).toBe(5);
      expect(feeRows()).toHaveLength(0);
    });

    it('takes a total typed alone as including that fee: the account moves by exactly the total', async () => {
      seedAsset({ quantity: 10 });
      seedCash('cash-1', 9545); // 10 × 45 + 5 debited at the time
      seedTrade('t1', LEGACY);

      await updateAssetTransaction(OWNER, 't1', { settledTotalEur: 460 });

      expect(trade('t1').fxRate).toBeCloseTo(455 / 500, 12);
      expect(trade('t1').fees).toBe(5);
      expect(cash('cash-1')).toBe(10000 - 460);
    });

    it('replaces the euro fee with the conversion of a native fee typed over it', async () => {
      seedAsset({ quantity: 10 });
      seedCash('cash-1', 9545);
      seedTrade('t1', LEGACY);

      await updateAssetTransaction(OWNER, 't1', { feesNative: 6 });

      expect(trade('t1')).toMatchObject({ feesNative: 6, fees: 5.4, fxSource: 'ecb' });
    });
  });

  it('gives an adjustment the rate and its source, and no fee field', async () => {
    seedAsset({ quantity: 10 });
    seedTrade('t0', { linkedCashAssetId: undefined });

    const result = await createAssetTransaction(OWNER, { ...BUY, type: 'adjustment', quantity: 12, pricePerUnit: 40 });

    const stored = trade(result.transactionId);
    expect(stored).toMatchObject({ fxRate: 0.9, fxSource: 'ecb' });
    expect(stored.priceEur).toBeCloseTo(36, 12);
    expect(['fees', 'feesNative', 'settledTotalEur'].some((k) => k in stored)).toBe(false);
  });

  it('stores none of the four fields on an edited opening position', async () => {
    seedAsset({ quantity: 10 });
    seedTrade('b1', { isBaseline: true, linkedCashAssetId: undefined, priceEur: 44 });

    await updateAssetTransaction(OWNER, 'b1', { quantity: 10, pricePerUnit: 60, note: 'ornitorinco' });

    const stored = trade('b1');
    expect(stored.priceEur).toBeCloseTo(54, 12);
    expect(['fxRate', 'fxSource', 'feesNative', 'settledTotalEur'].some((k) => k in stored)).toBe(false);
  });
});

describe('the settlement account must be in euro when a trade chooses it (T5)', () => {
  it('refuses a create settled on a USD account', async () => {
    seedAsset();
    seedCash('cash-usd', 1000, 'USD');

    const refusal = await refusalOf(createAssetTransaction(OWNER, { ...BUY, linkedCashAssetId: 'cash-usd' }));

    expect(refusal.status).toBe(422);
    expect(refusal.userMessage).toBe('Il conto di regolamento deve essere in euro.');
  });

  it('accepts an edit that keeps a USD account and changes the note', async () => {
    seedAsset({ quantity: 10 });
    seedCash('cash-usd', 1000, 'USD');
    seedTrade('t1', { linkedCashAssetId: 'cash-usd' });

    await updateAssetTransaction(OWNER, 't1', { linkedCashAssetId: 'cash-usd', note: 'ornitorinco' });

    expect(trade('t1').note).toBe('ornitorinco');
  });

  it('refuses an edit that moves the trade to another USD account', async () => {
    seedAsset({ quantity: 10 });
    seedCash('cash-usd', 1000, 'USD');
    seedCash('cash-usd-2', 1000, 'USD');
    seedTrade('t1', { linkedCashAssetId: 'cash-usd' });

    const refusal = await refusalOf(updateAssetTransaction(OWNER, 't1', { linkedCashAssetId: 'cash-usd-2' }));

    expect(refusal.status).toBe(422);
    expect(refusal.userMessage).toBe('Il conto di regolamento deve essere in euro.');
  });
});
