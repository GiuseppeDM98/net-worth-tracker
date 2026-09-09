/**
 * What If Analysis service.
 *
 * Pure functions that translate a life-event scenario into adjusted FIRE inputs and then
 * compute the before/after impact on both the traditional FIRE plan and the Coast FIRE
 * plan. All heavy lifting is delegated to the existing deterministic functions in
 * fireService — this module only perturbs the baseline and diffs the results, so it stays
 * trivially testable and adds no new projection math.
 *
 * The pension bridge (the Calcolatore's model) rides along on the baseline: when the FIRE
 * lock-in toggle is on, the locked fund is a compartment that re-enters the walk at its unlock
 * year and the FIRE number is the bridge number — the same functions the Calcolatore calls, so
 * the «prima» side of this tab agrees with that tab's year. Without a bridge the walk and the
 * metrics are byte-identical to the plain model.
 *
 * See `types/whatIf.ts` for the modelling rationale (events are applied at year 0).
 */

import {
  calculateFIREMetrics,
  calculateFIREProjection,
  calculateCoastFIREMetrics,
  calculateFireBridgeNumber,
  type FIREMetrics,
} from './fireService';
import type { FIREProjectionResult } from '@/types/assets';
import type {
  WhatIfAdjustedInputs,
  WhatIfBaseline,
  WhatIfCoastImpact,
  WhatIfFireImpact,
  WhatIfImpact,
  WhatIfMetricImpact,
  WhatIfScenario,
} from '@/types/whatIf';

/** The deterministic walk's horizon — the Calcolatore's, so the two tabs agree on «oltre N anni». */
export const WHAT_IF_HORIZON_YEARS = 50;

/** Money and counts can never go below zero after a perturbation. */
function clampNonNegative(value: number): number {
  return value > 0 ? value : 0;
}

function buildMetricImpact(before: number | null, after: number | null): WhatIfMetricImpact {
  const delta = before !== null && after !== null ? after - before : null;
  return { before, after, delta };
}

/**
 * Apply a What If scenario to the baseline, producing the adjusted inputs.
 *
 * Modelling (all immediate / year 0):
 * - jobLoss: net worth drops by the lost income over the window, (lostAnnualIncome × months/12).
 *   This is exact even when only part of the household income stops: the retained income still
 *   covers part of the expenses, so the gap versus the baseline trajectory is exactly the lost
 *   income. When no specific sources are selected, the whole income (expenses + savings) is lost,
 *   which reproduces the original "all income stops" behaviour.
 * - majorPurchase / windfall: a one-off cash movement out of / into net worth.
 * - cashflowChange: ongoing changes to annual savings and expenses from now onward; the
 *   expense delta also flows into Coast retirement expenses.
 */
export function applyScenarioToBaseline(
  baseline: WhatIfBaseline,
  scenario: WhatIfScenario
): WhatIfAdjustedInputs {
  let netWorthDelta = 0;
  let savingsDelta = 0;
  let expensesDelta = 0;

  switch (scenario.eventType) {
    case 'jobLoss': {
      const months = clampNonNegative(scenario.monthsWithoutIncome ?? 0);
      // Default to the whole household income when no specific sources are selected.
      const lostAnnualIncome = clampNonNegative(
        scenario.lostAnnualIncome ?? baseline.annualExpenses + baseline.annualSavings
      );
      netWorthDelta = -(lostAnnualIncome * months) / 12;
      break;
    }
    case 'majorPurchase': {
      netWorthDelta = -clampNonNegative(scenario.lumpSumAmount ?? 0);
      break;
    }
    case 'windfall': {
      netWorthDelta = clampNonNegative(scenario.lumpSumAmount ?? 0);
      break;
    }
    case 'cashflowChange': {
      savingsDelta = scenario.annualSavingsDelta ?? 0;
      expensesDelta = scenario.annualExpensesDelta ?? 0;
      break;
    }
  }

  const coastBaselineExpenses = baseline.coast?.annualExpenses ?? baseline.annualExpenses;

  return {
    netWorth: clampNonNegative(baseline.netWorth + netWorthDelta),
    annualSavings: clampNonNegative(baseline.annualSavings + savingsDelta),
    annualExpenses: clampNonNegative(baseline.annualExpenses + expensesDelta),
    coastAnnualExpenses: clampNonNegative(coastBaselineExpenses + expensesDelta),
  };
}

/** The bridge as the walk accepts it: undefined unless something is locked for some years. */
function resolveBridge(baseline: WhatIfBaseline) {
  const bridge = baseline.pensionBridge;
  if (!bridge || bridge.valueToday <= 0 || bridge.yearsToUnlock <= 0) return undefined;
  return bridge;
}

/**
 * The FIRE metrics for one input set — with the bridge override when the baseline carries a
 * locked fund: free assets must cover the spending bridge until the unlock, then the fund tops
 * up the standard requirement (the Calcolatore's `displayedFireMetrics`, same functions).
 */
function resolveFireMetrics(baseline: WhatIfBaseline, netWorth: number, annualExpenses: number): FIREMetrics {
  const metrics = calculateFIREMetrics(netWorth, annualExpenses, baseline.withdrawalRate);
  const bridge = resolveBridge(baseline);
  if (!bridge || annualExpenses <= 0) return metrics;

  const realReturn = baseline.scenarios.base.growthRate - baseline.scenarios.base.inflationRate;
  const { bridgeFireNumber } = calculateFireBridgeNumber({
    annualExpenses,
    withdrawalRate: baseline.withdrawalRate,
    realReturn,
    yearsToUnlock: bridge.yearsToUnlock,
    pensionValueToday: bridge.valueToday,
    pensionGrowthRate: realReturn,
  });
  return {
    ...metrics,
    fireNumber: bridgeFireNumber,
    progressToFI: bridgeFireNumber > 0 ? (netWorth / bridgeFireNumber) * 100 : 0,
  };
}

/**
 * The base-scenario walk for one input set, or null when it cannot run (no expenses, no
 * withdrawal rate). A net worth of zero still walks: the savings alone may reach the target.
 */
function runBaseProjection(
  baseline: WhatIfBaseline,
  netWorth: number,
  annualExpenses: number,
  annualSavings: number
): FIREProjectionResult | null {
  if (netWorth < 0 || annualExpenses <= 0 || baseline.withdrawalRate <= 0) return null;
  return calculateFIREProjection(
    netWorth,
    annualExpenses,
    annualSavings,
    baseline.withdrawalRate,
    baseline.scenarios,
    WHAT_IF_HORIZON_YEARS,
    resolveBridge(baseline)
  );
}

/**
 * Years until FIRE in the base scenario: 0 when already financially independent today (on the
 * bridge number when the bridge is on), null when the walk cannot run or never gets there.
 */
function resolveYearsToFIRE(metrics: FIREMetrics, projection: FIREProjectionResult | null): number | null {
  if (!projection) return null;
  if (metrics.fireNumber > 0 && metrics.currentNetWorth >= metrics.fireNumber) return 0;
  return projection.baseYearsToFIRE;
}

/**
 * Compute the before/after impact of a scenario on the traditional FIRE plan and, when
 * Coast FIRE is configured, on the Coast FIRE plan. The two walks it runs are returned as
 * `projections`, so the chart draws the same series the years were read from.
 */
export function calculateWhatIfImpact(
  baseline: WhatIfBaseline,
  scenario: WhatIfScenario
): WhatIfImpact {
  const adjusted = applyScenarioToBaseline(baseline, scenario);

  // --- Traditional FIRE ---
  const fireBefore = resolveFireMetrics(baseline, baseline.netWorth, baseline.annualExpenses);
  const fireAfter = resolveFireMetrics(baseline, adjusted.netWorth, adjusted.annualExpenses);

  const projectionBefore = runBaseProjection(baseline, baseline.netWorth, baseline.annualExpenses, baseline.annualSavings);
  const projectionAfter = runBaseProjection(baseline, adjusted.netWorth, adjusted.annualExpenses, adjusted.annualSavings);

  const fire: WhatIfFireImpact = {
    fireNumber: buildMetricImpact(fireBefore.fireNumber, fireAfter.fireNumber),
    progressToFI: buildMetricImpact(fireBefore.progressToFI, fireAfter.progressToFI),
    yearsToFIRE: buildMetricImpact(resolveYearsToFIRE(fireBefore, projectionBefore), resolveYearsToFIRE(fireAfter, projectionAfter)),
    annualAllowance: buildMetricImpact(fireBefore.annualAllowance, fireAfter.annualAllowance),
  };

  // --- Coast FIRE (only when configured) ---
  let coast: WhatIfCoastImpact | null = null;
  if (baseline.coast) {
    const c = baseline.coast;
    // `undefined` currentDate keeps the function's own default; the inflows ride along
    // unchanged on both sides — a life event perturbs free capital, not the locked fund.
    const coastBefore = calculateCoastFIREMetrics(
      baseline.netWorth,
      c.annualExpenses,
      baseline.withdrawalRate,
      c.currentAge,
      c.retirementAge,
      c.realReturnRate,
      c.inflationRate,
      c.pensions,
      c.taxBrackets,
      undefined,
      c.capitalInflowsToday
    );
    const coastAfter = calculateCoastFIREMetrics(
      adjusted.netWorth,
      adjusted.coastAnnualExpenses,
      baseline.withdrawalRate,
      c.currentAge,
      c.retirementAge,
      c.realReturnRate,
      c.inflationRate,
      c.pensions,
      c.taxBrackets,
      undefined,
      c.capitalInflowsToday
    );

    coast = {
      coastFireNumberToday: buildMetricImpact(
        coastBefore.coastFireNumberToday,
        coastAfter.coastFireNumberToday
      ),
      progressToCoastFI: buildMetricImpact(
        coastBefore.progressToCoastFI,
        coastAfter.progressToCoastFI
      ),
      gapToCoastFI: buildMetricImpact(coastBefore.gapToCoastFI, coastAfter.gapToCoastFI),
      isCoastReachedBefore: coastBefore.isCoastReached,
      isCoastReachedAfter: coastAfter.isCoastReached,
    };
  }

  return { adjusted, fire, coast, projections: { before: projectionBefore, after: projectionAfter } };
}
