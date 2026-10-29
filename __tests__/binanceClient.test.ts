import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  BinanceConfigError,
  BinanceReadError,
  readBinanceBalances,
  readBinanceKlines,
  readBinancePrices,
} from '@/lib/server/binanceClient';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

describe('binanceClient', () => {
  beforeEach(() => {
    vi.stubEnv('BINANCE_API_KEY', 'key');
    vi.stubEnv('BINANCE_API_SECRET', 'secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('refuses to run without credentials, with a message the tile can show', async () => {
    vi.stubEnv('BINANCE_API_KEY', '');
    await expect(readBinanceBalances()).rejects.toBeInstanceOf(BinanceConfigError);
  });

  it('signs a read and sends the key as a header, never in the URL', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ balances: [] }));
    await Promise.allSettled([readBinanceBalances()]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/v3/account?');
    expect(String(url)).toMatch(/signature=[0-9a-f]{64}/);
    expect(String(url)).not.toContain('key');
    expect((init as RequestInit).headers).toEqual({ 'X-MBX-APIKEY': 'key' });
  });

  it('signs a retry afresh: a reused timestamp falls outside recvWindow', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({}, 429, { 'Retry-After': '5' }))
      .mockResolvedValue(json({ balances: [] }));
    const pending = readBinanceBalances();
    await vi.advanceTimersByTimeAsync(6_000);
    await pending;
    const stamp = (call: number) => new URL(String(fetchMock.mock.calls[call][0])).searchParams.get('timestamp');
    expect(stamp(1)).not.toBe(stamp(0));
  });

  it('turns a rejected key into a readable 401, and a Funding failure into a warning', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ code: -2015 }, 401));
    await expect(readBinanceBalances()).rejects.toMatchObject({ status: 401 });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/v3/account')) return json({ balances: [] });
      if (url.includes('get-funding-asset')) return json({ code: -1 }, 500);
      return json({ rows: [], total: 0 });
    });
    const result = await readBinanceBalances();
    expect(result.funding).toBeNull();
    expect(result.warnings.join(' ')).toContain('Funding');
  });

  it('reads prices as a symbol map without a key', async () => {
    vi.stubEnv('BINANCE_API_KEY', '');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json([{ symbol: 'BTCEUR', price: '60000.5' }, { symbol: 'BAD', price: 'x' }])
    );
    await expect(readBinancePrices()).resolves.toEqual({ BTCEUR: 60000.5 });
  });

  it('keeps BinanceReadError distinguishable', () => {
    expect(new BinanceReadError('x', 502).status).toBe(502);
  });

  it('steps over an unlisted symbol (400) but refuses a PARTIAL kline read (5xx)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ code: -1121 }, 400));
    await expect(readBinanceKlines(['FOOEUR'])).resolves.toEqual({ FOOEUR: {} });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}, 503));
    await expect(readBinanceKlines(['BTCEUR'])).rejects.toBeInstanceOf(BinanceReadError);
  });
});
