/**
 * `lib/server/eodhd/fundIdentityService.ts` — the EODHD search behind the import preview: one call
 * per distinct product name, a shared cache, and a fail-soft contract where «could not ask» is
 * `unavailable`, never «no such fund».
 *
 * The candidate lists are recordings of EODHD's real answers (2026-10-22), the same sets
 * `__tests__/fundIdentity.test.ts` matches against.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));

import {
  FUND_IDENTITY_MISS_TTL_MS,
  FUND_IDENTITY_TTL_MS,
  MAX_IDENTITY_QUERIES,
  createEodhdFundIdentitySource,
  resolveFundIdentities,
  type CachedFundIdentity,
  type FundIdentityCacheStore,
  type FundIdentitySource,
} from '@/lib/server/eodhd/fundIdentityService';
import type { EodhdFundHit } from '@/lib/utils/fundIdentity';

const R_CO_VALOR_QUERY = 'R-CO VALOR "C" (EUR) ACC';

const HITS: EodhdFundHit[] = [
  { Name: 'R-co Valor P EUR', ISIN: 'FR0011847409', Currency: 'EUR', Type: 'FUND' },
  { Name: 'R-co Valor C EUR', ISIN: 'FR0011253624', Currency: 'EUR', Type: 'FUND' },
  { Name: 'R-co Valor Balanced C EUR', ISIN: 'FR0013367265', Currency: 'EUR', Type: 'FUND' },
];

function memoryStore(seed: Record<string, CachedFundIdentity> = {}) {
  const documents = new Map<string, CachedFundIdentity>(Object.entries(seed));
  const store: FundIdentityCacheStore & { documents: Map<string, CachedFundIdentity> } = {
    documents,
    async read(normalizedName) {
      return documents.get(normalizedName) ?? null;
    },
    async write(normalizedName, entry) {
      documents.set(normalizedName, entry);
    },
  };
  return store;
}

function sourceOf(answer: EodhdFundHit[] | null): FundIdentitySource & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async search(query) {
      calls.push(query);
      return answer;
    },
  };
}

const NOW = new Date('2026-10-22T10:00:00.000Z');

describe('resolveFundIdentities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks EODHD once per distinct name and files the answer under the normalised name', async () => {
    const store = memoryStore();
    const source = sourceOf(HITS);

    const { response, counts } = await resolveFundIdentities(
      [R_CO_VALOR_QUERY, '  r-co valor "c" (eur) acc  '],
      { now: NOW, source, store }
    );

    // The SEARCH asks the strategy, not the whole name: «R-CO VALOR "C" (EUR) ACC» answers zero
    // hits on EODHD while «R CO VALOR» answers every class of the fund.
    expect(source.calls).toEqual(['R CO VALOR']);
    expect(counts).toEqual({ hits: 0, fetched: 1, unavailable: 0 });
    expect(response.results).toEqual([
      {
        query: R_CO_VALOR_QUERY,
        status: 'matched',
        identity: { isin: 'FR0011253624', name: 'R-co Valor C EUR', currency: 'EUR' },
        candidateCount: 3,
      },
    ]);
    expect(store.documents.get('R CO VALOR C EUR ACC')).toEqual({
      query: R_CO_VALOR_QUERY,
      status: 'matched',
      identity: { isin: 'FR0011253624', name: 'R-co Valor C EUR', currency: 'EUR' },
      candidateCount: 3,
      fetchedAt: NOW.toISOString(),
    });
  });

  it('serves a matched answer from the cache without calling EODHD', async () => {
    const store = memoryStore({
      'R CO VALOR C EUR ACC': {
        query: R_CO_VALOR_QUERY,
        status: 'matched',
        identity: { isin: 'FR0011253624', name: 'R-co Valor C EUR', currency: 'EUR' },
        candidateCount: 3,
        fetchedAt: new Date(NOW.getTime() - FUND_IDENTITY_TTL_MS + 60_000).toISOString(),
      },
    });
    const source = sourceOf(HITS);

    const { response, counts } = await resolveFundIdentities([R_CO_VALOR_QUERY], { now: NOW, source, store });

    expect(source.calls).toEqual([]);
    expect(counts).toEqual({ hits: 1, fetched: 0, unavailable: 0 });
    expect(response.results[0].identity?.isin).toBe('FR0011253624');
  });

  it('re-asks a matched answer older than the quarter, and a miss older than a week', async () => {
    const staleMatch = memoryStore({
      'R CO VALOR C EUR ACC': {
        query: R_CO_VALOR_QUERY,
        status: 'matched',
        identity: { isin: 'FR0011253624', name: 'R-co Valor C EUR', currency: 'EUR' },
        candidateCount: 3,
        fetchedAt: new Date(NOW.getTime() - FUND_IDENTITY_TTL_MS - 60_000).toISOString(),
      },
    });
    const staleMiss = memoryStore({
      'R CO VALOR C EUR ACC': {
        query: R_CO_VALOR_QUERY,
        status: 'none',
        candidateCount: 0,
        fetchedAt: new Date(NOW.getTime() - FUND_IDENTITY_MISS_TTL_MS - 60_000).toISOString(),
      },
    });

    const first = sourceOf(HITS);
    await resolveFundIdentities([R_CO_VALOR_QUERY], { now: NOW, source: first, store: staleMatch });
    expect(first.calls).toEqual(['R CO VALOR']);

    const second = sourceOf(HITS);
    await resolveFundIdentities([R_CO_VALOR_QUERY], { now: NOW, source: second, store: staleMiss });
    expect(second.calls).toEqual(['R CO VALOR']);
  });

  it('answers «unavailable» — and caches nothing — when EODHD could not be asked', async () => {
    const store = memoryStore();
    const source = sourceOf(null);

    const { response, counts } = await resolveFundIdentities([R_CO_VALOR_QUERY], { now: NOW, source, store });

    expect(counts).toEqual({ hits: 0, fetched: 1, unavailable: 1 });
    expect(response.results).toEqual([
      { query: R_CO_VALOR_QUERY, status: 'unavailable', candidateCount: 0 },
    ]);
    expect(store.documents.size).toBe(0);
  });

  it('keeps a stale answer when EODHD fails on this run', async () => {
    const store = memoryStore({
      'R CO VALOR C EUR ACC': {
        query: R_CO_VALOR_QUERY,
        status: 'matched',
        identity: { isin: 'FR0011253624', name: 'R-co Valor C EUR', currency: 'EUR' },
        candidateCount: 3,
        fetchedAt: new Date(NOW.getTime() - FUND_IDENTITY_TTL_MS - 60_000).toISOString(),
      },
    });

    const { response } = await resolveFundIdentities([R_CO_VALOR_QUERY], {
      now: NOW,
      source: sourceOf(null),
      store,
    });

    // A cache entry too old to trust is still better than «non lo so»: the row keeps its identity.
    expect(response.results[0].status).toBe('matched');
    expect(response.results[0].identity?.isin).toBe('FR0011253624');
  });

  it('bounds the list and drops empty names', async () => {
    const source = sourceOf([]);
    const names = Array.from({ length: MAX_IDENTITY_QUERIES + 3 }, (_, index) => `Fondo Numero ${index}`);

    const { response, counts } = await resolveFundIdentities(['', '  ', ...names], {
      now: NOW,
      source,
      store: memoryStore(),
    });

    expect(source.calls).toHaveLength(MAX_IDENTITY_QUERIES);
    expect(response.results).toHaveLength(MAX_IDENTITY_QUERIES);
    expect(counts.fetched).toBe(MAX_IDENTITY_QUERIES);
  });

  it('treats an unreadable cache as a miss', async () => {
    const store: FundIdentityCacheStore = {
      async read() {
        throw new Error('firestore down');
      },
      async write() {
        throw new Error('firestore down');
      },
    };
    const source = sourceOf(HITS);

    const { response } = await resolveFundIdentities([R_CO_VALOR_QUERY], { now: NOW, source, store });

    expect(response.results[0].identity?.isin).toBe('FR0011253624');
  });

  it('marks its own stages on the route\u2019s recorder, cache first then EODHD', async () => {
    const marks: string[] = [];

    await resolveFundIdentities([R_CO_VALOR_QUERY], {
      now: NOW,
      source: sourceOf(HITS),
      store: memoryStore(),
      timing: { mark: (name) => marks.push(name) },
    });

    expect(marks).toEqual(['db', 'eodhd']);
  });
});

describe('createEodhdFundIdentitySource', () => {
  const originalToken = process.env.EODHD_API_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EODHD_API_TOKEN = originalToken;
  });

  it('never calls EODHD without a token', async () => {
    const fetchMock = vi.fn();
    const source = createEodhdFundIdentitySource('', fetchMock as never);

    expect(await source.search(R_CO_VALOR_QUERY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks the Search API for funds only, and maps the hits it needs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { Name: 'R-co Valor C EUR', ISIN: 'FR0011253624', Currency: 'EUR', Type: 'FUND', Exchange: 'EUFUND' },
        { Name: 42, ISIN: null, Currency: null, Type: null },
      ],
    });
    const source = createEodhdFundIdentitySource('token-1', fetchMock as never);

    const hits = await source.search(R_CO_VALOR_QUERY);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/api/search/R-CO%20VALOR%20%22C%22%20(EUR)%20ACC?');
    expect(url).toContain('type=fund');
    expect(url).toContain('limit=50');
    expect(url).toContain('api_token=token-1');
    expect(hits).toEqual([
      { Name: 'R-co Valor C EUR', ISIN: 'FR0011253624', Currency: 'EUR', Type: 'FUND', Exchange: 'EUFUND' },
      { Name: null, ISIN: null, Currency: null, Type: null, Exchange: null },
    ]);
  });

  it('answers null when EODHD refuses or the body is not a list', async () => {
    const refused = createEodhdFundIdentitySource('token-1', vi.fn().mockResolvedValue({ ok: false, status: 403 }) as never);
    expect(await refused.search(R_CO_VALOR_QUERY)).toBeNull();

    const garbage = createEodhdFundIdentitySource('token-1', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ error: 'x' }) }) as never);
    expect(await garbage.search(R_CO_VALOR_QUERY)).toBeNull();
  });
});
