/**
 * Tests for lib/utils/assetPricing.ts — the single source of truth for "does this asset have
 * a market price?", shared by the price-update cron, AssetDialog and Patrimonio's
 * manual-price row tint.
 *
 * The regression these lock down: `pensionFund` used to be known only to AssetDialog's local
 * copy of the rule, so a pension fund was queued for a Yahoo quote and never tinted as a
 * manually valued asset in the portfolio table.
 */
import { describe, it, expect } from 'vitest';
import { hasMarketPrice, requiresManualPricing } from '@/lib/utils/assetPricing';
import type { AssetType } from '@/types/assets';

const MARKET_TRADED_TYPES: AssetType[] = ['stock', 'etf', 'bond', 'crypto', 'commodity'];
const MANUALLY_VALUED_TYPES: AssetType[] = ['cash', 'realestate', 'pensionFund', 'loan'];

describe('hasMarketPrice', () => {
  it.each(MARKET_TRADED_TYPES)('is true for the market-traded type %s', (type) => {
    expect(hasMarketPrice(type)).toBe(true);
  });

  it.each(MANUALLY_VALUED_TYPES)('is false for the manually valued type %s', (type) => {
    expect(hasMarketPrice(type)).toBe(false);
  });

  it('is false for a Private Equity position despite an otherwise tradable type', () => {
    expect(hasMarketPrice('stock', 'Private Equity')).toBe(false);
  });

  it('stays true for other sub-categories of a tradable type', () => {
    expect(hasMarketPrice('etf', 'Azionario Globale')).toBe(true);
  });
});

describe('requiresManualPricing', () => {
  it('is true for a pension fund even when autoUpdatePrice was persisted as true', () => {
    // Regression: pre-fix, pension funds were saved with the form's `true` default and the
    // portfolio table read only that flag, so the row never got the manual-price tint.
    expect(requiresManualPricing({ type: 'pensionFund', autoUpdatePrice: true })).toBe(true);
  });

  it('is true when the user explicitly disabled auto-updates on a tradable asset', () => {
    expect(requiresManualPricing({ type: 'stock', autoUpdatePrice: false })).toBe(true);
  });

  it('is false for a tradable asset with auto-updates on', () => {
    expect(requiresManualPricing({ type: 'etf', autoUpdatePrice: true })).toBe(false);
  });

  it('treats an undefined autoUpdatePrice as opted-in (backwards compatibility)', () => {
    expect(requiresManualPricing({ type: 'etf' })).toBe(false);
    expect(requiresManualPricing({ type: 'realestate' })).toBe(true);
  });

  it('is true for a Private Equity position', () => {
    expect(requiresManualPricing({ type: 'stock', subCategory: 'Private Equity' })).toBe(true);
  });
});
