/**
 * Pension <-> FIRE — locked-capital helper.
 *
 * A fondo pensione is not freely withdrawable before its unlock date, so a FIRE calculation that
 * assumes "all capital is available now" overstates the runway. The resolution of WHICH funds are
 * locked (per-fund `unlockDate` override > RITA rule from `userAge` > not modellable) lives in
 * `lib/utils/pensionUnlock.ts` — this module is a thin sum wrapper kept for callers that only
 * need the locked total. With no `settings`, only funds with an explicit future `unlockDate`
 * count, which is the pre-Spec-3 behaviour.
 *
 * `valueOf` is injected (e.g. `calculateAssetValue`) so this stays a pure, Firestore-free unit,
 * importable by tests without mocking `@/lib/firebase/config`.
 */

import type { Asset } from '@/types/assets';
import { resolvePensionLockState, type PensionUnlockSettings } from '@/lib/utils/pensionUnlock';

/**
 * Sum the value of the pension funds LOCKED at `atDate`, per the single resolution in
 * `pensionUnlock.ts`. Funds that resolve to no unlock date are treated as NOT locked.
 */
export function calculatePensionLockedValue(
  assets: Asset[],
  atDate: Date,
  valueOf: (asset: Asset) => number,
  settings: PensionUnlockSettings = {}
): number {
  return resolvePensionLockState(assets, settings, atDate, valueOf).totalLockedToday;
}
