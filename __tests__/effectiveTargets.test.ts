/**
 * Tests for `resolveEffectiveTargets` (lib/services/assetAllocationService.ts) — the targets Allocazione
 * measures, goal-driven ones included, moved out of the page (2026-11-20) so the Consulente's plan
 * measures the same. It lives beside `buildTargetsFromGoalAllocation` and `getDefaultTargets` (owner,
 * 2026-11-20): `allocationUtils` stays Firebase-free. Mutation that turns it red: return
 * `settings.targets` always.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Asset, AssetAllocationSettings } from '@/types/assets';
import type { GoalBasedInvestingData } from '@/types/goals';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('@/lib/services/assetService', () => ({
  calculateAssetValue: (asset: Asset) => asset.quantity * asset.currentPrice,
  calculateTotalValue: (assets: Asset[]) => assets.reduce((sum, asset) => sum + asset.quantity * asset.currentPrice, 0),
}));

import { getDefaultTargets } from '@/lib/services/assetAllocationService';
import { resolveEffectiveTargets } from '@/lib/services/effectiveTargets';

const settings: AssetAllocationSettings = {
  targets: { equity: { targetPercentage: 70 }, bonds: { targetPercentage: 30 } },
  goalBasedInvestingEnabled: true,
  goalDrivenAllocationEnabled: true,
} as AssetAllocationSettings;

const goals: GoalBasedInvestingData = {
  goals: [
    {
      id: 'g1', name: 'Casa', targetAmount: 10000, priority: 'high', color: '#000',
      recommendedAllocation: { equity: 20, bonds: 80 }, createdAt: new Date(0), updatedAt: new Date(0),
    } as never,
  ],
  assignments: [],
};

describe('resolveEffectiveTargets', () => {
  it('goal-driven with goals → the targets derived from them', () => {
    const result = resolveEffectiveTargets(settings, goals, []);
    expect(result.fromGoals).toBe(true);
    expect(result.targets.equity?.targetPercentage).toBe(20);
    expect(result.targets.bonds?.targetPercentage).toBe(80);
  });

  it('goal-driven off, or no goal → the stored targets', () => {
    const off = resolveEffectiveTargets({ ...settings, goalDrivenAllocationEnabled: false }, goals, []);
    expect(off).toEqual({ targets: settings.targets, fromGoals: false });
    const none = resolveEffectiveTargets(settings, { goals: [], assignments: [] }, []);
    expect(none).toEqual({ targets: settings.targets, fromGoals: false });
  });

  it('no settings → the defaults', () => {
    expect(resolveEffectiveTargets(null, null, [])).toEqual({ targets: getDefaultTargets(), fromGoals: false });
  });
});
