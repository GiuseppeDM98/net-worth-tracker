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
import type { AllocatableHolding } from '@/lib/utils/allocationUtils';

/**
 * Loss → no tax; missing rate → unknown (`null`), never zero. Unrounded.
 *
 * Takes the TAXABLE gain — the replay's `taxableGainEur`: the sale's gross minus its fee minus the
 * fiscal cost of the units sold (purchase fees included, owner, 2026-11-12) — never the realized
 * P&L, which is fee-free. It sits below what a broker that ignores commissions withholds by
 * fees × rate; the typed figure wins.
 */
export function estimateSaleTax(taxableGain: number, taxRate: number | undefined | null): number | null {
  if (taxRate === undefined || taxRate === null) return null;
  return taxableGain > 0 ? (taxableGain * taxRate) / 100 : 0;
}

/** What one euro sold of a holding costs in tax today. */
export type SaleTaxPerEuro =
  | { kind: 'exempt' }
  | { kind: 'taxed'; perEuro: number }
  | { kind: 'unknown'; reason: 'cost-basis' | 'rate' };

/**
 * The rule of every PROPOSED sale's estimate (`estimatePlanSaleTax`, the targeted optimizer), on
 * `estimateSaleTax`: not taxable → exempt; no EUR basis or no rate → unknown, never zero; the gain
 * fraction floored at zero — a loss pays nothing and offsets nothing; no sale fee (a proposed sale
 * has none yet).
 */
export function saleTaxPerEuro(holding: AllocatableHolding): SaleTaxPerEuro {
  if (!holding.taxableOnSale || holding.value <= 0) return { kind: 'exempt' };
  if (holding.costBasisEur === undefined) return { kind: 'unknown', reason: 'cost-basis' };
  if (holding.taxRate === undefined) return { kind: 'unknown', reason: 'rate' };
  const gainFraction = Math.max(0, (holding.value - holding.costBasisEur) / holding.value);
  return { kind: 'taxed', perEuro: estimateSaleTax(gainFraction, holding.taxRate) ?? 0 };
}

/**
 * A candidate's rate: its BUYER's — the only member a plan sells; a composite buyer's sleeves give the
 * most taxed, unknown if any is (2026-11-12).
 */
export function candidateSaleTaxPerEuro(
  buyAssetId: string,
  holdings: readonly AllocatableHolding[],
): SaleTaxPerEuro {
  let worst: SaleTaxPerEuro = { kind: 'exempt' };
  for (const holding of holdings) {
    if ((holding.assetId ?? holding.id) !== buyAssetId) continue;
    const own = saleTaxPerEuro(holding);
    if (own.kind === 'unknown') return own;
    if (own.kind === 'taxed' && (worst.kind === 'exempt' || own.perEuro > worst.perEuro)) worst = own;
  }
  return worst;
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
