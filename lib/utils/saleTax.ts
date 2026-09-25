/**
 * The capital-gains tax of a sale: the ONE estimate, and what the sale form does with the field
 * that lets the owner replace it with the figure on the broker's statement.
 *
 * In regime amministrato the broker withholds the tax from the proceeds the day of the sale, so
 * the settlement account receives the NET (`computeCashDelta`). The app can only estimate it —
 * taxable gain × the instrument's `taxRate`, with no loss compensation (minusvalenze pregresse) —
 * good enough to prefill a field, not to be the amount that moves an account. So the sale form
 * prefills «Tasse trattenute» with the estimate and stores what the owner leaves or types
 * (`AssetTransaction.withheldTaxEur`).
 *
 * SDK-free (periodSales, read by the email Lambda, imports the estimate).
 */

import { roundToCents } from '@/lib/utils/cents';

/**
 * Loss → no tax; missing rate → unknown (`null`), never zero. Unrounded.
 *
 * Takes the TAXABLE gain — the replay's `LedgerTransactionEffect.taxableGainEur`, the pure price
 * difference with no commission on either side — never the realized P&L, which is net of the
 * sale's fees over a cost basis that includes the purchase fees. On the owner's statement the four
 * sells of settembre 2026 were taxed on 15.740,38 € (the net 15.726,38 € plus their 14 € of fees):
 * 4.092,50 € to the cent, where the net gain gave 4.088,86 €.
 */
export function estimateSaleTax(taxableGain: number, taxRate: number | undefined | null): number | null {
  if (taxRate === undefined || taxRate === null) return null;
  return taxableGain > 0 ? (taxableGain * taxRate) / 100 : 0;
}

/**
 * What a NEW sale's «Tasse trattenute» field shows until the owner types in it: the estimate, to
 * the cent. `undefined` (an empty field) when the gain is not computable yet or the instrument
 * has no `taxRate` — an unknown is never prefilled as 0.
 */
export function prefillWithheldTax(taxableGain: number | null, taxRate: number | undefined | null): number | undefined {
  if (taxableGain === null) return undefined;
  const estimate = estimateSaleTax(taxableGain, taxRate);
  return estimate === null ? undefined : roundToCents(estimate);
}

/**
 * The `withheldTaxEur` a sale form sends, from what its field holds at submit.
 *
 *   - a number ≥ 0 is sent as typed, to the cent (0 is a value: a gain offset by past losses);
 *   - an EMPTY field on a new sale sends nothing: the trade carries no tax, the account receives
 *     the proceeds net of fees only and the readings keep estimating, as before the field existed;
 *   - an empty field on an edit sends nothing either when the stored trade had none (an old sale
 *     is never given a tax — and its account moved — by merely being re-saved), and 0 when it had
 *     one, because an absent key means «keep the old value» to the API.
 */
export function resolveWithheldTaxToSend(input: {
  fieldValue: number | undefined;
  storedTax: number | undefined;
}): number | undefined {
  const { fieldValue, storedTax } = input;
  if (fieldValue !== undefined && !Number.isNaN(fieldValue) && fieldValue >= 0) return roundToCents(fieldValue);
  return storedTax !== undefined ? 0 : undefined;
}
