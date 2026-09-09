import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

/**
 * Loading a cron route is a FIXTURE, not a measurement.
 *
 * These routes pull a large dependency tree, and an `await import()` written inside a test body
 * charges that one-time cost to whichever case happens to run first. Under a full-suite run that
 * cold import exceeds Vitest's 5 s default and the first one or two cases fail — on code that was
 * never at fault, at a spot that moves with the run order, which is exactly what made this file
 * read as flaky rather than as slow. Every later case passed only because the module was already
 * cached.
 *
 * Hoisting the import into `beforeAll` changes nothing semantically — the module was already
 * shared across the cases in a block, and `verifyCronSecret` reads `process.env.CRON_SECRET` at
 * CALL time, so the per-test `vi.stubEnv` still decides the outcome. What changes is who pays:
 * one hook, with a timeout sized for a cold module graph, instead of an arbitrary test.
 */
const MODULE_LOAD_TIMEOUT_MS = 60_000;

/** A cron route's GET. `NextResponse` extends `Response`, so this is the honest shared shape. */
type CronRouteHandler = (request: NextRequest) => Promise<Response>;

// ─── Unit tests for verifyCronSecret ────────────────────────────────────────

describe('verifyCronSecret', () => {
  let verifyCronSecret: (provided: string | null | undefined) => boolean;

  beforeAll(async () => {
    ({ verifyCronSecret } = await import('@/lib/server/apiAuth'));
  }, MODULE_LOAD_TIMEOUT_MS);

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'super-secret-value');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when the provided value matches the env secret', () => {
    expect(verifyCronSecret('super-secret-value')).toBe(true);
  });

  it('returns false when the provided value does not match', () => {
    expect(verifyCronSecret('wrong-secret')).toBe(false);
  });

  it('returns false when the provided value is an empty string', () => {
    expect(verifyCronSecret('')).toBe(false);
  });

  it('returns false when the provided value is null', () => {
    expect(verifyCronSecret(null)).toBe(false);
  });

  it('returns false when the provided value is undefined', () => {
    expect(verifyCronSecret(undefined)).toBe(false);
  });

  it('returns false when CRON_SECRET env is not set', () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(verifyCronSecret('any-value')).toBe(false);
  });
});

// ─── Route-level test for daily-dividend-processing ─────────────────────────

describe('GET /api/cron/daily-dividend-processing auth', () => {
  let GET: CronRouteHandler;

  beforeAll(async () => {
    ({ GET } = await import('@/app/api/cron/daily-dividend-processing/route'));
  }, MODULE_LOAD_TIMEOUT_MS);

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
    const response = await GET(
      makeRequest('http://localhost/api/cron/daily-dividend-processing')
    );

    expect(response.status).toBe(401);
  });

  it('returns 200 with correct secret when no users are present', async () => {
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
  let GET: CronRouteHandler;

  beforeAll(async () => {
    ({ GET } = await import('@/app/api/cron/monthly-snapshot/route'));
  }, MODULE_LOAD_TIMEOUT_MS);

  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('returns 401 when no Authorization header is present', async () => {
    const response = await GET(
      makeRequest('http://localhost/api/cron/monthly-snapshot')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when the Authorization header carries a wrong secret', async () => {
    const response = await GET(
      makeRequest('http://localhost/api/cron/monthly-snapshot', 'Bearer wrong-secret')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 200 with correct secret when no users are present', async () => {
    const response = await GET(
      makeRequest('http://localhost/api/cron/monthly-snapshot', 'Bearer test-cron-secret')
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });
});
