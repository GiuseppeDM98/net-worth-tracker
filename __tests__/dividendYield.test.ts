import { describe, it, expect } from 'vitest';
import {
  calculateCurrentYieldMetrics,
  calculateYocMetrics,
  computeYieldsForPeriods,
  type PerformanceYieldPeriod,
} from '@/lib/utils/dividendYield';
import { deriveHoldingStartDates } from '@/lib/utils/snapshotAssetBreakdown';
import type { MonthlySnapshot } from '@/types/assets';

/**
 * `computeYieldsForPeriods` — what POST /api/performance/yields computes: several periods over one
 * set of dividends, assets and snapshots.
 *
 * The reference is what the two retired routes (`/api/performance/yoc`, `/api/performance/current-yield`)
 * did for ONE period: tag the assets with their holding start, then `calculateYocMetrics` and
 * `calculateCurrentYieldMetrics` on the period's window (`oldRoutesAnswer` below is their body).
 * The two functions keep their own cases in `__tests__/performanceService.test.ts`.
 *
 * Seen red (2026-10-04): with `startDate` and `dividendEndDate` swapped in `computeYieldsForPeriods`
 * four of the five cases fail (the fifth asks a window with no dividend either way).
 */

const ASSETS = [
  { id: 'etf', ticker: 'ETF', name: 'Un ETF', quantity: 100, averageCost: 50, currentPrice: 80 },
  { id: 'btp', ticker: 'BTP', name: 'Un BTP', quantity: 200, averageCost: 100, currentPrice: 95 },
  // Sold and rebought in 2026: the dividend of its first holding must not count.
  { id: 'rebought', ticker: 'RB', name: 'Riacquistato', quantity: 10, averageCost: 20, currentPrice: 25 },
];

function dividend(assetId: string, paymentDate: Date, dividendPerShare: number, quantity: number) {
  const grossAmount = dividendPerShare * quantity;
  return { assetId, paymentDate, quantity, grossAmount, netAmount: grossAmount * 0.74 };
}

const DIVIDENDS = [
  dividend('etf', new Date(2026, 2, 15), 1, 100),
  dividend('etf', new Date(2025, 8, 15), 0.8, 100),
  dividend('etf', new Date(2023, 5, 15), 0.5, 60),
  dividend('btp', new Date(2026, 5, 1), 1.5, 200),
  dividend('btp', new Date(2025, 5, 1), 1.5, 200),
  dividend('rebought', new Date(2025, 3, 10), 2, 10),
  dividend('rebought', new Date(2026, 7, 10), 1, 10),
];

function snapshot(year: number, month: number, heldIds: string[]): MonthlySnapshot {
  return {
    userId: 'u1',
    year,
    month,
    totalNetWorth: 0,
    byAsset: heldIds.map((assetId) => ({ assetId, ticker: assetId, name: assetId, quantity: 1, price: 1, totalValue: 1 })),
  } as unknown as MonthlySnapshot;
}

// «rebought» is held until May 2025, absent for a year, back from June 2026.
const SNAPSHOTS: MonthlySnapshot[] = [];
for (let index = 0; index < 22; index++) {
  const year = 2025 + Math.floor(index / 12);
  const month = (index % 12) + 1;
  const holdsRebought = (year === 2025 && month <= 5) || (year === 2026 && month >= 6);
  SNAPSHOTS.push(snapshot(year, month, holdsRebought ? ['etf', 'btp', 'rebought'] : ['etf', 'btp']));
}

const PERIODS: PerformanceYieldPeriod[] = [
  { key: 'ytd', startDate: new Date(2026, 0, 1), dividendEndDate: new Date(2026, 9, 4, 12), numberOfMonths: 10 },
  { key: 'oneYear', startDate: new Date(2025, 10, 1), dividendEndDate: new Date(2026, 9, 4, 12), numberOfMonths: 12 },
  { key: 'threeYear', startDate: new Date(2023, 10, 1), dividendEndDate: new Date(2026, 9, 4, 12), numberOfMonths: 36 },
  { key: 'fiveYear', startDate: new Date(2021, 10, 1), dividendEndDate: new Date(2026, 9, 4, 12), numberOfMonths: 60 },
  { key: 'allTime', startDate: new Date(2023, 1, 1), dividendEndDate: new Date(2026, 9, 4, 12), numberOfMonths: 45 },
];

/** The body of the two retired routes, for one period. */
function oldRoutesAnswer(period: PerformanceYieldPeriod) {
  const holdingStarts = deriveHoldingStartDates(SNAPSHOTS);
  const assetsWithHolding = ASSETS.map((asset) => ({ ...asset, holdingStartDate: holdingStarts.get(asset.id) }));
  return {
    ...calculateYocMetrics(DIVIDENDS, assetsWithHolding, period.startDate, period.dividendEndDate, period.numberOfMonths),
    ...calculateCurrentYieldMetrics(DIVIDENDS, assetsWithHolding, period.startDate, period.dividendEndDate, period.numberOfMonths),
  };
}

describe('computeYieldsForPeriods', () => {
  it('should answer five periods exactly as five calls of the two retired routes', () => {
    const yieldsByKey = computeYieldsForPeriods({ dividends: DIVIDENDS, assets: ASSETS, snapshots: SNAPSHOTS, periods: PERIODS });

    expect(Object.keys(yieldsByKey)).toEqual(['ytd', 'oneYear', 'threeYear', 'fiveYear', 'allTime']);
    for (const period of PERIODS) {
      expect(yieldsByKey[period.key], period.key).toEqual(oldRoutesAnswer(period));
    }
    // The periods are not five copies of one answer: the windows hold different dividends.
    expect(yieldsByKey.ytd.yocDividendsGross).not.toBe(yieldsByKey.threeYear.yocDividendsGross);
  });

  it('should measure the year to date on its own window, by hand', () => {
    const { ytd } = computeYieldsForPeriods({ dividends: DIVIDENDS, assets: ASSETS, snapshots: SNAPSHOTS, periods: PERIODS });

    // In the window: etf 100 € (March), btp 300 € (June), rebought 10 € (August, its new holding).
    expect(ytd.yocDividendsGross).toBeCloseTo(410, 6);
    expect(ytd.yocAssetCount).toBe(3);
    // Cost basis 100×50 + 200×100 + 10×20; annualised income 410 / 10 × 12 = 492.
    expect(ytd.yocCostBasis).toBe(25_200);
    expect(ytd.yocGross).toBeCloseTo((492 / 25_200) * 100, 6);
    // Market value 100×80 + 200×95 + 10×25.
    expect(ytd.currentYieldPortfolioValue).toBe(27_250);
    expect(ytd.currentYield).toBeCloseTo((492 / 27_250) * 100, 6);
  });

  it('should leave out the dividends of a previous, discontinuous holding', () => {
    const { fiveYear } = computeYieldsForPeriods({ dividends: DIVIDENDS, assets: ASSETS, snapshots: SNAPSHOTS, periods: PERIODS });
    const withoutSnapshots = computeYieldsForPeriods({ dividends: DIVIDENDS, assets: ASSETS, snapshots: [], periods: PERIODS }).fiveYear;

    // The April 2025 dividend (20 €) belongs to the holding sold in May 2025.
    expect(withoutSnapshots.yocDividendsGross - fiveYear.yocDividendsGross).toBeCloseTo(20, 6);
  });

  it('should prefer the holding start stamped on the asset over the snapshot-derived one', () => {
    const stamped = ASSETS.map((asset) => (asset.id === 'rebought' ? { ...asset, holdingStartDate: new Date(2026, 8, 1) } : asset));

    const { ytd } = computeYieldsForPeriods({ dividends: DIVIDENDS, assets: stamped, snapshots: SNAPSHOTS, periods: PERIODS });

    // Stamped in September 2026: the August dividend is before it, so «rebought» pays nothing here.
    expect(ytd.yocDividendsGross).toBeCloseTo(400, 6);
    expect(ytd.yocAssetCount).toBe(2);
  });

  it('should answer an empty reading for a period with no dividend, and nothing for no period', () => {
    const empty = computeYieldsForPeriods({
      dividends: DIVIDENDS,
      assets: ASSETS,
      snapshots: SNAPSHOTS,
      periods: [{ key: 'quiet', startDate: new Date(2020, 0, 1), dividendEndDate: new Date(2020, 11, 31), numberOfMonths: 12 }],
    });

    expect(empty.quiet.yocGross).toBeNull();
    expect(empty.quiet.currentYield).toBeNull();
    expect(empty.quiet.yocDividendsGross).toBe(0);
    expect(computeYieldsForPeriods({ dividends: DIVIDENDS, assets: ASSETS, snapshots: SNAPSHOTS, periods: [] })).toEqual({});
  });
});
