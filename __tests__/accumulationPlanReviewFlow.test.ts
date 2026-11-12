/**
 * AL8–AL11 — «Rivedi il piano» completo (doc/allineamento/README.md § 9.2): Raggruppa, Separa and
 * Sostituisci in a revision, the instruments with no shares, the source accounts and the saved sales.
 * The proof case is the owner's PAC (a DBMFE + MFEH group at 18%, MFEH buys) with invented names.
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
  groupPositions,
  installmentLineLabel,
  isOpenSavedDisposal,
  listAddableAssets,
  planMemberAssetIds,
  replaceBuyAsset,
  resolvePositionStates,
  scheduleInstallments,
  separatePosition,
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
const nameOf = (assets: Map<string, Asset>) => (id: string) => assets.get(id)?.name ?? id;

const vwce = (quantity = 100) => makeAsset({ id: 'vwce', name: 'Mondo Azionario', ticker: 'VWCE', quantity, currentPrice: 120 });
const old = (quantity = 138) => makeAsset({ id: 'old', name: 'Trend Fenicottero', ticker: 'FNC', quantity, currentPrice: 50 });
const fresh = (quantity = 0) => makeAsset({ id: 'fresh', name: 'Trend Ornitorinco coperto', ticker: 'ORN', quantity, currentPrice: 60 });
const conto = (value = 30000) => makeAsset({ id: 'conto', name: 'Conto', type: 'cash', assetClass: 'cash', quantity: value, currentPrice: 1 });
const conto2 = (value = 5000) => makeAsset({ id: 'conto2', name: 'Conto 2', type: 'cash', assetClass: 'cash', quantity: value, currentPrice: 1 });

const positions: PlanPosition[] = [
  { id: 'pv', label: 'Mondo Azionario', targetPercentage: 82, memberAssetIds: ['vwce'], buyAssetId: 'vwce' },
  { id: 'po', label: 'Trend Fenicottero', targetPercentage: 18, memberAssetIds: ['old'], buyAssetId: 'old' },
];
const liquidity: PlanLiquidity = { sourceCashAssetIds: ['conto'], reserveEur: 10000, monthlyInflowEur: 500 };
const sale = (overrides: Partial<PlanDisposal> = {}): PlanDisposal => ({
  assetId: 'vwce', quantity: 10, monthIndex: 1, estimatedProceedsEur: 1200, status: 'planned', ...overrides,
});

/** A 10-month plan whose first three rates are done (k = 4). */
function planAfterThreeRates(disposals: PlanDisposal[] = []) {
  const assets = byId(vwce(), old(), fresh(), conto());
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

describe('AL8 — Raggruppa and Separa', () => {
  it('a group takes the id of the position that buys and the sum of the weights', () => {
    const grouped = groupPositions(positions, new Set(['vwce', 'old']), 'old', nameOf(byId(vwce(), old())), () => 'new-id');
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toEqual({ id: 'po', label: 'Trend Fenicottero', targetPercentage: 100, memberAssetIds: ['old', 'vwce'], buyAssetId: 'old' });
  });

  it('fewer than two singletons, or a buyer outside the selection, change nothing', () => {
    expect(groupPositions(positions, new Set(['vwce']), 'vwce', nameOf(byId()))).toBe(positions);
    expect(groupPositions(positions, new Set(['vwce', 'old']), 'fresh', nameOf(byId()))).toBe(positions);
  });

  it('Separa splits the weight by value and the buyer keeps the group id', () => {
    const group: PlanPosition[] = [{ id: 'g', label: 'G', targetPercentage: 18, memberAssetIds: ['fresh', 'old'], buyAssetId: 'fresh' }];
    const assets = byId(old(), fresh());
    const split = separatePosition(group, 'g', (id) => (assets.get(id) ? deps.valueOf(assets.get(id)!) : 0), nameOf(assets), () => 'x');
    expect(split.map((p) => [p.id, p.memberAssetIds[0], p.targetPercentage])).toEqual([['g', 'fresh', 0], ['x', 'old', 18]]);
  });

  it('a group created in a revision leaves the rates closed before k deepEqual and rewrites from k', () => {
    const plan = planAfterThreeRates();
    const assets = byId(vwce(155), old(138), fresh(), conto(28320));
    const closedBefore = JSON.parse(JSON.stringify(plan.installments.filter((i) => i.index <= 3)));
    const grouped = groupPositions(plan.positions, new Set(['vwce', 'old']), 'vwce', nameOf(assets));
    const result = buildRevisedPlan(plan, revision(plan, { positions: grouped }), assets, deps, new Date('2026-12-01'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.firstIndex).toBe(4);
    expect(result.plan.installments.filter((i) => i.index <= 3)).toEqual(closedBefore);
    const fromK = result.plan.installments.filter((i) => i.index >= 4);
    expect(fromK).toHaveLength(7);
    // One position buys now: every revised line names the buyer of the group.
    expect(new Set(fromK.flatMap((i) => i.lines.map((l) => l.assetId)))).toEqual(new Set(['vwce']));
    expect(result.plan.positions).toHaveLength(1);
  });
});

describe('AL9 — Sostituisci (the owner\'s case)', () => {
  it('a singleton becomes the group [new, old], new buys, same weight, a new id', () => {
    const assets = byId(old(), fresh());
    const replaced = replaceBuyAsset(positions, 'po', 'fresh', nameOf(assets), () => 'g1');
    expect(replaced).not.toBeNull();
    expect(replaced![1]).toEqual({ id: 'g1', label: 'Trend Ornitorinco coperto', targetPercentage: 18, memberAssetIds: ['fresh', 'old'], buyAssetId: 'fresh' });
    expect(replaced![0]).toBe(positions[0]);
  });

  it('on a group it changes the member that buys; an instrument already elsewhere is refused', () => {
    const group: PlanPosition[] = [
      { id: 'g', label: 'G', targetPercentage: 18, memberAssetIds: ['fresh', 'old'], buyAssetId: 'fresh' },
      positions[0],
    ];
    const assets = byId(old(), fresh());
    const back = replaceBuyAsset(group, 'g', 'old', nameOf(assets), () => 'g2');
    expect(back![0]).toMatchObject({ id: 'g2', memberAssetIds: ['old', 'fresh'], buyAssetId: 'old' });
    expect(replaceBuyAsset(group, 'g', 'vwce', nameOf(assets))).toBeNull();
    expect(replaceBuyAsset(group, 'g', 'fresh', nameOf(assets))).toBe(group);
    expect(replaceBuyAsset(group, 'missing', 'fresh', nameOf(assets))).toBeNull();
  });

  it('Separa undoes it: the weight goes back to the old instrument (the new one has no value)', () => {
    const assets = byId(old(), fresh());
    const replaced = replaceBuyAsset(positions, 'po', 'fresh', nameOf(assets), () => 'g1')!;
    const split = separatePosition(replaced, 'g1', (id) => deps.valueOf(assets.get(id)!), nameOf(assets), () => 'z');
    expect(split.map((p) => [p.memberAssetIds[0], p.targetPercentage])).toEqual([['vwce', 82], ['fresh', 0], ['old', 18]]);
  });

  it('revision of 16/10: the 138 shares stay, the new instrument buys, the closed rates stay readable', () => {
    const plan = planAfterThreeRates();
    const assets = byId(vwce(155), old(138), fresh(0), conto(28320));
    const replaced = replaceBuyAsset(plan.positions, 'po', 'fresh', nameOf(assets), () => 'g1')!;
    const closedBefore = JSON.parse(JSON.stringify(plan.installments.filter((i) => i.index <= 3)));
    const result = buildRevisedPlan(plan, revision(plan, { positions: replaced }), assets, deps, new Date('2026-12-01'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const plan2 = result.plan;
    expect(plan2.installments.filter((i) => i.index <= 3)).toEqual(closedBefore);
    const revisedBuyers = new Set(plan2.installments.filter((i) => i.index >= 4).flatMap((i) => i.lines.map((l) => l.assetId)));
    expect(revisedBuyers).toEqual(new Set(['vwce', 'fresh']));
    expect(revisedBuyers.has('old')).toBe(false);
    // The 138 shares are in the position's value: the group is 18% of the base, the 6.900 € held count.
    const line = plan2.installments[3].lines.find((l) => l.assetId === 'fresh')!;
    expect(line.priceEurAtPlan).toBe(60);
    // A closed line of the old buyer keeps its instrument's name, not the id.
    const oldLine = plan2.installments[0].lines.find((l) => l.assetId === 'old')!;
    expect(installmentLineLabel(oldLine, plan2.positions, nameOf(assets))).toBe('Trend Fenicottero');
    expect(installmentLineLabel(line, plan2.positions, nameOf(assets))).toBe('Trend Ornitorinco coperto');
  });
});

describe('installmentLineLabel', () => {
  it('uses the position label while the position still buys that instrument, else the instrument name, else the id', () => {
    const line = { positionId: 'po', assetId: 'old' };
    expect(installmentLineLabel(line, positions, () => 'Nome')).toBe('Trend Fenicottero');
    expect(installmentLineLabel({ positionId: 'gone', assetId: 'old' }, positions, () => 'Nome')).toBe('Nome');
    expect(installmentLineLabel({ positionId: 'gone', assetId: 'old' }, positions, () => undefined)).toBe('old');
  });
});

describe('AL10 — instruments with no shares', () => {
  const all = [vwce(), old(), fresh(0), conto(), makeAsset({ id: 'sold', name: 'Venduto', quantity: 0, currentPrice: 10 }), makeAsset({ id: 'z', name: 'Zeta', quantity: 5, currentPrice: 10 }), makeAsset({ id: 'frz', name: 'Congelato', quantity: 5, currentPrice: 10, allocationRole: 'frozen' } as Partial<Asset>)];

  it('lists tradable instruments outside the draft, also at 0 shares: never bought first, held last', () => {
    const traded = new Set(['vwce', 'old', 'sold', 'z']);
    const list = listAddableAssets(all, { positions: [positions[0]], disposals: [] }, traded);
    expect(list.map((e) => e.asset.id)).toEqual(['fresh', 'sold', 'old', 'z']);
    expect(list[0]).toMatchObject({ held: false, neverBought: true });
    expect(list[1]).toMatchObject({ held: false, neverBought: false });
  });

  it('a draft position, a sale and a cash account are left out; the group\'s own members can be let through', () => {
    const list = listAddableAssets(all, { positions: [positions[0]], disposals: [sale({ assetId: 'z' })] }, null);
    expect(list.map((e) => e.asset.id)).not.toContain('z');
    expect(list.map((e) => e.asset.id)).not.toContain('vwce');
    expect(list.map((e) => e.asset.id)).not.toContain('conto');
    const withMember = listAddableAssets(all, { positions: [positions[0]], disposals: [] }, null, new Set(['vwce']));
    expect(withMember.map((e) => e.asset.id)).toContain('vwce');
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

describe('AL11 — source accounts and saved sales in a revision', () => {
  const assets = () => byId(vwce(155), old(138), fresh(), conto(28320), conto2(5000));

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
    const removed = buildRevisedPlan(plan, revision(plan, { removedDisposalAssetIds: ['vwce'] }), assets(), deps, new Date());
    expect(kept.ok && kept.liquidity.L0).toBeCloseTo(18320 + 1200, 2);
    expect(removed.ok && removed.liquidity.L0).toBeCloseTo(18320, 2);
    expect(removed.ok && removed.plan.disposals).toEqual([]);
    const again = buildRevisedPlan(plan, revision(plan, { removedDisposalAssetIds: ['vwce'], disposals: [sale({ quantity: 20, estimatedProceedsEur: 0 })] }), assets(), deps, new Date());
    expect(again.ok && again.plan.disposals).toEqual([expect.objectContaining({ assetId: 'vwce', quantity: 20, monthIndex: 4 })]);
  });

  it('without removing it, selling the same instrument again is still a duplicate', () => {
    const plan = planAfterThreeRates([sale()]);
    const result = buildRevisedPlan(plan, revision(plan, { disposals: [sale({ quantity: 20 })] }), assets(), deps, new Date());
    expect(result).toEqual({ ok: false, issue: 'duplicate_asset', assetId: 'vwce' });
  });

  it('a saved sale can move to a month ≥ k and ≤ the last; outside it the revision is refused', () => {
    const plan = planAfterThreeRates([sale()]);
    const moved = buildRevisedPlan(plan, revision(plan, { movedDisposalMonthIndexes: { vwce: 6 } }), assets(), deps, new Date());
    expect(moved.ok && moved.plan.disposals[0]).toMatchObject({ assetId: 'vwce', monthIndex: 6, status: 'planned' });
    for (const bad of [2, 11]) {
      const refused = buildRevisedPlan(plan, revision(plan, { movedDisposalMonthIndexes: { vwce: bad } }), assets(), deps, new Date());
      expect(refused).toEqual({ ok: false, issue: 'sale_month_range' });
    }
  });

  it('an executed sale stays as it is: neither removed nor moved', () => {
    const executed = sale({ status: 'executed', transactionIds: ['s1'], executedAmountEur: 1190 });
    const plan = planAfterThreeRates([executed]);
    const result = buildRevisedPlan(plan, revision(plan, { removedDisposalAssetIds: ['vwce'], movedDisposalMonthIndexes: { vwce: 6 } }), assets(), deps, new Date());
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
    expect(diff.removedDisposalAssetIds.sort()).toEqual(['fresh', 'vwce']);
    expect(diff.newDisposals.map((d) => d.assetId).sort()).toEqual(['fresh', 'new']);
    expect(diff.movedDisposalMonthIndexes).toEqual({ old: 6 });
  });
});
