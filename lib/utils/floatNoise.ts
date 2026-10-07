/**
 * Strip the binary noise a float computation leaves in a value meant to be decimal.
 *
 * A coupon per unit is `(rate / 100 / periods) × nominal`: 1,3% semiannual on a 1.000 € lot is
 * 6,5 €, but the binary arithmetic gives 6.500000000000001, which was stored as such and surfaced
 * raw in the dividend form's «Importo lordo per unità» (owner, 2026-10-07). It cannot be rounded to
 * cents: a BTP€i per 1 € of nominal pays 0,0065 × a coefficient like 1,12345 — five or six
 * meaningful decimals. Twelve significant digits keep every digit a rate, a nominal and a
 * coefficient can mean, and drop the 16th-digit residue of the binary representation.
 *
 * SDK-free.
 */

/** Significant digits kept: far beyond any rate × nominal × coefficient, far above the ~1e-16 noise. */
const SIGNIFICANT_DIGITS = 12;

/** `6.500000000000001` → `6.5`; `0.007302425` stays; a non-finite value is returned as is. */
export function stripFloatNoise(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(SIGNIFICANT_DIGITS));
}
