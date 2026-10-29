/**
 * Contract test for POST /api/broker/binance/read.
 *
 * The tile reads `holdings` and refuses a response without it: the same contract break that once
 * made the Scalable preview show ZERO positions while reporting a successful sync. The response
 * shape, the per-coin summing, the EUR pricing and the Yahoo verification are pinned here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  readBinanceBalances: vi.fn(),
  readBinancePrices: vi.fn(),
  getMultipleQuotes: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/server/apiAuth', () => ({
  requireFirebaseAuth: vi.fn(async () => ({ uid: 'owner-1', email: 'rykymai@gmail.com' })),
  assertCanAccessAccount: vi.fn(async () => undefined),
  getApiAuthErrorResponse: vi.fn(() => null),
}));
vi.mock('@/lib/services/yahooFinanceService', () => ({ getMultipleQuotes: mocks.getMultipleQuotes }));
vi.mock('@/lib/server/binanceClient', async () => {
  class BinanceConfigError extends Error {
    constructor() {
      super('Collegamento Binance non configurato: imposta le chiavi sul server.');
    }
  }
  class BinanceReadError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return {
    BinanceConfigError,
    BinanceReadError,
    readBinanceBalances: mocks.readBinanceBalances,
    readBinancePrices: mocks.readBinancePrices,
  };
});

async function post(): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import('@/app/api/broker/binance/read/route');
  const response = await POST(
    new NextRequest('http://localhost/api/broker/binance/read', {
      method: 'POST',
      body: JSON.stringify({ ownerId: 'owner-1' }),
    })
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('POST /api/broker/binance/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readBinancePrices.mockResolvedValue({ BTCEUR: 60000, AAAEUR: 2 });
    mocks.readBinanceBalances.mockResolvedValue({
      spot: { balances: [{ asset: 'BTC', free: '0.5', locked: '0' }, { asset: 'AAA', free: '100', locked: '0' }] },
      funding: [{ asset: 'BTC', free: '0.25', locked: '0' }],
      earn: [],
      warnings: [],
    });
    mocks.getMultipleQuotes.mockResolvedValue(
      new Map([['BTC-EUR', { price: 59990, currency: 'EUR' }]])
    );
  });

  it('answers the coins summed across wallets, priced in EUR, with Yahoo only where verified', async () => {
    const { status, body } = await post();
    expect(status).toBe(200);
    expect(body['holdings']).toEqual([
      { asset: 'AAA', quantity: 100, wallets: ['Spot'], price: 2 },
      { asset: 'BTC', quantity: 0.75, wallets: ['Spot', 'Funding'], price: 60000, yahooTicker: 'BTC-EUR' },
    ]);
  });

  it('refuses a Yahoo quote that is not in EUR', async () => {
    mocks.getMultipleQuotes.mockResolvedValue(new Map([['BTC-EUR', { price: 65000, currency: 'USD' }]]));
    const { body } = await post();
    expect((body['holdings'] as Array<{ asset: string; yahooTicker?: string }>).find((h) => h.asset === 'BTC')?.yahooTicker).toBeUndefined();
  });

  it('carries the wallets that could not be read as warnings, not as an empty wallet', async () => {
    mocks.readBinanceBalances.mockResolvedValue({
      spot: { balances: [] },
      funding: null,
      earn: null,
      warnings: ['Funding non letto: errore'],
    });
    const { body } = await post();
    expect(body['warnings']).toEqual(['Funding non letto: errore']);
  });

  it('answers 503 with the config message when the server has no key', async () => {
    const { BinanceConfigError } = await import('@/lib/server/binanceClient');
    mocks.readBinanceBalances.mockRejectedValue(new BinanceConfigError());
    const { status, body } = await post();
    expect(status).toBe(503);
    expect(body['error']).toContain('non configurato');
  });
});
