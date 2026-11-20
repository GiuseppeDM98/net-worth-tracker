/**
 * Tests for lib/utils/planPath.ts — the guided path that creates a plan of accumulation by hand
 * (2026-11-20, doc/guide/accumulo.md § Creare un piano: il percorso). Pure: the reducer, the seeding of the
 * quotas, the blocks of each screen, the summary's refusal, the draft the path writes and the browser draft's
 * restore. Figures invented and round; `compare` is a stub that reads the cash class off the assets.
 * Each block names the mutation that turns it red.
 */
import { describe, expect, it } from 'vitest';
import type { Asset, AllocationResult, AssetAllocationTarget } from '@/types/assets';
import type { AccumulationPlan, PlanSeedDraft } from '@/types/accumulationPlan';
import type { ModelPortfolio } from '@/types/modelPortfolio';
import { DEFAULT_REBALANCE_BAND } from '@/lib/utils/allocationUtils';
import { describeDraftIssue } from '@/lib/utils/accumulationNarrative';
import { ACCUMULO_STEP2_PENDING_ASSET_LABEL } from '@/lib/utils/accumulationNarrative';
import {
  PLAN_PATH_SCREENS,
  describePlanPathBlock,
  firstPlanPathRefusal,
  initialPlanPathDraft,
  parseStoredPlanPath,
  planPathReducer,
  planPathStorageKey,
  planPathToDraft,
  planPathTodayWeights,
  reconcilePlanPathAnswers,
  resolvePathReserveEur,
  restorePlanPathDraft,
  seedPlanPathPositions,
  seededPlanPathDraft,
  type PlanPathAnswers,
  type PlanPathContext,
  type PlanPathDraft,
} from '@/lib/utils/planPath';
import { buildPlanPathSummary } from '@/lib/utils/planPathNarrative';

const TODAY = new Date('2026-11-20T12:00:00');

function asset(id: string, name: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id, userId: 'u1', ticker: id.toUpperCase(), name, type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 100, lastPriceUpdate: TODAY, createdAt: TODAY, updatedAt: TODAY, ...overrides,
  };
}

const conto = (quantity = 4000) => asset('conto', 'Conto ornitorinco', { type: 'cash', assetClass: 'cash', quantity, currentPrice: 1 });
const conto2 = (quantity = 5000) => asset('conto-2', 'Conto fenicottero', { type: 'cash', assetClass: 'cash', quantity, currentPrice: 1 });
const etfA = (quantity = 60) => asset('etf-a', 'ETF ornitorinco', { quantity });
const etfB = (quantity = 40) => asset('etf-b', 'ETF fenicottero', { quantity });
const etfC = (quantity = 50) => asset('etf-c', 'ETF airone', { assetClass: 'bonds', quantity });
const fondoM = () => asset('mm', 'Fondo monetario', { assetClass: 'cash', quantity: 10 });

const DEPS = { valueOf: (a: Asset) => a.quantity * a.currentPrice, priceOf: (a: Asset) => a.currentPrice };

/** The cash class is every cash-class asset; the market base every asset. Enough for the reserve. */
const compare = (assets: Asset[]): AllocationResult => {
  const cash = assets.filter((a) => a.assetClass === 'cash').reduce((s, a) => s + DEPS.valueOf(a), 0);
  const total = assets.reduce((s, a) => s + DEPS.valueOf(a), 0);
  return { byAssetClass: { cash: { currentValue: cash } }, bySubCategory: {}, bySpecificAsset: {}, totalValue: total, marketValue: total } as unknown as AllocationResult;
};

const TARGETS: AssetAllocationTarget = {
  equity: { targetPercentage: 80 },
  cash: { targetPercentage: 20, useFixedAmount: true, fixedAmount: 10000 },
};

function context(overrides: Partial<PlanPathContext> = {}): PlanPathContext {
  return {
    assets: [conto(), etfA(), etfB()],
    targets: TARGETS,
    band: DEFAULT_REBALANCE_BAND,
    model: null,
    investmentAccountId: 'conto',
    openDraft: null,
    tradedAssetIds: null,
    holdings: [],
    reviewByIso: null,
    compare,
    deps: DEPS,
    todayMonth: '2026-11',
    ...overrides,
  };
}

function answers(overrides: Partial<PlanPathAnswers> = {}): PlanPathAnswers {
  return {
    start: 'today', monthlyInflowEur: 500, months: 12, sourceIds: ['conto'], reserveEur: null, wantsSales: false, sales: [],
    positions: [
      { id: 'p-a', label: 'ETF ornitorinco', targetPercentage: 60, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
      { id: 'p-b', label: 'ETF fenicottero', targetPercentage: 40, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
    ],
    updateModel: null,
    ...overrides,
  };
}

const byLabel = (positions: PlanPathAnswers['positions']) =>
  Object.fromEntries(positions.map((p) => [p.label, p.targetPercentage]));

function openDraft(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  return {
    id: 'draft-1', userId: 'u1', name: 'Piano airone', status: 'draft', startMonth: '2026-12', months: 24,
    liquidity: { sourceCashAssetIds: ['conto-2'], reserveEur: 2000, monthlyInflowEur: 300 },
    positions: [
      { id: 'd-a', label: 'ETF ornitorinco', targetPercentage: 50, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
      { id: 'd-b', label: 'ETF fenicottero', targetPercentage: 50, memberAssetIds: ['etf-b'], buyAssetId: 'etf-b' },
    ],
    disposals: [{ assetId: 'etf-a', quantity: 10, monthIndex: 3, estimatedProceedsEur: 1000, status: 'planned' }],
    installments: [], reviewMonthIndex: 6, advisorNotes: ['Una nota.'],
    createdAt: TODAY, updatedAt: TODAY,
    ...overrides,
  };
}

describe('planPathReducer — the walk (mutation: allow next past the summary)', () => {
  it('next/back walk the eight screens; back on the first and next on the last do nothing', () => {
    expect(PLAN_PATH_SCREENS).toEqual(['partenza', 'versamento', 'durata', 'conto', 'riserva', 'vendite', 'strumenti', 'riepilogo']);
    let draft = initialPlanPathDraft(context());
    expect(draft.screen).toBe('partenza');
    expect(planPathReducer(draft, { type: 'back' }).screen).toBe('partenza');
    const seen = [draft.screen];
    for (let i = 0; i < 7; i++) {
      draft = planPathReducer(draft, { type: 'next' });
      seen.push(draft.screen);
    }
    expect(seen).toEqual([...PLAN_PATH_SCREENS]);
    expect(planPathReducer(draft, { type: 'next' }).screen).toBe('riepilogo');
    expect(planPathReducer(draft, { type: 'back' }).screen).toBe('strumenti');
  });
});

describe('seedPlanPathPositions (mutation: seed from the base without filtering the sold)', () => {
  it('today on ETF A 6.000 / ETF B 4.000 → 60 / 40; zero → 0 / 0', () => {
    const ctx = context();
    expect(byLabel(seedPlanPathPositions('today', answers(), ctx))).toEqual({ 'ETF ornitorinco': 60, 'ETF fenicottero': 40 });
    expect(byLabel(seedPlanPathPositions('zero', answers(), ctx))).toEqual({ 'ETF ornitorinco': 0, 'ETF fenicottero': 0 });
  });

  it('model → the model weights, its group as one row', () => {
    const model: ModelPortfolio = {
      userId: 'u1', origin: 'manual', updatedAt: TODAY,
      weights: [
        { assetId: 'etf-a', memberAssetIds: ['etf-a', 'etf-b'], targetPercentage: 70 },
        { assetId: 'etf-c', targetPercentage: 30 },
      ],
    };
    const ctx = context({ assets: [conto(), etfA(), etfB(), etfC()], model });
    const positions = seedPlanPathPositions('model', answers(), ctx);
    expect(positions).toHaveLength(2);
    const group = positions.find((p) => p.memberAssetIds.length === 2);
    expect(group).toMatchObject({ buyAssetId: 'etf-a', targetPercentage: 70, memberAssetIds: ['etf-a', 'etf-b'] });
    expect(positions.find((p) => p.buyAssetId === 'etf-c')?.targetPercentage).toBe(30);
  });

  it('with ETF C 5.000 sold whole, C has no row and today gives A 60 / B 40', () => {
    const ctx = context({ assets: [conto(), etfA(), etfB(), etfC()] });
    const sold = answers({ wantsSales: true, sales: [{ assetId: 'etf-c', quantity: null, month: 1 }] });
    const positions = seedPlanPathPositions('today', sold, ctx);
    expect(positions.map((p) => p.buyAssetId).sort()).toEqual(['etf-a', 'etf-b']);
    expect(byLabel(positions)).toEqual({ 'ETF ornitorinco': 60, 'ETF fenicottero': 40 });
  });

  it('a held buyable instrument the seed does not name gets a row at 0 %', () => {
    const seed: PlanSeedDraft = { positions: [{ id: 's-a', label: 'ETF ornitorinco', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }] };
    const ctx = context();
    const draft = planPathReducer(seededPlanPathDraft(seed, 'conto'), { type: 'start', start: 'seed', context: ctx });
    expect(byLabel(draft.answers.positions)).toEqual({ 'ETF ornitorinco': 100, 'ETF fenicottero': 0 });
  });
});

describe('describePlanPathBlock (mutation: drop the Σ check)', () => {
  const ctx = context();
  it('says each block of the table', () => {
    expect(describePlanPathBlock('partenza', answers({ start: null }), ctx)).toBe('Scegli da dove partire.');
    for (const monthlyInflowEur of [null, -1, Number.NaN]) {
      expect(describePlanPathBlock('versamento', answers({ monthlyInflowEur }), ctx)).toBe('Scrivi quanto versi ogni mese, anche 0.');
    }
    for (const months of [null, 0, 61, 2.5]) {
      expect(describePlanPathBlock('durata', answers({ months }), ctx)).toBe('Scrivi una durata fra 1 e 60 mesi.');
    }
    expect(describePlanPathBlock('conto', answers(), context({ assets: [etfA(), etfB()] }))).toBe('Non hai un conto di liquidità: creane uno in Patrimonio.');
    expect(describePlanPathBlock('conto', answers({ sourceIds: [] }), ctx)).toBe('Scegli almeno un conto.');
    expect(describePlanPathBlock('riserva', answers({ reserveEur: -10 }), ctx)).toBe('La riserva non può essere negativa.');
    expect(describePlanPathBlock('vendite', answers({ wantsSales: null }), ctx)).toBe('Scegli se vendere qualcosa.');
    expect(describePlanPathBlock('vendite', answers({ wantsSales: true, sales: [{ assetId: 'etf-a', quantity: 0, month: 1 }] }), ctx)).toBe(
      'ETF ornitorinco: scrivi quante quote vendere, almeno 1.'
    );
    expect(describePlanPathBlock('vendite', answers({ wantsSales: true, sales: [{ assetId: 'etf-a', quantity: 10, month: 13 }] }), ctx)).toBe(
      describeDraftIssue({ code: 'sale_month_out', label: 'ETF ornitorinco' })
    );
    expect(describePlanPathBlock('strumenti', answers({ positions: answers().positions.map((p) => ({ ...p, targetPercentage: 0 })) }), ctx)).toBe(
      'Il piano deve comprare almeno uno strumento.'
    );
    const ninety = answers().positions.map((p, i) => ({ ...p, targetPercentage: i === 0 ? 50 : 40 }));
    expect(describePlanPathBlock('strumenti', answers({ positions: ninety }), ctx)).toBe('Le quote sommano a 90,00%: devono fare 100.');
  });

  it('a group member sold at its whole quantity is the «al massimo» block', () => {
    const group = answers({
      positions: [{ id: 'g', label: 'Gruppo', targetPercentage: 100, memberAssetIds: ['etf-a', 'etf-b'], buyAssetId: 'etf-a' }],
      wantsSales: true,
      sales: [{ assetId: 'etf-b', quantity: 40, month: 1 }],
    });
    expect(describePlanPathBlock('vendite', group, ctx)).toBe('ETF fenicottero: puoi vendere al massimo 39 quote.');
  });

  it('is null on valid answers, «Sì» with no sale included', () => {
    for (const screen of PLAN_PATH_SCREENS) expect(describePlanPathBlock(screen, answers(), ctx)).toBeNull();
    expect(describePlanPathBlock('vendite', answers({ wantsSales: true, sales: [] }), ctx)).toBeNull();
    expect(describePlanPathBlock('riserva', answers({ reserveEur: null }), ctx)).toBeNull();
    expect(describePlanPathBlock('versamento', answers({ monthlyInflowEur: 0 }), ctx)).toBeNull();
  });
});

describe('planPathReducer › sale (mutation: keep the row on a whole sale)', () => {
  const ctx = context();
  const start = (): PlanPathDraft => ({ version: 1, screen: 'vendite', answers: answers({ wantsSales: true }) });

  it('30 of 40 is partial and the row stays; 40 of 40 is every share and the row goes; taken back it returns at 0 %', () => {
    const base = { version: 1 as const, screen: 'vendite' as const, answers: answers({ wantsSales: true }) };
    const partial = planPathReducer(base, { type: 'sale', sale: { assetId: 'etf-b', quantity: 30, month: 2 }, context: ctx });
    expect(partial.answers.sales).toEqual([{ assetId: 'etf-b', quantity: 30, month: 2 }]);
    expect(partial.answers.positions.some((p) => p.buyAssetId === 'etf-b')).toBe(true);

    const whole = planPathReducer(partial, { type: 'sale', sale: { assetId: 'etf-b', quantity: 40, month: 2 }, context: ctx });
    expect(whole.answers.sales).toEqual([{ assetId: 'etf-b', quantity: null, month: 2 }]);
    expect(whole.answers.positions.some((p) => p.memberAssetIds.includes('etf-b'))).toBe(false);

    const back = planPathReducer(whole, { type: 'sale', sale: { assetId: 'etf-b', remove: true }, context: ctx });
    expect(back.answers.sales).toEqual([]);
    expect(back.answers.positions.find((p) => p.buyAssetId === 'etf-b')?.targetPercentage).toBe(0);
  });

  it('floors the quantity', () => {
    const next = planPathReducer(start(), { type: 'sale', sale: { assetId: 'etf-b', quantity: 12.7, month: 1 }, context: ctx });
    expect(next.answers.sales[0].quantity).toBe(12);
  });

  it('a group member at 40 of 40 is kept at 40 and blocked', () => {
    const grouped: PlanPathDraft = {
      version: 1,
      screen: 'vendite',
      answers: answers({ wantsSales: true, positions: [{ id: 'g', label: 'Gruppo', targetPercentage: 100, memberAssetIds: ['etf-a', 'etf-b'], buyAssetId: 'etf-a' }] }),
    };
    const next = planPathReducer(grouped, { type: 'sale', sale: { assetId: 'etf-b', quantity: 40, month: 1 }, context: ctx });
    expect(next.answers.sales).toEqual([{ assetId: 'etf-b', quantity: 40, month: 1 }]);
    expect(next.answers.positions).toHaveLength(1);
    expect(describePlanPathBlock('vendite', next.answers, ctx)).toBe('ETF fenicottero: puoi vendere al massimo 39 quote.');
  });

  it('wantsSales false removes every sale and gives the rows back', () => {
    const sold = planPathReducer(start(), { type: 'sale', sale: { assetId: 'etf-b', quantity: null, month: 1 }, context: ctx });
    const no = planPathReducer(sold, { type: 'wantsSales', value: false, context: ctx });
    expect(no.answers.wantsSales).toBe(false);
    expect(no.answers.sales).toEqual([]);
    expect(no.answers.positions.some((p) => p.buyAssetId === 'etf-b')).toBe(true);
  });
});

describe('the drafts the path starts from (mutation: read monthIndex as 1)', () => {
  it('initialPlanPathDraft without a draft: partenza, the investment account, 12 months', () => {
    const draft = initialPlanPathDraft(context());
    expect(draft).toMatchObject({ version: 1, screen: 'partenza' });
    expect(draft.answers).toMatchObject({ start: null, months: 12, sourceIds: ['conto'], wantsSales: null, sales: [], positions: [] });
    expect(initialPlanPathDraft(context({ investmentAccountId: null })).answers.sourceIds).toEqual([]);
  });

  it('initialPlanPathDraft with an open draft continues it, the month-3 sale in month 3', () => {
    const draft = initialPlanPathDraft(context({ assets: [conto(), conto2(), etfA(), etfB()], openDraft: openDraft() }));
    expect(draft.screen).toBe('partenza');
    expect(draft.answers).toMatchObject({
      start: 'draft', serverDraftId: 'draft-1', name: 'Piano airone', months: 24, monthlyInflowEur: 300, sourceIds: ['conto-2'], reserveEur: 2000, wantsSales: true,
    });
    expect(draft.answers.positions.map((p) => p.id)).toEqual(['d-a', 'd-b']);
    expect(draft.answers.sales).toEqual([{ assetId: 'etf-a', quantity: 10, month: 3 }]);
  });

  it('seededPlanPathDraft: start seed, the seed positions and sales, the investment account ticked', () => {
    const seed: PlanSeedDraft = {
      positions: [{ id: 's-a', label: 'ETF ornitorinco', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
      disposals: [{ assetId: 'etf-b', monthIndex: 4, estimatedProceedsEur: 4000, status: 'planned' }],
    };
    const draft = seededPlanPathDraft(seed, 'conto');
    expect(draft.screen).toBe('partenza');
    expect(draft.answers).toMatchObject({ start: 'seed', sourceIds: ['conto'], months: 12, wantsSales: true });
    expect(draft.answers.positions).toEqual(seed.positions);
    expect(draft.answers.sales).toEqual([{ assetId: 'etf-b', quantity: null, month: 4 }]);
    expect(draft.answers.seed).toEqual(seed);
  });
});

describe('the browser draft (mutation: keep the stored answers over an open draft)', () => {
  it('parseStoredPlanPath refuses another version and revives computedAt as a Date', () => {
    const stored = seededPlanPathDraft({ positions: [], optimizerSnapshot: { computedAt: TODAY, mode: 'reachable', settingsUsed: {} as never, weights: [], objectives: [] } }, 'conto');
    const json = JSON.parse(JSON.stringify(stored));
    expect(parseStoredPlanPath({ ...json, version: 2 })).toBeNull();
    expect(parseStoredPlanPath({ version: 1, screen: 'nowhere', answers: json.answers })).toBeNull();
    expect(parseStoredPlanPath('text')).toBeNull();
    const parsed = parseStoredPlanPath(json);
    expect(parsed?.answers.seed?.optimizerSnapshot?.computedAt).toBeInstanceOf(Date);
    expect(parsed?.answers.seed?.optimizerSnapshot?.computedAt.getTime()).toBe(TODAY.getTime());
  });

  it('reconcile drops a deleted account and replaces a pending label with the asset name', () => {
    const ctx = context({ assets: [conto(), etfA(), etfB(), asset('nuovo', 'ETF garzetta')] });
    const stored = answers({
      sourceIds: ['conto', 'gone'],
      positions: [...answers().positions, { id: 'p-n', label: ACCUMULO_STEP2_PENDING_ASSET_LABEL, targetPercentage: 0, memberAssetIds: ['nuovo'], buyAssetId: 'nuovo' }],
    });
    const next = reconcilePlanPathAnswers(stored, ctx);
    expect(next.sourceIds).toEqual(['conto']);
    expect(next.positions.find((p) => p.id === 'p-n')?.label).toBe('ETF garzetta');
  });

  it('a serverDraftId no longer open is cleared and the path is back on partenza', () => {
    const stored: PlanPathDraft = { version: 1, screen: 'strumenti', answers: answers({ start: 'draft', serverDraftId: 'draft-old' }) };
    const restored = restorePlanPathDraft(stored, context());
    expect(restored.screen).toBe('partenza');
    expect(restored.answers.serverDraftId).toBeUndefined();
    expect(restored.answers.start).toBeNull();
    expect(restored.answers.sourceIds).toEqual(['conto']);
  });

  it('a stored draft WITHOUT serverDraftId while a draft is open is discarded for the server draft', () => {
    const stored: PlanPathDraft = { version: 1, screen: 'durata', answers: answers({ months: 6 }) };
    const ctx = context({ assets: [conto(), conto2(), etfA(), etfB()], openDraft: openDraft() });
    const restored = restorePlanPathDraft(stored, ctx);
    expect(restored.screen).toBe('partenza');
    expect(restored.answers).toMatchObject({ start: 'draft', serverDraftId: 'draft-1', months: 24 });
  });

  it('a stored draft of the open draft comes back at its screen', () => {
    const stored: PlanPathDraft = { version: 1, screen: 'durata', answers: answers({ start: 'draft', serverDraftId: 'draft-1', months: 6 }) };
    const ctx = context({ assets: [conto(), conto2(), etfA(), etfB()], openDraft: openDraft() });
    const restored = restorePlanPathDraft(stored, ctx);
    expect(restored.screen).toBe('durata');
    expect(restored.answers.months).toBe(6);
  });

  it('null restores to the initial draft; the key carries the owner', () => {
    expect(restorePlanPathDraft(null, context()).screen).toBe('partenza');
    expect(planPathStorageKey('u1')).toBe('plan-path-draft:v1:u1');
  });
});

describe('planPathToDraft (mutation: ignore the override)', () => {
  it('starts the month after today and computes the reserve on the ticked accounts', () => {
    // quota 10.000; the ticked account holds 4.000, the other 5.000 → 5.000 outside the plan → reserve 5.000.
    const ctx = context({ assets: [conto(4000), conto2(5000), etfA(), etfB()] });
    const draft = planPathToDraft(answers(), ctx);
    expect(draft.startMonth).toBe('2026-12');
    expect(draft.name).toBe('Piano di accumulo');
    expect(draft.liquidity).toEqual({ sourceCashAssetIds: ['conto'], reserveEur: 5000, monthlyInflowEur: 500 });
    expect(resolvePathReserveEur(answers(), ctx)).toBe(5000);
    expect(planPathToDraft(answers({ reserveEur: 1500 }), ctx).liquidity.reserveEur).toBe(1500);
  });

  it('writes the sale month and recomputes the proceeds from today, whatever the stored seed says', () => {
    const ctx = context();
    const seed: PlanSeedDraft = { positions: answers().positions, disposals: [{ assetId: 'etf-a', quantity: 5, estimatedProceedsEur: 1, status: 'planned' }] };
    const draft = planPathToDraft(answers({ start: 'seed', seed, wantsSales: true, sales: [{ assetId: 'etf-a', quantity: 5, month: 3 }] }), ctx);
    expect(draft.disposals).toEqual([{ assetId: 'etf-a', quantity: 5, monthIndex: 3, estimatedProceedsEur: 500, status: 'planned' }]);
  });

  it('carries the open draft review month and notes only with start draft', () => {
    const ctx = context({ assets: [conto(), conto2(), etfA(), etfB()], openDraft: openDraft() });
    const continued = planPathToDraft(answers({ start: 'draft', serverDraftId: 'draft-1', name: 'Piano airone' }), ctx);
    expect(continued).toMatchObject({ name: 'Piano airone', reviewMonthIndex: 6, advisorNotes: ['Una nota.'] });
    const fresh = planPathToDraft(answers({ start: 'today', serverDraftId: 'draft-1' }), ctx);
    expect(fresh.reviewMonthIndex).toBeUndefined();
    expect(fresh.advisorNotes).toBeUndefined();
  });
});

describe('firstPlanPathRefusal (mutation: skip the gate)', () => {
  it('is null on valid answers and the gate message on a frozen instrument', () => {
    expect(firstPlanPathRefusal(answers(), context())).toBeNull();
    const frozen = context({ assets: [conto(), etfA(), etfB(), asset('etf-f', 'ETF bloccato', { quantity: 10, allocationRole: 'frozen' })] });
    const positions = [...answers().positions.map((p) => ({ ...p, targetPercentage: p.targetPercentage - 5 })), { id: 'p-f', label: 'ETF bloccato', targetPercentage: 10, memberAssetIds: ['etf-f'], buyAssetId: 'etf-f' }];
    expect(firstPlanPathRefusal(answers({ positions }), frozen)).toBe(describeDraftIssue({ code: 'position_not_tradable', label: 'ETF bloccato' }));
  });

  it('says the first screen block before the gate', () => {
    expect(firstPlanPathRefusal(answers({ months: 0, sourceIds: [] }), context())).toBe('Scrivi una durata fra 1 e 60 mesi.');
  });
});

describe('adopt and today weights (mutation: ignore adopt)', () => {
  it('adopt sets the server draft id and nothing else', () => {
    const draft: PlanPathDraft = { version: 1, screen: 'riepilogo', answers: answers() };
    const adopted = planPathReducer(draft, { type: 'adopt', serverDraftId: 'draft-9' });
    expect(adopted.answers.serverDraftId).toBe('draft-9');
    expect(adopted.screen).toBe('riepilogo');
    expect(planPathToDraft(adopted.answers, context())).toEqual(planPathToDraft(draft.answers, context()));
  });

  it('planPathTodayWeights: A 6.000 / B 4.000 → 60 / 40', () => {
    expect(planPathTodayWeights(answers(), context())).toEqual({ 'p-a': 60, 'p-b': 40 });
  });

  it('a money-market sale raises the reserve by its proceeds', () => {
    const ctx = context({ assets: [conto(4000), fondoM(), etfA(), etfB()] });
    // quota 10.000; the fund (1.000) is cash outside the accounts until sold: reserve 9.000, then 10.000.
    expect(resolvePathReserveEur(answers(), ctx)).toBe(9000);
    expect(resolvePathReserveEur(answers({ wantsSales: true, sales: [{ assetId: 'mm', quantity: null, month: 1 }] }), ctx)).toBe(10000);
  });
});

describe('quota and redistribute', () => {
  it('clamps a quota to 0–100 with two decimals and redistributes the rest', () => {
    const draft: PlanPathDraft = { version: 1, screen: 'strumenti', answers: answers() };
    expect(planPathReducer(draft, { type: 'quota', positionId: 'p-a', targetPercentage: 120 }).answers.positions[0].targetPercentage).toBe(100);
    expect(planPathReducer(draft, { type: 'quota', positionId: 'p-a', targetPercentage: -3 }).answers.positions[0].targetPercentage).toBe(0);
    expect(planPathReducer(draft, { type: 'quota', positionId: 'p-a', targetPercentage: 33.333 }).answers.positions[0].targetPercentage).toBe(33.33);
    const low = planPathReducer(draft, { type: 'quota', positionId: 'p-a', targetPercentage: 50 });
    const spread = planPathReducer(low, { type: 'redistribute' });
    expect(spread.answers.positions.reduce((s, p) => s + p.targetPercentage, 0)).toBeCloseTo(100, 5);
  });

  it('add puts an instrument at 0 %, or a pending row for one just created', () => {
    const ctx = context({ assets: [conto(), etfA(), etfB(), asset('etf-n', 'ETF garzetta')] });
    const draft: PlanPathDraft = { version: 1, screen: 'strumenti', answers: answers() };
    const added = planPathReducer(draft, { type: 'add', assetId: 'etf-n', context: ctx });
    expect(added.answers.positions.at(-1)).toMatchObject({ label: 'ETF garzetta', targetPercentage: 0, memberAssetIds: ['etf-n'], buyAssetId: 'etf-n' });
    const created = planPathReducer(draft, { type: 'add', assetId: 'fresh', created: true, context: ctx });
    expect(created.answers.positions.at(-1)).toMatchObject({ label: ACCUMULO_STEP2_PENDING_ASSET_LABEL, buyAssetId: 'fresh' });
    // A pending row survives a reconcile that runs before the asset arrives.
    expect(reconcilePlanPathAnswers(created.answers, ctx).positions.some((p) => p.buyAssetId === 'fresh')).toBe(true);
  });
});

describe('a continued draft keeps its swap (owner, 2026-11-20; mutation: drop reinvestAssetId)', () => {
  const swapDraft = () => openDraft({
    positions: [
      { id: 'd-a', label: 'ETF ornitorinco', targetPercentage: 50, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' },
      { id: 'd-c', label: 'ETF airone', targetPercentage: 50, memberAssetIds: ['etf-c'], buyAssetId: 'etf-c' },
    ],
    disposals: [{ assetId: 'etf-b', quantity: 10, monthIndex: 2, estimatedProceedsEur: 1000, status: 'planned', reinvestAssetId: 'etf-c' }],
  });
  const ctx = () => context({ assets: [conto(), conto2(), etfA(), etfB(), etfC()], openDraft: swapDraft() });

  it('the sale read from the draft carries its swap, and the draft written keeps it', () => {
    const draft = initialPlanPathDraft(ctx());
    expect(draft.answers.sales).toEqual([{ assetId: 'etf-b', quantity: 10, month: 2, reinvestAssetId: 'etf-c' }]);
    expect(planPathToDraft(draft.answers, ctx()).disposals[0].reinvestAssetId).toBe('etf-c');
  });

  it('a quantity or a month typed again keeps the swap; the sale taken back takes it away', () => {
    const start = initialPlanPathDraft(ctx());
    const retyped = planPathReducer(start, { type: 'sale', sale: { assetId: 'etf-b', quantity: 5, month: 3 }, context: ctx() });
    expect(retyped.answers.sales).toEqual([{ assetId: 'etf-b', quantity: 5, month: 3, reinvestAssetId: 'etf-c' }]);
    const removed = planPathReducer(retyped, { type: 'sale', sale: { assetId: 'etf-b', remove: true }, context: ctx() });
    const again = planPathReducer(removed, { type: 'sale', sale: { assetId: 'etf-b', quantity: 5, month: 3 }, context: ctx() });
    expect(again.answers.sales).toEqual([{ assetId: 'etf-b', quantity: 5, month: 3 }]);
  });

  it('a swap whose instrument left the plan is not written', () => {
    const draft = initialPlanPathDraft(ctx());
    const answersWithout = { ...draft.answers, positions: draft.answers.positions.filter((p) => p.buyAssetId !== 'etf-c') };
    expect(planPathToDraft(answersWithout, ctx()).disposals[0].reinvestAssetId).toBeUndefined();
  });

  it('the summary names what the proceeds buy', () => {
    const draft = initialPlanPathDraft(ctx());
    const summary = buildPlanPathSummary(draft.answers, ctx());
    expect(summary.sales[0]).toContain('con il ricavato compri ETF airone');
  });
});
