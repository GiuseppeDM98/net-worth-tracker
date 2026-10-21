/**
 * «Legata all'immobile» (owner, 2026-10-21): which house a row belongs to. Explicitly, through
 * `Expense.propertyAssetId` (a home or CPI policy, linked from the form or «Collega la serie a un
 * immobile…»); or DERIVED, through the loan the row repays when that loan finances a house
 * (`Asset.financedAssetId`) — a mortgage instalment needs no second link, and a sale in Compravendita
 * proposes it all the same (lib/utils/realEstateOperationPlan.ts → isProposedToStop).
 *
 * SDK-free: a row and the loans' houses in, the house out.
 */

import type { Asset } from '@/types/assets';
import type { Expense } from '@/types/expenses';

export interface RowHouse {
  houseId: string;
  /** True when the house comes from the loan the row repays, not from the row's own link. */
  viaLoan: boolean;
}

/** Loan id → the house it finances, for the loans that finance one. */
export function housesByLoan(assets: readonly Pick<Asset, 'id' | 'type' | 'financedAssetId'>[]): Map<string, string> {
  return new Map(assets.filter((asset) => asset.type === 'loan' && !!asset.financedAssetId).map((asset) => [asset.id, asset.financedAssetId!]));
}

/**
 * The house a row belongs to, or null: the house its loan finances first — a mortgage instalment
 * belongs to its mortgage's house, whatever else it names (owner, 2026-10-21 tour) — else its own link.
 */
export function houseOfRow(row: Pick<Expense, 'propertyAssetId' | 'debtAssetId'>, loanHouses: ReadonlyMap<string, string>): RowHouse | null {
  const viaLoan = row.debtAssetId ? loanHouses.get(row.debtAssetId) : undefined;
  if (viaLoan) return { houseId: viaLoan, viaLoan: true };
  return row.propertyAssetId ? { houseId: row.propertyAssetId, viaLoan: false } : null;
}
