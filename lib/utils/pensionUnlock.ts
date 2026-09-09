/**
 * Pension unlock resolution — THE single source on "does this fund count as locked at date X?".
 *
 * Italian pension funds are not freely withdrawable: RITA (Rendita Integrativa Temporanea
 * Anticipata) lets a member start drawing the fund 5 years before the INPS retirement age, or
 * 10 years before when unemployed for 24+ months — which is the normal condition of someone who
 * FIREs. This module resolves each fund's unlock date with a fixed precedence:
 *
 *   1. `pensionFundDetails.unlockDate`, when parseable — the per-fund manual override.
 *   2. Otherwise, when `userAge` is known — the RITA rule: unlock in
 *      `max(0, ritaUnlockAge − userAge)` years from `now` (same day/month as `now`).
 *   3. Otherwise `null` — not modellable, the fund is treated as NOT locked (identical to the
 *      pre-Spec-3 behaviour) and the UI must say why.
 *
 * Pure and Firestore-free: `now` is always explicit (never `new Date()` internally) and asset
 * valuation is injected via `valueOf`, same pattern as `lib/utils/pensionFire.ts`.
 */

import type { Asset } from '@/types/assets';

export const DEFAULT_INPS_RETIREMENT_AGE = 67;

export interface PensionUnlockSettings {
  userAge?: number; // Already in settings (Coast FIRE)
  pensionInpsRetirementAge?: number; // Default 67
  pensionRitaLongUnemployment?: boolean; // true → RITA −10 instead of −5
}

export interface PensionFundLockInfo {
  fund: Asset;
  unlockDate: Date | null; // null = not modellable (no override, no userAge)
  value: number;
  isLocked: boolean;
}

export interface PensionCapitalInflow {
  yearsFromNow: number; // Whole years until the unlock (mid-year dates round UP: the full bridge year must be funded)
  amount: number; // Sum of the funds unlocking that year, at TODAY's value
}

export interface PensionLockState {
  funds: PensionFundLockInfo[];
  totalLockedToday: number;
  inflows: PensionCapitalInflow[]; // One entry per unlock year, ascending
}

/** RITA unlock age: INPS retirement age − 5, or − 10 with the long-unemployment hypothesis. */
export function resolveRitaUnlockAge(settings: PensionUnlockSettings): number {
  const inpsAge = settings.pensionInpsRetirementAge ?? DEFAULT_INPS_RETIREMENT_AGE;
  return inpsAge - (settings.pensionRitaLongUnemployment ? 10 : 5);
}

function addYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

/**
 * Resolve one fund's unlock date with the override > RITA rule > null precedence documented
 * in the module comment. Returns a NEW Date (never a shared reference to `now`).
 */
export function resolvePensionUnlockDate(
  fund: Asset,
  settings: PensionUnlockSettings,
  now: Date
): Date | null {
  const override = fund.pensionFundDetails?.unlockDate;
  if (override) {
    const parsed = new Date(override);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (settings.userAge !== undefined && Number.isFinite(settings.userAge)) {
    const yearsToUnlock = Math.max(0, resolveRitaUnlockAge(settings) - settings.userAge);
    return addYears(now, yearsToUnlock);
  }

  return null;
}

/**
 * Whole years from `now` until `unlock`, rounded UP on calendar fields: the smallest y such
 * that `now + y years >= unlock`. Calendar-based (not ms/365.2425) so a RITA-derived date at
 * exactly N years resolves to N in every timezone and across leap years.
 */
function wholeYearsUntil(now: Date, unlock: Date): number {
  const base = Math.max(0, unlock.getFullYear() - now.getFullYear());
  for (let years = Math.max(0, base - 1); ; years++) {
    if (addYears(now, years).getTime() >= unlock.getTime()) return years;
  }
}

/**
 * Resolve the lock state of every pension fund in `assets` at `now`.
 *
 * A fund is locked when its resolved unlock date is strictly in the future; a fund with a null
 * resolution counts as NOT locked (behaviour identical to today, declared by the UI). Locked
 * funds are also aggregated into one capital inflow per unlock year (ascending), at today's
 * value — growing them to the inflow year is the caller's model decision, not this module's.
 */
export function resolvePensionLockState(
  assets: Asset[],
  settings: PensionUnlockSettings,
  now: Date,
  valueOf: (asset: Asset) => number
): PensionLockState {
  const funds: PensionFundLockInfo[] = [];
  const inflowsByYear = new Map<number, number>();
  let totalLockedToday = 0;

  for (const asset of assets) {
    if (asset.type !== 'pensionFund') continue;

    const unlockDate = resolvePensionUnlockDate(asset, settings, now);
    const value = valueOf(asset);
    const isLocked = unlockDate !== null && unlockDate.getTime() > now.getTime();
    funds.push({ fund: asset, unlockDate, value, isLocked });

    if (isLocked) {
      totalLockedToday += value;
      const year = wholeYearsUntil(now, unlockDate);
      inflowsByYear.set(year, (inflowsByYear.get(year) ?? 0) + value);
    }
  }

  const inflows = Array.from(inflowsByYear.entries())
    .map(([yearsFromNow, amount]) => ({ yearsFromNow, amount }))
    .sort((left, right) => left.yearsFromNow - right.yearsFromNow);

  return { funds, totalLockedToday, inflows };
}
