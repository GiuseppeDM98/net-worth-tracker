/**
 * Tests for lib/constants/currencies.ts — the ONE currency rule (owner, 2026-11-23): pence are
 * pounds with the amount divided by 100, and a currency outside the listed thirteen is accepted only
 * as the instrument's own. Seen red (2026-11-25) with the instrument's-own branch dropped.
 */

import { describe, expect, it } from 'vitest';

import {
  INSTRUMENT_CURRENCIES,
  isCurrencyAllowed,
  isListedCurrency,
  normalizeCurrencyAmount,
} from '@/lib/constants/currencies';

describe('normalizeCurrencyAmount', () => {
  it('should turn pence into pounds, dividing the amount by 100', () => {
    expect(normalizeCurrencyAmount('GBp', 4874)).toEqual({ currency: 'GBP', amount: 48.74 });
  });

  it('should upper-case a code and leave its amount alone', () => {
    expect(normalizeCurrencyAmount('usd', 12)).toEqual({ currency: 'USD', amount: 12 });
  });
});

describe('isCurrencyAllowed', () => {
  it('should refuse an unlisted currency on its own', () => {
    expect(isCurrencyAllowed('NZD')).toBe(false);
  });

  it('should accept an unlisted currency when it is the instrument own one', () => {
    expect(isCurrencyAllowed('NZD', 'NZD')).toBe(true);
  });

  it('should accept pence as pounds', () => {
    expect(isCurrencyAllowed('GBp')).toBe(true);
  });
});

describe('INSTRUMENT_CURRENCIES', () => {
  it('should list thirteen codes, the euro first', () => {
    expect(INSTRUMENT_CURRENCIES).toHaveLength(13);
    expect(INSTRUMENT_CURRENCIES[0]).toBe('EUR');
    expect(isListedCurrency('USD')).toBe(true);
    expect(isListedCurrency('NZD')).toBe(false);
  });
});
