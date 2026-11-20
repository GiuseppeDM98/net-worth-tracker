/**
 * Tests for lib/helpers/priceUpdater.ts — the daily price update, with the Admin SDK and Yahoo mocked.
 *
 * An empty ticker never reaches Yahoo (2026-11-20): an instrument the Consulente's click creates
 * without a symbol has `autoUpdatePrice: false`, but the guard holds for any source. Mutation that turns
 * it red: drop the `ticker.trim() !== ''` filter where the tickers are collected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const assetDocs: Array<Record<string, unknown>> = [];
const getMultipleQuotes = vi.fn(async (tickers: string[]) => new Map(tickers.map((t) => [t, { ticker: t, price: 10, currency: 'EUR' }])));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({
        get: async () => ({
          empty: assetDocs.length === 0,
          docs: assetDocs.map((data) => ({ id: data.id as string, data: () => data })),
        }),
      }),
      doc: () => ({ update: vi.fn(async () => undefined) }),
    }),
  },
}));
vi.mock('@/lib/services/yahooFinanceService', () => ({
  getMultipleQuotes: (tickers: string[]) => getMultipleQuotes(tickers),
  getQuote: vi.fn(),
  shouldUpdatePrice: () => true,
}));
vi.mock('@/lib/services/borsaItalianaBondScraperService', () => ({ getBondPriceByIsin: vi.fn() }));
vi.mock('@/lib/services/currencyConversionService', () => ({ convertToEur: vi.fn() }));

import { updateUserAssetPrices } from '@/lib/helpers/priceUpdater';

beforeEach(() => {
  assetDocs.length = 0;
  getMultipleQuotes.mockClear();
});

describe('updateUserAssetPrices — the tickers sent to Yahoo', () => {
  it('never sends an empty ticker', async () => {
    assetDocs.push(
      { id: 'a1', userId: 'u1', ticker: 'ETFA.MI', type: 'etf', assetClass: 'equity', quantity: 1, currentPrice: 1 },
      { id: 'a2', userId: 'u1', ticker: '', type: 'etf', assetClass: 'equity', quantity: 0, currentPrice: 0 },
      { id: 'a3', userId: 'u1', ticker: '  ', type: 'etf', assetClass: 'equity', quantity: 0, currentPrice: 0 },
    );
    await updateUserAssetPrices('u1');
    expect(getMultipleQuotes).toHaveBeenCalledTimes(1);
    expect(getMultipleQuotes.mock.calls[0][0]).toEqual(['ETFA.MI']);
  });
});
