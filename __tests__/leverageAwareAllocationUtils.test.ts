/**
 * Tests for the instrument-aware planner in lib/utils/leverageAwareAllocationUtils.ts
 * (spec docs/specs/3-leveraged-etf-allocation/02-exposure-and-planning-engine.md §3 + §5).
 *
 * The headline is the D5 BUG FIX (§3b): the per-class target must be measured against the
 * post-trade MARKET total, not the current NOTIONAL total, so it stays correct when the current
 * leverage differs from the target leverage. Also covers the budget invariants (Ribilancia
 * net-zero, Versa buys only, Preleva sells only), candidate construction, multi-instrument
 * convergence, and that the leverage tie-breaker actually moves the result.
 *
 * expandAssetExposure pulls in the client Firebase SDK at module load — mock it out.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset } from '@/types/assets';

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
  buildInstrumentExposures,
  planInstrumentRebalance,
  planInstrumentContribution,
  planInstrumentWithdrawal,
} from '@/lib/utils/leverageAwareAllocationUtils';
import { expandAssetExposure } from '@/lib/utils/assetExposureUtils';

let seq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  seq += 1;
  return {
    id: `a${seq}`,
    userId: 'u1',
    ticker: `TCK${seq}`,
    name: `Asset ${seq}`,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1000, // market = quantity × currentPrice (EUR)
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

/** Current market/notional snapshot of an investable set, the way the page feeds the planner. */
function snapshotOf(assets: Asset[]) {
  const notionalByAssetClass: Record<string, number> = {};
  let notionalTotal = 0;
  let marketTotal = 0;
  for (const asset of assets) {
    for (const c of expandAssetExposure(asset)) {
      notionalByAssetClass[c.assetClass] = (notionalByAssetClass[c.assetClass] ?? 0) + c.notionalValue;
      notionalTotal += c.notionalValue;
      marketTotal += c.marketValue;
    }
  }
  return { notionalByAssetClass, notionalTotal, marketTotal };
}

const sumAmounts = (trades: { amount: number }[]) => trades.reduce((s, t) => s + t.amount, 0);

describe('buildInstrumentExposures', () => {
  it('builds one candidate per positive-value asset and skips zero-value holdings', () => {
    const a = makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000, leverageRatio: 2 });
    const b = makeAsset({ assetClass: 'bonds', quantity: 1, currentPrice: 1000 });
    const sold = makeAsset({ assetClass: 'equity', quantity: 0, currentPrice: 1000 }); // market 0

    const instruments = buildInstrumentExposures([a, b, sold]);

    expect(instruments.map((i) => i.assetId)).toEqual([a.id, b.id]);
    // 2x equity ETF: €1 of market → €2 of equity notional.
    expect(instruments[0].exposurePerEuro.equity).toBeCloseTo(2, 6);
    expect(instruments[1].exposurePerEuro.bonds).toBeCloseTo(1, 6);
    expect(instruments[0].marketValue).toBe(1000);
  });
});

describe('D5 bug fix — class target on the post-trade MARKET base (§3b)', () => {
  it('drives a class to targetFraction × marketAfterTrade, NOT × currentNotionalTotal', () => {
    // Two equity instruments; current leverage 1.5 ≠ target leverage 1.2, so the two bases diverge.
    const p = makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 500, leverageRatio: 2 }); // market 500, notional 1000
    const q = makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 500 });                    // market 500, notional 500
    const candidates = [p, q];
    const { notionalByAssetClass, notionalTotal, marketTotal } = snapshotOf(candidates);

    expect(marketTotal).toBe(1000);
    expect(notionalTotal).toBe(1500); // current leverage 1.5

    // target equity 120% → targetFraction 1.2, target leverage 1.2.
    const plan = planInstrumentRebalance(
      candidates,
      notionalByAssetClass,
      notionalTotal,
      marketTotal,
      { equity: 120 },
      1.2
    );

    // Rebalance keeps the market total (budget 0) → marketAfterTrade = 1000.
    // CORRECT (fixed) target notional = 1.2 × 1000 = 1200.
    // BUGGY (old) target notional would be 1.2 × currentNotionalTotal(1500) = 1800.
    const CORRECT = 1.2 * marketTotal; // 1200
    const BUGGY = 1.2 * notionalTotal; // 1800
    expect(CORRECT).not.toBeCloseTo(BUGGY, 0);

    expect(plan.resultingMarketTotal).toBeCloseTo(1000, 3);
    expect(plan.resultingNotionalByAssetClass.equity).toBeCloseTo(CORRECT, 0);
    expect(plan.resultingLeverageRatio).toBeCloseTo(1.2, 2);
    // net-zero cash: the trades cancel out.
    expect(sumAmounts(plan.trades)).toBeCloseTo(0, 3);
  });
});

describe('budget invariants', () => {
  const equity = makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000 }); // notional 1000
  const bonds = makeAsset({ assetClass: 'bonds', quantity: 1, currentPrice: 1000 });   // notional 1000
  const candidates = [equity, bonds];
  const snap = snapshotOf(candidates);
  // Deliberately off target so the planner actually trades.
  const targetsByClass = { equity: 70, bonds: 30 };

  it('Ribilancia is net-zero (Σ trades ≈ 0)', () => {
    const plan = planInstrumentRebalance(
      candidates, snap.notionalByAssetClass, snap.notionalTotal, snap.marketTotal, targetsByClass, 1
    );
    expect(sumAmounts(plan.trades)).toBeCloseTo(0, 3);
    expect(plan.resultingMarketTotal).toBeCloseTo(snap.marketTotal, 3);
  });

  it('Versa spends exactly the amount and never sells', () => {
    const plan = planInstrumentContribution(
      candidates, snap.notionalByAssetClass, snap.notionalTotal, snap.marketTotal, targetsByClass, 1000, 1
    );
    expect(sumAmounts(plan.trades)).toBeCloseTo(1000, 2);
    expect(plan.trades.every((t) => t.amount >= -1e-6)).toBe(true);
    expect(plan.resultingMarketTotal).toBeCloseTo(snap.marketTotal + 1000, 2);
  });

  it('Preleva raises exactly the amount and never buys', () => {
    const plan = planInstrumentWithdrawal(
      candidates, snap.notionalByAssetClass, snap.notionalTotal, snap.marketTotal, targetsByClass, 500, 1
    );
    expect(sumAmounts(plan.trades)).toBeCloseTo(-500, 2);
    expect(plan.trades.every((t) => t.amount <= 1e-6)).toBe(true);
    expect(plan.resultingMarketTotal).toBeCloseTo(snap.marketTotal - 500, 2);
  });
});

describe('multi-instrument convergence', () => {
  it('closes the class gaps across three instruments (Versa)', () => {
    const a = makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000 });               // eq 1000
    const b = makeAsset({ assetClass: 'bonds', quantity: 1, currentPrice: 1000 });                // bd 1000
    const c = makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000, leverageRatio: 2 }); // eq notional 2000
    const candidates = [a, b, c];
    const snap = snapshotOf(candidates); // market 3000, eq notional 3000, bd 1000, total 4000

    const plan = planInstrumentContribution(
      candidates, snap.notionalByAssetClass, snap.notionalTotal, snap.marketTotal, { equity: 100, bonds: 60 }, 1000, 1.6
    );

    // marketAfterTrade = 4000 → targets: equity 4000, bonds 2400 (leverage 1.6).
    // The solver should move toward those; assert it gets meaningfully closer than the start.
    expect(sumAmounts(plan.trades)).toBeCloseTo(1000, 1);
    expect(plan.resultingNotionalByAssetClass.bonds).toBeGreaterThan(1000); // bonds were far under target
    expect(plan.resultingLeverageRatio).toBeGreaterThan(1); // moved above the naive 1x fill
  });
});

describe('leverage tie-breaker moves the result', () => {
  it('a higher target leverage yields a higher resulting leverage, all else equal', () => {
    // Over-complete instrument set (4 instruments, 2 classes) leaves the class targets a null
    // space; the euro-scaled leverage term selects within it.
    const a = makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000 });                 // eq 1x
    const b = makeAsset({ assetClass: 'equity', quantity: 1, currentPrice: 1000, leverageRatio: 3 }); // eq 3x
    const c = makeAsset({ assetClass: 'bonds', quantity: 1, currentPrice: 1000 });                  // bd 1x
    const d = makeAsset({ assetClass: 'bonds', quantity: 1, currentPrice: 1000, leverageRatio: 3 }); // bd 3x
    const candidates = [a, b, c, d];
    const snap = snapshotOf(candidates);
    const targetsByClass = { equity: 100, bonds: 60 };

    const low = planInstrumentContribution(
      candidates, snap.notionalByAssetClass, snap.notionalTotal, snap.marketTotal, targetsByClass, 1000, 1.2
    );
    const high = planInstrumentContribution(
      candidates, snap.notionalByAssetClass, snap.notionalTotal, snap.marketTotal, targetsByClass, 1000, 2.5
    );

    expect(high.resultingLeverageRatio).toBeGreaterThan(low.resultingLeverageRatio);
  });
});
