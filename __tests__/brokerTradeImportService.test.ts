/**
 * Tests for the SERVER half of the broker trade import: the preview join and the write.
 *
 * The pure planner and the parsers are covered in `brokerTradeImport.test.ts`, and the ledger's
 * own atomic idempotency in `brokerTradeIdempotency.test.ts`. What is left untested until now is
 * the seam between them, and that seam is where the dangerous decisions live:
 *
 * - the plan is built from the CURRENT ledger (assets + existing trades + baselines), not from
 *   anything the client asserted;
 * - `apply` carries the BROKER's ids, so a client cannot smuggle in a transaction of its own
 *   invention — and an id the plan no longer offers writes nothing;
 * - an empty `apply` writes nothing at all;
 * - one row failing does not lose the other forty (the whole point on a ten-year history).
 *
 * The repository and the use case are mocked, so these are tests of the DECISIONS this service
 * makes, not of Firestore.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUserAssetsAdmin: vi.fn(),
  getAssetTransactionsAdmin: vi.fn(),
  createAssetTransaction: vi.fn(),
  batchDelete: vi.fn(),
  batchCommit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({ doc: (id: string) => ({ name, id }) }),
    batch: () => ({ delete: mocks.batchDelete, commit: mocks.batchCommit }),
  },
}));
vi.mock('@/lib/server/assetAdminRepository', () => ({
  getUserAssetsAdmin: mocks.getUserAssetsAdmin,
  getAssetTransactionsAdmin: mocks.getAssetTransactionsAdmin,
}));
vi.mock('@/lib/server/assetTransactionUseCase', () => ({
  createAssetTransaction: mocks.createAssetTransaction,
  DuplicateBrokerTradeError: class DuplicateBrokerTradeError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'DuplicateBrokerTradeError';
    }
  },
}));

import {
  buildBrokerTradePreview,
  importBrokerTrades,
  type BrokerTradesPayload,
} from '@/lib/server/brokerTradeImportService';

const ASSET = { id: 'asset-1', isin: 'IE00BD4TXV59', name: 'UBS Core MSCI World', type: 'etf' as const };

/** A real Scalable transaction list row plus its detail, joined as the CLI reader delivers them. */
function scalablePayload(id: string, date: string, isin = 'IE00BD4TXV59'): BrokerTradesPayload {
  return {
    list: {
      items: [
        {
          id,
          isin,
          description: 'UBS Core MSCI World (Acc)',
          amount: 127.255605,
          currency: 'EUR',
          last_event_datetime: date,
          side: 'BUY',
          status: 'SETTLED',
          type: 'SECURITY_TRANSACTION',
        },
      ],
    },
    details: {
      [id]: {
        id,
        security: { isin, name: 'UBS Core MSCI World (Acc)', security_type: 'ETF' },
        security_trade: {
          average_price: 39.29,
          number_of_shares: { filled: 3.24, total: 3.24 },
          total_amount: 127.29,
          side: 'BUY',
          status: 'FINAL_FILL',
          trade_transaction_amounts: { transaction_fee: 1.0, tax_amount: null, venue_fee: null },
        },
      },
    },
  };
}

describe('buildBrokerTradePreview', () => {
  beforeEach(() => {
    mocks.getUserAssetsAdmin.mockReset().mockResolvedValue([ASSET]);
    mocks.getAssetTransactionsAdmin.mockReset().mockResolvedValue([]);
  });

  it('joins a broker trade to the tracked asset by ISIN and offers it', async () => {
    const preview = await buildBrokerTradePreview(
      'owner-1',
      'scalable',
      scalablePayload('q9Yc4BSHp85cafCe2jRpKD', '2026-09-14T10:33:06.128Z')
    );
    expect(preview.source).toBe('scalable');
    expect(preview.toImport).toHaveLength(1);
    expect(preview.toImport[0].assetId).toBe(ASSET.id);
    expect(preview.skipped).toHaveLength(0);
  });

  it('refuses a trade whose ISIN is not in Portafoglio, instead of inventing an asset', async () => {
    const preview = await buildBrokerTradePreview(
      'owner-1',
      'scalable',
      scalablePayload('x1', '2026-09-14T10:33:06.128Z', 'IE0000000000')
    );
    expect(preview.toImport).toHaveLength(0);
    expect(preview.skipped[0].reason).toBe('asset-not-found');
  });

  it('refuses an asset the ledger does not manage, like a bank account', async () => {
    mocks.getUserAssetsAdmin.mockResolvedValue([{ ...ASSET, type: 'cash' }]);
    const preview = await buildBrokerTradePreview(
      'owner-1',
      'scalable',
      scalablePayload('x2', '2026-09-14T10:33:06.128Z')
    );
    expect(preview.skipped[0].reason).toBe('asset-not-ledger');
  });

  it('uses the asset\'s OWN baseline as the floor, not the migration date in the meta doc', async () => {
    // `assetTransactionsMeta.baselineDate` is the migration day shared by every asset; using it as
    // a floor silently rejected every real pre-migration trade (2026-09-13 made that correction).
    mocks.getAssetTransactionsAdmin.mockResolvedValue([
      { assetId: ASSET.id, date: new Date('2024-03-28T00:00:00.000Z'), isBaseline: true, source: undefined, sourceRef: undefined },
      { assetId: ASSET.id, date: new Date('2025-01-05T00:00:00.000Z'), isBaseline: false, source: undefined, sourceRef: undefined },
    ]);
    const after = await buildBrokerTradePreview(
      'owner-1',
      'scalable',
      scalablePayload('after', '2025-06-01T00:00:00.000Z')
    );
    expect(after.toImport).toHaveLength(1);

    const before = await buildBrokerTradePreview(
      'owner-1',
      'scalable',
      scalablePayload('before', '2023-12-01T00:00:00.000Z')
    );
    expect(before.toImport).toHaveLength(0);
    expect(before.skipped[0].reason).toBe('before-baseline');
  });

  it('reports an already imported row separately, never as something to write', async () => {
    mocks.getAssetTransactionsAdmin.mockResolvedValue([
      { assetId: 'asset-1', source: 'scalable', sourceRef: 'q9Yc4BSHp85cafCe2jRpKD' },
    ]);
    const preview = await buildBrokerTradePreview(
      'owner-1',
      'scalable',
      scalablePayload('q9Yc4BSHp85cafCe2jRpKD', '2026-09-14T10:33:06.128Z')
    );
    expect(preview.toImport).toHaveLength(0);
    expect(preview.alreadyImported).toHaveLength(1);
    expect(preview.alreadyImported[0].status).toBe('already-imported');
  });

  it('does not count a row of a deleted asset as already imported', async () => {
    mocks.getAssetTransactionsAdmin.mockResolvedValue([
      { id: 'tx-orphan', assetId: 'deleted-asset', source: 'scalable', sourceRef: 'q9Yc4BSHp85cafCe2jRpKD' },
    ]);
    const preview = await buildBrokerTradePreview(
      'owner-1',
      'scalable',
      scalablePayload('q9Yc4BSHp85cafCe2jRpKD', '2026-09-14T10:33:06.128Z')
    );
    expect(preview.toImport).toHaveLength(1);
    expect(preview.alreadyImported).toHaveLength(0);
  });
});

describe('importBrokerTrades', () => {
  beforeEach(() => {
    mocks.getUserAssetsAdmin.mockReset().mockResolvedValue([ASSET]);
    mocks.getAssetTransactionsAdmin.mockReset().mockResolvedValue([]);
    mocks.createAssetTransaction.mockReset().mockResolvedValue({ id: 'tx-1' });
  });

  it('deletes the broker\'s orphan rows before importing, and only those', async () => {
    mocks.batchDelete.mockReset();
    mocks.batchCommit.mockReset().mockResolvedValue(undefined);
    mocks.getAssetTransactionsAdmin.mockResolvedValue([
      { id: 'orphan', assetId: 'deleted-asset', source: 'scalable', sourceRef: 'old' },
      { id: 'live', assetId: 'asset-1', source: 'scalable', sourceRef: 'kept' },
      { id: 'manual-orphan', assetId: 'deleted-asset' },
      { id: 'other-broker', assetId: 'deleted-asset', source: 'traderepublic', sourceRef: 'x' },
    ]);
    await importBrokerTrades('owner-1', 'scalable', scalablePayload('q9Yc4BSHp85cafCe2jRpKD', '2026-09-14T10:33:06.128Z'), []);
    expect(mocks.batchDelete).toHaveBeenCalledTimes(1);
    expect(mocks.batchDelete.mock.calls[0][0]).toEqual({ name: 'assetTransactions', id: 'orphan' });
    expect(mocks.batchCommit).toHaveBeenCalledTimes(1);
  });

  it('writes each approved row through the ledger use case, carrying its provenance', async () => {
    const result = await importBrokerTrades(
      'owner-1',
      'scalable',
      scalablePayload('abc123', '2026-09-14T10:33:06.128Z'),
      ['abc123']
    );
    expect(result).toMatchObject({ imported: 1, duplicates: 0, failed: [] });
    expect(mocks.createAssetTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.createAssetTransaction.mock.calls[0][0]).toBe('owner-1');
    expect(mocks.createAssetTransaction.mock.calls[0][1]).toMatchObject({
      assetId: ASSET.id,
      type: 'buy',
      quantity: 3.24,
      source: 'scalable',
      sourceRef: 'abc123',
    });
  });

  it('writes nothing when the approved list is empty', async () => {
    // An empty `apply` is an explicit «write nothing», distinct from a missing one (= preview).
    const result = await importBrokerTrades('owner-1', 'scalable', scalablePayload('abc123', '2026-09-14T10:33:06.128Z'), []);
    expect(result).toMatchObject({ imported: 0, failed: [] });
    expect(mocks.createAssetTransaction).not.toHaveBeenCalled();
  });

  it('writes nothing for an id the broker history does not contain', async () => {
    // The approval is the BROKER's id: the client cannot smuggle in a transaction of its own
    // invention, and an id it simply made up resolves to no row.
    const result = await importBrokerTrades(
      'owner-1',
      'scalable',
      scalablePayload('abc123', '2026-09-14T10:33:06.128Z'),
      ['forged-id']
    );
    expect(result.imported).toBe(0);
    expect(mocks.createAssetTransaction).not.toHaveBeenCalled();
  });

  it('sums the realized P&L of the imported sells, in euros', async () => {
    mocks.createAssetTransaction.mockResolvedValue({ id: 'tx-1', realizedPnlEur: -120.5 });
    const result = await importBrokerTrades(
      'owner-1',
      'scalable',
      scalablePayload('sell1', '2026-09-14T10:33:06.128Z'),
      ['sell1']
    );
    expect(result.realizedPnlEur).toBe(-120.5);
  });

  it('counts a concurrent duplicate instead of failing the sync', async () => {
    const { DuplicateBrokerTradeError } = await import('@/lib/server/assetTransactionUseCase');
    mocks.createAssetTransaction.mockRejectedValue(
      new DuplicateBrokerTradeError('Operazione già importata da una sincronizzazione concorrente.')
    );
    const result = await importBrokerTrades(
      'owner-1',
      'scalable',
      scalablePayload('abc123', '2026-09-14T10:33:06.128Z'),
      ['abc123']
    );
    expect(result).toMatchObject({ imported: 0, duplicates: 1, failed: [] });
  });

  it('keeps going past one failure and reports it with the ledger\'s own message', async () => {
    // The realistic failure on a ten-year history: a sell whose lots predate the baseline. Losing
    // the other forty operations to it would make the feature useless on exactly the accounts that
    // need it, and re-running is safe because the import is idempotent.
    const buy = scalablePayload('ok1', '2026-09-14T10:33:06.128Z');
    const sell = scalablePayload('second', '2026-09-20T10:33:06.128Z');
    const sellDetail = (sell.details.second as { security_trade: Record<string, unknown> });
    sellDetail.security_trade.side = 'SELL';
    const payload: BrokerTradesPayload = {
      list: {
        items: [
          ...(buy.list as { items: Record<string, unknown>[] }).items,
          ...(sell.list as { items: Record<string, unknown>[] }).items,
        ],
      },
      details: { ...buy.details, ...sell.details },
    };

    mocks.createAssetTransaction
      .mockResolvedValueOnce({ id: 'tx-1' })
      .mockRejectedValueOnce(new Error('Nessun lotto disponibile per la vendita.'));

    const result = await importBrokerTrades('owner-1', 'scalable', payload, ['ok1', 'second']);
    expect(result.imported).toBe(1);
    expect(result.failed).toEqual([
      { sourceRef: 'second', message: 'Nessun lotto disponibile per la vendita.' },
    ]);
  });
});

describe('Binance balance reconciliation', () => {
  const COIN_ASSET = {
    id: 'btc', name: 'BTC', type: 'crypto' as const, ticker: 'BTC-EUR', exchange: 'Binance',
    quantity: 1, averageCost: 100, currentPrice: 200,
  };

  beforeEach(() => {
    mocks.getUserAssetsAdmin.mockReset().mockResolvedValue([COIN_ASSET]);
    mocks.getAssetTransactionsAdmin.mockReset().mockResolvedValue([
      { id: 't1', assetId: 'btc', date: new Date('2024-05-01T10:00:00Z'), source: 'binance', sourceRef: 'x' },
    ]);
    mocks.createAssetTransaction.mockReset().mockResolvedValue({ id: 'adj' });
    mocks.batchCommit.mockReset();
  });

  const payload = (heldBalances: Record<string, number>): BrokerTradesPayload => ({
    list: { spotTrades: [], convert: [], fiatBuys: [], dust: [], earnRewards: [], klines: {}, heldBalances },
    details: {},
  });

  it('adds one adjustment to the real balance, blending covered cost with today\'s price', async () => {
    const result = await importBrokerTrades('owner-1', 'binance', payload({ BTC: 3 }), []);
    expect(result.reconciled).toBe(1);
    const call = mocks.createAssetTransaction.mock.calls[0][1];
    expect(call).toMatchObject({ assetId: 'btc', type: 'adjustment', quantity: 3, source: 'binance' });
    expect(call.date).toEqual(new Date('2024-05-01T10:00:00Z'));
    // (1 * 100 + 2 * 200) / 3
    expect(call.pricePerUnit).toBeCloseTo(166.6667, 3);
  });

  it('adds nothing when the ledger already holds the balance, or more', async () => {
    expect((await importBrokerTrades('owner-1', 'binance', payload({ BTC: 1 }), [])).reconciled).toBe(0);
    expect((await importBrokerTrades('owner-1', 'binance', payload({ BTC: 0.5 }), [])).reconciled).toBe(0);
    expect(mocks.createAssetTransaction).not.toHaveBeenCalled();
  });

  it('skips a coin with no trades at all, and never reconciles other brokers', async () => {
    mocks.getAssetTransactionsAdmin.mockResolvedValue([]);
    expect((await importBrokerTrades('owner-1', 'binance', payload({ BTC: 3 }), [])).reconciled).toBe(0);
    const scalable = await importBrokerTrades('owner-1', 'scalable', scalablePayload('a', '2026-09-14T10:33:06.128Z'), []);
    expect(scalable.reconciled).toBeUndefined();
  });
});
