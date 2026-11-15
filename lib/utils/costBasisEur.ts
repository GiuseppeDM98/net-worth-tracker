/**
 * costBasisEur — the ONE rule for «which euro figure stands against which» on a position.
 *
 * Every value the app prints is EUR (`calculateAssetValue`), so a G/P, a tax estimate, a yield on
 * cost or the PMC cell must stand against a EUR cost too. Until 2026-09-07 every consumer read the
 * native PMC, so a USD position's G/P compared dollars with euros (PR #326).
 *
 * Two EUR numbers per unit since 2026-11-12 (owner), both projected by the ledger
 * (`assetTransactionUtils`, invariant #2):
 *   - the PMC (`averageCostEur`, read by `costBasisPerUnitEur`): the position's cost at trade-date
 *     rates, NO fee — a trade's fee is a spending row of its own. The table, every G/P, the YOC,
 *     the PDF, the «Carico» and the AI read it.
 *   - the fiscal cost (`fiscalAverageCostEur`, read by `fiscalCostPerUnitEur`): the same with the
 *     purchase fees INCLUDED. Every tax estimate reads it (the sale simulation, the withdrawal
 *     tax, the plan's sales, the estimated taxes of the overview).
 * The native PMC (fee-free, the broker statement's figure) stays visible beside them on a
 * foreign-currency row. A G/P never stands on the fiscal cost, a tax never on the PMC (DESIGN →
 * The Same-Basis Rule).
 *
 * Zero Firebase imports: pure functions of the asset's own fields, so `assetService` (which
 * `patrimonioSummary` imports) can use them without a cycle.
 */

import type { Asset } from '@/types/assets';

type CostBasisFields = Pick<Asset, 'averageCost' | 'averageCostEur'> & { currency?: string };
type FiscalCostFields = CostBasisFields & Pick<Asset, 'fiscalAverageCostEur'>;
type UnitPriceFields = Pick<Asset, 'currentPrice' | 'currentPriceEur'> & { currency?: string };

/** `currency` is required by the type, but a document from before 2024 can lack it: absent reads as EUR. */
export function isEurNative(asset: { currency?: string }): boolean {
  return (asset.currency ?? 'EUR').toUpperCase() === 'EUR';
}

/**
 * The EUR PMC, no fee — the cost per unit every G/P, YOC and PMC cell is measured against.
 *
 * `averageCostEur` when the ledger has projected it. For a EUR-native asset the native PMC is in
 * the same currency and stands in until the backfill has run (the same fee-free basis, never a
 * currency mix). A foreign asset without `averageCostEur` has NO comparable basis:
 * undefined says so, and the consumers print nothing rather than a dollar figure against euros.
 */
export function costBasisPerUnitEur(asset: CostBasisFields): number | undefined {
  if (asset.averageCostEur !== undefined && asset.averageCostEur > 0) return asset.averageCostEur;
  if (isEurNative(asset) && asset.averageCost !== undefined && asset.averageCost > 0) return asset.averageCost;
  return undefined;
}

/**
 * The FISCAL cost per unit in EUR, purchase fees included — what every tax estimate stands on (owner, 2026-11-12).
 * Until the one-shot re-projection reaches an asset its stored `averageCostEur` still carries the fees and stands in;
 * a position the ledger never priced has no fee to add.
 */
export function fiscalCostPerUnitEur(asset: FiscalCostFields): number | undefined {
  if (asset.fiscalAverageCostEur !== undefined && asset.fiscalAverageCostEur > 0) return asset.fiscalAverageCostEur;
  return costBasisPerUnitEur(asset);
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
