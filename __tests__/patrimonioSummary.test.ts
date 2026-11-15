/**
 * Tests for lib/utils/patrimonioSummary.ts — the pure figures behind Patrimonio's tiles (cash
 * accounts, the month's trades, unrealized gains, instrument return ranking, top weights, last
 * price update). Mocks mirror dashboardOverviewUtils.test.ts: calculateAssetValue lives in
 * assetService, which imports the client Firebase SDK at module load.
 *
 * Falsified on 2026-10-16, one at a time, on `describePatrimonioClosedAnswers` (the closed rows'
 * answers): without the `count === 0` branch → the Movimenti test red; the footer's hand-written
 * sign («+0 €») → red; `cachedFormatCurrencyEUR(total)` with Intl's hyphen → the negative balance
 * red; without the strip check → «Classi» red; the rendimento zero signed → red; several loans
 * answered, the `never` branch dropped, a failed read answered → the loan test red each time; an
 * answer on three positions → Strumenti red; Liquidità answering with the strip's share → the
 * Lifted-Figure test red.
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

import { formatSignedEuro } from '@/lib/utils/formatters';
import { narrativeToText } from '@/lib/utils/narrative';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { describeCashAccounts } from '@/lib/utils/patrimonioNarrative';
import { formatStripFigure, liftedBlocks, validateStrip, type StripFigure } from '@/lib/utils/verdictStrip';
import type { Narrative } from '@/lib/utils/narrative';
import type { MortgageSummary } from '@/lib/utils/mortgageSummary';
import {
  describePatrimonioClosedAnswers,
  type PatrimonioClosedAnswersInput,
  PATRIMONIO_GAIN_BLOCK,
  PATRIMONIO_SECTION_IDS,
  patrimonioMutuoSectionId,
  selectPatrimonioStrip,
  type CashAccountsSummary,
  type UnrealizedGainsSummary,
  computeTopWeightShare,
  computeUnrealizedGain,
  hasCostBasis,
  isCashAccount,
  isHeld,
  rankInstrumentReturns,
  resolveBondRowFacts,
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

  it('should measure the shares on the money held and call an account in the red a debt', () => {
    // Accounts beside a credit card in the red (2026-09-19): measured on the net, the shares read
    // 133% and −50%.
    const accounts = [
      makeAsset({ id: 'tapiro', name: 'Conto Tapiro', type: 'cash', assetClass: 'cash', quantity: 8000, currentPrice: 1 }),
      makeAsset({ id: 'fenicottero', name: 'Conto Fenicottero', type: 'cash', assetClass: 'cash', quantity: 1000, currentPrice: 1 }),
      makeAsset({ id: 'carta', name: 'Carta Tapiro', type: 'cash', assetClass: 'cash', quantity: -3000, currentPrice: 1 }),
    ];
    const summary = summarizeCashAccounts(accounts, 300000);
    expect(summary.total).toBeCloseTo(6000, 2);
    expect(summary.accounts.find((a) => a.id === 'tapiro')!.shareOfCash).toBeCloseTo(88.89, 1);
    expect(summary.accounts.find((a) => a.id === 'carta')!.shareOfCash).toBeNull();
    expect(summary.largest).toMatchObject({ id: 'tapiro' });
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

// ─────────────────────────────────────────────────────────────────────────────
// hasCostBasis on hand-valued holdings / resolveBondRowFacts (2026-09-14)
// ─────────────────────────────────────────────────────────────────────────────

describe('hasCostBasis — a PMC on a hand-valued holding is not a PMC', () => {
  it('refuses the structural «+0,00 €» of a private-equity stake and of a property kept at price 1', () => {
    // A private-equity stake valued by hand: the value in quantity, price 1, averageCost 1.
    const privateEquity = makeAsset({ type: 'stock', assetClass: 'equity', subCategory: 'Private Equity', quantity: 5000, currentPrice: 1, averageCost: 1 });
    expect(hasCostBasis(privateEquity)).toBe(false);
    expect(computeUnrealizedGain(privateEquity)).toBeNull();
    expect(hasCostBasis(makeAsset({ type: 'realestate', assetClass: 'realestate', quantity: 200000, currentPrice: 1, averageCost: 1 }))).toBe(false);
    // A quoted instrument the owner prices by hand keeps its real PMC.
    expect(hasCostBasis(makeAsset({ autoUpdatePrice: false, averageCost: 90 }))).toBe(true);
  });
});

describe('resolveBondRowFacts — the dates under a bond row', () => {
  it('reads maturity, whether coupons exist and the next coupon from the bond details', () => {
    const facts = resolveBondRowFacts(
      makeAsset({
        type: 'bond',
        assetClass: 'bonds',
        bondDetails: { couponRate: 3, couponFrequency: 'semiannual', issueDate: new Date(2024, 2, 4), maturityDate: new Date(2099, 2, 4) },
      }),
    );
    expect(facts?.maturityDate).toEqual(new Date(2099, 2, 4));
    expect(facts?.hasCoupons).toBe(true);
    expect(facts?.nextCoupon).not.toBeNull();
  });

  it('has no coupon for a zero coupon and nothing for a non-bond', () => {
    const zero = resolveBondRowFacts(
      makeAsset({ type: 'bond', assetClass: 'bonds', bondDetails: { couponRate: 0, couponFrequency: 'annual', issueDate: new Date(2026, 0, 15), maturityDate: new Date(2027, 0, 15) } }),
    );
    expect(zero).toMatchObject({ hasCoupons: false, nextCoupon: null });
    expect(resolveBondRowFacts(makeAsset())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// selectPatrimonioStrip — the phone's two cells (2026-10-14)
// ---------------------------------------------------------------------------

/**
 * Each cell prints EXACTLY what its tile prints: the G/P through the formatter `RendimentoTile`
 * calls for its KPI (`formatSignedEuro`, with the cents), the Liquidità share as the tile's
 * reading prints it (`describeCashAccounts`). Seen red: `decimals: 2` dropped from the G/P cell
 * (it printed the compact «+1235 €» beside the tile's «+1234,56 €»).
 */
describe('selectPatrimonioStrip', () => {
  const plain = (text: string) => text.replace(/[  ]/g, ' ');
  const cellText = (figure: StripFigure) => plain(narrativeToText([formatStripFigure(figure)!]));
  const gains = (gainLoss: number, count = 4): UnrealizedGainsSummary => ({ gainLoss, costBasis: 20000, gainPercent: (gainLoss / 20000) * 100, count });
  const cash = (shareOfTotal: number | null, accounts = 2): CashAccountsSummary => ({
    accounts: Array.from({ length: accounts }, (_, i) => ({ id: `c${i}`, name: `Conto ${i}`, balance: 1000, shareOfCash: 50 })),
    total: 2000,
    shareOfTotal,
    largest: accounts > 0 ? { id: 'c0', name: 'Conto 0', balance: 1000, shareOfCash: 50 } : null,
  });
  const KNOWN = [...Object.values(PATRIMONIO_SECTION_IDS), VERDICT_REST_SECTION];

  it('should open the Rendimento and Liquidità rows, lift only the G/P KPI and pass the strip rules', () => {
    const strip = selectPatrimonioStrip({ gains: gains(1234.56), cash: cash(12.34) });
    expect(strip.map((figure) => figure.label)).toEqual(['G/P non realizzato', 'Liquidità']);
    expect(strip.map((figure) => figure.opens)).toEqual([PATRIMONIO_SECTION_IDS.rendimento, PATRIMONIO_SECTION_IDS.liquidita]);
    expect(validateStrip(strip, KNOWN)).toEqual([]);
    expect(liftedBlocks(strip, PATRIMONIO_SECTION_IDS.rendimento)).toEqual([PATRIMONIO_GAIN_BLOCK]);
    expect(liftedBlocks(strip, PATRIMONIO_SECTION_IDS.liquidita)).toEqual([]);
  });

  it('should print the G/P as the tile prints its KPI — with the cents, the U+2212, a zero unsigned', () => {
    for (const value of [1234.56, -80, -0.004, 0]) {
      const [gain] = selectPatrimonioStrip({ gains: gains(value), cash: cash(10) });
      expect(cellText(gain)).toBe(plain(formatSignedEuro(value)));
    }
    expect(formatStripFigure(selectPatrimonioStrip({ gains: gains(-0.004), cash: cash(10) })[0])!.sign).toBeUndefined();
  });

  it('should print the Liquidità share as the tile reading does', () => {
    const [, share] = selectPatrimonioStrip({ gains: gains(100), cash: cash(7.96) });
    const reading = plain(narrativeToText(describeCashAccounts(7.96, { name: 'Conto 0', balance: 1000 }, 2)!));
    expect(reading).toContain(cellText(share));
    expect(cellText(share)).toBe('8,0%');
  });

  it('should say why a cell has no figure', () => {
    const [gain] = selectPatrimonioStrip({ gains: gains(0, 0), cash: cash(10) });
    expect(gain.value).toBeNull();
    expect(gain.reason).toBe('nessuna posizione con un prezzo di carico');
    expect(liftedBlocks([gain], PATRIMONIO_SECTION_IDS.rendimento)).toEqual([]);
    expect(selectPatrimonioStrip({ gains: gains(1), cash: cash(null) })[1].reason).toBe('nessun totale su cui misurarla');
    expect(selectPatrimonioStrip({ gains: gains(1), cash: cash(-3) })[1].reason).toBe('i debiti superano i conti');
    expect(selectPatrimonioStrip({ gains: gains(1), cash: cash(0) })[1].reason).toBe('i debiti superano i conti');
    expect(selectPatrimonioStrip({ gains: gains(1), cash: cash(0, 0) })[1].reason).toBe('nessun conto registrato');
    for (const strip of [selectPatrimonioStrip({ gains: gains(0, 0), cash: cash(null, 0) })]) expect(validateStrip(strip, KNOWN)).toEqual([]);
  });

  it('should give each loan a row of its own', () => {
    expect(patrimonioMutuoSectionId('loan-7')).toBe('patrimonio-mutuo-loan-7');
  });
});

describe('describePatrimonioClosedAnswers (the landscape index)', () => {
  const plain = (text: string) => text.replace(/[  ]/g, ' ');
  const text = (answer: Narrative | null | undefined) => (answer ? plain(narrativeToText(answer)).trim() : null);
  const GAINS: UnrealizedGainsSummary = { gainLoss: 4000, costBasis: 20000, gainPercent: 20, count: 4 };
  const CASH: CashAccountsSummary = {
    accounts: [{ id: 'c0', name: 'Conto', balance: 8000, shareOfCash: 100 }],
    total: 8000,
    shareOfTotal: 2.6,
    largest: { id: 'c0', name: 'Conto', balance: 8000, shareOfCash: 100 },
  };
  const LOAN: MortgageSummary = {
    loanId: 'mutuo-casa',
    loanName: 'Mutuo Casa',
    propertyName: 'Casa',
    kind: 'mortgage',
    debt: 120000,
    annualRatePct: 2,
    year: 2026,
    yearPrincipal: 5000,
    yearInterest: 2000,
    yearInstalments: 10,
    totalInterest: 2000,
    trackedSince: new Date(2026, 0, 15, 12),
    byYear: [{ year: 2026, interest: 2000, principal: 5000, instalments: 10, partialFrom: null }],
    next: { date: new Date(2026, 10, 15, 12), amount: 700, principal: 500, interest: 200 },
    payoff: { kind: 'date', months: 121, date: new Date(2036, 10, 15, 12) },
  };
  /** Five positions of 1000 € on a 5000 € total: the largest three weigh 60,0%. */
  const INSTRUMENTS = Array.from({ length: 5 }, (_, i) => makeAsset({ id: `a${i}`, ticker: `T${i}` }));
  const input = (overrides: Partial<PatrimonioClosedAnswersInput> = {}): PatrimonioClosedAnswersInput => ({
    trades: { summary: { bought: 2000, sold: 300, net: 1700, count: 2, rows: [] }, ledgerReady: true, loading: false, failed: false },
    cash: CASH,
    classes: [
      { name: 'Immobili', percentage: 80 },
      { name: 'Azioni', percentage: 20 },
    ],
    strip: selectPatrimonioStrip({ gains: GAINS, cash: CASH }),
    gains: GAINS,
    mortgages: [LOAN],
    mortgageFailed: false,
    instruments: INSTRUMENTS,
    totalValue: 5000,
    ...overrides,
  });
  const MUTUO = patrimonioMutuoSectionId(LOAN.loanId);

  it('should answer every row with words and at most one figure, as the tile prints it', () => {
    const answers = describePatrimonioClosedAnswers(input());
    expect(Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, text(answer)]))).toEqual({
      [PATRIMONIO_SECTION_IDS.movimenti]: 'netto +1700 €',
      [PATRIMONIO_SECTION_IDS.liquidita]: 'sui conti 8000,00 €',
      [PATRIMONIO_SECTION_IDS.classi]: 'Immobili 80,0%',
      [PATRIMONIO_SECTION_IDS.rendimento]: 'sul costo +20,0%',
      [PATRIMONIO_SECTION_IDS.mutuo]: null,
      [MUTUO]: 'fine prevista nov 2036',
      [PATRIMONIO_SECTION_IDS.strumenti]: 'i 3 maggiori 60,0%',
      // No owner set on this fixture: the Intestatari row does not exist.
      [PATRIMONIO_SECTION_IDS.intestatari]: null,
    });
    for (const answer of Object.values(answers)) {
      if (!answer) continue;
      expect(answer.filter((segment) => segment.mono).length).toBeLessThanOrEqual(1);
      expect(text(answer)!.length).toBeLessThanOrEqual(22);
    }
    // Only the return on cost is a gain: the net invested is not, nor is the balance.
    expect(answers[PATRIMONIO_SECTION_IDS.rendimento]!.find((segment) => segment.mono)!.sign).toBe('positive');
    expect(answers[PATRIMONIO_SECTION_IDS.movimenti]!.some((segment) => segment.sign)).toBe(false);
  });

  // «Intestatari» (2026-10-17): the largest owner and the share its row prints.
  it('should answer the Intestatari row with the largest owner when a held asset names one', () => {
    const ownership = {
      rows: [
        { key: 'giulia', kind: 'member' as const, memberId: 'giulia', label: 'Giulia', value: 3000, sharePct: 60, costValue: 2500, costSharePct: 55.6, assetCount: 1 },
        { key: 'common', kind: 'common' as const, memberId: null, label: 'In comune', value: 2000, sharePct: 40, costValue: 2000, costSharePct: 44.4, assetCount: 4 },
      ],
      total: 5000,
      costTotal: 4500,
      assetCount: 5,
      hasOwners: true,
      reassign: [],
      withoutCostBasis: [],
    };
    expect(text(describePatrimonioClosedAnswers(input({ ownership }))[PATRIMONIO_SECTION_IDS.intestatari])).toBe('Giulia 60%');
  });

  it('should never repeat a figure the strip prints (The Lifted-Figure Rule)', () => {
    const answers = describePatrimonioClosedAnswers(input());
    const stripTexts = input().strip.map((cell) => plain(narrativeToText([formatStripFigure(cell)!])));
    for (const answer of Object.values(answers)) {
      const figure = answer?.find((segment) => segment.mono);
      if (figure) expect(stripTexts).not.toContain(plain(figure.text));
    }
  });

  it('should keep «Classi» on its scope when its first share prints as the strip\'s Liquidità cell', () => {
    // A cash-heavy portfolio: the class «Liquidità» at 2,6% and the accounts at 2,6% of the total.
    const cashFirst = input({ classes: [{ name: 'Liquidità', percentage: 2.6 }] });
    expect(describePatrimonioClosedAnswers(cashFirst)[PATRIMONIO_SECTION_IDS.classi]).toBeNull();
    expect(describePatrimonioClosedAnswers(input({ classes: [] }))[PATRIMONIO_SECTION_IDS.classi]).toBeNull();
  });

  it('should keep Movimenti on its scope with no operation, a ledger not active, a read in flight or failed', () => {
    const trades = input().trades;
    for (const override of [
      { summary: { bought: 0, sold: 0, net: 0, count: 0, rows: [] } },
      { ledgerReady: false },
      { loading: true },
      { failed: true },
    ]) {
      expect(describePatrimonioClosedAnswers(input({ trades: { ...trades, ...override } }))[PATRIMONIO_SECTION_IDS.movimenti]).toBeNull();
    }
    // Bought = sold: a measured zero, without a sign (the footer prints «+0 €»).
    const even = input({ trades: { ...trades, summary: { bought: 500, sold: 500, net: 0, count: 2, rows: [] } } });
    expect(text(describePatrimonioClosedAnswers(even)[PATRIMONIO_SECTION_IDS.movimenti])).toBe('netto 0 €');
    const out = input({ trades: { ...trades, summary: { bought: 0, sold: 800, net: -800, count: 1, rows: [] } } });
    expect(text(describePatrimonioClosedAnswers(out)[PATRIMONIO_SECTION_IDS.movimenti])).toBe('netto −800 €');
  });

  it('should print a negative balance with the typographic minus and say nothing without an account', () => {
    const debt = input({ cash: { ...CASH, total: -1234 } });
    expect(text(describePatrimonioClosedAnswers(debt)[PATRIMONIO_SECTION_IDS.liquidita])).toBe('sui conti −1234,00 €');
    const none = input({ cash: { accounts: [], total: 0, shareOfTotal: 0, largest: null } });
    expect(describePatrimonioClosedAnswers(none)[PATRIMONIO_SECTION_IDS.liquidita]).toBeNull();
  });

  it('should print a return that rounds to zero unsigned and be null without a cost basis', () => {
    const flat = describePatrimonioClosedAnswers(input({ gains: { ...GAINS, gainPercent: -0.04 } }))[PATRIMONIO_SECTION_IDS.rendimento];
    expect(text(flat)).toBe('sul costo 0,0%');
    expect(flat!.some((segment) => segment.sign)).toBe(false);
    const none = describePatrimonioClosedAnswers(input({ gains: { gainLoss: 0, costBasis: 0, gainPercent: null, count: 0 } }));
    expect(none[PATRIMONIO_SECTION_IDS.rendimento]).toBeNull();
  });

  it('should answer one loan by its end, and leave several loans their names', () => {
    const one = (payoff: MortgageSummary['payoff']) => text(describePatrimonioClosedAnswers(input({ mortgages: [{ ...LOAN, payoff }] }))[MUTUO]);
    expect(one({ kind: 'repaid' })).toBe('estinto');
    expect(one({ kind: 'never' })).toBe('il debito non scende');
    expect(one(null)).toBeNull();
    const two = describePatrimonioClosedAnswers(input({ mortgages: [LOAN, { ...LOAN, loanId: 'prestito-auto' }] }));
    expect(two[MUTUO]).toBeNull();
    expect(two[patrimonioMutuoSectionId('prestito-auto')]).toBeNull();
    // A failed read of the instalments is ONE red row: never an answer.
    const failed = describePatrimonioClosedAnswers(input({ mortgageFailed: true }));
    expect(failed[PATRIMONIO_SECTION_IDS.mutuo]).toBeNull();
    expect(failed[MUTUO]).toBeUndefined();
  });

  it('should leave Strumenti its count when the largest three are the whole table', () => {
    const three = describePatrimonioClosedAnswers(input({ instruments: INSTRUMENTS.slice(0, 3), totalValue: 3000 }));
    expect(three[PATRIMONIO_SECTION_IDS.strumenti]).toBeNull();
  });
});
