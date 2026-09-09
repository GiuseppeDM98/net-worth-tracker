import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Asset } from '@/types/assets';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({
  auth: {
    currentUser: null,
  },
  db: {},
}));

const {
  verifyIdTokenMock,
  getAllDividendsMock,
  getDividendByIdMock,
  deleteDividendMock,
  updateUserAssetPricesMock,
  updateExpenseFromDividendMock,
  deleteExpenseForDividendMock,
  getSettingsMock,
  getCategoryByIdMock,
  assetsWhereGetMock,
  monthlySnapshotsGetMock,
  expensesGetMock,
  assetAllocationTargetsDocGetMock,
  snapshotDocGetMock,
  snapshotDocSetMock,
  overviewSummaryDocGetMock,
  overviewSummaryDocSetMock,
  accountAccessDocGetMock,
  goalBasedInvestingDocGetMock,
  goalBasedInvestingDocSetMock,
  runTransactionMock,
  getQuoteMock,
  getBondPriceByIsinMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getAllDividendsMock: vi.fn(),
  getDividendByIdMock: vi.fn(),
  deleteDividendMock: vi.fn(),
  updateUserAssetPricesMock: vi.fn(),
  updateExpenseFromDividendMock: vi.fn(),
  deleteExpenseForDividendMock: vi.fn(),
  getSettingsMock: vi.fn(),
  getCategoryByIdMock: vi.fn(),
  assetsWhereGetMock: vi.fn(),
  monthlySnapshotsGetMock: vi.fn(),
  expensesGetMock: vi.fn(),
  assetAllocationTargetsDocGetMock: vi.fn(),
  snapshotDocGetMock: vi.fn(),
  snapshotDocSetMock: vi.fn(),
  overviewSummaryDocGetMock: vi.fn(),
  overviewSummaryDocSetMock: vi.fn(),
  accountAccessDocGetMock: vi.fn(),
  goalBasedInvestingDocGetMock: vi.fn(),
  goalBasedInvestingDocSetMock: vi.fn(),
  runTransactionMock: vi.fn(),
  getQuoteMock: vi.fn(),
  getBondPriceByIsinMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
  adminDb: {
    // POST /api/goals appends inside a transaction: the fake hands the callback a tx
    // whose get/set proxy the same doc mocks the rest of the file already asserts on.
    runTransaction: runTransactionMock,
    collection: vi.fn((name: string) => {
      const createQueryChain = (finalGetMock: ReturnType<typeof vi.fn>) => {
        const chain = {
          where: vi.fn(() => chain),
          orderBy: vi.fn(() => chain),
          get: finalGetMock,
        };

        return chain;
      };

      if (name === 'assets') {
        return createQueryChain(assetsWhereGetMock);
      }

      if (name === 'monthly-snapshots') {
        return {
          where: vi.fn(() => {
            const chain = {
              orderBy: vi.fn(() => chain),
              get: monthlySnapshotsGetMock,
            };

            return chain;
          }),
          doc: vi.fn(() => ({
            get: snapshotDocGetMock,
            set: snapshotDocSetMock,
          })),
        };
      }

      if (name === 'expenses') {
        return createQueryChain(expensesGetMock);
      }

      if (name === 'assetAllocationTargets') {
        return {
          doc: vi.fn(() => ({
            get: assetAllocationTargetsDocGetMock,
          })),
        };
      }

      if (name === 'goalBasedInvesting') {
        return {
          doc: vi.fn(() => ({
            get: goalBasedInvestingDocGetMock,
            set: goalBasedInvestingDocSetMock,
          })),
        };
      }

      if (name === 'dashboardOverviewSummaries') {
        return {
          doc: vi.fn(() => ({
            get: overviewSummaryDocGetMock,
            set: overviewSummaryDocSetMock,
          })),
        };
      }

      // Delegated-access lookup performed by assertCanAccessAccount when the
      // caller's uid differs from the requested owner.
      if (name === 'account-access') {
        return {
          doc: vi.fn(() => ({
            get: accountAccessDocGetMock,
          })),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));

vi.mock('@/lib/services/dividendService', () => ({
  getAllDividends: getAllDividendsMock,
  getDividendsByAsset: vi.fn(),
  getDividendsByDateRange: vi.fn(),
  createDividend: vi.fn(),
  deleteUpcomingCouponsForAsset: vi.fn(),
  deleteUpcomingFinalPremiumForAsset: vi.fn(),
  getDividendById: getDividendByIdMock,
  updateDividend: vi.fn(),
  deleteDividend: deleteDividendMock,
}));

vi.mock('@/lib/services/dividendIncomeService', () => ({
  createExpenseFromDividend: vi.fn(),
  updateExpenseFromDividend: updateExpenseFromDividendMock,
  deleteExpenseForDividend: deleteExpenseForDividendMock,
}));

vi.mock('@/lib/services/assetAllocationService', () => ({
  calculateCurrentAllocation: vi.fn(() => ({
    byAssetClass: {
      equity: 1000,
    },
  })),
  getSettings: getSettingsMock,
}));

vi.mock('@/lib/services/expenseCategoryService', () => ({
  getCategoryById: getCategoryByIdMock,
}));

vi.mock('@/lib/helpers/priceUpdater', () => ({
  updateUserAssetPrices: updateUserAssetPricesMock,
}));

// Without this mock, the quote route's server-side USD→EUR pre-conversion reaches the
// real Frankfurter API from inside the test — usually fast enough to pass, occasionally
// slow enough under full-suite load to time the test out.
vi.mock('@/lib/services/currencyConversionService', () => ({
  convertToEur: vi.fn().mockResolvedValue(185),
}));

vi.mock('@/lib/services/yahooFinanceService', () => ({
  getQuote: getQuoteMock,
}));

vi.mock('@/lib/services/borsaItalianaBondScraperService', () => ({
  getBondPriceByIsin: getBondPriceByIsinMock,
}));

// Use importOriginal so any new exports from assetService are included automatically.
// Only override the functions whose return values matter for the route tests.
vi.mock('@/lib/services/assetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/assetService')>();
  return {
    ...actual,
    calculateAssetValue: vi.fn((asset: Asset) => asset.quantity * asset.currentPrice),
    calculateTotalValue: vi.fn(() => 1000),
    calculateLiquidNetWorth: vi.fn(() => 700),
    calculateIlliquidNetWorth: vi.fn(() => 300),
    calculateFIRENetWorth: vi.fn(() => 900),
    calculateTotalEstimatedTaxes: vi.fn(() => 0),
    calculateLiquidEstimatedTaxes: vi.fn(() => 0),
    calculateNetTotal: vi.fn(() => 1000),
    calculateTotalUnrealizedGains: vi.fn(() => 0),
    calculatePortfolioWeightedTER: vi.fn(() => 0),
    calculateAnnualPortfolioCost: vi.fn(() => 0),
    calculateStampDuty: vi.fn(() => 0),
  };
});

vi.mock('@/lib/utils/dateHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/dateHelpers')>('@/lib/utils/dateHelpers');

  return {
    ...actual,
    getItalyMonthYear: vi.fn(() => ({ month: 4, year: 2026 })),
  };
});

import { POST as createGoalRoute } from '@/app/api/goals/route';
import { GET as getDividendsRoute } from '@/app/api/dividends/route';
import { DELETE as deleteDividendRoute } from '@/app/api/dividends/[dividendId]/route';
import { POST as updatePricesRoute } from '@/app/api/prices/update/route';
import { GET as priceQuoteRoute } from '@/app/api/prices/quote/route';
import { GET as bondQuoteRoute } from '@/app/api/prices/bond-quote/route';
import { POST as snapshotRoute } from '@/app/api/portfolio/snapshot/route';
import { GET as dashboardOverviewRoute } from '@/app/api/dashboard/overview/route';
import { POST as invalidateDashboardOverviewRoute } from '@/app/api/dashboard/overview/invalidate/route';
import { DASHBOARD_OVERVIEW_SOURCE_VERSION } from '@/lib/services/dashboardOverviewConstants';

function createJsonRequest(
  url: string,
  {
    method = 'GET',
    body,
    headers,
  }: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Private API route auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';

    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    // Default: no delegated-access grant exists, so a caller acting on another
    // user's account is denied (403) unless a test opts into membership.
    accountAccessDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    getAllDividendsMock.mockResolvedValue([]);
    getDividendByIdMock.mockResolvedValue(null);
    updateUserAssetPricesMock.mockResolvedValue({
      success: true,
      message: 'ok',
      updatedCount: 1,
      failedTickers: [],
    });

    assetsWhereGetMock.mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'asset-1',
          data: () => ({
            userId: 'user-1',
            ticker: 'VWCE',
            name: 'Vanguard FTSE All-World',
            quantity: 10,
            currentPrice: 100,
          }),
        },
      ],
    });

    // `data()` matters: the route carries the user-authored fields of the stored
    // snapshot (the Storico note) across its full-replace write.
    snapshotDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    snapshotDocSetMock.mockResolvedValue(undefined);
    overviewSummaryDocGetMock.mockResolvedValue({ exists: false });
    overviewSummaryDocSetMock.mockResolvedValue(undefined);
    goalBasedInvestingDocGetMock.mockResolvedValue({ exists: false });
    goalBasedInvestingDocSetMock.mockReturnValue(undefined);
    runTransactionMock.mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        get: (ref: { get: () => unknown }) => ref.get(),
        set: (ref: { set: (data: unknown) => void }, data: unknown) => ref.set(data),
      })
    );
    monthlySnapshotsGetMock.mockResolvedValue({
      docs: [],
    });
    expensesGetMock.mockResolvedValue({
      docs: [],
    });
    assetAllocationTargetsDocGetMock.mockResolvedValue({
      exists: false,
    });
  });

  // ── POST /api/goals (assistant goal proposal → Conferma) ──────────────────
  //
  // The security-guard pair: the SAME request shape against the caller's own account
  // (must succeed) and against someone else's (must fail). A negative test alone would
  // pass just as well against a route that never writes anything.

  it('creates a goal for the authenticated user\'s own account', async () => {
    const response = await createGoalRoute(
      createJsonRequest('http://localhost/api/goals', {
        method: 'POST',
        body: {
          userId: 'user-1',
          goal: { name: 'Acquisto Casa', priority: 'alta', targetAmount: 100000 },
        },
        headers: { Authorization: 'Bearer valid-token' },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      goal: { name: 'Acquisto Casa', priority: 'alta', targetAmount: 100000 },
    });
    expect(goalBasedInvestingDocSetMock).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when creating a goal on another user\'s account', async () => {
    const response = await createGoalRoute(
      createJsonRequest('http://localhost/api/goals', {
        method: 'POST',
        body: {
          userId: 'user-2',
          goal: { name: 'Acquisto Casa', priority: 'alta', targetAmount: 100000 },
        },
        headers: { Authorization: 'Bearer valid-token' },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Authenticated user does not have access to requested account',
    });
    expect(goalBasedInvestingDocSetMock).not.toHaveBeenCalled();
  });

  it('returns 401 for goal creation without Authorization header', async () => {
    const response = await createGoalRoute(
      createJsonRequest('http://localhost/api/goals', {
        method: 'POST',
        body: { userId: 'user-1', goal: { name: 'Acquisto Casa', priority: 'alta' } },
      })
    );

    expect(response.status).toBe(401);
    expect(goalBasedInvestingDocSetMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a goal whose recommended allocation does not total 100', async () => {
    const response = await createGoalRoute(
      createJsonRequest('http://localhost/api/goals', {
        method: 'POST',
        body: {
          userId: 'user-1',
          goal: {
            name: 'Acquisto Casa',
            priority: 'alta',
            recommendedAllocation: { equity: 60, bonds: 20 },
          },
        },
        headers: { Authorization: 'Bearer valid-token' },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid request' });
    expect(goalBasedInvestingDocSetMock).not.toHaveBeenCalled();
  });

  it('appends to the existing goals instead of replacing them', async () => {
    goalBasedInvestingDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        goals: [{ id: 'existing', name: 'Pensione', priority: 'media', color: '#3B82F6' }],
        assignments: [{ goalId: 'existing', assetId: 'asset-1', percentage: 50 }],
      }),
    });

    const response = await createGoalRoute(
      createJsonRequest('http://localhost/api/goals', {
        method: 'POST',
        body: { userId: 'user-1', goal: { name: 'Auto', priority: 'bassa' } },
        headers: { Authorization: 'Bearer valid-token' },
      })
    );

    expect(response.status).toBe(200);
    const written = goalBasedInvestingDocSetMock.mock.calls[0][0] as {
      goals: { name: string; color: string }[];
      assignments: unknown[];
    };
    expect(written.goals.map((g) => g.name)).toEqual(['Pensione', 'Auto']);
    // Assignments belong to the other goal and must survive the whole-document rewrite.
    expect(written.assignments).toHaveLength(1);
    // A colour already in use is skipped, or two goals would be the same hue everywhere.
    expect(written.goals[1].color).not.toBe(written.goals[0].color);
  });

  it('returns 401 for private dividends route without Authorization header', async () => {
    const response = await getDividendsRoute(
      createJsonRequest('http://localhost/api/dividends?userId=user-1')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(getAllDividendsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when a valid token targets another userId', async () => {
    const response = await getDividendsRoute(
      createJsonRequest('http://localhost/api/dividends?userId=user-2', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Authenticated user does not have access to requested account',
    });
    expect(verifyIdTokenMock).toHaveBeenCalledWith('valid-token');
    expect(getAllDividendsMock).not.toHaveBeenCalled();
  });

  it('allows a matching authenticated user on dividends route', async () => {
    getAllDividendsMock.mockResolvedValue([{ id: 'div-1' }]);

    const response = await getDividendsRoute(
      createJsonRequest('http://localhost/api/dividends?userId=user-1', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      count: 1,
    });
    expect(getAllDividendsMock).toHaveBeenCalledWith('user-1');
  });

  it('returns 401 for dashboard overview without Authorization header', async () => {
    const response = await dashboardOverviewRoute(
      createJsonRequest('http://localhost/api/dashboard/overview')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(overviewSummaryDocGetMock).not.toHaveBeenCalled();
  });

  it('allows a matching authenticated user on dashboard overview route', async () => {
    overviewSummaryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        payload: {
          metrics: {
            totalValue: 1234,
            liquidNetWorth: 800,
            illiquidNetWorth: 434,
            netTotal: 1200,
            liquidNetTotal: 780,
            unrealizedGains: 50,
            estimatedTaxes: 20,
            portfolioTER: 0.25,
            annualPortfolioCost: 12,
            annualStampDuty: 3,
          },
          variations: {
            monthly: null,
            yearly: null,
          },
          expenseStats: null,
          charts: {
            assetClassData: [],
            assetData: [],
            liquidityData: [],
          },
          flags: {
            assetCount: 1,
            hasCostBasisTracking: false,
            hasTERTracking: true,
            hasStampDuty: true,
            currentMonthSnapshotExists: false,
          },
        },
        updatedAt: new Date(),
        computedAt: new Date(),
        sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
        invalidatedAt: null,
      }),
    });

    const response = await dashboardOverviewRoute(
      createJsonRequest('http://localhost/api/dashboard/overview?userId=user-1', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      metrics: {
        totalValue: 1234,
      },
      freshness: {
        source: 'materialized_summary',
        sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
        stale: false,
      },
    });
    expect(verifyIdTokenMock).toHaveBeenCalledWith('valid-token');
    expect(overviewSummaryDocGetMock).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when deleting a dividend owned by another user', async () => {
    getDividendByIdMock.mockResolvedValue({
      id: 'div-1',
      userId: 'user-2',
      expenseId: undefined,
    });

    const response = await deleteDividendRoute(
      createJsonRequest('http://localhost/api/dividends/div-1', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ dividendId: 'div-1' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Authenticated user does not have access to requested account',
    });
    expect(deleteDividendMock).not.toHaveBeenCalled();
    expect(deleteExpenseForDividendMock).not.toHaveBeenCalled();
  });

  it('allows price updates for the authenticated user', async () => {
    const response = await updatePricesRoute(
      createJsonRequest('http://localhost/api/prices/update', {
        method: 'POST',
        body: { userId: 'user-1' },
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'ok',
      updatedCount: 1,
      failedTickers: [],
    });
    expect(updateUserAssetPricesMock).toHaveBeenCalledWith('user-1');
  });

  it('returns 403 on price update when token and userId do not match', async () => {
    const response = await updatePricesRoute(
      createJsonRequest('http://localhost/api/prices/update', {
        method: 'POST',
        body: { userId: 'user-2' },
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Authenticated user does not have access to requested account',
    });
    expect(updateUserAssetPricesMock).not.toHaveBeenCalled();
  });

  it('invalidates the overview summary via authenticated route', async () => {
    const response = await invalidateDashboardOverviewRoute(
      createJsonRequest('http://localhost/api/dashboard/overview/invalidate', {
        method: 'POST',
        body: { ownerId: 'user-1', reason: 'expense_created' },
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(verifyIdTokenMock).toHaveBeenCalledWith('valid-token');
    expect(overviewSummaryDocSetMock).toHaveBeenCalledTimes(1);
    expect(overviewSummaryDocSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        lastInvalidationReason: 'expense_created',
      }),
      { merge: true }
    );
  });

  it('returns 401 for price quote route without Authorization header', async () => {
    const response = await priceQuoteRoute(
      createJsonRequest('http://localhost/api/prices/quote?ticker=AAPL')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(getQuoteMock).not.toHaveBeenCalled();
  });

  it('returns 200 for price quote route with valid token', async () => {
    getQuoteMock.mockResolvedValue({
      ticker: 'AAPL',
      price: 200,
      currency: 'USD',
    });

    const response = await priceQuoteRoute(
      createJsonRequest('http://localhost/api/prices/quote?ticker=AAPL', {
        headers: { Authorization: 'Bearer valid-token' },
      })
    );

    expect(response.status).toBe(200);
    expect(verifyIdTokenMock).toHaveBeenCalledWith('valid-token');
    expect(getQuoteMock).toHaveBeenCalledWith('AAPL');
  });

  it('returns 401 for bond quote route without Authorization header', async () => {
    const response = await bondQuoteRoute(
      createJsonRequest('http://localhost/api/prices/bond-quote?isin=IT0005672024')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(getBondPriceByIsinMock).not.toHaveBeenCalled();
  });

  it('returns 200 for bond quote route with valid token', async () => {
    getBondPriceByIsinMock.mockResolvedValue({
      isin: 'IT0005672024',
      price: 98.5,
      currency: 'EUR',
      priceType: 'ultimo',
    });

    const response = await bondQuoteRoute(
      createJsonRequest('http://localhost/api/prices/bond-quote?isin=IT0005672024', {
        headers: { Authorization: 'Bearer valid-token' },
      })
    );

    expect(response.status).toBe(200);
    expect(verifyIdTokenMock).toHaveBeenCalledWith('valid-token');
    expect(getBondPriceByIsinMock).toHaveBeenCalledWith('IT0005672024');
  });

  it('returns 400 for price quote with malformed ticker', async () => {
    const response = await priceQuoteRoute(
      createJsonRequest('http://localhost/api/prices/quote?ticker=VOO%20ETF%3BDROP', {
        headers: { Authorization: 'Bearer valid-token' },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid request' });
    expect(getQuoteMock).not.toHaveBeenCalled();
  });

  it('returns 400 for bond quote with malformed ISIN', async () => {
    const response = await bondQuoteRoute(
      createJsonRequest('http://localhost/api/prices/bond-quote?isin=INVALID', {
        headers: { Authorization: 'Bearer valid-token' },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid request' });
    expect(getBondPriceByIsinMock).not.toHaveBeenCalled();
  });

  it('returns 400 for snapshot with out-of-range month', async () => {
    const response = await snapshotRoute(
      createJsonRequest('http://localhost/api/portfolio/snapshot', {
        method: 'POST',
        body: {
          userId: 'user-1',
          cronSecret: 'test-cron-secret',
          month: 13,
        },
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid request' });
    expect(snapshotDocSetMock).not.toHaveBeenCalled();
  });

  it('allows snapshot creation for cron callers using cronSecret without Firebase auth', async () => {
    const response = await snapshotRoute(
      createJsonRequest('http://localhost/api/portfolio/snapshot', {
        method: 'POST',
        body: {
          userId: 'user-1',
          cronSecret: 'test-cron-secret',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      snapshotId: 'user-1-2026-4',
    });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
    expect(snapshotDocSetMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the Storico note of the snapshot it overwrites', async () => {
    // The cron rewrites the CURRENT month every evening with a full `.set()`, so before
    // 2026-09-07 a note typed on Storico lasted exactly until that night.
    snapshotDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ userId: 'user-1', totalNetWorth: 1, note: 'ornitorinco' }),
    });

    await snapshotRoute(
      createJsonRequest('http://localhost/api/portfolio/snapshot', {
        method: 'POST',
        body: { userId: 'user-1', cronSecret: 'test-cron-secret' },
      })
    );

    const written = snapshotDocSetMock.mock.calls[0][0];
    expect(written.note).toBe('ornitorinco');
    // The recomputed half is still replaced, never merged with the stored document.
    expect(written.totalNetWorth).not.toBe(1);
  });
});
