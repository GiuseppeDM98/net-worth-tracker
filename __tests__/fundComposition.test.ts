/**
 * `lib/utils/fundComposition.ts` — Yahoo's published mix turned into `Asset.composition`.
 *
 * The fixture is the real answer for `IT0005650905` (Eurizon Market Selection 20), read from
 * Yahoo on 2026-10-20: 19,25% azioni · 72,69% obbligazioni · 3,6% liquidità · 4,46% altro ·
 * 0,03% convertibili. It is the case this module exists for — the name says «20», the fund is
 * 73% bonds, and «Composizione» must show that.
 */
import { describe, expect, it } from 'vitest';
import type { InstrumentFundAllocation } from '@/types/exposure';
import {
  compositionFromFundAllocation,
  MIN_COMPOSITION_LEG_PCT,
  readFundComposition,
  resolveAllocationClass,
  usesPublishedFundMix,
} from '@/lib/utils/fundComposition';

const MARKET_SELECTION_20: InstrumentFundAllocation = {
  stock: 0.1925,
  bond: 0.72690004,
  cash: 0.036,
  other: 0.0446,
  preferred: 0,
  convertible: 0.00029999999,
};

function allocation(overrides: Partial<InstrumentFundAllocation> = {}): InstrumentFundAllocation {
  return { stock: 0, bond: 0, cash: 0, other: 0, preferred: 0, convertible: 0, ...overrides };
}

describe('compositionFromFundAllocation', () => {
  it('splits a hybrid fund largest-first and adds up to exactly 100', () => {
    const composition = compositionFromFundAllocation(MARKET_SELECTION_20, 'equity');
    expect(composition.map((leg) => leg.assetClass)).toEqual(['bonds', 'equity', 'cash']);
    expect(composition[0].percentage).toBe(72.7);
    expect(composition[1].percentage).toBe(23.7);
    expect(composition[2].percentage).toBe(3.6);
    expect(composition.reduce((sum, leg) => sum + leg.percentage, 0)).toBeCloseTo(100, 10);
  });

  it('gives the rounding drift to the largest leg, never to a leg at the floor', () => {
    const composition = compositionFromFundAllocation(
      allocation({ stock: 1 / 3, bond: 1 / 3, cash: 1 / 3 }),
      'equity'
    );
    expect(composition.reduce((sum, leg) => sum + leg.percentage, 0)).toBe(100);
    expect(composition[0].percentage).toBe(33.34);
    expect(composition[1].percentage).toBe(33.33);
    expect(composition[2].percentage).toBe(33.33);
  });

  it('maps preferred and convertibles to bonds and «other» to the asset’s own class', () => {
    const composition = compositionFromFundAllocation(
      allocation({ stock: 0.6, preferred: 0.1, convertible: 0.1, other: 0.2 }),
      'commodity'
    );
    expect(composition).toEqual([
      { assetClass: 'equity', percentage: 60 },
      { assetClass: 'bonds', percentage: 20 },
      { assetClass: 'commodity', percentage: 20 },
    ]);
  });

  it('drops a leg under the floor and renormalises the rest instead of leaving 99', () => {
    const composition = compositionFromFundAllocation(
      allocation({ stock: 0.6, bond: 0.395, cash: 0.005 }),
      'equity'
    );
    expect(composition).toEqual([
      { assetClass: 'equity', percentage: 60.5 },
      { assetClass: 'bonds', percentage: 39.5 },
    ]);
    expect(MIN_COMPOSITION_LEG_PCT).toBe(1);
  });

  it('returns no composition for a single-class fund, an empty answer or no answer', () => {
    expect(compositionFromFundAllocation(allocation({ stock: 1 }), 'equity')).toEqual([]);
    expect(compositionFromFundAllocation(allocation({ stock: 0.995, bond: 0.005 }), 'equity')).toEqual([]);
    expect(compositionFromFundAllocation(allocation(), 'equity')).toEqual([]);
    expect(compositionFromFundAllocation(null, 'equity')).toEqual([]);
    expect(compositionFromFundAllocation(undefined, 'equity')).toEqual([]);
  });

  it('never returns a leg with a non-positive percentage', () => {
    const composition = compositionFromFundAllocation(
      allocation({ stock: 0.5, bond: 0.3, cash: 0.2, preferred: 0 }),
      'equity'
    );
    for (const leg of composition) expect(leg.percentage).toBeGreaterThan(0);
  });
});

describe('resolveAllocationClass', () => {
  it('names the largest measured bucket', () => {
    expect(resolveAllocationClass(MARKET_SELECTION_20, 'equity')).toEqual({
      assetClass: 'bonds',
      measured: true,
    });
    expect(resolveAllocationClass(allocation({ stock: 1 }), 'bonds')).toEqual({
      assetClass: 'equity',
      measured: true,
    });
  });

  it('counts preferred and convertibles as bonds', () => {
    expect(resolveAllocationClass(allocation({ preferred: 0.7, convertible: 0.2, stock: 0.1 }), 'equity')).toEqual({
      assetClass: 'bonds',
      measured: true,
    });
  });

  it('never turns «other» into a measured class', () => {
    // The WisdomTree currency ETCs publish 100% other: no class is known, the fallback is a guess.
    expect(resolveAllocationClass(allocation({ other: 1 }), 'equity')).toEqual({
      assetClass: 'equity',
      measured: false,
    });
    expect(resolveAllocationClass(allocation({ other: 0.5, stock: 0.5 }), 'equity')).toEqual({
      assetClass: 'equity',
      measured: false,
    });
  });

  it('returns null without a mix, or for a mix with no weight at all', () => {
    expect(resolveAllocationClass(null, 'equity')).toBeNull();
    expect(resolveAllocationClass(undefined, 'equity')).toBeNull();
    expect(resolveAllocationClass(allocation(), 'equity')).toBeNull();
  });
});

describe('readFundComposition — the ONE rule every bridge stores', () => {
  it('stores the mix and makes its largest leg the asset class', () => {
    expect(readFundComposition(MARKET_SELECTION_20, 'equity')).toEqual({
      composition: [
        { assetClass: 'bonds', percentage: 72.7 },
        { assetClass: 'equity', percentage: 23.7 },
        { assetClass: 'cash', percentage: 3.6 },
      ],
      assetClass: 'bonds',
      measured: true,
    });
  });

  it('keeps the asset class the mix measured for a nearly single-class fund', () => {
    // No composition to store (one leg says it all), but the mix still names the class — the
    // reading every bridge needs when the broker's type is only a name-based guess.
    expect(readFundComposition(allocation({ stock: 0.9945, cash: 0.0055 }), 'bonds')).toEqual({
      composition: [],
      assetClass: 'equity',
      measured: true,
    });
  });

  it('falls back without a reading, and never presents «other» as a measured class', () => {
    expect(readFundComposition(null, 'equity')).toEqual({
      composition: [],
      assetClass: 'equity',
      measured: false,
    });
    expect(readFundComposition(allocation({ other: 1 }), 'equity')).toEqual({
      composition: [],
      assetClass: 'equity',
      measured: false,
    });
    // «other» outweighs the only measured bucket: the mix produces a composition
    // (the fund has structure), so `measured` is true — Yahoo DID place the instrument,
    // even though its class comes from the fallback. The uncertain-type warning is
    // suppressed because the market confirmed this is a fund/ETF.
    expect(readFundComposition(allocation({ stock: 0.2, other: 0.8 }), 'bonds')).toEqual({
      composition: [
        { assetClass: 'bonds', percentage: 80 },
        { assetClass: 'equity', percentage: 20 },
      ],
      assetClass: 'bonds',
      measured: true,
    });
  });
});

describe('usesPublishedFundMix', () => {
  it('reads a mix only for a collective wrapper or an ETC/ETN', () => {
    expect(usesPublishedFundMix('etf')).toBe(true);
    expect(usesPublishedFundMix('fund')).toBe(true);
    expect(usesPublishedFundMix('commodity')).toBe(true);
    expect(usesPublishedFundMix('stock')).toBe(false);
    expect(usesPublishedFundMix('bond')).toBe(false);
    expect(usesPublishedFundMix('crypto')).toBe(false);
    expect(usesPublishedFundMix('cash')).toBe(false);
  });
});
