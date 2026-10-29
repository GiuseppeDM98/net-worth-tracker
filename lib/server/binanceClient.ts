/**
 * The Binance read surface — signed requests with the server's own API key.
 *
 * WHY A WHITELIST: a Binance key can be created with trading and withdrawal rights, and this client
 * signs whatever it is asked to. The guarantee that a sync only READS is therefore structural, the
 * same posture `tradeRepublicClient.ts` takes: the closed list below is the ONLY thing that can be
 * requested, and adding an entry is the change this file forbids unless it reads. The owner should
 * also create the key with "Enable Reading" alone; this list is the second lock, not the first.
 *
 * The credentials are `BINANCE_API_KEY` / `BINANCE_API_SECRET` in the server environment: one
 * Binance account per deployment (doc/guide/collegamenti.md § Binance). They never reach the
 * client, and no document stores them.
 *
 * Every attempt is signed afresh: a retry after a 429 that reused the first timestamp fell outside
 * `recvWindow` and came back as `-1021`.
 */

import 'server-only';

import { createHmac } from 'node:crypto';

const BASE_URL = process.env.BINANCE_BASE_URL ?? 'https://api.binance.com';
const TIMEOUT_MS = 15_000;
const RECV_WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 6;
/** Longest pause honoured after a 429/418: Binance's weight window is one minute. */
const MAX_BACKOFF_S = 60;
/** Shared by every worker: one 429 pauses the whole scan, not just the call that met it. */
let blockedUntil = 0;

/** The reads, and nothing else. `POST` appears once, for an endpoint Binance defines as a query. */
const READ_ENDPOINTS = {
  spotAccount: { method: 'GET', path: '/api/v3/account', signed: true },
  fundingAssets: { method: 'POST', path: '/sapi/v1/asset/get-funding-asset', signed: true },
  earnFlexible: { method: 'GET', path: '/sapi/v1/simple-earn/flexible/position', signed: true },
  earnLocked: { method: 'GET', path: '/sapi/v1/simple-earn/locked/position', signed: true },
  prices: { method: 'GET', path: '/api/v3/ticker/price', signed: false },
  // The history reads (Importa operazioni). Still queries only: no order, transfer or withdrawal.
  exchangeInfo: { method: 'GET', path: '/api/v3/exchangeInfo', signed: false },
  myTrades: { method: 'GET', path: '/api/v3/myTrades', signed: true },
  klines: { method: 'GET', path: '/api/v3/klines', signed: false },
  convertTradeFlow: { method: 'GET', path: '/sapi/v1/convert/tradeFlow', signed: true },
  fiatPayments: { method: 'GET', path: '/sapi/v1/fiat/payments', signed: true },
  dustLog: { method: 'GET', path: '/sapi/v1/asset/dribblet', signed: true },
  earnFlexibleRewards: { method: 'GET', path: '/sapi/v1/simple-earn/flexible/history/rewardsRecord', signed: true },
  earnLockedRewards: { method: 'GET', path: '/sapi/v1/simple-earn/locked/history/rewardsRecord', signed: true },
} as const;

type ReadEndpoint = keyof typeof READ_ENDPOINTS;

export class BinanceConfigError extends Error {
  constructor() {
    super('Collegamento Binance non configurato: imposta BINANCE_API_KEY e BINANCE_API_SECRET sul server.');
    this.name = 'BinanceConfigError';
  }
}

export class BinanceReadError extends Error {
  constructor(message: string, readonly status: number, readonly httpStatus?: number) {
    super(message);
    this.name = 'BinanceReadError';
  }
}

/**
 * Only a 400 means «this symbol does not exist / is not listed»: the one failure a scan may step
 * over. Anything else (rate limit, timeout, 5xx, network) is a PARTIAL read, and a partial history
 * written to the Registro gives wrong cost bases that look right, so it must stop the sync.
 */
function isUnlistedSymbol(error: unknown): boolean {
  return error instanceof BinanceReadError && error.httpStatus === 400;
}

export function isBinanceConfigured(): boolean {
  return Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);
}

function sign(query: string, secret: string): string {
  return createHmac('sha256', secret).update(query).digest('hex');
}

async function call(endpoint: ReadEndpoint, params: Record<string, string | number> = {}): Promise<unknown> {
  const { method, path, signed } = READ_ENDPOINTS[endpoint];
  const key = process.env.BINANCE_API_KEY;
  const secret = process.env.BINANCE_API_SECRET;
  if (signed && (!key || !secret)) throw new BinanceConfigError();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const pause = blockedUntil - Date.now();
    if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
    const search = new URLSearchParams(
      Object.entries(params).map(([name, value]) => [name, String(value)])
    );
    if (signed && secret) {
      search.set('timestamp', String(Date.now()));
      search.set('recvWindow', String(RECV_WINDOW_MS));
      search.set('signature', sign(search.toString(), secret));
    }
    const response = await fetch(`${BASE_URL}${path}?${search.toString()}`, {
      method,
      headers: key ? { 'X-MBX-APIKEY': key } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (response.status === 418 || response.status === 429) {
      const wait = Math.min(Number(response.headers.get('Retry-After')) || 5 * 2 ** attempt, MAX_BACKOFF_S);
      blockedUntil = Math.max(blockedUntil, Date.now() + wait * 1000);
      continue;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new BinanceReadError(
        response.status === 401 || response.status === 403
          ? 'Binance ha rifiutato la chiave API: controlla che sia attiva e abbia il permesso di lettura.'
          : `Binance ha risposto ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`,
        response.status === 401 || response.status === 403 ? 401 : 502,
        response.status
      );
    }
    return response.json();
  }
  throw new BinanceReadError('Binance limita le richieste: riprova fra qualche minuto.', 429);
}

/** Simple Earn positions come in pages of at most 100 rows. */
async function readEarnPositions(endpoint: 'earnFlexible' | 'earnLocked'): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const data = (await call(endpoint, { current: page, size: 100 })) as {
      rows?: unknown[];
      total?: number | string;
    };
    const pageRows = Array.isArray(data?.rows) ? data.rows : [];
    rows.push(...pageRows);
    if (pageRows.length < 100 || page * 100 >= Number(data?.total ?? 0)) break;
  }
  return rows;
}

export interface BinanceRawBalances {
  spot: unknown;
  /** `null` when the read failed: Funding and Earn are optional wallets, Spot is not. */
  funding: unknown | null;
  earn: unknown[] | null;
  /** What could not be read, in words: a missing wallet is declared, never silently empty. */
  warnings: string[];
}

export async function readBinanceBalances(): Promise<BinanceRawBalances> {
  const warnings: string[] = [];
  const optional = async <T>(label: string, read: () => Promise<T>): Promise<T | null> => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof BinanceConfigError) throw error;
      warnings.push(`${label} non letto: ${error instanceof Error ? error.message : 'errore sconosciuto'}`);
      return null;
    }
  };

  // Spot is the one read that may fail the whole sync: without it there is no portfolio to show.
  const spot = await call('spotAccount');
  const [funding, flexible, locked] = await Promise.all([
    optional('Funding', () => call('fundingAssets', { needBtcValuation: 'false' })),
    optional('Earn flessibile', () => readEarnPositions('earnFlexible')),
    optional('Earn bloccato', () => readEarnPositions('earnLocked')),
  ]);
  return {
    spot,
    funding,
    earn: flexible === null && locked === null ? null : [...(flexible ?? []), ...(locked ?? [])],
    warnings,
  };
}

/** `ticker/price` as a symbol → price map. Public: it needs no key. */
export async function readBinancePrices(): Promise<Record<string, number>> {
  const rows = await call('prices');
  if (!Array.isArray(rows)) throw new BinanceReadError('Prezzi Binance non riconosciuti.', 502);
  const out: Record<string, number> = {};
  for (const row of rows as Array<{ symbol?: unknown; price?: unknown }>) {
    const price = Number(row?.price);
    if (typeof row?.symbol === 'string' && Number.isFinite(price) && price > 0) out[row.symbol] = price;
  }
  return out;
}

// ─── History (Importa operazioni) ────────────────────────────────────────────

const DAY_MS = 86_400_000;
/** Binance serves Convert and card history in windows; four years is what the owner's key reaches. */
const HISTORY_YEARS = 4;
const SCAN_WORKERS = 2;
/** Only pairs whose base is a held coin and whose quote is one of these are scanned for Spot trades. */
const SCAN_QUOTES = new Set(['EUR', 'USDT', 'USDC', 'FDUSD', 'BTC', 'ETH', 'BNB']);

async function mapPool<T, R>(items: readonly T[], worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const run = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCAN_WORKERS, items.length) }, run));
  return results;
}

function windows(start: number, end: number, size: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let from = start; from < end; from += size) out.push([from, Math.min(from + size - 1, end)]);
  return out;
}

export interface BinanceRawHistory {
  spotTrades: unknown[];
  convert: unknown[];
  fiatBuys: unknown[];
  dust: unknown[];
  earnRewards: unknown[];
  /** What could not be read, in words: a missing product is declared, never silently empty. */
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every history product the owner's key can reach. A product that fails is a WARNING (the rest of
 * the import still stands), except a missing key, which fails the whole read.
 */
export async function readBinanceHistory(heldCoins: readonly string[]): Promise<BinanceRawHistory> {
  const warnings: string[] = [];
  const optional = async <T>(label: string, read: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof BinanceConfigError) throw error;
      // A product the key cannot reach is a warning; a transient failure (rate limit, timeout, 5xx)
      // is a partial history, which must stop the sync rather than be written as if complete.
      const refused = error instanceof BinanceReadError && [400, 401, 403, 404].includes(error.httpStatus ?? 0);
      if (!refused) throw error;
      warnings.push(`${label} non letto: ${error instanceof Error ? error.message : 'errore sconosciuto'}`);
      return fallback;
    }
  };
  const now = Date.now();
  const horizon = now - HISTORY_YEARS * 365 * DAY_MS;

  // Spot: one scan per tradable pair of a held coin.
  const spotTrades = await optional(
    'Trade Spot',
    async () => {
      const info = (await call('exchangeInfo')) as { symbols?: unknown[] };
      const held = new Set(heldCoins);
      const pairs: Array<{ symbol: string; base: string; quote: string }> = [];
      for (const row of Array.isArray(info?.symbols) ? info.symbols : []) {
        if (!isRecord(row) || row.status !== 'TRADING') continue;
        const { symbol, baseAsset, quoteAsset } = row;
        if (
          typeof symbol === 'string' &&
          typeof baseAsset === 'string' &&
          typeof quoteAsset === 'string' &&
          held.has(baseAsset) &&
          SCAN_QUOTES.has(quoteAsset)
        ) {
          pairs.push({ symbol, base: baseAsset, quote: quoteAsset });
        }
      }
      const scanned = await mapPool(pairs, async (pair) => {
        const rows: unknown[] = [];
        let fromId = 0;
        for (let page = 0; page < 50; page += 1) {
          // A symbol that errors (delisted, no permission) must not sink the other pairs.
          let batch: unknown;
          try {
            batch = await call('myTrades', { symbol: pair.symbol, limit: 1000, fromId });
          } catch (error) {
            if (!isUnlistedSymbol(error)) throw error;
            break;
          }
          if (!Array.isArray(batch) || batch.length === 0) break;
          for (const trade of batch) {
            if (isRecord(trade)) rows.push({ ...trade, _symbol: pair.symbol, _base: pair.base, _quote: pair.quote });
          }
          if (batch.length < 1000) break;
          const last = batch[batch.length - 1];
          fromId = (isRecord(last) ? Number(last.id) : fromId) + 1;
        }
        return rows;
      });
      return scanned.flat();
    },
    [] as unknown[]
  );

  const convert = await optional(
    'Convert',
    async () => {
      // tradeFlow accepts at most 30 days per call.
      const chunks = await mapPool(windows(horizon, now, 30 * DAY_MS), async ([startTime, endTime]) => {
        const data = (await call('convertTradeFlow', { startTime, endTime, limit: 1000 })) as { list?: unknown[] };
        return Array.isArray(data?.list) ? data.list : [];
      });
      return chunks.flat();
    },
    [] as unknown[]
  );

  const fiatBuys = await optional(
    'Acquisti con carta',
    async () => {
      const chunks = await mapPool(windows(horizon, now, 90 * DAY_MS), async ([beginTime, endTime]) => {
        const rows: unknown[] = [];
        for (let page = 1; page <= 20; page += 1) {
          const data = (await call('fiatPayments', { transactionType: 0, beginTime, endTime, page, rows: 500 })) as {
            data?: unknown[];
          };
          const pageRows = Array.isArray(data?.data) ? data.data : [];
          rows.push(...pageRows);
          if (pageRows.length < 500) break;
        }
        return rows;
      });
      return chunks.flat();
    },
    [] as unknown[]
  );

  const dust = await optional(
    'Dust',
    async () => {
      const data = (await call('dustLog')) as { userAssetDribblets?: unknown[] };
      const rows: unknown[] = [];
      for (const group of Array.isArray(data?.userAssetDribblets) ? data.userAssetDribblets : []) {
        if (!isRecord(group) || !Array.isArray(group.userAssetDribbletDetails)) continue;
        rows.push(...group.userAssetDribbletDetails);
      }
      return rows;
    },
    [] as unknown[]
  );

  const earnRewards = await optional(
    'Reward Earn',
    async () => {
      const rows: unknown[] = [];
      const reads: Array<{ endpoint: 'earnFlexibleRewards' | 'earnLockedRewards'; type?: string }> = [
        { endpoint: 'earnFlexibleRewards', type: 'BONUS' },
        { endpoint: 'earnFlexibleRewards', type: 'REALTIME' },
        { endpoint: 'earnFlexibleRewards', type: 'REWARDS' },
        { endpoint: 'earnLockedRewards' },
      ];
      for (const { endpoint, type } of reads) {
        for (let page = 1; page <= 20; page += 1) {
          const data = (await call(endpoint, { current: page, size: 100, ...(type ? { type } : {}) })) as {
            rows?: unknown[];
          };
          const pageRows = Array.isArray(data?.rows) ? data.rows : [];
          for (const row of pageRows) {
            if (isRecord(row)) rows.push(type ? { ...row, _rewardType: type } : row);
          }
          if (pageRows.length < 100) break;
        }
      }
      return rows;
    },
    [] as unknown[]
  );

  return { spotTrades, convert, fiatBuys, dust, earnRewards, warnings };
}

/** Daily closes of one symbol, as `{ utcDayIndex: close }`. A symbol Binance does not list is `{}`. */
async function readDailyCloses(symbol: string): Promise<Record<string, number>> {
  const days: Record<string, number> = {};
  let startTime = 0;
  try {
    for (let page = 0; page < 10; page += 1) {
      const rows = await call('klines', { symbol, interval: '1d', startTime, limit: 1000 });
      if (!Array.isArray(rows) || rows.length === 0) break;
      for (const kline of rows) {
        if (!Array.isArray(kline)) continue;
        const close = Number(kline[4]);
        if (Number.isFinite(close) && close > 0) days[String(Math.floor(Number(kline[0]) / DAY_MS))] = close;
      }
      if (rows.length < 1000) break;
      const last = rows[rows.length - 1];
      startTime = Number(Array.isArray(last) ? last[0] : startTime) + DAY_MS;
    }
  } catch (error) {
    // Unlisted pair: the parser falls back to the next route, or skips the leg with a reason.
    if (!isUnlistedSymbol(error)) throw error;
  }
  return days;
}

/** Closed daily candles never change: a symbol read once is kept for hours (a retry costs nothing). */
const KLINE_TTL_MS = 6 * 3_600_000;
const klineCache = new Map<string, { at: number; days: Record<string, number> }>();

async function readDailyClosesCached(symbol: string): Promise<Record<string, number>> {
  const hit = klineCache.get(symbol);
  if (hit && Date.now() - hit.at < KLINE_TTL_MS) return hit.days;
  const days = await readDailyCloses(symbol);
  klineCache.set(symbol, { at: Date.now(), days });
  return days;
}

/** Daily EUR-route klines for the given symbols (see `binanceKlineSymbols`). */
export async function readBinanceKlines(symbols: readonly string[]): Promise<Record<string, Record<string, number>>> {
  const closes = await mapPool(symbols, readDailyClosesCached);
  const out: Record<string, Record<string, number>> = {};
  symbols.forEach((symbol, index) => {
    out[symbol] = closes[index];
  });
  return out;
}
