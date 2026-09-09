/**
 * Tests for the pure helpers in lib/utils/dashboardOverviewUtils.ts.
 *
 * These back three additions to the Panoramica hero (see CLAUDE.md "Latest"):
 *   1. computeTopMovers / computeMarketEffect — the "Mercato:" digest (every asset
 *      class whose MARKET PRICE moved this month, largest first) and its total.
 *   2. computeAllTimeHigh — the "Nuovo massimo storico" chip.
 *   3. pickFeaturedGoalProgress — the featured Goal-Based Investing progress note.
 *
 * No React, no Firebase — dashboardOverviewUtils imports only pure services/types.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { GoalAssetAssignment, InvestmentGoal } from '@/types/goals';
import type { PensionContribution } from '@/types/pension';

// dashboardOverviewUtils pulls in assetService/chartService/assetAllocationService for
// calculateAssetValue and prepareAssetClassDistributionData, which import the client
// Firebase SDK at module load time — mock it out so the suite doesn't need real Firebase
// env vars (same convention as __tests__/updateCashAssetBalancesAtomic.test.ts).
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
  computeAllTimeHigh,
  computeMarketEffect,
  computeTopInstrumentMovers,
  computeTopMovers,
  pickFeaturedGoalProgress,
  rankCostDrivers,
  rankGoalProgress,
} from '@/lib/utils/dashboardOverviewUtils';

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
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<MonthlySnapshot> = {}): MonthlySnapshot {
  return {
    userId: 'u1',
    year: 2026,
    month: 6,
    totalNetWorth: 10000,
    liquidNetWorth: 10000,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(0),
    ...overrides,
  };
}

function makeGoal(overrides: Partial<InvestmentGoal> = {}): InvestmentGoal {
  return {
    id: 'g1',
    name: 'Acquisto Casa',
    priority: 'alta',
    color: '#3B82F6',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeTopMovers / computeMarketEffect — the "Guidato da" digest is MARKET return,
// never the user's own buys and sells.
// ---------------------------------------------------------------------------

type SnapshotAssetRow = MonthlySnapshot['byAsset'][number];

function makeSnapshotAsset(overrides: Partial<SnapshotAssetRow> = {}): SnapshotAssetRow {
  return {
    assetId: 'a1',
    ticker: 'VWCE',
    name: 'Vanguard All-World',
    quantity: 10,
    price: 100,
    totalValue: 1000,
    ...overrides,
  };
}

describe('computeTopMovers', () => {
  it('should return [] when there is no previous snapshot', () => {
    const assets = [makeAsset({ quantity: 10, currentPrice: 100 })];
    expect(computeTopMovers(assets, null, 1000)).toEqual([]);
  });

  it('should return [] when totalValue is 0', () => {
    const previous = makeSnapshot({ byAsset: [makeSnapshotAsset()] });
    expect(computeTopMovers([], previous, 0)).toEqual([]);
  });

  it('should return [] when the previous snapshot has no per-asset breakdown (nothing to attribute)', () => {
    // A hand-entered or pre-byAsset snapshot only knows class totals, and a class delta
    // cannot tell a price move from a purchase — so the digest stays honest and hides.
    const assets = [makeAsset({ assetClass: 'equity', quantity: 10, currentPrice: 150 })];
    const previous = makeSnapshot({ byAssetClass: { equity: 1000 }, byAsset: [] });
    expect(computeTopMovers(assets, previous, 1500)).toEqual([]);
  });

  it("should ignore the user's own movements: selling cash to buy crypto is not a market move", () => {
    // Last month: 20.000 € cash + 0,5 BTC at 30.000 €. This month: 6.000 € cash (14.000 € sold),
    // 1,0 BTC (0,5 bought) now priced 28.000 €. The old class-delta digest read
    // "Liquidità −14.000 · Criptovalute +13.000"; the market actually LOST 1.000 € on the
    // 0,5 BTC held at the start (0,5 × (28.000 − 30.000)), and cash never moves in price.
    const assets = [
      makeAsset({ id: 'cash', type: 'cash', assetClass: 'cash', quantity: 6000, currentPrice: 1 }),
      makeAsset({ id: 'btc', type: 'crypto', assetClass: 'crypto', quantity: 1, currentPrice: 28000 }),
    ];
    const previous = makeSnapshot({
      byAsset: [
        makeSnapshotAsset({ assetId: 'cash', quantity: 20000, price: 1, totalValue: 20000 }),
        makeSnapshotAsset({ assetId: 'btc', quantity: 0.5, price: 30000, totalValue: 15000 }),
      ],
    });

    const movers = computeTopMovers(assets, previous, 34000);

    expect(movers).toEqual([{ assetClass: 'crypto', label: 'Criptovalute', delta: -1000 }]);
    expect(movers.find((m) => m.assetClass === 'cash')).toBeUndefined();
  });

  it('should list EVERY class with a measurable price effect, largest absolute effect first', () => {
    const assets = [
      makeAsset({ id: 'eq', assetClass: 'equity', quantity: 10, currentPrice: 150 }), // +500
      makeAsset({ id: 'bd', assetClass: 'bonds', quantity: 10, currentPrice: 90 }), // -100
      makeAsset({ id: 'cm', assetClass: 'commodity', quantity: 10, currentPrice: 102 }), // +20
      makeAsset({ id: 'ca', type: 'cash', assetClass: 'cash', quantity: 500, currentPrice: 1 }), // 0
    ];
    const previous = makeSnapshot({
      byAsset: [
        makeSnapshotAsset({ assetId: 'eq', quantity: 10, totalValue: 1000 }),
        makeSnapshotAsset({ assetId: 'bd', quantity: 10, totalValue: 1000 }),
        makeSnapshotAsset({ assetId: 'cm', quantity: 10, totalValue: 1000 }),
        makeSnapshotAsset({ assetId: 'ca', quantity: 500, totalValue: 500 }),
      ],
    });

    const movers = computeTopMovers(assets, previous, 3920);

    // Three classes moved, cash did not: the digest shows the three, not a top-2 cut.
    expect(movers).toEqual([
      { assetClass: 'equity', label: 'Azioni', delta: 500 },
      { assetClass: 'bonds', label: 'Obbligazioni', delta: -100 },
      { assetClass: 'commodity', label: 'Materie Prime', delta: 20 },
    ]);
  });

  it('should measure the price effect on the quantity HELD AT THE START, not on what was bought since', () => {
    // 10 shares held, 10 more bought; price 100 → 110. Market effect = 10 × 10 = 100, not 200.
    const assets = [makeAsset({ id: 'eq', assetClass: 'equity', quantity: 20, currentPrice: 110 })];
    const previous = makeSnapshot({
      byAsset: [makeSnapshotAsset({ assetId: 'eq', quantity: 10, totalValue: 1000 })],
    });
    expect(computeTopMovers(assets, previous, 2200)).toEqual([
      { assetClass: 'equity', label: 'Azioni', delta: 100 },
    ]);
  });

  it('should ignore a position opened this month (no prior price to compare)', () => {
    const assets = [
      makeAsset({ id: 'new', assetClass: 'crypto', quantity: 1, currentPrice: 28000 }),
      makeAsset({ id: 'eq', assetClass: 'equity', quantity: 10, currentPrice: 101 }),
    ];
    const previous = makeSnapshot({
      byAsset: [makeSnapshotAsset({ assetId: 'eq', quantity: 10, totalValue: 1000 })],
    });
    expect(computeTopMovers(assets, previous, 29010)).toEqual([
      { assetClass: 'equity', label: 'Azioni', delta: 10 },
    ]);
  });

  it("should split a composite asset's price effect across its composition", () => {
    const assets = [
      makeAsset({
        id: 'mix',
        assetClass: 'equity',
        composition: [
          { assetClass: 'equity', percentage: 60 },
          { assetClass: 'bonds', percentage: 40 },
        ],
        quantity: 10,
        currentPrice: 110,
      }),
    ];
    const previous = makeSnapshot({
      byAsset: [makeSnapshotAsset({ assetId: 'mix', quantity: 10, totalValue: 1000 })],
    });
    expect(computeTopMovers(assets, previous, 1100)).toEqual([
      { assetClass: 'equity', label: 'Azioni', delta: 60 },
      { assetClass: 'bonds', label: 'Obbligazioni', delta: 40 },
    ]);
  });

  it('should NOT count a mortgage instalment as a market move on real estate', () => {
    // The snapshot's totalValue is net of debt (calculateAssetValue), so paying down the mortgage
    // raises the net unit value while the property is worth exactly the same. Measured on the
    // real account: "Immobili +1.036 €" for a month in which nothing but the debt moved.
    const assets = [
      makeAsset({
        id: 'home',
        type: 'realestate',
        assetClass: 'realestate',
        quantity: 1,
        currentPrice: 130000,
        outstandingDebt: 65600,
      }),
    ];
    const previous = makeSnapshot({
      byAsset: [makeSnapshotAsset({ assetId: 'home', quantity: 1, price: 130000, totalValue: 130000 - 66645 })],
    });
    expect(computeTopMovers(assets, previous, 64400)).toEqual([]);
    expect(computeMarketEffect(assets, previous)).toBe(0);
  });

  it('should count a revaluation of the property as a market move, gross of debt', () => {
    const assets = [
      makeAsset({
        id: 'home',
        type: 'realestate',
        assetClass: 'realestate',
        quantity: 1,
        currentPrice: 135000,
        outstandingDebt: 65600,
      }),
    ];
    const previous = makeSnapshot({
      byAsset: [makeSnapshotAsset({ assetId: 'home', quantity: 1, price: 130000, totalValue: 130000 - 66645 })],
    });
    expect(computeTopMovers(assets, previous, 69400)).toEqual([
      { assetClass: 'realestate', label: 'Immobili', delta: 5000 },
    ]);
  });

  describe("pension funds — value net of the month's contributions", () => {
    const fund = () =>
      makeAsset({
        id: 'fund',
        type: 'pensionFund',
        assetClass: 'equity',
        composition: [
          { assetClass: 'equity', percentage: 60 },
          { assetClass: 'bonds', percentage: 40 },
        ],
        quantity: 28941,
        currentPrice: 1,
      });
    const previous = () =>
      makeSnapshot({
        year: 2026,
        month: 7,
        byAsset: [makeSnapshotAsset({ assetId: 'fund', quantity: 29106, price: 1, totalValue: 29106 })],
      });
    const contribution = (overrides: Partial<PensionContribution> = {}): PensionContribution => ({
      id: 'c1',
      userId: 'u1',
      assetId: 'fund',
      source: 'tfr',
      amount: 500,
      date: new Date(2026, 6, 30, 12),
      taxYear: 2026,
      deductible: false,
      createdAt: new Date(2026, 7, 10, 12),
      ...overrides,
    });

    it("should subtract the contributions registered since the previous snapshot from the fund's change", () => {
      // Value 29.106 → 28.941 with 500 € paid in during August: the market lost 665 €, not 165.
      const pension = { contributions: [contribution()], startMonth: '2026-07' };
      expect(computeMarketEffect([fund()], previous(), pension)).toBe(-665);
      // …shown as its own "Previdenza" line, like Storico's band — folded into Azioni/Obbligazioni
      // through the fund's composition it becomes invisible ("Azioni +2.842" instead of +2.964).
      expect(computeTopMovers([fund()], previous(), 28941, pension)).toEqual([
        { assetClass: 'pension', label: 'Previdenza', delta: -665 },
      ]);
    });

    it('should NOT subtract a contribution registered in or before the previous snapshot month', () => {
      // Registered on 20 July: it already sits inside the July snapshot value.
      const pension = {
        contributions: [contribution({ createdAt: new Date(2026, 6, 20, 12) })],
        startMonth: '2026-07',
      };
      expect(computeMarketEffect([fund()], previous(), pension)).toBe(-165);
    });

    it('should attribute by the month the value moved (createdAt), never by the accounting date', () => {
      // Dated 30 June, registered 10 August — it moved the value in August.
      const pension = {
        contributions: [contribution({ date: new Date(2026, 5, 30, 12), createdAt: new Date(2026, 7, 10, 12) })],
        startMonth: '2026-07',
      };
      expect(computeMarketEffect([fund()], previous(), pension)).toBe(-665);
    });

    it('should stay silent on a fund whose contributions are not tracked for the window', () => {
      // Start month after the previous snapshot, or no start at all: the growth cannot be split.
      expect(computeMarketEffect([fund()], previous(), { contributions: [contribution()], startMonth: '2026-08' })).toBe(0);
      expect(computeMarketEffect([fund()], previous(), { contributions: [], startMonth: null })).toBe(0);
      expect(computeMarketEffect([fund()], previous())).toBe(0);
    });
  });

  it('should drop price effects under 1 € as noise', () => {
    const assets = [makeAsset({ id: 'eq', assetClass: 'equity', quantity: 10, currentPrice: 100.05 })];
    const previous = makeSnapshot({
      byAsset: [makeSnapshotAsset({ assetId: 'eq', quantity: 10, totalValue: 1000 })],
    });
    expect(computeTopMovers(assets, previous, 1000.5)).toEqual([]);
  });
});

describe('computeMarketEffect', () => {
  it('should return null when there is nothing to attribute', () => {
    expect(computeMarketEffect([], null)).toBeNull();
    expect(computeMarketEffect([makeAsset()], makeSnapshot({ byAsset: [] }))).toBeNull();
  });

  it('should sum the price effect over every position held at the start, flows excluded', () => {
    const assets = [
      makeAsset({ id: 'cash', type: 'cash', assetClass: 'cash', quantity: 6000, currentPrice: 1 }),
      makeAsset({ id: 'btc', assetClass: 'crypto', quantity: 1, currentPrice: 28000 }),
      makeAsset({ id: 'eq', assetClass: 'equity', quantity: 10, currentPrice: 150 }),
    ];
    const previous = makeSnapshot({
      byAsset: [
        makeSnapshotAsset({ assetId: 'cash', quantity: 20000, totalValue: 20000 }),
        makeSnapshotAsset({ assetId: 'btc', quantity: 0.5, totalValue: 15000 }),
        makeSnapshotAsset({ assetId: 'eq', quantity: 10, totalValue: 1000 }),
      ],
    });
    // crypto −1.000 + equity +500 + cash 0
    expect(computeMarketEffect(assets, previous)).toBe(-500);
  });
});

// ---------------------------------------------------------------------------
// computeTopInstrumentMovers — the same price effect, per instrument (Patrimonio)
// ---------------------------------------------------------------------------

describe('computeTopInstrumentMovers', () => {
  it('should return nothing when the previous snapshot has no per-asset breakdown', () => {
    expect(computeTopInstrumentMovers([makeAsset()], null, 1000)).toEqual([]);
    expect(computeTopInstrumentMovers([makeAsset()], makeSnapshot({ byAsset: [] }), 1000)).toEqual([]);
    expect(computeTopInstrumentMovers([makeAsset()], makeSnapshot(), 0)).toEqual([]);
  });

  it('should list each instrument by its own price effect, largest absolute first, flows excluded', () => {
    const assets = [
      makeAsset({ id: 'eq', name: 'Vanguard All-World', ticker: '', quantity: 10, currentPrice: 150 }), // +500
      makeAsset({ id: 'bd', name: 'Global Aggregate', ticker: '', assetClass: 'bonds', quantity: 10, currentPrice: 90 }), // −100
      makeAsset({ id: 'btc', name: 'Bitcoin', ticker: '', assetClass: 'crypto', quantity: 1, currentPrice: 28000 }), // 0,5 held: −1000
      makeAsset({ id: 'ca', name: 'Conto', ticker: '', type: 'cash', assetClass: 'cash', quantity: 500, currentPrice: 1 }), // 0
    ];
    const previous = makeSnapshot({
      byAsset: [
        makeSnapshotAsset({ assetId: 'eq', quantity: 10, totalValue: 1000 }),
        makeSnapshotAsset({ assetId: 'bd', quantity: 10, totalValue: 1000 }),
        makeSnapshotAsset({ assetId: 'btc', quantity: 0.5, totalValue: 15000 }),
        makeSnapshotAsset({ assetId: 'ca', quantity: 500, totalValue: 500 }),
      ],
    });

    expect(computeTopInstrumentMovers(assets, previous, 31400)).toEqual([
      { id: 'btc', name: 'Bitcoin', delta: -1000 },
      { id: 'eq', name: 'Vanguard All-World', delta: 500 },
      { id: 'bd', name: 'Global Aggregate', delta: -100 },
    ]);
  });

  it('should add up to the class digest: one instrument is never split by its composition', () => {
    const fund = makeAsset({
      id: 'fund',
      name: 'Fondo Cometa',
      ticker: '',
      type: 'pensionFund',
      composition: [
        { assetClass: 'equity', percentage: 60 },
        { assetClass: 'bonds', percentage: 40 },
      ],
      quantity: 28941,
      currentPrice: 1,
    });
    const previous = makeSnapshot({
      year: 2026,
      month: 7,
      byAsset: [makeSnapshotAsset({ assetId: 'fund', quantity: 29106, price: 1, totalValue: 29106 })],
    });
    const pension = {
      contributions: [
        {
          id: 'c1',
          userId: 'u1',
          assetId: 'fund',
          source: 'tfr' as const,
          amount: 500,
          date: new Date(2026, 6, 30, 12),
          taxYear: 2026,
          deductible: false,
          createdAt: new Date(2026, 7, 10, 12),
        },
      ],
      startMonth: '2026-07',
    };

    const instruments = computeTopInstrumentMovers([fund], previous, 28941, pension);
    const classes = computeTopMovers([fund], previous, 28941, pension);

    expect(instruments).toEqual([{ id: 'fund', name: 'Fondo Cometa', delta: -665 }]);
    expect(instruments.reduce((sum, m) => sum + m.delta, 0)).toBe(classes.reduce((sum, m) => sum + m.delta, 0));
  });

  it('should measure real estate gross of debt and drop effects under 1 € as noise', () => {
    const assets = [
      makeAsset({ id: 'home', name: 'Casa', ticker: '', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 205000, outstandingDebt: 140000 }),
      makeAsset({ id: 'eq', name: 'ETF', ticker: '', quantity: 10, currentPrice: 100.05 }),
    ];
    const previous = makeSnapshot({
      byAsset: [
        makeSnapshotAsset({ assetId: 'home', quantity: 1, price: 200000, totalValue: 59000 }),
        makeSnapshotAsset({ assetId: 'eq', quantity: 10, totalValue: 1000 }),
      ],
    });
    expect(computeTopInstrumentMovers(assets, previous, 66000)).toEqual([{ id: 'home', name: 'Casa', delta: 5000 }]);
  });

  it('should measure a REIT ETF in the real-estate class on its EUR unit, not on its native quote', () => {
    // The gross-of-debt path is for the hand-valued property (type realestate, the only shape with a
    // debt); a USD REIT fund that merely sits in the class keeps the EUR attribution like any ETF.
    const reit = makeAsset({ id: 'reit', name: 'US REIT', type: 'etf', assetClass: 'realestate', currency: 'USD', quantity: 10, currentPrice: 100, currentPriceEur: 92 });
    const previous = makeSnapshot({ byAsset: [makeSnapshotAsset({ assetId: 'reit', quantity: 10, price: 100, totalValue: 920 })] });
    expect(computeTopInstrumentMovers([reit], previous, 920)).toEqual([]);
    expect(computeMarketEffect([reit], previous)).toBe(0);
  });

  it('should cap the list at ten instruments so the payload stays small', () => {
    const assets = Array.from({ length: 14 }, (_, i) =>
      makeAsset({ id: `a${i}`, name: `Asset ${i}`, ticker: '', quantity: 10, currentPrice: 100 + (i + 1) }),
    );
    const previous = makeSnapshot({
      byAsset: assets.map((a) => makeSnapshotAsset({ assetId: a.id, quantity: 10, totalValue: 1000 })),
    });
    const movers = computeTopInstrumentMovers(assets, previous, 14000);
    expect(movers).toHaveLength(10);
    expect(movers[0]).toEqual({ id: 'a13', name: 'Asset 13', delta: 140 });
  });

  it('should label a mover with its displayTicker alias when set, over the raw name', () => {
    const asset = makeAsset({
      id: 'eq',
      name: 'Vanguard FTSE All-World UCITS ETF',
      ticker: 'VWCE.MI',
      displayTicker: 'VWCE',
      quantity: 10,
      currentPrice: 150,
    });
    const previous = makeSnapshot({ byAsset: [makeSnapshotAsset({ assetId: 'eq', quantity: 10, totalValue: 1000 })] });
    expect(computeTopInstrumentMovers([asset], previous, 1500)).toEqual([{ id: 'eq', name: 'VWCE', delta: 500 }]);
  });
});

// ---------------------------------------------------------------------------
// rankCostDrivers — which instruments the annual cost comes from
// ---------------------------------------------------------------------------

describe('rankCostDrivers', () => {
  it('should rank held assets with a TER by annual cost (value × TER), largest first', () => {
    const assets = [
      makeAsset({ id: 'world', name: 'MSCI World', ticker: 'WORLD', quantity: 100, currentPrice: 100, totalExpenseRatio: 0.2 }), // 20 €
      makeAsset({ id: 'gold', name: 'Gold', ticker: 'GOLD', quantity: 10, currentPrice: 200, totalExpenseRatio: 0.39 }), // 7,8 €
      makeAsset({ id: 'em', name: 'Emerging', ticker: 'EM', quantity: 50, currentPrice: 100, totalExpenseRatio: 0.18 }), // 9 €
      makeAsset({ id: 'btp', name: 'BTP', ticker: 'BTP', quantity: 10, currentPrice: 100 }), // no TER → out
      makeAsset({ id: 'sold', name: 'Sold', ticker: 'SOLD', quantity: 0, currentPrice: 100, totalExpenseRatio: 0.5 }), // sold → out
    ];
    expect(rankCostDrivers(assets)).toEqual([
      { id: 'world', name: 'WORLD', totalExpenseRatio: 0.2, annualCost: 20 },
      { id: 'em', name: 'EM', totalExpenseRatio: 0.18, annualCost: 9 },
      { id: 'gold', name: 'GOLD', totalExpenseRatio: 0.39, annualCost: 7.8 },
    ]);
  });

  it('should return [] when nothing carries a TER', () => {
    expect(rankCostDrivers([makeAsset({ quantity: 10, currentPrice: 100 })])).toEqual([]);
  });

  it('should label a driver with its displayTicker alias when set, over the raw name', () => {
    const assets = [
      makeAsset({
        id: 'world',
        name: 'Vanguard FTSE All-World UCITS ETF',
        ticker: 'VWCE.MI',
        displayTicker: 'VWCE',
        quantity: 100,
        currentPrice: 100,
        totalExpenseRatio: 0.2,
      }),
    ];
    expect(rankCostDrivers(assets)).toEqual([
      { id: 'world', name: 'VWCE', totalExpenseRatio: 0.2, annualCost: 20 },
    ]);
  });

  it('should fall back to the ticker, then the name, when no alias is set', () => {
    const assets = [
      makeAsset({
        id: 'world',
        name: 'Vanguard FTSE All-World UCITS ETF',
        ticker: 'VWCE.MI',
        quantity: 100,
        currentPrice: 100,
        totalExpenseRatio: 0.2,
      }),
    ];
    expect(rankCostDrivers(assets)[0].name).toBe('VWCE.MI');
  });
});

// ---------------------------------------------------------------------------
// computeAllTimeHigh
// ---------------------------------------------------------------------------

describe('computeAllTimeHigh', () => {
  it('is not a new ATH with no prior snapshots (first-ever snapshot is a baseline)', () => {
    const result = computeAllTimeHigh([], 6, 2026, 10000);
    expect(result).toEqual({ previousAllTimeHigh: null, isNewATH: false });
  });

  it('flags a new ATH when the live value exceeds every prior snapshot', () => {
    const snapshots = [
      makeSnapshot({ month: 4, totalNetWorth: 8000 }),
      makeSnapshot({ month: 5, totalNetWorth: 9000 }),
    ];
    const result = computeAllTimeHigh(snapshots, 6, 2026, 9500);
    expect(result).toEqual({ previousAllTimeHigh: 9000, isNewATH: true });
  });

  it('does not flag an ATH when below the historical peak', () => {
    const snapshots = [
      makeSnapshot({ month: 4, totalNetWorth: 8000 }),
      makeSnapshot({ month: 5, totalNetWorth: 12000 }),
    ];
    const result = computeAllTimeHigh(snapshots, 6, 2026, 9500);
    expect(result).toEqual({ previousAllTimeHigh: 12000, isNewATH: false });
  });

  it('excludes the current month\'s own snapshot from the comparison (overwrite case)', () => {
    const snapshots = [
      makeSnapshot({ month: 5, totalNetWorth: 9000 }),
      makeSnapshot({ month: 6, totalNetWorth: 9800 }), // current month, already recorded
    ];
    // Recomputing this month at a slightly lower live value than its own stored
    // snapshot must compare against the prior month (9000), not against itself.
    const result = computeAllTimeHigh(snapshots, 6, 2026, 9500);
    expect(result).toEqual({ previousAllTimeHigh: 9000, isNewATH: true });
  });
});

// ---------------------------------------------------------------------------
// pickFeaturedGoalProgress
// ---------------------------------------------------------------------------

describe('pickFeaturedGoalProgress', () => {
  it('returns null when there are no goals', () => {
    expect(pickFeaturedGoalProgress([], [], [])).toBeNull();
  });

  it('returns null when every goal is open-ended (no targetAmount)', () => {
    const goals = [makeGoal({ targetAmount: undefined })];
    expect(pickFeaturedGoalProgress(goals, [], [])).toBeNull();
  });

  it('returns null when every eligible goal is already fully funded', () => {
    const goals = [makeGoal({ id: 'g1', targetAmount: 1000 })];
    const assets = [makeAsset({ id: 'a1', quantity: 10, currentPrice: 100 })]; // 1000
    const assignments: GoalAssetAssignment[] = [{ goalId: 'g1', assetId: 'a1', percentage: 100 }];
    expect(pickFeaturedGoalProgress(goals, assignments, assets)).toBeNull();
  });

  it('computes currentValue/progressPercentage from assigned asset portions', () => {
    const goals = [makeGoal({ id: 'g1', name: 'Fondo Emergenza', targetAmount: 2000 })];
    const assets = [makeAsset({ id: 'a1', quantity: 10, currentPrice: 100 })]; // 1000
    const assignments: GoalAssetAssignment[] = [{ goalId: 'g1', assetId: 'a1', percentage: 50 }]; // 500

    const result = pickFeaturedGoalProgress(goals, assignments, assets);
    expect(result).toMatchObject({
      goalId: 'g1',
      goalName: 'Fondo Emergenza',
      currentValue: 500,
      targetAmount: 2000,
      progressPercentage: 25,
    });
  });

  it('skips orphaned assignments referencing a deleted asset (contributes €0, not a crash)', () => {
    const goals = [makeGoal({ id: 'g1', targetAmount: 1000 })];
    const assignments: GoalAssetAssignment[] = [
      { goalId: 'g1', assetId: 'deleted-asset', percentage: 100 },
    ];
    const result = pickFeaturedGoalProgress(goals, assignments, []);
    expect(result).toMatchObject({ goalId: 'g1', currentValue: 0, progressPercentage: 0 });
  });

  it('rankGoalProgress lists every in-progress goal in featured order, funded and open-ended ones excluded', () => {
    const goals = [
      makeGoal({ id: 'done', priority: 'alta', targetAmount: 100 }),
      makeGoal({ id: 'open-ended', priority: 'alta' }),
      makeGoal({ id: 'media-40', name: 'Auto', priority: 'media', targetAmount: 1000 }),
      makeGoal({ id: 'alta-10', name: 'Casa', priority: 'alta', targetAmount: 1000 }),
      makeGoal({ id: 'media-60', name: 'Viaggio', priority: 'media', targetAmount: 1000 }),
    ];
    const assets = [
      makeAsset({ id: 'a1', quantity: 1, currentPrice: 100 }),
      makeAsset({ id: 'a2', quantity: 1, currentPrice: 400 }),
      makeAsset({ id: 'a3', quantity: 1, currentPrice: 600 }),
    ];
    const assignments: GoalAssetAssignment[] = [
      { goalId: 'done', assetId: 'a1', percentage: 100 }, // 100/100 → funded, out
      { goalId: 'alta-10', assetId: 'a1', percentage: 100 }, // 10%
      { goalId: 'media-40', assetId: 'a2', percentage: 100 }, // 40%
      { goalId: 'media-60', assetId: 'a3', percentage: 100 }, // 60%
    ];

    const ranked = rankGoalProgress(goals, assignments, assets);
    expect(ranked.map((g) => g.goalId)).toEqual(['alta-10', 'media-60', 'media-40']);
    // The featured goal is, by construction, the first of the list.
    expect(pickFeaturedGoalProgress(goals, assignments, assets)?.goalId).toBe('alta-10');
  });

  it('prefers higher priority over higher progress percentage', () => {
    const goals = [
      makeGoal({ id: 'low-priority-90pct', priority: 'bassa', targetAmount: 1000 }),
      makeGoal({ id: 'high-priority-10pct', priority: 'alta', targetAmount: 1000 }),
    ];
    const assets = [
      makeAsset({ id: 'a1', quantity: 1, currentPrice: 900 }),
      makeAsset({ id: 'a2', quantity: 1, currentPrice: 100 }),
    ];
    const assignments: GoalAssetAssignment[] = [
      { goalId: 'low-priority-90pct', assetId: 'a1', percentage: 100 }, // 900/1000 = 90%
      { goalId: 'high-priority-10pct', assetId: 'a2', percentage: 100 }, // 100/1000 = 10%
    ];

    const result = pickFeaturedGoalProgress(goals, assignments, assets);
    expect(result?.goalId).toBe('high-priority-10pct');
  });

  it('breaks a priority tie by picking the furthest-along goal', () => {
    const goals = [
      makeGoal({ id: 'behind', priority: 'alta', targetAmount: 1000 }),
      makeGoal({ id: 'ahead', priority: 'alta', targetAmount: 1000 }),
    ];
    const assets = [
      makeAsset({ id: 'a1', quantity: 1, currentPrice: 200 }),
      makeAsset({ id: 'a2', quantity: 1, currentPrice: 800 }),
    ];
    const assignments: GoalAssetAssignment[] = [
      { goalId: 'behind', assetId: 'a1', percentage: 100 }, // 20%
      { goalId: 'ahead', assetId: 'a2', percentage: 100 }, // 80%
    ];

    const result = pickFeaturedGoalProgress(goals, assignments, assets);
    expect(result?.goalId).toBe('ahead');
  });
});
