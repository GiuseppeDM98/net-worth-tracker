/**
 * Tests for app/api/portfolio/instrument-profiles/route.ts — seen through what it costs and whom
 * it serves. The chain is the real one (route → service → yahooSource → `yahoo-finance2`), with
 * Yahoo mocked at the library and the Admin SDK mocked with a store that keeps what `set` wrote,
 * `mergeFields` semantics included: the second GET is only honest if the first one's write landed.
 *
 * BORN RED ON PURPOSE: the first version of this file (2026-09-28) targeted the route of that day
 * (`/api/portfolio/exposure`) and went RED on 2026-09-28 — «expected 4 to be 2»: the second GET
 * asked Yahoo again, because the route's three-segment cache key never matched the service's
 * four-segment one (PERF-10 § A). Rewritten here on the new route, where the same assertion holds.
 *
 * The security pair: the SAME request against the caller's own account, against someone else's
 * (403) and, with a grant, as a delegate — who must receive the OWNER's tickers, not their own.
 * Seen RED by reading `decodedToken.uid` in the route: the delegate got their own profiles.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

const { verifyIdTokenMock, assetsByUser, quoteSummaryMock, accountAccessGetMock, cacheStore } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  assetsByUser: new Map<string, Array<{ id: string; data: () => Record<string, unknown> }>>(),
  quoteSummaryMock: vi.fn(),
  accountAccessGetMock: vi.fn(),
  cacheStore: new Map<string, Record<string, unknown>>(),
}));

vi.mock('yahoo-finance2', () => ({
  default: class {
    quoteSummary = quoteSummaryMock;
  },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'assets') {
        let requestedUser = '';
        const chain = {
          where: vi.fn((_field: string, _op: string, value: string) => {
            requestedUser = value;
            return chain;
          }),
          get: vi.fn(async () => ({ empty: false, docs: assetsByUser.get(requestedUser) ?? [] })),
        };
        return chain;
      }
      if (name === 'instrument-profile-cache') {
        return {
          doc: vi.fn((id: string) => ({
            get: vi.fn(async () => {
              const data = cacheStore.get(id);
              return { exists: data !== undefined, data: () => data };
            }),
            set: vi.fn((data: Record<string, unknown>, options?: { mergeFields?: string[] }) => {
              const current = cacheStore.get(id) ?? {};
              const fields = options?.mergeFields ?? Object.keys(data);
              cacheStore.set(id, { ...current, ...Object.fromEntries(fields.map((field) => [field, data[field]])) });
              return Promise.resolve();
            }),
          })),
        };
      }
      if (name === 'account-access') {
        return { doc: vi.fn(() => ({ get: accountAccessGetMock })) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));

import { GET as instrumentProfilesRoute } from '@/app/api/portfolio/instrument-profiles/route';

const ROUTE = 'http://localhost/api/portfolio/instrument-profiles';

function request(url: string, authenticated = true): NextRequest {
  return new NextRequest(url, { headers: authenticated ? { authorization: 'Bearer token' } : {} });
}

const assetDoc = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

describe('GET /api/portfolio/instrument-profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheStore.clear();
    assetsByUser.clear();
    verifyIdTokenMock.mockResolvedValue({ uid: 'owner-1' });
    accountAccessGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    assetsByUser.set('owner-1', [
      assetDoc('a-etf', { userId: 'owner-1', ticker: 'VWCE.DE', name: 'All-World', type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 10, currentPrice: 100 }),
      assetDoc('a-stock', { userId: 'owner-1', ticker: 'AAPL', name: 'Apple', type: 'stock', assetClass: 'equity', currency: 'USD', quantity: 5, currentPrice: 200, currentPriceEur: 180 }),
      assetDoc('a-btp', { userId: 'owner-1', ticker: 'BTP', name: 'BTP', type: 'bond', assetClass: 'bonds', currency: 'EUR', quantity: 5, currentPrice: 100 }),
    ]);
    assetsByUser.set('member-1', [assetDoc('m-etf', { userId: 'member-1', ticker: 'SWDA.MI', name: 'World', type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 1, currentPrice: 100 })]);
    quoteSummaryMock.mockImplementation(async (_ticker: string, options: { modules: string[] }) => {
      if (options.modules.includes('topHoldings')) {
        return {
          topHoldings: { stockPosition: 0.98, holdings: [{ symbol: 'NVDA', holdingName: 'Nvidia', holdingPercent: 0.045 }], sectorWeightings: [{ technology: 0.3 }] },
          fundProfile: { family: 'Vanguard' },
        };
      }
      return { assetProfile: { sector: 'Technology' }, price: { longName: 'Apple Inc.' } };
    });
  });

  it('asks Yahoo on the first call and NOTHING on the second, unchanged one', async () => {
    const first = await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1`));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(Object.keys(body.profiles).sort()).toEqual(['AAPL', 'VWCE.DE']);
    expect(body.profiles['VWCE.DE'].fund.holdings[0]).toMatchObject({ key: 'NVDA', weight: 0.045 / 0.98 });
    expect(body.profiles.AAPL.stock).toMatchObject({ sectorKey: 'technology', longName: 'Apple Inc.' });
    expect(body.profiles.BTP, 'a bond asks nothing').toBeUndefined();
    const callsAfterFirst = quoteSummaryMock.mock.calls.length;
    expect(callsAfterFirst, 'the first opening reads Yahoo, once per ticker').toBe(2);

    const second = await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1`));
    expect(second.status).toBe(200);
    expect(quoteSummaryMock.mock.calls.length, 'a second opening with the same portfolio must cost no Yahoo call').toBe(callsAfterFirst);
    expect((await second.json()).oldestFetchedAt).toBe(body.oldestFetchedAt);
  });

  // PERF-10 (2026-10-05): the header is the production reading of the case above. Seen RED by
  // setting USEFUL_PROFILE_TTL_MS to zero: the second call read «source=yahoo», «fetched=2».
  it('says in Server-Timing where the profiles came from: Yahoo first, the cache second', async () => {
    const descriptions = (header: string | null) =>
      Object.fromEntries((header ?? '').split(', ').filter((entry) => entry.includes(';desc=')).map((entry) => entry.split(';desc=')));
    const stages = (header: string | null) => (header ?? '').split(', ').map((entry) => entry.split(';')[0]);

    const first = await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1`));
    expect(descriptions(first.headers.get('server-timing'))).toEqual({ hits: '0', fetched: '2', source: 'yahoo' });
    expect(stages(first.headers.get('server-timing')).slice(0, 4)).toEqual(['auth', 'db', 'yahoo', 'total']);

    const second = await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1`));
    expect(descriptions(second.headers.get('server-timing'))).toEqual({ hits: '2', fetched: '0', source: 'cache' });
    expect(Object.keys(await second.json()).sort(), 'the counts stay out of the body').toEqual(['oldestFetchedAt', 'profiles']);

    const forced = await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1&force=true`));
    expect(descriptions(forced.headers.get('server-timing')).source, '«Aggiorna» asks Yahoo').toBe('yahoo');
  });

  it('«Aggiorna» (force=true) asks Yahoo again on a fresh cache', async () => {
    await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1`));
    const callsAfterFirst = quoteSummaryMock.mock.calls.length;
    await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1&force=true`));
    expect(quoteSummaryMock.mock.calls.length).toBe(callsAfterFirst * 2);
  });

  it('answers the profiles of the requested OWNER: 200 on one’s own account', async () => {
    const response = await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1`));
    expect(response.status).toBe(200);
  });

  it('refuses another account without a grant with 403', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'member-1' });
    const response = await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1`));
    expect(response.status).toBe(403);
    expect(quoteSummaryMock).not.toHaveBeenCalled();
  });

  it('serves a delegate WITH a grant the owner’s tickers, not their own', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'member-1' });
    accountAccessGetMock.mockResolvedValue({ exists: true, data: () => ({ memberUids: ['member-1'] }) });
    const response = await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1`));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.profiles).sort()).toEqual(['AAPL', 'VWCE.DE']);
    expect(body.profiles['SWDA.MI'], 'the delegate’s own instrument must not appear').toBeUndefined();
  });

  it('answers 400 without a userId and 401 without a token', async () => {
    expect((await instrumentProfilesRoute(request(ROUTE))).status).toBe(400);
    expect((await instrumentProfilesRoute(request(`${ROUTE}?userId=owner-1`, false))).status).toBe(401);
  });
});
