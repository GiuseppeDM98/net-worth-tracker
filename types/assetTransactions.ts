import type { AssetType } from './assets';

/**
 * Firestore collection names for the trade ledger. Kept in this Firebase-free module so the
 * client service (client SDK reads) and the server use case (Admin SDK writes) resolve them from
 * a single source. See docs/specs/1-asset-transactions/01-data-model-and-rules.md §2.
 */
export const ASSET_TRANSACTIONS_COLLECTION = 'assetTransactions';
export const ASSET_TRANSACTIONS_META_COLLECTION = 'assetTransactionsMeta';

/**
 * Asset types that are managed through the trade ledger.
 * cash (balance-as-quantity) and realestate (estimated value) are deliberately
 * excluded: their "quantity" is not the result of trading operations.
 */
export const LEDGER_ASSET_TYPES = ['stock', 'etf', 'bond', 'crypto', 'commodity'] as const satisfies readonly AssetType[];

/** True when `type` is managed through the trade ledger (its quantity/PMC are replay-derived). */
export function isLedgerAssetType(type: AssetType): boolean {
  return (LEDGER_ASSET_TYPES as readonly AssetType[]).includes(type);
}

// WARNING (checklist comment): adding a value here requires updating, in lock-step:
//   - the replay switch in lib/utils/assetTransactionUtils.ts (replayTransactions)
//   - the zod schema in lib/server/validation.ts (assetTransactionTypeSchema)
//   - the type chips/labels in components/assets/TransactionDialog.tsx
export type AssetTransactionType = 'buy' | 'sell' | 'adjustment';

/**
 * One trade in the asset ledger.
 *
 * Semantics by type:
 * - buy:        quantity = units bought (> 0); pricePerUnit = paid price per unit.
 * - sell:       quantity = units sold (> 0);  pricePerUnit = sale price per unit.
 * - adjustment: ABSOLUTE RESET — quantity = new total quantity (>= 0),
 *               pricePerUnit = new PMC. No realized P&L, no cash settlement.
 *
 * Currency convention: pricePerUnit follows the SAME unit basis as Asset.averageCost
 * today (native currency; for Borsa Italiana bonds the already-converted EUR-per-unit
 * value, see spec 01 §5). priceEur is the per-unit EUR value at trade date (== pricePerUnit
 * for EUR-denominated assets).
 */
export interface AssetTransaction {
  id: string;
  userId: string;            // data owner (ownerId), same scoping as every data collection
  assetId: string;
  type: AssetTransactionType;
  date: Date;                // execution date; baselineDate <= date <= today (Italy)
  quantity: number;
  pricePerUnit: number;      // native currency per unit (>= 0)
  priceEur: number;          // EUR per unit at trade date (>= 0); == pricePerUnit for EUR assets
  fees?: number;             // total EUR commissions (>= 0). buy: added to EUR cost basis;
                             // sell: subtracted from proceeds; adjustment: not allowed
  linkedCashAssetId?: string; // optional settlement cash asset (buy debits, sell credits)
  isBaseline?: boolean;      // migration-created opening position; always type 'buy'
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Create/update payload (client → API). System fields are stamped server-side. */
export interface AssetTransactionFormData {
  assetId: string;
  type: AssetTransactionType;
  date: Date;
  quantity: number;
  pricePerUnit: number;
  fees?: number;
  linkedCashAssetId?: string;
  note?: string;
  // priceEur is NOT part of the form: the server resolves it (see spec 01 §6) so the client
  // can never write an inconsistent FX value.
}

/** Per-user ledger metadata (doc id == userId). */
export interface AssetTransactionsMeta {
  userId: string;
  migratedAt: Date;
  baselineDate: Date;        // start-of-day (Italy) of migration day; global floor for trade dates
  migratedAssetCount: number;
  createdAt: Date;
  updatedAt: Date;
}
