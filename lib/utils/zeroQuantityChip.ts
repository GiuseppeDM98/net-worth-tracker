import type { Asset } from '@/types/assets';
import { isLedgerAssetType } from '@/types/assetTransactions';

export const SOLD_OUT_CHIP = 'Azzerato';
export const NEVER_BOUGHT_CHIP = 'Mai comprato';

/**
 * The chip of an instrument held at zero quantity. «Azzerato» says it was sold off; an instrument
 * CREATED empty (to be bought by an accumulation plan) has nothing sold
 * and says «Mai comprato». The difference is the Registro: a ledger instrument with no operation in
 * it was never bought. With the ledger unread (`tradedAssetIds` null: not migrated, still loading) or
 * an instrument without ledger the safe word stays «Azzerato». Null for an instrument that is held.
 */
export function describeZeroQuantityChip(
  asset: Pick<Asset, 'id' | 'type' | 'quantity'>,
  tradedAssetIds: ReadonlySet<string> | null,
): string | null {
  if (asset.quantity !== 0) return null;
  if (tradedAssetIds && isLedgerAssetType(asset.type) && !tradedAssetIds.has(asset.id)) return NEVER_BOUGHT_CHIP;
  return SOLD_OUT_CHIP;
}
