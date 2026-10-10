/**
 * The move of a property's legacy debt into a `loan` asset of its own (owner, 2026-10-10;
 * types/assets.ts → LOAN_ASSET_TYPE) — the pure plan, run once per account by
 * lib/services/loanMigration.ts on the owner's first visit to Patrimonio after the release.
 *
 * Until that day a mortgage was two fields of the property (`outstandingDebt`, `debtInterestRate`)
 * netted off its value. Now the property keeps its gross value and the debt is a liability beside
 * it, so a personal loan can exist without a property and an early repayment is a row like any
 * other. The plan, per property with a debt:
 *   - a loan named after the property («Mutuo Casa»), of its currency, with the debt as
 *     `quantity` at price 1, the TAN carried over, `financedAssetId` the property, illiquid like
 *     the property, out of the allocation (`excluded`, as a debt is not an investment), exempt
 *     from the stamp duty (a loan is not a securities account);
 *   - every cashflow row that repays the property (`debtAssetId`) re-pointed at the loan — past
 *     rows keep their stamps (`debtPrincipalRepaid` is a fact of their day), so the «Mutuo» tile
 *     keeps its history;
 *   - the two legacy fields deleted from the property.
 * Idempotent by construction: once no property carries a debt there is nothing to plan.
 *
 * SDK-free: assets and rows in, writes out.
 */

import type { Asset, AssetFormData } from '@/types/assets';
import type { Expense } from '@/types/expenses';

/** A property the migration moves the debt of, and what it writes. */
export interface LoanMigrationStep {
  propertyId: string;
  loan: AssetFormData;
  /** Ids of the rows whose `debtAssetId` moves from the property to the loan. */
  rowIds: string[];
}

/** The properties that still carry a legacy debt: the migration's subjects. */
export function propertiesWithLegacyDebt(assets: Asset[]): Asset[] {
  return assets.filter((asset) => asset.type === 'realestate' && (asset.outstandingDebt ?? 0) > 0);
}

/** The loan a property's legacy debt becomes. */
export function buildLoanFromProperty(property: Asset): AssetFormData {
  return {
    ticker: '',
    name: `Mutuo ${property.name.trim()}`,
    type: 'loan',
    assetClass: 'realestate',
    currency: property.currency,
    quantity: property.outstandingDebt ?? 0,
    currentPrice: 1,
    isLiquid: false,
    autoUpdatePrice: false,
    stampDutyExempt: true,
    allocationRole: 'excluded',
    isPrimaryResidence: false,
    financedAssetId: property.id,
    ...(property.debtInterestRate && property.debtInterestRate > 0 ? { debtInterestRate: property.debtInterestRate } : {}),
  };
}

/**
 * What the migration writes for the given assets and the rows linked to them — one step per
 * property with a legacy debt, nothing for an account already on the new model.
 */
export function planLoanMigration(assets: Asset[], linkedRows: Pick<Expense, 'id' | 'debtAssetId'>[]): LoanMigrationStep[] {
  return propertiesWithLegacyDebt(assets).map((property) => ({
    propertyId: property.id,
    loan: buildLoanFromProperty(property),
    rowIds: linkedRows.filter((row) => row.debtAssetId === property.id).map((row) => row.id),
  }));
}
