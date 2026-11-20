/**
 * Tests for lib/utils/advicePlan.ts — the plan of accumulation the Consulente's «Applica» creates from
 * the operating plan, built purely on TODAY's portfolio (2026-11-20, doc/guide/consulente-piano.md).
 *
 * The figures are invented and round. The real `compareAllocations` measures the reserve and the
 * trajectory (its module pulls the client SDK: mocked, as `accumulationClassTrajectory.test.ts` does).
 * Each block names the mutation that turns it red.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset, AssetAllocationTarget, AssetPrefill } from '@/types/assets';
import type { AccumulationPlan, Installment } from '@/types/accumulationPlan';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));

import { compareAllocations } from '@/lib/services/assetAllocationService';
import { DEFAULT_REBALANCE_BAND } from '@/lib/utils/allocationUtils';
import { reconcileOperatingPlan, type OperatingPlan, type OperatingPlanFacts, type OperatingPlanInstrument, type RawOperatingPlan } from '@/lib/utils/operatingPlan';
import { accumulationPlanDraftSchema } from '@/lib/utils/accumulationPlanSchema';
import { ACCUMULO_PLAN_NOTHING_TO_REVISE } from '@/lib/utils/accumuloCopy';
import {
  ADVICE_PLAN_COPY,
  buildAdvicePlan,
  fallbackTicker,
  newInstrumentFormData,
  pickFreshQuote,
  resolveNewInstrumentPricing,
  type AdvicePlanInput,
  type NewInstrumentPricing,
} from '@/lib/utils/advicePlan';

const TODAY = new Date('2026-11-20T12:00:00');
const DAY = 86_400_000;

function asset(id: string, name: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id, userId: 'u1', ticker: id.toUpperCase(), name, type: 'etf', assetClass: 'equity', currency: 'EUR',
    quantity: 0, currentPrice: 100, lastPriceUpdate: TODAY, createdAt: TODAY, updatedAt: TODAY, ...overrides,
  };
}

const conto = () => asset('conto', 'Conto', { type: 'cash', assetClass: 'cash', quantity: 10000, currentPrice: 1 });
const etfA = () => asset('etf-a', 'ETF A', { quantity: 60 });
const etfB = () => asset('etf-b', 'ETF B', { quantity: 20 });
const etfC = () => asset('etf-c', 'ETF C', { assetClass: 'bonds', quantity: 50, currentPrice: 40 });
const mm1 = () => asset('mm-1', 'Monetario', { assetClass: 'cash', quantity: 30 });

const PREFILL: AssetPrefill = { name: 'ETF Nuovo', ticker: '', isin: 'IE000NEW0001', type: 'etf', assetClass: 'equity', subCategory: '' };

const INSTRUMENTS: OperatingPlanInstrument[] = [
  { ref: 'S1', kind: 'held', name: 'ETF A', assetClass: 'equity', assetId: 'etf-a' },
  { ref: 'S2', kind: 'held', name: 'ETF B', assetClass: 'equity', assetId: 'etf-b' },
  { ref: 'S3', kind: 'held', name: 'ETF C', assetClass: 'bonds', assetId: 'etf-c' },
  { ref: 'N1', kind: 'new', name: 'ETF Nuovo', assetClass: 'equity', prefill: PREFILL, symbols: ['NEW1.MI', 'NEW1.DE'] },
  { ref: 'M1', kind: 'cashFund', name: 'Monetario', assetClass: 'cash', assetId: 'mm-1' },
];

const RAW: RawOperatingPlan = {
  summary: 'Il piano.', monthlyInflowEur: 500, months: 12, reviewMonth: 6, reviewReason: '', departures: [],
  rows: [
    { ref: 'S1', action: 'buy', targetPercentage: 60, reason: '' },
    { ref: 'S2', action: 'hold', targetPercentage: 0, reason: '' },
    { ref: 'S3', action: 'sell', targetPercentage: 0, sellQuantity: 20, sellMonth: 3, reason: '' },
    { ref: 'N1', action: 'buy', targetPercentage: 40, reason: '' },
    { ref: 'M1', action: 'sell', targetPercentage: 0, sellQuantity: 10, reason: '' },
  ],
};

function factsOf(assets: Asset[], instruments = INSTRUMENTS): OperatingPlanFacts {
  const held: OperatingPlanFacts['held'] = {};
  for (const instrument of instruments) {
    const found = assets.find((a) => a.id === instrument.assetId);
    if (found) held[instrument.ref] = { quantity: found.quantity, priceEur: found.currentPrice, valueEur: found.quantity * found.currentPrice, keep: false, tax: { kind: 'exempt' } };
  }
  return { instruments, held };
}

function storedPlan(raw: RawOperatingPlan = RAW, assets = [conto(), etfA(), etfB(), etfC(), mm1()]): OperatingPlan {
  const plan = reconcileOperatingPlan(raw, factsOf(assets));
  expect(plan.usable).toBe(true);
  return plan;
}

const TARGETS: AssetAllocationTarget = { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 20 }, cash: { targetPercentage: 10 } };
const DEPS = { valueOf: (a: Asset) => a.quantity * a.currentPrice, priceOf: (a: Asset) => a.currentPrice };
const PRICED: NewInstrumentPricing = { kind: 'priced', quote: { symbol: 'NEW1.MI', price: 50, currency: 'EUR', priceEur: 50, quotedAt: '2026-11-19T16:30:00.000Z' } };

function input(overrides: Partial<AdvicePlanInput> = {}): AdvicePlanInput {
  let seq = 0;
  return {
    plan: storedPlan(),
    assets: [conto(), etfA(), etfB(), etfC(), mm1()],
    keepNames: [],
    limits: [],
    targets: TARGETS,
    sourceAssetId: 'conto',
    openPlan: null,
    pricing: { N1: PRICED },
    band: DEFAULT_REBALANCE_BAND,
    compare: compareAllocations,
    deps: DEPS,
    today: TODAY,
    generateId: () => `pos-${++seq}`,
    ...overrides,
  };
}

const quotaOf = (build: ReturnType<typeof buildAdvicePlan>, assetId: string) => build.draft.positions.find((p) => p.buyAssetId === assetId)?.targetPercentage;

/** The share of the plan's money the engine gives an instrument (the preview's totals over L). */
const moneyShareOf = (build: ReturnType<typeof buildAdvicePlan>, assetId: string) => {
  const position = build.draft.positions.find((p) => p.buyAssetId === assetId);
  return position ? (build.preview.totals[position.id] ?? 0) / build.preview.liquidity.L : undefined;
};
const weightSum = (build: ReturnType<typeof buildAdvicePlan>) => Math.round(build.draft.positions.reduce((sum, p) => sum + p.targetPercentage, 0) * 100) / 100;

// The operating plan's quotas are shares of the plan's MONEY (owner, 2026-11-20): the click turns them into the
// weights that make the engine split the money so. Mutation that turns it red: the rows' quotas as the weights.
describe('buildAdvicePlan — the quotas are shares of the money', () => {
  it('the engine buys 60 % of the money on ETF A and 40 % on the new one; a held instrument receives nothing', () => {
    const build = buildAdvicePlan(input());
    expect(build.blocked).toBeNull();
    expect(moneyShareOf(build, 'etf-a')).toBeCloseTo(0.6, 2);
    expect(moneyShareOf(build, 'new:N1')).toBeCloseTo(0.4, 2);
    expect(moneyShareOf(build, 'etf-b')).toBe(0);
    expect(moneyShareOf(build, 'etf-c')).toBe(0);
    expect(weightSum(build)).toBe(100);
    expect(build.issues).toEqual([]);
  });

  it('a quota on an instrument with no price keeps a weight above 0 and buys nothing; the priced one takes the money', () => {
    const build = buildAdvicePlan(input({ pricing: { N1: { kind: 'unpriced', reason: 'no-fresh-quote' } } }));
    expect(build.blocked).toBeNull();
    expect(quotaOf(build, 'new:N1')).toBeGreaterThan(0);
    expect(moneyShareOf(build, 'new:N1')).toBe(0);
    expect(moneyShareOf(build, 'etf-a')).toBeCloseTo(1, 2);
    expect(moneyShareOf(build, 'etf-b')).toBe(0);
    expect(moneyShareOf(build, 'etf-c')).toBe(0);
    expect(weightSum(build)).toBe(100);
  });
});

// Mutation that turns U1 red: build the positions from the stored rows, skipping today's reconcile (U2 too).
describe('buildAdvicePlan — a new plan from the operating plan (U1)', () => {
  it('positions, sales in their months, months, inflow and review month, on today\'s portfolio', () => {
    const build = buildAdvicePlan(input());
    expect(build.action).toBe('create');
    expect(build.firstIndex).toBe(1);
    expect(build.issues).toEqual([]);
    expect(build.blocked).toBeNull();
    // The quotas as shares of the money (the weights are the engine's, see the block above).
    expect(build.draft.positions.map((p) => [p.buyAssetId, Math.round((moneyShareOf(build, p.buyAssetId) ?? 0) * 100)])).toEqual([
      ['etf-a', 60], ['etf-b', 0], ['etf-c', 0], ['new:N1', 40],
    ]);
    // A money-market fund is never a position: its sale is a disposal only.
    expect(build.draft.positions.some((p) => p.buyAssetId === 'mm-1')).toBe(false);
    expect(build.draft.disposals).toEqual([
      { assetId: 'etf-c', quantity: 20, monthIndex: 3, estimatedProceedsEur: 800, status: 'planned' },
      { assetId: 'mm-1', quantity: 10, monthIndex: 1, estimatedProceedsEur: 1000, status: 'planned' },
    ]);
    expect(build.draft).toMatchObject({ name: 'Piano di accumulo', startMonth: '2026-12', months: 12, reviewMonthIndex: 6 });
    expect(build.draft.liquidity).toMatchObject({ sourceCashAssetIds: ['conto'], monthlyInflowEur: 500 });
    expect(build.toCreate).toHaveLength(1);
    expect(build.toCreate[0]).toMatchObject({ ref: 'N1', formData: { ticker: 'NEW1.MI', quantity: 0, createdEmpty: true } });
  });
});

describe('buildAdvicePlan — today\'s facts (U2)', () => {
  // Mutation that turns it red: keep the stored facts (reconcile against the plan's own instruments).
  it('an instrument sold since is dropped with its sentence, one bought since is a row at 0 named in the notes', () => {
    const plan = { ...storedPlan(), corrections: ['Nota memorizzata.', 'Il piano citava uno strumento che non è fra i tuoi né fra quelli del report: la riga non entra.'] };
    const etfD = asset('etf-d', 'ETF D', { quantity: 10 });
    const build = buildAdvicePlan(input({ plan, assets: [conto(), etfB(), etfC(), mm1(), etfD] }));
    expect(build.draft.positions.some((p) => p.buyAssetId === 'etf-a')).toBe(false);
    expect(moneyShareOf(build, 'etf-d')).toBe(0);
    expect(build.notes[0]).toBe('Nota memorizzata.');
    expect(build.notes.some((note) => note.startsWith('ETF D: il piano non lo cita'))).toBe(true);
    expect(new Set(build.notes).size).toBe(build.notes.length);
    expect(build.issues).toEqual([]);
  });

  it('a new instrument now held under another name, same ISIN → nothing to create, the position on its id', () => {
    const bought = asset('etf-n', 'Un altro nome', { isin: ' ie000new0001 ', quantity: 0, createdEmpty: true });
    const build = buildAdvicePlan(input({ assets: [conto(), etfA(), etfB(), etfC(), mm1(), bought] }));
    expect(build.toCreate).toEqual([]);
    expect(moneyShareOf(build, 'etf-n')).toBeCloseTo(0.4, 2);
    expect(build.issues).toEqual([]);
  });

  it('caps the notes so the draft always parses', () => {
    const many = Array.from({ length: 20 }, (_, i) => asset(`x-${i}`, `Strumento con un nome molto lungo numero ${i}`, { quantity: 1 }));
    const plan = { ...storedPlan(), corrections: Array.from({ length: 45 }, (_, i) => `Correzione ${i}.`) };
    const build = buildAdvicePlan(input({ plan, assets: [conto(), etfA(), etfB(), etfC(), mm1(), ...many] }));
    expect(build.notes).toHaveLength(40);
    expect(build.notes.every((note) => note.length <= 400)).toBe(true);
    expect(accumulationPlanDraftSchema.safeParse(build.draft).success).toBe(true);
    const long = buildAdvicePlan(input({ assets: [conto(), etfA(), etfB(), etfC(), mm1(), ...many] }));
    const forgotten = long.notes.find((note) => note.startsWith('Strumento con un nome'))!;
    expect(forgotten).toHaveLength(400);
    expect(forgotten.endsWith('…')).toBe(true);
  });
});

// Mutation that turns it red: return `blocked: null` whatever the build finds.
describe('buildAdvicePlan — what blocks the tick (U3)', () => {
  it('a draft with an issue never reaches the tick: blocked is its message', () => {
    const reconcile: AdvicePlanInput['reconcile'] = (raw, facts) => {
      const plan = reconcileOperatingPlan(raw, facts);
      return { ...plan, rows: plan.rows.filter((row) => row.ref !== 'S2') };
    };
    const build = buildAdvicePlan(input({ reconcile }));
    expect(build.issues.map((issue) => issue.code)).toEqual(['unassigned_tradable']);
    expect(build.blocked).toBe(build.issues[0].message);
  });

  it('no cash above the reserve, no inflow, no sale → «niente da investire»', () => {
    const raw: RawOperatingPlan = { ...RAW, monthlyInflowEur: 0, rows: [{ ref: 'S1', action: 'buy', targetPercentage: 100, reason: '' }] };
    const assets = [asset('conto', 'Conto', { type: 'cash', assetClass: 'cash', quantity: 100, currentPrice: 1 }), etfA()];
    const plan = reconcileOperatingPlan(raw, factsOf(assets, INSTRUMENTS.slice(0, 1)));
    const build = buildAdvicePlan(input({ plan, assets }));
    expect(build.blocked).toBe(ADVICE_PLAN_COPY.nothingToInvest);
  });

  it('every buy on an unpriced new instrument → «nessuno … ha un prezzo»', () => {
    const raw: RawOperatingPlan = { ...RAW, rows: [{ ref: 'S1', action: 'hold', targetPercentage: 0, reason: '' }, { ref: 'N1', action: 'buy', targetPercentage: 100, reason: '' }] };
    const assets = [conto(), etfA()];
    const plan = reconcileOperatingPlan(raw, factsOf(assets, [INSTRUMENTS[0], INSTRUMENTS[3]]));
    const build = buildAdvicePlan(input({ plan, assets, pricing: { N1: { kind: 'unpriced', reason: 'no-fresh-quote' } } }));
    expect(build.blocked).toBe(ADVICE_PLAN_COPY.nothingPriced);
  });
});

// Mutation that turns it red: `>=` on the age (a quote of exactly five days refused) — and the order.
describe('pickFreshQuote (U4)', () => {
  const now = new Date('2026-11-20T12:00:00Z').getTime();
  const at = (days: number) => new Date(now - days * DAY).toISOString();

  it('skips a stale first symbol for a fresh second one', () => {
    const quote = pickFreshQuote([
      { symbol: 'OLD.MI', price: 10, currency: 'EUR', quotedAt: at(9) },
      { symbol: 'NEW.DE', price: 20, currency: 'EUR', quotedAt: at(1) },
    ], now);
    expect(quote?.symbol).toBe('NEW.DE');
  });

  it('skips a USD quote without its euro price, and returns null when none is left', () => {
    expect(pickFreshQuote([{ symbol: 'US', price: 10, currency: 'USD', quotedAt: at(1) }], now)).toBeNull();
    expect(pickFreshQuote([{ symbol: 'US', price: 10, currency: 'USD', currentPriceEur: 9, quotedAt: at(1) }], now)).toMatchObject({ symbol: 'US', priceEur: 9, currency: 'USD' });
    expect(pickFreshQuote([{ symbol: 'X', price: null }], now)).toBeNull();
  });

  it('accepts a quote exactly five days old', () => {
    expect(pickFreshQuote([{ symbol: 'EDGE', price: 10, currency: 'EUR', quotedAt: at(5) }], now)?.symbol).toBe('EDGE');
  });
});

// Mutation that turns it red: `autoUpdatePrice: true` always.
describe('newInstrumentFormData and resolveNewInstrumentPricing (U5)', () => {
  const instrument = INSTRUMENTS[3];
  const now = TODAY.getTime();

  it('priced → the symbol, the price, the daily update, created empty with the form\'s defaults', () => {
    expect(newInstrumentFormData(instrument, PRICED)).toMatchObject({
      ticker: 'NEW1.MI', currentPrice: 50, currency: 'EUR', autoUpdatePrice: true, quantity: 0, createdEmpty: true,
      isLiquid: true, allocationRole: 'tradable', stampDutyExempt: false, isin: 'IE000NEW0001',
    });
  });

  it('unpriced with an ISIN → the ISIN as ticker, no price, no daily update', () => {
    expect(newInstrumentFormData(instrument, { kind: 'unpriced', reason: 'no-fresh-quote' })).toMatchObject({ ticker: 'IE000NEW0001', currentPrice: 0, autoUpdatePrice: false });
  });

  it('no ISIN → a slug the ticker rule accepts', () => {
    const ticker = fallbackTicker({ name: 'ETF Oro fisico (€) — più lungo del limite' });
    expect(ticker).toMatch(/^[A-Za-z0-9.^=\-]+$/);
    expect(ticker.length).toBeLessThanOrEqual(20);
    expect(fallbackTicker({ name: 'ETF Oro fisico' })).toBe('ETF-ORO-FISICO');
    expect(fallbackTicker({ name: '€€€' })).toBe('STRUMENTO');
  });

  it('a government bond with an ISIN → the ISIN, no price, the daily update on; without an ISIN → the symbols', () => {
    const bond: OperatingPlanInstrument = { ...instrument, prefill: { ...PREFILL, type: 'bond', assetClass: 'bonds', isin: 'IT0000000001' } };
    const pricing = resolveNewInstrumentPricing(bond, [], now);
    expect(pricing).toEqual({ kind: 'bond', pricePct: null, indexed: false });
    expect(newInstrumentFormData(bond, pricing)).toMatchObject({ ticker: 'IT0000000001', currentPrice: 0, autoUpdatePrice: true });
    const noIsin: OperatingPlanInstrument = { ...bond, prefill: { ...bond.prefill!, isin: undefined } };
    expect(resolveNewInstrumentPricing(noIsin, [{ symbol: 'NEW1.MI', price: 99, currency: 'EUR', quotedAt: new Date(now - DAY).toISOString() }], now)).toMatchObject({ kind: 'priced' });
    expect(resolveNewInstrumentPricing({ ...noIsin, symbols: [] }, [], now)).toEqual({ kind: 'unpriced', reason: 'no-symbol' });
  });
});

function activePlan(overrides: Partial<AccumulationPlan> = {}, closed = 3, months = 12): AccumulationPlan {
  const installments: Installment[] = Array.from({ length: months }, (_, i) => ({
    index: i + 1,
    month: `20${26 + Math.floor((7 + i) / 12)}-${String(((7 + i) % 12) + 1).padStart(2, '0')}`,
    lines: [{ positionId: 'old', assetId: 'etf-a', plannedQuantity: 1, priceEurAtPlan: 100, plannedAmountEur: 100, status: i < closed ? 'executed' : 'planned' }],
    carryInEur: {},
  }));
  return {
    id: 'plan-1', userId: 'u1', name: 'Il mio PAC', status: 'active', startMonth: '2026-08', months,
    liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 0, monthlyInflowEur: 300 },
    positions: [{ id: 'old', label: 'ETF A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
    disposals: [], installments, createdAt: TODAY, updatedAt: TODAY, ...overrides,
  };
}

// Mutation that turns it red: leave the months unshifted in a revision (the sale at 3, the review at 6).
describe('buildAdvicePlan — an open plan (U7)', () => {
  it('a draft → replace, on the same numbering as a new plan', () => {
    const draft = { ...activePlan(), status: 'draft' as const, installments: [] };
    const build = buildAdvicePlan(input({ openPlan: draft }));
    expect(build.action).toBe('replace');
    expect(build.firstIndex).toBe(1);
    expect(build.draft.startMonth).toBe('2026-12');
  });

  it('an active plan at k = 4 → revise from the 4th instalment, every month shifted by 3', () => {
    const build = buildAdvicePlan(input({ openPlan: activePlan() }));
    expect(build.action).toBe('revise');
    expect(build.firstIndex).toBe(4);
    expect(build.draft.name).toBe('Il mio PAC');
    expect(build.draft.startMonth).toBe('2026-11');
    expect(build.draft.months).toBe(12);
    expect(build.draft.disposals.find((d) => d.assetId === 'etf-c')?.monthIndex).toBe(6);
    expect(build.draft.reviewMonthIndex).toBe(9);
    expect(build.issues).toEqual([]);
  });

  it('a sale in the last month stays inside the revised plan', () => {
    const raw: RawOperatingPlan = { ...RAW, rows: RAW.rows.map((row) => (row.ref === 'S3' ? { ...row, sellMonth: 12 } : row)) };
    const build = buildAdvicePlan(input({ plan: storedPlan(raw), openPlan: activePlan() }));
    expect(build.draft.disposals.find((d) => d.assetId === 'etf-c')?.monthIndex).toBe(15);
    expect(build.issues).toEqual([]);
  });

  it('60 months from k = 4 → 57 months and the note', () => {
    const build = buildAdvicePlan(input({ plan: storedPlan({ ...RAW, months: 60 }), openPlan: activePlan({}, 3, 60) }));
    expect(build.draft.months).toBe(57);
    expect(build.notes).toContain(ADVICE_PLAN_COPY.monthsCapped(3, 57));
  });

  it('a sale the active plan already executed is not sold again: a position at 0, no disposal, the sentence', () => {
    const openPlan = activePlan({ disposals: [{ assetId: 'etf-c', quantity: 5, estimatedProceedsEur: 200, status: 'executed' }] });
    const build = buildAdvicePlan(input({ openPlan }));
    expect(build.draft.disposals.some((d) => d.assetId === 'etf-c')).toBe(false);
    expect(moneyShareOf(build, 'etf-c')).toBe(0);
    expect(build.notes).toContain(ADVICE_PLAN_COPY.alreadySold('ETF C'));
    expect(build.issues).toEqual([]);
  });

  it('an active plan with every instalment closed → decision 98\'s sentence', () => {
    const build = buildAdvicePlan(input({ openPlan: activePlan({}, 12) }));
    expect(build.blocked).toBe(ACCUMULO_PLAN_NOTHING_TO_REVISE);
    expect(build.toCreate).toEqual([]);
  });
});

// ── The swap (owner, 2026-11-20, NOVE-25's phase F): «vendi ETF C e con quei soldi compra ETF Nuovo».
describe('buildAdvicePlan — the swap', () => {
  const RAW_SWAP: RawOperatingPlan = {
    ...RAW,
    rows: [
      { ref: 'S1', action: 'buy', targetPercentage: 100, reason: '' },
      { ref: 'S2', action: 'hold', targetPercentage: 0, reason: '' },
      { ref: 'S3', action: 'sell', targetPercentage: 0, reinvestInto: 'N1', reason: '' },
      { ref: 'N1', action: 'buy', targetPercentage: 0, reason: '' },
    ],
  };

  // Mutations that turn it red: the swap not carried on the sale; the swap's purchase bought again by the rates.
  it('the sale carries the swap; month 1 buys the new instrument with the whole proceeds; the rates never buy it', () => {
    const build = buildAdvicePlan(input({ plan: storedPlan(RAW_SWAP) }));
    expect(build.blocked).toBeNull();
    expect(build.draft.disposals).toEqual([
      expect.objectContaining({ assetId: 'etf-c', monthIndex: 1, estimatedProceedsEur: 2000, reinvestAssetId: 'new:N1' }),
    ]);
    const first = build.preview.schedule.installments[0];
    expect(first.lines.filter((line) => line.swap)).toEqual([
      expect.objectContaining({ assetId: 'new:N1', plannedQuantity: 40, plannedAmountEur: 2000, swap: true }),
    ]);
    expect(moneyShareOf(build, 'new:N1')).toBe(0);
    expect(quotaOf(build, 'new:N1')).toBeGreaterThan(0);
    expect(weightSum(build)).toBe(100);
    expect(build.toCreate.map((item) => item.ref)).toEqual(['N1']);
  });

  // Mutation that turns it red: the note left out.
  it('a new instrument with no price: the sale goes back to the plan, and a note says so', () => {
    const build = buildAdvicePlan(input({ plan: storedPlan(RAW_SWAP), pricing: { N1: { kind: 'unpriced', reason: 'no-symbol' } } }));
    expect(build.notes).toContain(ADVICE_PLAN_COPY.swapUnpriced('ETF C', 'ETF Nuovo'));
    expect(build.preview.schedule.installments.flatMap((i) => i.lines).some((line) => line.swap)).toBe(false);
  });
});

// A government bond priced at the click (owner, 2026-11-20): Borsa Italiana's quote, % of par, on 1 € of nominal;
// a BTP€i also times the indexation coefficient the page asks, without which it has no price.
describe('a new government bond priced at the click', () => {
  const now = TODAY.getTime();
  const bond = (name: string): OperatingPlanInstrument => ({
    ref: 'N1', kind: 'new', name, assetClass: 'bonds', prefill: { name, ticker: '', isin: 'IT0000000EI1', type: 'bond', assetClass: 'bonds', subCategory: 'Bond Singoli' }, symbols: [],
  });

  // Mutation that turns it red: the quote taken as euro, not as % of par.
  it('a nominal bond: its quote ÷ 100 per unit, the daily update on', () => {
    const pricing = resolveNewInstrumentPricing(bond('BTP Valore Marzo 2032'), [], now, { pricePct: 98 });
    expect(pricing).toEqual({ kind: 'bond', pricePct: 98, indexed: false });
    expect(newInstrumentFormData(bond('BTP Valore Marzo 2032'), pricing)).toMatchObject({ currentPrice: 0.98, autoUpdatePrice: true, ticker: 'IT0000000EI1' });
  });

  // Mutations that turn it red: a BTP€i priced without its coefficient; the coefficient left out of the price.
  it('a BTP€i: no price without the coefficient, the quote ÷ 100 × the coefficient with it', () => {
    const name = 'BTP€i 15/05/2033 0,10%';
    const without = resolveNewInstrumentPricing(bond(name), [], now, { pricePct: 98 });
    expect(without).toEqual({ kind: 'bond', pricePct: 98, indexed: true });
    expect(newInstrumentFormData(bond(name), without).currentPrice).toBe(0);
    const priced = resolveNewInstrumentPricing(bond(name), [], now, { pricePct: 98, coefficient: 1.25 });
    expect(newInstrumentFormData(bond(name), priced).currentPrice).toBe(1.225);
    expect(resolveNewInstrumentPricing(bond('BTPei 2035'), [], now, { pricePct: 98 })).toMatchObject({ indexed: true });
    expect(resolveNewInstrumentPricing(bond('BTP Italia 2030'), [], now, { pricePct: 98 })).toMatchObject({ indexed: false });
  });

  // Mutation that turns it red: the bond's price left off the synthetic asset.
  it('a swap toward a priced new bond buys it at once, in whole units of 1 € of nominal', () => {
    const instruments: OperatingPlanInstrument[] = [...INSTRUMENTS.filter((i) => i.ref !== 'N1'), { ...bond('BTP Valore Marzo 2032'), assetClass: 'bonds' }];
    const raw: RawOperatingPlan = {
      ...RAW,
      rows: [
        { ref: 'S1', action: 'buy', targetPercentage: 100, reason: '' },
        { ref: 'S2', action: 'hold', targetPercentage: 0, reason: '' },
        { ref: 'S3', action: 'sell', targetPercentage: 0, reinvestInto: 'N1', reason: '' },
        { ref: 'N1', action: 'buy', targetPercentage: 0, reason: '' },
      ],
    };
    const assets = [conto(), etfA(), etfB(), etfC(), mm1()];
    const plan = reconcileOperatingPlan(raw, factsOf(assets, instruments));
    const pricing = { N1: resolveNewInstrumentPricing(instruments.at(-1)!, [], now, { pricePct: 80 }) };
    const build = buildAdvicePlan(input({ plan, pricing }));
    expect(build.notes).toEqual([]);
    expect(build.preview.schedule.installments[0].lines.filter((line) => line.swap)).toEqual([
      expect.objectContaining({ assetId: 'new:N1', plannedQuantity: 2500, plannedAmountEur: 2000, swap: true }),
    ]);
  });
});
