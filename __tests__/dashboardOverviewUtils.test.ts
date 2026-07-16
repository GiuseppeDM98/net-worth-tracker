/**
 * Tests for the pure helpers in lib/utils/dashboardOverviewUtils.ts.
 *
 * These back three additions to the Panoramica hero (see CLAUDE.md "Latest"):
 *   1. computeTopMovers — the "Guidato da" digest (1-2 asset classes that moved
 *      the most this month vs the previous snapshot).
 *   2. computeAllTimeHigh — the "Nuovo massimo storico" chip.
 *   3. pickFeaturedGoalProgress — the featured Goal-Based Investing progress note.
 *
 * No React, no Firebase — dashboardOverviewUtils imports only pure services/types.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { GoalAssetAssignment, InvestmentGoal } from '@/types/goals';

// dashboardOverviewUtils pulls in assetService/chartService/assetAllocationService for
// calculateAssetValue and prepareAssetClassDistributionData, which import the client
// Firebase SDK at module load time — mock it out so the suite doesn't need real Firebase
// env vars (same convention as __tests__/updateCashAssetBalancesAtomic.test.ts).
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  computeAllTimeHigh,
  computeTopMovers,
  pickFeaturedGoalProgress,
} from '@/lib/utils/dashboardOverviewUtils';

function makeAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    userId: 'u1',
    ticker: 'VWCE',
    name: 'Vanguard All-World',
    type: 'etf',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 10,
    currentPrice: 100,
    lastPriceUpdate: new Date(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<MonthlySnapshot> = {}): MonthlySnapshot {
  return {
    userId: 'u1',
    year: 2026,
    month: 6,
    totalNetWorth: 10000,
    liquidNetWorth: 10000,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: [],
    assetAllocation: {},
    createdAt: new Date(0),
    ...overrides,
  };
}

function makeGoal(overrides: Partial<InvestmentGoal> = {}): InvestmentGoal {
  return {
    id: 'g1',
    name: 'Acquisto Casa',
    priority: 'alta',
    color: '#3B82F6',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeTopMovers
// ---------------------------------------------------------------------------

describe('computeTopMovers', () => {
  it('returns [] when there is no previous snapshot', () => {
    const assets = [makeAsset({ quantity: 10, currentPrice: 100 })];
    expect(computeTopMovers(assets, null, 1000)).toEqual([]);
  });

  it('returns [] when totalValue is 0', () => {
    const previous = makeSnapshot({ byAssetClass: { equity: 1000 } });
    expect(computeTopMovers([], previous, 0)).toEqual([]);
  });

  it('ranks the largest absolute delta first, capped at 2 entries', () => {
    const assets = [
      makeAsset({ id: 'eq', assetClass: 'equity', quantity: 10, currentPrice: 150 }), // 1500
      makeAsset({ id: 'bd', assetClass: 'bonds', quantity: 10, currentPrice: 90 }), // 900
      makeAsset({ id: 'ca', assetClass: 'cash', quantity: 10, currentPrice: 100 }), // 1000, unchanged
    ];
    const previous = makeSnapshot({
      byAssetClass: { equity: 1000, bonds: 1000, cash: 1000 },
    });
    const movers = computeTopMovers(assets, previous, 3400);

    expect(movers).toHaveLength(2);
    // equity: +500, bonds: -100, cash: 0 (dropped as noise) — equity ranks first.
    expect(movers[0]).toMatchObject({ assetClass: 'equity', label: 'Azioni', delta: 500 });
    expect(movers[1]).toMatchObject({ assetClass: 'bonds', label: 'Obbligazioni', delta: -100 });
  });

  it('drops deltas under €1 as noise', () => {
    const assets = [makeAsset({ assetClass: 'equity', quantity: 10, currentPrice: 100.05 })];
    const previous = makeSnapshot({ byAssetClass: { equity: 1000 } });
    expect(computeTopMovers(assets, previous, 1000.5)).toEqual([]);
  });

  it('treats an asset class present only in the previous snapshot as a full sell-off', () => {
    const assets = [makeAsset({ assetClass: 'equity', quantity: 10, currentPrice: 100 })];
    const previous = makeSnapshot({ byAssetClass: { equity: 1000, crypto: 500 } });
    const movers = computeTopMovers(assets, previous, 1000);
    expect(movers).toContainEqual({ assetClass: 'crypto', label: 'Criptovalute', delta: -500 });
  });
});

// ---------------------------------------------------------------------------
// computeAllTimeHigh
// ---------------------------------------------------------------------------

describe('computeAllTimeHigh', () => {
  it('is not a new ATH with no prior snapshots (first-ever snapshot is a baseline)', () => {
    const result = computeAllTimeHigh([], 6, 2026, 10000);
    expect(result).toEqual({ previousAllTimeHigh: null, isNewATH: false });
  });

  it('flags a new ATH when the live value exceeds every prior snapshot', () => {
    const snapshots = [
      makeSnapshot({ month: 4, totalNetWorth: 8000 }),
      makeSnapshot({ month: 5, totalNetWorth: 9000 }),
    ];
    const result = computeAllTimeHigh(snapshots, 6, 2026, 9500);
    expect(result).toEqual({ previousAllTimeHigh: 9000, isNewATH: true });
  });

  it('does not flag an ATH when below the historical peak', () => {
    const snapshots = [
      makeSnapshot({ month: 4, totalNetWorth: 8000 }),
      makeSnapshot({ month: 5, totalNetWorth: 12000 }),
    ];
    const result = computeAllTimeHigh(snapshots, 6, 2026, 9500);
    expect(result).toEqual({ previousAllTimeHigh: 12000, isNewATH: false });
  });

  it('excludes the current month\'s own snapshot from the comparison (overwrite case)', () => {
    const snapshots = [
      makeSnapshot({ month: 5, totalNetWorth: 9000 }),
      makeSnapshot({ month: 6, totalNetWorth: 9800 }), // current month, already recorded
    ];
    // Recomputing this month at a slightly lower live value than its own stored
    // snapshot must compare against the prior month (9000), not against itself.
    const result = computeAllTimeHigh(snapshots, 6, 2026, 9500);
    expect(result).toEqual({ previousAllTimeHigh: 9000, isNewATH: true });
  });
});

// ---------------------------------------------------------------------------
// pickFeaturedGoalProgress
// ---------------------------------------------------------------------------

describe('pickFeaturedGoalProgress', () => {
  it('returns null when there are no goals', () => {
    expect(pickFeaturedGoalProgress([], [], [])).toBeNull();
  });

  it('returns null when every goal is open-ended (no targetAmount)', () => {
    const goals = [makeGoal({ targetAmount: undefined })];
    expect(pickFeaturedGoalProgress(goals, [], [])).toBeNull();
  });

  it('returns null when every eligible goal is already fully funded', () => {
    const goals = [makeGoal({ id: 'g1', targetAmount: 1000 })];
    const assets = [makeAsset({ id: 'a1', quantity: 10, currentPrice: 100 })]; // 1000
    const assignments: GoalAssetAssignment[] = [{ goalId: 'g1', assetId: 'a1', percentage: 100 }];
    expect(pickFeaturedGoalProgress(goals, assignments, assets)).toBeNull();
  });

  it('computes currentValue/progressPercentage from assigned asset portions', () => {
    const goals = [makeGoal({ id: 'g1', name: 'Fondo Emergenza', targetAmount: 2000 })];
    const assets = [makeAsset({ id: 'a1', quantity: 10, currentPrice: 100 })]; // 1000
    const assignments: GoalAssetAssignment[] = [{ goalId: 'g1', assetId: 'a1', percentage: 50 }]; // 500

    const result = pickFeaturedGoalProgress(goals, assignments, assets);
    expect(result).toMatchObject({
      goalId: 'g1',
      goalName: 'Fondo Emergenza',
      currentValue: 500,
      targetAmount: 2000,
      progressPercentage: 25,
    });
  });

  it('skips orphaned assignments referencing a deleted asset (contributes €0, not a crash)', () => {
    const goals = [makeGoal({ id: 'g1', targetAmount: 1000 })];
    const assignments: GoalAssetAssignment[] = [
      { goalId: 'g1', assetId: 'deleted-asset', percentage: 100 },
    ];
    const result = pickFeaturedGoalProgress(goals, assignments, []);
    expect(result).toMatchObject({ goalId: 'g1', currentValue: 0, progressPercentage: 0 });
  });

  it('prefers higher priority over higher progress percentage', () => {
    const goals = [
      makeGoal({ id: 'low-priority-90pct', priority: 'bassa', targetAmount: 1000 }),
      makeGoal({ id: 'high-priority-10pct', priority: 'alta', targetAmount: 1000 }),
    ];
    const assets = [
      makeAsset({ id: 'a1', quantity: 1, currentPrice: 900 }),
      makeAsset({ id: 'a2', quantity: 1, currentPrice: 100 }),
    ];
    const assignments: GoalAssetAssignment[] = [
      { goalId: 'low-priority-90pct', assetId: 'a1', percentage: 100 }, // 900/1000 = 90%
      { goalId: 'high-priority-10pct', assetId: 'a2', percentage: 100 }, // 100/1000 = 10%
    ];

    const result = pickFeaturedGoalProgress(goals, assignments, assets);
    expect(result?.goalId).toBe('high-priority-10pct');
  });

  it('breaks a priority tie by picking the furthest-along goal', () => {
    const goals = [
      makeGoal({ id: 'behind', priority: 'alta', targetAmount: 1000 }),
      makeGoal({ id: 'ahead', priority: 'alta', targetAmount: 1000 }),
    ];
    const assets = [
      makeAsset({ id: 'a1', quantity: 1, currentPrice: 200 }),
      makeAsset({ id: 'a2', quantity: 1, currentPrice: 800 }),
    ];
    const assignments: GoalAssetAssignment[] = [
      { goalId: 'behind', assetId: 'a1', percentage: 100 }, // 20%
      { goalId: 'ahead', assetId: 'a2', percentage: 100 }, // 80%
    ];

    const result = pickFeaturedGoalProgress(goals, assignments, assets);
    expect(result?.goalId).toBe('ahead');
  });
});
