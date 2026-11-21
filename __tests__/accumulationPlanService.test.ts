/**
 * Tests for lib/services/accumulationPlanService.ts with Firestore simulated in memory:
 *   - the lock `accumulationPlanLocks/{ownerUid}` decides «one plan in draft or active per account»
 *     inside each transaction (2026-11-12) — a client transaction cannot query, so the lock is read
 *     with the plan it names;
 *   - every euro field handed to a write is in cents (`roundPlanEuros`, 2026-11-12).
 * The mock refuses a `tx.get` after a write, as Firestore does. The rules themselves are proven only
 * by the emulator exercise (doc/guide/accumulo.md), never here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const DELETE = { __deleteField: true };
const store = new Map<string, Record<string, unknown>>();
const writes: Array<{ kind: 'set' | 'update' | 'delete'; path: string; data?: Record<string, unknown> }> = [];
let autoId = 0;

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
const saveModelPortfolio = vi.fn(async () => undefined);
vi.mock('@/lib/services/modelPortfolioService', () => ({ saveModelPortfolio: (...args: unknown[]) => saveModelPortfolio(...(args as [])) }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, col: string) => ({ col })),
  doc: vi.fn((first: unknown, col?: string, id?: string) => {
    if (col === undefined) {
      const parent = (first as { col: string }).col;
      const generated = `auto-${++autoId}`;
      return { id: generated, path: `${parent}/${generated}` };
    }
    return { id, path: `${col}/${id}` };
  }),
  query: vi.fn(() => 'q'),
  where: vi.fn(),
  getDocs: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(() => DELETE),
  runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
    const pending: typeof writes = [];
    const tx = {
      get: async (ref: { id: string; path: string }) => {
        if (pending.length > 0) throw new Error('Firestore transactions require all reads to be executed before all writes.');
        return { exists: () => store.has(ref.path), id: ref.id, data: () => store.get(ref.path) };
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => { pending.push({ kind: 'set', path: ref.path, data }); },
      update: (ref: { path: string }, data: Record<string, unknown>) => { pending.push({ kind: 'update', path: ref.path, data }); },
      delete: (ref: { path: string }) => { pending.push({ kind: 'delete', path: ref.path }); },
    };
    await fn(tx);
    for (const write of pending) {
      writes.push(write);
      if (write.kind === 'delete') store.delete(write.path);
      else store.set(write.path, { ...(write.kind === 'update' ? store.get(write.path) : {}), ...write.data });
    }
  }),
}));

import {
  activatePlan,
  closePlan,
  createAndActivatePlan,
  createDraftPlan,
  PlanWriteError,
  deleteDraftPlan,
  reactivatePlan,
  setInstallmentLine,
  updateDraftPlan,
} from '@/lib/services/accumulationPlanService';
import { ACCUMULO_ONE_OPEN_PLAN, ACCUMULO_REACTIVATE_REFUSED } from '@/lib/utils/accumulationNarrative';
import type { AccumulationPlanDraft } from '@/types/accumulationPlan';
import type { Asset } from '@/types/assets';

const OWNER = 'u1';
const LOCK = `accumulationPlanLocks/${OWNER}`;
const NOW = new Date('2027-01-10T12:00:00');

const draft: AccumulationPlanDraft = {
  name: 'Piano',
  startMonth: '2027-01',
  months: 3,
  liquidity: { sourceCashAssetIds: ['cash'], reserveEur: 0, monthlyInflowEur: 0 },
  positions: [{ id: 'pos-a', label: 'ETF A', targetPercentage: 100, memberAssetIds: ['etf-a'], buyAssetId: 'etf-a' }],
  disposals: [],
};

function planDoc(status: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...draft, userId: OWNER, status, installments: [], createdAt: NOW, updatedAt: NOW, ...extra };
}

/** The euro fields a written plan holds (unit prices are not amounts: `priceEurAtPlan`, `pricesEur`). */
const EURO_SCALARS = new Set(['plannedAmountEur', 'executedAmountEur', 'estimatedProceedsEur', 'residualEur', 'reserveEur', 'monthlyInflowEur', 'sourceCashEur', 'marketBaseEur']);
const EURO_MAPS = new Set(['carryInEur', 'positionValuesEur', 'classNotionalEur']);

function nonCentEuros(value: unknown, key = '', found: string[] = []): string[] {
  const isCents = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
  if (typeof value === 'number') {
    if (EURO_SCALARS.has(key) && !isCents(value)) found.push(`${key}=${value}`);
  } else if (Array.isArray(value)) {
    value.forEach((item) => nonCentEuros(item, key, found));
  } else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value)) {
      if (EURO_MAPS.has(k) && v && typeof v === 'object') {
        for (const [mapKey, n] of Object.entries(v)) if (typeof n === 'number' && !isCents(n)) found.push(`${k}.${mapKey}=${n}`);
      } else nonCentEuros(v, k, found);
    }
  }
  return found;
}

beforeEach(() => {
  store.clear();
  writes.length = 0;
  autoId = 0;
});

describe('createDraftPlan and the lock', () => {
  it('writes the plan and the lock naming it, in one transaction', async () => {
    const id = await createDraftPlan(OWNER, draft);
    expect(store.get(`accumulationPlans/${id}`)?.status).toBe('draft');
    expect(store.get(LOCK)).toMatchObject({ userId: OWNER, openPlanId: id });
  });

  it('refuses while the lock holds a draft or an active plan, and writes nothing', async () => {
    store.set('accumulationPlans/held', planDoc('active'));
    store.set(LOCK, { userId: OWNER, openPlanId: 'held' });
    await expect(createDraftPlan(OWNER, draft)).rejects.toThrow(ACCUMULO_ONE_OPEN_PLAN);
    expect(writes).toHaveLength(0);
  });

  it('creates when the lock names a closed plan, or one deleted outside the app', async () => {
    store.set('accumulationPlans/old', planDoc('completed'));
    store.set(LOCK, { userId: OWNER, openPlanId: 'old' });
    const first = await createDraftPlan(OWNER, draft);
    expect(store.get(LOCK)?.openPlanId).toBe(first);

    store.delete(`accumulationPlans/${first}`);
    const second = await createDraftPlan(OWNER, draft);
    expect(store.get(LOCK)?.openPlanId).toBe(second);
  });

  it('rounds the typed amounts to the cent', async () => {
    const id = await createDraftPlan(OWNER, { ...draft, liquidity: { ...draft.liquidity, reserveEur: 100.005, monthlyInflowEur: 250.004 } });
    expect(store.get(`accumulationPlans/${id}`)?.liquidity).toMatchObject({ reserveEur: 100.01, monthlyInflowEur: 250 });
  });
});

describe('closing and deleting free the lock', () => {
  it('closePlan frees the lock that names the plan', async () => {
    store.set('accumulationPlans/p1', planDoc('active'));
    store.set(LOCK, { userId: OWNER, openPlanId: 'p1' });
    await closePlan(OWNER, 'p1', 'cancelled');
    expect(store.get('accumulationPlans/p1')?.status).toBe('cancelled');
    expect(store.get(LOCK)?.openPlanId).toBeNull();
  });

  it('closePlan leaves a lock that names another plan', async () => {
    store.set('accumulationPlans/p1', planDoc('active'));
    store.set(LOCK, { userId: OWNER, openPlanId: 'p2' });
    await closePlan(OWNER, 'p1', 'completed');
    expect(store.get(LOCK)?.openPlanId).toBe('p2');
  });

  it('deleteDraftPlan deletes the draft and frees the lock', async () => {
    store.set('accumulationPlans/p1', planDoc('draft'));
    store.set(LOCK, { userId: OWNER, openPlanId: 'p1' });
    await deleteDraftPlan(OWNER, 'p1');
    expect(store.has('accumulationPlans/p1')).toBe(false);
    expect(store.get(LOCK)?.openPlanId).toBeNull();
  });
});

describe('reactivatePlan and the lock', () => {
  const stopped = () => planDoc('cancelled', { closedAt: new Date('2027-01-05T12:00:00') });

  it('reactivates with the lock free and takes it', async () => {
    store.set('accumulationPlans/p1', stopped());
    store.set(LOCK, { userId: OWNER, openPlanId: null });
    await reactivatePlan(OWNER, 'p1', NOW);
    expect(store.get('accumulationPlans/p1')?.status).toBe('active');
    expect(store.get(LOCK)?.openPlanId).toBe('p1');
  });

  it('refuses while the lock holds another open plan', async () => {
    store.set('accumulationPlans/p1', stopped());
    store.set('accumulationPlans/p2', planDoc('draft'));
    store.set(LOCK, { userId: OWNER, openPlanId: 'p2' });
    await expect(reactivatePlan(OWNER, 'p1', NOW)).rejects.toThrow(ACCUMULO_REACTIVATE_REFUSED);
    expect(writes).toHaveLength(0);
  });
});

describe('every euro field is written in cents', () => {
  const etf = { id: 'etf-a', type: 'etf', assetClass: 'equity', quantity: 3, currentPrice: 33.333, currency: 'EUR' } as Asset;
  const other = { id: 'etf-b', type: 'etf', assetClass: 'equity', quantity: 1, currentPrice: 33.333, currency: 'EUR' } as Asset;
  const cash = { id: 'cash', type: 'cash', assetClass: 'cash', quantity: 1000, currentPrice: 1, currency: 'EUR' } as Asset;
  const deps = { valueOf: (a: Asset) => a.quantity * a.currentPrice, priceOf: (a: Asset) => a.currentPrice };
  const compare = () => ({ byAssetClass: { equity: { currentValue: 133.332 }, cash: { currentValue: 1000.004 } }, marketValue: 1133.336 }) as never;

  it('activatePlan: the baseline, the sale and the calendar', async () => {
    store.set('accumulationPlans/p1', planDoc('draft', { disposals: [{ assetId: 'etf-b', quantity: 1, estimatedProceedsEur: 0, status: 'planned' }] }));
    await activatePlan('p1', { allAssets: [etf, other, cash], targets: {} as never, compare, deps, today: NOW });
    const written = writes.find((w) => w.path === 'accumulationPlans/p1')?.data;
    expect(written?.status).toBe('active');
    expect(nonCentEuros(written)).toEqual([]);
  });

  it('setInstallmentLine: a line closed by hand at 10,005 €', async () => {
    store.set('accumulationPlans/p1', planDoc('active', {
      installments: [{ index: 1, month: '2027-01', carryInEur: {}, lines: [{ positionId: 'pos-a', assetId: 'etf-a', plannedQuantity: 1, priceEurAtPlan: 10, plannedAmountEur: 10, status: 'planned' }] }],
    }));
    await setInstallmentLine('p1', 1, 'pos-a', { status: 'executed', executedQuantity: 1, executedAmountEur: 10.005 }, { allAssets: [etf, cash], targets: {} as never, compare, today: NOW });
    const written = writes.find((w) => w.path === 'accumulationPlans/p1')?.data;
    expect(nonCentEuros(written)).toEqual([]);
    expect((written?.installments as Array<{ lines: Array<{ executedAmountEur: number }> }>)[0].lines[0].executedAmountEur).toBe(10.01);
  });
});

// The review month the Consulente proposes travels with the draft (2026-11-19). Mutation that turns it red:
// `reviewMonthIndex` omitted from `createDraftPlan`'s payload.
describe('createDraftPlan and the review month', () => {
  it('writes it when the draft has one, no key when it has none', async () => {
    const withReview = await createDraftPlan(OWNER, { ...draft, reviewMonthIndex: 2 });
    expect(store.get(`accumulationPlans/${withReview}`)?.reviewMonthIndex).toBe(2);
    store.clear();
    const without = await createDraftPlan(OWNER, draft);
    expect(store.get(`accumulationPlans/${without}`)).not.toHaveProperty('reviewMonthIndex');
  });
});

// A replaced draft keeps nothing of the plan it replaces (2026-11-20): `updateDraftPlan` writes the three optional
// fields when the new draft defines them and clears them with `deleteField()` when it does not. Mutation that turns
// it red: `removeUndefinedDeep` dropping the absent fields from the patch, as before (the old ones survived).
describe('updateDraftPlan replaces the draft whole', () => {
  const snapshot = { computedAt: NOW, mode: 'ideal', settingsUsed: {}, weights: [], objectives: [] };

  it('clears reviewMonthIndex, advisorNotes and optimizerSnapshot the new draft does not carry', async () => {
    store.set('accumulationPlans/d1', planDoc('draft', { reviewMonthIndex: 2, advisorNotes: ['Vecchia nota.'], optimizerSnapshot: snapshot }));
    await updateDraftPlan('d1', draft);
    const written = writes.find((w) => w.path === 'accumulationPlans/d1')?.data;
    expect(written?.reviewMonthIndex).toEqual(DELETE);
    expect(written?.advisorNotes).toEqual(DELETE);
    expect(written?.optimizerSnapshot).toEqual(DELETE);
  });

  it('writes the three when the new draft defines them', async () => {
    store.set('accumulationPlans/d1', planDoc('draft'));
    await updateDraftPlan('d1', { ...draft, reviewMonthIndex: 3, advisorNotes: ['Nota nuova.'], optimizerSnapshot: snapshot as never });
    const written = writes.find((w) => w.path === 'accumulationPlans/d1')?.data;
    expect(written?.reviewMonthIndex).toBe(3);
    expect(written?.advisorNotes).toEqual(['Nota nuova.']);
    expect(written?.optimizerSnapshot).toMatchObject({ mode: 'ideal' });
  });
});

describe('createDraftPlan and the advisor notes', () => {
  it('writes them when the draft has them, no key when it has none', async () => {
    const withNotes = await createDraftPlan(OWNER, { ...draft, advisorNotes: ['ETF A: limite applicato.'] });
    expect(store.get(`accumulationPlans/${withNotes}`)?.advisorNotes).toEqual(['ETF A: limite applicato.']);
    store.clear();
    const without = await createDraftPlan(OWNER, draft);
    expect(store.get(`accumulationPlans/${without}`)).not.toHaveProperty('advisorNotes');
  });
});

// ONE write path for a plan the path or the Consulente creates (2026-11-20): the gate before any write, the draft (new or an
// open one overwritten), the activation, then the model — whose failure never undoes the plan. Mutation that turns
// it red: validate after `createDraftPlan` (a draft with an issue is written).
describe('createAndActivatePlan', () => {
  const etf = { id: 'etf-a', type: 'etf', assetClass: 'equity', quantity: 3, currentPrice: 100, currency: 'EUR' } as Asset;
  const cash = { id: 'cash', type: 'cash', assetClass: 'cash', quantity: 1000, currentPrice: 1, currency: 'EUR' } as Asset;
  const deps = { valueOf: (a: Asset) => a.quantity * a.currentPrice, priceOf: (a: Asset) => a.currentPrice };
  const compare = () => ({ byAssetClass: { equity: { currentValue: 300 }, cash: { currentValue: 1000 } }, marketValue: 1300 }) as never;
  const activate = { allAssets: [etf, cash], targets: {} as never, compare, deps, today: NOW };
  const model = { input: { weights: [{ assetId: 'etf-a', targetPercentage: 100 }], origin: 'manual' as const }, basis: { targets: null, criteria: {} as never, goals: null } };

  beforeEach(() => saveModelPortfolio.mockReset().mockResolvedValue(undefined));

  it('refuses a draft the gate has an issue with, before any write', async () => {
    const error = await createAndActivatePlan({ ownerId: OWNER, draft, activate: { ...activate, allAssets: [etf] } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PlanWriteError);
    expect((error as PlanWriteError).step).toBe('plan');
    expect(writes).toHaveLength(0);
  });

  it('creates the draft, activates it and writes the model', async () => {
    const { planId, modelError } = await createAndActivatePlan({ ownerId: OWNER, draft, activate, model });
    expect(store.get(`accumulationPlans/${planId}`)?.status).toBe('active');
    expect(modelError).toBeNull();
    expect(saveModelPortfolio).toHaveBeenCalledWith(OWNER, model.input, activate.allAssets, model.basis);
  });

  it('overwrites the open draft it is given, never a second plan', async () => {
    store.set('accumulationPlans/d1', planDoc('draft'));
    store.set(LOCK, { userId: OWNER, openPlanId: 'd1' });
    const { planId } = await createAndActivatePlan({ ownerId: OWNER, draft: { ...draft, name: 'Nuovo' }, existingDraftId: 'd1', activate });
    expect(planId).toBe('d1');
    expect(store.get('accumulationPlans/d1')).toMatchObject({ status: 'active', name: 'Nuovo' });
    expect([...store.keys()].filter((key) => key.startsWith('accumulationPlans/'))).toEqual(['accumulationPlans/d1']);
  });

  it('an activation that fails is the step activate, with the draft it left', async () => {
    const failing = () => { throw new Error('boom'); };
    const error = await createAndActivatePlan({ ownerId: OWNER, draft, activate: { ...activate, compare: failing as never } }).catch((e: unknown) => e);
    expect((error as PlanWriteError).step).toBe('activate');
    const planId = (error as PlanWriteError).planId!;
    expect(store.get(`accumulationPlans/${planId}`)?.status).toBe('draft');
  });

  it('a model that cannot be written leaves the plan active and comes back as a sentence', async () => {
    saveModelPortfolio.mockRejectedValueOnce(new Error('rete'));
    const { planId, modelError } = await createAndActivatePlan({ ownerId: OWNER, draft, activate, model });
    expect(store.get(`accumulationPlans/${planId}`)?.status).toBe('active');
    expect(typeof modelError).toBe('string');
  });
});
