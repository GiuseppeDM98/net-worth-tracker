/**
 * Tests for lib/utils/whatIfSummary.ts — the numbers of FIRE › What If, read from the impact the
 * service already computed: the event as the page states it, the job-loss decomposition, the
 * before/after pairs, the two projections merged into one series, the divergence at the FIRE
 * year and the sensitivity reading.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/expenseService', () => ({}));
vi.mock('@/lib/services/snapshotService', () => ({}));

import { calculateFIRESensitivityMatrix, getDefaultScenarios } from '@/lib/services/fireService';
import { applyScenarioToBaseline, calculateWhatIfImpact } from '@/lib/services/whatIfService';
import {
  buildWhatIfComparisonSeries,
  decomposeJobLossHit,
  summarizeDivergence,
  summarizeSensitivity,
  summarizeWhatIf,
  summarizeWhatIfEvent,
} from '@/lib/utils/whatIfSummary';
import type { WhatIfBaseline, WhatIfScenario } from '@/types/whatIf';

function makeBaseline(overrides: Partial<WhatIfBaseline> = {}): WhatIfBaseline {
  return {
    netWorth: 200_000,
    liquidNetWorth: 150_000,
    illiquidNetWorth: 50_000,
    annualExpenses: 24_000,
    annualSavings: 12_000,
    withdrawalRate: 4,
    scenarios: getDefaultScenarios(),
    coast: {
      currentAge: 35,
      retirementAge: 60,
      annualExpenses: 24_000,
      realReturnRate: 4.5,
      inflationRate: 2.5,
      pensions: [],
      taxBrackets: [],
    },
    ...overrides,
  };
}

describe('summarizeWhatIfEvent', () => {
  it('should state a job loss as months, lost income and its share of the household income', () => {
    const baseline = makeBaseline();
    const scenario: WhatIfScenario = { eventType: 'jobLoss', monthsWithoutIncome: 12, lostAnnualIncome: 27_000 };

    const event = summarizeWhatIfEvent(scenario, baseline, applyScenarioToBaseline(baseline, scenario));

    expect(event.kind).toBe('jobLoss');
    expect(event.isEmpty).toBe(false);
    expect(event.months).toBe(12);
    expect(event.lostAnnualIncome).toBe(27_000);
    // 27000 of the 36000 the household earns (expenses + savings).
    expect(event.lostShareOfIncomePct).toBeCloseTo(75, 5);
    expect(event.netWorthDelta).toBe(-27_000);
    expect(event.netWorthAfter).toBe(173_000);
  });

  it('should assume the whole household income is lost when no sources are selected', () => {
    const baseline = makeBaseline();
    const scenario: WhatIfScenario = { eventType: 'jobLoss', monthsWithoutIncome: 6 };

    const event = summarizeWhatIfEvent(scenario, baseline, applyScenarioToBaseline(baseline, scenario));

    expect(event.lostAnnualIncome).toBe(36_000);
    expect(event.lostShareOfIncomePct).toBeCloseTo(100, 5);
    expect(event.netWorthDelta).toBe(-18_000);
  });

  it('should be empty when a job loss has no months or no lost income', () => {
    const baseline = makeBaseline();
    const noMonths: WhatIfScenario = { eventType: 'jobLoss', monthsWithoutIncome: 0, lostAnnualIncome: 27_000 };
    const noIncome: WhatIfScenario = { eventType: 'jobLoss', monthsWithoutIncome: 6, lostAnnualIncome: 0 };

    expect(summarizeWhatIfEvent(noMonths, baseline, applyScenarioToBaseline(baseline, noMonths)).isEmpty).toBe(true);
    expect(summarizeWhatIfEvent(noIncome, baseline, applyScenarioToBaseline(baseline, noIncome)).isEmpty).toBe(true);
  });

  it('should be empty for a lump sum of zero and full for a positive one', () => {
    const baseline = makeBaseline();
    const empty: WhatIfScenario = { eventType: 'majorPurchase', lumpSumAmount: 0 };
    const purchase: WhatIfScenario = { eventType: 'majorPurchase', lumpSumAmount: 30_000 };
    const windfall: WhatIfScenario = { eventType: 'windfall', lumpSumAmount: 50_000 };

    expect(summarizeWhatIfEvent(empty, baseline, applyScenarioToBaseline(baseline, empty)).isEmpty).toBe(true);
    const bought = summarizeWhatIfEvent(purchase, baseline, applyScenarioToBaseline(baseline, purchase));
    expect(bought.isEmpty).toBe(false);
    expect(bought.lumpSum).toBe(30_000);
    expect(bought.netWorthDelta).toBe(-30_000);
    const received = summarizeWhatIfEvent(windfall, baseline, applyScenarioToBaseline(baseline, windfall));
    expect(received.netWorthDelta).toBe(50_000);
    expect(received.netWorthAfter).toBe(250_000);
  });

  it('should carry both cashflow deltas and the resulting yearly figures', () => {
    const baseline = makeBaseline();
    const scenario: WhatIfScenario = { eventType: 'cashflowChange', annualSavingsDelta: -6_000, annualExpensesDelta: 3_000 };

    const event = summarizeWhatIfEvent(scenario, baseline, applyScenarioToBaseline(baseline, scenario));

    expect(event.isEmpty).toBe(false);
    expect(event.savingsDelta).toBe(-6_000);
    expect(event.expensesDelta).toBe(3_000);
    expect(event.savingsAfter).toBe(6_000);
    expect(event.expensesAfter).toBe(27_000);
    expect(event.netWorthDelta).toBe(0);
  });

  it('should be empty for a cashflow change with both deltas at zero', () => {
    const baseline = makeBaseline();
    const scenario: WhatIfScenario = { eventType: 'cashflowChange', annualSavingsDelta: 0, annualExpensesDelta: 0 };

    expect(summarizeWhatIfEvent(scenario, baseline, applyScenarioToBaseline(baseline, scenario)).isEmpty).toBe(true);
  });

  it('should leave the income share unknown when the household earns nothing', () => {
    const baseline = makeBaseline({ annualExpenses: 0, annualSavings: 0 });
    const scenario: WhatIfScenario = { eventType: 'jobLoss', monthsWithoutIncome: 6, lostAnnualIncome: 10_000 };

    expect(summarizeWhatIfEvent(scenario, baseline, applyScenarioToBaseline(baseline, scenario)).lostShareOfIncomePct).toBeNull();
  });
});

describe('decomposeJobLossHit', () => {
  it('should split the hit into forgone savings and expenses drawn from the portfolio', () => {
    // 31800 lost of 49800 earned; savings 22200 first, then 9600 of expenses uncovered.
    const hit = decomposeJobLossHit({ annualSavings: 22_200, annualExpenses: 27_600, lostAnnualIncome: 31_800, months: 12 });

    expect(hit.totalIncome).toBe(49_800);
    expect(hit.retainedIncome).toBe(18_000);
    expect(hit.forgoneSavings).toBe(22_200);
    expect(hit.drawnExpenses).toBe(9_600);
    expect(hit.total).toBe(31_800);
  });

  it('should draw nothing from the portfolio when the retained income still covers the expenses', () => {
    const hit = decomposeJobLossHit({ annualSavings: 22_200, annualExpenses: 27_600, lostAnnualIncome: 18_000, months: 6 });

    expect(hit.forgoneSavings).toBe(9_000);
    expect(hit.drawnExpenses).toBe(0);
    expect(hit.total).toBe(9_000);
  });

  it('should pro-rate every figure on the months', () => {
    const hit = decomposeJobLossHit({ annualSavings: 12_000, annualExpenses: 24_000, lostAnnualIncome: 36_000, months: 3 });

    expect(hit.forgoneSavings).toBe(3_000);
    expect(hit.drawnExpenses).toBe(6_000);
    expect(hit.total).toBe(9_000);
  });

  it('should never go negative on nonsense input', () => {
    const hit = decomposeJobLossHit({ annualSavings: 12_000, annualExpenses: 24_000, lostAnnualIncome: -5, months: -2 });

    expect(hit.forgoneSavings).toBe(0);
    expect(hit.drawnExpenses).toBe(0);
    expect(hit.total).toBe(0);
  });
});

describe('summarizeWhatIf', () => {
  it('should pair every figure before and after, with the calendar years of the base scenario', () => {
    const baseline = makeBaseline();
    const scenario: WhatIfScenario = { eventType: 'majorPurchase', lumpSumAmount: 50_000 };
    const impact = calculateWhatIfImpact(baseline, scenario);

    const summary = summarizeWhatIf(impact, baseline, 2026);

    expect(summary.netWorth).toEqual({ before: 200_000, after: 150_000, delta: -50_000 });
    expect(summary.fireNumber.before).toBeCloseTo(600_000, 5);
    expect(summary.fireNumber.delta).toBe(0);
    expect(summary.progressPct.before).toBeCloseTo(33.3333, 3);
    expect(summary.progressPct.after).toBeCloseTo(25, 3);
    // 200000 × 4% / 12 and 150000 × 4% / 12.
    expect(summary.monthlyIncome.before).toBeCloseTo(666.67, 1);
    expect(summary.monthlyIncome.after).toBeCloseTo(500, 1);
    expect(summary.monthlyIncome.delta).toBeCloseTo(-166.67, 1);

    const { timeline } = summary;
    expect(timeline.yearsBefore).toBe(impact.fire.yearsToFIRE.before);
    expect(timeline.yearsAfter).toBe(impact.fire.yearsToFIRE.after);
    expect(timeline.calendarBefore).toBe(2026 + (impact.fire.yearsToFIRE.before as number));
    expect(timeline.calendarAfter).toBe(2026 + (impact.fire.yearsToFIRE.after as number));
    expect(timeline.deltaYears).toBe(impact.fire.yearsToFIRE.delta);
    expect(timeline.deltaYears).toBeGreaterThan(0);
    expect(timeline.reachedBefore).toBe(false);
    expect(timeline.reachedAfter).toBe(false);
    expect(timeline.horizonYears).toBe(50);
    expect(timeline.horizonCalendarYear).toBe(2076);
    expect(summary.isBridge).toBe(false);
  });

  it('should read the Coast pairs and the reached flags when Coast is configured', () => {
    // 100000 is short of the Coast number of today (~200000 at 4.5% real over 25 years).
    const baseline = makeBaseline({ netWorth: 100_000 });
    const scenario: WhatIfScenario = { eventType: 'windfall', lumpSumAmount: 100_000 };
    const impact = calculateWhatIfImpact(baseline, scenario);

    const summary = summarizeWhatIf(impact, baseline, 2026);

    expect(summary.coast).not.toBeNull();
    expect(summary.coast!.retirementAge).toBe(60);
    expect(summary.coast!.numberToday.delta).toBe(0);
    expect(summary.coast!.gap.before).toBeGreaterThan(summary.coast!.gap.after);
    expect(summary.coast!.reachedBefore).toBe(impact.coast!.isCoastReachedBefore);
    expect(summary.coast!.reachedAfter).toBe(impact.coast!.isCoastReachedAfter);
  });

  it('should leave Coast null when the baseline has no Coast configuration', () => {
    const baseline = makeBaseline({ coast: null });
    const impact = calculateWhatIfImpact(baseline, { eventType: 'windfall', lumpSumAmount: 100_000 });

    expect(summarizeWhatIf(impact, baseline, 2026).coast).toBeNull();
  });

  it('should mark a target reached today as reached, with the current year as its calendar', () => {
    const baseline = makeBaseline({ netWorth: 700_000 });
    const impact = calculateWhatIfImpact(baseline, { eventType: 'windfall', lumpSumAmount: 10_000 });

    const { timeline } = summarizeWhatIf(impact, baseline, 2026);

    expect(timeline.reachedBefore).toBe(true);
    expect(timeline.reachedAfter).toBe(true);
    expect(timeline.yearsBefore).toBe(0);
    expect(timeline.calendarBefore).toBe(2026);
    expect(timeline.deltaYears).toBe(0);
  });

  it('should flag the bridge and read the bridge FIRE number when the baseline carries a locked fund', () => {
    const baseline = makeBaseline({ pensionBridge: { valueToday: 40_000, yearsToUnlock: 10 } });
    const impact = calculateWhatIfImpact(baseline, { eventType: 'windfall', lumpSumAmount: 10_000 });

    const summary = summarizeWhatIf(impact, baseline, 2026);

    expect(summary.isBridge).toBe(true);
    // The bridge number is below the standard 600000: the fund tops up the requirement at the unlock.
    expect(summary.fireNumber.before).toBeLessThan(600_000);
    expect(summary.fireNumber.before).toBe(impact.fire.fireNumber.before);
  });
});

describe('buildWhatIfComparisonSeries', () => {
  it('should merge the two base-scenario walks by calendar year with their targets', () => {
    const baseline = makeBaseline();
    const impact = calculateWhatIfImpact(baseline, { eventType: 'majorPurchase', lumpSumAmount: 50_000 });

    const series = buildWhatIfComparisonSeries(impact.projections.before, impact.projections.after);

    expect(series.length).toBeGreaterThan(0);
    const first = series[0];
    expect(first.calendarYear).toBe(impact.projections.before!.yearlyData[0].calendarYear);
    expect(first.before).toBe(impact.projections.before!.yearlyData[0].baseNetWorth);
    expect(first.after).toBe(impact.projections.after!.yearlyData[0].baseNetWorth);
    expect(first.targetBefore).toBe(impact.projections.before!.yearlyData[0].baseFireNumber);
    expect(first.targetAfter).toBe(impact.projections.after!.yearlyData[0].baseFireNumber);
    // Years are unique and ascending.
    const years = series.map((point) => point.calendarYear);
    expect([...new Set(years)]).toHaveLength(years.length);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });

  it('should leave a side null for the years only the other walk covers', () => {
    const baseline = makeBaseline();
    // A big purchase lengthens the after walk: the before walk stops earlier.
    const impact = calculateWhatIfImpact(baseline, { eventType: 'majorPurchase', lumpSumAmount: 150_000 });

    const series = buildWhatIfComparisonSeries(impact.projections.before, impact.projections.after);
    const beforeLength = impact.projections.before!.yearlyData.length;
    const afterLength = impact.projections.after!.yearlyData.length;

    expect(series).toHaveLength(Math.max(beforeLength, afterLength));
    if (afterLength > beforeLength) {
      const tail = series[series.length - 1];
      expect(tail.before).toBeNull();
      expect(tail.targetBefore).toBeNull();
      expect(tail.after).not.toBeNull();
    }
  });

  it('should return an empty series without projections', () => {
    expect(buildWhatIfComparisonSeries(null, null)).toEqual([]);
  });
});

describe('summarizeDivergence', () => {
  it('should read both capitals at the FIRE year of the plan of today', () => {
    const baseline = makeBaseline();
    const impact = calculateWhatIfImpact(baseline, { eventType: 'majorPurchase', lumpSumAmount: 50_000 });
    const summary = summarizeWhatIf(impact, baseline, 2026);
    const series = buildWhatIfComparisonSeries(impact.projections.before, impact.projections.after);

    const divergence = summarizeDivergence(series, summary.timeline);

    expect(divergence).not.toBeNull();
    expect(divergence!.calendarYear).toBe(summary.timeline.calendarBefore);
    const point = series.find((p) => p.calendarYear === summary.timeline.calendarBefore)!;
    expect(divergence!.before).toBe(point.before);
    expect(divergence!.after).toBe(point.after);
    expect(divergence!.gapThen).toBe(point.after! - point.before!);
    // The hit compounds: the gap at the FIRE year is larger than the 50000 lost today.
    expect(divergence!.gapThen).toBeLessThan(-50_000);
  });

  it('should fall back to the FIRE year after the event when the plan of today never gets there', () => {
    const series = [
      { calendarYear: 2027, before: 100, after: 200, targetBefore: 500, targetAfter: 500 },
      { calendarYear: 2028, before: 110, after: 600, targetBefore: 510, targetAfter: 510 },
    ];
    const timeline = {
      yearsBefore: null,
      yearsAfter: 2,
      calendarBefore: null,
      calendarAfter: 2028,
      deltaYears: null,
      reachedBefore: false,
      reachedAfter: false,
      horizonYears: 50,
      horizonCalendarYear: 2076,
    };

    expect(summarizeDivergence(series, timeline)).toEqual({ calendarYear: 2028, before: 110, after: 600, gapThen: 490 });
  });

  it('should be null when neither walk reaches FIRE or the target is already reached', () => {
    const series = [{ calendarYear: 2027, before: 100, after: 200, targetBefore: 500, targetAfter: 500 }];
    const base = { horizonYears: 50, horizonCalendarYear: 2076, reachedBefore: false, reachedAfter: false };

    expect(summarizeDivergence(series, { ...base, yearsBefore: null, yearsAfter: null, calendarBefore: null, calendarAfter: null, deltaYears: null })).toBeNull();
    expect(
      summarizeDivergence(series, { ...base, yearsBefore: 0, yearsAfter: 0, calendarBefore: 2026, calendarAfter: 2026, deltaYears: 0, reachedBefore: true, reachedAfter: true }),
    ).toBeNull();
  });
});

describe('summarizeSensitivity', () => {
  it('should read the baseline cell, the 10%-less-spending cell and the next savings column', () => {
    const matrix = calculateFIRESensitivityMatrix(200_000, 24_000, 12_000, 4, getDefaultScenarios());

    const reading = summarizeSensitivity(matrix);

    expect(reading.baselineExpenses).toBe(24_000);
    expect(reading.baselineSavings).toBe(12_000);
    expect(reading.baselineYears).toBe(matrix.baselineYearsToFIRE);
    expect(reading.lessSpending).toEqual({ annualExpenses: 24_000 * 0.9, years: matrix.rows[1].cells[1].yearsToFIRE });
    expect(reading.moreSaving).toEqual({ annualSavings: 15_000, label: '+25%', years: matrix.rows[2].cells[2].yearsToFIRE });
    expect(reading.lessSpending!.years!).toBeLessThanOrEqual(reading.baselineYears!);
  });

  it('should name the first positive savings column when the household saves nothing', () => {
    const matrix = calculateFIRESensitivityMatrix(200_000, 24_000, 0, 4, getDefaultScenarios());

    const reading = summarizeSensitivity(matrix);

    expect(reading.baselineSavings).toBe(0);
    expect(reading.moreSaving).toEqual({ annualSavings: 5_000, label: '€5k', years: matrix.rows[2].cells[1].yearsToFIRE });
  });
});
