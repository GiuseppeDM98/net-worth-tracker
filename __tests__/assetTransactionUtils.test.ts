/**
 * Unit tests for the asset trade-ledger derivation engine (Registro operazioni asset, Fase A).
 * Pure math + derivation — no Firebase, no React. Time is injected via explicit Date params.
 *
 * Covers the full 23-case derivation matrix.
 */

import { describe, it, expect } from 'vitest';
import {
  sortTransactionsForReplay,
  replayTransactions,
  replayTransactionsWithEffects,
  buildDerivedAssetFields,
  computeCashDelta,
  buildXirrFlows,
  computeAssetXirr,
  computeAssetTotalReturn,
  computeInvestedCapital,
  aggregateRealizedByYear,
  LedgerValidationError,
  EPSILON,
  type XirrFlow,
} from '@/lib/utils/assetTransactionUtils';
import type { AssetTransaction, AssetTransactionType } from '@/types/assetTransactions';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// Day-exact date helper: pure millisecond arithmetic so day differences are independent of the
// test runner's timezone (relevant for XIRR discounting).
const BASE_MS = Date.UTC(2024, 0, 1);
const day = (n: number) => new Date(BASE_MS + n * 24 * 60 * 60 * 1000);

interface TxInput {
  type: AssetTransactionType;
  date: Date;
  quantity: number;
  pricePerUnit: number;
  priceEur?: number; // defaults to pricePerUnit (EUR-denominated asset)
  fees?: number;
  linkedCashAssetId?: string;
  isBaseline?: boolean;
  id?: string;
  createdAt?: Date;
  assetId?: string;
}

let seq = 0;
function tx(o: TxInput): AssetTransaction {
  seq += 1;
  const createdAt = o.createdAt ?? new Date(2020, 0, 1);
  return {
    id: o.id ?? `t${seq}`,
    userId: 'u1',
    assetId: o.assetId ?? 'a1',
    type: o.type,
    date: o.date,
    quantity: o.quantity,
    pricePerUnit: o.pricePerUnit,
    priceEur: o.priceEur ?? o.pricePerUnit,
    fees: o.fees,
    linkedCashAssetId: o.linkedCashAssetId,
    isBaseline: o.isBaseline,
    createdAt,
    updatedAt: createdAt,
  };
}

/** Independent NPV used only to verify that a solved XIRR is a genuine root. */
function localNpv(flows: XirrFlow[], r: number): number {
  const t0 = Math.min(...flows.map((f) => f.date.getTime()));
  return flows.reduce(
    (sum, f) => sum + f.amountEur / Math.pow(1 + r, (f.date.getTime() - t0) / 86400000 / 365),
    0,
  );
}

// ===========================================================================
// Replay / PMC (cases 1-13)
// ===========================================================================

describe('replayTransactions — position replay and PMC', () => {
  // Case 1
  it('replays a single buy with fees in the EUR basis but NOT in the native PMC', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 50, fees: 5 }),
    ]);

    expect(state.quantity).toBe(10);
    expect(state.averageCost).toBeCloseTo(50, 6); // native PMC excludes fees
    expect(state.costBasisEur).toBeCloseTo(505, 6); // 10·50 + 5 fee
    expect(state.investedEur).toBeCloseTo(505, 6);
    expect(state.averageCostEur).toBeCloseTo(50.5, 6);
  });

  // Case 2
  it('computes a weighted-average PMC across two buys at different prices', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ type: 'buy', date: day(1), quantity: 10, pricePerUnit: 200 }),
    ]);

    expect(state.quantity).toBe(20);
    expect(state.averageCost).toBeCloseTo(150, 6); // (10·100 + 10·200) / 20
    expect(state.costBasisEur).toBeCloseTo(3000, 6);
    expect(state.averageCostEur).toBeCloseTo(150, 6);
  });

  // Case 3
  it('leaves the PMC unchanged on a partial sell and books realized P&L net of fees', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ type: 'sell', date: day(5), quantity: 4, pricePerUnit: 150, fees: 2 }),
    ]);

    expect(state.quantity).toBe(6);
    expect(state.averageCost).toBeCloseTo(100, 6); // selling never moves the PMC
    // realized = qty·(sellEur − avgEur) − fees = 4·(150 − 100) − 2
    expect(state.realizedPnlEur).toBeCloseTo(198, 6);
    expect(state.costBasisEur).toBeCloseTo(600, 6);
  });

  // Case 4
  it('closes the position to exactly zero on a full sell and retains the last PMC', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ type: 'sell', date: day(5), quantity: 10, pricePerUnit: 120 }),
    ]);

    expect(state.quantity).toBe(0); // exact, no float dust
    expect(state.costBasisEur).toBe(0); // exact
    expect(state.averageCost).toBeCloseTo(100, 6); // retained at qty 0
    expect(state.averageCostEur).toBeUndefined();
    expect(state.realizedPnlEur).toBeCloseTo(200, 6);
  });

  // Case 5
  it('throws SELL_EXCEEDS_HOLDING when a sell exceeds the held quantity, but tolerates float dust', () => {
    let caught: unknown;
    try {
      replayTransactions([
        tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
        tx({ type: 'sell', date: day(5), quantity: 11, pricePerUnit: 120 }),
      ]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LedgerValidationError);
    expect((caught as LedgerValidationError).code).toBe('SELL_EXCEEDS_HOLDING');
    expect((caught as LedgerValidationError).userMessage).toContain('vendita');

    // Sub-epsilon over-sell (1e-9 dust) must NOT throw; it clamps to a closed position.
    const dust = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ type: 'sell', date: day(5), quantity: 10 + 5e-10, pricePerUnit: 120 }),
    ]);
    expect(dust.quantity).toBe(0);
  });

  // Case 6
  it('restarts the PMC and stamps holdingStartDate at the rebuy after a sell-then-rebuy', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ type: 'sell', date: day(10), quantity: 10, pricePerUnit: 120 }),
      tx({ type: 'buy', date: day(20), quantity: 5, pricePerUnit: 200 }),
    ]);

    expect(state.quantity).toBe(5);
    expect(state.averageCost).toBeCloseTo(200, 6); // PMC restarts from the rebuy price
    expect(state.holdingStartDate?.getTime()).toBe(day(20).getTime());
    expect(state.realizedPnlEur).toBeCloseTo(200, 6); // realized from the interim full sell
  });

  // Case 7
  it('reproduces the migrated state from a baseline-only replay without a holdingStartDate', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 100, pricePerUnit: 25, isBaseline: true }),
    ]);

    expect(state.quantity).toBe(100);
    expect(state.averageCost).toBeCloseTo(25, 6);
    expect(state.costBasisEur).toBeCloseTo(2500, 6);
    expect(state.investedEur).toBeCloseTo(2500, 6);
    // Invariant #4: the baseline must never produce a holdingStartDate.
    expect(state.holdingStartDate).toBeUndefined();
  });

  // Case 8
  it('keeps value constant and books no realized P&L on a split adjustment (qty ×2, PMC ÷2)', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ type: 'adjustment', date: day(5), quantity: 20, pricePerUnit: 50 }),
    ]);

    expect(state.quantity).toBe(20);
    expect(state.averageCost).toBeCloseTo(50, 6);
    expect(state.costBasisEur).toBeCloseTo(1000, 6); // unchanged: 10·100 == 20·50
    expect(state.realizedPnlEur).toBe(0);
  });

  // Case 9
  it('closes a position via an adjustment to quantity 0 without realized P&L', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ type: 'adjustment', date: day(5), quantity: 0, pricePerUnit: 0 }),
    ]);

    expect(state.quantity).toBe(0);
    expect(state.costBasisEur).toBe(0);
    expect(state.realizedPnlEur).toBe(0);
  });

  // Case 10
  it('applies a same-day buy before a same-day sell of a brand-new asset (ordering rule)', () => {
    // Sell listed BEFORE the buy in the input; the sort must still apply the buy first.
    const state = replayTransactions([
      tx({ type: 'sell', date: day(0), quantity: 4, pricePerUnit: 120, id: 's' }),
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100, id: 'b' }),
    ]);

    expect(state.quantity).toBe(6); // valid sequence, no throw
  });

  // Case 11
  it('replays a shuffled input to an identical state (ordering determinism, tie-breaks 1-4)', () => {
    const ordered = [
      tx({ type: 'buy', date: day(0), quantity: 50, pricePerUnit: 20, isBaseline: true, id: 'a0' }),
      tx({ type: 'buy', date: day(5), quantity: 10, pricePerUnit: 30, id: 'a1' }),
      tx({ type: 'buy', date: day(10), quantity: 5, pricePerUnit: 25, createdAt: day(100), id: 'a2' }),
      tx({ type: 'buy', date: day(10), quantity: 5, pricePerUnit: 27, createdAt: day(200), id: 'a3' }),
      tx({ type: 'sell', date: day(20), quantity: 20, pricePerUnit: 40, id: 'a4' }),
    ];
    const shuffled = [ordered[3], ordered[0], ordered[4], ordered[1], ordered[2]];

    expect(replayTransactions(shuffled)).toEqual(replayTransactions(ordered));
  });

  // Case 12
  it('buckets realized P&L by Italy fiscal year across a New-Year midnight boundary', () => {
    // Two sells on the same UTC calendar day but different Italy years (UTC+1, no DST in winter).
    const state = replayTransactions([
      tx({ type: 'buy', date: new Date('2025-06-01T00:00:00Z'), quantity: 100, pricePerUnit: 10 }),
      // 23:30 Rome on 31/12/2025 → 2025
      tx({ type: 'sell', date: new Date('2025-12-31T22:30:00Z'), quantity: 10, pricePerUnit: 12 }),
      // 00:30 Rome on 01/01/2026 → 2026
      tx({ type: 'sell', date: new Date('2025-12-31T23:30:00Z'), quantity: 10, pricePerUnit: 15 }),
    ]);

    expect(Object.keys(state.realizedByYear).sort()).toEqual(['2025', '2026']);
    expect(state.realizedByYear[2025]).toBeCloseTo(20, 6); // 10·(12 − 10)
    expect(state.realizedByYear[2026]).toBeCloseTo(50, 6); // 10·(15 − 10)
  });

  // Case 13
  it('rejects a mid-history edit that makes a later sell over-sell (route pre-write validation)', () => {
    // Simulates editing the middle buy down from 10 to 2: only 12 held when 15 are sold.
    let caught: unknown;
    try {
      replayTransactions([
        tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
        tx({ type: 'buy', date: day(5), quantity: 2, pricePerUnit: 110 }),
        tx({ type: 'sell', date: day(10), quantity: 15, pricePerUnit: 130 }),
      ]);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LedgerValidationError);
    expect((caught as LedgerValidationError).code).toBe('SELL_EXCEEDS_HOLDING');
  });

  it('projects only the asset-doc fields via buildDerivedAssetFields', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
    ]);
    const derived = buildDerivedAssetFields(state);

    expect(derived).toEqual({
      quantity: 10,
      averageCost: state.averageCost,
      averageCostEur: state.averageCostEur,
      holdingStartDate: state.holdingStartDate,
    });
  });

  it('projects a distinct averageCostEur when the trade FX differs from the native price', () => {
    // Native price 100 USD/quota, but the trade-date FX made it 90 EUR/quota — the two PMCs must
    // diverge, otherwise the projection is silently collapsing the EUR side back onto the native one.
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100, priceEur: 90 }),
    ]);
    const derived = buildDerivedAssetFields(state);

    expect(derived.averageCost).toBe(100);
    expect(derived.averageCostEur).toBe(90);
  });

  it('orders baseline, then buy before sell, then by createdAt, then by id', () => {
    const baseline = tx({ type: 'buy', date: day(0), quantity: 1, pricePerUnit: 1, isBaseline: true, id: 'z' });
    const sell = tx({ type: 'sell', date: day(0), quantity: 1, pricePerUnit: 1, id: 'a' });
    const buyLateCreated = tx({ type: 'buy', date: day(0), quantity: 1, pricePerUnit: 1, createdAt: day(50), id: 'a' });
    const buyEarlyCreated = tx({ type: 'buy', date: day(0), quantity: 1, pricePerUnit: 1, createdAt: day(10), id: 'y' });

    const sorted = sortTransactionsForReplay([sell, buyLateCreated, buyEarlyCreated, baseline]);

    expect(sorted.map((t) => t.id)).toEqual(['z', 'y', 'a', 'a']);
    expect(sorted[0].isBaseline).toBe(true);
    expect(sorted[3].type).toBe('sell');
  });
});

// ===========================================================================
// Cash delta (case 14)
// ===========================================================================

describe('computeCashDelta — signed settlement delta', () => {
  // Case 14
  it('debits on buy, credits on sell (net of fees), and returns 0 without a linked cash asset', () => {
    const buy = tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100, fees: 5, linkedCashAssetId: 'c1' });
    const sell = tx({ type: 'sell', date: day(1), quantity: 10, pricePerUnit: 120, fees: 3, linkedCashAssetId: 'c1' });
    const adjustment = tx({ type: 'adjustment', date: day(2), quantity: 20, pricePerUnit: 50, linkedCashAssetId: 'c1' });
    const buyNoLink = tx({ type: 'buy', date: day(3), quantity: 10, pricePerUnit: 100 });

    expect(computeCashDelta(buy)).toBeCloseTo(-1005, 6); // −(10·100 + 5)
    expect(computeCashDelta(sell)).toBeCloseTo(1197, 6); // 10·120 − 3
    expect(computeCashDelta(adjustment)).toBe(0); // absolute reset never settles cash
    expect(computeCashDelta(buyNoLink)).toBe(0);
  });
});

// ===========================================================================
// XIRR (cases 15-19)
// ===========================================================================

describe('computeAssetXirr / buildXirrFlows — money-weighted return', () => {
  // Case 15
  it('returns ≈ 0.10 for a 100 → 110 investment exactly 365 days apart', () => {
    const flows = buildXirrFlows({
      transactions: [tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 10 })],
      dividendsNetEur: [],
      currentValueEur: 110,
      now: day(365),
    });

    expect(flows).toHaveLength(2); // opening outflow + terminal inflow
    expect(computeAssetXirr(flows)).toBeCloseTo(0.1, 4);
  });

  // Case 16
  it('produces a higher rate when a dividend is added mid-period', () => {
    const base = computeAssetXirr(
      buildXirrFlows({
        transactions: [tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 10 })],
        dividendsNetEur: [],
        currentValueEur: 110,
        now: day(365),
      }),
    );
    const withDividend = computeAssetXirr(
      buildXirrFlows({
        transactions: [tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 10 })],
        dividendsNetEur: [{ date: day(180), amountEur: 5 }],
        currentValueEur: 110,
        now: day(365),
      }),
    );

    expect(base).not.toBeNull();
    expect(withDividend).not.toBeNull();
    expect(withDividend as number).toBeGreaterThan(base as number);
  });

  // Case 17
  it('computes the rate of a closed position from its two real flows (no terminal)', () => {
    const flows = buildXirrFlows({
      transactions: [
        tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 10 }),
        tx({ type: 'sell', date: day(365), quantity: 10, pricePerUnit: 11 }),
      ],
      dividendsNetEur: [],
      currentValueEur: 999, // ignored — position is closed
      now: day(400),
    });

    expect(flows).toHaveLength(2); // no terminal mark-to-market flow
    expect(computeAssetXirr(flows)).toBeCloseTo(0.1, 4); // −100 @0, +110 @365
  });

  // Case 18
  it('returns null for all-same-sign, fewer-than-two, or same-day flow sets', () => {
    expect(
      computeAssetXirr([
        { date: day(0), amountEur: -100 },
        { date: day(365), amountEur: -50 },
      ]),
    ).toBeNull(); // all negative
    expect(computeAssetXirr([{ date: day(0), amountEur: -100 }])).toBeNull(); // < 2 flows
    expect(
      computeAssetXirr([
        { date: day(0), amountEur: -100 },
        { date: day(0), amountEur: 110 },
      ]),
    ).toBeNull(); // span < 1 day
  });

  // Case 19
  it('solves a nasty multi-sign sequence via the bisection fallback', () => {
    const flows: XirrFlow[] = [
      { date: day(0), amountEur: -1000 },
      { date: day(120), amountEur: 400 },
      { date: day(240), amountEur: -300 },
      { date: day(365), amountEur: 500 },
      { date: day(600), amountEur: -200 },
      { date: day(900), amountEur: 900 },
    ];

    const rate = computeAssetXirr(flows);

    expect(rate).not.toBeNull();
    expect(Number.isFinite(rate as number)).toBe(true);
    // Behaviour that matters: the returned rate is a genuine root (NPV ≈ 0), whichever solver path ran.
    expect(localNpv(flows, rate as number)).toBeCloseTo(0, 4);
  });
});

// ===========================================================================
// Total return / invested capital (cases 20-23)
// ===========================================================================

describe('computeAssetTotalReturn — per-asset total return', () => {
  // Case 20
  it('sums realized, unrealized and dividends for an open position and divides by invested', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ type: 'sell', date: day(5), quantity: 4, pricePerUnit: 150 }),
    ]);
    const result = computeAssetTotalReturn(state, 900, 50); // 6 units mark-to-market at 150, 50 dividends

    expect(result.realizedPnlEur).toBeCloseTo(200, 6); // 4·(150 − 100)
    expect(result.unrealizedPnlEur).toBeCloseTo(300, 6); // 900 − 600 cost basis
    expect(result.dividendsNetEur).toBe(50);
    expect(result.totalReturnEur).toBeCloseTo(550, 6);
    expect(result.investedEur).toBeCloseTo(1000, 6);
    expect(result.totalReturnPct).toBeCloseTo(0.55, 6);
    expect(result.isClosed).toBe(false);
  });

  // Case 21
  it('reports zero unrealized and isClosed for a closed position, still computing the pct', () => {
    const state = replayTransactions([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ type: 'sell', date: day(5), quantity: 10, pricePerUnit: 130 }),
    ]);
    const result = computeAssetTotalReturn(state, 0, 20);

    expect(result.unrealizedPnlEur).toBe(0);
    expect(result.isClosed).toBe(true);
    expect(result.realizedPnlEur).toBeCloseTo(300, 6); // 10·(130 − 100)
    expect(result.totalReturnEur).toBeCloseTo(320, 6); // 300 + 0 + 20
    expect(result.totalReturnPct).toBeCloseTo(0.32, 6); // 320 / 1000
  });

  // Case 22
  it('returns a null pct for an empty ledger (invested 0)', () => {
    const state = replayTransactions([]);
    const result = computeAssetTotalReturn(state, 0, 0);

    expect(result.investedEur).toBe(0);
    expect(result.totalReturnPct).toBeNull();
    expect(result.isClosed).toBe(false);
  });
});

describe('computeInvestedCapital — net capital in a window', () => {
  // Case 23
  it('counts inclusive window edges and the baseline, and nets sells out', () => {
    const transactions = [
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 20, isBaseline: true }),
      tx({ type: 'buy', date: day(10), quantity: 5, pricePerUnit: 30, fees: 4 }),
      tx({ type: 'sell', date: day(20), quantity: 3, pricePerUnit: 40, fees: 2 }),
      tx({ type: 'buy', date: day(40), quantity: 2, pricePerUnit: 50 }),
    ];

    // Window [day10, day20] — both edges land exactly on a transaction and must be included;
    // the day0 baseline and the day40 buy fall outside.
    const windowed = computeInvestedCapital(transactions, day(10), day(20));
    expect(windowed.investedEur).toBeCloseTo(154, 6); // 5·30 + 4
    expect(windowed.divestedEur).toBeCloseTo(118, 6); // 3·40 − 2
    expect(windowed.netInvestedEur).toBeCloseTo(36, 6);

    // Full window: the baseline counts as a buy.
    const full = computeInvestedCapital(transactions, day(0), day(50));
    expect(full.investedEur).toBeCloseTo(454, 6); // 200 baseline + 154 + 100
    expect(full.divestedEur).toBeCloseTo(118, 6);
    expect(full.netInvestedEur).toBeCloseTo(336, 6);
  });
});

// ===========================================================================
// Per-transaction effects (replayTransactionsWithEffects)
// ===========================================================================

describe('replayTransactionsWithEffects — per-transaction P&L, sold cost basis and PMC-at-trade', () => {
  it('sums the per-transaction realized effects to the same total as state.realizedPnlEur', () => {
    const transactions = [
      tx({ type: 'buy', date: day(0), quantity: 50, pricePerUnit: 20, isBaseline: true }),
      tx({ type: 'buy', date: day(5), quantity: 10, pricePerUnit: 30 }),
      tx({ type: 'sell', date: day(10), quantity: 20, pricePerUnit: 40, fees: 3 }),
      tx({ type: 'adjustment', date: day(15), quantity: 50, pricePerUnit: 25 }),
      tx({ type: 'sell', date: day(20), quantity: 15, pricePerUnit: 35, fees: 1 }),
    ];

    const { state, effects } = replayTransactionsWithEffects(transactions);
    const sumOfEffects = effects.reduce((sum, e) => sum + (e.realizedPnlEur ?? 0), 0);

    expect(sumOfEffects).toBeCloseTo(state.realizedPnlEur, 6);
    // Same replay, wrapper agrees with the state half of the pair.
    expect(replayTransactions(transactions)).toEqual(state);
  });

  it('reports a partial sell effect matching the existing 4·(150−100)−2 fee fixture', () => {
    const { effects } = replayTransactionsWithEffects([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100, id: 'buy1' }),
      tx({ type: 'sell', date: day(5), quantity: 4, pricePerUnit: 150, fees: 2, id: 'sell1' }),
    ]);

    const sellEffect = effects.find((e) => e.transactionId === 'sell1');
    expect(sellEffect?.realizedPnlEur).toBeCloseTo(198, 6); // 4·(150 − 100) − 2
    expect(sellEffect?.soldCostBasisEur).toBeCloseTo(400, 6); // 4 × PMC 100
    expect(sellEffect?.averageCostEurAtTrade).toBeCloseTo(100, 6);

    const buyEffect = effects.find((e) => e.transactionId === 'buy1');
    expect(buyEffect?.realizedPnlEur).toBeUndefined();
    expect(buyEffect?.soldCostBasisEur).toBeUndefined();
    expect(buyEffect?.averageCostEurAtTrade).toBeUndefined();
  });

  it('closes the position on a full sell with an EPSILON-consistent sold cost basis, and prices a rebuy sell independently', () => {
    const { effects } = replayTransactionsWithEffects([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100, id: 'buy1' }),
      tx({ type: 'sell', date: day(5), quantity: 10, pricePerUnit: 120, id: 'sell1' }), // full close
      tx({ type: 'buy', date: day(10), quantity: 5, pricePerUnit: 200, id: 'buy2' }),
      tx({ type: 'sell', date: day(15), quantity: 5, pricePerUnit: 250, id: 'sell2' }), // second sell on the rebuy
    ]);

    const firstSell = effects.find((e) => e.transactionId === 'sell1');
    expect(firstSell?.soldCostBasisEur).toBeCloseTo(1000, 6); // 10 × PMC 100
    expect(firstSell?.realizedPnlEur).toBeCloseTo(200, 6); // 10·(120 − 100)
    // Denominator well above EPSILON: the % is well-defined (guarded in the UI, not the engine).
    expect(firstSell!.soldCostBasisEur!).toBeGreaterThan(EPSILON);

    const secondSell = effects.find((e) => e.transactionId === 'sell2');
    expect(secondSell?.averageCostEurAtTrade).toBeCloseTo(200, 6); // PMC restarted at the rebuy
    expect(secondSell?.soldCostBasisEur).toBeCloseTo(1000, 6); // 5 × PMC 200
    expect(secondSell?.realizedPnlEur).toBeCloseTo(250, 6); // 5·(250 − 200)
  });

  it('emits an effect with no populated fields for the baseline and for an adjustment', () => {
    const { effects } = replayTransactionsWithEffects([
      tx({ type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100, isBaseline: true, id: 'baseline' }),
      tx({ type: 'adjustment', date: day(5), quantity: 20, pricePerUnit: 50, id: 'adj1' }),
    ]);

    expect(effects).toHaveLength(2);
    for (const effect of effects) {
      expect(effect.realizedPnlEur).toBeUndefined();
      expect(effect.soldCostBasisEur).toBeUndefined();
      expect(effect.averageCostEurAtTrade).toBeUndefined();
    }
  });
});

// ===========================================================================
// aggregateRealizedByYear (moved from RealizedGainsSection.tsx)
// ===========================================================================

describe('aggregateRealizedByYear — realized P&L by fiscal year, across assets', () => {
  it('groups by assetId before folding, then sums per fiscal year across assets', () => {
    const transactions = [
      // Asset a1: bought at 100, sold half at 150 in 2024.
      tx({ assetId: 'a1', type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ assetId: 'a1', type: 'sell', date: day(5), quantity: 5, pricePerUnit: 150 }),
      // Asset a2: bought at 50, sold all at 40 (a loss) in the same fiscal year.
      tx({ assetId: 'a2', type: 'buy', date: day(0), quantity: 20, pricePerUnit: 50 }),
      tx({ assetId: 'a2', type: 'sell', date: day(5), quantity: 20, pricePerUnit: 40 }),
    ];

    const result = aggregateRealizedByYear(transactions);

    const year = getYearOf(day(5));
    expect(result.skippedAssets).toBe(0);
    // a1: 5·(150−100) = 250; a2: 20·(40−50) = −200. Summed across assets: 50.
    expect(result.byYear[year]).toBeCloseTo(50, 6);
  });

  it('excludes an asset whose replay throws and reports it via skippedAssets, without corrupting the rest', () => {
    const transactions = [
      // Asset a1: valid, realizes 100.
      tx({ assetId: 'a1', type: 'buy', date: day(0), quantity: 10, pricePerUnit: 100 }),
      tx({ assetId: 'a1', type: 'sell', date: day(5), quantity: 10, pricePerUnit: 110 }),
      // Asset a2: invalid — sells more than it holds.
      tx({ assetId: 'a2', type: 'buy', date: day(0), quantity: 5, pricePerUnit: 50 }),
      tx({ assetId: 'a2', type: 'sell', date: day(5), quantity: 999, pricePerUnit: 60 }),
    ];

    const result = aggregateRealizedByYear(transactions);

    expect(result.skippedAssets).toBe(1);
    const year = getYearOf(day(5));
    expect(result.byYear[year]).toBeCloseTo(100, 6); // only a1's realized P&L
  });

  it('buckets realized P&L by Italy fiscal year across a New-Year midnight boundary', () => {
    const transactions = [
      tx({ type: 'buy', date: new Date('2025-06-01T00:00:00Z'), quantity: 100, pricePerUnit: 10 }),
      // 23:30 Rome on 31/12/2025 → 2025
      tx({ type: 'sell', date: new Date('2025-12-31T22:30:00Z'), quantity: 10, pricePerUnit: 12 }),
      // 00:30 Rome on 01/01/2026 → 2026
      tx({ type: 'sell', date: new Date('2025-12-31T23:30:00Z'), quantity: 10, pricePerUnit: 15 }),
    ];

    const result = aggregateRealizedByYear(transactions);

    expect(result.skippedAssets).toBe(0);
    expect(result.byYear[2025]).toBeCloseTo(20, 6); // 10·(12 − 10)
    expect(result.byYear[2026]).toBeCloseTo(50, 6); // 10·(15 − 10)
  });
});

/** Italy fiscal year of a date, matching the engine's own bucketing (UTC+1 in winter, no DST). */
function getYearOf(date: Date): number {
  return date.getUTCFullYear();
}
