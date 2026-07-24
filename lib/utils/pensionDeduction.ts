/**
 * Pension deduction & extra-deducibilità — pure calculation layer.
 * Spec: docs/specs/2-pension-fund/02-tax-engine.md.
 *
 * Two conceptually different tax mechanisms, both modelled here:
 *
 * 1. ORDINARY deduction (stateless, single-year): voluntary + employer contributions are deductible
 *    from IRPEF taxable income up to an annual ceiling (5.164,57 € through 2025, 5.300 € from 2026).
 *
 * 2. EXTRA-DEDUCIBILITÀ / plafond recovery (stateful, multi-year — art. 8 c.6 D.Lgs. 252/2005):
 *    for workers of FIRST employment after 2007-01-01, any ceiling left UNUSED in the first 5 years
 *    of participation is banked and can raise the ceiling in the following 20 years (participation
 *    years 6..25), capped each year at half the ordinary ceiling (2.650 € from 2026 → max total
 *    deduction 7.950 €/yr). Unused bank expires after the 25th participation year.
 *    Ref: https://www.mefop.it/blog/blog-mefop/deducibilita-extradeducibilita-post-legge-bilancio-2026
 *
 * Because the extra-deducibilità depends on the whole accrual/drawdown history, its core is a FOLD
 * over the years from enrollment to the target year, maintaining a running "bank". The tax benefit in
 * euro is intentionally split into `computePensionTaxBenefit`, which receives the tax function by
 * dependency injection (`taxOf`) so this module stays free of any service/Firestore dependency and
 * fully unit-testable in isolation.
 */

import type { PensionDeductionInput, PensionDeductionState } from '@/types/pension';

/** Ordinary deduction ceiling before the 2026 reform (historical €5.164,57, from 20M old lire). */
export const PENSION_DEDUCTION_CEILING_LEGACY = 5164.57;
/** Ordinary deduction ceiling from the Legge di Bilancio 2026 (effective retroactively 2026-01-01). */
export const PENSION_DEDUCTION_CEILING_2026 = 5300;

/** Length of the plafond-accrual window (first N participation years). */
export const PENSION_ACCRUAL_YEARS = 5;
/** Length of the plafond-usage window that follows the accrual window (next N years). */
export const PENSION_USAGE_YEARS = 20;

/**
 * Ordinary annual deduction ceiling in force for a given year.
 *
 * Kept as a threshold function (not a hard-coded literal at call sites) so a future legislative
 * change is a single edit here. Add a new branch when the ceiling changes again.
 */
export function getPensionDeductionCeiling(year: number): number {
  return year >= 2026 ? PENSION_DEDUCTION_CEILING_2026 : PENSION_DEDUCTION_CEILING_LEGACY;
}

/** Annual extra-deducibilità cap = half the ordinary ceiling of that year (2.650 € from 2026). */
export function getPensionExtraDeductionCap(year: number): number {
  return getPensionDeductionCeiling(year) / 2;
}

/**
 * Compute the deduction/plafond state for a single target year, replaying the extra-deducibilità
 * history when the worker is eligible.
 *
 * Preconditions: `deductibleContribByYear` holds ALREADY-DEDUCTIBLE amounts (voluntary + employer;
 * TFR excluded by the caller). Missing years are treated as 0 contributions.
 *
 * Postcondition: `deductedThisYear = min(contributions, ordinaryCeiling + extraAvailableThisYear)`.
 */
export function computePensionDeductionState(input: PensionDeductionInput): PensionDeductionState {
  const { targetYear, enrollmentYear, isFirstJobPost2007, deductibleContribByYear } = input;

  const ordinaryCeiling = getPensionDeductionCeiling(targetYear);
  const contribThisYear = Math.max(0, deductibleContribByYear[targetYear] ?? 0);

  // Base result for the ordinary-only path (ineligible worker, or year outside participation).
  const base: PensionDeductionState = {
    ordinaryCeiling,
    deductibleContributions: contribThisYear,
    plafondCreatedThisYear: 0,
    accruedPlafondResidual: 0,
    extraAvailableThisYear: 0,
    effectiveCeiling: ordinaryCeiling,
    deductedThisYear: Math.min(contribThisYear, ordinaryCeiling),
    isAccrualYear: false,
    isUsageYear: false,
  };

  // Extra-deducibilità applies only to eligible workers and only once participation has begun.
  if (!isFirstJobPost2007 || targetYear < enrollmentYear) {
    return base;
  }

  const accrualStart = enrollmentYear;
  const accrualEnd = enrollmentYear + PENSION_ACCRUAL_YEARS - 1; // inclusive, first 5 years
  const usageStart = accrualEnd + 1;
  const usageEnd = usageStart + PENSION_USAGE_YEARS - 1; // inclusive, 20 years

  const isAccrualYear = targetYear >= accrualStart && targetYear <= accrualEnd;
  const isUsageYear = targetYear >= usageStart && targetYear <= usageEnd;

  // Replay every COMPLETED year before the target year to get the bank entering the target year.
  // Accrual years grow the bank by the unused ceiling; usage years draw it down by the extra used;
  // once the usage window has closed, any residual is lost.
  let bank = 0;
  for (let year = accrualStart; year < targetYear; year++) {
    if (year > usageEnd) {
      bank = 0; // window closed — unused plafond expires
      continue;
    }
    const ceiling = getPensionDeductionCeiling(year);
    const contrib = Math.max(0, deductibleContribByYear[year] ?? 0);

    if (year <= accrualEnd) {
      bank += Math.max(0, ceiling - contrib);
    } else {
      // Usage year: extra actually used = min(bank, annual cap, amount contributed above the ceiling).
      const extraUsed = Math.min(bank, getPensionExtraDeductionCap(year), Math.max(0, contrib - ceiling));
      bank -= extraUsed;
    }
  }

  // Resolve the target year itself against the bank entering it.
  let plafondCreatedThisYear = 0;
  let extraAvailableThisYear = 0;
  let accruedPlafondResidual = bank;

  if (targetYear > usageEnd) {
    // Past the recovery window: nothing left to use, residual is gone.
    accruedPlafondResidual = 0;
  } else if (isAccrualYear) {
    plafondCreatedThisYear = Math.max(0, ordinaryCeiling - contribThisYear);
    accruedPlafondResidual = bank + plafondCreatedThisYear;
  } else if (isUsageYear) {
    extraAvailableThisYear = Math.min(bank, getPensionExtraDeductionCap(targetYear));
    const extraUsed = Math.min(extraAvailableThisYear, Math.max(0, contribThisYear - ordinaryCeiling));
    accruedPlafondResidual = bank - extraUsed;
  }

  const effectiveCeiling = ordinaryCeiling + extraAvailableThisYear;

  return {
    ordinaryCeiling,
    deductibleContributions: contribThisYear,
    plafondCreatedThisYear,
    accruedPlafondResidual,
    extraAvailableThisYear,
    effectiveCeiling,
    deductedThisYear: Math.min(contribThisYear, effectiveCeiling),
    isAccrualYear,
    isUsageYear,
  };
}

/**
 * Tax saving produced by deducting `deductedAmount` from taxable income, as the drop in progressive
 * IRPEF: `tax(RAL) − tax(RAL − deducted)`. Correct even when the deduction straddles two brackets.
 *
 * `taxOf` is injected (dependency inversion) so this stays decoupled from the Coast-FIRE tax engine;
 * callers pass `(income) => calculateProgressiveTax(income, brackets)` with the user's
 * `CoastFireTaxBracket[]`.
 */
export function computePensionTaxBenefit(
  deductedAmount: number,
  annualGrossIncome: number,
  taxOf: (income: number) => number
): number {
  if (deductedAmount <= 0 || annualGrossIncome <= 0) {
    return 0;
  }
  const fullTax = taxOf(annualGrossIncome);
  const reducedTax = taxOf(Math.max(0, annualGrossIncome - deductedAmount));
  return Math.max(0, fullTax - reducedTax);
}

/**
 * Benefit (prestazione) tax rate on the deducted contributions at payout.
 *
 * TEACHER: a fondo pensione's final payout is taxed at a favourable, seniority-decreasing rate,
 * unlike the 26% on ETF capital gains. It starts at 15% and drops 0.30 percentage points for each
 * year of participation beyond the 15th, down to a 9% floor (reached at 35 years). So €1.000 in the
 * fund is worth, net, more than €1.000 in a taxed instrument. Kept configurable (constants below) as
 * the rule can change; ref. art. 11 c.6 D.Lgs. 252/2005.
 */
export const PENSION_BENEFIT_TAX_RATE_MAX = 15;
export const PENSION_BENEFIT_TAX_RATE_MIN = 9;
/** Participation years after which the rate starts decreasing, and the per-year decrement (points). */
export const PENSION_BENEFIT_TAX_DECREASE_AFTER_YEAR = 15;
export const PENSION_BENEFIT_TAX_DECREASE_PER_YEAR = 0.3;

/**
 * The favourable payout tax rate (as a percentage) for a given number of participation years.
 * Clamped to [9, 15]. Non-positive or fractional years below the threshold return the 15% max.
 */
export function deriveBenefitTaxRate(yearsEnrolled: number): number {
  const decreasingYears = Math.max(0, yearsEnrolled - PENSION_BENEFIT_TAX_DECREASE_AFTER_YEAR);
  const rate = PENSION_BENEFIT_TAX_RATE_MAX - decreasingYears * PENSION_BENEFIT_TAX_DECREASE_PER_YEAR;
  return Math.max(PENSION_BENEFIT_TAX_RATE_MIN, Math.min(PENSION_BENEFIT_TAX_RATE_MAX, rate));
}

/** The figures surfaced in the annual "Previdenza" tax recap (spec 04 §4). */
export interface PensionTaxRecap {
  /** Full per-year deduction/plafond state (deducted amount, effective ceiling, plafond, …). */
  state: PensionDeductionState;
  /** Estimated IRPEF saving for the year = tax(RAL) − tax(RAL − deducted). */
  taxSaving: number;
}

/**
 * Convenience wrapper that resolves the yearly deduction state AND the euro tax saving in one call.
 *
 * `taxOf` is injected (e.g. `(income) => calculateProgressiveTax(income, brackets)`) so this stays
 * decoupled from the Coast-FIRE tax engine. `annualGrossIncome` (RAL) at 0 yields a 0 saving but the
 * plafond/deduction state is still computed (it does not depend on income).
 */
export function computePensionTaxRecap(
  input: PensionDeductionInput,
  annualGrossIncome: number,
  taxOf: (income: number) => number
): PensionTaxRecap {
  const state = computePensionDeductionState(input);
  const taxSaving = computePensionTaxBenefit(state.deductedThisYear, annualGrossIncome, taxOf);
  return { state, taxSaving };
}
