/**
 * The two writers of `goalBasedInvesting/{uid}` invalidate the Panoramica's summary after the write
 * (2026-10-03, PERF-07): the Obiettivo tile reads that document, and a summary now fresh for the whole
 * Italian day would otherwise show the old goals for hours — after a save on FIRE › Obiettivi
 * (`saveGoalData`, client SDK) or a goal proposed by the assistant (`appendInvestmentGoal`, Admin SDK).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { order } = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/assetService', () => ({ calculateAssetValue: vi.fn(() => 0) }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, name: string, id: string) => ({ collectionName: name, id }),
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => { order.push('client write'); }),
}));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(async (_owner: string, reason: string) => { order.push(reason); }),
}));
vi.mock('@/lib/services/dashboardOverviewInvalidation.server', () => ({
  invalidateDashboardOverviewSummaryServer: vi.fn(async (_owner: string, reason: string) => { order.push(reason); }),
}));
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    runTransaction: async <T,>(body: (tx: unknown) => Promise<T>) => {
      const result = await body({
        get: async () => ({ exists: false, data: () => undefined }),
        set: () => {},
      });
      order.push('server write');
      return result;
    },
  },
}));

import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';
import { saveGoalData } from '@/lib/services/goalService';
import { appendInvestmentGoal } from '@/lib/server/goalData';
import type { InvestmentGoal } from '@/types/goals';

describe('goal writes → the overview summary', () => {
  beforeEach(() => {
    order.length = 0;
    vi.mocked(invalidateDashboardOverviewSummary).mockClear();
    vi.mocked(invalidateDashboardOverviewSummaryServer).mockClear();
  });

  it('a save from FIRE › Obiettivi invalidates the owner\'s summary after the write', async () => {
    await saveGoalData('owner', { goals: [], assignments: [] });

    expect(order).toEqual(['client write', 'goal_data_saved']);
    expect(invalidateDashboardOverviewSummary).toHaveBeenCalledWith('owner', 'goal_data_saved');
  });

  it('a goal added by the assistant invalidates the owner\'s summary after the transaction', async () => {
    const goal = { id: 'g1', name: 'Casa', targetAmount: 50000, priority: 'alta' } as unknown as Omit<InvestmentGoal, 'color'>;

    await appendInvestmentGoal('owner', goal);

    expect(order).toEqual(['server write', 'goal_created']);
    expect(invalidateDashboardOverviewSummaryServer).toHaveBeenCalledWith('owner', 'goal_created');
  });
});
