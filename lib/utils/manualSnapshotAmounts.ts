/**
 * The euro amounts of a manual snapshot's asset-class tab, as data rather than as six pieces
 * of component state.
 *
 * Why it is its own module: the form cross-validates the sum of the class fields against the
 * declared total, so the set of fields it offers is not cosmetic — a class the form does not
 * ask for makes an honest snapshot *impossible to enter*, because the fields it does offer can
 * never reach the total. Six hard-coded fields did exactly that to `trendFollowing` and `carry`
 * from the day the union was widened until 2026-08-30. Keyed off `ASSET_CLASS_SEQUENCE`, the
 * app-wide enumeration, the shape follows the union by construction.
 *
 * The values are STRINGS because they are `<input type="number">` values: an empty field, a
 * half-typed '1.' and a '0' are three different things to the form and must survive round-trip
 * unchanged. Parsing happens here, once, at the boundary.
 */

import { ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';

/** One entry per asset class, every field starting at '0'. */
export function emptyClassAmounts(): Record<string, string> {
  return Object.fromEntries(ASSET_CLASS_SEQUENCE.map((assetClass) => [assetClass, '0']));
}

/**
 * A field's euro value. An empty, blank or unparseable field is 0 — the form's own convention:
 * a class left alone did not happen, it is not an error. NaN never escapes.
 */
export function parseAmount(raw: string | undefined): number {
  const value = parseFloat((raw ?? '').trim());
  return Number.isFinite(value) ? value : 0;
}

/**
 * The total the form validates against the declared net worth.
 *
 * It sums the CLASSES the union knows, not the keys present in the record: a stale key left by
 * an older document must not silently inflate the sum the user is asked to reconcile.
 */
export function sumClassAmounts(amounts: Record<string, string>): number {
  return ASSET_CLASS_SEQUENCE.reduce((total, assetClass) => total + parseAmount(amounts[assetClass]), 0);
}
