import { describe, it, expect } from 'vitest';
import {
  computeDividendYieldMetrics,
  type DividendInput,
  type AssetInput,
} from '@/lib/utils/yieldOnCost';

const START = new Date(2025, 0, 1);
const END = new Date(2025, 11, 31);

function makeDividend(
  assetId: string,
  paymentDate: Date,
  dividendPerShare: number,
  quantity: number,
  options: { grossAmountEur?: number; netAmountEur?: number } = {}
): DividendInput {
  const grossAmount = dividendPerShare * quantity;
  const netAmount = grossAmount * 0.74; // 26% default tax
  return {
    assetId,
    paymentDate,
    quantity,
    grossAmount,
    netAmount,
    grossAmountEur: options.grossAmountEur,
    netAmountEur: options.netAmountEur,
  };
}

function makeAsset(
  id: string,
  quantity: number,
  averageCost: number,
  currentPrice = averageCost
): AssetInput {
  return { id, ticker: id.toUpperCase(), name: id, quantity, averageCost, currentPrice };
}

describe('computeDividendYieldMetrics', () => {
  it('returns empty metrics when there are no dividends', () => {
    const result = computeDividendYieldMetrics([], [], START, END, 12);
    expect(result.portfolioYocGross).toBeNull();
    expect(result.portfolioCurrentYieldGross).toBeNull();
    expect(result.assetCount).toBe(0);
  });

  it('returns empty metrics when numberOfMonths <= 0', () => {
    const div = makeDividend('a', new Date(2025, 2, 1), 1, 10);
    const result = computeDividendYieldMetrics([div], [makeAsset('a', 10, 10)], START, END, 0);
    expect(result.portfolioYocGross).toBeNull();
    expect(result.assetCount).toBe(0);
  });

  it('computes per-share YOC and current yield on current cost / price', () => {
    // DPS €1/share, averageCost €10 → YOC 10%; currentPrice €20 → current yield 5%
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10);
    const asset = makeAsset('eni', 10, 10, 20);

    const result = computeDividendYieldMetrics([div], [asset], START, END, 12);

    expect(result.portfolioYocGross).toBeCloseTo(10, 4);
    expect(result.portfolioCurrentYieldGross).toBeCloseTo(5, 4);
    expect(result.totalCostBasis).toBe(100);
    expect(result.totalMarketValue).toBe(200);
    expect(result.totalRealizedGross).toBe(10);
    expect(result.assetCount).toBe(1);
  });

  it('excludes dividends from fully-sold assets', () => {
    const divHeld = makeDividend('held', new Date(2025, 2, 1), 1, 10);
    const divSold = makeDividend('sold', new Date(2025, 2, 1), 5, 10); // €50, asset sold
    const result = computeDividendYieldMetrics(
      [divHeld, divSold],
      [makeAsset('held', 10, 10), makeAsset('sold', 0, 10)],
      START,
      END,
      12
    );

    expect(result.assetCount).toBe(1);
    expect(result.portfolioYocGross).toBeCloseTo(10, 4);
    expect(result.totalRealizedGross).toBe(10); // sold asset's €50 excluded
  });

  it('reflects repurchase: uses current averageCost, ignores history', () => {
    // Dividend paid on shares once held; current averageCost is now €12 (rebought higher).
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10);
    const asset = makeAsset('eni', 10, 12);

    const result = computeDividendYieldMetrics([div], [asset], START, END, 12);

    expect(result.portfolioYocGross).toBeCloseTo(8.3333, 3); // €1 / €12
  });

  it('weights portfolio YOC by current holdings', () => {
    // A: DPS €1/share, avgCost €8.20, 100 shares. B: DPS €2/share, avgCost €20, 10 shares.
    // income = 1×100 + 2×10 = 120; cost basis = 100×8.20 + 10×20 = 1020 → 11.7647%
    const divA = makeDividend('a', new Date(2025, 2, 1), 1, 10);
    const divB = makeDividend('b', new Date(2025, 2, 1), 2, 10);
    const result = computeDividendYieldMetrics(
      [divA, divB],
      [makeAsset('a', 100, 8.2), makeAsset('b', 10, 20)],
      START,
      END,
      12
    );

    expect(result.portfolioYocGross).toBeCloseTo(11.7647, 2);
    expect(result.totalCostBasis).toBeCloseTo(1020, 4);
  });

  it('annualizes short windows (YTD)', () => {
    // 1 dividend of €1/share in a 4-month window → annualized DPS = (1/4)*12 = €3 → YOC 30%
    const div = makeDividend('eni', new Date(2025, 2, 1), 1, 10);
    const result = computeDividendYieldMetrics(
      [div],
      [makeAsset('eni', 10, 10)],
      new Date(2025, 0, 1),
      new Date(2025, 3, 30),
      4
    );
    expect(result.portfolioYocGross).toBeCloseTo(30, 4);
  });

  it('uses EUR-converted amounts for multi-currency dividends', () => {
    // grossAmountEur €10 over 10 shares → €1/share EUR DPS → YOC 10%
    const div = makeDividend('us', new Date(2025, 2, 1), 1.1, 10, { grossAmountEur: 10, netAmountEur: 7.4 });
    const result = computeDividendYieldMetrics([div], [makeAsset('us', 10, 10)], START, END, 12);
    expect(result.portfolioYocGross).toBeCloseTo(10, 4);
  });
});
