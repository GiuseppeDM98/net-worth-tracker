/**
 * Pension <-> FIRE — locked-capital helper (spec 2-pension-fund/04 §8, MVP).
 *
 * A fondo pensione is not freely withdrawable before its unlock date, so a FIRE calculation that
 * assumes "all capital is available now" overstates the runway. When the user turns on the
 * "capitale bloccato" toggle, the value of every pension fund whose `unlockDate` is still in the
 * future is subtracted from the FIRE-eligible net worth (it stays in the TOTAL net worth shown
 * elsewhere in the app — this only affects what FireCalculatorTab treats as spendable now). The
 * unlock date is per-fund, so each is evaluated on its own.
 *
 * `valueOf` is injected (e.g. `calculateAssetValue`) so this stays a pure, Firestore-free unit,
 * importable by tests without mocking `@/lib/firebase/config`.
 */

import type { Asset } from '@/types/assets';

/**
 * Sum the value of the pension funds LOCKED at `atDate`: type `pensionFund` with a parseable
 * `unlockDate` strictly after `atDate`. Funds without an unlock date are treated as NOT locked
 * (the user hasn't declared an access constraint), so they are excluded from the total and left
 * available — same reasoning as a fund with an unparseable date.
 */
export function calculatePensionLockedValue(
  assets: Asset[],
  atDate: Date,
  valueOf: (asset: Asset) => number
): number {
  let locked = 0;
  for (const asset of assets) {
    if (asset.type !== 'pensionFund') continue;
    const unlock = asset.pensionFundDetails?.unlockDate;
    if (!unlock) continue;
    const unlockTime = new Date(unlock).getTime();
    if (Number.isNaN(unlockTime) || unlockTime <= atDate.getTime()) continue;
    locked += valueOf(asset);
  }
  return locked;
}
