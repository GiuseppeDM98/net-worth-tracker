import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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

vi.mock('@/lib/utils/dateHelpers', () => ({
  getItalyMonthYear: vi.fn(() => ({ month: 4, year: 2026 })),
}));

import { GET as getDividendsRoute } from '@/app/api/dividends/route';
import { DELETE as deleteDividendRoute } from '@/app/api/dividends/[dividendId]/route';
import { POST as updatePricesRoute } from '@/app/api/prices/update/route';
import { POST as snapshotRoute } from '@/app/api/portfolio/snapshot/route';

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
