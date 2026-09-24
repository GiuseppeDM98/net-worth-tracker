/**
 * Tests for lib/utils/allocazioneSummary.ts — the numbers of Allocazione: what each tile
 * reads from the banded AllocationResult, the plans and the exposure payload. The domain rules
 * (band, roles, plans) stay in allocationUtils; this layer only derives what the page shows.
 */

import { describe, expect, it, vi } from 'vitest';

// `leverageAwareAllocationUtils` reaches the client SDK through the asset display helpers; mocked away as in every `*Narrative.test.ts`.
vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import {
  activeClassGaps,
  buildCompositionLegend,
  buildCompositionPair,
  buildPensionLookThrough,
  buildPlanView,
  collapseRepeatedLevels,
  estimatePlanSaleTax,
  isDormantClass,
  largestGapByValue,
  offTargetGaps,
  planSaleNodes,
  summarizeClassGaps,
  summarizeExposure,
  summarizeExposureHighlights,
  summarizeHoldings,
  summarizeNextMoney,
  untargetedClassLabels,
  MIN_VISIBLE_AMOUNT,
} from '@/lib/utils/allocazioneSummary';
import type { AllocationData, Asset } from '@/types/assets';
import type { PortfolioExposureData } from '@/types/exposure';
import { buildHoldings, sumTradableByClass, type AllocatableHolding, type PlanNode } from '@/lib/utils/allocationUtils';

function data({ currentValue, targetPercentage, ...rest }: Partial<AllocationData> & { currentValue: number; targetPercentage: number }): AllocationData {
  const total = 245000;
  const currentPercentage = (currentValue / total) * 100;
  const difference = currentPercentage - targetPercentage;
  return {
    currentPercentage,
    currentValue,
    targetPercentage,
    targetValue: (targetPercentage / 100) * total,
    difference,
    differenceValue: currentValue - (targetPercentage / 100) * total,
    action: Math.abs(difference) > 2 ? (difference > 0 ? 'VENDI' : 'COMPRA') : 'OK',
    ...rest,
  };
}

const BY_CLASS: Record<string, AllocationData> = {
  crypto: data({ currentValue: 11750, targetPercentage: 5 }),
  equity: data({ currentValue: 143000, targetPercentage: 55 }),
  bonds: data({ currentValue: 53500, targetPercentage: 25 }),
  cash: data({ currentValue: 23800, targetPercentage: 10 }),
  commodity: data({ currentValue: 12950, targetPercentage: 5 }),
};

const holding = (overrides: Partial<AllocatableHolding>): AllocatableHolding => ({
  id: 'h',
  label: 'Holding',
  assetClass: 'equity',
  value: 1000,
  tradable: true,
  taxableOnSale: true,
  ...overrides,
});

describe('summarizeClassGaps', () => {
  it('orders classes by the app-wide sequence and carries the rounded figures', () => {
    const gaps = summarizeClassGaps(BY_CLASS);
    expect(gaps.map((g) => g.assetClass)).toEqual(['equity', 'bonds', 'crypto', 'cash', 'commodity']);
    expect(gaps[0]).toMatchObject({ label: 'Azioni', action: 'VENDI', differenceValue: 8250 });
    expect(gaps[0].differencePp).toBeCloseTo(3.4, 1);
  });

  it('finds the largest gap by euro and the off-target ones by points', () => {
    const gaps = summarizeClassGaps(BY_CLASS);
    expect(largestGapByValue(gaps)?.assetClass).toBe('equity');
    expect(offTargetGaps(gaps).map((g) => g.assetClass)).toEqual(['equity', 'bonds']);
    expect(largestGapByValue([])).toBeNull();
  });
});

describe('isDormantClass / activeClassGaps', () => {
  // The owner's real estate: the house is `excluded`, so the class holds nothing inside the
  // allocated total, and its target entry is 0% — it cannot be off target, so «OK» would be a
  // verdict on a void and it must not inflate the «N classi su M» denominator.
  const dormant = data({ currentValue: 0, targetPercentage: 0 });

  it('marks a class with neither allocated value nor a target', () => {
    expect(isDormantClass(dormant)).toBe(true);
  });

  it('does not mark a class that holds money, even with no target', () => {
    expect(isDormantClass(data({ currentValue: 60000, targetPercentage: 0 }))).toBe(false);
  });

  it('does not mark an unfunded target — new money is exactly how that one gets filled', () => {
    expect(isDormantClass(data({ currentValue: 0, targetPercentage: 15 }))).toBe(false);
  });

  it('drops only the dormant classes from the ones a verdict may speak about', () => {
    const gaps = summarizeClassGaps({ ...BY_CLASS, realestate: dormant, carry: dormant });
    expect(gaps).toHaveLength(7);
    expect(gaps.filter((g) => g.dormant).map((g) => g.assetClass)).toEqual(['realestate', 'carry']);
    expect(activeClassGaps(gaps).map((g) => g.assetClass)).toEqual(['equity', 'bonds', 'crypto', 'cash', 'commodity']);
  });
});

describe('buildCompositionPair', () => {
  it('draws the current mix on the notional total and the target on the effective percentages of the comparison', () => {
    const pair = buildCompositionPair(BY_CLASS, 245000, false);
    expect(pair.current[0]).toMatchObject({ key: 'equity', label: 'Azioni', chartIndex: 0 });
    expect(pair.current[0].pct).toBeCloseTo(58.4, 1);
    expect(pair.current.reduce((s, seg) => s + seg.pct, 0)).toBeCloseTo(100, 5);
    expect(pair.target.map((s) => [s.key, s.pct])).toEqual([
      ['equity', 55],
      ['bonds', 25],
      ['cash', 10],
      ['crypto', 5],
      ['commodity', 5],
    ]);
  });

  it('keeps the leveraged percentage as the label under leverage and skips empty targets', () => {
    const leveraged = { equity: { ...BY_CLASS.equity, currentPercentage: 87.5, targetPercentage: 150 }, bonds: data({ currentValue: 0, targetPercentage: 0 }) };
    const pair = buildCompositionPair(leveraged, 143000, true);
    expect(pair.current[0].pct).toBeCloseTo(100, 5);
    expect(pair.current[0].displayPct).toBe(87.5);
    expect(pair.target).toEqual([{ key: 'equity', label: 'Azioni', pct: 100, displayPct: 150, chartIndex: 0 }]);
  });
});

describe('buildCompositionLegend', () => {
  it('keeps the current order, appends target-only classes and leaves a gap where a side is missing', () => {
    // A targeted class that is not held reaches the pair as a comparison row at 0 (compareAllocations iterates the targets).
    const pair = buildCompositionPair({ equity: BY_CLASS.equity, crypto: { ...BY_CLASS.crypto, targetPercentage: 0 }, bonds: data({ currentValue: 0, targetPercentage: 45 }) }, 154750, false);
    const legend = buildCompositionLegend(pair);
    expect(legend.map((e) => [e.key, e.current === null ? null : Math.round(e.current), e.target])).toEqual([
      ['equity', 92, 55],
      ['crypto', 8, null],
      ['bonds', null, 45],
    ]);
    expect(legend[2].chartIndex).toBe(1);
  });
});

describe('buildPlanView / summarizeNextMoney', () => {
  const holdings = [
    holding({ id: 'e1', label: 'iShares World', ticker: 'IWDA', assetClass: 'equity', value: 143000 }),
    holding({ id: 'b1', label: 'Fondo Cometa', assetClass: 'bonds', value: 42000, tradable: false }),
    holding({ id: 'b2', label: 'Euro Govt', ticker: 'IBGL', assetClass: 'bonds', value: 11500 }),
    holding({ id: 'c1', label: 'Conto deposito', assetClass: 'cash', value: 23800 }),
    holding({ id: 'k1', label: 'Gold', ticker: 'SGLD', assetClass: 'commodity', value: 12950 }),
    holding({ id: 'x1', label: 'Bitcoin', assetClass: 'crypto', value: 11750 }),
  ];
  const inputs = { byAssetClass: BY_CLASS, bySubCategory: {}, bySpecificAsset: {}, holdings, tradableByClass: { equity: 143000, bonds: 11500, cash: 23800, commodity: 12950, crypto: 11750 } };

  it('builds the rebalance view from the banded moves', () => {
    const view = buildPlanView('rebalance', 0, inputs);
    expect(view.mode).toBe('rebalance');
    if (view.mode !== 'rebalance') throw new Error('mode');
    expect(view.moves.map((m) => [m.assetClass, m.action])).toEqual([
      ['equity', 'VENDI'],
      ['bonds', 'COMPRA'],
    ]);
    expect(view.trades).toBeNull();
  });

  it('breaks a rebalance SELL down to the instruments, summing back to the class amount', () => {
    const view = buildPlanView('rebalance', 0, inputs);
    if (view.mode !== 'rebalance') throw new Error('mode');
    const equity = view.moves.find((m) => m.assetClass === 'equity')!;
    const leaves = equity.children.flatMap((child) => (child.children.length > 0 ? child.children : [child]));
    expect(leaves.map((leaf) => leaf.key)).toEqual(['e1']);
    expect(leaves.reduce((sum, leaf) => sum + leaf.amount, 0)).toBeCloseTo(equity.amount, 2);
  });

  it('breaks a rebalance BUY down exactly as far as Versa does — no further', () => {
    // With no sub-targets configured, a contribution has no bucket to descend into, and the
    // rebalance reuses that very split: «ONE tree with the sign flipped» means the BUY leg of a
    // rebalance names what Versa would name for the same euros, including when that is nothing.
    const withoutSubs = buildPlanView('rebalance', 0, inputs);
    if (withoutSubs.mode !== 'rebalance') throw new Error('mode');
    expect(withoutSubs.moves.find((m) => m.assetClass === 'bonds')!.children).toEqual([]);

    const bySubCategory = { 'bonds:Governativi': data({ currentValue: 11500, targetPercentage: 100 }) };
    const classified = inputs.holdings.map((h) => (h.assetClass === 'bonds' ? { ...h, subCategory: 'Governativi' } : h));
    const withSubs = buildPlanView('rebalance', 0, { ...inputs, bySubCategory, holdings: classified });
    if (withSubs.mode !== 'rebalance') throw new Error('mode');
    const bonds = withSubs.moves.find((m) => m.assetClass === 'bonds')!;
    // «Governativi» receives the whole move and holds one instrument, so its level is a repetition
    // and `collapseRepeatedLevels` drops it: what is left is the instrument you would trade.
    expect(bonds.children.map((child) => child.key)).toEqual(['b2']);
    expect(bonds.children.reduce((sum, leg) => sum + leg.amount, 0)).toBeCloseTo(bonds.amount, 2);
    // The frozen Cometa sleeve is never a leg of the BUY: a plan may not name what it cannot move.
    expect(bonds.children.every((leg) => leg.key !== 'b1')).toBe(true);
  });

  it('builds the contribution view and names the classes over target that get nothing', () => {
    const view = buildPlanView('contribute', 1000, inputs);
    if (view.mode !== 'contribute') throw new Error('mode');
    expect(view.nodes.map((n) => n.key)).toEqual(['bonds', 'cash', 'crypto']);
    expect(view.nodes.reduce((sum, n) => sum + n.amount, 0)).toBeCloseTo(1000, 5);
    expect(view.overTarget).toEqual(['Azioni']);
    expect(view.nodes.every((n) => n.amount >= MIN_VISIBLE_AMOUNT)).toBe(true);
  });

  it('builds the withdrawal view with the tradable total and the overflow flag', () => {
    const view = buildPlanView('withdraw', 1000, inputs);
    if (view.mode !== 'withdraw') throw new Error('mode');
    expect(view.tradableTotal).toBe(203000);
    expect(view.exceedsPortfolio).toBe(false);
    expect(view.nodes[0].key).toBe('equity');
    expect(buildPlanView('withdraw', 300000, inputs)).toMatchObject({ exceedsPortfolio: true });
  });

  it('summarizes the next money as class slices, largest first', () => {
    const next = summarizeNextMoney(inputs, 1000);
    expect(next.amount).toBe(1000);
    expect(next.slices.map((s) => s.key)).toEqual(['bonds', 'cash', 'crypto']);
    expect(next.slices[0]).toMatchObject({ label: 'Obbligazioni', kind: 'class' });
    expect(summarizeNextMoney(inputs, 0).slices).toEqual([]);
  });
});

describe('collapseRepeatedLevels', () => {
  const node = (key: string, amount: number, children: PlanNode[] = []): PlanNode => ({
    key,
    label: key,
    amount,
    currentValue: 0,
    newValue: 0,
    newPercentage: 0,
    targetPercentage: 0,
    children,
  });

  // The callers hand it the children of a class, never the class itself: a class row carries the
  // chip, the drift and the action, and is never a repetition of anything.
  it('drops a level whose only child carries the same figure, keeping the CHILD', () => {
    // «Bitcoin −4151 €» over «WisdomTree Physical Bitcoin (WBIT) −4151 €»: the instrument is the
    // row you can act on, and its sub-category is still named in Per classe.
    const rows = collapseRepeatedLevels([node('Bitcoin', 4151, [node('WBIT', 4151)])]);
    expect(rows.map((row) => row.key)).toEqual(['WBIT']);
    expect(rows[0].children).toEqual([]);
  });

  it('keeps a level that really splits', () => {
    // «All World» carries the whole class move, but it has TWO instruments under it: dropping it
    // would leave two rows with no idea which sleeve they belong to.
    const rows = collapseRepeatedLevels([node('All World', 22409, [node('VWCE', 17428), node('SWDA', 4981)])]);
    expect(rows.map((row) => row.key)).toEqual(['All World']);
    expect(rows[0].children.map((child) => child.key)).toEqual(['VWCE', 'SWDA']);
  });

  it('collapses a level whose only child carries the same figure, however deep the chain', () => {
    const rows = collapseRepeatedLevels([node('DBMFE', 12006, [node('iMGP DBi (DBMFE)', 12006)])]);
    expect(rows.map((row) => row.key)).toEqual(['iMGP DBi (DBMFE)']);
  });

  it('keeps a level whose only child carries a DIFFERENT figure', () => {
    // The sleeve gets 3000 of a 5000 move: the two rows are two facts, not one printed twice.
    const rows = collapseRepeatedLevels([node('Governativi', 5000, [node('IBGS', 3000)])]);
    expect(rows.map((row) => row.key)).toEqual(['Governativi']);
    expect(rows[0].children.map((child) => child.key)).toEqual(['IBGS']);
  });

  it('ignores children below the visible floor when counting them', () => {
    const rows = collapseRepeatedLevels([node('Breve Termine', 3975, [node('CSBGE3', 3975), node('briciola', 0.2)])]);
    expect(rows.map((row) => row.key)).toEqual(['CSBGE3']);
  });

  it('carries the lifted node`s own kind, so a collapsed instrument stays an instrument', () => {
    // A row's caption follows `isInstrument`, not its depth: an ETF lifted out of the sub-category
    // that repeated it would otherwise print «→ 100,0%» — «you keep everything» — instead of the
    // position it leaves behind.
    const instrument = { ...node('CSBGE3', 3975), isInstrument: true };
    const [row] = collapseRepeatedLevels([node('Breve Termine', 3975, [instrument])]);
    expect(row.isInstrument).toBe(true);
    const [sleeve] = collapseRepeatedLevels([node('Breve Termine', 3975, [node('senza strumenti', 3975)])]);
    expect(sleeve.isInstrument).toBeUndefined();
  });
});

describe('il prelievo si lorda: «prelevare 1000 €» vuol dire 1000 € in mano', () => {
  // Una posizione da 100.000 € comprata a 60.000: il 40% di quel che vale è plusvalenza, quindi
  // ogni euro venduto ne porta 0,40 di guadagno e paga 0,104 di ritenuta al 26%.
  const gainer = holding({ id: 'g', label: 'Gainer', assetClass: 'equity', value: 100000, costBasisEur: 60000, taxRate: 26 });
  const byClass: Record<string, AllocationData> = { equity: data({ currentValue: 100000, targetPercentage: 50 }) };
  const inputs = { byAssetClass: byClass, bySubCategory: {}, bySpecificAsset: {}, holdings: [gainer], tradableByClass: { equity: 100000 } };

  const withdraw = (amount: number, overrides = {}) => {
    const view = buildPlanView('withdraw', amount, { ...inputs, ...overrides });
    if (view.mode !== 'withdraw') throw new Error('mode');
    return view;
  };

  it('vende più di quanto chiesto, e quel che resta dopo la ritenuta è la cifra chiesta', () => {
    const view = withdraw(1000);
    expect(view.amount).toBe(1000);
    expect(view.grossedUp).toBe(true);
    expect(view.grossAmount).toBeGreaterThan(1000);
    // La proprietà che conta: lordo − ritenuta sul lordo === il netto chiesto, al euro.
    const tax = estimatePlanSaleTax(planSaleNodes(view), [gainer])!.tax!;
    expect(view.grossAmount - tax).toBeCloseTo(1000, 0);
    // …e le righe sommano il LORDO, perché è quello che il piano vende davvero.
    expect(view.nodes.reduce((sum, node) => sum + node.amount, 0)).toBeCloseTo(view.grossAmount, 2);
  });

  it('non si lorda quando le posizioni da vendere non sono in guadagno', () => {
    const loser = holding({ id: 'g', label: 'Loser', assetClass: 'equity', value: 100000, costBasisEur: 140000, taxRate: 26 });
    const view = withdraw(1000, { holdings: [loser] });
    expect(view.grossedUp).toBe(false);
    expect(view.grossAmount).toBeCloseTo(1000, 2);
  });

  it('non si lorda quando la ritenuta non è stimabile, e non promette un netto', () => {
    const unknown = holding({ id: 'g', label: 'Senza base', assetClass: 'equity', value: 100000, taxRate: 26 });
    const view = withdraw(1000, { holdings: [unknown] });
    expect(view.grossedUp).toBe(false);
    expect(view.grossAmount).toBeCloseTo(1000, 2);
    expect(estimatePlanSaleTax(planSaleNodes(view), [unknown])!.unknownReason).toBe('cost-basis');
  });

  it('non vende mai più del negoziabile, e lo dichiara', () => {
    const small = holding({ id: 'g', label: 'Gainer', assetClass: 'equity', value: 1020, costBasisEur: 0, taxRate: 26 });
    const view = withdraw(1000, {
      holdings: [small],
      byAssetClass: { equity: data({ currentValue: 1020, targetPercentage: 0 }) },
      tradableByClass: { equity: 1020 },
    });
    // Servirebbero ~1352 € di vendite per incassarne 1000 netti; ce ne sono 1020.
    expect(view.grossAmount).toBeLessThanOrEqual(1020);
    expect(view.exceedsPortfolio).toBe(true);
  });

  it('un versamento non si lorda: non vende niente', () => {
    const view = buildPlanView('contribute', 1000, inputs);
    if (view.mode !== 'contribute') throw new Error('mode');
    expect(view.nodes.reduce((sum, node) => sum + node.amount, 0)).toBeCloseTo(1000, 2);
  });
});

describe('buildPlanView under leverage: the engine trades as the class → instrument tree', () => {
  // A real leveraged portfolio through the REAL engine and the REAL `buildHoldings`, because what
  // is under test is the wiring: engine trade → sleeves → class tree → withholding.
  //   VWCE  40.000 € equity 1×, bought for 30.000 (25% of its value is gain)
  //   CL2   10.000 € equity 2×
  //   NTSG  30.000 € 60% equity / 40% bonds at 1,5× — ONE order, two classes
  //   IBGL  20.000 € bonds 1×, at a loss
  // Market 100.000 €; notional equity 40 + 20 + 27 = 87.000, bonds 20 + 18 = 38.000 (1,25×).
  const leveragedAsset = (overrides: Partial<Asset>): Asset => ({
    id: 'x', userId: 'u1', ticker: 'X', name: 'X', type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 1, currentPrice: 1000, taxRate: 26,
    lastPriceUpdate: new Date(0), createdAt: new Date(0), updatedAt: new Date(0),
    ...overrides,
  });
  const vwce = leveragedAsset({ id: 'vwce', ticker: 'VWCE', name: 'Vanguard All-World', currentPrice: 40000, averageCost: 30000 });
  const cl2 = leveragedAsset({ id: 'cl2', ticker: 'CL2', name: 'Amundi MSCI USA 2x', currentPrice: 10000, averageCost: 8000, leverageRatio: 2 });
  const ntsg = leveragedAsset({
    id: 'ntsg', ticker: 'NTSG', name: 'WisdomTree Efficient Core', currentPrice: 30000, averageCost: 20000, leverageRatio: 1.5,
    composition: [{ assetClass: 'equity', percentage: 60 }, { assetClass: 'bonds', percentage: 40 }],
  });
  const ibgl = leveragedAsset({ id: 'ibgl', ticker: 'IBGL', name: 'iShares Euro Govt', assetClass: 'bonds', currentPrice: 20000, averageCost: 21000, taxRate: 12.5 });

  const leveragedInputs = (assets: Asset[], targets: Record<string, number>) => {
    const notional: Record<string, number> = {};
    for (const asset of assets) {
      const legs = asset.composition ?? [{ assetClass: asset.assetClass, percentage: 100 }];
      for (const leg of legs) notional[leg.assetClass] = (notional[leg.assetClass] ?? 0) + (asset.currentPrice * leg.percentage * (asset.leverageRatio ?? 1)) / 100;
    }
    const market = assets.reduce((sum, asset) => sum + asset.currentPrice, 0);
    const notionalTotal = Object.values(notional).reduce((sum, value) => sum + value, 0);
    const byAssetClass: Record<string, AllocationData> = {};
    for (const [assetClass, targetPercentage] of Object.entries(targets)) {
      const currentValue = notional[assetClass] ?? 0;
      const currentPercentage = (currentValue / market) * 100;
      byAssetClass[assetClass] = {
        currentValue, currentPercentage, targetPercentage, targetValue: (targetPercentage / 100) * market,
        difference: currentPercentage - targetPercentage, differenceValue: currentValue - (targetPercentage / 100) * market,
        action: Math.abs(currentPercentage - targetPercentage) > 2 ? (currentPercentage > targetPercentage ? 'VENDI' : 'COMPRA') : 'OK',
      };
    }
    const holdings = buildHoldings(assets, (asset) => asset.quantity * asset.currentPrice);
    return {
      byAssetClass,
      bySubCategory: {},
      bySpecificAsset: {},
      holdings,
      tradableByClass: sumTradableByClass(holdings),
      leverage: {
        tradableAssets: assets,
        currentNotionalByAssetClass: notional,
        currentNotionalTotal: notionalTotal,
        currentMarketTotal: market,
        targetPercentageByAssetClass: targets,
        targetLeverageRatio: Object.values(targets).reduce((sum, value) => sum + value, 0) / 100,
      },
    };
  };
  const portfolio = [vwce, cl2, ntsg, ibgl];
  const leaves = (nodes: PlanNode[]): PlanNode[] => nodes.flatMap((node) => (node.children.length > 0 ? leaves(node.children) : [node]));
  const sum = (items: { amount: number }[]) => items.reduce((total, item) => total + Math.abs(item.amount), 0);

  it('draws a contribution as classes with their sleeves, adding up to the engine orders', () => {
    const inputs = leveragedInputs(portfolio, { equity: 95, bonds: 45 });
    const view = buildPlanView('contribute', 10000, inputs);
    if (view.mode !== 'contribute') throw new Error('mode');

    expect(view.trades!.length).toBeGreaterThan(0); // the reading and the verdict still name the orders
    expect(view.nodes.length).toBeGreaterThan(0);
    for (const node of view.nodes) {
      expect(Object.keys(inputs.byAssetClass)).toContain(node.key);
      expect(sum(node.children)).toBeCloseTo(node.amount, 6);
      expect(node.children.every((child) => child.isInstrument)).toBe(true);
    }
    // Every euro of every order lands in exactly one sleeve.
    expect(sum(view.nodes)).toBeCloseTo(sum(view.trades!), 6);
  });

  it('splits a composite order across its classes by composition, naming the whole order on each sleeve', () => {
    // Bonds far under target and equity over it: the engine can only buy, and NTSG is the one
    // instrument that moves bonds by more than a euro per euro.
    const view = buildPlanView('contribute', 10000, leveragedInputs(portfolio, { equity: 87, bonds: 60 }));
    if (view.mode !== 'contribute') throw new Error('mode');
    const order = view.trades!.find((trade) => trade.assetId === 'ntsg');
    expect(order).toBeDefined();

    const sleeves = leaves(view.nodes).filter((leaf) => leaf.key.startsWith('ntsg:'));
    expect(sleeves.map((sleeve) => sleeve.key).sort()).toEqual(['ntsg:0', 'ntsg:1']);
    const equitySleeve = view.nodes.find((node) => node.key === 'equity')!.children.find((child) => child.key === 'ntsg:0')!;
    const bondSleeve = view.nodes.find((node) => node.key === 'bonds')!.children.find((child) => child.key === 'ntsg:1')!;
    expect(equitySleeve.amount).toBeCloseTo(order!.amount * 0.6, 6);
    expect(bondSleeve.amount).toBeCloseTo(order!.amount * 0.4, 6);
    expect(equitySleeve.order!.amount).toBeCloseTo(order!.amount, 6);
    expect(bondSleeve.order).toEqual({ amount: equitySleeve.order!.amount, label: 'NTSG' });
    // A plain instrument is its own order: no «parte di un ordine» under it.
    expect(leaves(view.nodes).filter((leaf) => !leaf.key.includes(':')).every((leaf) => leaf.order === undefined)).toBe(true);
  });

  it("prints a class's resulting share where the ENGINE leaves it, notional on the post-trade market", () => {
    const view = buildPlanView('contribute', 10000, leveragedInputs(portfolio, { equity: 87, bonds: 60 }));
    if (view.mode !== 'contribute') throw new Error('mode');
    const bonds = view.nodes.find((node) => node.key === 'bonds')!;
    // Rebuild it from the orders: bonds move by 1× per IBGL euro and 0,4 × 1,5 per NTSG euro.
    const bought = (id: string) => view.trades!.find((trade) => trade.assetId === id)?.amount ?? 0;
    const notionalAfter = 38000 + bought('ibgl') + bought('ntsg') * 0.4 * 1.5;
    expect(bonds.newPercentage).toBeCloseTo((notionalAfter / 110000) * 100, 6);
  });

  it('grosses a withdrawal up like the class plan: what is left after the withholding is the request', () => {
    const inputs = leveragedInputs(portfolio, { equity: 80, bonds: 45 });
    const view = buildPlanView('withdraw', 5000, inputs);
    if (view.mode !== 'withdraw') throw new Error('mode');

    expect(view.grossedUp).toBe(true);
    const tax = estimatePlanSaleTax(planSaleNodes(view), inputs.holdings)!.tax!;
    expect(tax).toBeGreaterThan(0);
    // Within the fixed point's own stop (`GROSS_UP_TOLERANCE`, a euro), as on the class plan.
    expect(Math.abs(view.grossAmount - tax - 5000)).toBeLessThan(1);
    // The rows and the engine's orders both add up to the GROSS, the figure the head names.
    expect(sum(view.nodes)).toBeCloseTo(view.grossAmount, 0);
    expect(sum(view.trades!)).toBeCloseTo(view.grossAmount, 0);
  });

  it('does not gross up, and promises no net, when a sold instrument has no cost basis', () => {
    // No equity instrument carries a basis, so whichever the engine drains (it prefers CL2, which
    // takes two euros of equity exposure out per euro sold) the estimate cannot stand.
    const noBasis = [vwce, cl2, ntsg].map((asset) => ({ ...asset, averageCost: undefined }));
    const inputs = leveragedInputs([...noBasis, ibgl], { equity: 80, bonds: 45 });
    const view = buildPlanView('withdraw', 5000, inputs);
    if (view.mode !== 'withdraw') throw new Error('mode');
    const estimate = estimatePlanSaleTax(planSaleNodes(view), inputs.holdings)!;
    expect(leaves(view.nodes).some((leaf) => ['vwce', 'cl2', 'ntsg:0', 'ntsg:1'].includes(leaf.key))).toBe(true);
    expect(estimate.unknownReason).toBe('cost-basis');
    expect(view.grossedUp).toBe(false);
    expect(view.grossAmount).toBeCloseTo(5000, 2);
  });

  it('gives a rebalance that swaps inside one class TWO moves, one per action, and prices the sell', () => {
    // Same mix, more leverage: equity notional must rise by ~20.000 € at zero net cash — the only
    // way is to sell the 1× equity and buy the 2× one.
    const vwce50 = { ...vwce, currentPrice: 50000, averageCost: 40000 };
    const ibgl40 = { ...ibgl, currentPrice: 40000, averageCost: 40000 };
    const inputs = leveragedInputs([vwce50, cl2, ibgl40], { equity: 90, bonds: 40 });
    const view = buildPlanView('rebalance', 0, inputs);
    if (view.mode !== 'rebalance') throw new Error('mode');

    const sellEquity = view.moves.find((move) => move.assetClass === 'equity' && move.action === 'VENDI');
    const buyEquity = view.moves.find((move) => move.assetClass === 'equity' && move.action === 'COMPRA');
    expect(sellEquity?.children.map((child) => child.key)).toEqual(['vwce']);
    expect(buyEquity?.children.map((child) => child.key)).toEqual(['cl2']);
    // The moves partition the orders: no euro is netted away between the two rows of a class.
    const sells = view.trades!.filter((trade) => trade.amount < 0);
    const buys = view.trades!.filter((trade) => trade.amount > 0);
    expect(sum(view.moves.filter((move) => move.action === 'VENDI'))).toBeCloseTo(sum(sells), 6);
    expect(sum(view.moves.filter((move) => move.action === 'COMPRA'))).toBeCloseTo(sum(buys), 6);
    // The sell leg is now something the withholding can read: 20% of VWCE's value is gain.
    const estimate = estimatePlanSaleTax(planSaleNodes(view), inputs.holdings)!;
    expect(estimate.tax).toBeCloseTo(sellEquity!.amount * 0.2 * 0.26, 6);
  });
});

describe('estimatePlanSaleTax / planSaleNodes', () => {
  // A €10.000 position bought for €6.000: 40% of what it is worth is gain, so selling €1.000 of it
  // realizes €400 and the broker withholds 26% of that — €104.
  const gainer = holding({ id: 'g', label: 'Gainer', value: 10000, costBasisEur: 6000, taxRate: 26 });
  const loser = holding({ id: 'l', label: 'Loser', value: 5000, costBasisEur: 8000, taxRate: 26 });
  const account = holding({ id: 'acct', label: 'Conto', assetClass: 'cash', value: 20000, taxableOnSale: false });
  const leaf = (key: string, amount: number) => ({ key, label: key, amount, currentValue: 0, newValue: 0, newPercentage: 0, targetPercentage: 0, children: [] });

  it('taxes the realized fraction of the unrealized gain, at the instrument rate', () => {
    const estimate = estimatePlanSaleTax([leaf('g', 1000)], [gainer])!;
    expect(estimate.gross).toBe(1000);
    expect(estimate.tax).toBeCloseTo(104, 6);
    expect(estimate.net).toBeCloseTo(896, 6);
    expect(estimate.unknownReason).toBeNull();
  });

  // REGRESSION GUARD, not a guard on the caller: falsifying `estimatePlanSaleTax`'s own
  // `Math.max(0, gainFraction)` leaves this green, because `estimateSaleTax` already floors a
  // negative gain at zero. What this pins is that floor — remove it there and the losing leg
  // starts paying a NEGATIVE tax, i.e. silently compensating the gain the app does not model.
  it('taxes nothing on a position at a loss, and does not net the loss against a gain', () => {
    const estimate = estimatePlanSaleTax([leaf('g', 1000), leaf('l', 1000)], [gainer, loser])!;
    expect(estimate.tax).toBeCloseTo(104, 6);
  });

  it('leaves cash out without making the estimate unknown', () => {
    const estimate = estimatePlanSaleTax([leaf('g', 1000), leaf('acct', 5000)], [gainer, account])!;
    expect(estimate.gross).toBe(6000);
    expect(estimate.tax).toBeCloseTo(104, 6);
  });

  it('is unknown WITH a reason when a taxable leg has no EUR cost basis', () => {
    const noBasis = holding({ id: 'g', value: 10000, taxRate: 26 });
    const estimate = estimatePlanSaleTax([leaf('g', 1000)], [noBasis])!;
    expect(estimate.tax).toBeNull();
    expect(estimate.net).toBeNull();
    expect(estimate.unknownReason).toBe('cost-basis');
  });

  it('is unknown WITH a reason when a taxable leg has no rate', () => {
    const noRate = holding({ id: 'g', value: 10000, costBasisEur: 6000 });
    expect(estimatePlanSaleTax([leaf('g', 1000)], [noRate])!.unknownReason).toBe('rate');
  });

  it('is null when the plan sells nothing', () => {
    expect(estimatePlanSaleTax([], [gainer])).toBeNull();
    expect(estimatePlanSaleTax([leaf('g', 0.2)], [gainer])).toBeNull();
  });

  it('reads the SELL legs of a rebalance and every leg of a withdrawal', () => {
    const rebalance = buildPlanView('rebalance', 0, { byAssetClass: BY_CLASS, bySubCategory: {}, bySpecificAsset: {}, holdings: [], tradableByClass: {} });
    expect(planSaleNodes(rebalance)).toEqual([]);
    const contribute = buildPlanView('contribute', 1000, { byAssetClass: BY_CLASS, bySubCategory: {}, bySpecificAsset: {}, holdings: [], tradableByClass: {} });
    // A contribution never sells, so it has no tax to estimate at all.
    expect(planSaleNodes(contribute)).toEqual([]);
  });
});

describe('untargetedClassLabels', () => {
  it('names the held classes the targets do not mention, in the app order', () => {
    const held = [holding({ assetClass: 'realestate', value: 250000 }), holding({ assetClass: 'cash', value: 8000 }), holding({ assetClass: 'equity', value: 100 }), holding({ assetClass: 'carry', value: 0 })];
    expect(untargetedClassLabels(held, BY_CLASS)).toEqual(['Immobili']);
    expect(untargetedClassLabels(held, { equity: BY_CLASS.equity })).toEqual(['Immobili', 'Liquidità']);
  });
});

describe('summarizeHoldings', () => {
  it('counts, sums and sorts the holdings largest first', () => {
    const group = summarizeHoldings([holding({ id: 'a', value: 100 }), holding({ id: 'b', value: 900 })]);
    expect(group).toMatchObject({ count: 2, total: 1000 });
    expect(group.holdings.map((h) => h.id)).toEqual(['b', 'a']);
    expect(summarizeHoldings([])).toEqual({ count: 0, total: 0, holdings: [], rows: [] });
    expect(group.rows.map((r) => Math.round(r.sharePct ?? -1))).toEqual([90, 10]);
  });

  it('counts a composite asset once, however many legs it has', () => {
    const legs = [holding({ id: 'fund:0', value: 29400 }), holding({ id: 'fund:1', value: 12600 }), holding({ id: 'house', value: 180000 })];
    expect(summarizeHoldings(legs)).toMatchObject({ count: 2, total: 222000 });
  });
});

describe('summarizeExposure', () => {
  const exposure: PortfolioExposureData = {
    topHoldings: [
      { symbol: 'AAPL', name: 'Apple', exposureEur: 10045, exposurePct: 0.041, sources: [{ assetName: 'A', ticker: 'IWDA', contributionEur: 5000, holdingPct: 0.05 }, { assetName: 'B', ticker: 'CSPX', contributionEur: 5045, holdingPct: 0.07 }] },
      { symbol: 'MSFT', name: 'Microsoft', exposureEur: 9310, exposurePct: 0.038, sources: [] },
      { symbol: 'NVDA', name: 'Nvidia', exposureEur: 8575, exposurePct: 0.035, sources: [] },
    ],
    sectors: [
      { key: 'technology', label: 'Tecnologia', exposureEur: 59535, exposurePct: 0.243, sources: [] },
      { key: 'financial', label: 'Finanza', exposureEur: 30000, exposurePct: 0.122, sources: [] },
    ],
    issuers: [
      { family: 'iShares', exposureEur: 100000, exposurePct: 0.408, assets: [] },
      { family: 'Vanguard', exposureEur: 64000, exposurePct: 0.261, assets: [] },
    ],
    totalAnalyzedValue: 164000,
    totalPortfolioValue: 245000,
    analyzedAssets: 12,
    totalAssets: 16,
    computedAt: '2026-08-24T06:15:00.000Z',
    cacheKey: 'k',
  };

  it('turns a view into ranked rows in percent of the portfolio, closed by a residual', () => {
    const view = summarizeExposure(exposure, 'holdings', 2);
    expect(view.rows.map((r) => [r.key, r.amount, r.percentage])).toEqual([
      ['AAPL', 10045, 4.1],
      ['MSFT', 9310, 3.8],
    ]);
    expect(view.remainder).toEqual({ label: 'Resto del portafoglio', amount: 245000 - 10045 - 9310, percentage: 92.1 });
    expect(summarizeExposure(exposure, 'sectors', 5).rows[0]).toMatchObject({ key: 'technology', label: 'Tecnologia' });
    expect(summarizeExposure(exposure, 'issuers', 5).remainder?.label).toBe('Resto del portafoglio');
  });

  it('has no residual when the rows cover the portfolio, and keeps drill-down sources', () => {
    const view = summarizeExposure({ ...exposure, topHoldings: [{ symbol: 'ALL', name: 'Tutto', exposureEur: 245000, exposurePct: 1, sources: [] }] }, 'holdings', 5);
    expect(view.remainder).toBeNull();
    expect(summarizeExposure(exposure, 'holdings', 5).rows[0].sources).toHaveLength(2);
  });

  it('extracts the highlights the reading names, with the issuer share of the ETFs', () => {
    expect(summarizeExposureHighlights(exposure)).toEqual({
      topHolding: { name: 'Apple', pct: 4.1, sourceCount: 2 },
      topSector: { label: 'Tecnologia', pct: 24.3 },
      topIssuer: { family: 'iShares', etfShare: 61 },
    });
    expect(summarizeExposureHighlights({ ...exposure, topHoldings: [], sectors: [], issuers: [] })).toEqual({ topHolding: null, topSector: null, topIssuer: null });
  });
});

describe('buildPensionLookThrough', () => {
  const asset = (overrides: Partial<Asset>): Asset => ({ id: 'x', userId: 'u', name: 'X', type: 'etf', assetClass: 'equity', quantity: 1, currentPrice: 1, ...overrides } as Asset);
  const fund = asset({ id: 'f', name: 'Cometa', type: 'pensionFund', assetClass: 'bonds', quantity: 42000, allocationRole: 'frozen', composition: [{ assetClass: 'bonds', percentage: 70 }, { assetClass: 'equity', percentage: 30 }] } as Partial<Asset>);
  const house = asset({ id: 'h', name: 'Casa', type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 180000, allocationRole: 'excluded' } as Partial<Asset>);
  const etf = asset({ id: 'e', name: 'World', quantity: 100, currentPrice: 1428.35 });
  const valueOf = (a: Asset) => a.quantity * a.currentPrice;

  it('is null without a pension fund', () => {
    expect(buildPensionLookThrough([etf, house], valueOf)).toBeNull();
  });

  it('splits the fund by its composition and the whole wealth by class', () => {
    const look = buildPensionLookThrough([fund, house, etf], valueOf);
    expect(look).not.toBeNull();
    expect(look!.fundCount).toBe(1);
    expect(look!.fundValue).toBe(42000);
    expect(look!.fundSlices.map((s) => [s.assetClass, s.value, Math.round(s.percentage)])).toEqual([
      ['bonds', 29400, 70],
      ['equity', 12600, 30],
    ]);
    expect(look!.combinedTotal).toBeCloseTo(364835, 2);
    expect(look!.combinedSlices[0].assetClass).toBe('realestate');
    expect(look!.hasExcluded).toBe(true);
    expect(look!.allFrozen).toBe(true);
  });
});
