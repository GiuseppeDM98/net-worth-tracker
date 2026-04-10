import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({
  auth: {
    currentUser: null,
  },
  db: {},
}));

const {
  overviewSummaryDocGetMock,
  overviewSummaryDocSetMock,
  assetsGetMock,
  snapshotsGetMock,
  settingsDocGetMock,
  expensesGetMock,
} = vi.hoisted(() => ({
  overviewSummaryDocGetMock: vi.fn(),
  overviewSummaryDocSetMock: vi.fn(),
  assetsGetMock: vi.fn(),
  snapshotsGetMock: vi.fn(),
  settingsDocGetMock: vi.fn(),
  expensesGetMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'dashboardOverviewSummaries') {
        return {
          doc: vi.fn(() => ({
            get: overviewSummaryDocGetMock,
            set: overviewSummaryDocSetMock,
          })),
        };
      }

      if (name === 'assets') {
        return {
          where: vi.fn(() => ({
            get: assetsGetMock,
          })),
        };
      }

      if (name === 'monthly-snapshots') {
        return {
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                get: snapshotsGetMock,
              })),
            })),
          })),
        };
      }

      if (name === 'assetAllocationTargets') {
        return {
          doc: vi.fn(() => ({
            get: settingsDocGetMock,
          })),
        };
      }

      if (name === 'expenses') {
        return {
          where: vi.fn(() => ({
            where: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn(() => ({
                  get: expensesGetMock,
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));

vi.mock('@/lib/utils/dateHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/dateHelpers')>('@/lib/utils/dateHelpers');

  return {
    ...actual,
    getItalyMonthYear: vi.fn(() => ({ month: 4, year: 2026 })),
  };
});

import { getDashboardOverview } from '@/lib/services/dashboardOverviewService';

describe('dashboardOverviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overviewSummaryDocSetMock.mockResolvedValue(undefined);
  });

  it('returns the materialized summary when it is still fresh', async () => {
    overviewSummaryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        payload: {
          metrics: {
            totalValue: 100000,
            liquidNetWorth: 25000,
            illiquidNetWorth: 75000,
            netTotal: 98000,
            liquidNetTotal: 24000,
            unrealizedGains: 5000,
            estimatedTaxes: 2000,
            portfolioTER: 0.18,
            annualPortfolioCost: 180,
            annualStampDuty: 40,
          },
          variations: {
            monthly: { value: 1500, percentage: 1.5 },
            yearly: { value: 12000, percentage: 13.6 },
          },
          expenseStats: null,
          charts: {
            assetClassData: [],
            assetData: [],
            liquidityData: [],
          },
          flags: {
            assetCount: 3,
            hasCostBasisTracking: true,
            hasTERTracking: true,
            hasStampDuty: true,
            currentMonthSnapshotExists: false,
          },
        },
        updatedAt: new Date(),
        computedAt: new Date(),
        sourceVersion: 1,
        invalidatedAt: null,
      }),
    });

    const result = await getDashboardOverview('user-1');

    expect(result.metrics.totalValue).toBe(100000);
    expect(result.freshness.source).toBe('materialized_summary');
    expect(assetsGetMock).not.toHaveBeenCalled();
    expect(overviewSummaryDocSetMock).not.toHaveBeenCalled();
  });

  it('recomputes and persists a new summary when the materialized document is stale', async () => {
    overviewSummaryDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        payload: {
          metrics: {
            totalValue: 0,
            liquidNetWorth: 0,
            illiquidNetWorth: 0,
            netTotal: 0,
            liquidNetTotal: 0,
            unrealizedGains: 0,
            estimatedTaxes: 0,
            portfolioTER: 0,
            annualPortfolioCost: 0,
            annualStampDuty: 0,
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
            assetCount: 0,
            hasCostBasisTracking: false,
            hasTERTracking: false,
            hasStampDuty: false,
            currentMonthSnapshotExists: false,
          },
        },
        updatedAt: new Date('2026-04-06T08:00:00.000Z'),
        computedAt: new Date('2026-04-06T08:00:00.000Z'),
        sourceVersion: 1,
        invalidatedAt: new Date('2026-04-06T08:30:00.000Z'),
      }),
    });

    assetsGetMock.mockResolvedValue({
      docs: [
        {
          id: 'cash-1',
          data: () => ({
            userId: 'user-1',
            ticker: 'LIQ',
            name: 'Liquidita',
            type: 'cash',
            assetClass: 'cash',
            currency: 'EUR',
            quantity: 10000,
            currentPrice: 1,
            totalExpenseRatio: 0,
            averageCost: 0,
            taxRate: 0,
            stampDutyExempt: false,
            isLiquid: true,
            lastPriceUpdate: new Date('2026-04-06T09:00:00.000Z'),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-06T09:00:00.000Z'),
          }),
        },
        {
          id: 'etf-1',
          data: () => ({
            userId: 'user-1',
            ticker: 'VWCE',
            name: 'VWCE',
            type: 'etf',
            assetClass: 'equity',
            currency: 'EUR',
            quantity: 50,
            currentPrice: 200,
            averageCost: 150,
            taxRate: 26,
            totalExpenseRatio: 0.22,
            stampDutyExempt: false,
            isLiquid: true,
            lastPriceUpdate: new Date('2026-04-06T09:00:00.000Z'),
            createdAt: new Date('2025-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-04-06T09:00:00.000Z'),
          }),
        },
      ],
    });

    snapshotsGetMock.mockResolvedValue({
      docs: [
        {
          data: () => ({
            userId: 'user-1',
            year: 2025,
            month: 12,
            totalNetWorth: 18000,
            liquidNetWorth: 9000,
            illiquidNetWorth: 9000,
            createdAt: new Date('2025-12-31T23:00:00.000Z'),
          }),
        },
        {
          data: () => ({
            userId: 'user-1',
            year: 2026,
            month: 3,
            totalNetWorth: 19000,
            liquidNetWorth: 9500,
            illiquidNetWorth: 9500,
            createdAt: new Date('2026-03-31T22:00:00.000Z'),
          }),
        },
      ],
    });

    settingsDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        stampDutyEnabled: true,
        stampDutyRate: 0.2,
        checkingAccountSubCategory: '__none__',
        targets: {},
      }),
    });

    expensesGetMock
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'income-1',
            data: () => ({
              userId: 'user-1',
              type: 'income',
              categoryId: 'salary',
              categoryName: 'Stipendio',
              amount: 3000,
              currency: 'EUR',
              date: new Date('2026-04-02T10:00:00.000Z'),
              createdAt: new Date('2026-04-02T10:00:00.000Z'),
              updatedAt: new Date('2026-04-02T10:00:00.000Z'),
            }),
          },
          {
            id: 'expense-1',
            data: () => ({
              userId: 'user-1',
              type: 'fixed',
              categoryId: 'rent',
              categoryName: 'Affitto',
              amount: -1000,
              currency: 'EUR',
              date: new Date('2026-04-03T10:00:00.000Z'),
              createdAt: new Date('2026-04-03T10:00:00.000Z'),
              updatedAt: new Date('2026-04-03T10:00:00.000Z'),
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'income-prev',
            data: () => ({
              userId: 'user-1',
              type: 'income',
              categoryId: 'salary',
              categoryName: 'Stipendio',
              amount: 2500,
              currency: 'EUR',
              date: new Date('2026-03-02T10:00:00.000Z'),
              createdAt: new Date('2026-03-02T10:00:00.000Z'),
              updatedAt: new Date('2026-03-02T10:00:00.000Z'),
            }),
          },
          {
            id: 'expense-prev',
            data: () => ({
              userId: 'user-1',
              type: 'fixed',
              categoryId: 'rent',
              categoryName: 'Affitto',
              amount: -900,
              currency: 'EUR',
              date: new Date('2026-03-03T10:00:00.000Z'),
              createdAt: new Date('2026-03-03T10:00:00.000Z'),
              updatedAt: new Date('2026-03-03T10:00:00.000Z'),
            }),
          },
        ],
      });

    const result = await getDashboardOverview('user-1');

    expect(result.freshness.source).toBe('live_recompute');
    expect(result.metrics.totalValue).toBe(20000);
    expect(result.flags.assetCount).toBe(2);
    expect(result.flags.hasCostBasisTracking).toBe(true);
    expect(result.flags.hasTERTracking).toBe(true);
    expect(result.expenseStats?.currentMonth.net).toBe(2000);
    expect(result.variations.monthly?.value).toBe(1000);
    expect(result.variations.monthly?.percentage).toBeCloseTo(5.2631578947, 6);
    expect(overviewSummaryDocSetMock).toHaveBeenCalledTimes(1);
  });
});
