/**
 * Tests for lib/utils/patrimonioSummary.ts — the pure figures behind Patrimonio's tiles (cash
 * accounts, the month's trades, unrealized gains, instrument return ranking, top weights, last
 * price update). Mocks mirror dashboardOverviewUtils.test.ts: calculateAssetValue lives in
 * assetService, which imports the client Firebase SDK at module load.
 */

import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import type { DashboardOverviewTopAsset } from '@/types/dashboardOverview';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  computeTopWeightShare,
  computeUnrealizedGain,
  hasCostBasis,
  isCashAccount,
  isHeld,
  rankInstrumentReturns,
  resolveLastPriceUpdate,
  summarizeCashAccounts,
  summarizeMonthTrades,
  summarizeUnrealizedGains,
} from '@/lib/utils/patrimonioSummary';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    userId: 'u1',
    ticker: 'VWCE',
    name: 'Vanguard All-World',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 10,
    currentPrice: 100,
    lastPriceUpdate: new Date(2026, 7, 22, 9, 12),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function makeTrade(overrides: Partial<AssetTransaction> = {}): AssetTransaction {
  return {
    id: 't1',
    userId: 'u1',
    assetId: 'a1',
    type: 'buy',
    date: new Date(2026, 7, 14, 12),
    quantity: 10,
    pricePerUnit: 100,
    priceEur: 100,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isCashAccount / summarizeCashAccounts
// ---------------------------------------------------------------------------

describe('isCashAccount', () => {
  it('should require type cash AND class cash, so a money-market ETF in the cash class is not an account', () => {
    expect(isCashAccount(makeAsset({ type: 'cash', assetClass: 'cash' }))).toBe(true);
    expect(isCashAccount(makeAsset({ type: 'etf', assetClass: 'cash' }))).toBe(false);
    expect(isCashAccount(makeAsset({ type: 'cash', assetClass: 'bonds' }))).toBe(false);
  });
});

describe('isHeld', () => {
  it('should be true only for a positive quantity — a sold asset stays in the table, not in the counts', () => {
    expect(isHeld(makeAsset({ quantity: 0.001 }))).toBe(true);
    expect(isHeld(makeAsset({ quantity: 0 }))).toBe(false);
  });
});

describe('summarizeCashAccounts', () => {
  it('should list the accounts largest first with their balance, share of the cash and share of the total', () => {
    const accounts = [
      makeAsset({ id: 'bbva', name: 'Conto BBVA', type: 'cash', assetClass: 'cash', quantity: 9850, currentPrice: 1 }),
      makeAsset({ id: 'fineco', name: 'Conto Fineco', type: 'cash', assetClass: 'cash', quantity: 18420.1, currentPrice: 1 }),
      makeAsset({ id: 'rev', name: 'Revolut', type: 'cash', assetClass: 'cash', quantity: 1230.55, currentPrice: 1 }),
    ];

    const summary = summarizeCashAccounts(accounts, 412425.85);

    expect(summary.total).toBeCloseTo(29500.65, 2);
    expect(summary.shareOfTotal).toBeCloseTo(7.153, 2);
    expect(summary.accounts.map((a) => a.id)).toEqual(['fineco', 'bbva', 'rev']);
    expect(summary.accounts[0]).toMatchObject({ name: 'Conto Fineco', balance: 18420.1 });
    expect(summary.accounts[0].shareOfCash).toBeCloseTo(62.44, 1);
    expect(summary.largest).toMatchObject({ name: 'Conto Fineco', balance: 18420.1 });
  });

  it('should value a foreign-currency account in EUR through its converted price', () => {
    const usd = makeAsset({ id: 'usd', name: 'Conto USD', type: 'cash', assetClass: 'cash', currency: 'USD', quantity: 1000, currentPrice: 1, currentPriceEur: 0.92 });
    const summary = summarizeCashAccounts([usd], 10000);
    expect(summary.total).toBeCloseTo(920, 2);
    expect(summary.shareOfTotal).toBeCloseTo(9.2, 2);
  });

  it('should report no share when there is no total to measure against', () => {
    const summary = summarizeCashAccounts([], 0);
    expect(summary).toEqual({ accounts: [], total: 0, shareOfTotal: null, largest: null });
  });
});

// ---------------------------------------------------------------------------
// summarizeMonthTrades
// ---------------------------------------------------------------------------

describe('summarizeMonthTrades', () => {
  it('should sum buys with fees and sells net of fees, for the month only, newest first', () => {
    const trades = [
      makeTrade({ id: 'b1', assetId: 'vwce', type: 'buy', date: new Date(2026, 7, 14, 12), quantity: 10, priceEur: 148, fees: 20 }),
      makeTrade({ id: 'b2', assetId: 'aggh', type: 'buy', date: new Date(2026, 7, 9, 12), quantity: 200, priceEur: 5 }),
      makeTrade({ id: 's1', assetId: 'btc', type: 'sell', date: new Date(2026, 7, 3, 12), quantity: 0.02, priceEur: 41000, fees: 20 }),
      makeTrade({ id: 'old', assetId: 'vwce', type: 'buy', date: new Date(2026, 6, 30, 12), quantity: 1, priceEur: 100 }),
    ];

    const summary = summarizeMonthTrades(trades, { month: 8, year: 2026 });

    expect(summary.bought).toBeCloseTo(1500 + 1000, 2);
    expect(summary.sold).toBeCloseTo(800, 2);
    expect(summary.net).toBeCloseTo(1700, 2);
    expect(summary.count).toBe(3);
    expect(summary.rows.map((r) => r.id)).toEqual(['b1', 'b2', 's1']);
    expect(summary.rows[0]).toMatchObject({ assetId: 'vwce', type: 'buy', amountEur: 1500 });
    expect(summary.rows[2]).toMatchObject({ assetId: 'btc', type: 'sell', amountEur: 800 });
  });

  it('should ignore migration baselines and adjustments: neither moves money', () => {
    const trades = [
      makeTrade({ id: 'base', type: 'buy', isBaseline: true, date: new Date(2026, 7, 1, 12), quantity: 100, priceEur: 100 }),
      makeTrade({ id: 'adj', type: 'adjustment', date: new Date(2026, 7, 2, 12), quantity: 100, priceEur: 100 }),
    ];
    const summary = summarizeMonthTrades(trades, { month: 8, year: 2026 });
    expect(summary).toMatchObject({ bought: 0, sold: 0, net: 0, count: 0, rows: [] });
  });

  it('should attribute a trade to its Italian calendar month, not the UTC one', () => {
    // 31 July 23:30 UTC is already 1 August in Rome (CEST): it belongs to August.
    const trade = makeTrade({ id: 'late', type: 'buy', date: new Date(Date.UTC(2026, 6, 31, 23, 30)), quantity: 1, priceEur: 100 });
    expect(summarizeMonthTrades([trade], { month: 8, year: 2026 }).count).toBe(1);
    expect(summarizeMonthTrades([trade], { month: 7, year: 2026 }).count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// summarizeUnrealizedGains
// ---------------------------------------------------------------------------

describe('summarizeUnrealizedGains', () => {
  it('should sum gains over the positions with a cost basis and express them against that basis', () => {
    const assets = [
      makeAsset({ id: 'a', quantity: 10, currentPrice: 120, averageCost: 100 }), // +200 on 1000
      makeAsset({ id: 'b', quantity: 10, currentPrice: 90, averageCost: 100 }), // −100 on 1000
      makeAsset({ id: 'c', quantity: 10, currentPrice: 50 }), // no cost basis: excluded
    ];
    const summary = summarizeUnrealizedGains(assets);
    expect(summary).toEqual({ gainLoss: 100, costBasis: 2000, gainPercent: 5, count: 2 });
  });

  it('should exclude cash accounts and pension funds even when they carry a leftover averageCost', () => {
    const assets = [
      makeAsset({ id: 'cash', type: 'cash', assetClass: 'cash', quantity: 5000, currentPrice: 1, averageCost: 1 }),
      makeAsset({ id: 'fund', type: 'pensionFund', quantity: 30000, currentPrice: 1, averageCost: 1 }),
      makeAsset({ id: 'a', quantity: 10, currentPrice: 120, averageCost: 100 }),
    ];
    expect(summarizeUnrealizedGains(assets)).toEqual({ gainLoss: 200, costBasis: 1000, gainPercent: 20, count: 1 });
  });

  it('should ignore a sold-out position even though a sell never clears its PMC', () => {
    const assets = [
      makeAsset({ id: 'a', quantity: 10, currentPrice: 120, averageCost: 100 }),
      makeAsset({ id: 'sold', quantity: 0, currentPrice: 120, averageCost: 100 }),
    ];
    expect(summarizeUnrealizedGains(assets)).toEqual({ gainLoss: 200, costBasis: 1000, gainPercent: 20, count: 1 });
  });

  it('should report a null percentage when nothing has a cost basis', () => {
    expect(summarizeUnrealizedGains([makeAsset()])).toEqual({ gainLoss: 0, costBasis: 0, gainPercent: null, count: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeUnrealizedGain / hasCostBasis / summarizeUnrealizedGains — currency
// ---------------------------------------------------------------------------

describe('foreign-currency G/P (averageCostEur, never averageCost against the EUR value)', () => {
  it('compares averageCostEur to the EUR value, not the native averageCost', () => {
    // 10 units bought at 100 USD/quota (90 EUR/quota at the trade date), now worth 130 EUR/quota.
    // Mixing currencies would read costBasis = 10·100 = 1000 and gainLoss = 1300 − 1000 = 300 (+30%).
    // The correct EUR-side comparison is costBasis = 10·90 = 900, gainLoss = 1300 − 900 = 400 (+44.4%).
    const asset = makeAsset({
      currency: 'USD',
      quantity: 10,
      currentPrice: 145,
      currentPriceEur: 130,
      averageCost: 100,
      averageCostEur: 90,
    });
    expect(computeUnrealizedGain(asset)).toEqual({ gainLoss: 400, gainPercent: 400 / 9 });
  });

  it('falls back to averageCost for a EUR-native asset without averageCostEur (pre-backfill data)', () => {
    const asset = makeAsset({ currency: 'EUR', quantity: 10, currentPrice: 120, averageCost: 100 });
    expect(hasCostBasis(asset)).toBe(true);
    expect(computeUnrealizedGain(asset)).toEqual({ gainLoss: 200, gainPercent: 20 });
  });

  it('has no comparable basis for a foreign-currency asset that predates averageCostEur', () => {
    // Pre-backfill: only the native PMC is on the doc. Showing a G/P here would be exactly today's
    // bug (native PMC vs EUR value), so this must read as "no basis" until the backfill runs.
    const asset = makeAsset({ currency: 'USD', quantity: 10, currentPrice: 145, currentPriceEur: 130, averageCost: 100 });
    expect(hasCostBasis(asset)).toBe(false);
    expect(computeUnrealizedGain(asset)).toBeNull();
  });

  it('sums foreign- and EUR-currency positions in one EUR-side total', () => {
    const assets = [
      makeAsset({ id: 'usd', currency: 'USD', quantity: 10, currentPrice: 145, currentPriceEur: 130, averageCost: 100, averageCostEur: 90 }),
      makeAsset({ id: 'eur', currency: 'EUR', quantity: 10, currentPrice: 120, averageCost: 100 }),
    ];
    expect(summarizeUnrealizedGains(assets)).toEqual({ gainLoss: 600, costBasis: 1900, gainPercent: 600 / 19, count: 2 });
  });
});

// ---------------------------------------------------------------------------
// rankInstrumentReturns
// ---------------------------------------------------------------------------

function topAsset(overrides: Partial<DashboardOverviewTopAsset>): DashboardOverviewTopAsset {
  return {
    id: 'x',
    name: 'X',
    assetType: 'etf',
    assetClass: 'equity',
    totalValue: 1000,
    portfolioPercent: 10,
    returnPercent: null,
    ...overrides,
  };
}

describe('rankInstrumentReturns', () => {
  it('should pick the three best returns and the single worst, skipping positions without a cost basis', () => {
    const top = [
      topAsset({ id: 'vwce', name: 'VWCE', returnPercent: 18.4 }),
      topAsset({ id: 'race', name: 'Ferrari', returnPercent: 44.5 }),
      topAsset({ id: 'aapl', name: 'Apple', returnPercent: 33.6 }),
      topAsset({ id: 'vuaa', name: 'VUAA', returnPercent: 22.1 }),
      topAsset({ id: 'xmme', name: 'XMME', returnPercent: -3.8 }),
      topAsset({ id: 'cash', name: 'Conto', returnPercent: null }),
    ];
    const ranked = rankInstrumentReturns(top);
    expect(ranked.best.map((a) => a.id)).toEqual(['race', 'aapl', 'vuaa']);
    expect(ranked.worst?.id).toBe('xmme');
    expect(ranked.measuredCount).toBe(5);
  });

  it('should never rank a pension fund or a cash account, whatever returnPercent the payload carries', () => {
    // A fund converted from an ETF keeps its old PMC; the service still computes a "return" on it.
    const top = [
      topAsset({ id: 'fund', name: 'Fondo Cometa', assetType: 'pensionFund', assetClass: 'bonds', returnPercent: -98 }),
      topAsset({ id: 'cash', name: 'Conto', assetType: 'cash', assetClass: 'cash', returnPercent: 0 }),
      topAsset({ id: 'a', returnPercent: 5 }),
      topAsset({ id: 'b', returnPercent: -1 }),
    ];
    const ranked = rankInstrumentReturns(top);
    expect(ranked.best.map((a) => a.id)).toEqual(['a', 'b']);
    expect(ranked.worst).toBeNull();
    expect(ranked.measuredCount).toBe(2);
    // The footer's "Tra i N strumenti maggiori" counts instruments only, never the accounts.
    expect(ranked.rankedFrom).toBe(3);
  });

  it('should not repeat a position as the worst when it is already among the best', () => {
    const top = [
      topAsset({ id: 'a', returnPercent: 5 }),
      topAsset({ id: 'b', returnPercent: 3 }),
    ];
    const ranked = rankInstrumentReturns(top);
    expect(ranked.best.map((a) => a.id)).toEqual(['a', 'b']);
    expect(ranked.worst).toBeNull();
  });

  it('should return empty rankings when no position has a measured return', () => {
    expect(rankInstrumentReturns([topAsset({ returnPercent: null })])).toEqual({ best: [], worst: null, measuredCount: 0, rankedFrom: 1 });
  });
});

// ---------------------------------------------------------------------------
// computeTopWeightShare
// ---------------------------------------------------------------------------

describe('computeTopWeightShare', () => {
  it('should measure the share of the n largest positions over the given total', () => {
    const assets = [
      makeAsset({ id: 'a', quantity: 1, currentPrice: 500 }),
      makeAsset({ id: 'b', quantity: 1, currentPrice: 300 }),
      makeAsset({ id: 'c', quantity: 1, currentPrice: 100 }),
      makeAsset({ id: 'd', quantity: 1, currentPrice: 100 }),
    ];
    expect(computeTopWeightShare(assets, 1000, 3)).toEqual({ count: 3, percent: 90 });
  });

  it('should not count sold-out positions among the instruments the largest n are measured against', () => {
    // Two live positions and two sold ones: the largest 3 ARE the whole (live) table — no clause.
    const assets = [
      makeAsset({ id: 'a', quantity: 1, currentPrice: 500 }),
      makeAsset({ id: 'b', quantity: 1, currentPrice: 300 }),
      makeAsset({ id: 's1', quantity: 0, currentPrice: 100, averageCost: 90 }),
      makeAsset({ id: 's2', quantity: 0, currentPrice: 100 }),
    ];
    expect(computeTopWeightShare(assets, 800, 3)).toBeNull();
  });

  it('should be null when the positions are not more than n, or there is no total', () => {
    const assets = [makeAsset({ id: 'a' }), makeAsset({ id: 'b' }), makeAsset({ id: 'c' })];
    expect(computeTopWeightShare(assets, 3000, 3)).toBeNull();
    expect(computeTopWeightShare([...assets, makeAsset({ id: 'd' })], 0, 3)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveLastPriceUpdate
// ---------------------------------------------------------------------------

describe('resolveLastPriceUpdate', () => {
  it('should take the most recent update among the market-priced assets only', () => {
    const assets = [
      makeAsset({ id: 'a', lastPriceUpdate: new Date(2026, 7, 21, 18, 0) }),
      makeAsset({ id: 'b', lastPriceUpdate: new Date(2026, 7, 22, 9, 12) }),
      // Hand-valued: its "update" is the user's last edit, not a quote.
      makeAsset({ id: 'home', type: 'realestate', assetClass: 'realestate', lastPriceUpdate: new Date(2026, 7, 22, 11, 0) }),
      makeAsset({ id: 'off', autoUpdatePrice: false, lastPriceUpdate: new Date(2026, 7, 22, 11, 30) }),
    ];
    expect(resolveLastPriceUpdate(assets)).toEqual(new Date(2026, 7, 22, 9, 12));
  });

  it('computeUnrealizedGain should give the per-asset G/P the table and the rows share, or null without a basis', () => {
    expect(computeUnrealizedGain(makeAsset({ quantity: 10, currentPrice: 120, averageCost: 100 }))).toEqual({ gainLoss: 200, gainPercent: 20 });
    expect(computeUnrealizedGain(makeAsset({ type: 'pensionFund', quantity: 10, currentPrice: 1, averageCost: 1 }))).toBeNull();
    expect(computeUnrealizedGain(makeAsset({ quantity: 0, averageCost: 100 }))).toBeNull();
  });

  it('should be null when no asset is market-priced', () => {
    expect(resolveLastPriceUpdate([makeAsset({ type: 'cash', assetClass: 'cash' })])).toBeNull();
    expect(resolveLastPriceUpdate([])).toBeNull();
  });
});
