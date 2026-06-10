import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({
  auth: { currentUser: null },
  db: {},
}));

// Mocks needed by the daily-dividend-processing route
const { runDividendScrapingMock, runExpenseCreationMock, runNextCouponSchedulingMock } =
  vi.hoisted(() => ({
    runDividendScrapingMock: vi.fn(),
    runExpenseCreationMock: vi.fn(),
    runNextCouponSchedulingMock: vi.fn(),
  }));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  adminDb: {
    collection: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
    })),
  },
}));

vi.mock('@/lib/server/dividendProcessor', () => ({
  runDividendScraping: runDividendScrapingMock,
  runExpenseCreation: runExpenseCreationMock,
  runNextCouponScheduling: runNextCouponSchedulingMock,
}));

function makeRequest(url: string, authHeader?: string): NextRequest {
  return new NextRequest(url, {
    headers: authHeader ? { authorization: authHeader } : {},
  });
}

// ─── Unit tests for verifyCronSecret ────────────────────────────────────────

describe('verifyCronSecret', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when the provided value matches the env secret', async () => {
    const { verifyCronSecret } = await import('@/lib/server/apiAuth');
    expect(verifyCronSecret('super-secret-value')).toBe(true);
  });

  it('returns false when the provided value does not match', async () => {
    const { verifyCronSecret } = await import('@/lib/server/apiAuth');
    expect(verifyCronSecret('wrong-secret')).toBe(false);
  });

  it('returns false when the provided value is an empty string', async () => {
    const { verifyCronSecret } = await import('@/lib/server/apiAuth');
    expect(verifyCronSecret('')).toBe(false);
  });

  it('returns false when the provided value is null', async () => {
    const { verifyCronSecret } = await import('@/lib/server/apiAuth');
    expect(verifyCronSecret(null)).toBe(false);
  });

  it('returns false when the provided value is undefined', async () => {
    const { verifyCronSecret } = await import('@/lib/server/apiAuth');
    expect(verifyCronSecret(undefined)).toBe(false);
  });

  it('returns false when CRON_SECRET env is not set', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const { verifyCronSecret } = await import('@/lib/server/apiAuth');
    expect(verifyCronSecret('any-value')).toBe(false);
  });
});

// ─── Route-level test for daily-dividend-processing ─────────────────────────

describe('GET /api/cron/daily-dividend-processing auth', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    runDividendScrapingMock.mockResolvedValue({ scrapedCount: 0, errorCount: 0 });
    runExpenseCreationMock.mockResolvedValue({ createdCount: 0, errorCount: 0 });
    runNextCouponSchedulingMock.mockResolvedValue({ scheduledCount: 0, errorCount: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('returns 401 when the Authorization header carries a wrong secret', async () => {
    const { GET } = await import(
      '@/app/api/cron/daily-dividend-processing/route'
    );

    const response = await GET(
      makeRequest(
        'http://localhost/api/cron/daily-dividend-processing',
        'Bearer wrong-secret'
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when no Authorization header is present', async () => {
    const { GET } = await import(
      '@/app/api/cron/daily-dividend-processing/route'
    );

    const response = await GET(
      makeRequest('http://localhost/api/cron/daily-dividend-processing')
    );

    expect(response.status).toBe(401);
  });
});
