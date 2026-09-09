/**
 * Tests for lib/utils/fireSummary.ts — the numbers of the FIRE › Calcolatore page: the target
 * (progress and gap), the timeline of the base scenario, the three scenarios as rows, the
 * passive income today, the pension lock as the page reads it and the fan's verdict.
 *
 * Pure: every figure comes from the results of `fireService` / `pensionUnlock` /
 * `monteCarloService` already computed by the tab; nothing here re-runs a projection.
 */

import { describe, expect, it } from 'vitest';

import {
  formatAllocationLabel,
  resolveFanVerdict,
  summarizeLock,
  summarizePassiveIncome,
  summarizeScenarios,
  summarizeTarget,
  summarizeTimeline,
} from '@/lib/utils/fireSummary';
import type { FIREMetrics } from '@/lib/services/fireService';
import type { FIREProjectionResult, FIREProjectionYearData } from '@/types/assets';
import type { PensionLockState } from '@/lib/utils/pensionUnlock';
import type { AccumulationSimulationResult } from '@/lib/services/monteCarloService';
import type { Asset } from '@/types/assets';

function metrics(overrides: Partial<FIREMetrics> = {}): FIREMetrics {
  return {
    currentNetWorth: 412_500,
    annualExpenses: 27_600,
    withdrawalRate: 4,
    fireNumber: 604_000,
    progressToFI: (412_500 / 604_000) * 100,
    annualAllowance: 16_500,
    monthlyAllowance: 1_375,
    dailyAllowance: 16_500 / 365,
    currentWR: (27_600 / 412_500) * 100,
    yearsOfExpenses: 412_500 / 27_600,
    liquidNetWorth: 260_000,
    illiquidNetWorth: 152_500,
    liquidAnnualAllowance: 10_400,
    illiquidAnnualAllowance: 6_100,
    liquidYearsOfExpenses: 260_000 / 27_600,
    illiquidYearsOfExpenses: 152_500 / 27_600,
    ...overrides,
  };
}

function yearRow(year: number, overrides: Partial<FIREProjectionYearData> = {}): FIREProjectionYearData {
  return {
    year,
    calendarYear: 2026 + year,
    bearNetWorth: 0,
    baseNetWorth: 0,
    bullNetWorth: 0,
    bearExpenses: 0,
    baseExpenses: Math.round(27_600 * Math.pow(1.025, year)),
    bullExpenses: 0,
    bearFireNumber: 0,
    baseFireNumber: 0,
    bullFireNumber: 0,
    bearFireReached: false,
    baseFireReached: false,
    bullFireReached: false,
    ...overrides,
  };
}

function projection(overrides: Partial<FIREProjectionResult> = {}): FIREProjectionResult {
  return {
    yearlyData: Array.from({ length: 15 }, (_, i) => yearRow(i + 1)),
    bearYearsToFIRE: 10,
    baseYearsToFIRE: 6,
    bullYearsToFIRE: 4,
    annualSavings: 22_200,
    initialNetWorth: 412_500,
    initialExpenses: 27_600,
    scenarios: {
      bear: { growthRate: 5, inflationRate: 3.5 },
      base: { growthRate: 7, inflationRate: 2.5 },
      bull: { growthRate: 9, inflationRate: 2 },
    },
    ...overrides,
  };
}

const fund = (id: string, unlockDate?: string): Asset =>
  ({ id, name: `Fondo ${id}`, type: 'pensionFund', pensionFundDetails: unlockDate ? { unlockDate } : undefined }) as unknown as Asset;

describe('summarizeTarget', () => {
  it('reads progress, gap and the standard number from the metrics', () => {
    const target = summarizeTarget(metrics(), true);
    expect(target).not.toBeNull();
    expect(target!.fireNumber).toBe(604_000);
    expect(target!.standardFireNumber).toBe(690_000);
    expect(target!.isBridge).toBe(true);
    expect(target!.progressPct).toBeCloseTo(68.29, 1);
    expect(target!.gap).toBe(191_500);
    expect(target!.reached).toBe(false);
  });

  it('is reached when the net worth covers the number, with a gap of zero', () => {
    const target = summarizeTarget(metrics({ currentNetWorth: 720_000, fireNumber: 690_000 }), false);
    expect(target!.reached).toBe(true);
    expect(target!.gap).toBe(0);
    expect(target!.progressPct).toBeCloseTo(104.35, 1);
    expect(target!.standardFireNumber).toBe(target!.fireNumber);
  });

  it('is null without a FIRE number (no expenses recorded)', () => {
    expect(summarizeTarget(metrics({ annualExpenses: 0, fireNumber: 0 }), false)).toBeNull();
  });
});

describe('summarizeTimeline', () => {
  it('names the base-scenario year, the age and the expenses at that year', () => {
    const timeline = summarizeTimeline(projection(), 2026, 38);
    expect(timeline.yearsToFire).toBe(6);
    expect(timeline.calendarYear).toBe(2032);
    expect(timeline.ageAtFire).toBe(44);
    expect(timeline.monthlyExpensesToday).toBe(2_300);
    // Year 6 of the projection: 27.600 × 1,025^6 ≈ 32.008 → 2.667 a month.
    expect(timeline.monthlyExpensesAtFire).toBeCloseTo(2_667.4, 0);
    expect(timeline.growthRate).toBe(7);
    expect(timeline.inflationRate).toBe(2.5);
    expect(timeline.horizonCalendarYear).toBe(2076);
  });

  it('drops the age without a user age and the FIRE figures beyond the horizon', () => {
    const timeline = summarizeTimeline(projection({ baseYearsToFIRE: null }), 2026, undefined);
    expect(timeline.yearsToFire).toBeNull();
    expect(timeline.calendarYear).toBeNull();
    expect(timeline.ageAtFire).toBeNull();
    expect(timeline.monthlyExpensesAtFire).toBeNull();
  });
});

describe('summarizeScenarios', () => {
  it('returns the three scenarios in bear · base · bull order with their years', () => {
    const rows = summarizeScenarios(projection(), 2026);
    expect(rows.map((r) => r.key)).toEqual(['bear', 'base', 'bull']);
    expect(rows.map((r) => r.label)).toEqual(['Orso', 'Base', 'Toro']);
    expect(rows.map((r) => r.calendarYear)).toEqual([2036, 2032, 2030]);
    expect(rows[0]).toMatchObject({ yearsToFire: 10, growthRate: 5, inflationRate: 3.5 });
  });

  it('keeps a null year for a scenario beyond the horizon', () => {
    const rows = summarizeScenarios(projection({ bearYearsToFIRE: null }), 2026);
    expect(rows[0].yearsToFire).toBeNull();
    expect(rows[0].calendarYear).toBeNull();
  });
});

describe('summarizePassiveIncome', () => {
  it('reads the allowance, its share of the expenses and the years covered', () => {
    const income = summarizePassiveIncome(metrics());
    expect(income.annual).toBe(16_500);
    expect(income.monthly).toBe(1_375);
    expect(income.daily).toBeCloseTo(45.2, 1);
    expect(income.shareOfExpensesPct).toBeCloseTo(59.8, 1);
    expect(income.yearsOfExpenses).toBeCloseTo(14.95, 2);
    expect(income.liquidYears).toBeCloseTo(9.42, 2);
    expect(income.illiquidYears).toBeCloseTo(5.53, 2);
    expect(income.currentWR).toBeCloseTo(6.69, 2);
    expect(income.swr).toBe(4);
    expect(income.overSwr).toBe(true);
  });

  it('has no share without expenses and is not over the SWR when the withdrawal is lower', () => {
    const income = summarizePassiveIncome(metrics({ annualExpenses: 0, currentWR: 0, yearsOfExpenses: 0 }));
    expect(income.shareOfExpensesPct).toBeNull();
    expect(income.overSwr).toBe(false);
  });
});

describe('summarizeLock', () => {
  const now = new Date(2026, 7, 25);

  it('is inactive when the toggle is off', () => {
    const lock = summarizeLock(null, { currentYear: 2026, ritaUnlockAge: 62 });
    expect(lock).toMatchObject({ active: false, lockedValue: 0, unlockCalendarYear: null, unlockAge: null, source: null, lockedFundCount: 0, unmodellableCount: 0 });
  });

  it('reads a RITA-driven lock: latest unlock year, the RITA age, the locked total', () => {
    const state: PensionLockState = {
      funds: [{ fund: fund('a'), unlockDate: new Date(2050, 7, 25), value: 48_000, isLocked: true }],
      totalLockedToday: 48_000,
      inflows: [{ yearsFromNow: 24, amount: 48_000 }],
    };
    const lock = summarizeLock(state, { currentYear: 2026, ritaUnlockAge: 62, now });
    expect(lock).toMatchObject({ active: true, lockedValue: 48_000, unlockCalendarYear: 2050, unlockAge: 62, source: 'rita', lockedFundCount: 1, unmodellableCount: 0 });
  });

  it('reads an override-driven lock without an age, and a mixed one as mixed', () => {
    const override: PensionLockState = {
      funds: [{ fund: fund('a', '2035-01-01'), unlockDate: new Date(2035, 0, 1), value: 30_000, isLocked: true }],
      totalLockedToday: 30_000,
      inflows: [{ yearsFromNow: 9, amount: 30_000 }],
    };
    expect(summarizeLock(override, { currentYear: 2026, ritaUnlockAge: 62, now })).toMatchObject({ unlockCalendarYear: 2035, unlockAge: null, source: 'override' });

    const mixed: PensionLockState = {
      funds: [
        { fund: fund('a', '2035-01-01'), unlockDate: new Date(2035, 0, 1), value: 30_000, isLocked: true },
        { fund: fund('b'), unlockDate: new Date(2050, 7, 25), value: 18_000, isLocked: true },
      ],
      totalLockedToday: 48_000,
      inflows: [{ yearsFromNow: 9, amount: 30_000 }, { yearsFromNow: 24, amount: 18_000 }],
    };
    expect(summarizeLock(mixed, { currentYear: 2026, ritaUnlockAge: 62, now })).toMatchObject({ unlockCalendarYear: 2050, unlockAge: null, source: 'mixed', lockedFundCount: 2 });
  });

  it('keeps a locked fund and an unmodellable one apart: one counts, the other is only counted', () => {
    const state: PensionLockState = {
      funds: [
        { fund: fund('a'), unlockDate: new Date(2050, 7, 25), value: 48_000, isLocked: true },
        { fund: fund('b'), unlockDate: null, value: 20_000, isLocked: false },
      ],
      totalLockedToday: 48_000,
      inflows: [{ yearsFromNow: 24, amount: 48_000 }],
    };
    expect(summarizeLock(state, { currentYear: 2026, ritaUnlockAge: 62, now })).toMatchObject({ lockedValue: 48_000, unlockCalendarYear: 2050, source: 'rita', lockedFundCount: 1, unmodellableCount: 1 });
  });

  it('counts the funds that cannot be modelled and reads no lock from them', () => {
    const state: PensionLockState = {
      funds: [{ fund: fund('a'), unlockDate: null, value: 48_000, isLocked: false }],
      totalLockedToday: 0,
      inflows: [],
    };
    expect(summarizeLock(state, { currentYear: 2026, ritaUnlockAge: 62, now })).toMatchObject({ active: true, lockedValue: 0, unlockCalendarYear: null, source: null, unmodellableCount: 1 });
  });
});

describe('resolveFanVerdict', () => {
  const result = (probabilities: number[]): AccumulationSimulationResult => ({
    paths: [],
    fireYears: [],
    percentiles: probabilities.map((fireProbability, year) => ({
      year,
      p10: 0,
      p25: 0,
      p50: 0,
      p75: 0,
      p90: 0,
      fireTarget: 0,
      fireProbability,
    })),
  });

  it('anchors on the deterministic base year when it exists', () => {
    expect(resolveFanVerdict(result([0, 5, 20, 40, 55, 65, 71.4, 80]), 6, 2026)).toEqual({ calendarYear: 2032, probabilityPct: 71, onHorizon: false });
  });

  it('falls back to the simulation horizon and says so', () => {
    expect(resolveFanVerdict(result([0, 5, 20, 40]), null, 2026)).toEqual({ calendarYear: 2029, probabilityPct: 40, onHorizon: true });
    // A base year past the simulated horizon (the fan caps at 40 years) is clamped to the horizon.
    expect(resolveFanVerdict(result([0, 5, 20, 40]), 12, 2026)).toEqual({ calendarYear: 2029, probabilityPct: 40, onHorizon: true });
  });
});

describe('formatAllocationLabel', () => {
  it('lists the non-zero classes in order', () => {
    expect(formatAllocationLabel({ equityPercentage: 62, bondsPercentage: 28, realEstatePercentage: 10, commoditiesPercentage: 0 })).toBe('62% azioni, 28% obbligazioni, 10% immobili');
  });
});
