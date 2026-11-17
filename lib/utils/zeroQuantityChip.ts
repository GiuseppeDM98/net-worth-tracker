import type { Asset } from '@/types/assets';
import { isLedgerAssetType } from '@/types/assetTransactions';

export const SOLD_OUT_CHIP = 'Azzerato';
export const NEVER_BOUGHT_CHIP = 'Mai comprato';

/**
 * The chip of an instrument held at zero quantity — ONE rule for the plan editor, STRUMENTI and
 * Patrimonio (owner, 2026-11-12). «Azzerato» says it was sold off; an instrument CREATED empty for an
 * accumulation plan (`createdEmpty`, written only by AssetDialog's empty create) with no operation in
 * the Registro was never bought and says «Mai comprato». The flag is needed: a position sold before
 * the ledger migration has no row either. With the ledger unread (`tradedAssetIds` null: still
 * loading) or an instrument without ledger the safe word stays «Azzerato». Null for one that is held.
 */
export function describeZeroQuantityChip(
  asset: Pick<Asset, 'id' | 'type' | 'quantity' | 'createdEmpty'>,
  tradedAssetIds: ReadonlySet<string> | null,
): string | null {
  if (asset.quantity !== 0) return null;
  if (asset.createdEmpty === true && tradedAssetIds && isLedgerAssetType(asset.type) && !tradedAssetIds.has(asset.id)) return NEVER_BOUGHT_CHIP;
  return SOLD_OUT_CHIP;
}
