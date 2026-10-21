/**
 * Tests for the optimizer's third mode, «Con vendite mirate». The main fixture is the owner's real case of 2026-09-27 (§A.2): 12 instruments, 126.128 €
 * of base (15.000 € to invest), classes essential, leverage high, equity second level high.
 * SGLN, DBMF, UEQC and CRRY carry the prototype's placeholder of 0,03 € of tax
 * per € sold (their PMC was not known that day). The numbers asserted are the ATE's own (§5.3).
 */
import { describe, it, expect } from 'vitest';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import {
  optimizeWeights,
  targetedRawSolution,
  taxPerEuroSoldOf,
  DEFAULT_IDEAL_ALLOCATION,
  type OptimizerCandidate,
  type OptimizerInput,
  type OptimizerResult,
} from '@/lib/utils/weightOptimizer';

// ---------------------------------------------------------------------------
// A portfolio with gains, a loss and unknown-cost instruments
// ---------------------------------------------------------------------------

const B = 126000;

type Row = [string, number, number | null, OptimizerCandidate['exposurePerEuro'], OptimizerCandidate['factorPerEuro']];
const REAL: Row[] = [
  ['CL2', 5400, 710, { equity: 2 }, { equity: { Market: 2 } }],
  ['AVWS', 2800, -10, { equity: 1 }, { equity: { 'Small Cap Value': 1 } }],
  ['DEGC', 1900, 220, { equity: 1 }, { equity: { Market: 1 } }],
  ['EIMI', 5400, 1670, { equity: 1 }, { equity: { Market: 1 } }],
  ['NTSG', 49300, 6690, { equity: 0.9, bonds: 0.6 }, { equity: { Market: 0.9 } }],
  ['ALLW', 900, 20, { equity: 1 }, { equity: { Market: 1 } }],
  ['EXUS', 6600, 340, { equity: 1 }, { equity: { Market: 1 } }],
  ['XDEM', 4700, 180, { equity: 1 }, { equity: { Momentum: 1 } }],
  ['SGLN', 8600, null, { commodity: 1 }, {}],
  ['DBMF', 18200, null, { trendFollowing: 1 }, {}],
  ['UEQC', 3500, null, { carry: 1 }, {}],
  ['CRRY', 3900, null, { carry: 1 }, {}],
];

const REAL_TARGETS = {
  equity: { targetPercentage: 70, subCategoryConfig: { enabled: true, categories: ['Market', 'Small Cap Value', 'Momentum'] }, subTargets: { Market: 70, 'Small Cap Value': 15, Momentum: 15 } },
  bonds: { targetPercentage: 20 },
  commodity: { targetPercentage: 10 },
  trendFollowing: { targetPercentage: 20 },
  carry: { targetPercentage: 10 },
} as unknown as AssetAllocationTarget;

const REAL_SETTINGS: IdealAllocationSettings = {
  ...DEFAULT_IDEAL_ALLOCATION,
  enabled: true,
  classPriority: 'essential',
  leveragePriority: 'high',
  factorObjectives: [{ assetClass: 'equity', priority: 'high' }],
};

function realCandidates(lowerAtCurrent: string[] = []): OptimizerCandidate[] {
  return REAL.map(([key, value, gain, exposure, factor]) => ({
    key,
    assetIds: [key],
    buyAssetId: key,
    label: key,
    currentValueEur: value,
    exposurePerEuro: exposure,
    factorPerEuro: factor,
    fixedValueEur: 0,
    lowerPct: lowerAtCurrent.includes(key) ? (value / B) * 100 : 0,
    upperPct: 100,
    taxPerEuroSold: gain === null ? 0.03 : (Math.max(0, gain) / value) * 0.26,
  }));
}

function realInput(overrides: Partial<OptimizerInput> = {}): OptimizerInput {
  return {
    candidates: realCandidates(),
    baseEur: B,
    targets: REAL_TARGETS,
    settings: REAL_SETTINGS,
    mode: 'targeted',
    targetLeverageRatio: 1.3,
    ...overrides,
  };
}

function targeted(taxCapEur: number, lockedKeys: string[] = [], overrides: Partial<OptimizerInput> = {}): OptimizerResult {
  return optimizeWeights(realInput({ sale: { taxCapEur, lockedKeys }, ...overrides }));
}

const pctOf = (result: OptimizerResult, key: string) => result.weights.find((w) => w.key === key)!;
const soldOf = (result: OptimizerResult, key: string) => result.sale!.perCandidate.find((p) => p.key === key)!.soldEur;
const sumPct = (result: OptimizerResult) => result.weights.reduce((s, w) => s + w.proposedPct, 0);

// ---------------------------------------------------------------------------
// A synthetic three-candidate case for the base behaviours
// ---------------------------------------------------------------------------

function synthetic(overrides: { taxes?: Array<number | null>; lowerPct?: number[]; upperPct?: number[]; values?: number[]; base?: number } = {}): OptimizerInput {
  const values = overrides.values ?? [600, 300, 100];
  const base = overrides.base ?? 1000;
  const taxes = overrides.taxes ?? [0.05, 0.05, 0.05];
  return {
    candidates: ['EQ', 'BD', 'GD'].map((key, i) => ({
      key,
      assetIds: [key],
      buyAssetId: key,
      label: key,
      currentValueEur: values[i],
      exposurePerEuro: [{ equity: 1 }, { bonds: 1 }, { commodity: 1 }][i],
      factorPerEuro: {},
      fixedValueEur: 0,
      lowerPct: overrides.lowerPct?.[i] ?? 0,
      upperPct: overrides.upperPct?.[i] ?? 100,
      taxPerEuroSold: taxes[i],
    })),
    baseEur: base,
    // Targets 40/40/20 against a 60/30/10 portfolio: Ideale sells equity.
    targets: { equity: { targetPercentage: 40 }, bonds: { targetPercentage: 40 }, commodity: { targetPercentage: 20 } } as unknown as AssetAllocationTarget,
    settings: { ...DEFAULT_IDEAL_ALLOCATION, enabled: true, leveragePriority: 'off' },
    mode: 'targeted',
    targetLeverageRatio: 1,
  };
}

// ---------------------------------------------------------------------------
// §3 — tax per € sold
// ---------------------------------------------------------------------------

describe('taxPerEuroSoldOf', () => {
  const asset = (overrides: Partial<Asset>): Asset => ({
    id: 'a',
    userId: 'u',
    ticker: 'T',
    name: 'T',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 10,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  });

  it('is the gain share of the price times 26% by default', () => {
    expect(taxPerEuroSoldOf(asset({ averageCostEur: 80 }))).toBeCloseTo(0.26 * 0.2, 12);
  });

  it('is 0 on a position at a loss', () => {
    expect(taxPerEuroSoldOf(asset({ averageCostEur: 120 }))).toBe(0);
  });

  it('uses the instrument rate — 12,5% on a government bond', () => {
    expect(taxPerEuroSoldOf(asset({ averageCostEur: 50, taxRate: 12.5 }))).toBeCloseTo(0.125 * 0.5, 12);
  });

  it('is null on a foreign asset without averageCostEur — unknown, never presumed zero', () => {
    expect(taxPerEuroSoldOf(asset({ currency: 'USD', averageCost: 80, currentPriceEur: 90 }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §11.1
// ---------------------------------------------------------------------------

describe('optimizeWeights — mode targeted', () => {
  it('1 · a cap high enough gives Ideale’s weights, and the cap does not bind', () => {
    const result = targeted(100000);
    const ideal = optimizeWeights(realInput({ mode: 'ideal' }));
    expect(result.weights.map((w) => w.proposedPct)).toEqual(ideal.weights.map((w) => w.proposedPct));
    expect(result.sale!.capBinding).toBe(false);
    // `idealTaxEur` is the tax before rounding; the weights are rounded to half points, which moves it by about 1%.
    expect(result.sale!.taxEur).toBeLessThanOrEqual(result.sale!.idealTaxEur * 1.02);
  });

  it('1b · …and with a lock, Ideale with the same lock, never below the locked weight', () => {
    const result = targeted(100000, ['NTSG']);
    const ideal = optimizeWeights(realInput({ mode: 'ideal', candidates: realCandidates(['NTSG']) }));
    expect(result.sale!.capBinding).toBe(false);
    result.weights.forEach((w, i) => expect(Math.abs(w.proposedPct - ideal.weights[i].proposedPct)).toBeLessThanOrEqual(0.5 + 1e-9));
    expect(pctOf(result, 'NTSG').proposedPct).toBeGreaterThanOrEqual(pctOf(result, 'NTSG').currentPct);
  });

  it('2 · cap 0 and no position at a loss gives Raggiungibile’s weights, with no tax', () => {
    const noLoss = realCandidates().map((c) => (c.key === 'AVWS' ? { ...c, taxPerEuroSold: 0.001 } : c));
    const result = optimizeWeights(realInput({ candidates: noLoss, sale: { taxCapEur: 0, lockedKeys: [] } }));
    const reachable = optimizeWeights(
      realInput({ mode: 'reachable', candidates: noLoss.map((c) => ({ ...c, lowerPct: (c.currentValueEur / B) * 100 })) })
    );
    result.weights.forEach((w, i) => expect(Math.abs(w.proposedPct - reachable.weights[i].proposedPct)).toBeLessThanOrEqual(0.5 + 1e-9));
    expect(result.sale!.taxEur).toBe(0);
    expect(result.sale!.soldEur).toBe(0);
  });

  it('3 · cap 0 still sells an overweight position at a loss — its tax is 0', () => {
    const result = optimizeWeights({ ...synthetic({ taxes: [0, 0.05, 0.05] }), sale: { taxCapEur: 0, lockedKeys: [] } });
    expect(soldOf(result, 'EQ')).toBeGreaterThan(100);
    expect(result.sale!.taxEur).toBe(0);
  });

  it('4 · the tax after rounding never exceeds the cap (caps 0…1.000, with and without a lock)', () => {
    for (const locks of [[], ['NTSG'], ['NTSG', 'EXUS']]) {
      for (let cap = 0; cap <= 1000; cap += 50) {
        const result = targeted(cap, locks);
        expect(result.sale!.taxEur, `cap ${cap} locks ${locks.join('+')}`).toBeLessThanOrEqual(cap + 1e-6);
      }
    }
  });

  it('5 · before rounding, tax grows and the weighted gap J shrinks as the cap grows', () => {
    for (const locks of [[], ['NTSG']]) {
      let prevTax = -Infinity;
      let prevJ = Infinity;
      for (let cap = 0; cap <= 1000; cap += 25) {
        const raw = targetedRawSolution(realInput({ sale: { taxCapEur: cap, lockedKeys: locks } }))!;
        expect(raw.taxEur, `tax at cap ${cap}`).toBeGreaterThanOrEqual(prevTax - 1e-6);
        expect(raw.taxEur, `tax ≤ cap ${cap}`).toBeLessThanOrEqual(cap + 1e-6);
        expect(raw.objectiveValue, `J at cap ${cap}`).toBeLessThanOrEqual(prevJ * (1 + 1e-9));
        prevTax = raw.taxEur;
        prevJ = raw.objectiveValue;
      }
    }
  });

  it('6 · a locked candidate never goes below its current weight, and stays exact when not bought', () => {
    const result = targeted(494, ['NTSG']);
    const ntsg = pctOf(result, 'NTSG');
    expect(ntsg.proposedPct).toBe(ntsg.currentPct);
    expect(soldOf(result, 'NTSG')).toBe(0);
  });

  it('7 · an unknown tax per € (null) is treated as locked', () => {
    const candidates = realCandidates().map((c) => (c.key === 'NTSG' ? { ...c, taxPerEuroSold: null } : c));
    const result = optimizeWeights(realInput({ candidates, sale: { taxCapEur: 494, lockedKeys: [] } }));
    const locked = targeted(494, ['NTSG']);
    expect(result.weights).toEqual(locked.weights);
  });

  it('8 · a held weight stays off the grid, exact, and the weights sum to 100', () => {
    const result = targeted(0);
    const ntsg = pctOf(result, 'NTSG');
    expect(ntsg.proposedPct).toBe(ntsg.currentPct);
    expect(ntsg.proposedPct % 0.5).not.toBe(0);
    expect(Math.abs(sumPct(result) - 100)).toBeLessThan(1e-9);
    for (const cap of [100, 494, 583, 1000]) expect(Math.abs(sumPct(targeted(cap, ['NTSG'])) - 100)).toBeLessThan(1e-9);
  });

  it('9 · the 2% heuristic does not break the cap: EIMI stays at 1% at 494 € with NTSG locked (§7)', () => {
    const result = targeted(494, ['NTSG']);
    expect(pctOf(result, 'EIMI').proposedPct).toBe(1);
    expect(result.sale!.taxEur).toBeLessThanOrEqual(494);
    // …and it is the ATE's «plan» with NTSG locked: DEGC, ALLW, EXUS sold out, EIMI in part (§5.3).
    for (const key of ['DEGC', 'ALLW', 'EXUS']) expect(pctOf(result, key).proposedPct).toBe(0);
    expect(soldOf(result, 'EIMI')).toBeGreaterThan(3500);
    expect(soldOf(result, 'EIMI')).toBeLessThan(5405.7);
  });

  it('9b · the ATE’s plan B: with NTSG and EXUS locked, 494 € sells DEGC, EIMI and ALLW and nothing else', () => {
    const result = targeted(494, ['NTSG', 'EXUS']);
    const sold = result.sale!.perCandidate.filter((p) => p.soldEur > 0.5).map((p) => p.key);
    expect(sold).toEqual(['DEGC', 'EIMI', 'ALLW']);
  });

  it('10 · deterministic bit for bit', () => {
    expect(JSON.stringify(targeted(300, ['NTSG']))).toBe(JSON.stringify(targeted(300, ['NTSG'])));
  });

  it('11 · the other modes ignore `sale` entirely', () => {
    for (const mode of ['ideal', 'reachable'] as const) {
      const without = optimizeWeights(realInput({ mode }));
      const withSale = optimizeWeights(realInput({ mode, sale: { taxCapEur: 0, lockedKeys: ['NTSG'] } }));
      expect(withSale).toEqual(without);
      expect(withSale.sale).toBeUndefined();
    }
  });

  it('12 · the real fixture computes in well under a second (the ATE aims at 300 ms; measured ~2 ms)', () => {
    const start = performance.now();
    targeted(494, ['NTSG']);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('optimizeWeights — mode targeted, the tax the limits force (owner’s call, 2026-09-27)', () => {
  it('a max below the held weight forces a sale: the minimum tax becomes the cap', () => {
    // EQ at 60% with a 50% max: 100 € must go, at 5 cents per € = 5 € whatever the cap.
    const result = optimizeWeights({ ...synthetic({ upperPct: [50, 100, 100] }), sale: { taxCapEur: 0, lockedKeys: [] } });
    expect(result.status).toBe('ok');
    expect(result.sale!.minTaxEur).toBeCloseTo(5, 9);
    expect(result.sale!.taxEur).toBeLessThanOrEqual(5 + 1e-6);
    expect(pctOf(result, 'EQ').proposedPct).toBeLessThanOrEqual(50);
  });

  it('a min above the held weight with nothing to invest forces the cheapest sale', () => {
    // GD must reach 20% from 10%: 100 € of sales, BD (1 cent) before EQ (5 cents).
    const result = optimizeWeights({
      ...synthetic({ taxes: [0.05, 0.01, 0.05], lowerPct: [0, 0, 20] }),
      sale: { taxCapEur: 0, lockedKeys: [] },
    });
    expect(result.sale!.minTaxEur).toBeCloseTo(1, 9);
    expect(result.sale!.taxEur).toBeLessThanOrEqual(1 + 1e-6);
    expect(pctOf(result, 'GD').proposedPct).toBeGreaterThanOrEqual(20);
  });

  it('with no limit forcing anything the minimum tax is 0', () => {
    expect(targeted(0).sale!.minTaxEur).toBe(0);
  });
});
