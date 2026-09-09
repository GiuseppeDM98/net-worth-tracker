/**
 * Automatic Azioni/Obbligazioni target split (Impostazioni → Allocazione).
 *
 * The Bull's rule of thumb answers ONE question — how much equity should a portfolio hold at
 * this age and this risk-free rate — and says nothing about the classes that live outside the
 * classic two-sleeve model (materie prime, crypto, immobili, trend following, carry). Somebody
 * still has to fund them, and which sleeve pays is a portfolio decision, not a formula one:
 *
 *   - Funding them out of BONDS (the original behaviour) keeps the equity share at the
 *     formula's value, but the defensive sleeve absorbs every satellite position and collapses
 *     — on a portfolio with 22,5% between commodity, crypto and real estate the bonds fell to
 *     0,48%, which is not a bond allocation, it is a rounding error.
 *   - Funding them out of EQUITY (what this module implements) keeps the defensive sleeve at
 *     the size the formula prescribes and treats the satellites for what they are: risk assets,
 *     paid for with the risk budget.
 *
 * Hence the split below:
 *
 *   bonds  = 100 − formulaEquityPercentage        (the formula's own residual, untouched)
 *   equity = formulaEquityPercentage − otherClassesTotal
 *
 * Kept pure and outside `settings/page.tsx` because two effects there compute it (one keyed on
 * age/rate, one on the other classes' percentages) and a duplicated formula is a formula that
 * drifts.
 */

/** Rounded to the two decimals the settings page persists. */
export interface AutoEquityBondsSplit {
  equityPercentage: number;
  bondsPercentage: number;
}

const roundToTwoDecimals = (value: number): number => Math.round(value * 100) / 100;

/**
 * Resolve the equity and bonds targets for the auto-calculated split.
 *
 * @param formulaEquityPercentage - The Bull's output (`calculateEquityPercentage`), 0-100.
 * @param otherClassesTotal - Sum of every OTHER asset class target, in percentage points. Cash
 *   must be excluded by the caller when it is configured as a fixed euro amount, since it then
 *   sits outside the percentage budget entirely.
 * @returns Both targets, each clamped to [0, 100] and rounded to two decimals. Their sum plus
 *   `otherClassesTotal` is 100 whenever `otherClassesTotal` is itself within [0, 100].
 *
 * Bonds are derived from the ALREADY ROUNDED equity target, not from the raw formula: rounding
 * both independently can leave the page's total at 100,01% (77,015 splits into 54,52 + 22,99),
 * and that total is exactly what the single Save button validates.
 *
 * Edge case worth stating: when the other classes alone exceed the formula's equity share there
 * is no risk budget left to take from, so equity floors at 0 and the overflow falls back on the
 * bond sleeve — the only remaining source. Preserving the 100% total wins over preserving the
 * bond share, for the same reason.
 */
export function resolveAutoEquityBondsSplit(
  formulaEquityPercentage: number,
  otherClassesTotal: number
): AutoEquityBondsSplit {
  const equityPercentage = roundToTwoDecimals(
    Math.max(0, formulaEquityPercentage - otherClassesTotal)
  );
  const bondsPercentage = roundToTwoDecimals(
    Math.max(0, 100 - equityPercentage - otherClassesTotal)
  );

  return { equityPercentage, bondsPercentage };
}
