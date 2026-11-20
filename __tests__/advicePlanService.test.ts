/**
 * Tests for lib/services/advicePlanService.ts › executeAdvicePlan — the click of the Consulente's
 * «Applica» that creates the plan of accumulation (2026-11-20), with every service it calls mocked.
 *
 * The order is the contract: the account re-checked on the re-read assets before anything is
 * written, then the setting, the instruments (each matched before it is created), the plan and its
 * activation, the model. A step that fails says which, and what was done before it. Each block names
 * the mutation that turns it red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Asset } from '@/types/assets';
import type { AccumulationPlan, AccumulationPlanDraft } from '@/types/accumulationPlan';

let stored: Asset[] = [];
let createdSeq = 0;
const getAllAssets = vi.fn(async () => stored.map((asset) => ({ ...asset })));
const createAsset = vi.fn(async (_owner: string, data: { name: string; isin?: string }) => {
  const id = `created-${++createdSeq}`;
  stored = [...stored, asset(id, data.name, { isin: data.isin, quantity: 0, createdEmpty: true })];
  return id;
});
const createAndActivatePlan = vi.fn(async () => ({ planId: 'plan-new', modelError: null as string | null }));
const revisePlan = vi.fn(async () => undefined);
const saveModelPortfolio = vi.fn(async () => undefined);
const setSettings = vi.fn(async () => undefined);

vi.mock('@/lib/services/assetService', () => ({
  getAllAssets: () => getAllAssets(),
  createAsset: (owner: string, data: { name: string; isin?: string }) => createAsset(owner, data),
}));
vi.mock('@/lib/services/accumulationPlanService', () => {
  class PlanWriteError extends Error {
    step: string; planId?: string;
    constructor(step: string, message: string, options: { planId?: string } = {}) { super(message); this.step = step; this.planId = options.planId; }
  }
  return {
    PlanWriteError,
    createAndActivatePlan: (...args: unknown[]) => createAndActivatePlan(...(args as [])),
    revisePlan: (...args: unknown[]) => revisePlan(...(args as [])),
  };
});
vi.mock('@/lib/services/modelPortfolioService', () => ({ saveModelPortfolio: (...args: unknown[]) => saveModelPortfolio(...(args as [])) }));
vi.mock('@/lib/services/assetAllocationService', () => ({ setSettings: (...args: unknown[]) => setSettings(...(args as [])) }));

import { executeAdvicePlan, AdvicePlanError, type AdvicePlanRun } from '@/lib/services/advicePlanService';
import { PlanWriteError } from '@/lib/services/accumulationPlanService';
import { ADVICE_PLAN_COPY, type AdvicePlanBuild } from '@/lib/utils/advicePlan';
import { MODEL_NO_TRADABLE_INSTRUMENTS } from '@/lib/utils/modelPortfolio';

const TODAY = new Date('2026-11-20T12:00:00');

function asset(id: string, name: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id, userId: 'u1', ticker: id.toUpperCase(), name, type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 10, currentPrice: 100, lastPriceUpdate: TODAY, createdAt: TODAY, updatedAt: TODAY, ...overrides,
  };
}

const PORTFOLIO = () => [
  asset('conto', 'Conto', { type: 'cash', assetClass: 'cash', quantity: 10000, currentPrice: 1 }),
  asset('etf-a', 'ETF A', { quantity: 60 }),
  asset('etf-b', 'ETF B', { quantity: 20 }),
];

const DRAFT: AccumulationPlanDraft = {
  name: 'Piano di accumulo',
  startMonth: '2026-12',
  months: 12,
  liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 300, monthlyInflowEur: 500 },
  positions: [
    { id: 'p1', label: 'ETF A', targetPercentage: 60, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
    { id: 'p2', label: 'ETF B', targetPercentage: 0, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
    { id: 'p3', label: 'ETF Nuovo', targetPercentage: 40, memberAssetIds: ['new:N1'], buyAssetId: 'new:N1' },
  ],
  disposals: [],
  reviewMonthIndex: 6,
  advisorNotes: ['ETF A: limite applicato.'],
};

function build(overrides: Partial<AdvicePlanBuild> = {}): AdvicePlanBuild {
  return {
    action: 'create',
    reconciled: { months: 12 } as never,
    notes: [],
    toCreate: [{
      ref: 'N1',
      formData: { name: 'ETF Nuovo', ticker: 'NEW1.MI', isin: 'IE000NEW0001', type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 0, createdEmpty: true, currentPrice: 50, autoUpdatePrice: true },
      pricing: { kind: 'priced', quote: { symbol: 'NEW1.MI', price: 50, currency: 'EUR', priceEur: 50, quotedAt: '2026-11-19T16:30:00.000Z' } },
    }],
    draft: DRAFT,
    firstIndex: 1,
    preview: {} as never,
    issues: [],
    blocked: null,
    ...overrides,
  };
}

const BASIS = { targets: { equity: { targetPercentage: 100 } }, criteria: {} as never, goals: [{ id: 'g-written', targetAmount: 1000, priority: 'alta' as const }] };

function run(overrides: Partial<AdvicePlanRun> = {}): AdvicePlanRun {
  return {
    ownerId: 'u1',
    build: build(),
    assets: PORTFOLIO(),
    openPlan: null,
    targets: { equity: { targetPercentage: 100 } },
    basis: BASIS,
    saveSourceAsSetting: false,
    sourceAssetId: 'conto',
    compare: (() => ({})) as never,
    deps: { valueOf: (a: Asset) => a.quantity * a.currentPrice, priceOf: (a: Asset) => a.currentPrice },
    today: TODAY,
    ...overrides,
  };
}

beforeEach(() => {
  stored = PORTFOLIO();
  createdSeq = 0;
  for (const fn of [getAllAssets, createAsset, createAndActivatePlan, revisePlan, saveModelPortfolio, setSettings]) fn.mockClear();
  createAndActivatePlan.mockImplementation(async () => ({ planId: 'plan-new', modelError: null }));
  revisePlan.mockImplementation(async () => undefined);
  saveModelPortfolio.mockImplementation(async () => undefined);
});

// Mutation that turns it red: call `createAndActivatePlan` before creating the instruments.
describe('a new plan', () => {
  it('creates each missing instrument, THEN the plan on the real ids with the model of its weights', async () => {
    const result = await executeAdvicePlan(run({ saveSourceAsSetting: true }));
    expect(result).toEqual({ planId: 'plan-new', action: 'create', modelError: null });
    expect(setSettings).toHaveBeenCalledWith('u1', { investmentCashAssetId: 'conto' });
    expect(createAsset).toHaveBeenCalledTimes(1);
    expect(createAsset.mock.invocationCallOrder[0]).toBeLessThan(createAndActivatePlan.mock.invocationCallOrder[0]);
    expect(createAndActivatePlan).toHaveBeenCalledTimes(1);
    const call = (createAndActivatePlan.mock.calls[0] as unknown as [Record<string, never>])[0] as unknown as {
      draft: AccumulationPlanDraft; existingDraftId?: string; activate: { allAssets: Asset[] };
      model: { input: { weights: Array<{ assetId: string; targetPercentage: number }>; origin: string }; basis: unknown };
    };
    expect(call.existingDraftId).toBeUndefined();
    expect(call.draft.positions.map((p) => p.buyAssetId)).toEqual(['etf-a', 'etf-b', 'created-1']);
    expect(call.activate.allAssets.map((a) => a.id)).toContain('created-1');
    expect(call.model.input.origin).toBe('manual');
    expect(call.model.input.weights.map((w) => [w.assetId, w.targetPercentage])).toEqual([['etf-a', 60], ['etf-b', 0], ['created-1', 40]]);
    expect(call.model.basis).toBe(BASIS);
  });

  // The swap (owner, 2026-11-20). Mutation that turns it red: the bought instrument left on its `new:` id.
  it('a swap toward a new instrument names the created id on the sale', async () => {
    const swapDraft = { ...DRAFT, disposals: [{ assetId: 'etf-b', estimatedProceedsEur: 2000, status: 'planned' as const, reinvestAssetId: 'new:N1' }] };
    await executeAdvicePlan(run({ build: build({ draft: swapDraft }) }));
    const call = (createAndActivatePlan.mock.calls[0] as unknown as [{ draft: AccumulationPlanDraft }])[0];
    expect(call.draft.disposals).toEqual([expect.objectContaining({ assetId: 'etf-b', reinvestAssetId: 'created-1' })]);
  });

  it('no weight the model can hold → the plan without the model, and the sentence', async () => {
    const onlyNew = { ...DRAFT, positions: [] };
    const result = await executeAdvicePlan(run({ build: build({ toCreate: [], draft: onlyNew }) }));
    expect((createAndActivatePlan.mock.calls[0] as unknown as [{ model?: unknown }])[0].model).toBeUndefined();
    expect(result.modelError).toBe(MODEL_NO_TRADABLE_INSTRUMENTS);
  });
});

// Mutation that turns it red: pass `reconciled.months` as the revision's months.
describe('an open plan', () => {
  const draftPlan = { id: 'draft-1', status: 'draft', disposals: [] } as unknown as AccumulationPlan;
  const activePlan = {
    id: 'active-1', status: 'active',
    disposals: [
      { assetId: 'etf-b', quantity: 5, monthIndex: 4, estimatedProceedsEur: 500, status: 'planned' },
      { assetId: 'etf-c', quantity: 2, monthIndex: 5, estimatedProceedsEur: 200, status: 'planned' },
    ],
  } as unknown as AccumulationPlan;

  it('a draft → createAndActivatePlan on that draft', async () => {
    await executeAdvicePlan(run({ build: build({ action: 'replace' }), openPlan: draftPlan }));
    expect((createAndActivatePlan.mock.calls[0] as unknown as [{ existingDraftId?: string }])[0].existingDraftId).toBe('draft-1');
  });

  it('an active plan → revisePlan from the draft as it is, then the model; never createAndActivatePlan', async () => {
    const revised: AccumulationPlanDraft = {
      ...DRAFT, startMonth: '2026-11', months: 57,
      disposals: [{ assetId: 'etf-b', quantity: 5, monthIndex: 6, estimatedProceedsEur: 500, status: 'planned' }],
    };
    const result = await executeAdvicePlan(run({
      build: build({ action: 'revise', firstIndex: 4, draft: revised, reconciled: { months: 60 } as never }),
      openPlan: activePlan,
    }));
    expect(result).toMatchObject({ planId: 'active-1', action: 'revise', modelError: null });
    expect(createAndActivatePlan).not.toHaveBeenCalled();
    const [planId, revision] = revisePlan.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(planId).toBe('active-1');
    expect(revision).toMatchObject({
      monthlyInflowEur: 500, reserveEur: 300, remainingMonths: 57, sourceCashAssetIds: ['conto'],
      reviewMonthIndex: 6, advisorNotes: ['ETF A: limite applicato.'],
      disposals: [], removedDisposalAssetIds: ['etf-c'], movedDisposalMonthIndexes: { 'etf-b': 6 },
    });
    expect(saveModelPortfolio).toHaveBeenCalledTimes(1);
    expect(saveModelPortfolio.mock.invocationCallOrder[0]).toBeGreaterThan(revisePlan.mock.invocationCallOrder[0]);
  });
});

// Mutation that turns it red: create the instruments from the page's assets, without the re-read.
describe('failures and a second press', () => {
  it('an activation that fails → the step activate, after the instruments and the plan', async () => {
    createAndActivatePlan.mockImplementationOnce(async () => { throw new PlanWriteError('activate', 'Rete assente.', { planId: 'plan-new' }); });
    const error = await executeAdvicePlan(run()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AdvicePlanError);
    expect((error as AdvicePlanError).step).toBe('activate');
    expect((error as AdvicePlanError).done).toEqual(['instruments', 'plan']);
    expect((error as AdvicePlanError).message).toBe('Rete assente.');
  });

  it('a second press finds the instrument the first one created: none is created again', async () => {
    stored = [...PORTFOLIO(), asset('made-before', 'Altro nome', { isin: 'IE000NEW0001', quantity: 0, createdEmpty: true })];
    await executeAdvicePlan(run());
    expect(createAsset).not.toHaveBeenCalled();
    const call = (createAndActivatePlan.mock.calls[0] as unknown as [{ draft: AccumulationPlanDraft }])[0];
    expect(call.draft.positions.map((p) => p.buyAssetId)).toContain('made-before');
  });

  it('a model that cannot be written comes back with the plan, never as a throw', async () => {
    createAndActivatePlan.mockImplementationOnce(async () => ({ planId: 'plan-new', modelError: 'Modello non salvato.' }));
    expect((await executeAdvicePlan(run())).modelError).toBe('Modello non salvato.');
    saveModelPortfolio.mockImplementationOnce(async () => { throw new Error('rete'); });
    const active = { id: 'active-1', status: 'active', disposals: [] } as unknown as AccumulationPlan;
    const revised = await executeAdvicePlan(run({ build: build({ action: 'revise', toCreate: [], draft: { ...DRAFT, positions: DRAFT.positions.slice(0, 2) } }), openPlan: active }));
    expect(typeof revised.modelError).toBe('string');
  });

  it('the account gone from the re-read → nothing written, the setting included', async () => {
    stored = PORTFOLIO().filter((a) => a.id !== 'conto');
    const error = await executeAdvicePlan(run({ saveSourceAsSetting: true })).catch((e: unknown) => e);
    expect((error as AdvicePlanError).step).toBe('plan');
    expect((error as AdvicePlanError).done).toEqual([]);
    expect((error as AdvicePlanError).message).toBe(ADVICE_PLAN_COPY.sourceGone);
    for (const fn of [setSettings, createAsset, createAndActivatePlan, revisePlan, saveModelPortfolio]) expect(fn).not.toHaveBeenCalled();
  });

  it('refuses a build the page should never send', async () => {
    await expect(executeAdvicePlan(run({ build: build({ blocked: 'No.' }) }))).rejects.toThrow();
    expect(getAllAssets).not.toHaveBeenCalled();
  });
});
