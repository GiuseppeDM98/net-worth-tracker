import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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
  snapshotDocGetMock,
  snapshotDocSetMock,
  overviewSummaryDocGetMock,
  overviewSummaryDocSetMock,
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
  snapshotDocGetMock: vi.fn(),
  snapshotDocSetMock: vi.fn(),
  overviewSummaryDocGetMock: vi.fn(),
  overviewSummaryDocSetMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'assets') {
        return {
          where: vi.fn(() => ({
            get: assetsWhereGetMock,
          })),
        };
      }

      if (name === 'monthly-snapshots') {
        return {
          doc: vi.fn(() => ({
            get: snapshotDocGetMock,
            set: snapshotDocSetMock,
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

vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: vi.fn((asset: any) => asset.quantity * asset.currentPrice),
  calculateTotalValue: vi.fn(() => 1000),
  calculateLiquidNetWorth: vi.fn(() => 700),
  calculateIlliquidNetWorth: vi.fn(() => 300),
  calculateFIRENetWorth: vi.fn(() => 900),
}));

vi.mock('@/lib/utils/dateHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/dateHelpers')>('@/lib/utils/dateHelpers');

  return {
    ...actual,
    getItalyMonthYear: vi.fn(() => ({ month: 4, year: 2026 })),
  };
});

import { GET as getDividendsRoute } from '@/app/api/dividends/route';
import { DELETE as deleteDividendRoute } from '@/app/api/dividends/[dividendId]/route';
import { POST as updatePricesRoute } from '@/app/api/prices/update/route';
import { POST as snapshotRoute } from '@/app/api/portfolio/snapshot/route';
import { GET as dashboardOverviewRoute } from '@/app/api/dashboard/overview/route';
import { POST as invalidateDashboardOverviewRoute } from '@/app/api/dashboard/overview/invalidate/route';

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

    snapshotDocGetMock.mockResolvedValue({ exists: false });
    snapshotDocSetMock.mockResolvedValue(undefined);
    overviewSummaryDocGetMock.mockResolvedValue({ exists: false });
    overviewSummaryDocSetMock.mockResolvedValue(undefined);
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
      error: 'Authenticated user does not match requested user',
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
        updatedAt: new Date('2026-04-06T10:00:00.000Z'),
        computedAt: new Date('2026-04-06T10:00:00.000Z'),
        sourceVersion: 1,
        invalidatedAt: null,
      }),
    });

    const response = await dashboardOverviewRoute(
      createJsonRequest('http://localhost/api/dashboard/overview', {
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
        sourceVersion: 1,
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
      error: 'Resource does not belong to authenticated user',
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
      error: 'Authenticated user does not match requested user',
    });
    expect(updateUserAssetPricesMock).not.toHaveBeenCalled();
  });

  it('invalidates the overview summary via authenticated route', async () => {
    const response = await invalidateDashboardOverviewRoute(
      createJsonRequest('http://localhost/api/dashboard/overview/invalidate', {
        method: 'POST',
        body: { reason: 'expense_created' },
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
});
