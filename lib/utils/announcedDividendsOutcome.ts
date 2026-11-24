/**
 * What a trade did to the asset's announced dividends, and the one sentence that says it (2026-11-23).
 *
 * A module of its own, re-exported by `dividendEntitlement.ts`: the trade dialogs import only this,
 * so the entitlement rule (and the ledger replay it reads) stays out of Patrimonio's first load.
 */

export interface AnnouncedDividendsOutcome {
  updated: number;
  deleted: number;
}

/** The toast after a trade that moved pending dividends, or null when it moved none. */
export function describeAnnouncedDividendsOutcome({ updated, deleted }: AnnouncedDividendsOutcome): string | null {
  if (updated === 0 && deleted === 0) return null;
  const recomputed = updated === 1 ? '1 dividendo annunciato ricalcolato' : `${updated} dividendi annunciati ricalcolati`;
  const removed = deleted === 1 ? '1 dividendo annunciato eliminato' : `${deleted} dividendi annunciati eliminati`;
  if (deleted === 0) return `${recomputed} sulla quantità posseduta allo stacco.`;
  if (updated === 0) return `${removed}: allo stacco lo strumento non era in portafoglio.`;
  return `${recomputed} e ${deleted === 1 ? '1 eliminato' : `${deleted} eliminati`}: conta la quantità posseduta allo stacco.`;
}
