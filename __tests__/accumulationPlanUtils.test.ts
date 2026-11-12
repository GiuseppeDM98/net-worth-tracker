/**
 * Tests for the pure PAC engine (lib/utils/accumulationPlanUtils.ts, doc/pac-ate.md §5/§11).
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
  projectPlanOutcome,
  toMonthKey,
  addMonths,
  monthIndexOf,
  weightsToSeedPositions,
  selectClassStripRows,
  type ClassTrajectoryPoint,
  type PlanDeps,
  summarizeReserve,
} from '@/lib/utils/accumulationPlanUtils';
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

const VWCE = makeAsset({ id: 'vwce', name: 'VWCE', ticker: 'VWCE', quantity: 10, currentPrice: 132.4 });
const NTSG = makeAsset({
  id: 'ntsg',
  name: 'NTSG',
  ticker: 'NTSG',
  quantity: 20,
  currentPrice: 42.1,
  leverageRatio: 1.5,
  composition: [
    { assetClass: 'equity', percentage: 60 },
    { assetClass: 'bonds', percentage: 40 },
  ],
});
const CL2 = makeAsset({ id: 'cl2', name: 'CL2', ticker: 'CL2', quantity: 2, currentPrice: 520, leverageRatio: 2 });
const CRRY = makeAsset({
  id: 'crry',
  name: 'CRRY',
  ticker: 'CRRY',
  quantity: 1,
  currentPrice: 145,
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
    expect(exposurePerEuro(VWCE)).toEqual({ equity: 1 });
    expect(exposurePerEuro(CL2)).toEqual({ equity: 2 });
  });

  it('composite asset: leverage applies per leg', () => {
    const result = exposurePerEuro(NTSG);
    expect(result.equity).toBeCloseTo(0.9, 9);
    expect(result.bonds).toBeCloseTo(0.6, 9);
  });

  it('agrees with expandAssetExposure per euro of market value', async () => {
    vi.doMock('@/lib/firebase/config', () => ({ db: {} }));
    const { expandAssetExposure } = await import('@/lib/utils/assetExposureUtils');
    for (const asset of [VWCE, CL2, NTSG]) {
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
      { assetId: 'xdem', estimatedProceedsEur: 120, status: 'planned' },
      { assetId: 'eimi', estimatedProceedsEur: 999, status: 'executed' },
      { assetId: 'avws', estimatedProceedsEur: 55, status: 'skipped' },
    ];
    const result = computeUsableLiquidity(liquidity, byId(CASH1, CASH2), disposals, 12, deps);
    expect(result.sourceCashEur).toBe(25000);
    expect(result.availableNowEur).toBe(15000);
    expect(result.disposalProceedsEur).toBe(120);
    expect(result.inflowTotalEur).toBe(6000);
    expect(result.L0).toBe(15120);
    expect(result.L).toBe(21120);
    expect(result.belowReserve).toBe(false);
  });
});

describe('computeTotalPurchases', () => {
  it('splits L toward target, Σ result === L', () => {
    const states = resolvePositionStates(
      [
        { id: 'p1', label: 'VWCE', targetPercentage: 60, memberAssetIds: ['vwce'], buyAssetId: 'vwce' },
        { id: 'p2', label: 'NTSG', targetPercentage: 40, memberAssetIds: ['ntsg'], buyAssetId: 'ntsg' },
      ],
      byId(VWCE, NTSG),
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
      [{ id: 'p1', label: 'VWCE', targetPercentage: 100, memberAssetIds: ['vwce'], buyAssetId: 'vwce' }],
      byId(VWCE),
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
        { id: 'p1', label: 'VWCE', targetPercentage: 50, memberAssetIds: ['vwce'], buyAssetId: 'vwce' },
        { id: 'p2', label: 'CRRY', targetPercentage: 50, memberAssetIds: ['crry'], buyAssetId: 'crry' },
      ],
      byId(VWCE, CRRY),
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
        expect(line.assetId).toBe(line.positionId === 'p1' ? 'vwce' : 'crry');
        if (line.positionId === 'p1') spentP1 += line.plannedAmountEur;
        else spentP2 += line.plannedAmountEur;
      }
    }
    expect(spentP1 + spentP2 + residualEur).toBeCloseTo(6000 + 6000, 4);
  });

  it('a carry that never buys a full share (CRRY 145€, monthly quota 110€) unlocks it in alternating months', () => {
    const crryState = resolvePositionStates(
      [{ id: 'p1', label: 'CRRY', targetPercentage: 100, memberAssetIds: ['crry'], buyAssetId: 'crry' }],
      byId(CRRY),
      deps
    );
    // Force a monthly share of 110€ over 2 months (total 220€, price 145€): month 1 carries, month 2 (+
    // the closing sweep) must buy the share.
    const { installments, residualEur } = scheduleInstallments({ p1: 220 }, crryState, 2, '2026-10');
    const totalQuantity = installments.reduce(
      (sum, i) => sum + i.lines.reduce((s, l) => s + l.plannedQuantity, 0),
      0
    );
    expect(totalQuantity).toBe(1);
    expect(residualEur).toBeCloseTo(220 - 145, 4);
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
      [{ id: 'p1', label: 'VWCE', targetPercentage: 100, memberAssetIds: ['vwce'], buyAssetId: 'vwce' }],
      byId(VWCE),
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
      [{ id: 'p1', label: 'VWCE', targetPercentage: 100, memberAssetIds: ['vwce'], buyAssetId: 'vwce' }],
      byId(VWCE),
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
      { id: 'p1', label: 'VWCE', targetPercentage: 100, memberAssetIds: ['vwce'], buyAssetId: 'vwce' },
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
        { index: 1, month: '2026-10', lines: [{ positionId: 'p1', assetId: 'vwce', plannedQuantity: 3, priceEurAtPlan: 132.4, plannedAmountEur: 397.2, status: 'executed', executedQuantity: 2, executedAmountEur: 264.8 }], carryInEur: { p1: 0 } },
      ],
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...overrides,
    };
  }

  it('reflects an installment executed with a different quantity than planned', () => {
    const plan = buildPlan();
    const cash = makeAsset({ id: 'cash1', name: 'Conto', assetClass: 'cash', quantity: 1, currentPrice: 10000 });
    const result = recalibrateInstallment(plan, 1, byId(VWCE, cash), deps);
    const line = result.lines.find((l) => l.positionId === 'p1')!;
    expect(line.plannedQuantity).toBe(3);
  });

  it('a reduced cash inflow shrinks the installment and leaves the reserve untouched', () => {
    const plan = buildPlan({ liquidity: { sourceCashAssetIds: ['cash1'], reserveEur: 900, monthlyInflowEur: 0 } });
    const smallCash = makeAsset({ id: 'cash1', name: 'Conto', assetClass: 'cash', quantity: 1, currentPrice: 1000 });
    const result = recalibrateInstallment(plan, 1, byId(VWCE, smallCash), deps);
    expect(result.liquidity.availableNowEur).toBe(100);
    expect(result.liquidity.belowReserve).toBe(false);
    const line = result.lines.find((l) => l.positionId === 'p1')!;
    expect(line.suggestedAmountEur).toBeLessThanOrEqual(100 + 1e-6);
  });
});

describe('projectPlanOutcome', () => {
  it('computes final weights, the max drift and the implicit leverage across NTSG and CL2', () => {
    const positions: PlanPosition[] = [
      { id: 'p1', label: 'NTSG', targetPercentage: 60, memberAssetIds: ['ntsg'], buyAssetId: 'ntsg' },
      { id: 'p2', label: 'CL2', targetPercentage: 40, memberAssetIds: ['cl2'], buyAssetId: 'cl2' },
    ];
    const assets = byId(NTSG, CL2);
    const states = resolvePositionStates(positions, assets, deps);
    const totals = computeTotalPurchases(states, 5000);
    const { installments, residualEur } = scheduleInstallments(totals, states, 4, '2026-10');
    const outcome = projectPlanOutcome(states, installments, residualEur, assets, positions, deps);

    expect(outcome.positions).toHaveLength(2);
    const totalWeight = outcome.positions.reduce((s, p) => s + p.finalWeightPct, 0);
    expect(totalWeight).toBeCloseTo(100, 4);
    expect(outcome.maxDriftPositionId).not.toBeNull();
    // NTSG (leverage 1.5) and CL2 (leverage 2) both expose more notional than market → leverage > 1.
    expect(outcome.leverageRatio).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// §4.4 — weightsToSeedPositions (the optimizer's proposed weights → a fresh PAC draft's positions)
// ---------------------------------------------------------------------------

describe('weightsToSeedPositions', () => {
  it('converts each proposed weight into a single-instrument position with an injected id', () => {
    let n = 0;
    const generateId = () => `id-${++n}`;
    const weights = [
      { key: 'a1', label: 'VWCE', proposedPct: 60 },
      { key: 'a2', label: 'AGGH', proposedPct: 40 },
    ];
    expect(weightsToSeedPositions(weights, generateId)).toEqual([
      { id: 'id-1', label: 'VWCE', targetPercentage: 60, memberAssetIds: ['a1'], buyAssetId: 'a1' },
      { id: 'id-2', label: 'AGGH', targetPercentage: 40, memberAssetIds: ['a2'], buyAssetId: 'a2' },
    ]);
  });

  it('defaults to crypto.randomUUID when no generator is injected', () => {
    const positions = weightsToSeedPositions([{ key: 'a1', label: 'VWCE', proposedPct: 100 }]);
    expect(positions[0].id).toMatch(/^[0-9a-f-]{36}$/);
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

  // Owner's shape (mirror, 2026-09-25): bonds out of band today and back in December, three
  // classes the target document carries at 0% with nothing in them.
  const trajectory: ClassTrajectoryPoint[] = [
    point(0, 'baseline', { equity: cls(66, 70), bonds: cls(30, 23, true), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0.01, 0) }),
    point(1, '2026-09', { equity: cls(67.9, 70), bonds: cls(28.3, 23, true), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0.01, 0) }),
    point(2, '2026-10', { equity: cls(68.5, 70), bonds: cls(27, 23, true), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0, 0) }),
    point(3, '2026-11', { equity: cls(68.5, 70), bonds: cls(26, 23, true), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0, 0) }),
    point(4, '2026-12', { equity: cls(68.5, 70), bonds: cls(24.5, 23), realestate: cls(0, 0), cash: cls(0, 0), crypto: cls(0, 0) }),
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

    expect(bonds).toMatchObject({ currentPct: 28.3, targetPct: 23, finalPct: 24.5, outOfBandNow: true });
    expect(bonds.currentDriftPp).toBeCloseTo(5.3);
    expect(bonds.finalDriftPp).toBeCloseTo(1.5);
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

describe('summarizeReserve (B2, B5)', () => {
  const accountA = makeAsset({ id: 'accA', assetClass: 'cash', type: 'cash', quantity: 1, currentPrice: 5000 });
  const accountB = makeAsset({ id: 'accB', assetClass: 'cash', type: 'cash', quantity: 1, currentPrice: 40000 });

  it('PA2: counts only the source accounts, so 5.000 € against a 10.000 € reserve is below it', () => {
    const r = summarizeReserve({ sourceCashAssetIds: ['accA'], reserveEur: 10000, monthlyInflowEur: 0 }, byId(accountA, accountB), deps);
    expect(r.sourceCashEur).toBeCloseTo(5000, 2);
    expect(r.availableNowEur).toBe(0);
    expect(r.belowReserve).toBe(true);
  });

  it('PA5: a 30.000 € source with a 10.000 € reserve leaves 20.000 € to spend', () => {
    const source = makeAsset({ id: 'src', assetClass: 'cash', type: 'cash', quantity: 1, currentPrice: 30000 });
    const r = summarizeReserve({ sourceCashAssetIds: ['src'], reserveEur: 10000, monthlyInflowEur: 0 }, byId(source), deps);
    expect(r.availableNowEur).toBeCloseTo(20000, 2);
    expect(r.belowReserve).toBe(false);
  });
});
