/**
 * The model portfolio carries groups of equivalent
 * instruments, a plan's weights become the model and the plan says when it diverges.
 */
import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import type { PlanPosition } from '@/types/accumulationPlan';
import {
  addModelCandidate,
  clearHeldCandidates,
  comparePlanToModel,
  describeModelVsToday,
  MODEL_ERROR_GROUP,
  MODEL_ERROR_NOT_ALLOWED,
  modelGroups,
  planPositionsToModelWeights,
  proposalToModelWeights,
  toModelWeights,
  validateModelWeights,
} from '@/lib/utils/modelPortfolio';
import { applyModelToPositions } from '@/lib/utils/accumulationPlanUtils';
import { buildStandaloneCandidates, LIQUIDITY_CANDIDATE_KEY } from '@/lib/utils/weightOptimizer';

function makeAsset(id: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    userId: 'u1',
    ticker: id,
    name: id,
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

const ETFMONDO = makeAsset('ETFMONDO', { quantity: 10 });
const ETFTREND = makeAsset('ETFTREND', { quantity: 4 });
const ETFTRENDH = makeAsset('ETFTRENDH', { quantity: 0 });
const FONDO = makeAsset('FONDO', { allocationRole: 'frozen' });
const byId = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, a]));
const value = (a: Asset) => a.quantity * a.currentPrice;

const GROUP_MODEL: ModelPortfolio = {
  userId: 'u1',
  origin: 'manual',
  updatedAt: new Date(0),
  weights: [
    { assetId: 'ETFMONDO', targetPercentage: 70 },
    { assetId: 'ETFTRENDH', memberAssetIds: ['ETFTRENDH', 'ETFTREND'], targetPercentage: 30 },
  ],
};

describe('groups in the model', () => {
  it('a model without groups reads and validates as before', () => {
    expect(validateModelWeights([{ assetId: 'ETFMONDO', targetPercentage: 100 }], byId(ETFMONDO))).toBeNull();
    expect(modelGroups([{ assetId: 'ETFMONDO', targetPercentage: 100 }])).toEqual([]);
  });

  it('validates a group; an instrument in two rows or a frozen member is refused', () => {
    expect(validateModelWeights(GROUP_MODEL.weights, byId(ETFMONDO, ETFTREND, ETFTRENDH))).toBeNull();
    expect(
      validateModelWeights(
        [{ assetId: 'ETFMONDO', targetPercentage: 60 }, { assetId: 'ETFTRENDH', memberAssetIds: ['ETFTRENDH', 'ETFMONDO'], targetPercentage: 40 }],
        byId(ETFMONDO, ETFTRENDH),
      ),
    ).toBe(MODEL_ERROR_GROUP);
    expect(
      validateModelWeights([{ assetId: 'ETFTRENDH', memberAssetIds: ['ETFTRENDH', 'FONDO'], targetPercentage: 100 }], byId(ETFTRENDH, FONDO)),
    ).toBe(MODEL_ERROR_NOT_ALLOWED);
    expect(validateModelWeights([{ assetId: 'ETFTRENDH', memberAssetIds: ['ETFTREND', 'ETFMONDO'], targetPercentage: 100 }], byId(ETFTRENDH, ETFTREND, ETFMONDO))).toBe(MODEL_ERROR_GROUP);
  });

  it('toModelWeights keeps a group, drops a member that cannot stay, reports it', () => {
    const r = toModelWeights(
      [{ assetId: 'ETFMONDO', pct: 70 }, { assetId: 'ETFTRENDH', pct: 30, memberAssetIds: ['ETFTRENDH', 'ETFTREND', 'FONDO'] }],
      byId(ETFMONDO, ETFTREND, ETFTRENDH, FONDO),
    );
    expect(r.weights[1]).toEqual({ assetId: 'ETFTRENDH', pct: 30, memberAssetIds: ['ETFTRENDH', 'ETFTREND'] });
    expect(r.excluded).toEqual([{ assetId: 'FONDO', reason: 'frozen' }]);
  });

  it('a group with one member left is the instrument alone', () => {
    const r = toModelWeights([{ assetId: 'ETFTRENDH', pct: 100, memberAssetIds: ['ETFTRENDH', 'FONDO'] }], byId(ETFTRENDH, FONDO));
    expect(r.weights).toEqual([{ assetId: 'ETFTRENDH', pct: 100 }]);
  });

  it('a group is a candidate only while NONE of its members holds shares', () => {
    const proposed = [{ assetId: 'ETFTRENDH', pct: 100, memberAssetIds: ['ETFTRENDH', 'ETFTREND'] }];
    expect(proposalToModelWeights(proposed, byId(ETFTRENDH, ETFTREND), (a) => a.quantity).portfolioWeights[0].candidate).toBeUndefined();
    const empty = makeAsset('ETFTREND', { quantity: 0 });
    expect(proposalToModelWeights(proposed, byId(ETFTRENDH, empty), (a) => a.quantity).portfolioWeights[0].candidate).toBe(true);
    const held = clearHeldCandidates([{ assetId: 'ETFTRENDH', memberAssetIds: ['ETFTRENDH', 'ETFTREND'], targetPercentage: 100, candidate: true }], byId(ETFTRENDH, ETFTREND), (a) => a.quantity);
    expect(held[0].candidate).toBeUndefined();
  });

  it('addModelCandidate does not add a member of an existing group', () => {
    expect(addModelCandidate(GROUP_MODEL.weights, 'ETFTREND')).toBe(GROUP_MODEL.weights);
  });

  it('describeModelVsToday: a group is one row valued as the sum of its members; members never count as outside', () => {
    const r = describeModelVsToday(GROUP_MODEL.weights, [ETFMONDO, ETFTREND, ETFTRENDH], value);
    const group = r.rows.find((row) => row.assetId === 'ETFTRENDH');
    expect(group?.memberAssetIds).toEqual(['ETFTRENDH', 'ETFTREND']);
    expect(r.baseEur).toBe(1400);
    expect(group?.todayPct).toBeCloseTo((400 / 1400) * 100, 6);
    expect(r.outside.assetIds).toEqual([]);
  });

  it('the optimizer sees a group as ONE candidate keyed by its buyer; the others stay singles', () => {
    const standalone = buildStandaloneCandidates([ETFMONDO, ETFTREND, ETFTRENDH], value, 0, new Set(['ETFTRENDH', 'ETFTREND', 'ETFMONDO']), modelGroups(GROUP_MODEL.weights));
    expect(standalone.positions.map((p) => p.key).sort()).toEqual(['ETFMONDO', 'ETFTRENDH', LIQUIDITY_CANDIDATE_KEY]);
    expect(standalone.positions.find((p) => p.key === 'ETFTRENDH')?.memberAssetIds).toEqual(['ETFTRENDH', 'ETFTREND']);
  });

  it('without groups the candidates are the instruments, as before', () => {
    const standalone = buildStandaloneCandidates([ETFMONDO, ETFTREND, ETFTRENDH], value, 0, new Set(['ETFTRENDH']));
    expect(standalone.positions.map((p) => p.key).sort()).toEqual(['ETFMONDO', 'ETFTREND', 'ETFTRENDH', LIQUIDITY_CANDIDATE_KEY]);
  });

  it('the PAC inherits the group: applyModelToPositions merges the singles into one position that buys the head', () => {
    const singles: PlanPosition[] = ['ETFMONDO', 'ETFTREND', 'ETFTRENDH'].map((id) => ({
      id: `p-${id}`,
      label: id,
      targetPercentage: 0,
      memberAssetIds: [id],
      buyAssetId: id,
    }));
    const next = applyModelToPositions(singles, GROUP_MODEL, new Set(), (id) => id, () => 'new');
    expect(next).toHaveLength(2);
    const group = next.find((p) => p.buyAssetId === 'ETFTRENDH');
    expect(group?.memberAssetIds).toEqual(['ETFTRENDH', 'ETFTREND']);
    expect(group?.targetPercentage).toBe(30);
    expect(next.find((p) => p.buyAssetId === 'ETFMONDO')?.targetPercentage).toBe(70);
  });

  it('applyModelToPositions leaves a group alone when a position reaches outside it', () => {
    const positions: PlanPosition[] = [
      { id: 'a', label: 'A', targetPercentage: 50, memberAssetIds: ['ETFTREND', 'ETFMONDO'], buyAssetId: 'ETFTREND' },
      { id: 'b', label: 'B', targetPercentage: 50, memberAssetIds: ['ETFTRENDH'], buyAssetId: 'ETFTRENDH' },
    ];
    const next = applyModelToPositions(positions, GROUP_MODEL, new Set(), (id) => id, () => 'new');
    expect(next.map((p) => p.memberAssetIds)).toEqual([['ETFTREND', 'ETFMONDO'], ['ETFTRENDH']]);
  });
});

describe('the plan becomes the model', () => {
  const positions: PlanPosition[] = [
    { id: 'p1', label: 'ETFMONDO', targetPercentage: 70, memberAssetIds: ['ETFMONDO'], buyAssetId: 'ETFMONDO' },
    { id: 'p2', label: 'ETFTRENDH', targetPercentage: 30, memberAssetIds: ['ETFTRENDH', 'ETFTREND'], buyAssetId: 'ETFTRENDH' },
    { id: 'p3', label: 'zero', targetPercentage: 0, memberAssetIds: ['FONDO'], buyAssetId: 'FONDO' },
  ];

  it('rows carry the buyer and the group, a position at 0 stays out', () => {
    const fit = planPositionsToModelWeights(positions, byId(ETFMONDO, ETFTREND, ETFTRENDH, FONDO), (a) => a.quantity);
    expect(fit.portfolioWeights).toEqual([
      { assetId: 'ETFMONDO', targetPercentage: 70 },
      { assetId: 'ETFTRENDH', memberAssetIds: ['ETFTRENDH', 'ETFTREND'], targetPercentage: 30 },
    ]);
  });

  // Mutation: the `targetPercentage > 0` filter alone → the held row leaves the model → red (phase F of NOVE-21,
  // owner 2026-11-18: a held instrument out of the model left the base, «Oggi» read a weight several times its share).
  it('a HELD position at 0 enters the model at 0, so it stays in the base; one never bought stays out', () => {
    const OLD = makeAsset('ETFVECCHIO', { quantity: 5 });
    const NEVER = makeAsset('ETFMAI', { quantity: 0 });
    const withZeros: PlanPosition[] = [
      positions[0],
      { id: 'p4', label: 'vecchio', targetPercentage: 0, memberAssetIds: ['ETFVECCHIO'], buyAssetId: 'ETFVECCHIO' },
      { id: 'p5', label: 'mai', targetPercentage: 0, memberAssetIds: ['ETFMAI'], buyAssetId: 'ETFMAI' },
      { ...positions[1], targetPercentage: 30 },
    ];
    const assets = byId(ETFMONDO, ETFTREND, ETFTRENDH, OLD, NEVER);
    const fit = planPositionsToModelWeights(withZeros, assets, (a) => a.quantity);
    expect(fit.portfolioWeights).toEqual([
      { assetId: 'ETFMONDO', targetPercentage: 70 },
      { assetId: 'ETFVECCHIO', targetPercentage: 0 },
      { assetId: 'ETFTRENDH', memberAssetIds: ['ETFTRENDH', 'ETFTREND'], targetPercentage: 30 },
    ]);
    expect(validateModelWeights(fit.portfolioWeights, assets)).toBeNull();
  });

  it('a model saved from the plan validates', () => {
    const fit = planPositionsToModelWeights(positions, byId(ETFMONDO, ETFTREND, ETFTRENDH, FONDO), (a) => a.quantity);
    expect(validateModelWeights(fit.portfolioWeights, byId(ETFMONDO, ETFTREND, ETFTRENDH, FONDO))).toBeNull();
  });
});

describe('comparePlanToModel', () => {
  const planPositions: PlanPosition[] = [
    { id: 'p1', label: 'ETFMONDO', targetPercentage: 70, memberAssetIds: ['ETFMONDO'], buyAssetId: 'ETFMONDO' },
    { id: 'p2', label: 'ETFTRENDH', targetPercentage: 30, memberAssetIds: ['ETFTRENDH', 'ETFTREND'], buyAssetId: 'ETFTRENDH' },
  ];

  it('a model saved from the plan\'s own weights: no difference', () => {
    const fit = planPositionsToModelWeights(planPositions, byId(ETFMONDO, ETFTREND, ETFTRENDH), (a) => a.quantity);
    expect(comparePlanToModel(planPositions, { weights: fit.portfolioWeights }).count).toBe(0);
  });

  it('one weight moved by 1 point: one instrument; by 0,4: none', () => {
    const moved = { weights: [{ assetId: 'ETFMONDO', targetPercentage: 71 }, GROUP_MODEL.weights[1]] };
    const result = comparePlanToModel(planPositions, moved);
    expect(result.count).toBe(1);
    expect(result.weightAssetIds).toEqual(['ETFMONDO']);
    const small = { weights: [{ assetId: 'ETFMONDO', targetPercentage: 70.4 }, GROUP_MODEL.weights[1]] };
    expect(comparePlanToModel(planPositions, small).count).toBe(0);
  });

  it('an instrument in only one of the two', () => {
    const model = { weights: [{ assetId: 'ETFMONDO', targetPercentage: 70 }, { assetId: 'ETFMOM', targetPercentage: 30 }] };
    const r = comparePlanToModel(planPositions, model);
    expect(r.onlyInPlanAssetIds).toEqual(['ETFTRENDH']);
    expect(r.onlyInModelAssetIds).toEqual(['ETFMOM']);
    expect(r.count).toBe(2);
  });

  it('a different group or buyer', () => {
    const model = { weights: [{ assetId: 'ETFMONDO', targetPercentage: 70 }, { assetId: 'ETFTREND', memberAssetIds: ['ETFTREND', 'ETFTRENDH'], targetPercentage: 30 }] };
    const r = comparePlanToModel(planPositions, model);
    expect(r.groupAssetIds).toEqual(['ETFTRENDH']);
    expect(r.count).toBe(1);
  });

  it('a candidate at 0 in the model is not a difference', () => {
    const model = { weights: [...GROUP_MODEL.weights, { assetId: 'ETFMOM', targetPercentage: 0, candidate: true }] };
    expect(comparePlanToModel(planPositions, model).count).toBe(0);
  });
});
