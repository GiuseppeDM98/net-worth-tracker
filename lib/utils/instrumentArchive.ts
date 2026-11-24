/**
 * The instruments that were sold out: what the Registro operazioni says about them, and the words.
 *
 * An instrument at zero quantity WITH a history is not a holding and not a mistake: it leaves the list
 * for a closed group, and it cannot be deleted — its trades are what the realized gains, Rendimenti and
 * the sales of a month are computed from (owner, 2026-11-23). One created empty and never bought has no
 * history: it stays in the list, deletable.
 */
import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import { formatItalianDate } from '@/lib/utils/dateHelpers';

export interface LedgerFootprint {
  /** Every row of the instrument in the ledger, the opening one included. */
  operations: number;
  /** The rows the owner entered: every row but the migration's opening position. These forbid a delete. */
  ownOperations: number;
  /** The day of its most recent sale, null when it was never sold. */
  lastSale: Date | null;
}

export function summarizeLedgerFootprints(transactions: AssetTransaction[]): Map<string, LedgerFootprint> {
  const footprints = new Map<string, LedgerFootprint>();
  for (const trade of transactions) {
    const footprint = footprints.get(trade.assetId) ?? { operations: 0, ownOperations: 0, lastSale: null };
    footprint.operations += 1;
    if (!trade.isBaseline) footprint.ownOperations += 1;
    if (trade.type === 'sell' && (!footprint.lastSale || trade.date > footprint.lastSale)) footprint.lastSale = trade.date;
    footprints.set(trade.assetId, footprint);
  }
  return footprints;
}

type Position = Pick<Asset, 'id' | 'quantity'>;

/** Null footprints = the ledger is not read yet: nothing is archived, the chip keeps saying «Azzerato». */
export function isArchivedInstrument(asset: Position, footprints: ReadonlyMap<string, LedgerFootprint> | null): boolean {
  return asset.quantity === 0 && (footprints?.get(asset.id)?.operations ?? 0) > 0;
}

/** The list and the group. The group comes newest sale first; one never sold (a correction to zero) last. */
export function splitArchivedInstruments<T extends Position>(
  assets: T[],
  footprints: ReadonlyMap<string, LedgerFootprint> | null,
): { live: T[]; archived: T[] } {
  const live: T[] = [];
  const archived: T[] = [];
  for (const asset of assets) (isArchivedInstrument(asset, footprints) ? archived : live).push(asset);
  const saleTime = (asset: T) => footprints?.get(asset.id)?.lastSale?.getTime() ?? 0;
  archived.sort((a, b) => saleTime(b) - saleTime(a));
  return { live, archived };
}

export function describeArchiveGroup(count: number): string {
  return count === 1 ? '1 strumento azzerato' : `${count} strumenti azzerati`;
}

export function describeSoldOn(footprint: LedgerFootprint | undefined): string {
  return footprint?.lastSale ? `venduto il ${formatItalianDate(footprint.lastSale)}` : 'azzerato';
}

/**
 * How many rows forbid the delete: the owner's own, never the migration's opening position (an
 * instrument entered by mistake before the migration goes with it). Null = the ledger is not read.
 */
export function deleteBlockingOperations(
  assetId: string,
  footprints: ReadonlyMap<string, LedgerFootprint> | null,
): number | null {
  return footprints ? footprints.get(assetId)?.ownOperations ?? 0 : null;
}

/** Why the trash did nothing. `operations` comes from the ledger in hand or from the server's 409. */
export function describeDeleteRefusal(name: string, operations: number): string {
  const rows = operations === 1 ? '1 operazione' : `${operations} operazioni`;
  return `${name} ha ${rows} nel registro e non si può eliminare: da lì si calcolano plusvalenze e rendimenti. Per eliminarlo, elimina prima le sue operazioni da «Movimenti».`;
}

/** The tile's body when every instrument is in the group. */
export const ALL_ARCHIVED_SENTENCE = 'Nessuno strumento in portafoglio: quelli venduti sono qui sotto.';

export { DELETED_INSTRUMENT_NAME } from '@/lib/utils/deletedInstrumentName';
