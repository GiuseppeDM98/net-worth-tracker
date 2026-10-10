/**
 * exposureRequests — WHO enters the Esposizione and WHAT is asked of Yahoo for them.
 *
 * One pure module, called from both ends: the route (which tickers to resolve for an owner) and
 * the hook (the React Query signature). It imports only `allocationUtils` and `assetPricing` on
 * purpose: `exposureEngine.ts` reaches `expandAssetExposure` → `assetService` → the client SDK,
 * and a route importing it would carry `firebase/firestore` into the Lambda.
 *
 * The base is the ALLOCAZIONE portfolio — `quantity > 0` and a role of `tradable` or `frozen`
 * (`excluded` leaves every view and every coverage clause). «Quoted instrument» is ONE rule,
 * `hasMarketPrice` plus a non-empty ticker: never a hand-written list of types here.
 */
import type { Asset, AssetType } from '@/types/assets';
import type { ProfileModule, ProfileRequest } from '@/types/exposure';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import { hasMarketPrice } from '@/lib/utils/assetPricing';

/** The ticker as the cache and the profiles key it: trimmed, case untouched (Yahoo reads it as stored). */
export function instrumentTicker(asset: Pick<Asset, 'ticker'>): string {
  return (asset.ticker ?? '').trim();
}

/** In the Allocazione portfolio: held, and not `excluded`. */
export function isExposureBaseAsset(asset: Asset): boolean {
  return asset.quantity > 0 && resolveAllocationRole(asset) !== 'excluded';
}

/** Priced by a market AND identifiable by a ticker: the only assets Yahoo can be asked about. */
export function isQuotedInstrument(asset: Pick<Asset, 'type' | 'subCategory' | 'ticker'>): boolean {
  return hasMarketPrice(asset.type, asset.subCategory) && instrumentTicker(asset) !== '';
}

/**
 * The Yahoo module an asset's TYPE needs. An ETC (`commodity`) is asked as a fund because
 * `fundProfile` carries its family (owner, 2026-09-28); a bond or a crypto asks nothing — Yahoo
 * knows no issuer for them, so in Emittenti they are «non letti» with their name.
 *
 * WARNING: widening `AssetType` fails here until the new type declares its module.
 */
const MODULE_BY_TYPE: Record<AssetType, ProfileModule | null> = {
  etf: 'fund',
  commodity: 'fund',
  stock: 'stock',
  bond: null,
  crypto: null,
  cash: null,
  realestate: null,
  pensionFund: null,
  loan: null,
};

export function profileModuleFor(type: AssetType): ProfileModule | null {
  return MODULE_BY_TYPE[type] ?? null;
}

/**
 * The tickers in view and the module each one needs, unique and sorted — the same list on the
 * route (what to resolve) and in the hook (the query's signature).
 */
export function selectProfileRequests(assets: Asset[]): ProfileRequest[] {
  const seen = new Set<string>();
  const requests: ProfileRequest[] = [];
  for (const asset of assets) {
    if (!isExposureBaseAsset(asset) || !isQuotedInstrument(asset)) continue;
    const profileModule = profileModuleFor(asset.type);
    if (!profileModule) continue;
    const ticker = instrumentTicker(asset);
    const key = `${ticker}:${profileModule}`;
    if (seen.has(key)) continue;
    seen.add(key);
    requests.push({ ticker, module: profileModule });
  }
  return requests.sort((a, b) => a.ticker.localeCompare(b.ticker) || a.module.localeCompare(b.module));
}

/** «AAPL:stock|VWCE.DE:fund» — the React Query key's last segment; a new ticker changes it and the read restarts by itself. */
export function profileRequestsSignature(requests: ProfileRequest[]): string {
  return requests.map((request) => `${request.ticker}:${request.module}`).join('|');
}
