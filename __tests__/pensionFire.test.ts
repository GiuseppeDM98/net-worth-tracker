import { describe, it, expect } from 'vitest';
import { calculatePensionLockedValue } from '@/lib/utils/pensionFire';
import type { Asset } from '@/types/assets';

function makeAsset(overrides: Partial<Asset> & { id: string; type: Asset['type'] }): Asset {
  return {
    userId: 'user-1',
    ticker: '',
    name: 'Asset',
    assetClass: 'equity',
    currency: 'EUR',
    quantity: 1,
    currentPrice: 100,
    lastPriceUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Asset;
}

const NOW = new Date(2026, 6, 1);
const valueOf = (asset: Asset) => asset.quantity * asset.currentPrice;

describe('calculatePensionLockedValue', () => {
  it('sums funds whose unlockDate is strictly in the future', () => {
    const assets = [
      makeAsset({
        id: 'p1',
        type: 'pensionFund',
        quantity: 10000,
        currentPrice: 1,
        pensionFundDetails: { provider: 'Fondo X', unlockDate: '2040-01-01' },
      }),
    ];

    expect(calculatePensionLockedValue(assets, NOW, valueOf)).toBe(10000);
  });

  it('excludes a fund whose unlockDate has already passed', () => {
    const assets = [
      makeAsset({
        id: 'p1',
        type: 'pensionFund',
        quantity: 10000,
        currentPrice: 1,
        pensionFundDetails: { provider: 'Fondo X', unlockDate: '2020-01-01' },
      }),
    ];

    expect(calculatePensionLockedValue(assets, NOW, valueOf)).toBe(0);
  });

  it('excludes a fund with no unlockDate declared', () => {
    const assets = [
      makeAsset({
        id: 'p1',
        type: 'pensionFund',
        quantity: 10000,
        currentPrice: 1,
        pensionFundDetails: { provider: 'Fondo X' },
      }),
    ];

    expect(calculatePensionLockedValue(assets, NOW, valueOf)).toBe(0);
  });

  it('excludes a fund with an unparseable unlockDate', () => {
    const assets = [
      makeAsset({
        id: 'p1',
        type: 'pensionFund',
        quantity: 10000,
        currentPrice: 1,
        pensionFundDetails: { provider: 'Fondo X', unlockDate: 'not-a-date' },
      }),
    ];

    expect(calculatePensionLockedValue(assets, NOW, valueOf)).toBe(0);
  });

  it('ignores non-pensionFund assets entirely', () => {
    const assets = [
      makeAsset({ id: 'etf-1', type: 'etf', quantity: 10, currentPrice: 100 }),
    ];

    expect(calculatePensionLockedValue(assets, NOW, valueOf)).toBe(0);
  });

  it('sums multiple locked funds and skips one already unlocked', () => {
    const assets = [
      makeAsset({
        id: 'p1',
        type: 'pensionFund',
        quantity: 5000,
        currentPrice: 1,
        pensionFundDetails: { provider: 'Fondo A', unlockDate: '2040-01-01' },
      }),
      makeAsset({
        id: 'p2',
        type: 'pensionFund',
        quantity: 3000,
        currentPrice: 1,
        pensionFundDetails: { provider: 'Fondo B', unlockDate: '2045-01-01' },
      }),
      makeAsset({
        id: 'p3',
        type: 'pensionFund',
        quantity: 2000,
        currentPrice: 1,
        pensionFundDetails: { provider: 'Fondo C', unlockDate: '2020-01-01' },
      }),
    ];

    expect(calculatePensionLockedValue(assets, NOW, valueOf)).toBe(8000);
  });

  it('treats unlockDate exactly equal to atDate as unlocked (strict inequality)', () => {
    const assets = [
      makeAsset({
        id: 'p1',
        type: 'pensionFund',
        quantity: 10000,
        currentPrice: 1,
        pensionFundDetails: { provider: 'Fondo X', unlockDate: '2026-07-01' },
      }),
    ];
    // Same instant the unlockDate string parses to, so this is TZ-independent.
    const exactUnlockInstant = new Date('2026-07-01');

    expect(calculatePensionLockedValue(assets, exactUnlockInstant, valueOf)).toBe(0);
  });
});
