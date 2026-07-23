import 'server-only';
import { getExchangeRateToEur } from '@/lib/services/currencyConversionService';
import type { Asset } from '@/types/assets';

/**
 * Trade FX resolution (Registro operazioni asset — see
 * docs/specs/1-asset-transactions/01-data-model-and-rules.md §6).
 *
 * A trade's `priceEur` is resolved SERVER-SIDE only: Frankfurter is silently blocked from the
 * browser (AGENTS.md → FX Conversion), and storing a trade without a trustworthy `priceEur` would
 * corrupt every EUR metric. Network calls happen here, BEFORE the Firestore transaction — never
 * inside it (AGENTS.md → runTransaction).
 */

// Frankfurter historical/latest FX. The benchmark pipeline already depends on Frankfurter, so this
// adds no new external dependency. The .dev host exposes the base/symbols query shape used below.
const FRANKFURTER_V1_BASE = 'https://api.frankfurter.dev/v1';

/**
 * Raised when no trustworthy FX rate can be obtained for a non-EUR trade. The route maps it to a
 * 503 with an Italian message: a trade must never be stored with a guessed `priceEur`.
 */
export class TradeFxUnavailableError extends Error {
  currency: string;

  constructor(currency: string) {
    super(`Unable to resolve EUR FX rate for currency ${currency}`);
    this.name = 'TradeFxUnavailableError';
    this.currency = currency;
    // Restore the prototype chain so `instanceof` holds after transpilation to older targets.
    Object.setPrototypeOf(this, TradeFxUnavailableError.prototype);
  }
}

/** Italian wall-clock day (YYYY-MM-DD) for a given instant — the Frankfurter historical path key. */
function formatItalyIsoDay(date: Date): string {
  // en-CA renders as YYYY-MM-DD; the Europe/Rome timeZone pins it to the Italian calendar day so a
  // near-midnight trade is not shifted into the wrong UTC day.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(date);
}

/**
 * Fetch the {currency}→EUR rate at `date` from Frankfurter. Returns null on any failure (bad
 * response, missing/invalid rate) so the caller can fall back rather than throwing mid-resolution.
 */
async function fetchFrankfurterRateToEur(currency: string, date: Date): Promise<number | null> {
  const dayStr = formatItalyIsoDay(date);
  const todayStr = formatItalyIsoDay(new Date());
  // Today (or a defensively future date) has no historical fixing yet → use the latest endpoint,
  // mirroring how current price updates resolve FX.
  const path = dayStr >= todayStr ? 'latest' : dayStr;

  try {
    const url = `${FRANKFURTER_V1_BASE}/${path}?base=${encodeURIComponent(currency)}&symbols=EUR`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const rate = data?.rates?.EUR;
    return typeof rate === 'number' && isFinite(rate) && rate > 0 ? rate : null;
  } catch (error) {
    console.warn(`[tradeFxService] Frankfurter fetch failed for ${currency}@${dayStr}:`, error);
    return null;
  }
}

/**
 * GBp (London pence) is not a Frankfurter currency. Callers pass an already-pence-normalized
 * `pricePerUnit` (in GBP), so the FX leg must ask for GBP, not GBp.
 */
function normalizeFxCurrency(currency: string): string {
  return currency === 'GBp' ? 'GBP' : currency;
}

/**
 * Resolve the per-unit EUR price of a trade at its execution date.
 *
 * @param currency     Asset.currency (native).
 * @param pricePerUnit Native price per unit, already GBp-normalized / bond-resolved by the caller.
 * @param date         Trade execution date.
 * @returns The EUR-per-unit value at the trade date.
 * @throws TradeFxUnavailableError when neither the historical fixing nor the cached rate is available.
 */
export async function resolveTradePriceEur(
  currency: string,
  pricePerUnit: number,
  date: Date
): Promise<number> {
  if (!currency || currency.toUpperCase() === 'EUR') {
    // EUR-denominated (and bonds, which store EUR) need no conversion.
    return pricePerUnit;
  }

  const fxCurrency = normalizeFxCurrency(currency);

  const historicalRate = await fetchFrankfurterRateToEur(fxCurrency, date);
  if (historicalRate !== null) return pricePerUnit * historicalRate;

  // Fallback: the existing 24h in-memory FX cache (latest rate). A stale rate beats corrupting the
  // EUR metrics; getExchangeRateToEur throws only when nothing (network nor cache) is available.
  try {
    const fallbackRate = await getExchangeRateToEur(fxCurrency);
    return pricePerUnit * fallbackRate;
  } catch {
    throw new TradeFxUnavailableError(currency);
  }
}

/**
 * Resolve the baseline (migration) trade's per-unit EUR price.
 *
 * Historical FX for the ORIGINAL purchases is unknowable, so we approximate with the asset's own
 * current conversion ratio (spec 01 §6 baseline formula):
 *   priceEur = pricePerUnit × (currentPriceEur / currentPrice)   when both are present;
 *   else fetch the current rate;
 *   else priceEur = pricePerUnit                                  (EUR assets / last resort — the
 *   pre-migration FX mismatch already documented for calculateUnrealizedGains persists, no worse
 *   than today). Never throws: a failed migration must degrade, not block the ledger opening.
 */
export async function resolveBaselinePriceEur(asset: Asset): Promise<number> {
  const pricePerUnit = asset.averageCost ?? asset.currentPrice;
  const currency = asset.currency ?? 'EUR';

  if (currency.toUpperCase() === 'EUR') return pricePerUnit;

  if (asset.currentPriceEur !== undefined && asset.currentPrice > 0) {
    return pricePerUnit * (asset.currentPriceEur / asset.currentPrice);
  }

  try {
    const rate = await getExchangeRateToEur(normalizeFxCurrency(currency));
    return pricePerUnit * rate;
  } catch {
    // Last resort: treat native as EUR. Documented approximation for a non-EUR asset that never had
    // its EUR price populated (pre-migration, price never refreshed).
    return pricePerUnit;
  }
}
