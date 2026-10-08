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
  overviewSummaryDocUpdateMock,
  overviewSummaryDocCreateMock,
  assetsGetMock,
  snapshotsGetMock,
  settingsDocGetMock,
  expensesGetMock,
  goalDocGetMock,
  assetTransactionsGetMock,
  pensionContributionsGetMock,
  afterCallbacks,
} = vi.hoisted(() => ({
  overviewSummaryDocGetMock: vi.fn(),
  overviewSummaryDocUpdateMock: vi.fn(),
  overviewSummaryDocCreateMock: vi.fn(),
  assetsGetMock: vi.fn(),
  snapshotsGetMock: vi.fn(),
  settingsDocGetMock: vi.fn(),
  expensesGetMock: vi.fn(),
  goalDocGetMock: vi.fn(),
  // An empty ledger by default (clearAllMocks keeps the implementation); one test fills it.
  assetTransactionsGetMock: vi.fn(async () => ({ docs: [] as unknown[] })),
  pensionContributionsGetMock: vi.fn(async () => ({ docs: [] as unknown[] })),
  // What the service hands to `after()`: run by the test, the way Next runs it once the response is sent.
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return {
    ...actual,
    after: vi.fn((callback: () => unknown) => {
      afterCallbacks.push(callback);
    }),
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'dashboardOverviewSummaries') {
        return {
          doc: vi.fn(() => ({
            get: overviewSummaryDocGetMock,
            update: overviewSummaryDocUpdateMock,
            create: overviewSummaryDocCreateMock,
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

      if (name === 'goalBasedInvesting') {
        return {
          doc: vi.fn(() => ({
            get: goalDocGetMock,
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

      if (name === 'pensionContributions') {
        return {
          where: vi.fn(() => ({
            get: pensionContributionsGetMock,
          })),
        };
      }

      if (name === 'assetTransactions') {
        return {
          where: vi.fn(() => ({
            get: assetTransactionsGetMock,
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
import { DASHBOARD_OVERVIEW_SOURCE_VERSION } from '@/lib/services/dashboardOverviewConstants';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

// The `updateTime` of the stale summary the recompute read: the write's precondition.
const STALE_SUMMARY_UPDATE_TIME = { seconds: 1775460600, nanoseconds: 0 };

describe('dashboardOverviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    overviewSummaryDocUpdateMock.mockResolvedValue(undefined);
    overviewSummaryDocCreateMock.mockResolvedValue(undefined);
    goalDocGetMock.mockResolvedValue({ exists: false });
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
        // Must match DASHBOARD_OVERVIEW_SOURCE_VERSION for the cache to be considered
        // fresh. Tests that rely on recompute can use an old version number.
        sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
        invalidatedAt: null,
      }),
    });

    const result = await getDashboardOverview('user-1');

    expect(result.metrics.totalValue).toBe(100000);
    expect(result.freshness.source).toBe('materialized_summary');
    expect(assetsGetMock).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it('recomputes and persists a new summary when the materialized document is stale', async () => {
    overviewSummaryDocGetMock.mockResolvedValue({
      exists: true,
      updateTime: STALE_SUMMARY_UPDATE_TIME,
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

    // Forty-four old months before the two that matter: «All» must carry every one of them
    // (the sparkline used to be capped at the last 40 snapshots).
    const oldMonths = Array.from({ length: 44 }, (_, i) => {
      const year = 2022 + Math.floor(i / 12);
      const month = (i % 12) + 1;
      return {
        data: () => ({
          userId: 'user-1',
          year,
          month,
          totalNetWorth: 10000 + i * 100,
          liquidNetWorth: 5000,
          illiquidNetWorth: 5000 + i * 100,
          createdAt: new Date(Date.UTC(year, month - 1, 28)),
        }),
      };
    });

    snapshotsGetMock.mockResolvedValue({
      docs: [
        ...oldMonths,
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

    // The ledger of etf-1: an opening position and a sell inside the mocked month (April 2026),
    // so the payload can name what left the portfolio besides the market.
    const ledgerRow = (id: string, fields: Record<string, unknown>) => ({
      id,
      data: () => ({ userId: 'user-1', assetId: 'etf-1', priceEur: fields.pricePerUnit, createdAt: new Date('2026-01-10T10:00:00.000Z'), updatedAt: new Date('2026-01-10T10:00:00.000Z'), ...fields }),
    });
    assetTransactionsGetMock.mockResolvedValueOnce({
      docs: [
        ledgerRow('t-open', { type: 'buy', isBaseline: true, date: new Date('2026-01-10T10:00:00.000Z'), quantity: 60, pricePerUnit: 150 }),
        ledgerRow('t-sell', { type: 'sell', date: new Date('2026-04-05T10:00:00.000Z'), quantity: 10, pricePerUnit: 200, fees: 5 }),
      ],
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
          {
            // Dated after "now": counted in the month, reported as scheduled for the projection.
            id: 'expense-scheduled',
            data: () => ({
              userId: 'user-1',
              type: 'fixed',
              categoryId: 'rent',
              categoryName: 'Rata',
              amount: -250,
              currency: 'EUR',
              date: new Date('2099-01-28T10:00:00.000Z'),
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
    // 44 old + Dec 2025 + Mar 2026 snapshots, plus the live point: nothing is cut.
    expect(result.sparklineData).toHaveLength(47);
    expect(result.sparklineData?.[0]).toMatchObject({ year: 2022, month: 1, totalNetWorth: 10000 });
    expect(result.expenseStats?.currentMonth.net).toBe(1750);
    expect(result.expenseStats?.currentMonth.expensesScheduled).toBe(250);
    // No income dated after today: the verdict's savings so far are the whole month's income.
    expect(result.expenseStats?.currentMonth.incomeScheduled).toBe(0);
    expect(result.variations.monthly?.value).toBe(1000);
    expect(result.variations.monthly?.percentage).toBeCloseTo(5.2631578947, 6);
    // 10 × 200 − 5 fees = 1.995 € of proceeds against a 150 € PMC: 495 € realized, 26% of it estimated.
    expect(result.monthSales).toMatchObject({ proceeds: 1995, realizedGain: 495, brokenLedgers: 0 });
    expect(result.monthSales?.estimatedTax).toBeCloseTo(130, 6); // 26% of 495 + the 5 € of sale fees
    expect(result.monthSales?.instruments).toEqual([
      { id: 'etf-1', name: 'VWCE', proceeds: 1995, realizedGain: 495, estimatedTax: expect.closeTo(130, 6), taxIsWithheld: false },
    ]);
    // The summary is written AFTER the response, and only if nothing touched it since the read.
    expect(overviewSummaryDocUpdateMock).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(overviewSummaryDocUpdateMock).toHaveBeenCalledTimes(1);
    expect(overviewSummaryDocUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', invalidatedAt: null, sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION }),
      { lastUpdateTime: STALE_SUMMARY_UPDATE_TIME }
    );
    expect(overviewSummaryDocCreateMock).not.toHaveBeenCalled();
  });

  it('publishes no sale when the month holds none, and survives a ledger read that fails', async () => {
    overviewSummaryDocGetMock.mockResolvedValue({ exists: false });
    assetsGetMock.mockResolvedValue({ docs: [] });
    snapshotsGetMock.mockResolvedValue({ docs: [] });
    settingsDocGetMock.mockResolvedValue({ exists: false });
    expensesGetMock.mockResolvedValue({ docs: [] });

    expect((await getDashboardOverview('user-1')).monthSales).toBeNull();

    assetTransactionsGetMock.mockRejectedValueOnce(new Error('ledger down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await getDashboardOverview('user-1')).monthSales).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('trade ledger'), expect.anything());
    warn.mockRestore();
    errorLog.mockRestore();
  });
});

describe('dashboardOverviewService — G/P in EUR on both sides (costBasisEur.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    overviewSummaryDocUpdateMock.mockResolvedValue(undefined);
    overviewSummaryDocCreateMock.mockResolvedValue(undefined);
    goalDocGetMock.mockResolvedValue({ exists: false });
    overviewSummaryDocGetMock.mockResolvedValue({ exists: false });
    snapshotsGetMock.mockResolvedValue({ docs: [] });
    settingsDocGetMock.mockResolvedValue({ exists: false });
    expensesGetMock.mockResolvedValue({ docs: [] });
  });

  const usdAsset = (id: string, extra: Record<string, unknown>) => ({
    id,
    data: () => ({
      userId: 'user-1',
      ticker: id.toUpperCase(),
      name: id,
      type: 'etf',
      assetClass: 'equity',
      currency: 'USD',
      quantity: 10,
      currentPrice: 145,
      currentPriceEur: 130,
      averageCost: 100,
      stampDutyExempt: false,
      isLiquid: true,
      lastPriceUpdate: new Date('2026-04-06T09:00:00.000Z'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-06T09:00:00.000Z'),
      ...extra,
    }),
  });

  it('measures a USD position against its EUR PMC with fees, and prints nothing for one without it', async () => {
    assetsGetMock.mockResolvedValue({
      docs: [
        // 10 units, EUR PMC 91 (fees included), worth 1.300 €: +390 €, +42,86 %, taxed at 26 %.
        usdAsset('vusa', { averageCostEur: 91, taxRate: 26 }),
        // Pre-backfill: only the native PMC — a G/P here would be dollars against euros.
        usdAsset('legacy', {}),
      ],
    });

    const result = await getDashboardOverview('user-1');

    expect(result.freshness.source).toBe('live_recompute');
    expect(result.metrics.unrealizedGains).toBeCloseTo(390, 6);
    expect(result.metrics.estimatedTaxes).toBeCloseTo(390 * 0.26, 6);
    expect(result.flags.hasCostBasisTracking).toBe(true);
    const byId = new Map((result.topAssets ?? []).map((a) => [a.id, a]));
    expect(byId.get('vusa')?.returnPercent).toBeCloseTo((390 / 910) * 100, 6);
    expect(byId.get('legacy')?.returnPercent).toBeNull();
  });

  it('reports no cost-basis tracking when the only PMCs are native ones on foreign assets', async () => {
    assetsGetMock.mockResolvedValue({ docs: [usdAsset('legacy', {})] });

    const result = await getDashboardOverview('user-1');

    expect(result.flags.hasCostBasisTracking).toBe(false);
    expect(result.metrics.unrealizedGains).toBe(0);
  });
});

describe('dashboardOverviewService — one round of reads, the write after the response, fresh by day', () => {
  // A summary as the recompute stores it, computed at `computedAt`; `invalidatedAt` when a mutation followed.
  const storedSummary = (computedAt: Date, invalidatedAt: Date | null = null) => ({
    exists: true,
    updateTime: STALE_SUMMARY_UPDATE_TIME,
    data: () => ({
      payload: {
        metrics: { totalValue: 4242 },
        variations: { monthly: null, yearly: null },
        expenseStats: null,
        charts: { assetClassData: [], assetData: [], liquidityData: [] },
        flags: { assetCount: 1, hasCostBasisTracking: false, hasTERTracking: false, hasStampDuty: false, currentMonthSnapshotExists: false },
      },
      updatedAt: computedAt,
      computedAt,
      sourceVersion: DASHBOARD_OVERVIEW_SOURCE_VERSION,
      invalidatedAt,
    }),
  });

  const cashAsset = {
    id: 'cash-1',
    data: () => ({
      userId: 'user-1', ticker: 'LIQ', name: 'Conto', type: 'cash', assetClass: 'cash', currency: 'EUR',
      quantity: 1000, currentPrice: 1, isLiquid: true,
      lastPriceUpdate: new Date('2026-04-06T09:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-04-06T09:00:00.000Z'),
    }),
  };
  const pensionFundAsset = {
    id: 'fund-1',
    data: () => ({
      userId: 'user-1', ticker: 'FONDO', name: 'Fondo', type: 'pensionFund', assetClass: 'equity', currency: 'EUR',
      quantity: 1, currentPrice: 5000, isLiquid: false,
      lastPriceUpdate: new Date('2026-04-06T09:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-04-06T09:00:00.000Z'),
    }),
  };
  const salary = {
    id: 'income-1',
    data: () => ({
      userId: 'user-1', type: 'income', categoryId: 'salary', categoryName: 'Stipendio', amount: 2000, currency: 'EUR',
      date: new Date('2026-04-02T10:00:00.000Z'), createdAt: new Date('2026-04-02T10:00:00.000Z'), updatedAt: new Date('2026-04-02T10:00:00.000Z'),
    }),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    afterCallbacks.length = 0;
    overviewSummaryDocUpdateMock.mockResolvedValue(undefined);
    overviewSummaryDocCreateMock.mockResolvedValue(undefined);
    overviewSummaryDocGetMock.mockResolvedValue({ exists: false });
    assetsGetMock.mockResolvedValue({ docs: [cashAsset] });
    snapshotsGetMock.mockResolvedValue({ docs: [] });
    settingsDocGetMock.mockResolvedValue({ exists: false });
    goalDocGetMock.mockResolvedValue({ exists: false });
    expensesGetMock.mockResolvedValue({ docs: [salary] });
  });

  describe('freshness', () => {
    // Italy is UTC+2 in April: 2026-04-15T15:00 Italian is 13:00Z.
    const italian = (iso: string) => new Date(`${iso}+02:00`);

    it('serves a summary computed today five hours ago, with no invalidation since', async () => {
      overviewSummaryDocGetMock.mockResolvedValue(storedSummary(italian('2026-04-15T10:00:00')));

      const result = await getDashboardOverview('user-1', { now: italian('2026-04-15T15:00:00') });

      expect(result.freshness.source).toBe('materialized_summary');
      expect(result.metrics.totalValue).toBe(4242);
      expect(assetsGetMock).not.toHaveBeenCalled();
    });

    it('recomputes a summary of today that a mutation invalidated', async () => {
      overviewSummaryDocGetMock.mockResolvedValue(
        storedSummary(italian('2026-04-15T10:00:00'), italian('2026-04-15T11:00:00'))
      );

      const result = await getDashboardOverview('user-1', { now: italian('2026-04-15T15:00:00') });

      expect(result.freshness.source).toBe('live_recompute');
    });

    it('recomputes a summary of today older than six hours (the safety net)', async () => {
      overviewSummaryDocGetMock.mockResolvedValue(storedSummary(italian('2026-04-15T08:00:00')));

      const result = await getDashboardOverview('user-1', { now: italian('2026-04-15T15:00:00') });

      expect(result.freshness.source).toBe('live_recompute');
    });

    it('recomputes a summary computed yesterday at 23:50 when asked today at 00:10', async () => {
      // Twenty minutes apart: only the Italian day can tell them, the age cannot.
      overviewSummaryDocGetMock.mockResolvedValue(storedSummary(italian('2026-04-14T23:50:00')));

      const result = await getDashboardOverview('user-1', { now: italian('2026-04-15T00:10:00') });

      expect(result.freshness.source).toBe('live_recompute');
    });
  });

  describe('the degradable reads', () => {
    it('drops only the sales clause when the ledger read fails', async () => {
      assetTransactionsGetMock.mockRejectedValueOnce(new Error('ledger down'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await getDashboardOverview('user-1');

      expect(result.monthSales).toBeNull();
      expect(result.metrics.totalValue).toBe(1000);
      expect(result.expenseStats?.currentMonth.income).toBe(2000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('trade ledger'), expect.anything());
      warn.mockRestore();
    });

    it('drops only the expense stats when a month of expenses fails', async () => {
      expensesGetMock.mockReset();
      expensesGetMock.mockResolvedValueOnce({ docs: [salary] }).mockRejectedValueOnce(new Error('expenses down'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await getDashboardOverview('user-1');

      expect(result.expenseStats).toBeNull();
      expect(result.metrics.totalValue).toBe(1000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('expense stats'), expect.anything());
      warn.mockRestore();
    });

    it('ignores a failed contributions read for an account without a pension fund', async () => {
      pensionContributionsGetMock.mockRejectedValueOnce(new Error('pension down'));

      const result = await getDashboardOverview('user-1');

      expect(result.metrics.totalValue).toBe(1000);
    });

    it('rejects when the contributions read fails for a holder of a pension fund, as it always has', async () => {
      // Degrading to «no contributions» would print every euro paid in as the fund's market return.
      assetsGetMock.mockResolvedValue({ docs: [cashAsset, pensionFundAsset] });
      pensionContributionsGetMock.mockRejectedValueOnce(new Error('pension down'));

      await expect(getDashboardOverview('user-1')).rejects.toThrow('pension down');
      expect(afterCallbacks).toHaveLength(0);
    });
  });

  describe('the required reads', () => {
    it.each([
      ['assets', () => assetsGetMock],
      ['snapshots', () => snapshotsGetMock],
      ['settings', () => settingsDocGetMock],
      ['goals', () => goalDocGetMock],
    ])('rejects the overview when the %s read fails, and persists nothing', async (_name, mockOf) => {
      mockOf().mockRejectedValueOnce(new Error('required read down'));

      await expect(getDashboardOverview('user-1')).rejects.toThrow('required read down');
      expect(afterCallbacks).toHaveLength(0);
    });

    it('launches every read in the same round, the degradable ones included', async () => {
      // Hold the assets read open: in one round the other six are already in flight while it waits.
      // Seen red by awaiting the required Promise.all before the settled reads; a falsification that
      // calls getAssetsForUser a SECOND time stays green (that call is not the held one).
      let releaseAssets: (value: unknown) => void = () => {};
      assetsGetMock.mockReturnValueOnce(new Promise((resolve) => { releaseAssets = resolve; }));

      const pending = getDashboardOverview('user-1');
      await vi.waitFor(() => expect(assetsGetMock).toHaveBeenCalled());

      expect(snapshotsGetMock).toHaveBeenCalledTimes(1);
      expect(settingsDocGetMock).toHaveBeenCalledTimes(1);
      expect(goalDocGetMock).toHaveBeenCalledTimes(1);
      expect(pensionContributionsGetMock).toHaveBeenCalledTimes(1);
      expect(assetTransactionsGetMock).toHaveBeenCalledTimes(1);
      expect(expensesGetMock).toHaveBeenCalledTimes(2);

      releaseAssets({ docs: [cashAsset] });
      await expect(pending).resolves.toMatchObject({ freshness: { source: 'live_recompute' } });
    });
  });

  describe('the write after the response', () => {
    it('creates the summary only inside the after() callback when none existed', async () => {
      const result = await getDashboardOverview('user-1');

      expect(result.freshness.source).toBe('live_recompute');
      expect(overviewSummaryDocCreateMock).not.toHaveBeenCalled();
      expect(afterCallbacks).toHaveLength(1);

      await afterCallbacks[0]();

      expect(overviewSummaryDocCreateMock).toHaveBeenCalledTimes(1);
      expect(overviewSummaryDocCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', invalidatedAt: null, computedAt: expect.any(Date) })
      );
      expect(overviewSummaryDocUpdateMock).not.toHaveBeenCalled();
    });

    it('stamps the summary with the request time, so its Italian day is the one it was computed for', async () => {
      const now = new Date('2026-04-15T13:00:00.000Z');

      await getDashboardOverview('user-1', { now });
      await afterCallbacks[0]();

      expect(overviewSummaryDocCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ computedAt: now, updatedAt: now })
      );
    });

    it('reads the current month from the request time, never from the process clock', async () => {
      // `getItalyMonthYear` is mocked to April in this file, so the payload cannot tell the two clocks
      // apart: the assertion is on the ARGUMENT. A call with none reads `new Date()` — a request across
      // a month's midnight would build half its payload on each month. Seen red (2026-10-03) with the
      // payload builder calling it bare.
      const now = new Date('2026-04-15T13:00:00.000Z');

      await getDashboardOverview('user-1', { now });

      const calls = vi.mocked(getItalyMonthYear).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.filter((args) => args[0] !== now)).toEqual([]);
    });

    it('keeps an invalidation that landed during the recompute: the write loses its precondition quietly', async () => {
      overviewSummaryDocGetMock.mockResolvedValue(
        storedSummary(new Date('2026-04-15T08:00:00.000Z'), new Date('2026-04-15T09:00:00.000Z'))
      );
      overviewSummaryDocUpdateMock.mockRejectedValueOnce(Object.assign(new Error('FAILED_PRECONDITION'), { code: 9 }));
      const info = vi.spyOn(console, 'info').mockImplementation(() => {});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await getDashboardOverview('user-1', { now: new Date('2026-04-15T10:00:00.000Z') });
      await afterCallbacks[0]();

      expect(overviewSummaryDocUpdateMock).toHaveBeenCalledWith(expect.anything(), { lastUpdateTime: STALE_SUMMARY_UPDATE_TIME });
      expect(info).toHaveBeenCalledWith(expect.stringContaining('not persisted'), 'user-1');
      expect(warn).not.toHaveBeenCalled();
      info.mockRestore();
      warn.mockRestore();
    });

    it('logs any other failure of the write as a warning, never as an error of the response', async () => {
      overviewSummaryDocCreateMock.mockRejectedValueOnce(new Error('quota'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await getDashboardOverview('user-1');
      await afterCallbacks[0]();

      expect(result.metrics.totalValue).toBe(1000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('persist materialized summary'), expect.any(Error));
      warn.mockRestore();
    });
  });

  describe('timing', () => {
    it('marks db after the summary read and after the round of reads, compute after the payload', async () => {
      const marks: string[] = [];

      await getDashboardOverview('user-1', { timing: { mark: (name) => marks.push(name) } });

      expect(marks).toEqual(['db', 'db', 'compute']);
    });

    it('marks db then compute when the materialized summary is served', async () => {
      const now = new Date('2026-04-15T13:00:00.000Z');
      overviewSummaryDocGetMock.mockResolvedValue(storedSummary(new Date('2026-04-15T12:00:00.000Z')));
      const marks: string[] = [];

      await getDashboardOverview('user-1', { now, timing: { mark: (name) => marks.push(name) } });

      expect(marks).toEqual(['db', 'compute']);
    });
  });
});
