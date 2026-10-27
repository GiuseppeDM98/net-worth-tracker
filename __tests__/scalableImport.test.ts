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
  parseScalableOvernightJson,
  resolveScalableCashBalance,
  SCALABLE_CASH_ACCOUNT_NAME,
  SCALABLE_CASH_TICKER,
  SCALABLE_DEPOSIT_ACCOUNT_NAME,
  SCALABLE_DEPOSIT_TICKER,
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
      // The bridge: `sc` sends no ticker, so without the shared catalogue this stayed the ISIN and
      // Yahoo could never see inside the fund. `IE00B4L5Y983` is iShares Core MSCI World and
      // `SWDA.MI` is its Milan listing (measured via OpenFIGI).
      ticker: 'SWDA.MI',
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

  it('gives a new position a Yahoo symbol when the catalogue knows its ISIN', () => {
    // The whole point of the bridge: `sc` sends no ticker and no WKN, so without this the fund is
    // permanently unquotable and the exposure service can never see inside it.
    const { holdings } = parseScalableHoldingsJson(
      JSON.stringify([{ isin: 'IE00BK5BQT80', name: 'Vanguard FTSE All-World', type: 'ETF', quantity: 10, price: 120, currency: 'EUR' }])
    );
    const [diff] = buildScalableImportPlan(holdings, null, []).holdings;
    expect(diff.formData.ticker).toBe('VWCE.MI');
    // The broker still feeds the price: a real symbol must NOT switch Yahoo pricing on.
    expect(diff.formData.autoUpdatePrice).toBe(false);
    expect(diff.formData.isin).toBe('IE00BK5BQT80');
  });

  it('keeps the ISIN as the ticker for a fund the catalogue does not know', () => {
    // `IE00B6R52259` is deliberately absent from the catalogue. The ISIN is the status quo, so a
    // fund nobody has verified keeps the exact behaviour it had before the bridge existed.
    const { holdings } = parseScalableHoldingsJson(
      JSON.stringify([{ isin: 'IE00B6R52259', name: 'Fondo Non Verificato', type: 'ETF', quantity: 10, price: 50, currency: 'EUR' }])
    );
    const [diff] = buildScalableImportPlan(holdings, null, []).holdings;
    expect(diff.formData.ticker).toBe('IE00B6R52259');
  });

  it('offers to replace an ISIN ticker on a position imported before the bridge', () => {
    const { holdings } = parseScalableHoldingsJson(
      JSON.stringify([{ isin: 'IE00BK5BQT80', name: 'Vanguard FTSE All-World', type: 'ETF', quantity: 10, price: 120, currency: 'EUR' }])
    );
    // The tracked asset still carries its ISIN, so the fund is opaque until this is written.
    const plan = buildScalableImportPlan(holdings, null, [
      { ...existingAsset(), isin: 'IE00BK5BQT80', ticker: 'IE00BK5BQT80', name: 'Vanguard FTSE All-World', quantity: 10, currentPrice: 120 },
    ]);
    const [diff] = plan.holdings;
    expect(diff.kind).toBe('unchanged');
    expect(diff.tickerUpdate).toBe('VWCE.MI');
    expect(plan.stats.tickerUpdateCount).toBe(1);
  });

  it('never re-offers a symbol the tracked ticker already is', () => {
    // FALSIFICATION: without the ticker comparison this proposes a write on EVERY sync of a
    // position that is already correct, which is a Firestore write per holding per sync for
    // nothing. It has to be gated on the tracked ticker actually being the ISIN.
    const { holdings } = parseScalableHoldingsJson(
      JSON.stringify([{ isin: 'IE00BK5BQT80', name: 'Vanguard FTSE All-World', type: 'ETF', quantity: 10, price: 120, currency: 'EUR' }])
    );
    const plan = buildScalableImportPlan(holdings, null, [
      { ...existingAsset(), isin: 'IE00BK5BQT80', ticker: 'VWCE.MI', currentPrice: 120 },
    ]);
    expect(plan.holdings[0].tickerUpdate).toBeNull();
    expect(plan.stats.tickerUpdateCount).toBe(0);
  });

  it('proposes no symbol for a fund the catalogue does not know, however its ticker looks', () => {
    // The ISIN IS the tracked ticker here, which is exactly the shape that triggers a repair for a
    // KNOWN fund. With the catalogue silent the plan must still propose nothing.
    const { holdings } = parseScalableHoldingsJson(
      JSON.stringify([{ isin: 'IE00B6R52259', name: 'Fondo Non Verificato', type: 'ETF', quantity: 10, price: 50, currency: 'EUR' }])
    );
    const plan = buildScalableImportPlan(holdings, null, [
      { ...existingAsset(), isin: 'IE00B6R52259', ticker: 'IE00B6R52259', name: 'Fondo Non Verificato', quantity: 10, currentPrice: 50 },
    ]);
    expect(plan.holdings[0].tickerUpdate).toBeNull();
    expect(plan.stats.tickerUpdateCount).toBe(0);
  });

  it('creates a new fund already split, with the largest published sleeve as its class', () => {
    const { holdings } = parseScalableHoldingsJson(NESTED_HOLDINGS);
    const plan = buildScalableImportPlan(holdings, null, [], null, {
      IE00B4L5Y983: { stock: 0.2, bond: 0.7, cash: 0.1, other: 0, preferred: 0, convertible: 0 },
    });
    const [diff] = plan.holdings;
    expect(diff.kind).toBe('new');
    expect(diff.formData.assetClass).toBe('bonds');
    expect(diff.formData.composition).toEqual([
      { assetClass: 'bonds', percentage: 70 },
      { assetClass: 'equity', percentage: 20 },
      { assetClass: 'cash', percentage: 10 },
    ]);
  });

  it('fills an EXISTING empty composition without touching the price or the class', () => {
    const { holdings } = parseScalableHoldingsJson(NESTED_HOLDINGS);
    const plan = buildScalableImportPlan(
      holdings,
      null,
      [{ ...existingAsset(), composition: [], taxRate: 12.5, displayTicker: 'Mondo' }],
      null,
      { IE00B4L5Y983: { stock: 0.2, bond: 0.7, cash: 0.1, other: 0, preferred: 0, convertible: 0 } }
    );
    const [diff] = plan.holdings;
    // Price and quantity agree, so the ONLY thing to write is the composition: its own kind
    // keeps it visible in the preview instead of hiding it under «Invariato».
    expect(diff.kind).toBe('composition-update');
    expect(diff.compositionUpdate).toBe(true);
    expect(diff.existingTaxRate).toBe(12.5);
    expect(diff.existingDisplayTicker).toBe('Mondo');
    expect(plan.stats.compositionUpdateCount).toBe(1);
    expect(plan.stats.unchangedCount).toBe(0);
  });

  it('never overwrites a composition the user typed', () => {
    const { holdings } = parseScalableHoldingsJson(NESTED_HOLDINGS);
    const manual = [
      { assetClass: 'equity' as const, percentage: 60 },
      { assetClass: 'bonds' as const, percentage: 40 },
    ];
    const plan = buildScalableImportPlan(
      holdings,
      null,
      [{ ...existingAsset(), composition: manual }],
      null,
      { IE00B4L5Y983: { stock: 0.2, bond: 0.7, cash: 0.1, other: 0, preferred: 0, convertible: 0 } }
    );
    const [diff] = plan.holdings;
    expect(diff.kind).toBe('unchanged');
    expect(diff.compositionUpdate).toBe(false);
    expect(plan.stats.compositionUpdateCount).toBe(0);
  });

  it('stops calling an uncertain broker type unknown once the market placed the fund', () => {
    const { holdings } = parseScalableHoldingsJson(
      JSON.stringify([{ isin: 'DE0001234567', name: 'Mystery', type: 'WARRANT', quantity: 1, price: 5, currency: 'EUR' }])
    );
    const withMix = buildScalableImportPlan(holdings, null, [], null, {
      DE0001234567: { stock: 0.2, bond: 0.7, cash: 0.1, other: 0, preferred: 0, convertible: 0 },
    });
    expect(withMix.holdings[0].formData.type).toBe('etf');
    expect(withMix.warnings).toHaveLength(0);
    // The falsification: with no mix the same row must still warn, or the suppression above is
    // an absence of the warning rather than a decision about it.
    expect(buildScalableImportPlan(holdings, null, []).warnings[0]).toContain('non riconosciuto');
  });

  it('names the suggested cash account', () => {
    expect(SCALABLE_CASH_ACCOUNT_NAME).toContain('Scalable');
  });

  it('gives the deposit its own account name, distinct from the liquidity one', () => {
    expect(SCALABLE_DEPOSIT_ACCOUNT_NAME).toContain('Scalable');
    expect(SCALABLE_DEPOSIT_ACCOUNT_NAME).not.toBe(SCALABLE_CASH_ACCOUNT_NAME);
    // A re-sync matches on the WRITTEN ticker, so a renamed account never duplicates.
    expect(SCALABLE_DEPOSIT_TICKER).not.toBe(SCALABLE_CASH_TICKER);
  });
});

/** Captured verbatim from `sc overnight --json` on a logged-in account. */
const SC_CLI_OVERNIGHT = JSON.stringify({
  ok: true,
  command: 'overnight',
  data: {
    account: { display_name: 'Deposito non vincolato', is_active: true, owner_kind: 'personal' },
    result: {
      balance: 59201.61,
      current_accrued_amount: 103.4,
      // Deliberately NOT equal to `balance` (the live payload happened to print them equal, which
      // let a wrong key pass): the assertion below then pins `balance` specifically.
      current_interest_bearing_amount: 59098.21,
      deposit_accrued_lifetime_amount: 709.87,
      estimated_next_payout_amount: 128.7,
      interest_rate: 0.026,
      next_payout_date: '2026-10-01T00:00:00+00:00',
    },
    savings_account_id: 'wQxM2oE1NR8mjbaoN9FE3n',
    selection: { account: 'auto_resolve' },
  },
});

describe('parseScalableOvernightJson', () => {
  it('reads the live overnight envelope', () => {
    expect(parseScalableOvernightJson(SC_CLI_OVERNIGHT)).toMatchObject({
      balance: 59201.61,
      interestRate: 0.026,
      estimatedNextPayoutAmount: 128.7,
      displayName: 'Deposito non vincolato',
      isActive: true,
      currency: 'EUR',
    });
  });

  it('normalises the payout date to an ISO string', () => {
    const parsed = parseScalableOvernightJson(SC_CLI_OVERNIGHT);
    expect(parsed.nextPayoutDate).toBe(new Date('2026-10-01T00:00:00+00:00').toISOString());
  });

  it('drops a rate and a payout date the CLI did not report', () => {
    const parsed = parseScalableOvernightJson(
      JSON.stringify({ ok: true, data: { result: { balance: 10 } } })
    );
    expect(parsed.interestRate).toBeUndefined();
    expect(parsed.nextPayoutDate).toBeUndefined();
    expect(parsed.balance).toBe(10);
  });

  it('keeps a zero balance (an emptied account is a reading, not an absence)', () => {
    const parsed = parseScalableOvernightJson(
      JSON.stringify({ ok: true, data: { result: { balance: 0 } } })
    );
    expect(parsed.balance).toBe(0);
  });

  it('throws when the balance is missing', () => {
    expect(() => parseScalableOvernightJson(JSON.stringify({ ok: true, data: { result: {} } }))).toThrow(
      ScalableParseError
    );
  });
});

describe('the deposit is a separate balance from the broker residual', () => {
  // The measured pair: broker cash 120,00 € against a 59.201,61 € overnight deposit. The broker
  // valuation does NOT contain the deposit, so the residual must not absorb it.
  const overview = { valuation: 138746.79, securitiesValuation: 138626.79, cryptoValuation: 0, currency: 'EUR' };

  it('keeps the two cash figures apart', () => {
    const plan = buildScalableImportPlan([], overview, [], parseScalableOvernightJson(SC_CLI_OVERNIGHT));
    expect(plan.cash).toMatchObject({ balance: 120 });
    expect(plan.deposit).toMatchObject({ balance: 59201.61, interestRate: 0.026 });
    expect(plan.deposit?.balance).not.toBe(plan.cash?.balance);
  });

  it('leaves the deposit null when the account was not read', () => {
    const plan = buildScalableImportPlan([], overview, []);
    expect(plan.deposit).toBeNull();
    expect(plan.cash).toMatchObject({ balance: 120 });
  });
});
