import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/assetService', () => ({
  ASSET_CLASS_ORDER: {
    equity: 1,
    bonds: 2,
    commodity: 3,
    realestate: 4,
    cash: 5,
    crypto: 6,
  },
}));

import { transformPriceHistoryData } from '@/lib/utils/assetPriceHistoryUtils';
import { transformAssetClassHistoryData } from '@/lib/utils/assetClassHistoryUtils';
import { Asset, MonthlySnapshot } from '@/types/assets';

function makeAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'asset-1',
    userId: 'user-1',
    name: 'Asset',
    ticker: 'AST',
    type: 'stock',
    assetClass: 'equity',
    quantity: 10,
    currentPrice: 100,
    currency: 'EUR',
    averageCost: 100,
    createdAt: new Date(2025, 0, 1),
    updatedAt: new Date(2025, 0, 1),
    lastPriceUpdate: new Date(2025, 0, 1),
    ...overrides,
  } as Asset;
}

function makeSnapshot(
  year: number,
  month: number,
  byAssetClass: Record<string, number>,
  byAsset: MonthlySnapshot['byAsset']
): MonthlySnapshot {
  return {
    userId: 'user-1',
    year,
    month,
    totalNetWorth: Object.values(byAssetClass).reduce((sum, value) => sum + value, 0),
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass,
    byAsset,
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 1),
    isDummy: false,
  };
}

describe('asset history utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 15));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the hidden previous month baseline for current-year price changes without rendering it', () => {
    const equityAsset = makeAsset({
      id: 'equity-1',
      name: 'ETF World',
      ticker: 'VWCE',
      assetClass: 'equity',
      quantity: 10,
    });
    const cashAsset = makeAsset({
      id: 'cash-1',
      name: 'Conto Fineco',
      ticker: 'CASH',
      type: 'cash',
      assetClass: 'cash',
      quantity: 1,
      currentPrice: 1,
    });

    const snapshots = [
      makeSnapshot(2025, 12, { equity: 1000, cash: 5000 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 100, totalValue: 1000 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5000, price: 1, totalValue: 5000 },
      ]),
      makeSnapshot(2026, 1, { equity: 1100, cash: 5100 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 110, totalValue: 1100 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5100, price: 1, totalValue: 5100 },
      ]),
      makeSnapshot(2026, 2, { equity: 1210, cash: 5200 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 121, totalValue: 1210 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5200, price: 1, totalValue: 5200 },
      ]),
    ];

    const result = transformPriceHistoryData(snapshots, [equityAsset, cashAsset], {
      filterYear: 2026,
      displayMode: 'price',
      includePreviousMonthBaseline: true,
    });

    expect(result.monthColumns.map((column) => column.key)).toEqual(['2026-1', '2026-2']);
    expect(result.assets.map((asset) => asset.ticker)).toEqual(['CASH', 'VWCE']);
    const equityRow = result.assets.find((asset) => asset.ticker === 'VWCE');
    const cashRow = result.assets.find((asset) => asset.ticker === 'CASH');
    expect(equityRow?.months['2026-1'].change).toBeCloseTo(10, 5);
    expect(equityRow?.months['2026-2'].change).toBeCloseTo(10, 5);
    expect(equityRow?.ytd).toBeCloseTo(10, 5);
    expect(equityRow?.lastMonthChange).toBeCloseTo(10, 5);
    expect(cashRow?.months['2026-1'].change).toBeCloseTo(2, 5);
  });

  it('uses the hidden baseline for YTD when the current year has only one visible month', () => {
    const equityAsset = makeAsset({
      id: 'equity-1',
      name: 'ETF World',
      ticker: 'VWCE',
      assetClass: 'equity',
      quantity: 10,
    });

    const snapshots = [
      makeSnapshot(2025, 12, { equity: 1000 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 100, totalValue: 1000 },
      ]),
      makeSnapshot(2026, 1, { equity: 1100 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 110, totalValue: 1100 },
      ]),
    ];

    const priceResult = transformPriceHistoryData(snapshots, [equityAsset], {
      filterYear: 2026,
      displayMode: 'price',
      includePreviousMonthBaseline: true,
    });
    const classResult = transformAssetClassHistoryData(snapshots, {
      filterYear: 2026,
      includePreviousMonthBaseline: true,
    });

    expect(priceResult.assets[0].lastMonthChange).toBeCloseTo(10, 5);
    expect(priceResult.assets[0].ytd).toBeCloseTo(10, 5);
    expect(classResult.rows[0].lastMonthChange).toBeCloseTo(10, 5);
    expect(classResult.rows[0].ytd).toBeCloseTo(10, 5);
    expect(classResult.totalRow?.lastMonthChange).toBeCloseTo(10, 5);
    expect(classResult.totalRow?.ytd).toBeCloseTo(10, 5);
  });

  it('keeps cash in current-year value totals while preserving the hidden baseline for January comparisons', () => {
    const equityAsset = makeAsset({
      id: 'equity-1',
      name: 'ETF World',
      ticker: 'VWCE',
      assetClass: 'equity',
      quantity: 10,
    });
    const cashAsset = makeAsset({
      id: 'cash-1',
      name: 'Conto Fineco',
      ticker: 'CASH',
      type: 'cash',
      assetClass: 'cash',
      quantity: 1,
      currentPrice: 1,
    });

    const snapshots = [
      makeSnapshot(2025, 12, { equity: 1000, cash: 5000 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 100, totalValue: 1000 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5000, price: 1, totalValue: 5000 },
      ]),
      makeSnapshot(2026, 1, { equity: 1100, cash: 5100 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 110, totalValue: 1100 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5100, price: 1, totalValue: 5100 },
      ]),
      makeSnapshot(2026, 2, { equity: 1210, cash: 5200 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 121, totalValue: 1210 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5200, price: 1, totalValue: 5200 },
      ]),
    ];

    const result = transformPriceHistoryData(snapshots, [equityAsset, cashAsset], {
      filterYear: 2026,
      displayMode: 'totalValue',
      includePreviousMonthBaseline: true,
    });

    expect(result.assets.map((asset) => asset.ticker)).toEqual(['CASH', 'VWCE']);
    expect(result.totalRow?.totals['2026-1']).toBe(6200);
    expect(result.totalRow?.totals['2026-2']).toBe(6410);
    expect(result.totalRow?.monthlyChanges?.['2026-1']).toBeCloseTo((6200 - 6000) / 6000 * 100, 5);
    expect(result.totalRow?.ytd).toBeCloseTo((6410 - 6200) / 6200 * 100, 5);
  });

  it('keeps cash in current-year asset class tables while preserving January vs December comparisons', () => {
    const snapshots = [
      makeSnapshot(2025, 12, { equity: 1000, cash: 5000 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 100, totalValue: 1000 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5000, price: 1, totalValue: 5000 },
      ]),
      makeSnapshot(2026, 1, { equity: 1100, cash: 5100 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 110, totalValue: 1100 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5100, price: 1, totalValue: 5100 },
      ]),
      makeSnapshot(2026, 2, { equity: 1210, cash: 5200 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 121, totalValue: 1210 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5200, price: 1, totalValue: 5200 },
      ]),
    ];

    const result = transformAssetClassHistoryData(snapshots, {
      filterYear: 2026,
      includePreviousMonthBaseline: true,
    });

    expect(result.monthColumns.map((column) => column.key)).toEqual(['2026-1', '2026-2']);
    expect(result.rows.map((row) => row.assetClass)).toEqual(['equity', 'cash']);
    const equityRow = result.rows.find((row) => row.assetClass === 'equity');
    const cashRow = result.rows.find((row) => row.assetClass === 'cash');
    expect(equityRow?.months['2026-1'].change).toBeCloseTo(10, 5);
    expect(equityRow?.ytd).toBeCloseTo(10, 5);
    expect(cashRow?.months['2026-1'].change).toBeCloseTo(2, 5);
    expect(result.totalRow?.monthlyChanges?.['2026-1']).toBeCloseTo((6200 - 6000) / 6000 * 100, 5);
    expect(result.totalRow?.totals['2026-1']).toBe(6200);
  });

  it('keeps historical mode unchanged when baseline and cash exclusion are not requested', () => {
    const equityAsset = makeAsset({
      id: 'equity-1',
      name: 'ETF World',
      ticker: 'VWCE',
      assetClass: 'equity',
      quantity: 10,
    });
    const cashAsset = makeAsset({
      id: 'cash-1',
      name: 'Conto Fineco',
      ticker: 'CASH',
      type: 'cash',
      assetClass: 'cash',
      quantity: 1,
      currentPrice: 1,
    });

    const snapshots = [
      makeSnapshot(2025, 12, { equity: 1000, cash: 5000 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 100, totalValue: 1000 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5000, price: 1, totalValue: 5000 },
      ]),
      makeSnapshot(2026, 1, { equity: 1100, cash: 5100 }, [
        { assetId: 'equity-1', name: 'ETF World', ticker: 'VWCE', quantity: 10, price: 110, totalValue: 1100 },
        { assetId: 'cash-1', name: 'Conto Fineco', ticker: 'CASH', quantity: 5100, price: 1, totalValue: 5100 },
      ]),
    ];

    const result = transformPriceHistoryData(snapshots, [equityAsset, cashAsset], {
      filterStartDate: { year: 2025, month: 12 },
      displayMode: 'totalValue',
    });

    expect(result.monthColumns.map((column) => column.key)).toEqual(['2025-12', '2026-1']);
    expect(result.assets.map((asset) => asset.ticker)).toEqual(['CASH', 'VWCE']);
    expect(result.totalRow?.totals['2025-12']).toBe(6000);
    expect(result.totalRow?.totals['2026-1']).toBe(6200);
    expect(result.totalRow?.monthlyChanges?.['2025-12']).toBeUndefined();
  });
});
