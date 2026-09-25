/**
 * Money that reaches an account is money a bank moved, and a bank moves cents.
 *
 * The records keep their exact values — a dividend's net is `perShare × quantity × (1 − tax)`, a
 * trade's countervalue `quantity × priceEur` — but the screen prints them at two decimals, so an
 * account credited with the raw float drifts from the statement by fractions nobody can see
 * (owner, 2026-09-20). `roundToCents` is the ONE rounding applied where an amount becomes a
 * balance movement or a cashflow row: the trade settlement (`computeCashDelta`) and the income row
 * of a dividend (`dividendIncomeService`).
 *
 * SDK-free.
 */

/** Binary noise below this is not a half cent: 1.005 × 100 is 100.49999999999999. */
const HALF_CENT_TOLERANCE = 1e-9;

/** Round half away from zero to two decimals, symmetric in sign so a reversal cancels its application. */
export function roundToCents(amount: number): number {
  if (!Number.isFinite(amount)) return amount;
  const cents = Math.round(Math.abs(amount) * 100 + HALF_CENT_TOLERANCE);
  // `|| 0` keeps −0 out of a balance.
  return (Math.sign(amount) * cents) / 100 || 0;
}
