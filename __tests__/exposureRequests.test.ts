/**
 * Tests for lib/utils/exposureRequests.ts — who enters the Esposizione and what is asked of Yahoo.
 * Pure, SDK-free (the route imports it): no mock needed.
 */
import { describe, expect, it } from 'vitest';
import type { Asset } from '@/types/assets';
import {
  isExposureBaseAsset,
  isQuotedInstrument,
  profileModuleFor,
  profileRequestsSignature,
  selectProfileRequests,
} from '@/lib/utils/exposureRequests';

function asset(overrides: Partial<Asset> & { id: string }): Asset {
  return { userId: 'u', name: overrides.id, ticker: overrides.id.toUpperCase(), type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 1, currentPrice: 1, ...overrides } as Asset;
}

describe('the base', () => {
  it('is held and not excluded; the legacy flag still excludes', () => {
    expect(isExposureBaseAsset(asset({ id: 'a' }))).toBe(true);
    expect(isExposureBaseAsset(asset({ id: 'a', allocationRole: 'frozen' }))).toBe(true);
    expect(isExposureBaseAsset(asset({ id: 'a', allocationRole: 'excluded' }))).toBe(false);
    expect(isExposureBaseAsset(asset({ id: 'a', excludeFromAllocation: true }))).toBe(false);
    expect(isExposureBaseAsset(asset({ id: 'a', quantity: 0 }))).toBe(false);
  });
});

describe('a quoted instrument', () => {
  it('has a market price AND a non-empty ticker', () => {
    expect(isQuotedInstrument(asset({ id: 'a' }))).toBe(true);
    expect(isQuotedInstrument(asset({ id: 'a', ticker: '  ' }))).toBe(false);
    expect(isQuotedInstrument(asset({ id: 'a', type: 'pensionFund' }))).toBe(false);
    expect(isQuotedInstrument(asset({ id: 'a', type: 'cash' }))).toBe(false);
    expect(isQuotedInstrument(asset({ id: 'a', type: 'realestate' }))).toBe(false);
    expect(isQuotedInstrument(asset({ id: 'a', type: 'stock', subCategory: 'Private Equity' }))).toBe(false);
    expect(isQuotedInstrument(asset({ id: 'a', type: 'bond' }))).toBe(true);
    expect(isQuotedInstrument(asset({ id: 'a', type: 'crypto' }))).toBe(true);
  });
});

describe('the module per type', () => {
  it('asks fund for an ETF and an ETC, stock for a stock, nothing for the rest', () => {
    expect(profileModuleFor('etf')).toBe('fund');
    expect(profileModuleFor('commodity')).toBe('fund');
    expect(profileModuleFor('stock')).toBe('stock');
    expect(profileModuleFor('bond')).toBeNull();
    expect(profileModuleFor('crypto')).toBeNull();
    expect(profileModuleFor('pensionFund')).toBeNull();
  });
});

describe('selectProfileRequests', () => {
  it('lists the quoted base tickers with their module, unique, trimmed and sorted', () => {
    const requests = selectProfileRequests([
      asset({ id: 'vwce', ticker: ' VWCE.DE ' }),
      asset({ id: 'vwce-twice', ticker: 'VWCE.DE' }),
      asset({ id: 'aapl', type: 'stock', ticker: 'AAPL' }),
      asset({ id: 'gold', type: 'commodity', assetClass: 'commodity', ticker: 'SGLD.MI' }),
      asset({ id: 'btp', type: 'bond', assetClass: 'bonds', ticker: 'BTP' }),
      asset({ id: 'pension', type: 'pensionFund', ticker: 'FONDO', allocationRole: 'frozen' }),
      asset({ id: 'home', type: 'realestate', allocationRole: 'excluded', ticker: 'CASA' }),
      asset({ id: 'sold', ticker: 'SOLD', quantity: 0 }),
      asset({ id: 'excluded-etf', ticker: 'EXCL', allocationRole: 'excluded' }),
    ]);
    expect(requests).toEqual([
      { ticker: 'AAPL', module: 'stock' },
      { ticker: 'SGLD.MI', module: 'fund' },
      { ticker: 'VWCE.DE', module: 'fund' },
    ]);
    expect(profileRequestsSignature(requests)).toBe('AAPL:stock|SGLD.MI:fund|VWCE.DE:fund');
    expect(profileRequestsSignature([])).toBe('');
  });

  it('asks both modules for one ticker held as a stock and as a fund', () => {
    const requests = selectProfileRequests([asset({ id: 'x', ticker: 'X', type: 'stock' }), asset({ id: 'y', ticker: 'X', type: 'etf' })]);
    expect(requests).toEqual([
      { ticker: 'X', module: 'fund' },
      { ticker: 'X', module: 'stock' },
    ]);
  });
});
