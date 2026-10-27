/**
 * GET /api/portfolio/fund-identity — the route an import asks «which fund is this product name?».
 * The service is mocked at the boundary: this suite pins the route's own contract (auth, the
 * bounded name list, the shape the client reads, the Server-Timing header).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { verifyIdTokenMock, resolveIdentitiesMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  resolveIdentitiesMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {},
}));

vi.mock('@/lib/server/eodhd/fundIdentityService', () => ({
  resolveFundIdentities: resolveIdentitiesMock,
}));

import { GET as fundIdentityRoute } from '@/app/api/portfolio/fund-identity/route';

const ROUTE = 'http://localhost/api/portfolio/fund-identity';

function request(query: string, authenticated = true): NextRequest {
  return new NextRequest(`${ROUTE}${query}`, {
    headers: authenticated ? { authorization: 'Bearer token' } : {},
  });
}

const MATCHED = {
  query: 'R-CO VALOR "C" (EUR) ACC',
  status: 'matched',
  identity: { isin: 'FR0011253624', name: 'R-co Valor C EUR', currency: 'EUR' },
  candidateCount: 3,
};

describe('GET /api/portfolio/fund-identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'viewer-1' });
    resolveIdentitiesMock.mockResolvedValue({
      response: { results: [MATCHED] },
      counts: { hits: 0, fetched: 1, unavailable: 0 },
    });
  });

  it('refuses an unauthenticated request', async () => {
    const response = await fundIdentityRoute(request('?names=R-CO%20VALOR', false));
    expect(response.status).toBe(401);
    expect(resolveIdentitiesMock).not.toHaveBeenCalled();
  });

  it('refuses a query that names nothing', async () => {
    const response = await fundIdentityRoute(request('?names='));
    expect(response.status).toBe(400);
    expect(resolveIdentitiesMock).not.toHaveBeenCalled();
  });

  it('refuses more than ten names at once', async () => {
    const names = Array.from({ length: 11 }, (_, index) => `Fondo%20Numero%20${index}`).join('%7C');
    const response = await fundIdentityRoute(request(`?names=${names}`));
    expect(response.status).toBe(400);
    expect(resolveIdentitiesMock).not.toHaveBeenCalled();
  });

  it('hands the service the names as a list and answers its results untouched', async () => {
    const response = await fundIdentityRoute(
      request('?names=R-CO%20VALOR%20%22C%22%20(EUR)%20ACC%7CMorgan%20Stanley%20Global%20Brands')
    );

    expect(response.status).toBe(200);
    expect(resolveIdentitiesMock).toHaveBeenCalledWith(
      ['R-CO VALOR "C" (EUR) ACC', 'Morgan Stanley Global Brands'],
      expect.objectContaining({ timing: expect.any(Object) })
    );
    await expect(response.json()).resolves.toEqual({ results: [MATCHED] });
  });

  it('names its stages in Server-Timing, with the counts the service reports', async () => {
    resolveIdentitiesMock.mockResolvedValue({
      response: { results: [MATCHED] },
      counts: { hits: 2, fetched: 1, unavailable: 0 },
    });

    const response = await fundIdentityRoute(request('?names=R-CO%20VALOR'));

    // `db` and `eodhd` are marked by the SERVICE, through the recorder this route hands it — the
    // mocked service here marks nothing, so those two stages are pinned in
    // `fundIdentityService.test.ts` and only the route's own stages are asserted here.
    const header = response.headers.get('Server-Timing') ?? '';
    expect(header).toContain('auth;dur=');
    expect(header).toContain('compute;dur=');
    expect(header).toContain('source;desc=eodhd');
    expect(header).toContain('hits;desc=2');
    expect(header).toContain('unavailable;desc=0');
    expect(resolveIdentitiesMock).toHaveBeenCalledWith(
      ['R-CO VALOR'],
      expect.objectContaining({ timing: expect.objectContaining({ mark: expect.any(Function) }) })
    );
  });

  it('says the source is the cache when nothing was fetched', async () => {
    resolveIdentitiesMock.mockResolvedValue({
      response: { results: [MATCHED] },
      counts: { hits: 1, fetched: 0, unavailable: 0 },
    });

    const response = await fundIdentityRoute(request('?names=R-CO%20VALOR'));
    expect(response.headers.get('Server-Timing')).toContain('source;desc=cache');
  });
});
