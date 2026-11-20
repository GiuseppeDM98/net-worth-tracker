/**
 * Tests for the pure PAC engine (lib/utils/accumulationPlanUtils.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset } from '@/types/assets';
import { unitPriceEur } from '@/lib/utils/costBasisEur';
import {
  exposurePerEuro,
  resolvePositionStates,
  computeUsableLiquidity,
  computeTotalPurchases,
  scheduleInstallments,
  recalibrateInstallment,
  shouldProposeRecalibration,
  projectPlanOutcome,
  toMonthKey,
  addMonths,
  monthIndexOf,
  weightsToSeedPositions,
  seedDisposalsFromSale,
  selectClassStripRows,
  type ClassTrajectoryPoint,
  type PlanDeps,
  summarizeReserve,
  isPlanBuyable,
  listAddableAssets,
  buildRegisteredLinePatch,
  proceedsOfDisposal,
  resolvePlanReserveEur,
  resolvePlanReserve,
  resolveAccountReserveEur,
  planCashFundSaleEur,
  isPlanSourceAccount,
} from '@/lib/utils/accumulationPlanUtils';
import { createSeededRandom } from '@/lib/utils/seededRandom';
import { resolveInvestmentAccountId } from '@/lib/utils/accumulationPlanUtils';
import type { AccumulationPlan, PlanPosition, PlanLiquidity, PlanDisposal } from '@/types/accumulationPlan';

let seq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  seq += 1;
  return {
    id: `a${seq}`,
    userId: 'u1',
    ticker: 'X',
    name: 'X',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 0,
    currentPrice: 0,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const ETF_A = makeAsset({ id: 'etf-a', name: 'ETF-A', ticker: 'ETFA', quantity: 10, currentPrice: 100 });
const ETF_B = makeAsset({
  id: 'etf-b',
  name: 'ETF-B',
  ticker: 'ETFB',
  quantity: 20,
  currentPrice: 50,
  leverageRatio: 1.5,
  composition: [
    { assetClass: 'equity', percentage: 60 },
    { assetClass: 'bonds', percentage: 40 },
  ],
});
const ETF_C = makeAsset({ id: 'etf-c', name: 'ETF-C', ticker: 'ETFC', quantity: 2, currentPrice: 500, leverageRatio: 2 });
const CARRY_A = makeAsset({
  id: 'carry-a',
  name: 'CARRY-A',
  ticker: 'CARRYA',
  quantity: 1,
  currentPrice: 150,
  assetClass: 'carry',
});
const CASH1 = makeAsset({ id: 'cash1', name: 'Conto 1', assetClass: 'cash', quantity: 1, currentPrice: 20000 });
const CASH2 = makeAsset({ id: 'cash2', name: 'Conto 2', assetClass: 'cash', quantity: 1, currentPrice: 5000 });

const deps: PlanDeps = {
  valueOf: (a: Asset) => a.quantity * unitPriceEur(a),
  priceOf: (a: Asset) => unitPriceEur(a),
};

function byId(...assets: Asset[]): Map<string, Asset> {
  return new Map(assets.map((a) => [a.id, a]));
}

describe('toMonthKey / addMonths / monthIndexOf', () => {
  it('formats a date as YYYY-MM and rolls months over year boundaries', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-05', 0)).toBe('2026-05');
  });

  it('indexes a month 1..N inside the plan, 0 before, N+1 after', () => {
    const plan = { startMonth: '2026-10', months: 12 };
    expect(monthIndexOf(plan, '2026-10')).toBe(1);
    expect(monthIndexOf(plan, '2027-09')).toBe(12);
    expect(monthIndexOf(plan, '2026-09')).toBe(0);
    expect(monthIndexOf(plan, '2027-10')).toBe(13);
  });

  it('toMonthKey reads the Italy month/year', () => {
    expect(toMonthKey(new Date('2026-01-15T12:00:00Z'))).toBe('2026-01');
  });
});

describe('exposurePerEuro', () => {
  it('single-class asset: leverage on its own class', () => {
    expect(exposurePerEuro(ETF_A)).toEqual({ equity: 1 });
    expect(exposurePerEuro(ETF_C)).toEqual({ equity: 2 });
  });

  it('composite asset: leverage applies per leg', () => {
    const result = exposurePerEuro(ETF_B);
    expect(result.equity).toBeCloseTo(0.9, 9);
    expect(result.bonds).toBeCloseTo(0.6, 9);
  });

  it('agrees with expandAssetExposure per euro of market value', async () => {
    vi.doMock('@/lib/firebase/config', () => ({ db: {} }));
    const { expandAssetExposure } = await import('@/lib/utils/assetExposureUtils');
    for (const asset of [ETF_A, ETF_C, ETF_B]) {
      const perEuro = exposurePerEuro(asset);
      const value = deps.valueOf(asset);
      const components = expandAssetExposure(asset);
      for (const [assetClass, coeff] of Object.entries(perEuro)) {
        const expected = components
          .filter((c) => c.assetClass === assetClass)
          .reduce((sum, c) => sum + c.notionalValue, 0);
        expect(coeff! * value).toBeCloseTo(expected, 6);
      }
    }
  });
});

describe('computeUsableLiquidity', () => {
  const liquidity: PlanLiquidity = {
    sourceCashAssetIds: ['cash1', 'cash2'],
    reserveEur: 10000,
    monthlyInflowEur: 500,
  };

  it('floors availableNowEur at 0 when the reserve exceeds cash, and flags belowReserve', () => {
    const bigReserve: PlanLiquidity = { ...liquidity, reserveEur: 100000 };
    const result = computeUsableLiquidity(bigReserve, byId(CASH1, CASH2), [], 12, deps);
    expect(result.sourceCashEur).toBe(25000);
    expect(result.availableNowEur).toBe(0);
    expect(result.belowReserve).toBe(true);
  });

  it('excludes executed and skipped disposals, sums E × monthsRemaining', () => {
    const disposals: PlanDisposal[] = [
      { assetId: 'etf-d', estimatedProceedsEur: 100, status: 'planned' },
      { assetId: 'etf-e', estimatedProceedsEur: 1000, status: 'executed' },
      { assetId: 'etf-f', estimatedProceedsEur: 50, status: 'skipped' },
    ];
    const result = computeUsableLiquidity(liquidity, byId(CASH1, CASH2), disposals, 12, deps);
    expect(result.sourceCashEur).toBe(25000);
    expect(result.availableNowEur).toBe(15000);
    expect(result.disposalProceedsEur).toBe(100);
    expect(result.inflowTotalEur).toBe(6000);
    expect(result.L0).toBe(15100);
    expect(result.L).toBe(21100);
    expect(result.belowReserve).toBe(false);
  });
});

describe('computeTotalPurchases', () => {
  it('splits L toward target, Σ result === L', () => {
    const states = resolvePositionStates(
      [
        { id: 'p1', label: 'ETF-A', targetPercentage: 60, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
        { id: 'p2', label: 'ETF-B', targetPercentage: 40, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
      ],
      byId(ETF_A, ETF_B),
      deps
    );
    const totals = computeTotalPurchases(states, 10000);
    expect(Object.values(totals).reduce((s, v) => s + v, 0)).toBeCloseTo(10000, 6);
  });

  it('a position already above target receives 0 while L is below total deficit', () => {
    const overweight = makeAsset({ id: 'over', name: 'Over', quantity: 100, currentPrice: 100 });
    const underweight = makeAsset({ id: 'under', name: 'Under', quantity: 1, currentPrice: 100 });
    const states = resolvePositionStates(
      [
        { id: 'p1', label: 'Over', targetPercentage: 10, memberAssetIds: ['over'], buyAssetId: 'over' },
        { id: 'p2', label: 'Under', targetPercentage: 90, memberAssetIds: ['under'], buyAssetId: 'under' },
      ],
      byId(overweight, underweight),
      deps
    );
    const totals = computeTotalPurchases(states, 500);
    expect(totals.p1).toBe(0);
    expect(totals.p2).toBeGreaterThan(0);
  });

  it('an unpriced position always receives 0', () => {
    const noPrice = makeAsset({ id: 'np', name: 'NoPrice', quantity: 0, currentPrice: 0 });
    const states = resolvePositionStates(
      [{ id: 'p1', label: 'NoPrice', targetPercentage: 100, memberAssetIds: ['np'], buyAssetId: 'np' }],
      byId(noPrice),
      deps
    );
    expect(states[0].unpriced).toBe(true);
    const totals = computeTotalPurchases(states, 1000);
    expect(totals.p1).toBe(0);
  });

  it('L = 0 → every position receives 0', () => {
    const states = resolvePositionStates(
      [{ id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      byId(ETF_A),
      deps
    );
    const totals = computeTotalPurchases(states, 0);
    expect(totals.p1).toBe(0);
  });
});

describe('scheduleInstallments', () => {
  it('only integer quantities, never on an asset other than buyAssetId', () => {
    const states = resolvePositionStates(
      [
        { id: 'p1', label: 'ETF-A', targetPercentage: 50, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
        { id: 'p2', label: 'CARRY-A', targetPercentage: 50, memberAssetIds: ['carry-a'], buyAssetId: 'carry-a' },
      ],
      byId(ETF_A, CARRY_A),
      deps
    );
    const totals = computeTotalPurchases(states, 12000);
    const { installments, residualEur } = scheduleInstallments(totals, states, 12, '2026-10');

    let spentP1 = 0;
    let spentP2 = 0;
    for (const installment of installments) {
      for (const line of installment.lines) {
        expect(Number.isInteger(line.plannedQuantity)).toBe(true);
        expect(line.plannedQuantity).toBeGreaterThanOrEqual(0);
        expect(line.assetId).toBe(line.positionId === 'p1' ? 'etf-a' : 'carry-a');
        if (line.positionId === 'p1') spentP1 += line.plannedAmountEur;
        else spentP2 += line.plannedAmountEur;
      }
    }
    expect(spentP1 + spentP2 + residualEur).toBeCloseTo(6000 + 6000, 4);
  });

  it('a carry that never buys a full share (CARRY-A 150€, monthly quota 110€) unlocks it in alternating months', () => {
    const carryState = resolvePositionStates(
      [{ id: 'p1', label: 'CARRY-A', targetPercentage: 100, memberAssetIds: ['carry-a'], buyAssetId: 'carry-a' }],
      byId(CARRY_A),
      deps
    );
    // Force a monthly share of 110€ over 2 months (total 220€, price 150€): month 1 carries, month 2 (+
    // the closing sweep) must buy the share.
    const { installments, residualEur } = scheduleInstallments({ p1: 220 }, carryState, 2, '2026-10');
    const totalQuantity = installments.reduce(
      (sum, i) => sum + i.lines.reduce((s, l) => s + l.plannedQuantity, 0),
      0
    );
    expect(totalQuantity).toBe(1);
    expect(residualEur).toBeCloseTo(220 - 150, 4);
  });

  it('a price above the whole position total leaves no line and everything falls to the residual', () => {
    const expensive = makeAsset({ id: 'exp', name: 'Expensive', quantity: 0, currentPrice: 100000 });
    const state = resolvePositionStates(
      [{ id: 'p1', label: 'Expensive', targetPercentage: 100, memberAssetIds: ['exp'], buyAssetId: 'exp' }],
      byId(expensive),
      deps
    );
    const { installments, residualEur } = scheduleInstallments({ p1: 5000 }, state, 6, '2026-10');
    expect(installments.every((i) => i.lines.length === 0)).toBe(true);
    expect(residualEur).toBeCloseTo(5000, 4);
  });

  it('cumulative spend at month m never exceeds m × (total/N), except month N where the ceiling is the total', () => {
    const state = resolvePositionStates(
      [{ id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      byId(ETF_A),
      deps
    );
    const total = 5000;
    const N = 6;
    const { installments } = scheduleInstallments({ p1: total }, state, N, '2026-10');
    let cumulative = 0;
    installments.forEach((installment, i) => {
      cumulative += installment.lines.reduce((s, l) => s + l.plannedAmountEur, 0);
      const limit = i + 1 === N ? total : (i + 1) * (total / N);
      expect(cumulative).toBeLessThanOrEqual(limit + 1e-6);
    });
  });

  it('N = 1 schedules and sweeps in the same single month', () => {
    const state = resolvePositionStates(
      [{ id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      byId(ETF_A),
      deps
    );
    const { installments, residualEur } = scheduleInstallments({ p1: 1000 }, state, 1, '2026-10');
    expect(installments).toHaveLength(1);
    const spend = installments[0].lines.reduce((s, l) => s + l.plannedAmountEur, 0);
    expect(spend + residualEur).toBeCloseTo(1000, 4);
  });
});

describe('recalibrateInstallment', () => {
  function buildPlan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
    const positions: PlanPosition[] = [
      { id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
    ];
    return {
      id: 'plan1',
      userId: 'u1',
      name: 'Piano',
      status: 'active',
      startMonth: '2026-10',
      months: 3,
      liquidity: { sourceCashAssetIds: ['cash1'], reserveEur: 0, monthlyInflowEur: 0 },
      positions,
      disposals: [],
      installments: [
        { index: 1, month: '2026-10', lines: [{ positionId: 'p1', assetId: 'etf-a', plannedQuantity: 3, priceEurAtPlan: 100, plannedAmountEur: 300, status: 'executed', executedQuantity: 2, executedAmountEur: 200 }], carryInEur: { p1: 0 } },
      ],
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...overrides,
    };
  }

  it('reflects an installment executed with a different quantity than planned', () => {
    const plan = buildPlan();
    const cash = makeAsset({ id: 'cash1', name: 'Conto', assetClass: 'cash', quantity: 1, currentPrice: 10000 });
    const result = recalibrateInstallment(plan, 1, byId(ETF_A, cash), deps);
    const line = result.lines.find((l) => l.positionId === 'p1')!;
    expect(line.plannedQuantity).toBe(3);
  });

  it('a reduced cash inflow shrinks the installment and leaves the reserve untouched', () => {
    const plan = buildPlan({ liquidity: { sourceCashAssetIds: ['cash1'], reserveEur: 900, monthlyInflowEur: 0 } });
    const smallCash = makeAsset({ id: 'cash1', name: 'Conto', assetClass: 'cash', quantity: 1, currentPrice: 1000 });
    const result = recalibrateInstallment(plan, 1, byId(ETF_A, smallCash), deps);
    expect(result.liquidity.availableNowEur).toBe(100);
    expect(result.liquidity.belowReserve).toBe(false);
    const line = result.lines.find((l) => l.positionId === 'p1')!;
    expect(line.suggestedAmountEur).toBeLessThanOrEqual(100 + 1e-6);
  });
});

describe('projectPlanOutcome', () => {
  it('computes final weights, the max drift and the implicit leverage across ETF-B and ETF-C', () => {
    const positions: PlanPosition[] = [
      { id: 'p1', label: 'ETF-B', targetPercentage: 60, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
      { id: 'p2', label: 'ETF-C', targetPercentage: 40, memberAssetIds: ['etf-c'], buyAssetId: 'etf-c' },
    ];
    const assets = byId(ETF_B, ETF_C);
    const states = resolvePositionStates(positions, assets, deps);
    const totals = computeTotalPurchases(states, 5000);
    const { installments, residualEur } = scheduleInstallments(totals, states, 4, '2026-10');
    const outcome = projectPlanOutcome(states, installments, residualEur, assets, positions, deps);

    expect(outcome.positions).toHaveLength(2);
    const totalWeight = outcome.positions.reduce((s, p) => s + p.finalWeightPct, 0);
    expect(totalWeight).toBeCloseTo(100, 4);
    expect(outcome.maxDriftPositionId).not.toBeNull();
    // ETF-B (leverage 1.5) and ETF-C (leverage 2) both expose more notional than market → leverage > 1.
    expect(outcome.leverageRatio).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// weightsToSeedPositions (the optimizer's proposed weights → a fresh PAC draft's positions)
// ---------------------------------------------------------------------------

describe('weightsToSeedPositions', () => {
  it('converts each proposed weight into a single-instrument position with an injected id', () => {
    let n = 0;
    const generateId = () => `id-${++n}`;
    const weights = [
      { key: 'a1', label: 'ETF-A', proposedPct: 60 },
      { key: 'a2', label: 'BOND-A', proposedPct: 40 },
    ];
    expect(weightsToSeedPositions(weights, generateId)).toEqual([
      { id: 'id-1', label: 'ETF-A', targetPercentage: 60, memberAssetIds: ['a1'], buyAssetId: 'a1' },
      { id: 'id-2', label: 'BOND-A', targetPercentage: 40, memberAssetIds: ['a2'], buyAssetId: 'a2' },
    ]);
  });

  it('defaults to crypto.randomUUID when no generator is injected', () => {
    const positions = weightsToSeedPositions([{ key: 'a1', label: 'ETF-A', proposedPct: 100 }]);
    expect(positions[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

// ---------------------------------------------------------------------------
// seedDisposalsFromSale («Con vendite mirate»'s sales → the fresh draft's disposals)
// ---------------------------------------------------------------------------

describe('seedDisposalsFromSale', () => {
  const kept = makeAsset({ id: 'kept', quantity: 10, currentPrice: 100 });
  const dropped = makeAsset({ id: 'dropped', quantity: 5, currentPrice: 200 });
  const odd = makeAsset({ id: 'odd', quantity: 10, currentPrice: 10.004 });
  const byId = new Map([kept, dropped, odd].map((a) => [a.id, a]));
  const deps: PlanDeps = { valueOf: (a) => a.quantity * a.currentPrice + 0.004, priceOf: unitPriceEur };

  // The second argument names what the proposal brings to 0%: only those are sold whole (collaudo 2026-11-18).
  it('should sell whole shares of an instrument the proposal keeps above zero, never its last one', () => {
    expect(seedDisposalsFromSale([{ key: 'kept', soldEur: 450 }], new Set(), byId, deps)).toEqual([
      { assetId: 'kept', quantity: 4, estimatedProceedsEur: 400, status: 'planned' },
    ]);
    expect(seedDisposalsFromSale([{ key: 'kept', soldEur: 1000 }], new Set(), byId, deps)[0].quantity).toBe(9);
    expect(seedDisposalsFromSale([{ key: 'kept', soldEur: 50 }], new Set(), byId, deps)).toEqual([]);
  });

  it('should sell the whole position of an instrument the proposal brings to 0%', () => {
    expect(seedDisposalsFromSale([{ key: 'dropped', soldEur: 1000 }], new Set(['dropped']), byId, deps)).toEqual([
      { assetId: 'dropped', estimatedProceedsEur: 1000, status: 'planned' },
    ]);
  });

  it('should trim, never empty, an instrument kept above zero even when no plan buys it', () => {
    // At the tour a money-market fund only trimmed went whole: being out of the model is not being sold out.
    expect(seedDisposalsFromSale([{ key: 'dropped', soldEur: 450 }], new Set(), byId, deps)).toEqual([
      { assetId: 'dropped', quantity: 2, estimatedProceedsEur: 400, status: 'planned' },
    ]);
  });

  it('should write every amount in cents', () => {
    const [disposal] = seedDisposalsFromSale([{ key: 'odd', soldEur: 30.02 }], new Set(), byId, deps);
    expect(disposal).toEqual({ assetId: 'odd', quantity: 3, estimatedProceedsEur: 30.01, status: 'planned' });
  });

  it('should skip a row that sells nothing or names no asset', () => {
    expect(seedDisposalsFromSale([{ key: 'kept', soldEur: 0 }, { key: 'missing', soldEur: 500 }], new Set(['missing']), byId, deps)).toEqual([]);
  });
});

describe('selectClassStripRows', () => {
  type ClassData = NonNullable<ClassTrajectoryPoint['byClass']['equity']>;
  const cls = (currentPct: number, targetPct: number, outOfBand = false): ClassData => ({
    currentPct,
    targetPct,
    driftPp: currentPct - targetPct,
    outOfBand,
  });
  const point = (index: number, month: ClassTrajectoryPoint['month'], byClass: ClassTrajectoryPoint['byClass']): ClassTrajectoryPoint => ({
    index,
    month,
    source: index <= 1 ? 'measured' : 'projected',
    byClass,
  });

  // An invented shape: bonds out of band today and back in December, three
  // classes the target document carries at 0% with nothing in them.
  const trajectory: ClassTrajectoryPoint[] = [
    point(0, 'baseline', { equity: cls(65, 70), bonds: cls(30, 25, true), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0.01, 0) }),
    point(1, '2026-09', { equity: cls(67, 70), bonds: cls(28, 25, true), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0.01, 0) }),
    point(2, '2026-10', { equity: cls(68, 70), bonds: cls(27, 25, true), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0, 0) }),
    point(3, '2026-11', { equity: cls(68, 70), bonds: cls(26, 25, true), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0, 0) }),
    point(4, '2026-12', { equity: cls(68, 70), bonds: cls(25.5, 25), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0, 0) }),
  ];

  it('drops a class with no share, no target and none at the end of the plan', () => {
    const rows = selectClassStripRows(trajectory, 1);

    expect(rows.map((row) => row.assetClass)).toEqual(['equity', 'bonds']);
  });

  it('keeps a class that is empty today but holds a target', () => {
    const withTarget = trajectory.map((p) => ({ ...p, byClass: { ...p.byClass, crypto: cls(0, 5, true) } }));

    const rows = selectClassStripRows(withTarget, 1);

    expect(rows.map((row) => row.assetClass)).toContain('crypto');
  });

  it('keeps a class the plan will fill even when it is empty today and has no target', () => {
    const filled = trajectory.map((p, i) => ({ ...p, byClass: { ...p.byClass, realestate: cls(i === 4 ? 2 : 0, 0) } }));

    const rows = selectClassStripRows(filled, 1);

    expect(rows.map((row) => row.assetClass)).toContain('realestate');
  });

  it('reads today at the index and the end of the plan at the last point', () => {
    const bonds = selectClassStripRows(trajectory, 1).find((row) => row.assetClass === 'bonds')!;

    expect(bonds).toMatchObject({ currentPct: 28, targetPct: 25, finalPct: 25.5, outOfBandNow: true });
    expect(bonds.currentDriftPp).toBeCloseTo(3);
    expect(bonds.finalDriftPp).toBeCloseTo(0.5);
  });

  it('names the first month AFTER today that the class is back in band, only when it is out now', () => {
    const rows = selectClassStripRows(trajectory, 1);

    expect(rows.find((row) => row.assetClass === 'bonds')?.reentryMonth).toBe('2026-12');
    expect(rows.find((row) => row.assetClass === 'equity')?.reentryMonth).toBeUndefined();
  });

  it('returns nothing when the index has no point', () => {
    expect(selectClassStripRows(trajectory, 9)).toEqual([]);
  });
});

describe('summarizeReserve', () => {
  const accountA = makeAsset({ id: 'accA', assetClass: 'cash', type: 'cash', quantity: 1, currentPrice: 5000 });
  const accountB = makeAsset({ id: 'accB', assetClass: 'cash', type: 'cash', quantity: 1, currentPrice: 40000 });

  it('counts only the source accounts, so 5.000 € against a 10.000 € reserve is below it', () => {
    const r = summarizeReserve({ sourceCashAssetIds: ['accA'], reserveEur: 10000, monthlyInflowEur: 0 }, byId(accountA, accountB), deps);
    expect(r.sourceCashEur).toBeCloseTo(5000, 2);
    expect(r.availableNowEur).toBe(0);
    expect(r.belowReserve).toBe(true);
  });

  it('a 30.000 € source with a 10.000 € reserve leaves 20.000 € to spend', () => {
    const source = makeAsset({ id: 'src', assetClass: 'cash', type: 'cash', quantity: 1, currentPrice: 30000 });
    const r = summarizeReserve({ sourceCashAssetIds: ['src'], reserveEur: 10000, monthlyInflowEur: 0 }, byId(source), deps);
    expect(r.availableNowEur).toBeCloseTo(20000, 2);
    expect(r.belowReserve).toBe(false);
  });
});

// ─── What a plan may buy (2026-11-12) ────────────────────────────────────────

describe('isPlanBuyable', () => {
  const property = makeAsset({ id: 'house', name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200000 });
  const mortgage = makeAsset({ id: 'mortgage', name: 'Mutuo', type: 'loan', assetClass: 'realestate', quantity: 1, currentPrice: -100000, financedAssetId: 'house' });
  const personalLoan = makeAsset({ id: 'loan', name: 'Prestito', type: 'loan', assetClass: 'cash', quantity: 1, currentPrice: -5000 });
  const account = makeAsset({ id: 'account', name: 'Conto', type: 'cash', assetClass: 'cash', quantity: 1000, currentPrice: 1 });
  const moneyMarket = makeAsset({ id: 'mm', name: 'Monetario', type: 'etf', assetClass: 'cash', quantity: 10, currentPrice: 100 });
  const pension = makeAsset({ id: 'fund', name: 'Fondo', type: 'pensionFund', assetClass: 'equity', quantity: 10, currentPrice: 100, allocationRole: 'tradable' });
  const frozen = makeAsset({ id: 'frozen', name: 'ETF fermo', type: 'etf', assetClass: 'equity', quantity: 10, currentPrice: 100, allocationRole: 'frozen' });
  const etf = makeAsset({ id: 'etf-a', name: 'ETF A', type: 'etf', assetClass: 'equity', quantity: 10, currentPrice: 100 });
  const all = [property, mortgage, personalLoan, account, moneyMarket, pension, frozen, etf];

  // Seen red with `isLedgerAssetType` dropped: the loans, the property and the pension fund got in.
  it('never a loan, a property, an account, a money-market fund, a pension fund or a frozen asset', () => {
    for (const asset of [property, mortgage, personalLoan, account, moneyMarket, pension, frozen]) {
      expect(isPlanBuyable(asset, all), asset.name).toBe(false);
    }
  });

  it('a tradable ETF', () => {
    expect(isPlanBuyable(etf, all)).toBe(true);
  });

  it('«+ Aggiungi» offers only what a plan may buy', () => {
    const offered = listAddableAssets(all, { positions: [], disposals: [] }).map((entry) => entry.asset.id);
    expect(offered).toEqual(['etf-a']);
  });
});

// ─── Money in cents (2026-11-12) ─────────────────────────────────────────────

describe('the engine writes euros in cents', () => {
  const twoDecimals = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

  it('scheduleInstallments: every planned amount, carry and the residual', () => {
    const states = [{ positionId: 'p', label: 'ETF A', targetPercentage: 100, currentValueEur: 0, buyAssetId: 'etf-a', buyPriceEur: 33.333, unpriced: false }];
    const { installments, residualEur } = scheduleInstallments({ p: 900 }, states, 3, '2027-01');
    for (const installment of installments) {
      for (const l of installment.lines) expect(twoDecimals(l.plannedAmountEur), `${l.plannedAmountEur}`).toBe(true);
      for (const carry of Object.values(installment.carryInEur)) expect(twoDecimals(carry), `${carry}`).toBe(true);
    }
    expect(twoDecimals(residualEur), `${residualEur}`).toBe(true);
  });

  it('a registered line and a sale’s proceeds', () => {
    expect(buildRegisteredLinePatch('t1', 3, 33.333).executedAmountEur).toBe(100);
    const asset = makeAsset({ id: 'etf-b', quantity: 3, currentPrice: 33.333 });
    const deps: PlanDeps = { valueOf: (a) => a.quantity * a.currentPrice, priceOf: (a) => a.currentPrice };
    expect(proceedsOfDisposal({ assetId: 'etf-b', quantity: 3, estimatedProceedsEur: 0, status: 'planned' }, asset, deps)).toBe(100);
  });
});

// The reserve a new plan starts from is the allocation's cash quota (owner, 2026-11-17): the fixed
// amount when the cash target is one, else its percentage of today's allocated base, up to the euro.
// The plan's reserve on the investment account alone (2026-11-19): the cash on the other accounts is cash outside
// the plan, so it lowers the reserve the plan's account keeps. Seen red with `sourceIds` ignored.
describe('resolvePlanReserve — the source accounts', () => {
  const A = makeAsset({ id: 'conto-a', name: 'Conto ornitorinco', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 10000 });
  const B = makeAsset({ id: 'conto-b', name: 'Conto fenicottero', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 5000 });
  const targets = { cash: { targetPercentage: 0, useFixedAmount: true, fixedAmount: 12000 } } as never;
  const compare = (() => ({ marketValue: 100000, byAssetClass: { cash: { currentValue: 15000 } } })) as never;

  it("without sourceIds every account is the plan's: the reserve is the whole quota", () => {
    expect(resolvePlanReserve([A, B], targets, compare, deps)).toEqual({ reserveEur: 12000, otherCashEur: 0, quotaEur: 12000 });
  });

  it("with one account of two, the other account's cash lowers the reserve the plan's account keeps", () => {
    expect(resolvePlanReserve([A, B], targets, compare, deps, 0, ['conto-a'])).toEqual({ reserveEur: 7000, otherCashEur: 5000, quotaEur: 12000 });
  });
});

describe('resolvePlanReserveEur', () => {
  const targets = (cash: Record<string, unknown>) => ({ cash: { targetPercentage: 10, ...cash } }) as never;
  // Seen red with the percentage read even under a fixed amount.
  it('a fixed amount is the reserve', () => {
    expect(resolvePlanReserveEur(targets({ useFixedAmount: true, fixedAmount: 15000 }), 200000)).toBe(15000);
  });
  it('a percentage is a share of the allocated base, rounded up to the euro', () => {
    expect(resolvePlanReserveEur(targets({}), 200000)).toBe(20000);
    expect(resolvePlanReserveEur(targets({ targetPercentage: 5 }), 24689)).toBe(1235);
  });
  it('no targets, no cash target or no base: no reserve', () => {
    expect(resolvePlanReserveEur(null, 200000)).toBe(0);
    expect(resolvePlanReserveEur({} as never, 200000)).toBe(0);
    expect(resolvePlanReserveEur(targets({}), 0)).toBe(0);
  });
});

// The monthly inflows (and a sale's proceeds) first bring the cash back to the reserve, then they are
// invested; the instalments start the month the reserve is reached (owner, 2026-11-17).
// Seen red with the shortfall ignored and the inflows spent from month 1.
describe('the reserve is refilled before anything is invested', () => {
  const CASH_LOW = makeAsset({ id: 'cash-low', name: 'Conto', assetClass: 'cash', quantity: 1, currentPrice: 8000 });
  const below: PlanLiquidity = { sourceCashAssetIds: ['cash-low'], reserveEur: 10000, monthlyInflowEur: 1000 };

  it('inflows only: two months refill the 2000 € gap, the other ten invest the rest', () => {
    const result = computeUsableLiquidity(below, byId(CASH_LOW), [], 12, deps);
    expect(result.shortfallEur).toBe(2000);
    expect(result.refillMonths).toBe(2);
    expect(result.L).toBe(10000);
  });

  it('a sale refills first, the inflows finish it', () => {
    const sale: PlanDisposal[] = [{ assetId: 'etf-a', estimatedProceedsEur: 1500, status: 'planned' }];
    const result = computeUsableLiquidity(below, byId(CASH_LOW), sale, 12, deps);
    expect(result.refillMonths).toBe(1);
    expect(result.L).toBe(11500);
  });

  it('a sale that covers the gap: no month lost', () => {
    const sale: PlanDisposal[] = [{ assetId: 'etf-a', estimatedProceedsEur: 3000, status: 'planned' }];
    const result = computeUsableLiquidity(below, byId(CASH_LOW), sale, 12, deps);
    expect(result.refillMonths).toBe(0);
    expect(result.L).toBe(13000);
  });

  it('no gap: nothing changes', () => {
    const result = computeUsableLiquidity({ ...below, reserveEur: 6000 }, byId(CASH_LOW), [], 12, deps);
    expect(result.shortfallEur).toBe(0);
    expect(result.refillMonths).toBe(0);
    expect(result.L).toBe(2000 + 12000);
  });

  it('no inflow cannot refill: nothing to invest, every month refills', () => {
    const result = computeUsableLiquidity({ ...below, monthlyInflowEur: 0 }, byId(CASH_LOW), [], 12, deps);
    expect(result.L).toBe(0);
    expect(result.refillMonths).toBe(12);
  });

  it('the calendar leaves the refill months empty and never takes the cash under the reserve', () => {
    const states = resolvePositionStates(
      [{ id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      byId(ETF_A),
      deps
    );
    const liquidity = computeUsableLiquidity(below, byId(CASH_LOW), [], 12, deps);
    const { installments } = scheduleInstallments(computeTotalPurchases(states, liquidity.L), states, 12, '2027-01', 1, liquidity.refillMonths);
    expect(installments).toHaveLength(12);
    expect(installments.map((i) => i.month).slice(0, 3)).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(installments[0].lines).toEqual([]);
    expect(installments[1].lines).toEqual([]);
    expect(installments[2].lines[0]?.plannedAmountEur).toBe(1000);
    let cash = 8000;
    installments.forEach((installment, i) => {
      cash += 1000 - installment.lines.reduce((sum, line) => sum + line.plannedAmountEur, 0);
      if (i >= 1) expect(cash, `month ${i + 1}`).toBeGreaterThanOrEqual(10000 - 1e-6);
    });
  });

  it('the recalibration of a refill month suggests nothing', () => {
    const plan: AccumulationPlan = {
      id: 'plan-r', userId: 'u1', name: 'Piano', status: 'active', startMonth: '2027-01', months: 12,
      liquidity: below,
      positions: [{ id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      disposals: [], installments: [{ index: 1, month: '2027-01', lines: [], carryInEur: { p1: 0 } }],
      createdAt: new Date(0), updatedAt: new Date(0),
    };
    expect(recalibrateInstallment(plan, 1, byId(CASH_LOW, ETF_A), deps).suggestedTotalEur).toBe(0);
  });
});

describe('the recalibration keeps the reserve', () => {
  // A sale of 2500 € refills the 2000 € gap: 500 € of it and the month's 1000 € inflow (1500 €) cap the
  // month, above the 1041,67 € budget's 10 shares — the instalment stays whole (owner, 2026-11-17).
  it('a sale that refills the reserve leaves the instalment whole', () => {
    const cash = makeAsset({ id: 'cash-r', name: 'Conto', assetClass: 'cash', quantity: 1, currentPrice: 8000 });
    const plan: AccumulationPlan = {
      id: 'plan-s', userId: 'u1', name: 'Piano', status: 'active', startMonth: '2027-01', months: 12,
      liquidity: { sourceCashAssetIds: ['cash-r'], reserveEur: 10000, monthlyInflowEur: 1000 },
      positions: [{ id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      disposals: [{ assetId: 'etf-x', estimatedProceedsEur: 2500, status: 'planned' }],
      installments: [{ index: 1, month: '2027-01', lines: [], carryInEur: { p1: 0 } }],
      createdAt: new Date(0), updatedAt: new Date(0),
    };
    expect(recalibrateInstallment(plan, 1, byId(cash, ETF_A), deps).suggestedTotalEur).toBe(1000);
  });
});

// The quota covers the whole cash class: a money-market fund outside the accounts counts towards it,
// so the accounts keep only the rest (owner, 2026-11-17). Seen red with the whole quota on the accounts.
describe('resolveAccountReserveEur', () => {
  it('the quota minus the cash held outside the accounts', () => {
    expect(resolveAccountReserveEur({ quotaEur: 50000, cashClassEur: 30000, accountsEur: 9000 })).toEqual({ reserveEur: 29000, otherCashEur: 21000 });
  });
  it('outside cash above the quota: nothing to keep on the accounts', () => {
    expect(resolveAccountReserveEur({ quotaEur: 10000, cashClassEur: 30000, accountsEur: 5000 })).toEqual({ reserveEur: 0, otherCashEur: 25000 });
  });
  // A money-market sale moves cash onto the accounts: the reserve rises by it, so only the euros above the quota
  // become the plan's (owner, 2026-11-18). Quota 10.000, accounts 15.000, fund 12.000: 17.000 above the quota.
  it('a money-market sale raises the reserve by what it moves: the plan gets only the cash above the quota', () => {
    const account = makeAsset({ id: 'acc', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 15000 });
    const fund = makeAsset({ id: 'mm', assetClass: 'cash', quantity: 120, currentPrice: 100 });
    const byId = new Map([account, fund].map((a) => [a.id, a]));
    for (const quantity of [80, 120]) {
      const disposals: PlanDisposal[] = [{ assetId: 'mm', quantity, estimatedProceedsEur: quantity * 100, status: 'planned' }];
      const cashFundSoldEur = planCashFundSaleEur(disposals, byId, [account, fund]);
      expect(cashFundSoldEur).toBe(quantity * 100);
      const { reserveEur } = resolveAccountReserveEur({ quotaEur: 10000, cashClassEur: 27000, accountsEur: 15000, cashFundSoldEur });
      const usable = computeUsableLiquidity({ sourceCashAssetIds: ['acc'], reserveEur, monthlyInflowEur: 0 }, byId, disposals, 12, deps);
      expect(usable.L).toBeCloseTo(17000, 6);
    }
  });
  it('only accounts: the whole quota', () => {
    expect(resolveAccountReserveEur({ quotaEur: 10000, cashClassEur: 8000, accountsEur: 8000 })).toEqual({ reserveEur: 10000, otherCashEur: 0 });
  });
});

// Only a real account is a plan's source; a money-market fund in the cash class is not (owner, 2026-11-17).
// Seen red with every cash-class asset offered as a source.
describe('isPlanSourceAccount', () => {
  it('an account yes, a cash-class fund no, an equity no', () => {
    expect(isPlanSourceAccount(makeAsset({ type: 'cash', assetClass: 'cash' }))).toBe(true);
    expect(isPlanSourceAccount(makeAsset({ type: 'etf', assetClass: 'cash' }))).toBe(false);
    expect(isPlanSourceAccount(makeAsset({ type: 'etf', assetClass: 'equity' }))).toBe(false);
  });
});

// The month's cap counts this month's inflow, as the calendar does: right after activation nothing
// moved and nothing is proposed (collaudo, 2026-11-17). Seen red cutting a 1000 € instalment to 500 €.
describe("the recalibration counts the month's inflow", () => {
  it('500 € above the reserve and 1000 € a month keep a 1000 € instalment', () => {
    const cash = makeAsset({ id: 'cash-i', name: 'Conto', assetClass: 'cash', quantity: 1, currentPrice: 10500 });
    const plan: AccumulationPlan = {
      id: 'plan-i', userId: 'u1', name: 'Piano', status: 'active', startMonth: '2027-01', months: 12,
      liquidity: { sourceCashAssetIds: ['cash-i'], reserveEur: 10000, monthlyInflowEur: 1000 },
      positions: [{ id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      disposals: [],
      installments: [{ index: 1, month: '2027-01', lines: [{ positionId: 'p1', assetId: 'etf-a', plannedQuantity: 10, priceEurAtPlan: 100, plannedAmountEur: 1000, status: 'planned' }], carryInEur: { p1: 0 } }],
      createdAt: new Date(0), updatedAt: new Date(0),
    };
    const result = recalibrateInstallment(plan, 1, byId(cash, ETF_A), deps);
    expect(result.suggestedTotalEur).toBe(1000);
    expect(shouldProposeRecalibration(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A sale counts from its month (owner, 2026-11-19): its proceeds enter the instalments from the sale's month,
// and a later sale refills what the reserve still misses before a euro of it is invested.
// ---------------------------------------------------------------------------

const ONE_EURO = makeAsset({ id: 'one-euro', name: 'ETF-UNO', quantity: 0, currentPrice: 1 });
const ONE_EURO_POSITION: PlanPosition[] = [
  { id: 'p1', label: 'ETF-UNO', targetPercentage: 100, memberAssetIds: ['one-euro'], buyAssetId: 'one-euro' },
];

function instalmentEuros(installments: { lines: { plannedAmountEur: number }[] }[]): number[] {
  return installments.map((installment) => roundCents(installment.lines.reduce((sum, line) => sum + line.plannedAmountEur, 0)));
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function scheduleOn(cash: Asset, liquidity: PlanLiquidity, disposals: PlanDisposal[], months: number, firstIndex = 1) {
  const assets = byId(cash, ONE_EURO);
  const usable = computeUsableLiquidity(liquidity, assets, disposals, months, deps, firstIndex);
  const states = resolvePositionStates(ONE_EURO_POSITION, assets, deps);
  const totals = computeTotalPurchases(states, usable.L);
  const schedule = scheduleInstallments(totals, states, months, '2027-01', firstIndex, usable.refillMonths, usable.monthShares);
  return { usable, totals, schedule };
}

// Invented figures (2026-11-19): 12 months, 500 € a month, 1.200 € above the reserve, 2.400 € sold in month 1, 6.000 € in month 7.
const CASH_ABOVE = makeAsset({ id: 'cash-above', name: 'Conto', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 11200 });
const ABOVE_LIQUIDITY: PlanLiquidity = { sourceCashAssetIds: ['cash-above'], reserveEur: 10000, monthlyInflowEur: 500 };
const TWO_SALES: PlanDisposal[] = [
  { assetId: 'etf-x', estimatedProceedsEur: 2400, status: 'planned' },
  { assetId: 'etf-y', monthIndex: 7, estimatedProceedsEur: 6000, status: 'planned' },
];

// Mutation that turns it red: `spreadMonthShares` returning an even array instead of null.
describe('a plan with no sale after its first month schedules as before', () => {
  it('monthShares is null and L / refillMonths keep the figures of the existing fixtures', () => {
    const liquidity: PlanLiquidity = { sourceCashAssetIds: ['cash1', 'cash2'], reserveEur: 10000, monthlyInflowEur: 500 };
    const disposals: PlanDisposal[] = [{ assetId: 'etf-d', estimatedProceedsEur: 100, status: 'planned' }];
    const plain = computeUsableLiquidity(liquidity, byId(CASH1, CASH2), disposals, 12, deps);
    expect(plain.monthShares).toBeNull();
    expect(plain.dueProceedsEur).toBe(100);
    expect(plain.L).toBe(21100);
    expect(plain.refillMonths).toBe(0);

    const low = makeAsset({ id: 'cash-low', name: 'Conto', assetClass: 'cash', quantity: 1, currentPrice: 8000 });
    const below: PlanLiquidity = { sourceCashAssetIds: ['cash-low'], reserveEur: 10000, monthlyInflowEur: 1000 };
    const cases: Array<[PlanDisposal[], number, number]> = [
      [[], 2, 10000],
      [[{ assetId: 'etf-a', estimatedProceedsEur: 1500, status: 'planned' }], 1, 11500],
      [[{ assetId: 'etf-a', monthIndex: 1, estimatedProceedsEur: 3000, status: 'planned' }], 0, 13000],
    ];
    for (const [sales, refillMonths, L] of cases) {
      const result = computeUsableLiquidity(below, byId(low), sales, 12, deps);
      expect(result.monthShares).toBeNull();
      expect(result.refillMonths).toBe(refillMonths);
      expect(result.L).toBe(L);
    }
    const noInflow = computeUsableLiquidity({ ...below, monthlyInflowEur: 0 }, byId(low), [], 12, deps);
    expect(noInflow.monthShares).toBeNull();
    expect(noInflow.refillMonths).toBe(12);
  });

  it('scheduleInstallments with null shares deep-equals the call without them', () => {
    const states = resolvePositionStates(
      [{ id: 'p1', label: 'ETF-A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      byId(ETF_A),
      deps
    );
    expect(scheduleInstallments({ p1: 5000 }, states, 6, '2026-10', 1, 1, null)).toEqual(
      scheduleInstallments({ p1: 5000 }, states, 6, '2026-10', 1, 1)
    );
  });
});

// Mutation that turns it red: every later tranche pushed at offset 0.
describe('computeUsableLiquidity counts a sale from its month', () => {
  it('a month-7 sale is spent from month 7: six shares of 800 and six of 1.800 over 15.600', () => {
    const result = computeUsableLiquidity(ABOVE_LIQUIDITY, byId(CASH_ABOVE), TWO_SALES, 12, deps);
    expect(result.L).toBe(15600);
    expect(result.disposalProceedsEur).toBe(8400);
    expect(result.dueProceedsEur).toBe(2400);
    expect(result.refillMonths).toBe(0);
    expect(result.monthShares).toHaveLength(12);
    result.monthShares!.forEach((share, m) => expect(share).toBeCloseTo((m < 6 ? 800 : 1800) / 15600, 12));
  });

  it('counted from month 7 (firstIndex 7) the month-7 sale is due and the spread is even', () => {
    const result = computeUsableLiquidity(ABOVE_LIQUIDITY, byId(CASH_ABOVE), TWO_SALES, 6, deps, 7);
    expect(result.dueProceedsEur).toBe(8400);
    expect(result.monthShares).toBeNull();
  });
});

// Mutation that turns it red: `spread(tranche.eur, 0)` for a later sale.
describe('scheduleInstallments spends a later sale from its month', () => {
  it('the two-sale fixture: instalments 800 × 6 then 1.800 × 6', () => {
    const { schedule } = scheduleOn(CASH_ABOVE, ABOVE_LIQUIDITY, TWO_SALES, 12);
    expect(instalmentEuros(schedule.installments)).toEqual([800, 800, 800, 800, 800, 800, 1800, 1800, 1800, 1800, 1800, 1800]);
    expect(schedule.residualEur).toBe(0);
  });

  it('property: the cumulative spend never passes the cash above the reserve plus the money arrived (200 seeded cases)', () => {
    const random = createSeededRandom(20261119);
    const pick = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
    for (let caseIndex = 0; caseIndex < 200; caseIndex++) {
      const months = pick(1, 24);
      const reserveEur = 10000;
      const cashEur = reserveEur + pick(-50, 50) * 100;
      const monthlyInflowEur = pick(0, 20) * 100;
      const firstIndex = pick(1, 3);
      const disposals: PlanDisposal[] = Array.from({ length: pick(0, 3) }, (_, i) => ({
        assetId: `sale-${i}`,
        monthIndex: pick(1, firstIndex - 1 + months),
        estimatedProceedsEur: pick(1, 80) * 100,
        status: 'planned' as const,
      }));
      const cash = makeAsset({ id: 'cash-prop', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: cashEur });
      const liquidity: PlanLiquidity = { sourceCashAssetIds: ['cash-prop'], reserveEur, monthlyInflowEur };
      const { totals, schedule } = scheduleOn(cash, liquidity, disposals, months, firstIndex);
      const label = `case ${caseIndex}: ${JSON.stringify({ months, cashEur, monthlyInflowEur, firstIndex, disposals })}`;
      let spentEur = 0;
      schedule.installments.forEach((installment, i) => {
        const m = i + 1;
        spentEur += installment.lines.reduce((sum, line) => sum + line.plannedAmountEur, 0);
        const arrivedEur = disposals
          .filter((d) => d.monthIndex! <= firstIndex - 1 + m)
          .reduce((sum, d) => sum + d.estimatedProceedsEur, 0);
        const boundEur = Math.max(0, cashEur - reserveEur + arrivedEur + monthlyInflowEur * m);
        expect(spentEur, `${label} month ${m}`).toBeLessThanOrEqual(boundEur + 1e-6);
      });
      const totalEur = Object.values(totals).reduce((sum, value) => sum + value, 0);
      expect(spentEur + schedule.residualEur, label).toBeCloseTo(totalEur, 6);
    }
  });
});

// A later sale refills the reserve first (owner, 2026-11-19). Mutation that turns it red: `refillEur = 0` for a later sale.
describe('a later sale refills what the reserve still misses before it is invested', () => {
  const sale = (eur: number): PlanDisposal[] => [{ assetId: 'etf-z', monthIndex: 7, estimatedProceedsEur: eur, status: 'planned' }];
  const cashAt = (eur: number) => makeAsset({ id: 'cash-u', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: eur });

  it('(a) 3.000 under, no inflow, a 6.000 € sale: L 3.000, six empty months then 500 × 6', () => {
    const { usable, schedule } = scheduleOn(cashAt(7000), { sourceCashAssetIds: ['cash-u'], reserveEur: 10000, monthlyInflowEur: 0 }, sale(6000), 12);
    expect(usable.L).toBe(3000);
    expect(usable.refillMonths).toBe(6);
    expect(instalmentEuros(schedule.installments)).toEqual([0, 0, 0, 0, 0, 0, 500, 500, 500, 500, 500, 500]);
  });

  it('(b) 5.000 under, 500 a month, an 8.000 € sale: the inflows refill 3.000, the sale 2.000, then 1.500 × 6', () => {
    const { usable, schedule } = scheduleOn(cashAt(5000), { sourceCashAssetIds: ['cash-u'], reserveEur: 10000, monthlyInflowEur: 500 }, sale(8000), 12);
    expect(usable.L).toBe(9000);
    expect(usable.refillMonths).toBe(6);
    expect(instalmentEuros(schedule.installments)).toEqual([0, 0, 0, 0, 0, 0, 1500, 1500, 1500, 1500, 1500, 1500]);
  });

  // Found by the property test above (owner, 2026-11-19): with every month refilling, the last refill's
  // leftover was neither bought nor residual. Seen red with the residual left at 0.
  it('every month refills: the leftover of the last refill is the residual, Σ lines + residual = L', () => {
    const { usable, schedule } = scheduleOn(cashAt(6300), { sourceCashAssetIds: ['cash-u'], reserveEur: 10000, monthlyInflowEur: 1800 }, [], 3);
    expect(usable.refillMonths).toBe(3);
    expect(usable.L).toBe(1700);
    expect(instalmentEuros(schedule.installments)).toEqual([0, 0, 0]);
    expect(schedule.residualEur).toBe(1700);
  });

  it('(c) 3.000 under, no inflow, a 2.000 € sale: nothing to invest, every month refills', () => {
    const { usable } = scheduleOn(cashAt(7000), { sourceCashAssetIds: ['cash-u'], reserveEur: 10000, monthlyInflowEur: 0 }, sale(2000), 12);
    expect(usable.L).toBe(0);
    expect(usable.refillMonths).toBe(12);
    expect(usable.monthShares).toBeNull();
  });
});

// Mutation that turns it red: `recalibrateInstallment` calling `computeUsableLiquidity` without the index — the month-7 case (the month-3 one reads its own shares: the sale is not due either way).
describe('the recalibration counts only the sales due by the open month', () => {
  function planWithLaterSale(): AccumulationPlan {
    return {
      id: 'plan-late', userId: 'u1', name: 'Piano', status: 'active', startMonth: '2027-01', months: 12,
      liquidity: ABOVE_LIQUIDITY,
      positions: ONE_EURO_POSITION,
      disposals: [{ assetId: 'etf-y', monthIndex: 7, estimatedProceedsEur: 6000, status: 'planned' }],
      installments: [], createdAt: new Date(0), updatedAt: new Date(0),
    };
  }

  it('at month 3 the month-7 sale is not due and the budget is the month share, not the even one', () => {
    const result = recalibrateInstallment(planWithLaterSale(), 3, byId(CASH_ABOVE, ONE_EURO), deps);
    expect(result.liquidity.dueProceedsEur).toBe(0);
    const shares = result.liquidity.monthShares!;
    expect(shares).not.toBeNull();
    const line = result.lines[0];
    expect(line.suggestedQuantity).toBe(Math.floor(result.liquidity.L * shares[0] / 1 + 1e-9));
    expect(line.suggestedQuantity).toBeLessThan(Math.floor(result.liquidity.L / 10));
  });

  it('at month 7 the sale is due', () => {
    const result = recalibrateInstallment(planWithLaterSale(), 7, byId(CASH_ABOVE, ONE_EURO), deps);
    expect(result.liquidity.dueProceedsEur).toBe(6000);
    expect(result.liquidity.monthShares).toBeNull();
  });
});

// The settings' «Conto per gli investimenti» (2026-11-19): a new plan starts on it while it still is an account.
// Mutation that turns it red: `isPlanSourceAccount` dropped.
describe('resolveInvestmentAccountId', () => {
  const account = makeAsset({ id: 'cash-invest', name: 'Conto', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 5000 });
  const moneyMarket = makeAsset({ id: 'fondo-mm', name: 'Monetario', type: 'etf', assetClass: 'cash', quantity: 10, currentPrice: 100 });

  it('the id of an account; null when it is gone, is not an account or is not set', () => {
    expect(resolveInvestmentAccountId({ investmentCashAssetId: 'cash-invest' }, [account, moneyMarket])).toBe('cash-invest');
    expect(resolveInvestmentAccountId({ investmentCashAssetId: 'cash-invest' }, [moneyMarket])).toBeNull();
    expect(resolveInvestmentAccountId({ investmentCashAssetId: 'fondo-mm' }, [account, moneyMarket])).toBeNull();
    expect(resolveInvestmentAccountId({}, [account])).toBeNull();
    expect(resolveInvestmentAccountId(null, [account])).toBeNull();
  });
});

// ── The swap (owner, 2026-11-20, NOVE-25's phase F on the mirror): a sale whose proceeds buy ONE named
// instrument in the sale's month, never the reserve. Invented figures: 3.000 € under the reserve, 500 € a month,
// 12 months, an old ETF sold in month 1 for 4.000 € that buys a bond at 100 €.
describe('the swap: a sale that buys one instrument in its month', () => {
  const cash = makeAsset({ id: 'cash-swap', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 7000 });
  const world = makeAsset({ id: 'world', name: 'ETF ornitorinco', quantity: 100, currentPrice: 50 });
  const bond = makeAsset({ id: 'bond', name: 'BTP fenicottero', type: 'bond', assetClass: 'bonds', quantity: 0, currentPrice: 100 });
  const liquidity: PlanLiquidity = { sourceCashAssetIds: ['cash-swap'], reserveEur: 10000, monthlyInflowEur: 500 };
  const positions: PlanPosition[] = [
    { id: 'p-world', label: 'ETF ornitorinco', targetPercentage: 60, memberAssetIds: ['world'], buyAssetId: 'world' },
    { id: 'p-bond', label: 'BTP fenicottero', targetPercentage: 40, memberAssetIds: ['bond'], buyAssetId: 'bond' },
  ];
  const swap: PlanDisposal = { assetId: 'old-etf', estimatedProceedsEur: 4000, status: 'planned', reinvestAssetId: 'bond' };
  const plain: PlanDisposal = { assetId: 'old-etf', estimatedProceedsEur: 4000, status: 'planned' };
  const run = (assets: Map<string, Asset>, disposals: PlanDisposal[], months = 12) => {
    const usable = computeUsableLiquidity(liquidity, assets, disposals, months, deps);
    const states = resolvePositionStates(positions, assets, deps, disposals);
    const totals = computeTotalPurchases(states, usable.L);
    const schedule = scheduleInstallments(totals, states, months, '2027-01', 1, usable.refillMonths, usable.monthShares, usable.swaps);
    return { usable, states, totals, schedule };
  };

  // Mutation that turns it red: the swap left in the pool (the reserve takes its proceeds).
  it('the proceeds skip the reserve and the pool: the inflows alone refill, L counts no sale', () => {
    const swapped = computeUsableLiquidity(liquidity, byId(cash, world, bond), [swap], 12, deps);
    expect(swapped.disposalProceedsEur).toBe(0);
    expect(swapped.swapProceedsEur).toBe(4000);
    expect(swapped.refillMonths).toBe(6);
    expect(swapped.L).toBe(3000);
    expect(swapped.swaps).toEqual([{ assetId: 'bond', offset: 0, eur: 4000 }]);
    // The same sale without the swap refills the reserve at once.
    const pooled = computeUsableLiquidity(liquidity, byId(cash, world, bond), [plain], 12, deps);
    expect(pooled.refillMonths).toBe(0);
    expect(pooled.L).toBe(7000);
    expect(pooled.swaps).toEqual([]);
  });

  // Mutation that turns it red: the swap line skipped in a refill month.
  it('month 1 buys the bond with the whole proceeds in whole units, even while the inflows refill; the cents are residual', () => {
    const { schedule } = run(byId(cash, world, bond), [swap]);
    const first = schedule.installments[0];
    expect(first.lines).toEqual([
      { positionId: 'p-bond', assetId: 'bond', plannedQuantity: 40, priceEurAtPlan: 100, plannedAmountEur: 4000, status: 'planned', swap: true },
    ]);
    for (const installment of schedule.installments.slice(1, 6)) expect(installment.lines).toEqual([]);
    expect(schedule.installments[6].lines.length).toBeGreaterThan(0);
    expect(schedule.installments[6].lines.some((line) => line.swap)).toBe(false);
    const spent = schedule.installments.reduce((sum, i) => sum + i.lines.reduce((s, l) => s + l.plannedAmountEur, 0), 0);
    expect(roundCents(spent + schedule.residualEur)).toBe(3000 + 4000);
  });

  // Two sales that buy the same instrument in the same month are ONE purchase (owner's mirror, 2026-11-20: two lines
  // of the BTP€i, two orders, a unit lost to the rounding). Mutation that turns it red: one swap per sale.
  it('two swaps toward one instrument in one month: one line on their summed proceeds', () => {
    const second: PlanDisposal = { assetId: 'other-etf', estimatedProceedsEur: 150, status: 'planned', reinvestAssetId: 'bond' };
    const { usable, schedule } = run(byId(cash, world, bond), [{ ...swap, estimatedProceedsEur: 4250 }, second]);
    expect(usable.swaps).toEqual([{ assetId: 'bond', offset: 0, eur: 4400 }]);
    expect(schedule.installments[0].lines).toEqual([
      { positionId: 'p-bond', assetId: 'bond', plannedQuantity: 44, priceEurAtPlan: 100, plannedAmountEur: 4400, status: 'planned', swap: true },
    ]);
  });

  // Mutation that turns it red: the swap not added to the bought position's value (the rates would buy it again).
  it('the bought position counts the swap as held: the rates split toward the targets on top of it', () => {
    const { states } = run(byId(cash, world, bond), [swap]);
    expect(states.find((s) => s.positionId === 'p-bond')?.currentValueEur).toBe(4000);
    expect(run(byId(cash, world, bond), [plain]).states.find((s) => s.positionId === 'p-bond')?.currentValueEur).toBe(0);
  });

  // Mutation that turns it red: an unpriced swap target kept as a swap (its money would vanish).
  it('a bought instrument with no price: the sale goes back to the pool, as without the swap', () => {
    const unpriced = makeAsset({ id: 'bond', name: 'BTP fenicottero', type: 'bond', assetClass: 'bonds', quantity: 0, currentPrice: 0 });
    const result = run(byId(cash, world, unpriced), [swap]);
    expect(result.usable.swaps).toEqual([]);
    expect(result.usable.L).toBe(7000);
    expect(result.states.find((s) => s.positionId === 'p-bond')?.currentValueEur).toBe(0);
  });

  // Mutation that turns it red: the recalibration blind to the month's swap (it would propose to drop it).
  it('the recalibration of the swap month suggests what the calendar planned: nothing to propose', () => {
    const assets = byId(cash, world, bond);
    const { schedule } = run(assets, [swap]);
    const plan = {
      months: 12, startMonth: '2027-01', liquidity, positions, disposals: [swap], installments: schedule.installments,
    } as unknown as AccumulationPlan;
    const result = recalibrateInstallment(plan, 1, assets, deps);
    const bondLine = result.lines.find((line) => line.positionId === 'p-bond');
    expect(bondLine?.plannedQuantity).toBe(40);
    expect(bondLine?.suggestedQuantity).toBe(40);
    expect(shouldProposeRecalibration(result)).toBe(false);
  });

  it('a later swap buys in its own month; a swap in a month that also buys merges into the one line', () => {
    const later = run(byId(cash, world, bond), [{ ...swap, monthIndex: 3 }]);
    expect(later.usable.swaps).toEqual([{ assetId: 'bond', offset: 2, eur: 4000 }]);
    expect(later.schedule.installments[2].lines.filter((line) => line.swap)).toHaveLength(1);
    const rich = makeAsset({ id: 'cash-swap', type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 20000 });
    const merged = run(byId(rich, world, bond), [swap]);
    const bondLines = merged.schedule.installments[0].lines.filter((line) => line.positionId === 'p-bond');
    expect(bondLines).toHaveLength(1);
    expect(bondLines[0].plannedQuantity).toBeGreaterThan(42);
  });
});
