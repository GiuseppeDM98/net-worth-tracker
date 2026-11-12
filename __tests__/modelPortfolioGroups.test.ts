/**
 * AL4: the model portfolio carries groups of equivalent
 * instruments (AL16), a plan's weights become the model (AL14) and the plan says when it diverges (AL15).
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
import { buildStandaloneCandidates } from '@/lib/utils/weightOptimizer';

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

const VWCE = makeAsset('VWCE', { quantity: 10 });
const DBMFE = makeAsset('DBMFE', { quantity: 4 });
const MFEH = makeAsset('MFEH', { quantity: 0 });
const FONDO = makeAsset('FONDO', { allocationRole: 'frozen' });
const byId = (...assets: Asset[]) => new Map(assets.map((a) => [a.id, a]));
const value = (a: Asset) => a.quantity * a.currentPrice;

const GROUP_MODEL: ModelPortfolio = {
  userId: 'u1',
  origin: 'manual',
  updatedAt: new Date(0),
  weights: [
    { assetId: 'VWCE', targetPercentage: 70 },
    { assetId: 'MFEH', memberAssetIds: ['MFEH', 'DBMFE'], targetPercentage: 30 },
  ],
};

describe('AL16 — groups in the model', () => {
  it('a model without groups reads and validates as before', () => {
    expect(validateModelWeights([{ assetId: 'VWCE', targetPercentage: 100 }], byId(VWCE))).toBeNull();
    expect(modelGroups([{ assetId: 'VWCE', targetPercentage: 100 }])).toEqual([]);
  });

  it('validates a group; an instrument in two rows or a frozen member is refused', () => {
    expect(validateModelWeights(GROUP_MODEL.weights, byId(VWCE, DBMFE, MFEH))).toBeNull();
    expect(
      validateModelWeights(
        [{ assetId: 'VWCE', targetPercentage: 60 }, { assetId: 'MFEH', memberAssetIds: ['MFEH', 'VWCE'], targetPercentage: 40 }],
        byId(VWCE, MFEH),
      ),
    ).toBe(MODEL_ERROR_GROUP);
    expect(
      validateModelWeights([{ assetId: 'MFEH', memberAssetIds: ['MFEH', 'FONDO'], targetPercentage: 100 }], byId(MFEH, FONDO)),
    ).toBe(MODEL_ERROR_NOT_ALLOWED);
    expect(validateModelWeights([{ assetId: 'MFEH', memberAssetIds: ['DBMFE', 'VWCE'], targetPercentage: 100 }], byId(MFEH, DBMFE, VWCE))).toBe(MODEL_ERROR_GROUP);
  });

  it('toModelWeights keeps a group, drops a member that cannot stay, reports it', () => {
    const r = toModelWeights(
      [{ assetId: 'VWCE', pct: 70 }, { assetId: 'MFEH', pct: 30, memberAssetIds: ['MFEH', 'DBMFE', 'FONDO'] }],
      byId(VWCE, DBMFE, MFEH, FONDO),
    );
    expect(r.weights[1]).toEqual({ assetId: 'MFEH', pct: 30, memberAssetIds: ['MFEH', 'DBMFE'] });
    expect(r.excluded).toEqual([{ assetId: 'FONDO', reason: 'frozen' }]);
  });

  it('a group with one member left is the instrument alone', () => {
    const r = toModelWeights([{ assetId: 'MFEH', pct: 100, memberAssetIds: ['MFEH', 'FONDO'] }], byId(MFEH, FONDO));
    expect(r.weights).toEqual([{ assetId: 'MFEH', pct: 100 }]);
  });

  it('a group is a candidate only while NONE of its members holds shares', () => {
    const proposed = [{ assetId: 'MFEH', pct: 100, memberAssetIds: ['MFEH', 'DBMFE'] }];
    expect(proposalToModelWeights(proposed, byId(MFEH, DBMFE), (a) => a.quantity).portfolioWeights[0].candidate).toBeUndefined();
    const empty = makeAsset('DBMFE', { quantity: 0 });
    expect(proposalToModelWeights(proposed, byId(MFEH, empty), (a) => a.quantity).portfolioWeights[0].candidate).toBe(true);
    const held = clearHeldCandidates([{ assetId: 'MFEH', memberAssetIds: ['MFEH', 'DBMFE'], targetPercentage: 100, candidate: true }], byId(MFEH, DBMFE), (a) => a.quantity);
    expect(held[0].candidate).toBeUndefined();
  });

  it('addModelCandidate does not add a member of an existing group', () => {
    expect(addModelCandidate(GROUP_MODEL.weights, 'DBMFE')).toBe(GROUP_MODEL.weights);
  });

  it('describeModelVsToday: a group is one row valued as the sum of its members; members never count as outside', () => {
    const r = describeModelVsToday(GROUP_MODEL.weights, [VWCE, DBMFE, MFEH], value);
    const group = r.rows.find((row) => row.assetId === 'MFEH');
    expect(group?.memberAssetIds).toEqual(['MFEH', 'DBMFE']);
    expect(r.baseEur).toBe(1400);
    expect(group?.todayPct).toBeCloseTo((400 / 1400) * 100, 6);
    expect(r.outside.assetIds).toEqual([]);
  });

  it('the optimizer sees a group as ONE candidate keyed by its buyer; the others stay singles', () => {
    const standalone = buildStandaloneCandidates([VWCE, DBMFE, MFEH], 1400, value, new Set(['MFEH', 'DBMFE', 'VWCE']), modelGroups(GROUP_MODEL.weights));
    expect(standalone.positions.map((p) => p.key).sort()).toEqual(['MFEH', 'VWCE']);
    expect(standalone.positions.find((p) => p.key === 'MFEH')?.memberAssetIds).toEqual(['MFEH', 'DBMFE']);
  });

  it('without groups the candidates are the instruments, as before', () => {
    const standalone = buildStandaloneCandidates([VWCE, DBMFE, MFEH], 1400, value, new Set(['MFEH']));
    expect(standalone.positions.map((p) => p.key).sort()).toEqual(['DBMFE', 'MFEH', 'VWCE']);
  });

  it('the PAC inherits the group: applyModelToPositions merges the singles into one position that buys the head', () => {
    const singles: PlanPosition[] = ['VWCE', 'DBMFE', 'MFEH'].map((id) => ({
      id: `p-${id}`,
      label: id,
      targetPercentage: 0,
      memberAssetIds: [id],
      buyAssetId: id,
    }));
    const next = applyModelToPositions(singles, GROUP_MODEL, new Set(), (id) => id, () => 'new');
    expect(next).toHaveLength(2);
    const group = next.find((p) => p.buyAssetId === 'MFEH');
    expect(group?.memberAssetIds).toEqual(['MFEH', 'DBMFE']);
    expect(group?.targetPercentage).toBe(30);
    expect(next.find((p) => p.buyAssetId === 'VWCE')?.targetPercentage).toBe(70);
  });

  it('applyModelToPositions leaves a group alone when a position reaches outside it', () => {
    const positions: PlanPosition[] = [
      { id: 'a', label: 'A', targetPercentage: 50, memberAssetIds: ['DBMFE', 'VWCE'], buyAssetId: 'DBMFE' },
      { id: 'b', label: 'B', targetPercentage: 50, memberAssetIds: ['MFEH'], buyAssetId: 'MFEH' },
    ];
    const next = applyModelToPositions(positions, GROUP_MODEL, new Set(), (id) => id, () => 'new');
    expect(next.map((p) => p.memberAssetIds)).toEqual([['DBMFE', 'VWCE'], ['MFEH']]);
  });
});

describe('AL14 — the plan becomes the model', () => {
  const positions: PlanPosition[] = [
    { id: 'p1', label: 'VWCE', targetPercentage: 70, memberAssetIds: ['VWCE'], buyAssetId: 'VWCE' },
    { id: 'p2', label: 'MFEH', targetPercentage: 30, memberAssetIds: ['MFEH', 'DBMFE'], buyAssetId: 'MFEH' },
    { id: 'p3', label: 'zero', targetPercentage: 0, memberAssetIds: ['FONDO'], buyAssetId: 'FONDO' },
  ];

  it('rows carry the buyer and the group, a position at 0 stays out', () => {
    const fit = planPositionsToModelWeights(positions, byId(VWCE, DBMFE, MFEH, FONDO), (a) => a.quantity);
    expect(fit.portfolioWeights).toEqual([
      { assetId: 'VWCE', targetPercentage: 70 },
      { assetId: 'MFEH', memberAssetIds: ['MFEH', 'DBMFE'], targetPercentage: 30 },
    ]);
  });

  it('a model saved from the plan validates', () => {
    const fit = planPositionsToModelWeights(positions, byId(VWCE, DBMFE, MFEH, FONDO), (a) => a.quantity);
    expect(validateModelWeights(fit.portfolioWeights, byId(VWCE, DBMFE, MFEH, FONDO))).toBeNull();
  });
});

describe('AL15 — comparePlanToModel', () => {
  const planPositions: PlanPosition[] = [
    { id: 'p1', label: 'VWCE', targetPercentage: 70, memberAssetIds: ['VWCE'], buyAssetId: 'VWCE' },
    { id: 'p2', label: 'MFEH', targetPercentage: 30, memberAssetIds: ['MFEH', 'DBMFE'], buyAssetId: 'MFEH' },
  ];

  it('a model saved from the plan\'s own weights: no difference', () => {
    const fit = planPositionsToModelWeights(planPositions, byId(VWCE, DBMFE, MFEH), (a) => a.quantity);
    expect(comparePlanToModel(planPositions, { weights: fit.portfolioWeights }).count).toBe(0);
  });

  it('one weight moved by 1 point: one instrument; by 0,4: none', () => {
    const moved = { weights: [{ assetId: 'VWCE', targetPercentage: 71 }, GROUP_MODEL.weights[1]] };
    const result = comparePlanToModel(planPositions, moved);
    expect(result.count).toBe(1);
    expect(result.weightAssetIds).toEqual(['VWCE']);
    const small = { weights: [{ assetId: 'VWCE', targetPercentage: 70.4 }, GROUP_MODEL.weights[1]] };
    expect(comparePlanToModel(planPositions, small).count).toBe(0);
  });

  it('an instrument in only one of the two', () => {
    const model = { weights: [{ assetId: 'VWCE', targetPercentage: 70 }, { assetId: 'XDEM', targetPercentage: 30 }] };
    const r = comparePlanToModel(planPositions, model);
    expect(r.onlyInPlanAssetIds).toEqual(['MFEH']);
    expect(r.onlyInModelAssetIds).toEqual(['XDEM']);
    expect(r.count).toBe(2);
  });

  it('a different group or buyer', () => {
    const model = { weights: [{ assetId: 'VWCE', targetPercentage: 70 }, { assetId: 'DBMFE', memberAssetIds: ['DBMFE', 'MFEH'], targetPercentage: 30 }] };
    const r = comparePlanToModel(planPositions, model);
    expect(r.groupAssetIds).toEqual(['MFEH']);
    expect(r.count).toBe(1);
  });

  it('a candidate at 0 in the model is not a difference', () => {
    const model = { weights: [...GROUP_MODEL.weights, { assetId: 'XDEM', targetPercentage: 0, candidate: true }] };
    expect(comparePlanToModel(planPositions, model).count).toBe(0);
  });
});
