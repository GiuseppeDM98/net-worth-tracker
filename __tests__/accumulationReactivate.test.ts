/**
 * AL12 «Riattiva» (D-AL2): the pure condition and the service, with Firestore simulated like the other
 * PAC tests. AL13's words: the average and the first month said together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const DELETE = { __deleteField: true };
const store = new Map<string, Record<string, unknown>>();
const updates: Array<Record<string, unknown>> = [];

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => 'col'),
  doc: vi.fn((_db: unknown, _col: string, id: string) => ({ id })),
  query: vi.fn(() => 'q'),
  where: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteField: vi.fn(() => DELETE),
  getDocs: vi.fn(async () => ({
    docs: [...store.entries()].map(([id, data]) => ({ id, data: () => data })),
  })),
  runTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
    await fn({
      get: async (ref: { id: string }) => ({ exists: () => store.has(ref.id), id: ref.id, data: () => store.get(ref.id) }),
      update: (_ref: unknown, payload: Record<string, unknown>) => updates.push(payload),
    });
  }),
}));

import { reactivatePlan } from '@/lib/services/accumulationPlanService';
import { canReactivatePlan, PLAN_REACTIVATION_DAYS } from '@/lib/utils/accumuloSummary';
import { describeInstallmentAverage } from '@/lib/utils/accumulationNarrative';
import type { AccumulationPlan } from '@/types/accumulationPlan';

const NOW = new Date('2026-10-16T12:00:00');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

function plan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  return {
    id: 'p1',
    userId: 'u',
    name: 'Piano',
    status: 'cancelled',
    startMonth: '2026-08',
    months: 12,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 0 },
    positions: [],
    disposals: [],
    installments: [],
    createdAt: daysAgo(90),
    updatedAt: daysAgo(10),
    closedAt: daysAgo(10),
    ...overrides,
  };
}

function stored(p: AccumulationPlan): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...p };
  delete rest.id;
  return rest;
}

describe('canReactivatePlan', () => {
  it('accepts a plan interrupted under 30 days ago when no other plan is open', () => {
    const p = plan();
    expect(canReactivatePlan(p, [p], NOW)).toBe(true);
  });

  it('refuses at 30 days and beyond', () => {
    expect(PLAN_REACTIVATION_DAYS).toBe(30);
    expect(canReactivatePlan(plan({ closedAt: daysAgo(29.5) }), [], NOW)).toBe(true);
    expect(canReactivatePlan(plan({ closedAt: daysAgo(30) }), [], NOW)).toBe(false);
    expect(canReactivatePlan(plan({ closedAt: daysAgo(45) }), [], NOW)).toBe(false);
  });

  it('never reactivates a completed plan, nor one without a closing date', () => {
    expect(canReactivatePlan(plan({ status: 'completed' }), [], NOW)).toBe(false);
    expect(canReactivatePlan(plan({ closedAt: undefined }), [], NOW)).toBe(false);
  });

  it('refuses while another plan is a draft or active (D12)', () => {
    const p = plan();
    expect(canReactivatePlan(p, [p, plan({ id: 'p2', status: 'active', closedAt: undefined })], NOW)).toBe(false);
    expect(canReactivatePlan(p, [p, plan({ id: 'p3', status: 'draft', closedAt: undefined })], NOW)).toBe(false);
    expect(canReactivatePlan(p, [p, plan({ id: 'p4', status: 'completed' })], NOW)).toBe(true);
  });
});

describe('reactivatePlan', () => {
  beforeEach(() => {
    store.clear();
    updates.length = 0;
  });

  it('writes status active and removes closedAt', async () => {
    store.set('p1', stored(plan()));
    await reactivatePlan('u', 'p1', NOW);
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBe('active');
    expect(updates[0].closedAt).toBe(DELETE);
  });

  it('refuses a plan stopped too long ago, a completed one and one with another plan open', async () => {
    store.set('p1', stored(plan({ closedAt: daysAgo(31) })));
    await expect(reactivatePlan('u', 'p1', NOW)).rejects.toThrow();
    store.set('p1', stored(plan({ status: 'completed' })));
    await expect(reactivatePlan('u', 'p1', NOW)).rejects.toThrow();
    store.set('p1', stored(plan()));
    store.set('p2', stored(plan({ id: 'p2', status: 'active', closedAt: undefined })));
    await expect(reactivatePlan('u', 'p1', NOW)).rejects.toThrow();
    expect(updates).toHaveLength(0);
  });

  it('refuses a plan that no longer exists', async () => {
    await expect(reactivatePlan('u', 'ghost', NOW)).rejects.toThrow();
  });
});

describe('describeInstallmentAverage (AL13)', () => {
  const flat = (text: string) => text.replace(/[  ]/g, ' ');

  it('names the average and the first month together', () => {
    const text = flat(describeInstallmentAverage({ averageEur: 4455, firstEur: 4207, firstMonth: '2026-10' }));
    expect(text).toMatch(/^in media 4\.?455 € al mese; la prima, ottobre, 4\.?207 €$/);
  });

  it('says one figure when the two coincide', () => {
    expect(flat(describeInstallmentAverage({ averageEur: 4207, firstEur: 4207.2, firstMonth: '2026-10' }))).toMatch(/^4\.?207 € al mese$/);
  });
});
