/**
 * Bond pricing convention — the ONE rule turning a Borsa Italiana quote into euro per unit.
 *
 * Design note (issue #340): Borsa Italiana quotes every MOT bond as a percentage of par
 * (104,2 = 104,2 %). The app stores `currentPrice`, `averageCost` and a trade's `pricePerUnit` in
 * EUR PER UNIT, so the quote has to be scaled by what one unit is worth at par:
 *
 *   eurPerUnit = quote / 100 × nominalValue × indexationCoefficient
 *
 * - `nominalValue` defaults to 1 €: the quantity is then the nominal in euro, exactly as a broker
 *   statement reads («nominale 5.000 €, prezzo 99,50, controvalore 4.975 €»). A nominal of 1000
 *   means the quantity counts 1.000 € lots. Before 2026-09-11 the conversion was skipped unless the
 *   nominal was set and > 1, so a bond saved without it kept the raw quote as euro (93 % → 93 €
 *   per unit, two orders of magnitude off with quantity 1000) — and NO quantity made that right,
 *   because every other reader (coupons, final premium, the cron) already assumed a 1 € unit.
 * - `indexationCoefficient` is the BTP€i's HICP coefficient (issue #341): the quote is a REAL
 *   price, the euro value carries the accrued revaluation. 1 for every other bond.
 *
 * This rule used to live in `AssetDialog.tsx` and was duplicated by hand in `TransactionDialog`
 * and twice in `priceUpdater.ts` (server code cannot import a client component). Dependency-free,
 * so every one of them imports it from here.
 */

/** One unit is 1 € of nominal unless the bond says otherwise. */
export const DEFAULT_BOND_NOMINAL_VALUE = 1;

/** The scaling inputs of a quote; both optional, both defaulting to "no scaling beyond / 100". */
export interface BondQuoteBasis {
  nominalValue?: number;
  indexationCoefficient?: number;
}

/** Minimal asset shape needed to decide whether its prices are Borsa Italiana quotes. */
export interface BondQuotedAssetFields {
  type: string;
  assetClass: string;
  isin?: string;
}

/**
 * Whether the asset's prices are Borsa Italiana quotes (% of par) rather than euro per unit:
 * a bond in the bonds class with an ISIN — the ISIN is what routes it to the Borsa Italiana
 * scraper, so a bond without one is priced by hand in euro.
 */
export function isBondQuotedInPercent(asset: BondQuotedAssetFields): boolean {
  return asset.type === 'bond' && asset.assetClass === 'bonds' && !!asset.isin?.trim();
}

/** The nominal per unit actually applied: the stored one when positive, else 1 €. */
export function effectiveBondNominal(nominalValue: number | undefined): number {
  return nominalValue !== undefined && !isNaN(nominalValue) && nominalValue > 0
    ? nominalValue
    : DEFAULT_BOND_NOMINAL_VALUE;
}

/** The indexation coefficient actually applied: the given one when positive, else 1. */
export function effectiveIndexationCoefficient(coefficient: number | undefined): number {
  return coefficient !== undefined && !isNaN(coefficient) && coefficient > 0 ? coefficient : 1;
}

/**
 * Converts a Borsa Italiana quote to euro per unit for a bond quoted in percent; passthrough for
 * every other asset (the price already IS euro — or native currency — per unit).
 *
 * Example: quote 104.2, nominal 1000 → 1042 €; quote 93, no nominal → 0.93 €;
 *          quote 97.38, nominal 1, coefficient 1.25 → 1.21725 €.
 */
export function resolveBondPrice(
  rawPrice: number,
  basis: BondQuoteBasis,
  isBondWithIsin: boolean
): number {
  if (!isBondWithIsin) return rawPrice;
  return (rawPrice / 100) * effectiveBondNominal(basis.nominalValue) * effectiveIndexationCoefficient(basis.indexationCoefficient);
}

/**
 * The inverse of `resolveBondPrice`: euro per unit back to the Borsa Italiana quote, so an edit
 * form shows the figure the user sees on the exchange. Same basis in, same quote out.
 */
export function toBorsaItalianaQuote(eurPerUnit: number, basis: BondQuoteBasis): number {
  return (eurPerUnit * 100) / effectiveBondNominal(basis.nominalValue) / effectiveIndexationCoefficient(basis.indexationCoefficient);
}
