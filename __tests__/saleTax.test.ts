/**
 * Tests for lib/utils/saleTax.ts — the estimate of a sale's capital-gains tax, the per-euro rule every
 * PROPOSED sale reads (a plan's legs, «Con vendite mirate»), and what the sale form sends for «Tasse
 * trattenute».
 */

import { describe, expect, it } from 'vitest';

import type { AllocatableHolding } from '@/lib/utils/allocationUtils';
import {
  candidateSaleTaxPerEuro,
  estimateSaleTax,
  prefillWithheldTax,
  resolveWithheldTaxToSend,
  saleTaxPerEuro,
} from '@/lib/utils/saleTax';

const holding = (overrides: Partial<AllocatableHolding>): AllocatableHolding => ({
  id: 'h',
  label: 'Holding',
  assetClass: 'equity',
  value: 10000,
  tradable: true,
  taxableOnSale: true,
  ...overrides,
});

describe('saleTaxPerEuro', () => {
  it('should exempt a holding that cannot be taxed on sale (an account, a pension fund)', () => {
    expect(saleTaxPerEuro(holding({ taxableOnSale: false, costBasisEur: 2000, taxRate: 26 }))).toEqual({ kind: 'exempt' });
  });

  it('should be unknown — never zero — without a EUR cost basis or without a rate', () => {
    expect(saleTaxPerEuro(holding({ taxRate: 26 }))).toEqual({ kind: 'unknown', reason: 'cost-basis' });
    expect(saleTaxPerEuro(holding({ costBasisEur: 8000 }))).toEqual({ kind: 'unknown', reason: 'rate' });
  });

  it('should tax the gain share of each euro at the rate: 10.000 € on a basis of 8.000 € at 26% → 0,052', () => {
    const tax = saleTaxPerEuro(holding({ value: 10000, costBasisEur: 8000, taxRate: 26 }));
    expect(tax.kind).toBe('taxed');
    expect(tax.kind === 'taxed' && tax.perEuro).toBeCloseTo(0.052, 12);
  });

  it('should charge nothing on a position at a loss, and never a negative rate', () => {
    expect(saleTaxPerEuro(holding({ value: 10000, costBasisEur: 12000, taxRate: 26 }))).toEqual({ kind: 'taxed', perEuro: 0 });
  });
});

describe('candidateSaleTaxPerEuro', () => {
  it("should price a composite buyer's two sleeves at its one rate", () => {
    const sleeves = [
      holding({ id: 'buyer#0', assetId: 'buyer', value: 6000, costBasisEur: 4800, taxRate: 26 }),
      holding({ id: 'buyer#1', assetId: 'buyer', assetClass: 'bonds', value: 4000, costBasisEur: 3200, taxRate: 26 }),
    ];
    const tax = candidateSaleTaxPerEuro('buyer', sleeves);
    expect(tax.kind === 'taxed' && tax.perEuro).toBeCloseTo(0.052, 12);
  });

  it("should read only the buyer: another member's unknown basis neither locks nor raises it", () => {
    const holdings = [
      holding({ id: 'buyer', value: 10000, costBasisEur: 8000, taxRate: 26 }),
      holding({ id: 'member', value: 10000, taxRate: 26 }),
    ];
    const tax = candidateSaleTaxPerEuro('buyer', holdings);
    expect(tax.kind === 'taxed' && tax.perEuro).toBeCloseTo(0.052, 12);
  });

  it("should be unknown when the buyer's own basis is", () => {
    expect(candidateSaleTaxPerEuro('buyer', [holding({ id: 'buyer', taxRate: 26 })])).toEqual({
      kind: 'unknown',
      reason: 'cost-basis',
    });
  });

  it('should be exempt when the buyer has no holding (the liquidity, a candidate held at zero)', () => {
    expect(candidateSaleTaxPerEuro('buyer', [holding({ id: 'other', costBasisEur: 8000, taxRate: 26 })])).toEqual({ kind: 'exempt' });
  });
});

describe('estimateSaleTax', () => {
  it('should apply the rate to the taxable gain, unrounded', () => {
    expect(estimateSaleTax(1000, 26)).toBe(260);
    expect(estimateSaleTax(1000.01, 26)).toBeCloseTo(260.0026, 4);
  });

  it('should charge nothing on a loss and return null — never zero — without a rate', () => {
    expect(estimateSaleTax(-500, 26)).toBe(0);
    expect(estimateSaleTax(500, undefined)).toBeNull();
    expect(estimateSaleTax(500, null)).toBeNull();
  });
});

describe('prefillWithheldTax', () => {
  it('should prefill the estimate to the cent', () => {
    expect(prefillWithheldTax(1000.01, 26)).toBe(260);
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
    expect(resolveWithheldTaxToSend({ fieldValue: 260, storedTax: undefined })).toBe(260);
    expect(resolveWithheldTaxToSend({ fieldValue: 10.005, storedTax: undefined })).toBe(10.01);
    expect(resolveWithheldTaxToSend({ fieldValue: 0, storedTax: 50 })).toBe(0);
  });

  it('should send nothing for an empty field on a sale that stores no tax', () => {
    expect(resolveWithheldTaxToSend({ fieldValue: undefined, storedTax: undefined })).toBeUndefined();
    expect(resolveWithheldTaxToSend({ fieldValue: NaN, storedTax: undefined })).toBeUndefined();
  });

  it('should send 0 for a field emptied on a sale that stored a tax, since an absent key keeps the old value', () => {
    expect(resolveWithheldTaxToSend({ fieldValue: NaN, storedTax: 260 })).toBe(0);
  });
});
