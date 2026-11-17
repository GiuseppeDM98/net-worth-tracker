/**
 * the PAC's partial sales, «Rivedi il piano» and the recalibration proposal,
 * on one invented plan, fixture F.
 */
import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AccumulationPlan, PlanDisposal, PlanLiquidity, PlanPosition } from '@/types/accumulationPlan';
import { unitPriceEur } from '@/lib/utils/costBasisEur';
import {
  buildRevisedPlan,
  computeTotalPurchases,
  computeUsableLiquidity,
  findFirstIntactInstallment,
  proceedsOfDisposal,
  recalibrateInstallment,
  resolvePositionStates,
  scheduleInstallments,
  shouldProposeRecalibration,
  recalibrationQuantities,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';
import { validateDraftAgainstAssets } from '@/lib/utils/accumulationPlanSchema';

let seq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  seq += 1;
  return {
    id: `a${seq}`, userId: 'u1', ticker: 'X', name: 'X', type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 0, lastPriceUpdate: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    ...overrides,
  };
}

const deps: PlanDeps = { valueOf: (a) => a.quantity * unitPriceEur(a), priceOf: (a) => unitPriceEur(a) };
const byId = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, a]));

const etfA = (quantity = 100) => makeAsset({ id: 'etf-a', name: 'ETF-A', quantity, currentPrice: 120 });
const etfB = (quantity = 200) => makeAsset({ id: 'etf-b', name: 'ETF-B', quantity, currentPrice: 60 });
const conto = (value = 30000) => makeAsset({ id: 'conto', name: 'CONTO', type: 'cash', assetClass: 'cash', quantity: value, currentPrice: 1 });

const positions: PlanPosition[] = [
  { id: 'pv', label: 'ETF-A', targetPercentage: 70, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
  { id: 'px', label: 'ETF-B', targetPercentage: 30, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
];
const liquidity: PlanLiquidity = { sourceCashAssetIds: ['conto'], reserveEur: 10000, monthlyInflowEur: 500 };
const sale = (overrides: Partial<PlanDisposal> = {}): PlanDisposal => ({
  assetId: 'etf-b', quantity: 100, monthIndex: 1, estimatedProceedsEur: 6000, status: 'planned', ...overrides,
});

function planOnF() {
  const assets = byId(etfA(), etfB(), conto());
  const disposals = [sale()];
  const liq = computeUsableLiquidity(liquidity, assets, disposals, 10, deps);
  const states = resolvePositionStates(positions, assets, deps, disposals);
  const totals = computeTotalPurchases(states, liq.L);
  const schedule = scheduleInstallments(totals, states, 10, '2026-11');
  const plan: AccumulationPlan = {
    id: 'p', userId: 'u1', name: 'PAC', status: 'active', startMonth: '2026-11', months: 10, liquidity, positions,
    disposals, installments: schedule.installments, residualEur: schedule.residualEur,
    createdAt: new Date(0), updatedAt: new Date(0),
  };
  return { assets, liq, totals, schedule, plan };
}

const qty = (plan: AccumulationPlan, index: number, positionId: string) =>
  plan.installments.find((i) => i.index === index)?.lines.find((l) => l.positionId === positionId)?.plannedQuantity ?? 0;

describe('partial sales', () => {
  it('L0 26.000, L 31.000, purchases 22.300 / 8.700, the calendar and the 100 € residual', () => {
    const { liq, totals, schedule } = planOnF();
    expect(liq.L0).toBeCloseTo(26000, 2);
    expect(liq.L).toBeCloseTo(31000, 2);
    expect(totals.pv).toBeCloseTo(22300, 2);
    expect(totals.px).toBeCloseTo(8700, 2);
    const rows = (id: string) => schedule.installments.map((i) => i.lines.find((l) => l.positionId === id)?.plannedQuantity ?? 0);
    expect(rows('pv')).toEqual([18, 19, 18, 19, 18, 19, 19, 18, 19, 18]);
    expect(rows('px')).toEqual([14, 15, 14, 15, 14, 15, 14, 15, 14, 15]);
    expect(schedule.residualEur).toBeCloseTo(100, 2);
  });

  it('without the sale netted out, the purchases would be 26.500 / 4.500', () => {
    const assets = byId(etfA(), etfB(), conto());
    const liq = computeUsableLiquidity(liquidity, assets, [sale()], 10, deps);
    const totals = computeTotalPurchases(resolvePositionStates(positions, assets, deps), liq.L);
    expect(totals.pv).toBeCloseTo(26500, 2);
    expect(totals.px).toBeCloseTo(4500, 2);
  });

  it('an executed sale no longer comes off the position (it already left the ledger)', () => {
    const states = resolvePositionStates(positions, byId(etfA(), etfB(100), conto()), deps, [sale({ status: 'executed' })]);
    expect(states[1].currentValueEur).toBeCloseTo(6000, 2);
  });

  it('proceedsOfDisposal: quantity × price, capped at the held shares, whole value when absent', () => {
    expect(proceedsOfDisposal(sale(), etfB(), deps)).toBe(6000);
    expect(proceedsOfDisposal(sale({ quantity: 500 }), etfB(), deps)).toBe(12000);
    expect(proceedsOfDisposal(sale({ quantity: undefined }), etfB(), deps)).toBe(12000);
  });
});

describe('«Rivedi il piano»', () => {
  function afterThreeRates() {
    const { plan } = planOnF();
    for (const installment of plan.installments.filter((i) => i.index <= 3)) {
      installment.lines.forEach((l) => { l.status = 'executed'; l.transactionIds = ['t']; });
    }
    plan.disposals = [sale({ status: 'executed' })];
    const assets = byId(etfA(155), etfB(143), conto(28320));
    return { plan, assets };
  }
  const revision = (plan: AccumulationPlan, overrides = {}) => ({
    monthlyInflowEur: 800, reserveEur: 10000, remainingMonths: 7, positions: plan.positions, disposals: [], ...overrides,
  });

  it('k = 4, L0 18.320, L 23.920, purchases 17.170 / 6.750, calendar, residual 40, months 10, one revision', () => {
    const { plan, assets } = afterThreeRates();
    const before = JSON.stringify(plan.installments.filter((i) => i.index <= 3));
    const result = buildRevisedPlan(plan, revision(plan), assets, deps, new Date('2026-12-01'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.firstIndex).toBe(4);
    expect(result.liquidity.L0).toBeCloseTo(18320, 2);
    expect(result.liquidity.L).toBeCloseTo(23920, 2);
    const revised = result.plan;
    expect(JSON.stringify(revised.installments.filter((i) => i.index <= 3))).toBe(before);
    expect(revised.installments.map((i) => i.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(revised.installments[3].month).toBe('2027-02');
    expect([4, 5, 6, 7, 8, 9, 10].map((i) => qty(revised, i, 'pv'))).toEqual([20, 20, 21, 20, 21, 20, 21]);
    expect([4, 5, 6, 7, 8, 9, 10].map((i) => qty(revised, i, 'px'))).toEqual([16, 16, 16, 16, 16, 16, 16]);
    expect(revised.residualEur).toBeCloseTo(40, 2);
    expect(revised.months).toBe(10);
    expect(revised.revisions).toHaveLength(1);
    expect(revised.revisions![0]).toMatchObject({ fromIndex: 4, before: { monthlyInflowEur: 500, months: 10 } });
  });

  it('10 months remaining → 13; 58 → months_range', () => {
    const { plan, assets } = afterThreeRates();
    const ok = buildRevisedPlan(plan, revision(plan, { remainingMonths: 10 }), assets, deps, new Date());
    expect(ok.ok && ok.plan.months).toBe(13);
    const bad = buildRevisedPlan(plan, revision(plan, { remainingMonths: 58 }), assets, deps, new Date());
    expect(bad).toEqual({ ok: false, issue: 'months_range' });
  });

  it('an installment with an executed line is not revised, k moves to the next', () => {
    const { plan, assets } = afterThreeRates();
    plan.installments[3].lines[0].status = 'executed';
    expect(findFirstIntactInstallment(plan)?.index).toBe(5);
    const result = buildRevisedPlan(plan, revision(plan, { remainingMonths: 6 }), assets, deps, new Date());
    expect(result.ok && result.firstIndex).toBe(5);
  });

  it('nothing to revise when every installment is touched', () => {
    const { plan, assets } = afterThreeRates();
    for (const i of plan.installments) i.lines.forEach((l) => { l.status = 'skipped'; });
    expect(buildRevisedPlan(plan, revision(plan), assets, deps, new Date())).toEqual({ ok: false, issue: 'nothing_to_revise' });
  });
});

describe('validation and seeding from the targeted sale', () => {
  const draft = (disposals: PlanDisposal[]) => ({
    name: 'P', startMonth: '2026-11', months: 10, liquidity, positions, disposals,
  });

  it('a total sale of a position member is refused; a fractional quantity too', () => {
    const assets = byId(etfA(), etfB(), conto());
    const total = validateDraftAgainstAssets(draft([sale({ quantity: undefined })]), assets);
    expect(total.some((i) => i.code === 'disposal_full_on_position')).toBe(true);
    const all = validateDraftAgainstAssets(draft([sale({ quantity: 200 })]), assets);
    expect(all.some((i) => i.code === 'disposal_full_on_position')).toBe(true);
    const frac = validateDraftAgainstAssets(draft([sale({ quantity: 2.5 })]), assets);
    expect(frac.some((i) => i.code === 'disposal_quantity')).toBe(true);
    const partial = validateDraftAgainstAssets(draft([sale()]), assets);
    expect(partial).toEqual([]);
  });
});

describe('the recalibration proposal', () => {
  it('absent when nothing moves, present when a line goes 18 → 17, quiet after «Lascia così»', () => {
    const { plan, assets } = planOnF();
    const calm = recalibrateInstallment(plan, 1, assets, deps);
    expect(shouldProposeRecalibration(calm)).toBe(false);

    // A price rise on ETF-A moves the first line down by a share.
    const moved = recalibrateInstallment(plan, 1, byId({ ...etfA(), currentPrice: 130 }, etfB(), conto()), deps);
    const changed = moved.lines.some((l) => Math.abs(l.suggestedQuantity - l.plannedQuantity) >= 1);
    expect(changed).toBe(true);
    expect(shouldProposeRecalibration(moved)).toBe(true);

    const dismissed = { quantities: recalibrationQuantities(moved) };
    expect(shouldProposeRecalibration(moved, dismissed)).toBe(false);

    const again = recalibrateInstallment(plan, 1, byId({ ...etfA(), currentPrice: 140 }, etfB(), conto()), deps);
    expect(shouldProposeRecalibration(again, dismissed)).toBe(true);
  });
});

import {
  describeClosedPlanDrift,
  describeClosedPlanInstallments,
  describeClosedPlanInvested,
  describeClosedPlanPeriod,
} from '@/lib/utils/accumulationNarrative';
import { selectClosedPlans, summarizeClosedPlan } from '@/lib/utils/accumuloSummary';
import { buildRegisteredLinePatch } from '@/lib/utils/accumulationPlanUtils';
import type { AssetAllocationTarget } from '@/types/assets';

describe('«Registra»', () => {
  it('links the line with the returned id, quantity and quantity × EUR price', () => {
    expect(buildRegisteredLinePatch('tx1', 18, 120)).toEqual({
      status: 'executed',
      transactionIds: ['tx1'],
      executedQuantity: 18,
      executedAmountEur: 2160,
    });
  });
});

describe('Piani conclusi', () => {
  it('reads 6 / 6, 24.000 € su 24.500 €, the period and the largest final drift', () => {
    const { plan } = planOnF();
    const closed: AccumulationPlan = {
      ...plan,
      status: 'completed',
      name: 'PAC',
      startMonth: '2026-01',
      months: 6,
      liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 10000, monthlyInflowEur: 500 },
      disposals: [],
      baseline: {
        capturedAt: new Date(0), positionValuesEur: {}, pricesEur: {}, sourceCashEur: 31500,
        measurement: { measuredAt: new Date(0), classNotionalEur: {}, marketBaseEur: 1 },
      },
      installments: Array.from({ length: 6 }, (_, k) => ({
        index: k + 1,
        month: `2026-0${k + 1}`,
        carryInEur: {},
        lines: [{ positionId: 'pv', assetId: 'etf-a', plannedQuantity: 1, priceEurAtPlan: 1, plannedAmountEur: 1, status: 'executed' as const, executedAmountEur: 24000 / 6 }],
        ...(k === 5 ? { measurement: { measuredAt: new Date(0), classNotionalEur: { equity: 60.6, bonds: 39.4 }, marketBaseEur: 100 } } : {}),
      })),
    };
    // 31.500 − 10.000 + 500 × 6 = 24.500
    const targets = { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } } as unknown as AssetAllocationTarget;
    const row = summarizeClosedPlan(closed, targets);
    expect(describeClosedPlanPeriod(row.startMonth, row.endMonth)).toBe('gen 2026 – giu 2026');
    expect(describeClosedPlanInstallments(row.closedCount, row.totalMonths, row.interrupted)).toBe('6 / 6');
    expect(describeClosedPlanInvested(row.investedEur, row.plannedEur)).toBe('24.000 € su 24.500 €');
    expect(describeClosedPlanDrift(row.finalDrift)).toBe('+0,6 pp su Azioni');
    expect(describeClosedPlanDrift(summarizeClosedPlan({ ...closed, installments: closed.installments.map((i) => ({ ...i, measurement: undefined })) }, targets).finalDrift)).toBe('—');
  });

  it('a cancelled plan reads «2 / 3 · interrotto»; the list is newest closure first', () => {
    expect(describeClosedPlanInstallments(2, 3, true)).toBe('2 / 3 · interrotto');
    const { plan } = planOnF();
    const a = { ...plan, id: 'a', status: 'completed' as const, closedAt: new Date('2026-01-01') };
    const b = { ...plan, id: 'b', status: 'cancelled' as const, closedAt: new Date('2026-06-01') };
    const open = { ...plan, id: 'c' };
    expect(selectClosedPlans([a, open, b]).map((p) => p.id)).toEqual(['b', 'a']);
  });
});

import { applyWeightsToPositions, marketWeights } from '@/lib/utils/accumulationPlanUtils';

describe('«Parti da»', () => {
  const weightMap = { 'etf-a': 60, 'etf-b': 40 };
  const ids = ['pv', 'px', 'pn'];
  const gen = () => ids.shift()!;
  const label = (id: string) => id.toUpperCase();

  it('a weight map ETF-A 60 / ETF-B 40 gives two positions at 60 and 40, even from empty seeds', () => {
    const seeded = applyWeightsToPositions([], weightMap, new Set(), label, gen);
    expect(seeded.map((p) => [p.buyAssetId, p.targetPercentage])).toEqual([['etf-a', 60], ['etf-b', 40]]);
  });

  it('seeds at 0 for held instruments are re-weighted; an instrument outside the map stays at 0', () => {
    const extra: PlanPosition = { id: 'pe', label: 'EXTRA', targetPercentage: 0, memberAssetIds: ['extra'], buyAssetId: 'extra' };
    const out = applyWeightsToPositions([...positions.map((p) => ({ ...p, targetPercentage: 0 })), extra], weightMap, new Set(), label);
    expect(out.map((p) => p.targetPercentage)).toEqual([60, 40, 0]);
  });

  it('«Pesi di oggi» on F gives 50 / 50 (before the sale)', () => {
    const weights = marketWeights([etfA(), etfB()], deps);
    expect(weights).toEqual({ 'etf-a': 50, 'etf-b': 50 });
    const thirds = marketWeights([etfA(100), etfB(100), makeAsset({ id: 'z', quantity: 100, currentPrice: 120 })], deps);
    expect(Object.values(thirds).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
  });

  it('a sold instrument never becomes a new position', () => {
    const out = applyWeightsToPositions([], { 'etf-a': 100 }, new Set(['etf-a']), label);
    expect(out).toEqual([]);
  });
});

// A month that only refills the reserve proposes no recalibration: the cash below the reserve is the
// plan working, not a price that moved (collaudo, 2026-11-17). Seen red with «La rata resta come pianificata».
describe('the recalibration proposal in a refill month', () => {
  const result = (refillMonths: number) =>
    ({
      index: 1,
      lines: [{ positionId: 'p', assetId: 'a', plannedQuantity: 0, suggestedQuantity: 0, priceEur: 100, suggestedAmountEur: 0 }],
      plannedTotalEur: 0,
      suggestedTotalEur: 0,
      liquidity: { sourceCashEur: 8000, availableNowEur: 0, disposalProceedsEur: 0, inflowTotalEur: 12000, L0: 0, L: 10000, belowReserve: true, shortfallEur: 2000, refillMonths },
    }) as Parameters<typeof shouldProposeRecalibration>[0];
  it('quiet while the reserve refills, as before otherwise', () => {
    expect(shouldProposeRecalibration(result(2))).toBe(false);
    expect(shouldProposeRecalibration(result(0))).toBe(true);
  });
});

// A closed plan's months and planned euros count only the months that buy (2026-11-17).
describe('summarizeClosedPlan after a refill', () => {
  it('two refill months: 1 / 2 instalments, the gap off the planned euros', () => {
    const plan = {
      id: 'c', userId: 'u', name: 'Piano', status: 'completed', startMonth: '2027-01', months: 4,
      liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 10000, monthlyInflowEur: 1000 },
      positions: [], disposals: [],
      baseline: { capturedAt: new Date(0), positionValuesEur: {}, pricesEur: {}, sourceCashEur: 8000 },
      installments: [
        { index: 1, month: '2027-01', lines: [], carryInEur: {} },
        { index: 2, month: '2027-02', lines: [], carryInEur: {} },
        { index: 3, month: '2027-03', lines: [{ positionId: 'p', assetId: 'a', plannedQuantity: 10, priceEurAtPlan: 100, plannedAmountEur: 1000, status: 'executed' as const, executedAmountEur: 1000 }], carryInEur: {} },
        { index: 4, month: '2027-04', lines: [{ positionId: 'p', assetId: 'a', plannedQuantity: 10, priceEurAtPlan: 100, plannedAmountEur: 1000, status: 'planned' as const }], carryInEur: {} },
      ],
      createdAt: new Date(0), updatedAt: new Date(0),
    } as unknown as Parameters<typeof summarizeClosedPlan>[0];
    const row = summarizeClosedPlan(plan, null);
    expect([row.closedCount, row.totalMonths]).toEqual([1, 2]);
    expect(row.plannedEur).toBe(2000);
  });
});
