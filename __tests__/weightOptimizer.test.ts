/**
 * Tests for the weight optimizer. No Firebase mock needed —
 * `weightOptimizer.ts` and the modules it imports (`accumulationPlanUtils.ts`, `allocationUtils.ts`,
 * `boxProjection.ts`) are all Firebase-free.
 */
import { describe, it, expect } from 'vitest';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import {
  buildOptimizerCandidates,
  buildStandaloneCandidates,
  evaluateObjectivesAt,
  findSecondLevelGaps,
  hasSpecificAssetTargets,
  optimizeWeights,
  DEFAULT_IDEAL_ALLOCATION,
  type OptimizerCandidate,
  type OptimizerInput,
} from '@/lib/utils/weightOptimizer';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let assetSeq = 0;
function makeAsset(overrides: Partial<Asset> = {}): Asset {
  assetSeq += 1;
  return {
    id: `a${assetSeq}`,
    userId: 'u1',
    ticker: `TCK${assetSeq}`,
    name: `Asset ${assetSeq}`,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 1000,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function candidate(overrides: Partial<OptimizerCandidate> & { key: string }): OptimizerCandidate {
  return {
    key: overrides.key,
    assetIds: overrides.assetIds ?? [overrides.key],
    buyAssetId: overrides.buyAssetId ?? overrides.key,
    label: overrides.label ?? overrides.key,
    currentValueEur: overrides.currentValueEur ?? 0,
    exposurePerEuro: overrides.exposurePerEuro ?? {},
    factorPerEuro: overrides.factorPerEuro ?? {},
    fixedValueEur: overrides.fixedValueEur ?? 0,
    lowerPct: overrides.lowerPct ?? 0,
    upperPct: overrides.upperPct ?? 100,
  };
}

function makeSettings(overrides: Partial<IdealAllocationSettings> = {}): IdealAllocationSettings {
  return { ...DEFAULT_IDEAL_ALLOCATION, enabled: true, ...overrides };
}

function makeInput(
  overrides: Partial<OptimizerInput> & { candidates: OptimizerCandidate[]; targets: AssetAllocationTarget }
): OptimizerInput {
  return {
    baseEur: 1000,
    settings: makeSettings(),
    mode: 'ideal',
    targetLeverageRatio: 1,
    ...overrides,
  };
}

function pctOf(result: ReturnType<typeof optimizeWeights>, key: string): number {
  return result.weights.find((w) => w.key === key)?.proposedPct ?? 0;
}

function mulberry32(seed: number) {
  let s = seed;
  return function rand() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('optimizeWeights — invariants (50 seeded random cases)', () => {
  it('sum 100, multiples of 0.5, bounds respected within 0.5, no weight in (0,2) when lower=0, deterministic', () => {
    const rand = mulberry32(42);
    const classes: Array<'equity' | 'bonds' | 'commodity'> = ['equity', 'bonds', 'commodity'];

    for (let iteration = 0; iteration < 50; iteration++) {
      const n = 2 + Math.floor(rand() * 4);
      const cappedIndex = rand() < 0.3 ? Math.floor(rand() * n) : -1; // Σupper must stay ≥ 100, so cap at most one candidate
      const candidates: OptimizerCandidate[] = [];
      for (let i = 0; i < n; i++) {
        const cls = classes[Math.floor(rand() * classes.length)];
        const lower = rand() < 0.3 ? Math.floor(rand() * 10) : 0;
        const upper = i === cappedIndex ? Math.max(lower, 50 + Math.floor(rand() * 50)) : 100;
        candidates.push(
          candidate({
            key: `c${i}`,
            currentValueEur: Math.floor(rand() * 1000),
            exposurePerEuro: { [cls]: 1 },
            lowerPct: lower,
            upperPct: upper,
          })
        );
      }

      const raw = classes.map(() => rand());
      const sum = raw.reduce((s, v) => s + v, 0);
      const targets = Object.fromEntries(
        classes.map((cls, i) => [cls, { targetPercentage: (raw[i] / sum) * 100 }])
      ) as AssetAllocationTarget;

      const testInput = makeInput({
        candidates,
        targets,
        baseEur: 10000,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
        mode: iteration % 2 === 0 ? 'ideal' : 'reachable',
        targetLeverageRatio: 1,
      });

      const result = optimizeWeights(testInput);
      expect(result.status).toBe('ok');

      const total = result.weights.reduce((s, w) => s + w.proposedPct, 0);
      expect(total).toBeCloseTo(100, 5);

      result.weights.forEach((w, i) => {
        expect(Math.abs(w.proposedPct * 2 - Math.round(w.proposedPct * 2))).toBeLessThan(1e-6);
        const c = candidates[i];
        expect(w.proposedPct).toBeGreaterThanOrEqual(c.lowerPct - 0.5 - 1e-6);
        expect(w.proposedPct).toBeLessThanOrEqual(c.upperPct + 1e-6);
        if (c.lowerPct === 0) {
          expect(w.proposedPct === 0 || w.proposedPct >= 2 - 1e-6).toBe(true);
        }
      });

      const result2 = optimizeWeights(JSON.parse(JSON.stringify(testInput)));
      expect(result2.weights).toEqual(result.weights);
    }
  });
});

// ---------------------------------------------------------------------------
// Solo classi — candidati puri
// ---------------------------------------------------------------------------

describe('optimizeWeights — pure class candidates', () => {
  it('one candidate per class → proposed weights match the targets exactly', () => {
    const candidates = [
      candidate({ key: 'eq', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'bd', exposurePerEuro: { bonds: 1 } }),
    ];
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 60 },
      bonds: { targetPercentage: 40 },
    };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
      })
    );
    expect(result.status).toBe('ok');
    expect(pctOf(result, 'eq')).toBeCloseTo(60, 5);
    expect(pctOf(result, 'bd')).toBeCloseTo(40, 5);
  });
});

// ---------------------------------------------------------------------------
// Fattori
// ---------------------------------------------------------------------------

describe('optimizeWeights — factor objectives', () => {
  it('three equity candidates (Mercato/Momentum/SCV), target 70/15/15 → weights in the same proportion', () => {
    const candidates = [
      candidate({ key: 'mercato', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { Mercato: 1 } } }),
      candidate({ key: 'momentum', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { Momentum: 1 } } }),
      candidate({ key: 'scv', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { SCV: 1 } } }),
    ];
    const targets: AssetAllocationTarget = {
      equity: {
        targetPercentage: 100,
        subCategoryConfig: { enabled: true, categories: ['Mercato', 'Momentum', 'SCV'] },
        subTargets: { Mercato: 70, Momentum: 15, SCV: 15 },
      },
    };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'off',
          factorObjectives: [{ assetClass: 'equity', priority: 'essential' }],
        }),
      })
    );
    expect(result.status).toBe('ok');
    expect(pctOf(result, 'mercato')).toBeCloseTo(70, 1);
    expect(pctOf(result, 'momentum')).toBeCloseTo(15, 1);
    expect(pctOf(result, 'scv')).toBeCloseTo(15, 1);
  });
});

describe('optimizeWeights — reachable mode', () => {
  it('no weight sits more than 0.5pp below its current value / B floor', () => {
    const assetA = makeAsset({ id: 'a', assetClass: 'equity', quantity: 3, currentPrice: 1000 }); // 3000
    const assetB = makeAsset({ id: 'b', assetClass: 'equity', quantity: 2, currentPrice: 1000 }); // 2000
    const assetsById = new Map([
      [assetA.id, assetA],
      [assetB.id, assetB],
    ]);

    const { candidates } = buildOptimizerCandidates({
      positions: [
        { key: 'a', label: 'A', memberAssetIds: ['a'], buyAssetId: 'a' },
        { key: 'b', label: 'B', memberAssetIds: ['b'], buyAssetId: 'b' },
      ],
      assetsById,
      settings: makeSettings(),
      mode: 'reachable',
      baseEur: 6000,
      valueOf: (a) => a.quantity * a.currentPrice,
    });

    expect(candidates.find((c) => c.key === 'a')?.lowerPct).toBeCloseTo(50, 6);
    expect(candidates.find((c) => c.key === 'b')?.lowerPct).toBeCloseTo((2000 / 6000) * 100, 6);

    const targets: AssetAllocationTarget = { equity: { targetPercentage: 100 } };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        baseEur: 6000,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
        mode: 'reachable',
      })
    );

    expect(result.status).toBe('ok');
    result.weights.forEach((w, i) => {
      expect(w.proposedPct).toBeGreaterThanOrEqual(candidates[i].lowerPct - 0.5 - 1e-6);
    });
  });
});

// ---------------------------------------------------------------------------
// Gruppo proxy
// ---------------------------------------------------------------------------

describe('buildOptimizerCandidates — proxy group', () => {
  it('a single candidate keeps the fixed member\'s value as fixedValueEur, respected as the ideal-mode floor', () => {
    const buyAsset = makeAsset({ id: 'buy', assetClass: 'equity', quantity: 0, currentPrice: 100 });
    const fixedAsset = makeAsset({ id: 'fixed', assetClass: 'equity', quantity: 5, currentPrice: 1000 }); // 5000
    const assetsById = new Map([
      [buyAsset.id, buyAsset],
      [fixedAsset.id, fixedAsset],
    ]);

    const { candidates } = buildOptimizerCandidates({
      positions: [{ key: 'p1', label: 'P1', memberAssetIds: ['buy', 'fixed'], buyAssetId: 'buy' }],
      assetsById,
      settings: makeSettings(),
      mode: 'ideal',
      baseEur: 10000,
      valueOf: (a) => a.quantity * a.currentPrice,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].fixedValueEur).toBeCloseTo(5000, 6);
    expect(candidates[0].lowerPct).toBeCloseTo(50, 6);

    const targets: AssetAllocationTarget = { equity: { targetPercentage: 100 } };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        baseEur: 10000,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
        mode: 'ideal',
      })
    );
    expect(result.status).toBe('ok');
    expect(pctOf(result, 'p1')).toBeGreaterThanOrEqual(candidates[0].lowerPct - 0.5 - 1e-6);
  });
});

// ---------------------------------------------------------------------------
// Tetto di gruppo
// ---------------------------------------------------------------------------

describe('optimizeWeights — group cap (hinge)', () => {
  const targets: AssetAllocationTarget = { equity: { targetPercentage: 100 } };

  it('is inactive (gapPp ≈ 0) when the natural solution already sits under the cap', () => {
    const candidates = [
      candidate({ key: 'x1', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'x2', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'y', exposurePerEuro: { equity: 1 } }),
    ];
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'off',
          groupLimits: [{ id: 'g1', label: 'Rischio', assetIds: ['x1', 'x2'], maxPct: 90, priority: 'high' }],
        }),
      })
    );
    const group = result.objectives.find((o) => o.id === 'group:g1');
    expect(group).toBeDefined();
    expect(Math.abs(group!.gapPp)).toBeLessThan(0.25);
  });

  it('achievedValue is the group\'s REAL weight when the cap is not binding, not the cap itself (rilievo B1)', () => {
    // Same fixture as the test above: x1+x2 naturally settle well under the 90% cap (proven red
    // against the pre-fix code, which read `targetValue + gapPp` — 0 for an inactive hinge — so
    // achievedValue always printed 90.0 regardless of the group's actual weight).
    const candidates = [
      candidate({ key: 'x1', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'x2', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'y', exposurePerEuro: { equity: 1 } }),
    ];
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'off',
          groupLimits: [{ id: 'g1', label: 'Rischio', assetIds: ['x1', 'x2'], maxPct: 90, priority: 'high' }],
        }),
      })
    );
    const group = result.objectives.find((o) => o.id === 'group:g1');
    const actualGroupWeight = pctOf(result, 'x1') + pctOf(result, 'x2');
    expect(actualGroupWeight).toBeLessThan(80); // well under the 90% cap
    expect(group!.achievedValue).toBeCloseTo(actualGroupWeight, 1);
    expect(group!.achievedValue).not.toBeCloseTo(90, 1);
  });

  it('activates (gapPp > 0) when the class target forces the group above the cap with no alternative', () => {
    const candidates = [
      candidate({ key: 'x1', exposurePerEuro: { equity: 1 } }),
      candidate({ key: 'x2', exposurePerEuro: { equity: 1 } }),
    ];
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'off',
          groupLimits: [{ id: 'g1', label: 'Rischio', assetIds: ['x1', 'x2'], maxPct: 10, priority: 'high' }],
        }),
      })
    );
    const group = result.objectives.find((o) => o.id === 'group:g1');
    expect(group).toBeDefined();
    expect(group!.gapPp).toBeGreaterThan(0.25);
    // When the cap IS binding, achievedValue already matched the real (over-cap) weight before
    // the B1 fix too — pinned here for symmetry with the inactive case above.
    const actualGroupWeight = pctOf(result, 'x1') + pctOf(result, 'x2');
    expect(group!.achievedValue).toBeCloseTo(actualGroupWeight, 1);
  });
});

// ---------------------------------------------------------------------------
// Esiti speciali
// ---------------------------------------------------------------------------

describe('optimizeWeights — special outcomes', () => {
  it('no_candidates when there are no candidates', () => {
    const result = optimizeWeights(makeInput({ candidates: [], targets: { equity: { targetPercentage: 100 } } }));
    expect(result.status).toBe('no_candidates');
    expect(result.weights).toEqual([]);
  });

  it('infeasible_bounds when Σ lowerPct exceeds 100', () => {
    const candidates = [
      candidate({ key: 'a', exposurePerEuro: { equity: 1 }, lowerPct: 60 }),
      candidate({ key: 'b', exposurePerEuro: { equity: 1 }, lowerPct: 60 }),
    ];
    const result = optimizeWeights(makeInput({ candidates, targets: { equity: { targetPercentage: 100 } } }));
    expect(result.status).toBe('infeasible_bounds');
    expect(result.weights).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Conflitti
// ---------------------------------------------------------------------------

describe('optimizeWeights — conflicts', () => {
  it('a conflict involves both leverage and the class target when they pull in opposite directions', () => {
    const candidates = [
      candidate({ key: 'CL2', exposurePerEuro: { equity: 2 } }),
      candidate({ key: 'BND', exposurePerEuro: { bonds: 1 } }),
    ];
    const targets: AssetAllocationTarget = { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } };

    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({ classPriority: 'medium', leveragePriority: 'high' }),
        targetLeverageRatio: 1,
      })
    );

    const involvesBoth = result.conflicts.some(
      (c) => c.removedObjectiveId === 'leverage' && c.improvements.some((i) => i.objectiveId.startsWith('class:'))
    );
    expect(involvesBoth).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// not_converged forzabile
// ---------------------------------------------------------------------------

describe('optimizeWeights — not_converged', () => {
  it('reports not converged when the active set is capped before its first step', () => {
    const candidates = [
      candidate({ key: 'eq', exposurePerEuro: { equity: 1 }, currentValueEur: 900 }),
      candidate({ key: 'bd', exposurePerEuro: { bonds: 1 }, currentValueEur: 100 }),
    ];
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 60 },
      bonds: { targetPercentage: 40 },
    };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
      }),
      { maxIterations: 0 }
    );
    expect(result.converged).toBe(false);
    expect(result.warnings).toContainEqual({ code: 'not_converged' });
  });
});

// ---------------------------------------------------------------------------
// §3.3/G5 — findSecondLevelGaps
// ---------------------------------------------------------------------------

const valueOf = (a: Asset): number => a.quantity * a.currentPrice;

const EQUITY_TARGETS: AssetAllocationTarget = {
  equity: {
    targetPercentage: 100,
    subCategoryConfig: { enabled: true, categories: ['Momentum'] },
  },
};

describe('findSecondLevelGaps', () => {
  it('flags an asset with no sub-category as missing', () => {
    const asset = makeAsset({ assetClass: 'equity', subCategory: undefined });
    const gaps = findSecondLevelGaps([asset], EQUITY_TARGETS, ['equity'], valueOf);
    expect(gaps).toEqual([{ assetId: asset.id, assetName: asset.name, assetClass: 'equity', reason: 'missing' }]);
  });

  it('flags a sub-category absent from the class categories as unknown', () => {
    const asset = makeAsset({ assetClass: 'equity', subCategory: 'Value' });
    const gaps = findSecondLevelGaps([asset], EQUITY_TARGETS, ['equity'], valueOf);
    expect(gaps).toEqual([{ assetId: asset.id, assetName: asset.name, assetClass: 'equity', reason: 'unknown' }]);
  });

  it('evaluates every component of a composite asset', () => {
    const asset = makeAsset({
      assetClass: 'equity',
      composition: [
        { assetClass: 'equity', percentage: 50 },
        { assetClass: 'equity', subCategory: 'Momentum', percentage: 50 },
      ],
    });
    const gaps = findSecondLevelGaps([asset], EQUITY_TARGETS, ['equity'], valueOf);
    expect(gaps).toEqual([
      { assetId: asset.id, assetName: asset.name, assetClass: 'equity', componentIndex: 0, reason: 'missing' },
    ]);
  });

  it('ignores an excluded asset', () => {
    const asset = makeAsset({ assetClass: 'equity', subCategory: undefined, allocationRole: 'excluded' });
    expect(findSecondLevelGaps([asset], EQUITY_TARGETS, ['equity'], valueOf)).toEqual([]);
  });

  it('ignores an asset with value 0', () => {
    const asset = makeAsset({ assetClass: 'equity', subCategory: undefined, quantity: 0 });
    expect(findSecondLevelGaps([asset], EQUITY_TARGETS, ['equity'], valueOf)).toEqual([]);
  });

  it('ignores a class not passed in scope', () => {
    const asset = makeAsset({ assetClass: 'bonds', subCategory: undefined });
    expect(findSecondLevelGaps([asset], EQUITY_TARGETS, ['equity'], valueOf)).toEqual([]);
  });

  it('normalizes a padded sub-category before matching and before falling back to missing', () => {
    const matched = makeAsset({ assetClass: 'equity', subCategory: '  Momentum  ' });
    expect(findSecondLevelGaps([matched], EQUITY_TARGETS, ['equity'], valueOf)).toEqual([]);

    const blank = makeAsset({ assetClass: 'equity', subCategory: '   ' });
    expect(findSecondLevelGaps([blank], EQUITY_TARGETS, ['equity'], valueOf)).toEqual([
      { assetId: blank.id, assetName: blank.name, assetClass: 'equity', reason: 'missing' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// §3.5/G2 — hasSpecificAssetTargets
// ---------------------------------------------------------------------------

describe('hasSpecificAssetTargets', () => {
  it('is false when no sub-target carries specificAssets', () => {
    const targets: AssetAllocationTarget = {
      equity: { targetPercentage: 100, subTargets: { Momentum: 100 } },
    };
    expect(hasSpecificAssetTargets(targets, ['equity'])).toBe(false);
  });

  it('is true when a sub-target has specificAssetsEnabled', () => {
    const targets: AssetAllocationTarget = {
      equity: {
        targetPercentage: 100,
        subTargets: { Momentum: { targetPercentage: 100, specificAssetsEnabled: true, specificAssets: [] } },
      },
    };
    expect(hasSpecificAssetTargets(targets, ['equity'])).toBe(true);
  });

  it('ignores a class outside the scope', () => {
    const targets: AssetAllocationTarget = {
      equity: {
        targetPercentage: 100,
        subTargets: { Momentum: { targetPercentage: 100, specificAssetsEnabled: true, specificAssets: [] } },
      },
    };
    expect(hasSpecificAssetTargets(targets, ['bonds'])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §4.2/§4.4 — buildStandaloneCandidates (IdealCompositionDialog's own candidate prep)
// ---------------------------------------------------------------------------

describe('buildStandaloneCandidates', () => {
  it('one position per tradable asset, no bounds override', () => {
    const a1 = makeAsset({ quantity: 10, currentPrice: 100 });
    const a2 = makeAsset({ quantity: 5, currentPrice: 100 });
    const { positions, fixBounds } = buildStandaloneCandidates([a1, a2], 1500, valueOf);
    expect(positions).toEqual([
      { key: a1.id, label: a1.name, memberAssetIds: [a1.id], buyAssetId: a1.id },
      { key: a2.id, label: a2.name, memberAssetIds: [a2.id], buyAssetId: a2.id },
    ]);
    expect(fixBounds(candidate({ key: a1.id, buyAssetId: a1.id }))).toEqual({});
  });

  it('fixes a frozen asset to its current share of B', () => {
    const frozen = makeAsset({ quantity: 10, currentPrice: 100, allocationRole: 'frozen' });
    const { positions, fixBounds } = buildStandaloneCandidates([frozen], 2000, valueOf);
    expect(positions).toHaveLength(1);
    expect(fixBounds(candidate({ key: frozen.id, buyAssetId: frozen.id }))).toEqual({ lowerPct: 50, upperPct: 50 });
  });

  it('leaves a liquidity account out, tradable or not (RO1, B1)', () => {
    const etf = makeAsset({ quantity: 10, currentPrice: 100 });
    const account = makeAsset({ type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 5000 });
    const { positions } = buildStandaloneCandidates([etf, account], 6000, valueOf);
    expect(positions.map((p) => p.key)).toEqual([etf.id]);
  });

  it('PZ5/RO1: an instrument to evaluate at 0 shares is a candidate; a cash account or a frozen one never is', () => {
    const held = makeAsset({ quantity: 10, currentPrice: 100 });
    const eimi = makeAsset({ quantity: 0, currentPrice: 30 });
    const ignored = makeAsset({ quantity: 0, currentPrice: 30 });
    const account = makeAsset({ type: 'cash', assetClass: 'cash', quantity: 0, currentPrice: 1 });
    const frozen = makeAsset({ quantity: 0, currentPrice: 30, allocationRole: 'frozen' });
    const { positions } = buildStandaloneCandidates(
      [held, eimi, ignored, account, frozen],
      1000,
      valueOf,
      new Set([eimi.id, account.id, frozen.id])
    );
    expect(positions.map((p) => p.key)).toEqual([held.id, eimi.id]);
  });

  it('PZ5: a 0-share candidate gets a weight when an essential sub-target needs it', () => {
    const candidates = [
      candidate({ key: 'vwce', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { Mercato: 1 } }, currentValueEur: 1000 }),
      candidate({ key: 'eimi', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { Emergenti: 1 } }, currentValueEur: 0 }),
    ];
    const targets: AssetAllocationTarget = {
      equity: {
        targetPercentage: 100,
        subCategoryConfig: { enabled: true, categories: ['Mercato', 'Emergenti'] },
        subTargets: { Mercato: 90, Emergenti: 10 },
      },
    };
    const result = optimizeWeights(
      makeInput({
        candidates,
        targets,
        settings: makeSettings({
          classPriority: 'essential',
          leveragePriority: 'off',
          factorObjectives: [{ assetClass: 'equity', priority: 'essential' }],
        }),
      })
    );
    expect(result.status).toBe('ok');
    expect(pctOf(result, 'eimi')).toBeGreaterThan(0);
    expect(pctOf(result, 'eimi')).toBeCloseTo(10, 0);
  });

  it('leaves an excluded asset out entirely', () => {
    const excluded = makeAsset({ quantity: 10, currentPrice: 100, allocationRole: 'excluded' });
    const { positions } = buildStandaloneCandidates([excluded], 1000, valueOf);
    expect(positions).toEqual([]);
  });

  it('leaves a zero-value asset out', () => {
    const zero = makeAsset({ quantity: 0, currentPrice: 100 });
    const { positions } = buildStandaloneCandidates([zero], 1000, valueOf);
    expect(positions).toEqual([]);
  });

  it('does not fix bounds when B is not > 0 (no investable amount yet)', () => {
    const frozen = makeAsset({ quantity: 10, currentPrice: 100, allocationRole: 'frozen' });
    const { fixBounds } = buildStandaloneCandidates([frozen], 0, valueOf);
    expect(fixBounds(candidate({ key: frozen.id, buyAssetId: frozen.id }))).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// evaluateObjectivesAt (A4) — what given weights reach, no solver
// ---------------------------------------------------------------------------

describe('evaluateObjectivesAt', () => {
  const equity = makeAsset({ id: 'eq', assetClass: 'equity', quantity: 1, currentPrice: 1000 });
  const bonds = makeAsset({ id: 'bd', assetClass: 'bonds', quantity: 1, currentPrice: 1000 });
  const base = {
    positions: [
      { key: 'eq', label: 'EQ', memberAssetIds: ['eq'], buyAssetId: 'eq' },
      { key: 'bd', label: 'BD', memberAssetIds: ['bd'], buyAssetId: 'bd' },
    ],
    assetsById: new Map([
      [equity.id, equity],
      [bonds.id, bonds],
    ]),
    settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
    baseEur: 2000,
    valueOf: (a: Asset) => a.quantity * a.currentPrice,
    targets: { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } } as AssetAllocationTarget,
    targetLeverageRatio: 1,
  };

  it('reports no class gap on the target weights and a gap on others', () => {
    const onTarget = evaluateObjectivesAt({ ...base, weightsPctByKey: { eq: 60, bd: 40 } });
    const off = evaluateObjectivesAt({ ...base, weightsPctByKey: { eq: 80, bd: 20 } });
    expect(onTarget.find((o) => o.kind === 'class')?.gapPp ?? 0).toBeCloseTo(0, 6);
    expect(off.find((o) => o.kind === 'class')?.gapPp ?? 0).toBeGreaterThan(10);
  });

  it('rescales weights that do not add up to 100 and is empty without any weight', () => {
    const scaled = evaluateObjectivesAt({ ...base, weightsPctByKey: { eq: 30, bd: 20 } });
    expect(scaled.find((o) => o.kind === 'class')?.gapPp ?? 0).toBeCloseTo(0, 6);
    expect(evaluateObjectivesAt({ ...base, weightsPctByKey: {} })).toEqual([]);
  });
});
