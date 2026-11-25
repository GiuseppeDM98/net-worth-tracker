/**
 * Tests for lib/utils/dividendFx.ts — a dividend withheld twice (abroad on the gross, in Italy on the
 * «netto frontiera»), the foreign rate a new record proposes, and the euro side at the payment day's
 * ECB rate or from the euro actually credited.
 * Seen red (2026-11-25) by: the Italian tax on the gross; the ISIN branch dropped; the `equity` test
 * dropped; the withholding decided by the currency alone; the euro tax rounded on its own; the euro
 * gross converted at the ECB rate when the credit is typed.
 */

import { describe, expect, it } from 'vitest';

import {
  computeDividendTaxes,
  foreignRateOf,
  hasForeignWithholding,
  proposeForeignTaxRate,
  resolveDividendFx,
} from '@/lib/utils/dividendFx';
import { TradeFxError } from '@/lib/utils/tradeFx';

function errorOf(run: () => unknown): TradeFxError {
  try {
    run();
  } catch (error) {
    if (error instanceof TradeFxError) return error;
    throw error;
  }
  throw new Error('expected a TradeFxError');
}

describe('computeDividendTaxes (U1)', () => {
  it('should levy the Italian tax on the gross less the foreign withholding', () => {
    const taxes = computeDividendTaxes(100, 15, 26);

    expect(taxes.foreignTaxAmount).toBeCloseTo(15, 12);
    expect(taxes.italianTaxAmount).toBeCloseTo(22.1, 12);
    expect(taxes.taxAmount).toBeCloseTo(37.1, 12);
    expect(taxes.netAmount).toBeCloseTo(62.9, 12);
  });
});

describe('the foreign rate proposed and the two withholdings (U2)', () => {
  it('should propose the instrument’s last foreign rate first', () => {
    expect(proposeForeignTaxRate('US0000000001', 'equity', 10)).toBe(10);
  });

  it('should propose the US treaty rate for a US share and nothing for a US bond or an Irish ETF', () => {
    expect(proposeForeignTaxRate('US0000000001', 'equity', undefined)).toBe(15);
    expect(proposeForeignTaxRate('US0000000002', 'bonds', undefined)).toBe(0);
    expect(proposeForeignTaxRate('IE0000000003', 'equity', undefined)).toBe(0);
  });

  it('should read no foreign rate off a record without a foreign part', () => {
    expect(foreignRateOf({ grossAmount: 100 })).toBeUndefined();
    expect(foreignRateOf({ grossAmount: 100, foreignTaxAmount: 15 })).toBeCloseTo(15, 12);
  });

  it('should follow the issuer’s ISIN, and the currency only when there is no ISIN', () => {
    expect(hasForeignWithholding('DE0000000004', 'EUR')).toBe(true);
    expect(hasForeignWithholding('IT0000000005', 'USD')).toBe(false);
    expect(hasForeignWithholding(undefined, 'USD')).toBe(true);
    expect(hasForeignWithholding(undefined, 'EUR')).toBe(false);
  });
});

describe('resolveDividendFx — the ECB rate (U3)', () => {
  it('should convert at the ECB rate and take the euro tax as the difference', () => {
    const result = resolveDividendFx({
      grossAmount: 100, netAmount: 62.9, foreignTaxAmount: 15, ecb: { rate: 0.9, isLatest: false },
    });

    expect(result.grossAmountEur).toBe(90);
    expect(result.netAmountEur).toBe(56.61);
    expect(result.taxAmountEur).toBe(33.39);
    expect(result.foreignTaxAmountEur).toBe(13.5);
    expect(result.exchangeRate).toBe(0.9);
    expect(result.fxSource).toBe('ecb');
  });

  it('should mark the latest rate as such', () => {
    const result = resolveDividendFx({
      grossAmount: 100, netAmount: 62.9, foreignTaxAmount: 15, ecb: { rate: 0.9, isLatest: true },
    });

    expect(result.fxSource).toBe('ecb-latest');
  });

  it('should make gross − tax = net in euro, even where the tax rounded alone would differ', () => {
    const taxes = computeDividendTaxes(1.07, 15, 26);
    const result = resolveDividendFx({
      grossAmount: 1.07, netAmount: taxes.netAmount, foreignTaxAmount: taxes.foreignTaxAmount,
      ecb: { rate: 0.9, isLatest: false },
    });

    // Rounded on its own the euro tax would be 0,36.
    expect(result.taxAmountEur).toBe(0.35);
    expect(result.grossAmountEur - result.netAmountEur).toBeCloseTo(result.taxAmountEur, 12);
  });

  it('should refuse to convert with no rate at all', () => {
    expect(errorOf(() => resolveDividendFx({ grossAmount: 100, netAmount: 62.9, foreignTaxAmount: 15, ecb: null })).code)
      .toBe('no-rate');
  });
});

describe('resolveDividendFx — the euro credited (U4)', () => {
  it('should take the credit as the euro net and derive the rate from it', () => {
    const result = resolveDividendFx({
      grossAmount: 100, netAmount: 62.9, foreignTaxAmount: 15, settledNetEur: 57,
      ecb: { rate: 0.9, isLatest: false },
    });

    expect(result.exchangeRate).toBeCloseTo(57 / 62.9, 12);
    expect(result.netAmountEur).toBe(57);
    expect(result.grossAmountEur).toBe(90.62);
    expect(result.fxSource).toBe('statement');
  });

  it('should refuse a credit 30% off the day’s rate, carrying that rate', () => {
    const error = errorOf(() => resolveDividendFx({
      grossAmount: 100, netAmount: 62.9, foreignTaxAmount: 15, settledNetEur: 62.9 * 0.9 * 1.3,
      ecb: { rate: 0.9, isLatest: false },
    }));

    expect(error.code).toBe('total-off');
    expect(error.ecbRate).toBe(0.9);
  });

  it('should refuse a credit on a net of zero', () => {
    expect(errorOf(() => resolveDividendFx({
      grossAmount: 0, netAmount: 0, foreignTaxAmount: 0, settledNetEur: 10, ecb: null,
    })).code).toBe('nothing-to-convert');
  });
});
