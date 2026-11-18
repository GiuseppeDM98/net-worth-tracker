/**
 * The Consulente's read of the plan of accumulation (lib/server/allocationAdvice/accumulationPlan.ts,
 * owner 2026-11-12): the active plan only, through the slim domain mapper; a draft, a closed plan or
 * none read as «no active plan», the assets not read for a draft; a failed read is `{ read: false }`
 * and one log line, never a failed stage. `adminDb` is faked: a collection answers its `where` query.
 *
 * Mutation that turns it red: rethrow in the reader's catch.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { collections, queried } = vi.hoisted(() => ({
  collections: new Map<string, Array<{ id: string; data: Record<string, unknown> }> | Error>(),
  queried: [] as Array<{ name: string; field: string; value: unknown }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      where: (field: string, _op: string, value: unknown) => ({
        get: async () => {
          queried.push({ name, field, value });
          const rows = collections.get(name) ?? [];
          if (rows instanceof Error) throw rows;
          return { docs: rows.map((row) => ({ id: row.id, data: () => row.data })) };
        },
      }),
    }),
  },
}));

import { readAccumulationPlanForAdvice } from '@/lib/server/allocationAdvice/accumulationPlan';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const line = (assetId: string, amount: number) => ({ positionId: `p-${assetId}`, assetId, plannedQuantity: 1, priceEurAtPlan: amount, plannedAmountEur: amount, status: 'planned' });
const plan = (id: string, status: string, startMonth: string) => ({
  id,
  data: {
    userId: 'u1', name: 'Piano', status, startMonth, months: 12,
    liquidity: { sourceAccountIds: [], reserveEur: 0, monthlyInflowEur: 500 },
    positions: [
      { id: 'p-a', label: 'ETF ornitorinco', targetPercentage: 70, memberAssetIds: ['a'], buyAssetId: 'a' },
      { id: 'p-b', label: 'ETF sparito', targetPercentage: 30, memberAssetIds: ['b'], buyAssetId: 'b' },
    ],
    disposals: [],
    installments: status === 'draft' ? [] : [{ index: 1, month: startMonth, lines: [line('a', 350), line('b', 150)], carryInEur: {} }],
    createdAt: NOW, updatedAt: NOW,
  },
});

describe('readAccumulationPlanForAdvice', () => {
  beforeEach(() => {
    collections.clear();
    queried.length = 0;
    vi.restoreAllMocks();
  });

  it('no plan → read, no plan; the query filters on the owner', async () => {
    expect(await readAccumulationPlanForAdvice('u1', NOW)).toEqual({ read: true, plan: null });
    expect(queried).toEqual([{ name: 'accumulationPlans', field: 'userId', value: 'u1' }]);
  });

  it('a draft or a completed plan → no active plan, and the assets are not read', async () => {
    collections.set('accumulationPlans', [plan('d', 'draft', '2026-11')]);
    expect(await readAccumulationPlanForAdvice('u1', NOW)).toEqual({ read: true, plan: null });
    collections.set('accumulationPlans', [plan('c', 'completed', '2025-01')]);
    expect(await readAccumulationPlanForAdvice('u1', NOW)).toEqual({ read: true, plan: null });
    expect(queried.some((q) => q.name === 'assets')).toBe(false);
  });

  it('an active plan starting next month → month 0, the first instalment; names from the assets, then the labels', async () => {
    collections.set('accumulationPlans', [plan('x', 'active', '2026-11')]);
    collections.set('assets', [{ id: 'a', data: { userId: 'u1', name: 'ETF Ornitorinco World' } }]);
    const read = await readAccumulationPlanForAdvice('u1', NOW);
    expect(read).toMatchObject({ read: true, plan: { monthIndex: 0, months: 12, instalmentEur: 500, startMonth: '2026-11', endMonth: '2027-10' } });
    if (!read.read || !read.plan) throw new Error('expected a plan');
    expect(read.plan.buys.map((b) => b.name)).toEqual(['ETF Ornitorinco World', 'ETF sparito']);
    expect(queried.find((q) => q.name === 'assets')).toEqual({ name: 'assets', field: 'userId', value: 'u1' });
  });

  it('a rejected read → not read, one error in the log, never a throw', async () => {
    collections.set('accumulationPlans', new Error('permission-denied'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await readAccumulationPlanForAdvice('u1', NOW)).toEqual({ read: false });
    expect(log).toHaveBeenCalledTimes(1);
  });
});
