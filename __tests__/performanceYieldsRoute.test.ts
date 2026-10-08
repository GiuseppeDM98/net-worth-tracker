import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * POST /api/performance/yields — the route that replaced `/api/performance/yoc` and
 * `/api/performance/current-yield` (2026-10-04).
 *
 * Runs the REAL route, `getAllDividends` and the Admin repository against an in-memory Admin
 * Firestore that counts every collection read (the pattern of `__tests__/serverCashSettlement.test.ts`),
 * because the point of the route is a COUNT: five periods cost one read of dividends, assets and
 * snapshots, where the two old routes cost ten reads of each. The figures are held against the
 * pure function on the same documents (`__tests__/dividendYield.test.ts` holds that function
 * against the old routes' body).
 *
 * The security pair: the SAME body on the caller's own account (200) and on someone else's (403),
 * and on someone else's WITH a grant (200) — a negative test alone proves nothing.
 */

type Doc = Record<string, unknown>;

const collections: Record<string, Map<string, Doc>> = {
  dividends: new Map(),
  assets: new Map(),
  'monthly-snapshots': new Map(),
  'account-access': new Map(),
};
const readsByCollection: Record<string, number> = {};

const { verifyIdTokenMock } = vi.hoisted(() => ({ verifyIdTokenMock: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {
    collection: (name: string) => {
      const filters: [string, unknown][] = [];
      const snapshotOf = (id: string) => {
        const data = collections[name].get(id);
        return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
      };
      const query = {
        doc: (id: string) => ({
          get: async () => {
            readsByCollection[name] = (readsByCollection[name] ?? 0) + 1;
            return snapshotOf(id);
          },
        }),
        where: (field: string, _op: string, value: unknown) => {
          filters.push([field, value]);
          return query;
        },
        orderBy: () => query,
        get: async () => {
          readsByCollection[name] = (readsByCollection[name] ?? 0) + 1;
          const docs = [...collections[name].keys()].map(snapshotOf).filter((snap) => filters.every(([field, value]) => snap.data()![field] === value));
          return { docs, size: docs.length, empty: docs.length === 0 };
        },
      };
      return query;
    },
  },
}));

import { POST as yieldsRoute } from '@/app/api/performance/yields/route';
import { computeYieldsForPeriods } from '@/lib/utils/dividendYield';
import type { MonthlySnapshot } from '@/types/assets';

const OWNER = 'user-1';
const STRANGER = 'user-2';

/** A Firestore Timestamp as the Admin SDK hands it back. */
const timestamp = (date: Date) => ({ toDate: () => date });

const ASSETS = [
  { id: 'etf', ticker: 'ETF', name: 'Un ETF', quantity: 100, averageCost: 50, currentPrice: 80 },
  { id: 'btp', ticker: 'BTP', name: 'Un BTP', quantity: 200, averageCost: 100, currentPrice: 95 },
];
const DIVIDENDS = [
  { id: 'd1', assetId: 'etf', paymentDate: new Date(2026, 2, 15), quantity: 100, grossAmount: 100, netAmount: 74 },
  { id: 'd2', assetId: 'etf', paymentDate: new Date(2025, 8, 15), quantity: 100, grossAmount: 80, netAmount: 59.2 },
  { id: 'd3', assetId: 'btp', paymentDate: new Date(2026, 5, 1), quantity: 200, grossAmount: 300, netAmount: 262.5 },
  { id: 'd4', assetId: 'btp', paymentDate: new Date(2024, 5, 1), quantity: 200, grossAmount: 300, netAmount: 262.5 },
];
const SNAPSHOTS = [
  { year: 2026, month: 8, totalNetWorth: 27_000 },
  { year: 2026, month: 9, totalNetWorth: 27_250 },
];

const PERIODS = [
  { key: 'ytd', startDate: '2026-01-01T00:00:00.000Z', dividendEndDate: '2026-10-04T10:00:00.000Z', numberOfMonths: 10 },
  { key: 'oneYear', startDate: '2025-11-01T00:00:00.000Z', dividendEndDate: '2026-10-04T10:00:00.000Z', numberOfMonths: 12 },
  { key: 'threeYear', startDate: '2023-11-01T00:00:00.000Z', dividendEndDate: '2026-10-04T10:00:00.000Z', numberOfMonths: 36 },
  { key: 'fiveYear', startDate: '2021-11-01T00:00:00.000Z', dividendEndDate: '2026-10-04T10:00:00.000Z', numberOfMonths: 60 },
  { key: 'allTime', startDate: '2023-02-01T00:00:00.000Z', dividendEndDate: '2026-10-04T10:00:00.000Z', numberOfMonths: 45 },
];

function seed(userId: string) {
  for (const asset of ASSETS) {
    const { id, ...data } = asset;
    collections.assets.set(`${userId}-${id}`, { ...data, userId });
  }
  for (const dividendRecord of DIVIDENDS) {
    const { id, paymentDate, ...data } = dividendRecord;
    // An asset's id is its document id, so the dividend points at the account's own copy.
    collections.dividends.set(`${userId}-${id}`, { ...data, assetId: `${userId}-${data.assetId}`, userId, paymentDate: timestamp(paymentDate), exDate: timestamp(paymentDate) });
  }
  for (const snapshot of SNAPSHOTS) {
    collections['monthly-snapshots'].set(`${userId}-${snapshot.year}-${snapshot.month}`, { ...snapshot, userId });
  }
}

function request(body: unknown, token: string | null = 'valid-token'): NextRequest {
  return new NextRequest('http://localhost/api/performance/yields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const collection of Object.values(collections)) collection.clear();
  for (const name of Object.keys(readsByCollection)) delete readsByCollection[name];
  verifyIdTokenMock.mockReset();
  verifyIdTokenMock.mockResolvedValue({ uid: OWNER });
  // Both accounts hold the same documents: the 403 below cannot be an empty account's answer.
  seed(OWNER);
  seed(STRANGER);
});

describe('POST /api/performance/yields', () => {
  it('should answer five periods with ONE read of dividends, assets and snapshots', async () => {
    const response = await yieldsRoute(request({ userId: OWNER, periods: PERIODS }));

    expect(response.status).toBe(200);
    expect(readsByCollection).toEqual({ dividends: 1, assets: 1, 'monthly-snapshots': 1 });

    const body = await response.json();
    // The pure function on the documents as the route reads them (ids as stored).
    const expected = computeYieldsForPeriods({
      dividends: DIVIDENDS.map((record) => ({ ...record, assetId: `${OWNER}-${record.assetId}` })),
      assets: ASSETS.map((asset) => ({ ...asset, id: `${OWNER}-${asset.id}` })),
      snapshots: SNAPSHOTS as unknown as MonthlySnapshot[],
      periods: PERIODS.map((period) => ({ ...period, startDate: new Date(period.startDate), dividendEndDate: new Date(period.dividendEndDate) })),
    });
    expect(Object.keys(body)).toEqual(['ytd', 'oneYear', 'threeYear', 'fiveYear', 'allTime']);
    expect(body).toEqual(JSON.parse(JSON.stringify(expected)));
    // Positive anchor: the fixture pays dividends, so the equality above is not between two empties.
    // Year to date: 100 € + 300 € received, annualised over ten months on a 25.000 € cost basis.
    expect(body.ytd.yocDividendsGross).toBeCloseTo(400, 6);
    expect(body.ytd.yocGross).toBeCloseTo((480 / 25_000) * 100, 6);
    expect(body.threeYear.yocDividendsGross).toBeCloseTo(780, 6);
  });

  it('should say where the time went', async () => {
    const response = await yieldsRoute(request({ userId: OWNER, periods: PERIODS }));

    expect(response.headers.get('Server-Timing')).toMatch(/^auth;dur=[\d.]+, db;dur=[\d.]+, compute;dur=[\d.]+, total;dur=[\d.]+$/);
  });

  it('should refuse a request without a token before reading anything', async () => {
    const response = await yieldsRoute(request({ userId: OWNER, periods: PERIODS }, null));

    expect(response.status).toBe(401);
    expect(readsByCollection).toEqual({});
  });

  it.each([
    ['a body that is not JSON', '{not json'],
    ['no periods', { userId: OWNER, periods: [] }],
    ['no userId', { periods: PERIODS }],
    ['a date that is not a date', { userId: OWNER, periods: [{ ...PERIODS[0], startDate: 'ieri' }] }],
    ['a null date (not an epoch)', { userId: OWNER, periods: [{ ...PERIODS[0], dividendEndDate: null }] }],
    ['months as a string', { userId: OWNER, periods: [{ ...PERIODS[0], numberOfMonths: '10' }] }],
    ['more periods than the page has', { userId: OWNER, periods: Array.from({ length: 9 }, (_, index) => ({ ...PERIODS[0], key: `p${index}` })) }],
  ])('should answer 400 to %s, reading nothing', async (_label, body) => {
    const response = await yieldsRoute(request(body));

    expect(response.status).toBe(400);
    expect(readsByCollection).toEqual({});
  });

  it('should refuse another account with the same body it accepts on the caller\'s own', async () => {
    const own = await yieldsRoute(request({ userId: OWNER, periods: PERIODS }));
    const other = await yieldsRoute(request({ userId: STRANGER, periods: PERIODS }));

    expect(own.status).toBe(200);
    expect(other.status).toBe(403);
    // The refusal read the grant and nothing of the other account.
    expect(readsByCollection).toEqual({ dividends: 1, assets: 1, 'monthly-snapshots': 1, 'account-access': 1 });
  });

  it('should serve a shared account to a member of its grant', async () => {
    collections['account-access'].set(STRANGER, { memberUids: [OWNER] });

    const response = await yieldsRoute(request({ userId: STRANGER, periods: PERIODS }));

    expect(response.status).toBe(200);
  });
});
