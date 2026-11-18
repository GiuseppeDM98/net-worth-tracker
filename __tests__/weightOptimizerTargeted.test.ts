/**
 * The weight optimizer's third mode, «Con vendite mirate»: the same objective under a tax cap in euro and
 * the «Non vendere» locks. Every fixture is invented and round (base 100.000 €, rates 26% and 12,5%);
 * the assertions are properties — the cap holds after rounding, the bounds hold, nothing locked is sold —
 * never a figure read off a run.
 */
import { describe, it, expect } from 'vitest';
import type { Asset, AssetAllocationTarget, AssetClass, IdealAllocationSettings } from '@/types/assets';
import type { AllocatableHolding } from '@/lib/utils/allocationUtils';
import {
  optimizeWeights,
  runOptimizer,
  targetedRawSolution,
  DEFAULT_IDEAL_ALLOCATION,
  LIQUIDITY_CANDIDATE_KEY,
  type OptimizerCandidate,
  type OptimizerInput,
  type OptimizerResult,
} from '@/lib/utils/weightOptimizer';
import { describeTargetedSaleTotal } from '@/lib/utils/weightOptimizerNarrative';

// ---------------------------------------------------------------------------
// An invented portfolio: gains, a loss, a zero gain and an unknown basis
// ---------------------------------------------------------------------------

type Row = [
  label: string,
  valueEur: number,
  gainEur: number | null,
  exposure: Partial<Record<AssetClass, number>>,
  factor: Partial<Record<AssetClass, Record<string, number>>>,
];

const B = 100000;
// label, value €, unrealized gain € (null = no EUR basis), exposure, factor
const FIXTURE: Row[] = [
  ['ALFA', 30000, 6000, { equity: 1 }, { equity: { Market: 1 } }],
  ['BETA', 20000, 2000, { equity: 1 }, { equity: { Momentum: 1 } }],
  ['GAMMA', 15000, -1000, { equity: 1 }, { equity: { 'Small Cap Value': 1 } }],
  ['DELTA', 15000, 1500, { bonds: 1 }, {}], // rate 12,5
  ['EPSILON', 10000, 0, { commodity: 1 }, {}],
  ['ZETA', 5000, null, { trendFollowing: 1 }, {}], // unknown basis: locked
  ['ETA', 5000, 500, { equity: 2 }, { equity: { Market: 2 } }],
];

const rateOf = (label: string) => (label === 'DELTA' ? 12.5 : 26);

const TARGETS = {
  equity: {
    targetPercentage: 60,
    subCategoryConfig: { enabled: true, categories: ['Market', 'Momentum', 'Small Cap Value'] },
    subTargets: { Market: 80, Momentum: 20, 'Small Cap Value': 0 },
  },
  bonds: { targetPercentage: 25 },
  commodity: { targetPercentage: 10 },
  trendFollowing: { targetPercentage: 5 },
} as unknown as AssetAllocationTarget;

const SETTINGS: IdealAllocationSettings = {
  ...DEFAULT_IDEAL_ALLOCATION,
  enabled: true,
  classPriority: 'essential',
  leveragePriority: 'high',
  factorObjectives: [{ assetClass: 'equity', priority: 'high' }],
};

function candidates(overrides: Record<string, Partial<OptimizerCandidate>> = {}): OptimizerCandidate[] {
  return FIXTURE.map(([key, value, gain, exposure, factor]) => ({
    key,
    assetIds: [key],
    buyAssetId: key,
    label: key,
    currentValueEur: value,
    exposurePerEuro: exposure,
    factorPerEuro: factor,
    fixedValueEur: 0,
    lowerPct: 0,
    upperPct: 100,
    taxPerEuroSold: gain === null ? null : (rateOf(key) / 100) * Math.max(0, gain / value),
    ...overrides[key],
  }));
}

function input(overrides: Partial<OptimizerInput> = {}): OptimizerInput {
  return {
    candidates: candidates(),
    baseEur: B,
    targets: TARGETS,
    settings: SETTINGS,
    mode: 'targeted',
    targetLeverageRatio: 1,
    ...overrides,
  };
}

function targeted(taxCapEur: number, lockedKeys: string[] = [], overrides: Partial<OptimizerInput> = {}): OptimizerResult {
  return optimizeWeights(input({ sale: { taxCapEur, lockedKeys }, ...overrides }));
}

const weightOf = (result: OptimizerResult, key: string) => result.weights.find((w) => w.key === key)!;
const saleOf = (result: OptimizerResult, key: string) => result.sale!.perCandidate.find((p) => p.key === key)!;
const sumPct = (result: OptimizerResult) => result.weights.reduce((s, w) => s + w.proposedPct, 0);
/** What the rounded weights pay, recomputed here from the candidates — never read back from the report. */
const taxOfWeights = (result: OptimizerResult, list: OptimizerCandidate[]) =>
  list.reduce((sum, c) => {
    const w = weightOf(result, c.key);
    return sum + (c.taxPerEuroSold ?? 0) * Math.max(0, ((w.currentPct - w.proposedPct) / 100) * B);
  }, 0);

// ---------------------------------------------------------------------------
// The same objective against the other two modes
// ---------------------------------------------------------------------------

describe('optimizeWeights — mode targeted against Ideale and Raggiungibile', () => {
  it('should give Ideale’s weights, with the cap not binding, when the cap is high enough', () => {
    const result = targeted(100000);
    // ZETA has no basis: Ideale is compared with the same floor at its held weight.
    const ideal = optimizeWeights(input({ mode: 'ideal', candidates: candidates({ ZETA: { lowerPct: 5 } }) }));
    expect(result.weights.map((w) => w.proposedPct)).toEqual(ideal.weights.map((w) => w.proposedPct));
    expect(result.sale!.capBinding).toBe(false);
  });

  it('should give Raggiungibile’s weights and no tax at cap 0 when nothing sells at zero tax', () => {
    const tiny = { taxPerEuroSold: 0.001 };
    const list = candidates({ GAMMA: tiny, EPSILON: tiny });
    const result = optimizeWeights(input({ candidates: list, sale: { taxCapEur: 0, lockedKeys: [] } }));
    const reachable = optimizeWeights(
      input({ mode: 'reachable', candidates: list.map((c) => ({ ...c, lowerPct: (c.currentValueEur / B) * 100 })) })
    );
    result.weights.forEach((w, i) => expect(Math.abs(w.proposedPct - reachable.weights[i].proposedPct)).toBeLessThanOrEqual(0.5 + 1e-9));
    expect(result.sale!.taxEur).toBe(0);
    expect(result.sale!.soldEur).toBe(0);
  });

  it('should ignore `sale` entirely in the other two modes', () => {
    for (const mode of ['ideal', 'reachable'] as const) {
      const without = optimizeWeights(input({ mode }));
      const withSale = optimizeWeights(input({ mode, sale: { taxCapEur: 0, lockedKeys: ['ALFA'] } }));
      expect(withSale).toEqual(without);
      expect(withSale.sale).toBeUndefined();
    }
  });

  it('should be deterministic bit for bit', () => {
    expect(JSON.stringify(targeted(300, ['BETA']))).toBe(JSON.stringify(targeted(300, ['BETA'])));
  });
});

// ---------------------------------------------------------------------------
// The cap
// ---------------------------------------------------------------------------

describe('optimizeWeights — mode targeted, the cap', () => {
  it('should keep the rounded weights’ tax within max(cap, forced tax) at caps 0, 200, 500 and 2.000 €', () => {
    for (const locks of [[], ['BETA']]) {
      for (const cap of [0, 200, 500, 2000]) {
        const result = targeted(cap, locks);
        const bound = Math.max(cap, result.sale!.minTaxEur) + 0.01;
        expect(result.sale!.taxEur, `cap ${cap} locks ${locks.join('+')}`).toBeLessThanOrEqual(bound);
        expect(taxOfWeights(result, candidates()), `recomputed, cap ${cap}`).toBeLessThanOrEqual(bound);
      }
    }
  });

  it('should keep the tax under the cap and the objective falling as the cap grows, before rounding', () => {
    let prevTax = -Infinity;
    let prevJ = Infinity;
    for (let cap = 0; cap <= 2000; cap += 50) {
      const raw = targetedRawSolution(input({ sale: { taxCapEur: cap, lockedKeys: [] } }))!;
      expect(raw.taxEur, `tax at cap ${cap}`).toBeGreaterThanOrEqual(prevTax - 1e-6);
      expect(raw.taxEur, `tax ≤ cap ${cap}`).toBeLessThanOrEqual(cap + 1e-6);
      expect(raw.objectiveValue, `J at cap ${cap}`).toBeLessThanOrEqual(prevJ * (1 + 1e-9));
      prevTax = raw.taxEur;
      prevJ = raw.objectiveValue;
    }
  });

  it('should stay within the cap when the exact search is cut short (the fallback)', () => {
    // A max of 10% on DELTA, held at 15%: 5.000 € must go, at 0,0125 € per € = 62,50 €, under the 100 € cap.
    // A max on ALFA proves nothing here: cut short, the search still lands under the cap, so the old
    // fallback that kept its weights stayed green; on DELTA it kept 192,50 € of tax.
    const forced = input({ candidates: candidates({ DELTA: { upperPct: 10 } }), sale: { taxCapEur: 100, lockedKeys: [] } });
    const result = optimizeWeights(forced, { maxIterations: 1 });
    expect(result.status).toBe('ok');
    expect(result.converged).toBe(false);
    expect(result.warnings).toContainEqual({ code: 'not_converged' });
    expect(result.sale!.taxEur).toBeLessThanOrEqual(Math.max(100, result.sale!.minTaxEur) + 0.01);
    expect(taxOfWeights(result, forced.candidates)).toBeLessThanOrEqual(Math.max(100, result.sale!.minTaxEur) + 0.01);
  });

  it('should make the forced tax the cap, and say so, when the limits force a tax above it', () => {
    // ALFA from 30% to at most 20%: 10.000 € sold at 0,052 € per € = 520 €, above the 100 € cap.
    const result = targeted(100, [], { candidates: candidates({ ALFA: { upperPct: 20 } }) });
    expect(result.sale!.minTaxEur).toBeGreaterThan(100);
    expect(result.sale!.taxEur).toBeLessThanOrEqual(result.sale!.minTaxEur + 0.01);
    expect(result.converged).toBe(true);
    expect(result.sale!.capBinding).toBe(true);
    expect(describeTargetedSaleTotal(result.sale!).startsWith('I limiti in Impostazioni obbligano')).toBe(true);
  });

  it('should report no forced tax when no limit forces a sale', () => {
    expect(targeted(0).sale!.minTaxEur).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The bounds and the rounding
// ---------------------------------------------------------------------------

describe('optimizeWeights — mode targeted, the bounds and the rounding', () => {
  it('should respect every bound, sum to 100 and keep the cap on 500 seeded random boxes', () => {
    let seed = 20261112;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const hundredths = (v: number) => Math.round(v * 100) / 100;
    let ok = 0;
    for (let k = 0; k < 500; k++) {
      const lockedKeys = random() < 0.3 ? ['BETA'] : [];
      // A held row (ticked, or ZETA's unknown basis) above a max is a `bound_conflict` the lock wins: no max below it here.
      const held = new Set(['ZETA', ...lockedKeys]);
      const list = candidates().map((c) => {
        const heldPct = (c.currentValueEur / B) * 100;
        const draw = random();
        // A third of the rows get a min above the held weight, a third a max below it, off the half-point grid.
        if (draw < 0.33) return { ...c, lowerPct: hundredths(heldPct + random() * 4) };
        if (draw < 0.66 && !held.has(c.key)) return { ...c, upperPct: hundredths(heldPct - random() * 4) };
        return c;
      });
      const cap = Math.round(random() * 3000);
      const result = optimizeWeights(input({ candidates: list, sale: { taxCapEur: cap, lockedKeys } }));
      if (result.status !== 'ok') continue;
      ok++;
      expect(Math.abs(sumPct(result) - 100), `case ${k}: Σ`).toBeLessThan(1e-9);
      list.forEach((c) => {
        const w = weightOf(result, c.key).proposedPct;
        expect(w, `case ${k}: ${c.key} ≥ its min`).toBeGreaterThanOrEqual(c.lowerPct - 1e-9);
        expect(w, `case ${k}: ${c.key} ≤ its max`).toBeLessThanOrEqual(c.upperPct + 1e-9);
      });
      expect(result.sale!.taxEur, `case ${k}: tax`).toBeLessThanOrEqual(Math.max(cap, result.sale!.minTaxEur) + 0.01);
    }
    expect(ok).toBeGreaterThan(400);
  });

  it('should refuse caps that cannot reach 100 in this mode too', () => {
    const list = candidates().slice(0, 3).map((c) => ({ ...c, upperPct: 30 }));
    expect(optimizeWeights(input({ candidates: list, sale: { taxCapEur: 500, lockedKeys: [] } })).status).toBe('infeasible_bounds');
  });

  it('should keep a held weight exact, off the half-point grid', () => {
    // 60,3% · 29,7% · 10%: the first two are not on the grid, and a locked or untaxed-at-cap-0 row is held.
    const list: OptimizerCandidate[] = [
      ['EQ', 60300, { equity: 1 }],
      ['BD', 29700, { bonds: 1 }],
      ['GD', 10000, { commodity: 1 }],
    ].map(([key, value, exposure]) => ({
      key: key as string,
      assetIds: [key as string],
      buyAssetId: key as string,
      label: key as string,
      currentValueEur: value as number,
      exposurePerEuro: exposure as Partial<Record<AssetClass, number>>,
      factorPerEuro: {},
      fixedValueEur: 0,
      lowerPct: 0,
      upperPct: 100,
      taxPerEuroSold: 0.05,
    }));
    const result = optimizeWeights({
      candidates: list,
      baseEur: B,
      targets: { equity: { targetPercentage: 40 }, bonds: { targetPercentage: 40 }, commodity: { targetPercentage: 20 } } as unknown as AssetAllocationTarget,
      settings: { ...DEFAULT_IDEAL_ALLOCATION, enabled: true, leveragePriority: 'off' },
      mode: 'targeted',
      targetLeverageRatio: 1,
      sale: { taxCapEur: 0, lockedKeys: [] },
    });
    const eq = weightOf(result, 'EQ');
    expect(eq.proposedPct).toBe(eq.currentPct);
    expect(eq.proposedPct % 0.5).not.toBe(0);
    expect(Math.abs(sumPct(result) - 100)).toBeLessThan(1e-9);
  });
});

// ---------------------------------------------------------------------------
// The locks, the losses, the liquidity
// ---------------------------------------------------------------------------

describe('optimizeWeights — mode targeted, the locks', () => {
  it('should never sell a ticked row, and keep its weight exact', () => {
    const result = targeted(500, ['BETA']);
    expect(weightOf(result, 'BETA').proposedPct).toBe(weightOf(result, 'BETA').currentPct);
    expect(saleOf(result, 'BETA').soldEur).toBe(0);
  });

  it('should treat an unknown tax per euro as ticked', () => {
    const unknown = optimizeWeights(input({ candidates: candidates({ BETA: { taxPerEuroSold: null } }), sale: { taxCapEur: 500, lockedKeys: [] } }));
    expect(unknown.weights).toEqual(targeted(500, ['BETA']).weights);
  });

  // A property's fixed share is its net value rounded to the hundredth of a point: a few euro below what it is worth.
  // Locked (unknown basis, or ticked), it is held exactly — and that is no clash of limits the owner set.
  it('should hold a locked fixed share at its value, with no bound_conflict', () => {
    const heldPct = (FIXTURE.find((r) => r[0] === 'BETA')![1] / B) * 100;
    const fixed = { lowerPct: heldPct - 0.004, upperPct: heldPct - 0.004, taxPerEuroSold: null };
    const result = optimizeWeights(input({ candidates: candidates({ BETA: fixed }), sale: { taxCapEur: 500, lockedKeys: [] } }));
    expect(result.warnings.filter((w) => w.code === 'bound_conflict')).toEqual([]);
    expect(saleOf(result, 'BETA').soldEur).toBe(0);
  });
});

/** The same fixture through `runOptimizer`, priced by the app's one rule from the holdings. */
function runOnHoldings(taxCapEur: number, targets: AssetAllocationTarget): OptimizerResult {
  const assets: Asset[] = FIXTURE.map(([label, value, , exposure, factor]) => {
    const assetClass = Object.keys(exposure)[0] as AssetClass;
    const sub = Object.keys(factor[assetClass] ?? {})[0];
    return {
      id: label,
      userId: 'u',
      ticker: label,
      name: label,
      type: 'etf',
      assetClass,
      ...(sub ? { subCategory: sub } : {}),
      ...(exposure[assetClass] !== 1 ? { leverageRatio: exposure[assetClass] } : {}),
      currency: 'EUR',
      quantity: value / 100,
      currentPrice: 100,
      lastPriceUpdate: new Date(0),
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as Asset;
  });
  const holdings: AllocatableHolding[] = FIXTURE.map(([label, value, gain]) => ({
    id: label,
    label,
    assetClass: 'equity',
    value,
    tradable: true,
    taxableOnSale: true,
    taxRate: rateOf(label),
    ...(gain === null ? {} : { costBasisEur: value - gain }),
  }));
  return runOptimizer({
    positions: FIXTURE.map(([label]) => ({ key: label, label, memberAssetIds: [label], buyAssetId: label })),
    assetsById: new Map(assets.map((a) => [a.id, a])),
    settings: SETTINGS,
    mode: 'targeted',
    baseEur: B,
    valueOf: (a) => a.quantity * a.currentPrice,
    targets,
    targetLeverageRatio: 1,
    sale: { taxCapEur, lockedKeys: [] },
    holdings,
  });
}

describe('optimizeWeights — mode targeted, losses and the liquidity', () => {
  it('should sell a position at a loss at zero tax, and never sell below an unknown basis', () => {
    // No trend-following target: ZETA would go to zero if its unknown basis did not hold it.
    const targets = { ...TARGETS, commodity: { targetPercentage: 15 }, trendFollowing: { targetPercentage: 0 } } as unknown as AssetAllocationTarget;
    const result = runOnHoldings(500, targets);
    expect(saleOf(result, 'GAMMA').soldEur).toBeGreaterThan(1000);
    expect(saleOf(result, 'GAMMA').taxEur).toBe(0);
    expect(weightOf(result, 'ZETA').proposedPct).toBeGreaterThanOrEqual(weightOf(result, 'ZETA').currentPct - 1e-9);
    expect(result.sale!.taxEur).toBeGreaterThanOrEqual(0);
  });

  it('should spend the liquidity, never sell it: out of the sold total and of the taxes', () => {
    // 20% on the accounts, 10% wanted: 10.000 € of liquidity go into the instrument.
    const list: OptimizerCandidate[] = [
      { key: LIQUIDITY_CANDIDATE_KEY, exposurePerEuro: { cash: 1 }, value: 20000, tax: 0 },
      { key: 'EQ', exposurePerEuro: { equity: 1 }, value: 80000, tax: 0.05 },
    ].map(({ key, exposurePerEuro, value, tax }) => ({
      key,
      assetIds: [key],
      buyAssetId: key,
      label: key,
      currentValueEur: value,
      exposurePerEuro,
      factorPerEuro: {},
      fixedValueEur: 0,
      lowerPct: 0,
      upperPct: 100,
      taxPerEuroSold: tax,
    }));
    const result = optimizeWeights({
      candidates: list,
      baseEur: B,
      targets: { equity: { targetPercentage: 90 }, cash: { targetPercentage: 10 } } as unknown as AssetAllocationTarget,
      settings: { ...DEFAULT_IDEAL_ALLOCATION, enabled: true, leveragePriority: 'off' },
      mode: 'targeted',
      targetLeverageRatio: 1,
      sale: { taxCapEur: 0, lockedKeys: [] },
    });
    expect(weightOf(result, LIQUIDITY_CANDIDATE_KEY).proposedPct).toBe(10);
    expect(result.sale!.liquiditySpentEur).toBeCloseTo(10000, 6);
    expect(saleOf(result, LIQUIDITY_CANDIDATE_KEY)).toMatchObject({ soldEur: 0, taxEur: 0 });
    const instruments = result.sale!.perCandidate.filter((p) => p.key !== LIQUIDITY_CANDIDATE_KEY);
    expect(result.sale!.soldEur).toBe(instruments.reduce((sum, p) => sum + p.soldEur, 0));
    expect(result.sale!.taxEur).toBe(instruments.reduce((sum, p) => sum + p.taxEur, 0));
  });
});

// The allocation's cash quota (owner, 2026-11-18, found at the tour): the accounts and the money-market funds together
// never go under it — or under today's level when already below — so the PAC made from the run refills no reserve.
describe('optimizeWeights — mode targeted, the cash quota', () => {
  const cashRun = (cashFloorEur: number | undefined) => {
    const list: OptimizerCandidate[] = [
      { key: LIQUIDITY_CANDIDATE_KEY, exposurePerEuro: { cash: 1 }, value: 20000, tax: 0 },
      { key: 'MONETARIO', exposurePerEuro: { cash: 1 }, value: 10000, tax: 0 },
      { key: 'EQ', exposurePerEuro: { equity: 1 }, value: 70000, tax: 0.05 },
    ].map(({ key, exposurePerEuro, value, tax }) => ({
      key,
      assetIds: [key],
      buyAssetId: key,
      label: key,
      currentValueEur: value,
      exposurePerEuro,
      factorPerEuro: {},
      fixedValueEur: 0,
      lowerPct: 0,
      upperPct: 100,
      taxPerEuroSold: tax,
    }));
    return optimizeWeights({
      candidates: list,
      baseEur: B,
      // The class wants 10% cash: without the quota both cash rows would be spent down to it.
      targets: { equity: { targetPercentage: 90 }, cash: { targetPercentage: 10 } } as unknown as AssetAllocationTarget,
      settings: { ...DEFAULT_IDEAL_ALLOCATION, enabled: true, leveragePriority: 'off' },
      mode: 'targeted',
      targetLeverageRatio: 1,
      sale: { taxCapEur: 0, lockedKeys: [], ...(cashFloorEur === undefined ? {} : { cashFloorEur }) },
    });
  };
  const cashPct = (result: OptimizerResult) =>
    weightOf(result, LIQUIDITY_CANDIDATE_KEY).proposedPct + weightOf(result, 'MONETARIO').proposedPct;

  it('should spend the cash down to the class target with no quota', () => {
    expect(cashPct(cashRun(undefined))).toBeCloseTo(10, 6);
  });

  it('should keep the accounts and the money-market funds at or above the quota', () => {
    const result = cashRun(25000);
    expect(cashPct(result)).toBeGreaterThanOrEqual(25 - 1e-9);
    expect(cashPct(result)).toBeLessThan(30);
  });

  it('should spend and sell no cash at all when the cash is already under the quota', () => {
    const result = cashRun(40000);
    expect(weightOf(result, LIQUIDITY_CANDIDATE_KEY).proposedPct).toBeGreaterThanOrEqual(20 - 1e-9);
    expect(weightOf(result, 'MONETARIO').proposedPct).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(result.sale!.liquiditySpentEur).toBe(0);
    expect(saleOf(result, 'MONETARIO').soldEur).toBe(0);
  });
});
