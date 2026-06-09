import type {
  FIREProjectionScenarios,
  CoastFirePensionInput,
  CoastFireTaxBracket,
} from '@/types/assets';

/**
 * What If Analysis — life-event scenarios applied to the user's FIRE plan.
 *
 * Design: each v1 event is applied "from now" (year 0) and reduces to a perturbation of
 * three baseline inputs — net worth, annual savings, annual expenses. The impact is then
 * computed by re-running the existing deterministic FIRE/Coast functions on the adjusted
 * inputs and diffing against the baseline, so no new projection math is introduced. This
 * is the same pattern the FIRE sensitivity matrix already uses.
 *
 * Future timing of events ("in N years") is intentionally out of scope for v1; it would
 * require timed cash events inside calculateFIREProjection.
 */

export type WhatIfEventType = 'jobLoss' | 'majorPurchase' | 'cashflowChange' | 'windfall';

/**
 * A single What If scenario. Fields are interpreted per `eventType`; fields not relevant to
 * the active event are ignored. Kept as a flat optional shape (rather than a strict
 * discriminated union) so the UI can preserve per-event input state across event switches
 * without remounting.
 */
export interface WhatIfScenario {
  eventType: WhatIfEventType;

  // jobLoss
  monthsWithoutIncome?: number;
  // Annual income (EUR) that disappears during the job-loss window — the sum of the income
  // sources the user selected. When absent, the whole household income is assumed lost
  // (annualExpenses + annualSavings), which preserves the original behaviour.
  lostAnnualIncome?: number;

  // majorPurchase / windfall — positive magnitude of the one-off cash movement
  lumpSumAmount?: number;
  isPrimaryResidence?: boolean; // majorPurchase only; informational in v1

  // cashflowChange — ongoing deltas applied from now onward (negative = reduction)
  annualSavingsDelta?: number;
  annualExpensesDelta?: number;
}

/** Coast-specific baseline; null when the user has not configured Coast FIRE (no age set). */
export interface WhatIfCoastBaseline {
  currentAge: number;
  retirementAge: number;
  annualExpenses: number; // Coast retirement expenses (custom override or actual)
  realReturnRate: number; // base scenario: growthRate − inflationRate
  inflationRate: number; // base scenario inflation
  pensions: CoastFirePensionInput[];
  taxBrackets: CoastFireTaxBracket[];
}

/** The baseline financial picture that scenarios perturb. Sourced from settings + assets + cashflow. */
export interface WhatIfBaseline {
  netWorth: number; // FIRE net worth (respects includePrimaryResidenceInFIRE)
  liquidNetWorth: number;
  illiquidNetWorth: number;
  annualExpenses: number; // from cashflow (last completed year)
  annualSavings: number;
  withdrawalRate: number;
  scenarios: FIREProjectionScenarios;
  coast: WhatIfCoastBaseline | null;
}

/** Inputs after applying a scenario. Only the values the impact metrics depend on are tracked. */
export interface WhatIfAdjustedInputs {
  netWorth: number;
  annualSavings: number;
  annualExpenses: number; // drives the FIRE impact
  coastAnnualExpenses: number; // drives the Coast impact
}

/** Before/after pair for a single metric. `delta = after − before` (null when either side is null). */
export interface WhatIfMetricImpact {
  before: number | null;
  after: number | null;
  delta: number | null;
}

export interface WhatIfFireImpact {
  fireNumber: WhatIfMetricImpact;
  progressToFI: WhatIfMetricImpact;
  yearsToFIRE: WhatIfMetricImpact; // base scenario; null = not reached within the projection horizon
  annualAllowance: WhatIfMetricImpact; // sustainable passive income
}

export interface WhatIfCoastImpact {
  coastFireNumberToday: WhatIfMetricImpact;
  progressToCoastFI: WhatIfMetricImpact;
  gapToCoastFI: WhatIfMetricImpact;
  isCoastReachedBefore: boolean;
  isCoastReachedAfter: boolean;
}

export interface WhatIfImpact {
  adjusted: WhatIfAdjustedInputs;
  fire: WhatIfFireImpact;
  coast: WhatIfCoastImpact | null; // null when the baseline has no Coast configuration
}
