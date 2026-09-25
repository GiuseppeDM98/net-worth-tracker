/**
 * Tests for lib/utils/fireDistribution.ts — the Distribuzione view's numbers: the FIRE year
 * across the fan's paths (percentile years, the «never» count, the tails around the base year),
 * the lever on the bad tail (a bisection over a runner the test fakes, so the search itself is
 * what is tested), and the retirement survival among the paths that retire.
 */

import { describe, expect, it } from 'vitest';
import type { AccumulationSimulationResult, RetirementOutcome } from '@/lib/services/monteCarloService';
import {
  fireYearAtPercentile,
  resolveLeverCap,
  solveSavingsForTail,
  summarizeFireYearDistribution,
  summarizeRetirementSurvival,
} from '@/lib/utils/fireDistribution';

function makeResult(fireYears: (number | null)[], horizonYears: number, retirements: (RetirementOutcome | null)[] = [], retirementHorizonYears = horizonYears): AccumulationSimulationResult {
  return {
    paths: [],
    percentiles: Array.from({ length: horizonYears + 1 }, (_, year) => ({ year, p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, fireTarget: 0, fireProbability: 0 })),
    fireYears,
    retirements,
    retirementHorizonYears,
  };
}

describe('fireYearAtPercentile', () => {
  it('reads the nearest-rank year, «never» sorting last', () => {
    const years = [3, 5, null, 8, 1];
    expect(fireYearAtPercentile(years, 0.1)).toBe(1);
    expect(fireYearAtPercentile(years, 0.5)).toBe(5);
    expect(fireYearAtPercentile(years, 0.9)).toBeNull();
    expect(fireYearAtPercentile([], 0.5)).toBeNull();
  });

  it('is the year by which AT LEAST the share is FIRE, ties included — never the next path\'s year', () => {
    // Ten paths, exactly one never: nine in ten ARE FIRE by year 9, so the 90th percentile is 9,
    // not «never» (which `floor(10 × 0,9)` = index 9 would read). The sentence built on it
    // («nove percorsi su dieci entro il…») has to be exactly true.
    expect(fireYearAtPercentile([4, 5, 6, 6, 6, 7, 7, 8, 9, null], 0.9)).toBe(9);
    expect(fireYearAtPercentile([4, 5, 6, 6, 6, 7, 7, 8, 9, null], 0.5)).toBe(6);
  });
});

describe('summarizeFireYearDistribution', () => {
  // Ten paths, base year 6, horizon 10: two early, three at the base, four late, one never.
  const fireYears = [4, 5, 6, 6, 6, 7, 7, 8, 9, null];

  it('bins the years, counts the never paths apart and dates the percentiles', () => {
    const d = summarizeFireYearDistribution(makeResult(fireYears, 10), 2026, 6);
    expect(d.pathCount).toBe(10);
    expect(d.neverCount).toBe(1);
    expect(d.neverPct).toBe(10);
    expect(d.horizonCalendarYear).toBe(2036);
    expect(d.baseCalendarYear).toBe(2032);
    expect(d.atStart).toBe(false);
    // Nearest rank on ten paths: the 1st, 5th and 9th smallest years.
    expect(d.p10Year).toBe(2030);
    expect(d.p50Year).toBe(2032);
    expect(d.p90Year).toBe(2035);
    expect(d.binWidthYears).toBe(1);
    expect(d.bins.map((bin) => bin.fromYear)).toEqual([2030, 2031, 2032, 2033, 2034, 2035]);
    expect(d.bins.map((bin) => bin.count)).toEqual([1, 1, 3, 2, 1, 1]);
    // Shares are of ALL paths, the never one included: the bars and the «oltre» bar add to 100.
    expect(d.bins.reduce((sum, bin) => sum + bin.sharePct, 0) + d.neverPct).toBeCloseTo(100);
    expect(d.bins.find((bin) => bin.isReference)?.fromYear).toBe(2032);
  });

  it('splits the tails around the base year, the never paths counted as late', () => {
    const d = summarizeFireYearDistribution(makeResult(fireYears, 10), 2026, 6);
    expect(d.earlyCount).toBe(2);
    expect(d.atBaseCount).toBe(3);
    expect(d.lateCount).toBe(5);
  });

  it('flags a target cleared today, and a base that never reaches FIRE', () => {
    expect(summarizeFireYearDistribution(makeResult([0, 0, 0], 5), 2026, 0)).toMatchObject({ atStart: true, p50Year: 2026, baseCalendarYear: 2026 });
    const d = summarizeFireYearDistribution(makeResult(fireYears, 10), 2026, null);
    expect(d.baseCalendarYear).toBeNull();
    expect(d.bins.every((bin) => !bin.isReference)).toBe(true);
    expect(d.earlyCount).toBe(9);
    expect(d.lateCount).toBe(1);
  });

  it('leaves a percentile null when the horizon cuts it', () => {
    const d = summarizeFireYearDistribution(makeResult([2, 3, null, null, null, null], 10), 2026, 3);
    expect(d.p10Year).toBe(2028);
    expect(d.p50Year).toBeNull();
    expect(d.p90Year).toBeNull();
  });
});

describe('resolveLeverCap', () => {
  it('is three savings, or the expenses, never under 12.000 €, rounded up to the thousand', () => {
    expect(resolveLeverCap(1_000, 5_000)).toBe(12_000);
    expect(resolveLeverCap(10_000, 20_000)).toBe(30_000);
    expect(resolveLeverCap(7_000, 25_000)).toBe(25_000);
    expect(resolveLeverCap(7_500, 20_000)).toBe(23_000);
  });
});

describe('solveSavingsForTail', () => {
  /**
   * A fake engine, monotone by construction: the tail year (the 9th of 10 sorted, nearest rank)
   * is ceil(30 − s/1000), the lucky year (the 1st) ceil(15 − s/1000), both never under 1. So
   * 10.000 € a year brings the tail to 20.
   */
  const fake = (annualSavings: number): AccumulationSimulationResult => {
    const tail = Math.max(1, Math.ceil(30 - annualSavings / 1000));
    const lucky = Math.max(1, Math.ceil(15 - annualSavings / 1000));
    return makeResult([...Array.from({ length: 8 }, () => lucky), tail, tail], 40);
  };

  it('finds the smallest extra saving, rounded up to the step, that brings the tail within the target', () => {
    let runs = 0;
    const lever = solveSavingsForTail({
      baseResult: fake(0),
      run: (savings) => {
        runs += 1;
        return fake(savings);
      },
      baseAnnualSavings: 0,
      targetYears: 20,
      extraCap: 30_000,
    });
    expect(lever.extraAnnualSavings).not.toBeNull();
    expect(lever.extraAnnualSavings as number).toBeGreaterThanOrEqual(10_000);
    expect(lever.extraAnnualSavings as number).toBeLessThanOrEqual(10_100);
    expect((lever.extraAnnualSavings as number) % 100).toBe(0);
    // The printed figure is one that meets the target — re-run, not assumed.
    expect(lever.tailYearsAfter).toBe(20);
    expect(lever.tailYearsBefore).toBe(30);
    expect(lever.luckyYearsBefore).toBe(15);
    expect(lever.luckyYearsAfter).toBe(5);
    expect(runs).toBeLessThan(16);
  });

  it('answers 0 when the tail is already within the target', () => {
    const lever = solveSavingsForTail({ baseResult: fake(12_000), run: fake, baseAnnualSavings: 12_000, targetYears: 20, extraCap: 30_000 });
    expect(lever.extraAnnualSavings).toBe(0);
    expect(lever.tailYearsAfter).toBe(lever.tailYearsBefore);
  });

  it('answers null, with what the cap achieves, when the cap is not enough', () => {
    const lever = solveSavingsForTail({ baseResult: fake(0), run: fake, baseAnnualSavings: 0, targetYears: 20, extraCap: 5_000 });
    expect(lever.extraAnnualSavings).toBeNull();
    expect(lever.tailYearsAfter).toBe(25);
    expect(lever.extraCap).toBe(5_000);
  });

  it('treats a tail beyond the horizon as not meeting the target', () => {
    const never = (savings: number): AccumulationSimulationResult => (savings >= 8_000 ? fake(savings) : makeResult([1, 1, 1, 1, 1, 1, 1, 1, null, null], 40));
    const lever = solveSavingsForTail({ baseResult: never(0), run: never, baseAnnualSavings: 0, targetYears: 25, extraCap: 30_000 });
    expect(lever.tailYearsBefore).toBeNull();
    expect(lever.extraAnnualSavings).not.toBeNull();
    expect(lever.extraAnnualSavings as number).toBeGreaterThanOrEqual(8_000);
  });
});

describe('summarizeRetirementSurvival', () => {
  const outcome = (fireYear: number, ruinYear: number | null): RetirementOutcome => ({ fireYear, ruinYear, finalValue: ruinYear === null ? 100 : 0 });

  it('counts the retired paths, the survivors, and dates the worst tenth', () => {
    const retirements = [null, outcome(5, null), outcome(4, 20), outcome(6, 25), ...Array.from({ length: 7 }, () => outcome(5, null))];
    const s = summarizeRetirementSurvival(makeResult([], 10, retirements, 50), 2026, 40);
    expect(s).not.toBeNull();
    expect(s).toMatchObject({ retiredCount: 10, survivedCount: 8, ruinedCount: 2, survivedPct: 80, horizonCalendarYear: 2076, horizonAge: 90 });
    // Sorted ruin years [20, 25, ∞…]: the 1st of 10 (nearest rank) → 20: by 2046 one in ten has run out.
    expect(s?.p10RuinCalendarYear).toBe(2046);
    expect(s?.medianYearsLastedWhenRuined).toBe(19);
  });

  it('has no worst-tenth year when fewer than one in ten run out, and no age without one', () => {
    const retirements = [outcome(4, 30), ...Array.from({ length: 19 }, () => outcome(5, null))];
    const s = summarizeRetirementSurvival(makeResult([], 10, retirements, 50), 2026, undefined);
    expect(s?.p10RuinCalendarYear).toBeNull();
    expect(s?.medianYearsLastedWhenRuined).toBe(26);
    expect(s?.horizonAge).toBeNull();
  });

  it('is null when no path retires', () => {
    expect(summarizeRetirementSurvival(makeResult([null, null], 10, [null, null]), 2026, 40)).toBeNull();
  });
});
