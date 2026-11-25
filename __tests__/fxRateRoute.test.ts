/**
 * Tests for GET /api/fx/rate — the ECB rate the trade form previews: signed-in only, the query
 * validated before any read, the service's answer passed through, 503 when there is none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyIdTokenMock, resolveEcbMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  resolveEcbMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { verifyIdToken: verifyIdTokenMock }, adminDb: {} }));
vi.mock('@/lib/server/tradeFxService', () => ({ resolveEcbRateToEur: resolveEcbMock }));

import { GET } from '@/app/api/fx/rate/route';

function request(query: string, token: string | null = 'valid-token'): NextRequest {
  return new NextRequest(`http://localhost/api/fx/rate?${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  verifyIdTokenMock.mockReset().mockResolvedValue({ uid: 'user-1' });
  resolveEcbMock.mockReset().mockResolvedValue({ rate: 0.9123, isLatest: false });
});

describe('GET /api/fx/rate', () => {
  it('answers 401 without a token', async () => {
    const response = await GET(request('currency=USD&date=2026-11-16', null));
    expect(response.status).toBe(401);
    expect(resolveEcbMock).not.toHaveBeenCalled();
  });

  it('answers 400 on a code that is not three letters, reading nothing', async () => {
    const response = await GET(request('currency=US&date=2026-11-16'));
    expect(response.status).toBe(400);
    expect(resolveEcbMock).not.toHaveBeenCalled();
  });

  it('answers the rate and whether it is the day own fixing', async () => {
    const response = await GET(request('currency=USD&date=2026-11-16'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ rate: 0.9123, isLatest: false });
    expect(resolveEcbMock.mock.calls[0][0]).toBe('USD');
    expect(resolveEcbMock.mock.calls[0][1]).toBeInstanceOf(Date);
  });

  it('answers 503 when no rate can be read', async () => {
    resolveEcbMock.mockResolvedValue(null);
    const response = await GET(request('currency=USD&date=2026-11-16'));
    expect(response.status).toBe(503);
  });
});
