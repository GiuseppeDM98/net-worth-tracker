/**
 * The ONE floor under a scraped dividend: from which day does a dividend of this instrument
 * belong to the user?
 *
 * Borsa Italiana lists an instrument's whole dividend history, and the app must not book the
 * payments of years in which the user did not hold it (a dividend booked against a position
 * that did not exist is a wrong number, not a missing one — PRODUCT.md, Principle 1). The floor
 * is the day the holding started when the ledger knows it (`holdingStartDate`, stamped by the
 * replay from the first real BUY, backdated purchases included), otherwise the day the asset
 * was created in the app — the only date a baseline-only asset carries.
 *
 * Until 2026-09-13 both the scrape route and the cron used `createdAt` alone, so a stock added
 * to the app last week found no history at all and the button said «Nessun nuovo dividendo
 * trovato» without saying why. The route now reports what it filtered and this floor, and the
 * tab names the recovery: record the purchase in the Registro operazioni with its real date.
 */

import type { Asset } from '@/types/assets';
import { isDateOnOrAfter } from '@/lib/utils/dateHelpers';

export type DividendFloorSource = 'holdingStart' | 'created';

export interface DividendFloor {
  date: Date;
  source: DividendFloorSource;
}

/** The first day a dividend of `asset` can belong to the user, and where that day comes from. */
export function resolveDividendFloor(asset: Pick<Asset, 'holdingStartDate' | 'createdAt'>): DividendFloor {
  if (asset.holdingStartDate) return { date: asset.holdingStartDate, source: 'holdingStart' };
  return { date: asset.createdAt, source: 'created' };
}

/** Whether a dividend with this ex-date falls on or after the asset's floor. */
export function isDividendEligible(exDate: Date, asset: Pick<Asset, 'holdingStartDate' | 'createdAt'>): boolean {
  return isDateOnOrAfter(exDate, resolveDividendFloor(asset).date);
}
