import { describe, it, expect } from 'vitest';
import { toPerformanceBaseSnapshots } from '@/lib/utils/performanceBase';
import type { MonthlySnapshot } from '@/types/assets';

function makeSnapshot(
  overrides: Partial<MonthlySnapshot> & { totalNetWorth: number; illiquidNetWorth: number }
): MonthlySnapshot {
  return {
    userId: 'user-1',
    year: 2026,
    month: 1,
    liquidNetWorth: 0,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(2026, 0, 31),
    ...overrides,
  } as MonthlySnapshot;
}

describe('toPerformanceBaseSnapshots', () => {
  it('returns snapshots unchanged for the netWorth base', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 400,
        byAsset: [{ assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 300, totalValue: 300 }],
      }),
    ];

    const result = toPerformanceBaseSnapshots(snapshots, ['pension-1'], 'netWorth');

    expect(result).toBe(snapshots);
  });

  it('subtracts the pension fund value from totalNetWorth and illiquidNetWorth on the portfolio base', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 400,
        byAsset: [
          { assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 300, totalValue: 300 },
          { assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 10, price: 70, totalValue: 700 },
        ],
      }),
    ];

    const [result] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result.totalNetWorth).toBe(700);
    expect(result.illiquidNetWorth).toBe(100);
  });

  it('clamps illiquidNetWorth at 0 rather than going negative', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 100,
        byAsset: [{ assetId: 'pension-1', ticker: '', name: 'Fondo', quantity: 1, price: 300, totalValue: 300 }],
      }),
    ];

    const [result] = toPerformanceBaseSnapshots(snapshots, ['pension-1']);

    expect(result.totalNetWorth).toBe(700);
    expect(result.illiquidNetWorth).toBe(0);
  });

  it('passes a snapshot through untouched when no byAsset entry matches a pension id', () => {
    const snapshot = makeSnapshot({
      totalNetWorth: 1000,
      illiquidNetWorth: 400,
      byAsset: [{ assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 10, price: 100, totalValue: 1000 }],
    });

    const [result] = toPerformanceBaseSnapshots([snapshot], ['pension-1']);

    expect(result).toBe(snapshot);
  });

  it('returns snapshots unchanged when pensionAssetIds is empty (no pension funds exist)', () => {
    const snapshots = [makeSnapshot({ totalNetWorth: 1000, illiquidNetWorth: 400 })];

    const result = toPerformanceBaseSnapshots(snapshots, []);

    expect(result).toBe(snapshots);
  });

  it('sums multiple pension funds in the same snapshot', () => {
    const snapshots = [
      makeSnapshot({
        totalNetWorth: 1000,
        illiquidNetWorth: 600,
        byAsset: [
          { assetId: 'pension-1', ticker: '', name: 'Fondo A', quantity: 1, price: 200, totalValue: 200 },
          { assetId: 'pension-2', ticker: '', name: 'Fondo B', quantity: 1, price: 150, totalValue: 150 },
          { assetId: 'etf-1', ticker: 'VWCE', name: 'ETF', quantity: 6.5, price: 100, totalValue: 650 },
        ],
      }),
    ];

    const [result] = toPerformanceBaseSnapshots(snapshots, ['pension-1', 'pension-2']);

    expect(result.totalNetWorth).toBe(650);
    expect(result.illiquidNetWorth).toBe(250);
  });
});
