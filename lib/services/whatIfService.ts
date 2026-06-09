/**
 * What If Analysis service.
 *
 * Pure functions that translate a life-event scenario into adjusted FIRE inputs and then
 * compute the before/after impact on both the traditional FIRE plan and the Coast FIRE
 * plan. All heavy lifting is delegated to the existing deterministic functions in
 * fireService — this module only perturbs the baseline and diffs the results, so it stays
 * trivially testable and adds no new projection math.
 *
 * See `types/whatIf.ts` for the modelling rationale (events are applied at year 0).
 */

import {
  calculateFIREMetrics,
  calculateFIREProjection,
  calculateCoastFIREMetrics,
} from './fireService';
import type {
  WhatIfAdjustedInputs,
  WhatIfBaseline,
  WhatIfCoastImpact,
  WhatIfFireImpact,
  WhatIfImpact,
  WhatIfMetricImpact,
  WhatIfScenario,
} from '@/types/whatIf';

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

/**
 * Years until FIRE in the Base scenario for a given input set.
 * Returns 0 when already financially independent, null when not reached within the horizon.
 */
function projectBaseYearsToFIRE(
  baseline: WhatIfBaseline,
  netWorth: number,
  annualExpenses: number,
  annualSavings: number
): number | null {
  if (netWorth <= 0 || annualExpenses <= 0 || baseline.withdrawalRate <= 0) return null;

  const fireNumber = annualExpenses / (baseline.withdrawalRate / 100);
  if (fireNumber > 0 && netWorth >= fireNumber) return 0;

  const projection = calculateFIREProjection(
    netWorth,
    annualExpenses,
    annualSavings,
    baseline.withdrawalRate,
    baseline.scenarios
  );
  return projection.baseYearsToFIRE;
}

/**
 * Compute the before/after impact of a scenario on the traditional FIRE plan and, when
 * Coast FIRE is configured, on the Coast FIRE plan.
 */
export function calculateWhatIfImpact(
  baseline: WhatIfBaseline,
  scenario: WhatIfScenario
): WhatIfImpact {
  const adjusted = applyScenarioToBaseline(baseline, scenario);

  // --- Traditional FIRE ---
  const fireBefore = calculateFIREMetrics(
    baseline.netWorth,
    baseline.annualExpenses,
    baseline.withdrawalRate
  );
  const fireAfter = calculateFIREMetrics(
    adjusted.netWorth,
    adjusted.annualExpenses,
    baseline.withdrawalRate
  );

  const yearsBefore = projectBaseYearsToFIRE(
    baseline,
    baseline.netWorth,
    baseline.annualExpenses,
    baseline.annualSavings
  );
  const yearsAfter = projectBaseYearsToFIRE(
    baseline,
    adjusted.netWorth,
    adjusted.annualExpenses,
    adjusted.annualSavings
  );

  const fire: WhatIfFireImpact = {
    fireNumber: buildMetricImpact(fireBefore.fireNumber, fireAfter.fireNumber),
    progressToFI: buildMetricImpact(fireBefore.progressToFI, fireAfter.progressToFI),
    yearsToFIRE: buildMetricImpact(yearsBefore, yearsAfter),
    annualAllowance: buildMetricImpact(fireBefore.annualAllowance, fireAfter.annualAllowance),
  };

  // --- Coast FIRE (only when configured) ---
  let coast: WhatIfCoastImpact | null = null;
  if (baseline.coast) {
    const c = baseline.coast;
    const coastBefore = calculateCoastFIREMetrics(
      baseline.netWorth,
      c.annualExpenses,
      baseline.withdrawalRate,
      c.currentAge,
      c.retirementAge,
      c.realReturnRate,
      c.inflationRate,
      c.pensions,
      c.taxBrackets
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
      c.taxBrackets
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

  return { adjusted, fire, coast };
}
