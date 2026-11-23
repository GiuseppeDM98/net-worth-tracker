/**
 * The engine of «Rivedi il piano»: the line labels, the instruments with no shares, the source accounts and the
 * saved sales in a revision. Raggruppa, Separa and Sostituisci left with the editor (owner, 2026-11-19;
 * deleted 2026-11-21): a group comes from the model and is revised as one row. Invented names.
 */
import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AccumulationPlan, PlanDisposal, PlanLiquidity, PlanPosition } from '@/types/accumulationPlan';
import { unitPriceEur } from '@/lib/utils/costBasisEur';
import {
  buildRevisedPlan,
  computeTotalPurchases,
  computeUsableLiquidity,
  diffRevisionDisposals,
  installmentLineLabel,
  isOpenSavedDisposal,
  listAddableAssets,
  planMemberAssetIds,
  resolvePositionStates,
  scheduleInstallments,
  type PlanDeps,
} from '@/lib/utils/accumulationPlanUtils';

let seq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  seq += 1;
  return {
    id: `b${seq}`, userId: 'u1', ticker: 'X', name: 'X', type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 0, lastPriceUpdate: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    ...overrides,
  };
}

const deps: PlanDeps = { valueOf: (a) => a.quantity * unitPriceEur(a), priceOf: (a) => unitPriceEur(a) };
const byId = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, a]));

const etfA = (quantity = 100) => makeAsset({ id: 'etf-a', name: 'Mondo Azionario', ticker: 'ETFA', quantity, currentPrice: 120 });
const old = (quantity = 100) => makeAsset({ id: 'old', name: 'Trend Fenicottero', ticker: 'FNC', quantity, currentPrice: 50 });
// Created empty for a plan («+ Nuovo asset»): the flag «mai comprato» reads (owner, 2026-11-12).
const fresh = (quantity = 0) => makeAsset({ id: 'fresh', name: 'Trend Ornitorinco coperto', ticker: 'ORN', quantity, currentPrice: 60, createdEmpty: true });
const conto = (value = 30000) => makeAsset({ id: 'conto', name: 'Conto', type: 'cash', assetClass: 'cash', quantity: value, currentPrice: 1 });
const conto2 = (value = 5000) => makeAsset({ id: 'conto2', name: 'Conto 2', type: 'cash', assetClass: 'cash', quantity: value, currentPrice: 1 });

const positions: PlanPosition[] = [
  { id: 'pv', label: 'Mondo Azionario', targetPercentage: 82, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
  { id: 'po', label: 'Trend Fenicottero', targetPercentage: 18, memberAssetIds: ['old'], buyAssetId: 'old' },
];
const liquidity: PlanLiquidity = { sourceCashAssetIds: ['conto'], reserveEur: 10000, monthlyInflowEur: 500 };
const sale = (overrides: Partial<PlanDisposal> = {}): PlanDisposal => ({
  assetId: 'etf-a', quantity: 10, monthIndex: 1, estimatedProceedsEur: 1200, status: 'planned', ...overrides,
});

/** A 10-month plan whose first three rates are done (k = 4). */
function planAfterThreeRates(disposals: PlanDisposal[] = []) {
  const assets = byId(etfA(), old(), fresh(), conto());
  const liq = computeUsableLiquidity(liquidity, assets, disposals, 10, deps);
  const states = resolvePositionStates(positions, assets, deps, disposals);
  const schedule = scheduleInstallments(computeTotalPurchases(states, liq.L), states, 10, '2026-11');
  const plan: AccumulationPlan = {
    id: 'p', userId: 'u1', name: 'PAC', status: 'active', startMonth: '2026-11', months: 10, liquidity, positions,
    disposals, installments: schedule.installments, residualEur: schedule.residualEur,
    createdAt: new Date(0), updatedAt: new Date(0),
  };
  for (const installment of plan.installments.filter((i) => i.index <= 3)) {
    installment.lines.forEach((line) => { line.status = 'executed'; line.transactionIds = ['t']; });
  }
  return plan;
}

const revision = (plan: AccumulationPlan, overrides = {}) => ({
  monthlyInflowEur: 800, reserveEur: 10000, remainingMonths: 7, positions: plan.positions, disposals: [], ...overrides,
});

describe('installmentLineLabel', () => {
  it('uses the position label while the position still buys that instrument, else the instrument name, else the id', () => {
    const line = { positionId: 'po', assetId: 'old' };
    expect(installmentLineLabel(line, positions, () => 'Nome')).toBe('Trend Fenicottero');
    expect(installmentLineLabel({ positionId: 'gone', assetId: 'old' }, positions, () => 'Nome')).toBe('Nome');
    expect(installmentLineLabel({ positionId: 'gone', assetId: 'old' }, positions, () => undefined)).toBe('old');
  });
});

describe('instruments with no shares', () => {
  const all = [etfA(), old(), fresh(0), conto(), makeAsset({ id: 'sold', name: 'Venduto', quantity: 0, currentPrice: 10 }), makeAsset({ id: 'z', name: 'Zeta', quantity: 5, currentPrice: 10 }), makeAsset({ id: 'frz', name: 'Congelato', quantity: 5, currentPrice: 10, allocationRole: 'frozen' } as Partial<Asset>)];

  it('lists tradable instruments outside the draft, also at 0 shares: never bought first, held last', () => {
    const traded = new Set(['etf-a', 'old', 'sold', 'z']);
    const list = listAddableAssets(all, { positions: [positions[0]], disposals: [] }, traded);
    expect(list.map((e) => e.asset.id)).toEqual(['fresh', 'sold', 'old', 'z']);
    expect(list[0]).toMatchObject({ held: false, neverBought: true });
    expect(list[1]).toMatchObject({ held: false, neverBought: false });
  });

  it('a draft position, a sale and a cash account are left out', () => {
    const list = listAddableAssets(all, { positions: [positions[0]], disposals: [sale({ assetId: 'z' })] }, null);
    expect(list.map((e) => e.asset.id)).not.toContain('z');
    expect(list.map((e) => e.asset.id)).not.toContain('etf-a');
    expect(list.map((e) => e.asset.id)).not.toContain('conto');
  });

  it('with the Registro unread nothing is called never bought', () => {
    expect(listAddableAssets(all, { positions: [], disposals: [] }, null).every((e) => !e.neverBought)).toBe(true);
  });

  it('planMemberAssetIds: every member of every position, nothing for no plan', () => {
    const group: PlanPosition = { id: 'g', label: 'G', targetPercentage: 100, memberAssetIds: ['fresh', 'old'], buyAssetId: 'fresh' };
    expect([...planMemberAssetIds({ positions: [group] })].sort()).toEqual(['fresh', 'old']);
    expect(planMemberAssetIds(null).size).toBe(0);
  });
});

describe('source accounts and saved sales in a revision', () => {
  const assets = () => byId(etfA(155), old(100), fresh(), conto(28320), conto2(5000));

  it('a source account added in the revision counts in L: (28.320 + 5.000 − 10.000) + 800 × 7', () => {
    const plan = planAfterThreeRates();
    const result = buildRevisedPlan(plan, revision(plan, { sourceCashAssetIds: ['conto', 'conto2'] }), assets(), deps, new Date());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.liquidity.L0).toBeCloseTo(23320, 2);
    expect(result.liquidity.L).toBeCloseTo(28920, 2);
    expect(result.plan.liquidity.sourceCashAssetIds).toEqual(['conto', 'conto2']);
  });

  it('without sourceCashAssetIds the plan\'s own accounts stay', () => {
    const plan = planAfterThreeRates();
    const result = buildRevisedPlan(plan, revision(plan), assets(), deps, new Date());
    expect(result.ok && result.plan.liquidity.sourceCashAssetIds).toEqual(['conto']);
  });

  it('a saved sale not yet executed can come off: its proceeds leave L and the asset can be sold again as a new sale', () => {
    const plan = planAfterThreeRates([sale()]);
    const kept = buildRevisedPlan(plan, revision(plan), assets(), deps, new Date());
    const removed = buildRevisedPlan(plan, revision(plan, { removedDisposalAssetIds: ['etf-a'] }), assets(), deps, new Date());
    expect(kept.ok && kept.liquidity.L0).toBeCloseTo(18320 + 1200, 2);
    expect(removed.ok && removed.liquidity.L0).toBeCloseTo(18320, 2);
    expect(removed.ok && removed.plan.disposals).toEqual([]);
    const again = buildRevisedPlan(plan, revision(plan, { removedDisposalAssetIds: ['etf-a'], disposals: [sale({ quantity: 20, estimatedProceedsEur: 0 })] }), assets(), deps, new Date());
    expect(again.ok && again.plan.disposals).toEqual([expect.objectContaining({ assetId: 'etf-a', quantity: 20, monthIndex: 4 })]);
  });

  it('without removing it, selling the same instrument again is still a duplicate', () => {
    const plan = planAfterThreeRates([sale()]);
    const result = buildRevisedPlan(plan, revision(plan, { disposals: [sale({ quantity: 20 })] }), assets(), deps, new Date());
    expect(result).toEqual({ ok: false, issue: 'duplicate_asset', assetId: 'etf-a' });
  });

  it('a saved sale can move to a month ≥ k and ≤ the last; outside it the revision is refused', () => {
    const plan = planAfterThreeRates([sale()]);
    const moved = buildRevisedPlan(plan, revision(plan, { movedDisposalMonthIndexes: { 'etf-a': 6 } }), assets(), deps, new Date());
    expect(moved.ok && moved.plan.disposals[0]).toMatchObject({ assetId: 'etf-a', monthIndex: 6, status: 'planned' });
    for (const bad of [2, 11]) {
      const refused = buildRevisedPlan(plan, revision(plan, { movedDisposalMonthIndexes: { 'etf-a': bad } }), assets(), deps, new Date());
      expect(refused).toEqual({ ok: false, issue: 'sale_month_range' });
    }
  });

  it('an executed sale stays as it is: neither removed nor moved', () => {
    const executed = sale({ status: 'executed', transactionIds: ['s1'], executedAmountEur: 1190 });
    const plan = planAfterThreeRates([executed]);
    const result = buildRevisedPlan(plan, revision(plan, { removedDisposalAssetIds: ['etf-a'], movedDisposalMonthIndexes: { 'etf-a': 6 } }), assets(), deps, new Date());
    expect(result.ok && result.plan.disposals).toEqual([executed]);
  });

  it('isOpenSavedDisposal: planned and unlinked only', () => {
    expect(isOpenSavedDisposal(sale())).toBe(true);
    expect(isOpenSavedDisposal(sale({ status: 'executed' }))).toBe(false);
    expect(isOpenSavedDisposal(sale({ status: 'skipped' }))).toBe(false);
    expect(isOpenSavedDisposal(sale({ transactionIds: ['t'] }))).toBe(false);
  });

  it('diffRevisionDisposals: new, removed, changed shares (removed + new) and moved', () => {
    const saved = [sale(), sale({ assetId: 'old', quantity: 5 }), sale({ assetId: 'fresh', quantity: 3 }), sale({ assetId: 'zzz', status: 'executed' })];
    const draft = [
      sale({ assetId: 'old', quantity: 5, monthIndex: 6 }),
      sale({ assetId: 'fresh', quantity: 4 }),
      sale({ assetId: 'new', quantity: 1 }),
    ];
    const diff = diffRevisionDisposals({ disposals: saved }, draft);
    expect(diff.removedDisposalAssetIds.sort()).toEqual(['etf-a', 'fresh']);
    expect(diff.newDisposals.map((d) => d.assetId).sort()).toEqual(['fresh', 'new']);
    expect(diff.movedDisposalMonthIndexes).toEqual({ old: 6 });
  });

  // The swap (owner, 2026-11-20): a swap added, removed or redirected on an open sale is a changed sale, like
  // its shares. Mutation that turns it red: the swap left out of the comparison.
  it('diffRevisionDisposals: a changed swap is removed + new', () => {
    const saved = [sale({ assetId: 'x', reinvestAssetId: 'btp' }), sale({ assetId: 'y' }), sale({ assetId: 'z', reinvestAssetId: 'btp' })];
    const draft = [sale({ assetId: 'x', reinvestAssetId: 'btp' }), sale({ assetId: 'y', reinvestAssetId: 'btp' }), sale({ assetId: 'z' })];
    const diff = diffRevisionDisposals({ disposals: saved }, draft);
    expect(diff.removedDisposalAssetIds.sort()).toEqual(['y', 'z']);
    expect(diff.newDisposals.map((d) => [d.assetId, d.reinvestAssetId])).toEqual([['y', 'btp'], ['z', undefined]]);
  });
});
