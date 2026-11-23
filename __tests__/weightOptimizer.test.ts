/**
 * Tests for the weight optimizer. No Firebase mock needed —
 * `weightOptimizer.ts` and the modules it imports (`accumulationPlanUtils.ts`, `allocationUtils.ts`,
 * `boxProjection.ts`) are all Firebase-free.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset, AssetAllocationTarget, IdealAllocationSettings } from '@/types/assets';
import {
  buildOptimizerCandidates,
  buildStandaloneCandidates,
  evaluateObjectivesAt,
  findSecondLevelGaps,
  hasSpecificAssetTargets,
  optimizeWeights,
  roundWeights,
  runOptimizer,
  DEFAULT_IDEAL_ALLOCATION,
  LIQUIDITY_CANDIDATE_KEY,
  type OptimizerCandidate,
  type OptimizerInput,
} from '@/lib/utils/weightOptimizer';

// compareAllocations (the page's base, matched by the standalone base) pulls the Firebase client in.
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { compareAllocations } from '@/lib/services/assetAllocationService';

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
  // The grid of 2026-11-12: Σ = 100 exactly and every weight inside its bounds, on half points when the integer
  // bounds allow them. Seen red on the floor-every-weight rounding (a floor of 7 read as 6,5).
  it('sum 100, multiples of 0.5, bounds respected exactly, no weight in (0,2) when lower=0, deterministic', () => {
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
      expect(Math.abs(total - 100)).toBeLessThan(1e-9);

      result.weights.forEach((w, i) => {
        expect(Math.abs(w.proposedPct * 2 - Math.round(w.proposedPct * 2))).toBeLessThan(1e-6);
        const c = candidates[i];
        expect(w.proposedPct).toBeGreaterThanOrEqual(c.lowerPct - 1e-9);
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
  // The floor is today's share on hundredths (2026-11-12), and no weight sits below it.
  it('no weight sits below its current value / B floor, read on hundredths', () => {
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
    expect(candidates.find((c) => c.key === 'b')?.lowerPct).toBe(33.33);

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
      expect(w.proposedPct).toBeGreaterThanOrEqual(candidates[i].lowerPct - 1e-9);
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

  it('achievedValue is the group\'s REAL weight when the cap is not binding, not the cap itself', () => {
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
    // the fix of 2026-09-19 too — pinned here for symmetry with the inactive case above.
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

  // Bounds that cannot reach 100 are as impossible as floors above it (2026-11-12). Seen red without the
  // Σ upperPct check: the solver returned 90% and the rounding called it 100.
  it('infeasible_bounds when Σ upperPct falls short of 100', () => {
    const candidates = ['a', 'b', 'c'].map((key) => candidate({ key, exposurePerEuro: { equity: 1 }, upperPct: 30 }));
    const result = optimizeWeights(makeInput({ candidates, targets: { equity: { targetPercentage: 100 } } }));
    expect(result.status).toBe('infeasible_bounds');
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
// findSecondLevelGaps
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
// hasSpecificAssetTargets
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
// buildStandaloneCandidates (IdealCompositionDialog's own candidate prep)
// ---------------------------------------------------------------------------

describe('buildStandaloneCandidates', () => {
  const account = (eur: number) => makeAsset({ type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: eur });
  const loan = (eur: number, financedAssetId?: string) =>
    makeAsset({ type: 'loan', assetClass: 'cash', quantity: 1, currentPrice: eur, financedAssetId });
  // A loan is worth minus its principal (calculateAssetValue): the fixtures' valueOf says the same.
  const netValueOf = (a: Asset): number => (a.type === 'loan' ? -(a.quantity * a.currentPrice) : a.quantity * a.currentPrice);
  const keysOf = (s: ReturnType<typeof buildStandaloneCandidates>) => s.positions.map((p) => p.key);

  it('one position per tradable instrument plus «Liquidità», no bounds override', () => {
    const a1 = makeAsset({ quantity: 10, currentPrice: 100 });
    const a2 = makeAsset({ quantity: 5, currentPrice: 100 });
    const { positions, fixBounds, baseEur } = buildStandaloneCandidates([a1, a2], valueOf, 0);
    expect(positions).toEqual([
      { key: a1.id, label: a1.name, memberAssetIds: [a1.id], buyAssetId: a1.id },
      { key: a2.id, label: a2.name, memberAssetIds: [a2.id], buyAssetId: a2.id },
      { key: LIQUIDITY_CANDIDATE_KEY, label: 'Liquidità', memberAssetIds: [LIQUIDITY_CANDIDATE_KEY], buyAssetId: LIQUIDITY_CANDIDATE_KEY },
    ]);
    expect(baseEur).toBe(1500);
    expect(fixBounds(candidate({ key: a1.id, buyAssetId: a1.id }))).toEqual({});
  });

  it('fixes a frozen asset to its current share of the base', () => {
    const frozen = makeAsset({ quantity: 10, currentPrice: 100, allocationRole: 'frozen' });
    const etf = makeAsset({ quantity: 10, currentPrice: 100 });
    const { fixBounds } = buildStandaloneCandidates([frozen, etf], valueOf, 0);
    expect(fixBounds(candidate({ key: frozen.id, buyAssetId: frozen.id }))).toEqual({ lowerPct: 50, upperPct: 50 });
  });

  // The accounts are where the money sits, and the model says how much of it stays there (2026-11-12).
  it('the accounts are ONE candidate «Liquidità»', () => {
    const etf = makeAsset({ quantity: 10, currentPrice: 100 });
    const s = buildStandaloneCandidates([etf, account(3000), account(2000)], valueOf, 0);
    expect(keysOf(s)).toEqual([etf.id, LIQUIDITY_CANDIDATE_KEY]);
    expect(s.valueOf(s.assetsById.get(LIQUIDITY_CANDIDATE_KEY)!)).toBe(5000);
    expect(s.liquidityEur).toBe(5000);
  });

  it('an instrument to evaluate at 0 shares is a candidate; a cash account or a frozen one never is', () => {
    const held = makeAsset({ quantity: 10, currentPrice: 100 });
    const toEvaluate = makeAsset({ quantity: 0, currentPrice: 30 });
    const ignored = makeAsset({ quantity: 0, currentPrice: 30 });
    const emptyAccount = account(0);
    const frozen = makeAsset({ quantity: 0, currentPrice: 30, allocationRole: 'frozen' });
    const s = buildStandaloneCandidates(
      [held, toEvaluate, ignored, emptyAccount, frozen],
      valueOf,
      0,
      new Set([toEvaluate.id, emptyAccount.id, frozen.id])
    );
    expect(keysOf(s)).toEqual([held.id, toEvaluate.id, LIQUIDITY_CANDIDATE_KEY]);
  });

  it('a 0-share candidate gets a weight when an essential sub-target needs it', () => {
    const candidates = [
      candidate({ key: 'etf-a', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { Mercato: 1 } }, currentValueEur: 1000 }),
      candidate({ key: 'etf-b', exposurePerEuro: { equity: 1 }, factorPerEuro: { equity: { Emergenti: 1 } }, currentValueEur: 0 }),
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
    expect(pctOf(result, 'etf-b')).toBeGreaterThan(0);
    expect(pctOf(result, 'etf-b')).toBeCloseTo(10, 0);
  });

  it('leaves an excluded asset out entirely', () => {
    const excluded = makeAsset({ quantity: 10, currentPrice: 100, allocationRole: 'excluded' });
    const s = buildStandaloneCandidates([excluded], valueOf, 0);
    expect(keysOf(s)).toEqual([LIQUIDITY_CANDIDATE_KEY]);
    expect(s.baseEur).toBe(0);
  });

  it('leaves a zero-value asset out', () => {
    const zero = makeAsset({ quantity: 0, currentPrice: 100 });
    expect(keysOf(buildStandaloneCandidates([zero], valueOf, 0))).toEqual([LIQUIDITY_CANDIDATE_KEY]);
  });

  it('does not fix bounds when the base is not > 0 (nothing held, nothing to invest)', () => {
    const frozen = makeAsset({ quantity: 0, currentPrice: 100, allocationRole: 'frozen' });
    const { fixBounds } = buildStandaloneCandidates([frozen], valueOf, 0);
    expect(fixBounds(candidate({ key: frozen.id, buyAssetId: frozen.id }))).toEqual({});
    expect(fixBounds(candidate({ key: LIQUIDITY_CANDIDATE_KEY, buyAssetId: LIQUIDITY_CANDIDATE_KEY }))).toEqual({});
  });

  // The base is the page's own: a property net of its mortgage, the accounts net of the personal loans
  // (2026-11-12). Seen red with the property's gross value.
  it('the base nets the property of its mortgage and the accounts of the personal loans, as the page does', () => {
    const accounts = account(10000);
    const personal = loan(2000);
    const house = makeAsset({ type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200000, allocationRole: 'frozen' });
    const mortgage = loan(150000, house.id);
    const etf = makeAsset({ quantity: 1, currentPrice: 40000 });
    const moneyMarket = makeAsset({ type: 'etf', assetClass: 'cash', quantity: 1, currentPrice: 5000 });
    const assets = [accounts, personal, house, mortgage, etf, moneyMarket];

    const s = buildStandaloneCandidates(assets, netValueOf, 0);
    expect(keysOf(s)).toEqual([etf.id, moneyMarket.id, house.id, LIQUIDITY_CANDIDATE_KEY]);
    expect(s.liquidityEur).toBe(8000);
    expect(s.valueOf(s.assetsById.get(house.id)!)).toBe(50000);
    expect(s.baseEur).toBe(103000);
    const held = s.positions.reduce((sum, p) => sum + s.valueOf(s.assetsById.get(p.buyAssetId)!), 0);
    expect(held).toBe(s.baseEur);
    expect(s.baseEur).toBe(compareAllocations(assets, null).marketValue);
    expect(s.fixBounds(candidate({ key: house.id, buyAssetId: house.id }))).toEqual({ lowerPct: 48.54, upperPct: 48.54 });
  });

  it('accounts under the personal loans give a negative liquidity, declared', () => {
    const s = buildStandaloneCandidates([account(1000), loan(3000), makeAsset({ quantity: 1, currentPrice: 9000 })], netValueOf, 0);
    expect(s.liquidityEur).toBe(-2000);
    expect(s.negativeFixedKeys).toEqual([]);
  });

  // The amount to invest comes from the accounts: the base does not grow, the liquidity may fall by it
  // (2026-11-12). Seen red with the amount added to the base and with today's share as the liquidity's floor.
  it('the amount to invest is taken from the accounts', () => {
    const etf = makeAsset({ quantity: 1, currentPrice: 30000 });
    const assets = [account(10000), etf];

    const s = buildStandaloneCandidates(assets, valueOf, 4000);
    expect(s.baseEur).toBe(40000);
    expect(s.fixBounds(candidate({ key: LIQUIDITY_CANDIDATE_KEY, buyAssetId: LIQUIDITY_CANDIDATE_KEY }))).toEqual({ lowerPct: 15 });
    expect(s.fixBounds(candidate({ key: etf.id, buyAssetId: etf.id }))).toEqual({});
    expect(
      buildStandaloneCandidates(assets, valueOf, 0).fixBounds(candidate({ key: LIQUIDITY_CANDIDATE_KEY, buyAssetId: LIQUIDITY_CANDIDATE_KEY }))
    ).toEqual({});
    expect(
      buildStandaloneCandidates(assets, valueOf, 12000).fixBounds(candidate({ key: LIQUIDITY_CANDIDATE_KEY, buyAssetId: LIQUIDITY_CANDIDATE_KEY }))
    ).toEqual({ lowerPct: 0 });

    const result = runOptimizer({
      positions: s.positions,
      assetsById: s.assetsById,
      settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
      mode: 'reachable',
      baseEur: s.baseEur,
      valueOf: s.valueOf,
      targets: { equity: { targetPercentage: 100 } },
      targetLeverageRatio: 1,
      fixBounds: s.fixBounds,
    });
    expect(result.status).toBe('ok');
    expect(pctOf(result, LIQUIDITY_CANDIDATE_KEY)).toBeGreaterThanOrEqual(15);
    expect(pctOf(result, etf.id)).toBeGreaterThanOrEqual(75);
  });

  it('a property worth less than its mortgage is a negative fixed share', () => {
    const house = makeAsset({ type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 100000, allocationRole: 'frozen' });
    const s = buildStandaloneCandidates([house, loan(120000, house.id), makeAsset({ quantity: 1, currentPrice: 50000 })], netValueOf, 0);
    expect(s.negativeFixedKeys).toEqual([house.id]);
  });

  // The fixed rows are named, so the dialog prints «—» for their euro difference (owner, collaudo 2026-11-17).
  it('names the fixed shares: a property and a frozen instrument, never the liquidity or a tradable one', () => {
    const house = makeAsset({ type: 'realestate', assetClass: 'realestate', quantity: 1, currentPrice: 200000, allocationRole: 'frozen' });
    const frozen = makeAsset({ quantity: 1, currentPrice: 7000, allocationRole: 'frozen' });
    const etf = makeAsset({ quantity: 1, currentPrice: 30000 });
    const s = buildStandaloneCandidates([house, frozen, etf, makeAsset({ type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 10000 })], netValueOf, 0);
    expect([...s.fixedKeys].sort()).toEqual([frozen.id, house.id].sort());
  });

  // Every bound on hundredths (2026-11-12): a fixed 7,3456% and a floor of 12,3456% still give weights with
  // at most two decimals, Σ = 100. Seen red with the hundredths grid dropped.
  it('a fixed share and a floor off the half-point grid give weights on hundredths', () => {
    const frozen = makeAsset({ quantity: 1, currentPrice: 7345.6, allocationRole: 'frozen' });
    const held = makeAsset({ quantity: 1, currentPrice: 12345.6 });
    const other = makeAsset({ assetClass: 'bonds', quantity: 1, currentPrice: 30308.8 });
    const s = buildStandaloneCandidates([account(50000), frozen, held, other], valueOf, 0);
    expect(s.baseEur).toBeCloseTo(100000, 6);
    const result = runOptimizer({
      positions: s.positions,
      assetsById: s.assetsById,
      settings: makeSettings({ classPriority: 'essential', leveragePriority: 'off' }),
      mode: 'reachable',
      baseEur: s.baseEur,
      valueOf: s.valueOf,
      targets: { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 30 }, cash: { targetPercentage: 10 } },
      targetLeverageRatio: 1,
      fixBounds: s.fixBounds,
    });
    expect(result.status).toBe('ok');
    const total = result.weights.reduce((sum, w) => sum + w.proposedPct, 0);
    expect(Math.abs(total - 100)).toBeLessThan(1e-9);
    result.weights.forEach((w) => expect(Math.abs(w.proposedPct * 100 - Math.round(w.proposedPct * 100))).toBeLessThan(1e-6));
    expect(pctOf(result, frozen.id)).toBe(7.35);
    expect(pctOf(result, held.id)).toBeGreaterThanOrEqual(12.34);
  });
});

// ---------------------------------------------------------------------------
// evaluateObjectivesAt — what given weights reach, no solver
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

// ---------------------------------------------------------------------------
// The rounding of the proposed weights (2026-11-12)
// ---------------------------------------------------------------------------

describe('roundWeights — Σ = 100 inside the bounds', () => {
  // 500 random boxes, each with a feasible point inside it. Seen red on the floor-every-weight rounding
  // (a weight below its floor) and with the hundredths grid dropped (unrounded weights out of a box on 0,01).
  it('500 seeded boxes: Σ = 100 to 1e-9, lo ≤ w ≤ hi, half points when the half-point grid is feasible', () => {
    const rand = mulberry32(7);
    for (let iteration = 0; iteration < 500; iteration++) {
      const n = 2 + Math.floor(rand() * 6);
      // Bounds on hundredths, as they reach the function (a fixed share or a floor of today's value).
      const lo: number[] = [];
      const hi: number[] = [];
      for (let i = 0; i < n; i++) {
        const l = rand() < 0.4 ? Math.floor(rand() * (60 / n) * 100) / 10000 : 0;
        // A fixed share (a frozen instrument) is a box of width zero, rarely on the half-point grid.
        const fixed = l > 0 && rand() < 0.4;
        const h = fixed ? l : rand() < 0.3 ? Math.min(1, l + Math.floor(rand() * 5000) / 10000) : 1;
        lo.push(l);
        hi.push(h);
      }
      const sumLo = lo.reduce((s, v) => s + v, 0);
      const sumHi = hi.reduce((s, v) => s + v, 0);
      if (sumLo > 1 || sumHi < 1) continue;
      // A point inside the box with Σ = 1: start at the floors, fill toward the caps in order.
      const x = [...lo];
      let left = 1 - sumLo;
      for (let i = 0; i < n && left > 0; i++) {
        const room = Math.min(hi[i] - x[i], left * rand() + (i === n - 1 ? left : 0));
        x[i] += Math.min(room, left);
        left -= Math.min(room, left);
      }
      for (let i = 0; i < n && left > 1e-12; i++) {
        const room = Math.min(hi[i] - x[i], left);
        x[i] += room;
        left -= room;
      }

      const pct = roundWeights(x, lo, hi);
      const total = pct.reduce((s, v) => s + v, 0);
      expect(Math.abs(total - 100)).toBeLessThan(1e-9);
      pct.forEach((p, i) => {
        expect(p).toBeGreaterThanOrEqual(lo[i] * 100 - 1e-9);
        expect(p).toBeLessThanOrEqual(hi[i] * 100 + 1e-9);
        // Never more than two decimals.
        expect(Math.abs(p * 100 - Math.round(p * 100))).toBeLessThan(1e-6);
      });
      const loU = lo.map((l) => Math.ceil(200 * l - 1e-9));
      const hiU = hi.map((h) => Math.floor(200 * h + 1e-9));
      const halfFeasible = loU.every((l, i) => l <= hiU[i]) && loU.reduce((s, v) => s + v, 0) <= 200 && hiU.reduce((s, v) => s + v, 0) >= 200;
      if (halfFeasible) pct.forEach((p) => expect(Math.abs(p * 2 - Math.round(p * 2))).toBeLessThan(1e-6));
    }
  });
});
