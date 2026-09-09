/**
 * Asset Pricing Source — single source of truth for "does this asset have a market price?"
 *
 * Design note: this rule used to exist in three independent copies (AssetDialog's local
 * `shouldUpdatePrice`, yahooFinanceService's exported `shouldUpdatePrice`, and
 * the asset table's `requiresManualPricing`). They drifted: only the dialog's copy knew
 * about `pensionFund`, so a pension fund was priced correctly in the form, still queued for
 * a Yahoo quote by the price cron, and never got the manual-price row tint in the table.
 *
 * The module is deliberately dependency-free (no Firebase, no yahoo-finance2) so both the
 * client bundle and server-only code can import it.
 *
 * WARNING: adding an AssetType whose value is entered by hand (statement, appraisal, NAV)
 * requires adding it to MANUALLY_VALUED_TYPES below — and nowhere else.
 */

/**
 * Asset types whose value is entered by the user, never quoted by a market data provider.
 *
 * - `realestate`: property appraisals, not market quotes
 * - `cash`: the unit of measurement itself, price is always 1
 * - `pensionFund`: the value is an "estratto conto" overwrite from the fund manager
 */
const MANUALLY_VALUED_TYPES: ReadonlySet<string> = new Set(['realestate', 'cash', 'pensionFund']);

/**
 * Sub-category that overrides an otherwise market-traded type. A Private Equity position sits
 * in the `equity` class but is valued periodically by the fund manager, not by an exchange.
 */
const MANUALLY_VALUED_SUBCATEGORY = 'Private Equity';

/**
 * Whether an asset can be priced from a market data provider (Yahoo Finance / Borsa Italiana).
 *
 * @param assetType   - The asset type (stock, etf, bond, crypto, commodity, cash, realestate, pensionFund)
 * @param subCategory - Optional sub-category (e.g. "Private Equity" within the equity class)
 * @returns True when an automatic quote is meaningful for this asset.
 */
export function hasMarketPrice(assetType: string, subCategory?: string): boolean {
  if (MANUALLY_VALUED_TYPES.has(assetType)) return false;
  if (subCategory === MANUALLY_VALUED_SUBCATEGORY) return false;
  return true;
}

/** Minimal asset shape needed to decide how an asset is priced. */
export interface PricedAssetFields {
  type: string;
  subCategory?: string;
  autoUpdatePrice?: boolean;
}

/**
 * Whether the user has to keep this asset's value up to date by hand.
 *
 * True either because the asset has no market price at all, or because the user explicitly
 * turned auto-updates off for it. `autoUpdatePrice === undefined` means "not set" and is
 * treated as opted-in, matching the backwards-compatible default in `priceUpdater.ts`.
 *
 * Drives the manual-price row tint on Patrimonio and the «N valutati a mano» count of its
 * Strumenti reading. It does NOT decide how the Δ columns are measured: a hand-priced asset can
 * still have a real unit price (see lib/utils/assetPerformanceDeltas.ts).
 */
export function requiresManualPricing(asset: PricedAssetFields): boolean {
  if (asset.autoUpdatePrice === false) return true;
  return !hasMarketPrice(asset.type, asset.subCategory);
}
