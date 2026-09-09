/**
 * costBasisEur — the ONE rule for «which euro figure stands against which» on a position.
 *
 * Every value the app prints is EUR (`calculateAssetValue`), so a G/P, a tax estimate, a yield on
 * cost or the PMC cell must stand against a EUR cost too. The ledger keeps two PMCs on purpose
 * (`assetTransactionUtils`, invariant #2): the NATIVE one is the weighted average of trade prices,
 * fees excluded — the figure a broker statement shows — and the EUR one is the position's cost in
 * euro at trade-date rates, purchase fees INCLUDED: the fiscal cost, the number a capital gain is
 * taxed on. Until 2026-09-07 every consumer read the native one, so a USD position's G/P compared
 * dollars with euros (PR #326), and on a EUR position the tax estimate ignored the fees the fiscal
 * cost counts. The owner's call (2026-09-07): ONE number, the fiscal one, on the table, the
 * Sintesi, the estimated taxes, the PDF and the sale simulation; the native PMC stays visible
 * beside it on a foreign-currency row.
 *
 * Zero Firebase imports: pure functions of the asset's own fields, so `assetService` (which
 * `patrimonioSummary` imports) can use them without a cycle.
 */

import type { Asset } from '@/types/assets';

type CostBasisFields = Pick<Asset, 'averageCost' | 'averageCostEur'> & { currency?: string };
type UnitPriceFields = Pick<Asset, 'currentPrice' | 'currentPriceEur'> & { currency?: string };

/** `currency` is required by the type, but a document from before 2024 can lack it: absent reads as EUR. */
export function isEurNative(asset: { currency?: string }): boolean {
  return (asset.currency ?? 'EUR').toUpperCase() === 'EUR';
}

/**
 * The EUR PMC, purchase fees included — the cost per unit every EUR figure is measured against.
 *
 * `averageCostEur` when the ledger has projected it. For a EUR-native asset the native PMC is in
 * the same currency and stands in until the backfill has run (fees excluded — a slightly lower
 * basis, never a currency mix). A foreign asset without `averageCostEur` has NO comparable basis:
 * undefined says so, and the consumers print nothing rather than a dollar figure against euros.
 */
export function costBasisPerUnitEur(asset: CostBasisFields): number | undefined {
  if (asset.averageCostEur !== undefined && asset.averageCostEur > 0) return asset.averageCostEur;
  if (isEurNative(asset) && asset.averageCost !== undefined && asset.averageCost > 0) return asset.averageCost;
  return undefined;
}

/**
 * The unit price in EUR — the rule `calculateAssetValue` applies to the whole position, per unit,
 * so a per-share yield or a sale simulation compares like with like. `currentPriceEur` for a
 * foreign asset once the price updater has stored it; otherwise the native price, with the GBp
 * guard (an LSE quote in pence: ÷100 — priceUpdater normalises on write, a document never
 * refreshed since may still carry pence).
 */
export function unitPriceEur(asset: UnitPriceFields): number {
  if (!isEurNative(asset) && asset.currentPriceEur !== undefined) return asset.currentPriceEur;
  return asset.currency === 'GBp' ? asset.currentPrice / 100 : asset.currentPrice;
}
