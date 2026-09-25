/**
 * Tests for lib/utils/scalableImport.ts — the pure layer of the Scalable read-only bridge.
 * Fixtures mirror the broker GraphQL fields the `sc` CLI prints (inventory.position.filled,
 * quoteTick.midPrice, portfolioIsinPerformance.*, valuation/securitiesValuation/cryptoValuation).
 */

import { describe, expect, it } from 'vitest';

import type { Asset } from '@/types/assets';
import {
  buildScalableImportPlan,
  defaultTaxRateFor,
  mapHoldingToAssetFormData,
  mapScalableType,
  parseScalableHoldingsJson,
  parseScalableOverviewJson,
  resolveScalableCashBalance,
  SCALABLE_CASH_ACCOUNT_NAME,
  ScalableHoldingInput,
  ScalableParseError,
} from '@/lib/utils/scalableImport';

const NESTED_HOLDINGS = JSON.stringify([
  {
    isin: 'ie00b4l5y983',
    name: 'iShares Core MSCI World',
    type: 'ETF',
    inventory: { position: { filled: 42.5, fifoPrice: 88.1 } },
    portfolioIsinPerformance: { valuation: 4250.0, currency: 'EUR' },
    quoteTick: { midPrice: 100.0, currency: 'EUR' },
  },
  {
    isin: 'US0378331005',
    name: 'Apple Inc',
    type: 'STOCK',
    inventory: { position: { filled: 10, fifoPrice: 150.0 } },
    quoteTick: { midPrice: 200.0, currency: 'USD' },
  },
]);

const FLAT_HOLDINGS = JSON.stringify({
  holdings: [{ isin: 'DE0001234567', name: 'Bund X', type: 'BOND', quantity: 5, price: 99.5, currency: 'EUR' }],
});

// sc CLI envelope format (what `sc broker holdings --json` actually prints)
const SC_CLI_HOLDINGS = JSON.stringify({
  ok: true,
  command: 'broker.holdings',
  data: {
    account_id: 'v9WckNgGwHUiNrA5fbHauw',
    portfolio_id: '7tqK1YA6BnX3dKJrLiukfU',
    resolution: { account: 'selected_context', portfolio: 'selected_context' },
    result: {
      account_id: 'v9WckNgGwHUiNrA5fbHauw',
      count: 5,
      items: [
        {
          blocked_quantity: 0,
          fifo_price: 116.121008,
          isin: 'IE00B3VTMJ91',
          name: 'iShares Euro Govt Bond 1-3yr (Acc)',
          pending_quantity: 0,
          quantity: 258,
          quote_currency: 'EUR',
          quote_is_outdated: false,
          quote_mid_price: 115.85,
          quote_timestamp_utc: '2026-09-18T12:21:21.882Z',
          security_type: 'ETF',
          valuation: 29889.3,
          valuation_currency: 'EUR',
        },
      ],
      portfolio_id: '7tqK1YA6BnX3dKJrLiukfU',
    },
  },
});

function existingAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'a1',
    userId: 'u1',
    ticker: 'IE00B4L5Y983',
    name: 'iShares Core MSCI World',
    type: 'etf',
    assetClass: 'equity',
    isin: 'IE00B4L5Y983',
    currency: 'EUR',
    quantity: 42.5,
    currentPrice: 100.0,
    lastPriceUpdate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Asset;
}

describe('parseScalableHoldingsJson', () => {
  it('reads the nested broker shape (position, quoteTick, performance)', () => {
    const { holdings, skipped } = parseScalableHoldingsJson(NESTED_HOLDINGS);
    expect(skipped).toBe(0);
    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toMatchObject({
      isin: 'IE00B4L5Y983',
      name: 'iShares Core MSCI World',
      rawType: 'ETF',
      quantity: 42.5,
      price: 100.0,
      currency: 'EUR',
      averageCost: 88.1,
      valuation: 4250.0,
    });
    expect(holdings[1]).toMatchObject({ currency: 'USD', price: 200.0 });
  });

  it('accepts the { holdings } envelope with flat rows', () => {
    const { holdings } = parseScalableHoldingsJson(FLAT_HOLDINGS);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ isin: 'DE0001234567', quantity: 5, price: 99.5 });
  });

  it('rejects non-JSON text with an Italian error', () => {
    expect(() => parseScalableHoldingsJson('not json')).toThrow(ScalableParseError);
  });

  it('skips rows without ISIN, quantity or price and counts them', () => {
    const { holdings, skipped } = parseScalableHoldingsJson(
      JSON.stringify([
        { isin: 'IE00B4L5Y983', name: 'Ok', type: 'ETF', quantity: 1, price: 10, currency: 'EUR' },
        { name: 'no isin', quantity: 1, price: 10 },
        { isin: 'US0000000001', name: 'no qty', quantity: 0, price: 10 },
        { isin: 'US0000000002', name: 'no price', quantity: 1 },
        'garbage',
      ])
    );
    expect(holdings).toHaveLength(1);
    expect(skipped).toBe(4);
  });

  it('keeps the first row on a duplicated ISIN', () => {
    const { holdings, skipped } = parseScalableHoldingsJson(
      JSON.stringify([
        { isin: 'IE00B4L5Y983', name: 'First', type: 'ETF', quantity: 1, price: 10 },
        { isin: 'ie00b4l5y983', name: 'Second', type: 'ETF', quantity: 2, price: 20 },
      ])
    );
    expect(holdings).toHaveLength(1);
    expect(holdings[0].name).toBe('First');
    expect(skipped).toBe(1);
  });

  it('reads the sc CLI envelope format (data.result.items)', () => {
    const { holdings, skipped } = parseScalableHoldingsJson(SC_CLI_HOLDINGS);
    expect(skipped).toBe(0);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      isin: 'IE00B3VTMJ91',
      name: 'iShares Euro Govt Bond 1-3yr (Acc)',
      rawType: 'ETF',
      quantity: 258,
      price: 115.85,
      currency: 'EUR',
      averageCost: 116.121008,
      valuation: 29889.3,
    });
  });

  it('throws when nothing usable remains', () => {
    expect(() => parseScalableHoldingsJson(JSON.stringify([]))).toThrow(ScalableParseError);
  });
});

describe('parseScalableOverviewJson', () => {
  it('reads the totals and derives the cash residual', () => {
    const overview = parseScalableOverviewJson(
      JSON.stringify({ valuation: 10000, securitiesValuation: 8500, cryptoValuation: 500 })
    );
    expect(overview).toMatchObject({
      valuation: 10000,
      securitiesValuation: 8500,
      cryptoValuation: 500,
      currency: 'EUR',
    });
    expect(resolveScalableCashBalance(overview)).toMatchObject({ balance: 1000, currency: 'EUR' });
  });

  it('throws when the total is missing', () => {
    expect(() => parseScalableOverviewJson(JSON.stringify({ foo: 1 }))).toThrow(ScalableParseError);
  });

  it('reads the live broker.overview envelope (data.result.valuation)', () => {
    const overview = parseScalableOverviewJson(
      JSON.stringify({
        ok: true,
        command: 'broker.overview',
        data: {
          result: { valuation: { crypto: 0, securities: 138626.79, total: 138746.79 } },
        },
      })
    );
    expect(overview).toMatchObject({
      valuation: 138746.79,
      securitiesValuation: 138626.79,
      cryptoValuation: 0,
      currency: 'EUR',
    });
    expect(resolveScalableCashBalance(overview)).toMatchObject({ balance: 120, currency: 'EUR' });
  });
});

describe('mapScalableType / mapHoldingToAssetFormData', () => {
  it('maps known broker types', () => {
    expect(mapScalableType('ETF')).toMatchObject({ type: 'etf', assetClass: 'equity', typeUncertain: false });
    expect(mapScalableType('stock')).toMatchObject({ type: 'stock', assetClass: 'equity', typeUncertain: false });
    expect(mapScalableType('Anleihe')).toMatchObject({ type: 'bond', assetClass: 'bonds', typeUncertain: false });
  });

  it('falls back to ETF with the uncertain flag on unknown types', () => {
    expect(mapScalableType('WARRANT')).toMatchObject({ type: 'etf', typeUncertain: true });
    expect(mapScalableType('')).toMatchObject({ type: 'etf', typeUncertain: true });
  });

  it('taxes bonds at 12.5 and everything else at 26', () => {
    expect(defaultTaxRateFor('bond')).toBe(12.5);
    expect(defaultTaxRateFor('etf')).toBe(26);
    expect(defaultTaxRateFor('crypto')).toBe(26);
  });

  it('builds a broker-fed creation payload (no Yahoo auto-update)', () => {
    const holding: ScalableHoldingInput = {
      isin: 'IE00B4L5Y983',
      name: 'iShares Core MSCI World',
      rawType: 'ETF',
      quantity: 42.5,
      price: 100.0,
      currency: 'EUR',
      averageCost: 88.1,
    };
    expect(mapHoldingToAssetFormData(holding)).toMatchObject({
      ticker: 'IE00B4L5Y983',
      displayTicker: 'iShares Core MSCI World',
      name: 'iShares Core MSCI World',
      type: 'etf',
      assetClass: 'equity',
      quantity: 42.5,
      averageCost: 88.1,
      taxRate: 26,
      currentPrice: 100.0,
      isLiquid: true,
      autoUpdatePrice: false,
      isin: 'IE00B4L5Y983',
      exchange: 'Scalable Capital',
    });
  });
});

describe('buildScalableImportPlan', () => {
  const overview = { valuation: 10000, securitiesValuation: 8500, cryptoValuation: 500, currency: 'EUR' };

  it('marks unknown ISINs as new and carries the cash residual', () => {
    const { holdings } = parseScalableHoldingsJson(NESTED_HOLDINGS);
    const plan = buildScalableImportPlan(holdings, overview, []);
    expect(plan.holdings.map((d) => d.kind)).toEqual(['new', 'new']);
    expect(plan.cash).toMatchObject({ balance: 1000 });
    expect(plan.stats).toMatchObject({ newCount: 2, holdingCount: 2 });
  });

  it('detects price moves without touching the ledger quantity', () => {
    const { holdings } = parseScalableHoldingsJson(NESTED_HOLDINGS);
    const plan = buildScalableImportPlan(holdings, null, [
      { ...existingAsset(), currentPrice: 90.0 },
    ]);
    expect(plan.cash).toBeNull();
    const [first, second] = plan.holdings;
    expect(first.kind).toBe('price-update');
    expect(first.existingAssetId).toBe('a1');
    expect(first.quantityDrift).toBe(0);
    expect(second.kind).toBe('new');
  });

  it('flags a broker/ledger quantity mismatch as drift-only, never a write', () => {
    const { holdings } = parseScalableHoldingsJson(NESTED_HOLDINGS);
    const plan = buildScalableImportPlan(holdings, null, [{ ...existingAsset(), quantity: 40 }]);
    const [first] = plan.holdings;
    expect(first.kind).toBe('drift-only');
    expect(first.quantityDrift).toBeCloseTo(2.5);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.warnings[0]).toContain('Registro');
    expect(plan.stats.driftCount).toBe(1);
  });

  it('does not flag drift on non-ledger types', () => {
    const { holdings } = parseScalableHoldingsJson(NESTED_HOLDINGS);
    const plan = buildScalableImportPlan(holdings, null, [
      { ...existingAsset(), type: 'cash', assetClass: 'cash', quantity: 1 },
    ]);
    expect(plan.holdings[0].kind).toBe('unchanged');
    expect(plan.warnings).toHaveLength(0);
  });

  it('warns on uncertain broker types for new positions', () => {
    const { holdings } = parseScalableHoldingsJson(
      JSON.stringify([{ isin: 'DE0001234567', name: 'Mystery', type: 'WARRANT', quantity: 1, price: 5 }])
    );
    const plan = buildScalableImportPlan(holdings, null, []);
    expect(plan.holdings[0].formData.type).toBe('etf');
    expect(plan.warnings[0]).toContain('non riconosciuto');
  });

  it('names the suggested cash account', () => {
    expect(SCALABLE_CASH_ACCOUNT_NAME).toContain('Scalable');
  });
});
