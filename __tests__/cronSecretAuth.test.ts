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

// Mocks needed by the monthly-snapshot cron route
vi.mock('@/lib/services/hallOfFameService.server', () => ({
  updateHallOfFame: vi.fn(),
}));

vi.mock('@/lib/server/monthlyEmailService', () => ({
  isLastDayOfMonthItaly: vi.fn(() => false),
  isLastDayOfQuarterItaly: vi.fn(() => false),
  isLastDayOfHalfYearItaly: vi.fn(() => false),
  isLastDayOfYearItaly: vi.fn(() => false),
  monthToQuarter: vi.fn(),
  monthToSemester: vi.fn(),
  getSettingsAdmin: vi.fn(),
  buildAndSendForPeriod: vi.fn(),
  buildAndSendQuarterly: vi.fn(),
  buildAndSendSemiAnnual: vi.fn(),
  buildAndSendYearly: vi.fn(),
}));

vi.mock('@/lib/server/ecbRatesService', () => ({
  refreshEcbRatesIfStale: vi.fn(),
}));

vi.mock('@/lib/server/weeklyBudgetEmailService', () => ({
  isWeeklyBudgetDayItaly: vi.fn(() => false),
  buildAndSendWeeklyBudget: vi.fn(),
}));

vi.mock('@/lib/utils/dateHelpers', () => ({
  getItalyMonthYear: vi.fn(() => ({ month: 4, year: 2026 })),
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

  it('returns 200 with correct secret when no users are present', async () => {
    const { GET } = await import(
      '@/app/api/cron/daily-dividend-processing/route'
    );

    const response = await GET(
      makeRequest(
        'http://localhost/api/cron/daily-dividend-processing',
        'Bearer test-cron-secret'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });
});

// ─── Route-level tests for monthly-snapshot ───────────────────────────────

describe('GET /api/cron/monthly-snapshot auth', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const { GET } = await import('@/app/api/cron/monthly-snapshot/route');

    const response = await GET(
      makeRequest('http://localhost/api/cron/monthly-snapshot')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when the Authorization header carries a wrong secret', async () => {
    const { GET } = await import('@/app/api/cron/monthly-snapshot/route');

    const response = await GET(
      makeRequest('http://localhost/api/cron/monthly-snapshot', 'Bearer wrong-secret')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 200 with correct secret when no users are present', async () => {
    const { GET } = await import('@/app/api/cron/monthly-snapshot/route');

    const response = await GET(
      makeRequest('http://localhost/api/cron/monthly-snapshot', 'Bearer test-cron-secret')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });
});
