/**
 * Tests for lib/utils/saleTax.ts — the estimate of a sale's capital-gains tax and what the sale
 * form sends for «Tasse trattenute».
 */

import { describe, expect, it } from 'vitest';

import { estimateSaleTax, prefillWithheldTax, resolveWithheldTaxToSend } from '@/lib/utils/saleTax';

describe('estimateSaleTax', () => {
  it('should apply the rate to the taxable gain, unrounded', () => {
    // The owner's statement, settembre 2026: taxed on 15.740,38 € (no commission on either side).
    expect(estimateSaleTax(15740.38, 26)).toBeCloseTo(4092.4988, 4);
  });

  it('should charge nothing on a loss and return null — never zero — without a rate', () => {
    expect(estimateSaleTax(-500, 26)).toBe(0);
    expect(estimateSaleTax(500, undefined)).toBeNull();
    expect(estimateSaleTax(500, null)).toBeNull();
  });
});

describe('prefillWithheldTax', () => {
  it('should prefill the estimate to the cent', () => {
    expect(prefillWithheldTax(15740.38, 26)).toBe(4092.5);
  });

  it('should prefill 0 on a loss: no tax is a known fact', () => {
    expect(prefillWithheldTax(-120, 26)).toBe(0);
  });

  it('should leave the field empty when the gain or the rate is unknown', () => {
    expect(prefillWithheldTax(null, 26)).toBeUndefined();
    expect(prefillWithheldTax(500, undefined)).toBeUndefined();
  });
});

describe('resolveWithheldTaxToSend', () => {
  it('should send the typed figure to the cent, 0 included', () => {
    expect(resolveWithheldTaxToSend({ fieldValue: 4092.5, storedTax: undefined })).toBe(4092.5);
    expect(resolveWithheldTaxToSend({ fieldValue: 10.005, storedTax: undefined })).toBe(10.01);
    expect(resolveWithheldTaxToSend({ fieldValue: 0, storedTax: 50 })).toBe(0);
  });

  it('should send nothing for an empty field on a sale that stores no tax', () => {
    expect(resolveWithheldTaxToSend({ fieldValue: undefined, storedTax: undefined })).toBeUndefined();
    expect(resolveWithheldTaxToSend({ fieldValue: NaN, storedTax: undefined })).toBeUndefined();
  });

  it('should send 0 for a field emptied on a sale that stored a tax, since an absent key keeps the old value', () => {
    expect(resolveWithheldTaxToSend({ fieldValue: NaN, storedTax: 4092.5 })).toBe(0);
  });
});
