/**
 * Fondo pensione — pure roll-ups over the recorded `PensionContribution` facts.
 *
 * Contributions live in their own Firestore collection (spec 01 §3), one document per dated event.
 * This module is the bridge between those stored facts and the two consumers that need them
 * aggregated per year:
 *   - `derivePensionDeductibleByYear` feeds `PensionDeductionInput.deductibleContribByYear`, i.e. the
 *     multi-year fold in `lib/utils/pensionDeduction.ts`.
 *   - `derivePensionContributionsByYearAndNature` powers the "versato per natura" recap card
 *     (spec 04), which must show TFR too even though it is not deductible.
 *
 * Both group by `taxYear` (the year of competence for the deduction), NOT by the calendar year of
 * `date`: a contribution paid in January can legitimately be attributed to the previous tax year, and
 * the deduction ceiling is consumed in the year of competence.
 *
 * Zero Firebase imports — this file is a pure function of its input array (invariant #4).
 */

import {
  DEDUCTIBLE_PENSION_NATURES,
  type PensionContribution,
  type PensionContributionNature,
} from '@/types/pension';

/**
 * Sum the DEDUCTIBLE contributions (voluntary + employer; TFR is excluded by law) per tax year.
 *
 * Returns a `taxYear -> EUR` map, ready to be passed straight to `computePensionDeductionState`.
 * Years with no deductible contribution are simply absent — the fold treats a missing year as 0.
 *
 * Amounts are stored as positive magnitudes; `Math.abs` is a defensive normalisation for records
 * written by hand or by a future import path.
 */
export function derivePensionDeductibleByYear(
  contributions: PensionContribution[]
): Record<number, number> {
  const byYear: Record<number, number> = {};

  for (const contribution of contributions) {
    if (!DEDUCTIBLE_PENSION_NATURES.includes(contribution.source)) continue;
    byYear[contribution.taxYear] =
      (byYear[contribution.taxYear] ?? 0) + Math.abs(contribution.amount);
  }

  return byYear;
}

/**
 * Break contributions down per tax year AND per nature — all three natures, TFR included.
 *
 * Returns `taxYear -> { tfr, voluntary, employer }` with every nature present (0 when nothing was
 * paid), so the recap can render a stable three-row breakdown without null checks. A year appears in
 * the map only if it has at least one contribution.
 */
export function derivePensionContributionsByYearAndNature(
  contributions: PensionContribution[]
): Record<number, Record<PensionContributionNature, number>> {
  const byYear: Record<number, Record<PensionContributionNature, number>> = {};

  for (const contribution of contributions) {
    const year = contribution.taxYear;
    if (!byYear[year]) {
      byYear[year] = { tfr: 0, voluntary: 0, employer: 0 };
    }
    byYear[year][contribution.source] += Math.abs(contribution.amount);
  }

  return byYear;
}
