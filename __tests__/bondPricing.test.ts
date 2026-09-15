/**
 * bondPricing.ts — the ONE rule turning a Borsa Italiana quote into euro per unit (issue #340).
 *
 * The characterisation that used to live in assetDialogHelpers.test.ts pinned the OLD behaviour
 * («rawPrice unchanged when nominalValue is undefined») as correct: with the nominal empty a 93 %
 * quote was stored as 93 € per unit, and no quantity could make that right. These tests import the
 * real module, so a divergence between the dialog, the ledger form and the price cron is no longer
 * possible — they all call the same function.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BOND_NOMINAL_VALUE,
  effectiveBondNominal,
  effectiveIndexationCoefficient,
  isBondQuotedInPercent,
  resolveBondPrice,
  toBorsaItalianaQuote,
} from '@/lib/utils/bondPricing';

describe('isBondQuotedInPercent', () => {
  it('is true for a bond in the bonds class with an ISIN', () => {
    expect(isBondQuotedInPercent({ type: 'bond', assetClass: 'bonds', isin: 'IT0005696338' })).toBe(true);
  });

  it('is false without an ISIN (a bond priced by hand, in euro)', () => {
    expect(isBondQuotedInPercent({ type: 'bond', assetClass: 'bonds' })).toBe(false);
    expect(isBondQuotedInPercent({ type: 'bond', assetClass: 'bonds', isin: '   ' })).toBe(false);
  });

  it('is false for a bond ETF, which is quoted in euro per share', () => {
    expect(isBondQuotedInPercent({ type: 'etf', assetClass: 'bonds', isin: 'IE00B0M62X26' })).toBe(false);
  });
});

describe('effectiveBondNominal / effectiveIndexationCoefficient', () => {
  it('defaults the nominal to 1 € per unit', () => {
    expect(DEFAULT_BOND_NOMINAL_VALUE).toBe(1);
    expect(effectiveBondNominal(undefined)).toBe(1);
    expect(effectiveBondNominal(NaN)).toBe(1);
    expect(effectiveBondNominal(0)).toBe(1);
    expect(effectiveBondNominal(1000)).toBe(1000);
  });

  it('defaults the coefficient to 1', () => {
    expect(effectiveIndexationCoefficient(undefined)).toBe(1);
    expect(effectiveIndexationCoefficient(NaN)).toBe(1);
    expect(effectiveIndexationCoefficient(0)).toBe(1);
    expect(effectiveIndexationCoefficient(1.25)).toBe(1.25);
  });
});

describe('resolveBondPrice', () => {
  it('applies the % of par conversion with an explicit nominal (the owner’s BTP Valore: 1000 € lots)', () => {
    // 104.2% of par with nominalValue=1000 → 1042€
    expect(resolveBondPrice(104.2, { nominalValue: 1000 }, true)).toBeCloseTo(1042);
    expect(resolveBondPrice(100, { nominalValue: 1000 }, true)).toBe(1000);
    expect(resolveBondPrice(95, { nominalValue: 1000 }, true)).toBe(950);
  });

  it('converts the quote even with the nominal EMPTY — one unit is 1 € of nominal (issue #340)', () => {
    // The reporter’s case: quantity 1000 (= 1.000 € nominal), Borsa Italiana at 93 → 0,93 € per unit,
    // so the position is worth 930 €, not 93.000 €.
    expect(resolveBondPrice(93, {}, true)).toBeCloseTo(0.93);
    expect(resolveBondPrice(93, { nominalValue: undefined }, true) * 1000).toBeCloseTo(930);
  });

  it('treats an explicit nominal of 1 exactly like an empty one', () => {
    expect(resolveBondPrice(104.2, { nominalValue: 1 }, true)).toBeCloseTo(1.042);
  });

  it('handles nominalValue=100 (BTP Valore mini lots)', () => {
    expect(resolveBondPrice(102.5, { nominalValue: 100 }, true)).toBeCloseTo(102.5);
  });

  it('multiplies a BTP€i quote by its indexation coefficient (the quote is real, the euro is not)', () => {
    // 97.38 real, nominal 1 €, coefficient 1.25 → 1,21725 € per unit
    expect(resolveBondPrice(97.38, { indexationCoefficient: 1.25 }, true)).toBeCloseTo(1.21725, 8);
    expect(resolveBondPrice(97.38, { nominalValue: 1000, indexationCoefficient: 1.25 }, true)).toBeCloseTo(1217.25, 8);
  });

  it('returns the raw price unchanged when the asset is not a bond quoted in percent', () => {
    expect(resolveBondPrice(150, { nominalValue: 1000 }, false)).toBe(150);
    expect(resolveBondPrice(150, { indexationCoefficient: 1.25 }, false)).toBe(150);
  });
});

describe('toBorsaItalianaQuote', () => {
  it('is the inverse of resolveBondPrice on the same basis', () => {
    for (const basis of [{}, { nominalValue: 1000 }, { nominalValue: 100 }, { nominalValue: 1, indexationCoefficient: 1.23456 }]) {
      const eur = resolveBondPrice(97.4843, basis, true);
      expect(toBorsaItalianaQuote(eur, basis)).toBeCloseTo(97.4843, 8);
    }
  });

  it('shows the owner’s stored 967,4843 € per lot as 96,74843 on the exchange', () => {
    expect(toBorsaItalianaQuote(967.4843, { nominalValue: 1000 })).toBeCloseTo(96.74843, 8);
  });
});
