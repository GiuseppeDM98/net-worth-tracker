import type { AssetType } from './assets';

/**
 * Firestore collection names for the trade ledger. Kept in this Firebase-free module so the
 * client service (client SDK reads) and the server use case (Admin SDK writes) resolve them from
 * a single source.
 */
export const ASSET_TRANSACTIONS_COLLECTION = 'assetTransactions';
export const ASSET_TRANSACTIONS_META_COLLECTION = 'assetTransactionsMeta';

/**
 * Asset types that are managed through the trade ledger.
 * cash (balance-as-quantity), realestate (estimated value) and pensionFund (statement value, fed by
 * `pensionContributions`) are deliberately excluded: their "quantity" is not the result of trading
 * operations.
 */
const LEDGER_ASSET_TYPES = ['stock', 'etf', 'fund', 'bond', 'crypto', 'commodity'] as const satisfies readonly AssetType[];

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
 * Broker a trade was imported FROM, or undefined for a hand-entered one.
 *
 * This exists for exactly one reason: IDEMPOTENCY. Without it a broker sync has no way to tell
 * «a trade the ledger already holds» from «a new one», so every sync duplicates the whole
 * history and the replay double-counts quantity, PMC and realized P&L. `sourceRef` is the
 * broker's OWN stable id for the operation (never a row index), so the same trade maps to the
 * same key on every run and on any machine.
 *
 * Read as «where did this come from», never as a sync cursor: a trade the user later EDITS keeps
 * both fields, so re-syncing repairs nothing and overwrites nothing. Edits are the user's, and a
 * broker read must never revert one.
 */
export type AssetTransactionSource = 'scalable' | 'traderepublic' | 'binance';

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
 * value). priceEur is the per-unit EUR value at trade date (== pricePerUnit
 * for EUR-denominated assets).
 */
export interface AssetTransaction {
  id: string;
  userId: string;            // data owner (ownerId), same scoping as every data collection
  assetId: string;
  type: AssetTransactionType;
  date: Date;                // execution date; any past date up to today (Italy) — a migrated asset's
                             // trades cannot precede its baseline (replay: BASELINE_NOT_FIRST)
  quantity: number;
  pricePerUnit: number;      // native currency per unit (>= 0)
  priceEur: number;          // EUR per unit at trade date (>= 0); == pricePerUnit for EUR assets
  fees?: number;             // total EUR commissions (>= 0). buy: added to EUR cost basis;
                             // sell: subtracted from proceeds; adjustment: not allowed
  linkedCashAssetId?: string; // optional settlement cash asset (buy debits, sell credits)
  // SELL only: the capital-gains tax the broker withheld at the sale, EUR (>= 0), typed from the
  // statement over a prefilled estimate. It lowers what the settlement account receives and
  // replaces the estimate in the period readings (periodSales); realized P&L and XIRR stay
  // gross of it. Absent on every sell recorded before 2026-09-20 — those read the estimate.
  withheldTaxEur?: number;
  // Broker provenance. Both fields travel together: `sourceRef` is meaningless without the broker
  // that issued the id, and an id minted by one broker must never be matched against another's.
  // Never indexed as a uniqueness constraint in Firestore rules — the importer checks it, because
  // the pair is unique per BROKER OWNER, and ownership is what a rules-level constraint cannot see.
  source?: AssetTransactionSource;
  sourceRef?: string;
  isBaseline?: boolean;     // migration-created opening position; always type 'buy'
  // BTP€i only: the indexation coefficient the Borsa Italiana quote was multiplied by to reach
  // pricePerUnit (quote/100 × nominal × coefficient). Metadata for the edit form's back-conversion;
  // the replay never reads it.
  indexationCoefficient?: number;
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
  withheldTaxEur?: number;
  indexationCoefficient?: number;
  note?: string;
  // Broker provenance, written ONLY by the broker importer. Exposed on the form data (rather
  // than a server-only import input) so the write goes through the SAME schema and the SAME
  // prepare/commit path as a hand-entered trade — one writer, one validation, one replay.
  // Absent on a hand-entered trade, which is what makes it «imported» rather than «synced».
  source?: AssetTransactionSource;
  sourceRef?: string;
  // priceEur is NOT part of the form: the server resolves it, so the client
  // can never write an inconsistent FX value.
}

/** Per-user ledger metadata (doc id == userId). */
export interface AssetTransactionsMeta {
  userId: string;
  migratedAt: Date;
  baselineDate: Date;        // start-of-day (Italy) of migration day: the date of every baseline BUY.
                             // NOT a floor for trade dates since 2026-09-13 (an asset without a
                             // baseline accepts any past date)
  migratedAssetCount: number;
  // One-shot signal for backfillAverageCostEur (assetTransactionUseCase.ts): every ledger asset's
  // averageCostEur is derivable from trades that already carry a correct per-trade priceEur, so the
  // backfill only needs to run once, after migration, to project it onto pre-existing asset docs.
  // Absent until the backfill has run for this owner.
  averageCostEurBackfilledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
