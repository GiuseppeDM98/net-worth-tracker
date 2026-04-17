import { describe, it, expect } from 'vitest';

/**
 * Local copies for isolated testing — mirror the helpers in
 * app/api/portfolio/snapshot/route.ts.
 * Tests serve as characterization anchors for the Session C refactor.
 */

function buildAllocationPercentages(
  byAssetClass: Record<string, number>,
  totalNetWorth: number
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const assetClass of Object.keys(byAssetClass)) {
    result[assetClass] = totalNetWorth > 0 ? (byAssetClass[assetClass] / totalNetWorth) * 100 : 0;
  }
  return result;
}

interface MinimalAsset {
  id: string;
  ticker: string;
  name: string;
  quantity: number;
  currentPrice: number;
}

function buildByAssetBreakdown(assets: MinimalAsset[]) {
  return assets.map((asset) => ({
    assetId: asset.id,
    ticker: asset.ticker,
    name: asset.name,
    quantity: asset.quantity,
    price: asset.currentPrice,
    totalValue: asset.quantity * asset.currentPrice,
  }));
}

// ---------------------------------------------------------------------------

describe('buildAllocationPercentages', () => {
  it('should convert absolute values to percentages that sum to 100', () => {
    const byAssetClass = { equity: 50000, bonds: 30000, cash: 20000 };
    const result = buildAllocationPercentages(byAssetClass, 100000);
    expect(result.equity).toBe(50);
    expect(result.bonds).toBe(30);
    expect(result.cash).toBe(20);
  });

  it('should return 0 for all classes when totalNetWorth is 0', () => {
    const byAssetClass = { equity: 0, cash: 0 };
    const result = buildAllocationPercentages(byAssetClass, 0);
    expect(result.equity).toBe(0);
    expect(result.cash).toBe(0);
  });

  it('should handle a single asset class', () => {
    const result = buildAllocationPercentages({ equity: 10000 }, 10000);
    expect(result.equity).toBe(100);
  });

  it('should preserve all keys from byAssetClass', () => {
    const byAssetClass = { equity: 40000, bonds: 30000, crypto: 20000, cash: 10000 };
    const result = buildAllocationPercentages(byAssetClass, 100000);
    expect(Object.keys(result)).toEqual(['equity', 'bonds', 'crypto', 'cash']);
  });

  it('should handle uneven splits without throwing', () => {
    const result = buildAllocationPercentages({ equity: 1, bonds: 2 }, 3);
    expect(result.equity).toBeCloseTo(33.33, 1);
    expect(result.bonds).toBeCloseTo(66.67, 1);
  });
});

describe('buildByAssetBreakdown', () => {
  it('should map assets to snapshot format', () => {
    const assets: MinimalAsset[] = [
      { id: 'a1', ticker: 'AAPL', name: 'Apple', quantity: 10, currentPrice: 150 },
    ];
    const result = buildByAssetBreakdown(assets);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      assetId: 'a1',
      ticker: 'AAPL',
      name: 'Apple',
      quantity: 10,
      price: 150,
      totalValue: 1500,
    });
  });

  it('should calculate totalValue as quantity × price', () => {
    const assets: MinimalAsset[] = [
      { id: 'b1', ticker: 'BTP', name: 'BTP 2030', quantity: 5, currentPrice: 980 },
    ];
    const result = buildByAssetBreakdown(assets);
    expect(result[0].totalValue).toBe(4900);
  });

  it('should return empty array for empty assets list', () => {
    expect(buildByAssetBreakdown([])).toEqual([]);
  });

  it('should handle zero quantity assets', () => {
    const assets: MinimalAsset[] = [
      { id: 'c1', ticker: 'OLD', name: 'Sold Asset', quantity: 0, currentPrice: 100 },
    ];
    const result = buildByAssetBreakdown(assets);
    expect(result[0].totalValue).toBe(0);
  });
});
