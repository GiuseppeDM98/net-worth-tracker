import { describe, it, expect } from 'vitest';
import {
  DEFAULT_INPS_RETIREMENT_AGE,
  resolveRitaUnlockAge,
  resolvePensionUnlockDate,
  resolvePensionLockState,
} from '@/lib/utils/pensionUnlock';
import { calculatePensionLockedValue } from '@/lib/utils/pensionFire';
import type { Asset } from '@/types/assets';

function makeFund(overrides: Partial<Asset> & { id: string }): Asset {
  return {
    userId: 'user-1',
    ticker: '',
    name: 'Fondo',
    type: 'pensionFund',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 10000,
    currentPrice: 1,
    lastPriceUpdate: new Date(2026, 0, 1, 12),
    createdAt: new Date(2026, 0, 1, 12),
    updatedAt: new Date(2026, 0, 1, 12),
    ...overrides,
  } as Asset;
}

// Noon keeps the fixture clear of DST edges, matching the repo convention.
const NOW = new Date(2026, 7, 17, 12);
const valueOf = (asset: Asset) => asset.quantity * asset.currentPrice;

describe('resolveRitaUnlockAge', () => {
  it('defaults to INPS 67 − 5 = 62 with empty settings', () => {
    expect(resolveRitaUnlockAge({})).toBe(DEFAULT_INPS_RETIREMENT_AGE - 5);
  });

  it('uses the configured INPS age', () => {
    expect(resolveRitaUnlockAge({ pensionInpsRetirementAge: 70 })).toBe(65);
  });

  it('subtracts 10 instead of 5 with the long-unemployment hypothesis', () => {
    expect(resolveRitaUnlockAge({ pensionRitaLongUnemployment: true })).toBe(57);
    expect(
      resolveRitaUnlockAge({ pensionInpsRetirementAge: 68, pensionRitaLongUnemployment: true })
    ).toBe(58);
  });
});

describe('resolvePensionUnlockDate — precedence', () => {
  it('a parseable per-fund unlockDate override wins over the RITA rule', () => {
    const fund = makeFund({
      id: 'p1',
      pensionFundDetails: { provider: 'X', unlockDate: '2050-03-15' },
    });
    const resolved = resolvePensionUnlockDate(fund, { userAge: 41 }, NOW);
    expect(resolved?.getFullYear()).toBe(2050);
    expect(resolved?.getMonth()).toBe(2);
  });

  it('falls back to the RITA rule when there is no override and userAge is known', () => {
    // Age 41, unlock at 67 − 10 = 57 → 16 years from NOW, same day/month.
    const fund = makeFund({ id: 'p1', pensionFundDetails: { provider: 'X' } });
    const resolved = resolvePensionUnlockDate(
      fund,
      { userAge: 41, pensionRitaLongUnemployment: true },
      NOW
    );
    expect(resolved).not.toBeNull();
    expect(resolved!.getFullYear()).toBe(2042);
    expect(resolved!.getMonth()).toBe(NOW.getMonth());
    expect(resolved!.getDate()).toBe(NOW.getDate());
  });

  it('an unparseable override also falls back to the RITA rule', () => {
    const fund = makeFund({
      id: 'p1',
      pensionFundDetails: { provider: 'X', unlockDate: 'not-a-date' },
    });
    const resolved = resolvePensionUnlockDate(fund, { userAge: 41 }, NOW);
    expect(resolved?.getFullYear()).toBe(2026 + (62 - 41));
  });

  it('returns null when there is no override and no userAge (not modellable)', () => {
    const fund = makeFund({ id: 'p1', pensionFundDetails: { provider: 'X' } });
    expect(resolvePensionUnlockDate(fund, {}, NOW)).toBeNull();
  });

  it('userAge at or above the RITA threshold resolves to NOW (unlocked immediately)', () => {
    const fund = makeFund({ id: 'p1', pensionFundDetails: { provider: 'X' } });
    const resolved = resolvePensionUnlockDate(fund, { userAge: 65 }, NOW);
    expect(resolved?.getTime()).toBe(NOW.getTime());
  });
});

describe('resolvePensionLockState', () => {
  it('marks a fund with a future resolved date as locked and sums it', () => {
    const assets = [
      makeFund({ id: 'p1', quantity: 30000, pensionFundDetails: { provider: 'X' } }),
      makeFund({ id: 'etf', type: 'etf', quantity: 10, currentPrice: 100 }),
    ];
    const state = resolvePensionLockState(assets, { userAge: 41 }, NOW, valueOf);
    expect(state.funds).toHaveLength(1);
    expect(state.funds[0].isLocked).toBe(true);
    expect(state.totalLockedToday).toBe(30000);
  });

  it('treats a fund with no override and no userAge as NOT locked (same as today)', () => {
    const assets = [makeFund({ id: 'p1', pensionFundDetails: { provider: 'X' } })];
    const state = resolvePensionLockState(assets, {}, NOW, valueOf);
    expect(state.funds[0].isLocked).toBe(false);
    expect(state.funds[0].unlockDate).toBeNull();
    expect(state.totalLockedToday).toBe(0);
    expect(state.inflows).toEqual([]);
  });

  it('treats a fund whose resolved unlock is now or past as unlocked', () => {
    const assets = [
      makeFund({ id: 'p1', pensionFundDetails: { provider: 'X', unlockDate: '2020-01-01' } }),
      makeFund({ id: 'p2', pensionFundDetails: { provider: 'Y' } }),
    ];
    const state = resolvePensionLockState(assets, { userAge: 70 }, NOW, valueOf);
    expect(state.totalLockedToday).toBe(0);
    expect(state.inflows).toEqual([]);
  });

  it('aggregates inflows by unlock year, in ascending order', () => {
    // p1 + p2 share the RITA year (62 − 41 = 21 years out); p3 has an override 5 years out.
    const assets = [
      makeFund({ id: 'p1', quantity: 10000, pensionFundDetails: { provider: 'X' } }),
      makeFund({ id: 'p2', quantity: 5000, pensionFundDetails: { provider: 'Y' } }),
      makeFund({
        id: 'p3',
        quantity: 2000,
        pensionFundDetails: { provider: 'Z', unlockDate: '2031-08-17' },
      }),
    ];
    const state = resolvePensionLockState(assets, { userAge: 41 }, NOW, valueOf);
    expect(state.totalLockedToday).toBe(17000);
    expect(state.inflows).toEqual([
      { yearsFromNow: 5, amount: 2000 },
      { yearsFromNow: 21, amount: 15000 },
    ]);
  });

  it('rounds a mid-year override up to the next whole year (funds the full bridge year)', () => {
    const assets = [
      makeFund({
        id: 'p1',
        quantity: 1000,
        pensionFundDetails: { provider: 'X', unlockDate: '2028-01-10' },
      }),
    ];
    // 2028-01-10 is between +1y and +2y from 2026-08-17 → 2 whole years to be unlocked.
    const state = resolvePensionLockState(assets, {}, NOW, valueOf);
    expect(state.inflows).toEqual([{ yearsFromNow: 2, amount: 1000 }]);
  });
});

describe('calculatePensionLockedValue — legacy wrapper regression', () => {
  it('keeps the override-only behaviour when no settings are given', () => {
    const assets = [
      makeFund({
        id: 'p1',
        quantity: 9000,
        pensionFundDetails: { provider: 'X', unlockDate: '2040-01-01' },
      }),
      makeFund({ id: 'p2', quantity: 3000, pensionFundDetails: { provider: 'Y' } }),
    ];
    expect(calculatePensionLockedValue(assets, NOW, valueOf)).toBe(9000);
  });

  it('applies the RITA rule when settings carry a userAge', () => {
    const assets = [makeFund({ id: 'p1', quantity: 3000, pensionFundDetails: { provider: 'Y' } })];
    expect(calculatePensionLockedValue(assets, NOW, valueOf, { userAge: 41 })).toBe(3000);
  });
});
