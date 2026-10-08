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
 * And the BALANCE a movement lands on (2026-10-07): a movement in cents still leaves binary noise
 * in the sum — 4000.1 + 33.2 is 4033.2999999999997 — which grows a little at every write and
 * surfaced raw in the asset form's «Saldo» («4033,050000000001»). Every writer of a cash account's
 * `quantity` rounds the result too: `lib/server/cashSettlement.ts`, `assetTransactionUseCase.ts`
 * (trade settlement), `assetService.ts` (`updateCashAssetBalance`, `updateCashAssetBalancesAtomic`),
 * `dividendIncomeService.ts` (credit, difference, give-back). A balance saved noisy before that day
 * is cleaned by its next movement.
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
