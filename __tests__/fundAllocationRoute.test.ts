/**
 * GET /api/portfolio/fund-allocation — the route that lets an import read a fund's published mix
 * from its ISIN. The chain is mocked at the service boundary: this suite pins the route's own
 * contract (auth, validation, the shape the client reads, the Server-Timing header), while
 * `exposureYahooSource.test.ts` and `instrumentProfileService.test.ts` cover the data behind it.
 *
 * Seen RED on 2026-10-20 by returning every profile (a 0/0/0 allocation for an unread ISIN) instead
 * of only the ones Yahoo actually answered: the client would have split every unread fund 100/0.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { verifyIdTokenMock, resolveProfilesMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  resolveProfilesMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {},
}));

vi.mock('@/lib/server/exposure/instrumentProfileService', () => ({
  resolveInstrumentProfiles: resolveProfilesMock,
}));

import { GET as fundAllocationRoute } from '@/app/api/portfolio/fund-allocation/route';

const ROUTE = 'http://localhost/api/portfolio/fund-allocation';

function request(query: string, authenticated = true): NextRequest {
  return new NextRequest(`${ROUTE}${query}`, {
    headers: authenticated ? { authorization: 'Bearer token' } : {},
  });
}

const ALLOCATION = {
  stock: 0.1925,
  bond: 0.7269,
  cash: 0.036,
  other: 0.0446,
  preferred: 0,
  convertible: 0.0003,
};

describe('GET /api/portfolio/fund-allocation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'owner-1' });
    resolveProfilesMock.mockResolvedValue({
      response: {
        profiles: {
          IT0005650905: {
            fund: { fetchedAt: '2026-10-20T08:00:00.000Z', holdingsBasis: 'fund', family: 'Eurizon', allocation: ALLOCATION },
          },
          LU2629378014: {
            fund: { fetchedAt: '2026-10-20T08:00:00.000Z', holdingsBasis: 'fund', family: 'Eurizon' },
          },
        },
        oldestFetchedAt: '2026-10-20T08:00:00.000Z',
      },
      counts: { hits: 1, fetched: 1 },
    });
  });

  it('refuses an unauthenticated request', async () => {
    const response = await fundAllocationRoute(request('?isins=IT0005650905', false));
    expect(response.status).toBe(401);
    expect(resolveProfilesMock).not.toHaveBeenCalled();
  });

  it('refuses anything that is not a bounded list of real ISINs', async () => {
    const response = await fundAllocationRoute(request('?isins=VWCE.DE'));
    expect(response.status).toBe(400);
    expect(resolveProfilesMock).not.toHaveBeenCalled();
  });

  it('refuses a free-form name where a ticker belongs', async () => {
    // A real ISIN rides alongside, so a 400 can only come from the ticker list itself.
    const response = await fundAllocationRoute(
      request('?isins=IT0005650905&tickers=Fidelity%20Global%20Multi%20Asset%20Defensive')
    );
    expect(response.status).toBe(400);
    expect(resolveProfilesMock).not.toHaveBeenCalled();
  });

  it('asks the fund module once per ISIN and answers only the mixes Yahoo published', async () => {
    const response = await fundAllocationRoute(
      request('?isins=IT0005650905,LU2629378014')
    );
    expect(response.status).toBe(200);
    expect(resolveProfilesMock).toHaveBeenCalledWith(
      [
        { ticker: 'IT0005650905', module: 'fund' },
        { ticker: 'LU2629378014', module: 'fund' },
      ],
      expect.objectContaining({ timing: expect.any(Object), requireAllocation: true })
    );
    const body = await response.json();
    expect(body.allocations).toEqual({ IT0005650905: ALLOCATION });
    // An unread ISIN is ABSENT, never a zero allocation the client would print as 100/0.
    expect(body.allocations.LU2629378014).toBeUndefined();
    expect(body.oldestFetchedAt).toBe('2026-10-20T08:00:00.000Z');
  });

  it('reads a ticker list as a second identity, keyed as asked', async () => {
    resolveProfilesMock.mockResolvedValueOnce({
      response: {
        profiles: {
          'GRID.MI': { fund: { fetchedAt: '2026-10-20T08:00:00.000Z', holdingsBasis: 'fund', allocation: ALLOCATION } },
          'EUJP.MI': { fund: { fetchedAt: '2026-10-20T08:00:00.000Z', holdingsBasis: 'fund' } },
        },
        oldestFetchedAt: '2026-10-20T08:00:00.000Z',
      },
      counts: { hits: 0, fetched: 2 },
    });

    const response = await fundAllocationRoute(request('?tickers=GRID.MI,EUJP.MI'));

    expect(response.status).toBe(200);
    expect(resolveProfilesMock).toHaveBeenCalledWith(
      [
        { ticker: 'GRID.MI', module: 'fund' },
        { ticker: 'EUJP.MI', module: 'fund' },
      ],
      expect.objectContaining({ requireAllocation: true })
    );
    const body = await response.json();
    expect(body.allocations).toEqual({ 'GRID.MI': ALLOCATION });
    expect(body.allocations['EUJP.MI']).toBeUndefined();
  });

  it('refuses a query that names no instrument at all', async () => {
    const response = await fundAllocationRoute(request('?isins=&tickers='));
    expect(response.status).toBe(400);
    expect(resolveProfilesMock).not.toHaveBeenCalled();
  });

  it('names its stages in Server-Timing', async () => {
    const response = await fundAllocationRoute(request('?isins=IT0005650905'));
    const header = response.headers.get('Server-Timing') ?? '';
    expect(header).toContain('auth;dur=');
    expect(header).toContain('source;desc=yahoo');
    expect(header).toContain('hits;desc=1');
  });
});
