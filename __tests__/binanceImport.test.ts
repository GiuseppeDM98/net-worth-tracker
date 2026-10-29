import { describe, expect, it } from 'vitest';
import {
  aggregateBinanceHoldings,
  BinanceParseError,
  buildBinanceImportPlan,
  mapBinanceHoldingToAssetFormData,
  parseEarnPositions,
  parseFundingBalances,
  parseSpotBalances,
  resolveBinanceEurPrice,
  type BinanceExistingAsset,
  type BinanceHoldingInput,
} from '@/lib/utils/binanceImport';

const holding = (over: Partial<BinanceHoldingInput> = {}): BinanceHoldingInput => ({
  asset: 'BTC',
  quantity: 0.5,
  wallets: ['Spot'],
  price: 60000,
  yahooTicker: 'BTC-EUR',
  ...over,
});

const existing = (over: Partial<BinanceExistingAsset> = {}): BinanceExistingAsset => ({
  id: 'a1',
  name: 'BTC',
  ticker: 'BTC-EUR',
  displayTicker: 'BTC',
  type: 'crypto',
  quantity: 0.5,
  exchange: 'Binance',
  autoUpdatePrice: true,
  currentPrice: 60000,
  ...over,
});

describe('parsers', () => {
  it('sums free and locked per coin and drops zero balances (Spot)', () => {
    expect(
      parseSpotBalances({
        balances: [
          { asset: 'BTC', free: '0.1', locked: '0.05' },
          { asset: 'ETH', free: '0.00000000', locked: '0.00000000' },
        ],
      })
    ).toEqual({ BTC: expect.closeTo(0.15, 10) });
  });

  it('refuses a Spot payload with no balances: it is a contract break, not an empty wallet', () => {
    expect(() => parseSpotBalances({})).toThrow(BinanceParseError);
    expect(() => parseFundingBalances({})).toThrow(BinanceParseError);
  });

  it('reads Funding rows and Earn totalAmount', () => {
    expect(parseFundingBalances([{ asset: 'SUI', free: '10', locked: '0.5' }])).toEqual({ SUI: 10.5 });
    expect(parseEarnPositions([{ asset: 'ADA', totalAmount: '100' }, { asset: 'ADA', totalAmount: '50' }])).toEqual({
      ADA: 150,
    });
  });
});

describe('resolveBinanceEurPrice', () => {
  const prices = { BTCEUR: 60000, EURUSDT: 1.1, ETHUSDT: 3300, USDTBRL: 5 };

  it('prefers the direct EUR pair', () => {
    expect(resolveBinanceEurPrice('BTC', prices)).toBe(60000);
  });

  it('goes through USDT, converted with the inverse of EURUSDT', () => {
    expect(resolveBinanceEurPrice('ETH', prices)).toBeCloseTo(3300 / 1.1, 6);
    expect(resolveBinanceEurPrice('USDT', prices)).toBeCloseTo(1 / 1.1, 6);
  });

  it('is null when no pair reaches EUR', () => {
    expect(resolveBinanceEurPrice('XYZ', prices)).toBeNull();
    expect(resolveBinanceEurPrice('ETH', { ETHUSDT: 3300 })).toBeNull();
  });
});

describe('aggregateBinanceHoldings', () => {
  it('sums a coin across wallets and names the wallets, never two positions', () => {
    const result = aggregateBinanceHoldings({
      Spot: { ADA: 100, BTC: 1 },
      Earn: { ADA: 50 },
      Funding: { SUI: 2 },
    });
    expect(result).toEqual([
      { asset: 'ADA', quantity: 150, wallets: ['Spot', 'Earn'] },
      { asset: 'BTC', quantity: 1, wallets: ['Spot'] },
      { asset: 'SUI', quantity: 2, wallets: ['Funding'] },
    ]);
  });

  it('drops EUR: a fiat balance is not a crypto position', () => {
    expect(aggregateBinanceHoldings({ Spot: { EUR: 10 } })).toEqual([]);
  });
});

describe('mapBinanceHoldingToAssetFormData', () => {
  it('is a crypto asset of the Binance broker, priced by Yahoo when verified', () => {
    expect(mapBinanceHoldingToAssetFormData(holding())).toMatchObject({
      ticker: 'BTC-EUR',
      type: 'crypto',
      assetClass: 'crypto',
      exchange: 'Binance',
      currency: 'EUR',
      autoUpdatePrice: true,
      currentPrice: 60000,
    });
  });

  it('falls back to a stable BINANCE- identity and manual pricing when Yahoo does not quote it', () => {
    expect(mapBinanceHoldingToAssetFormData(holding({ yahooTicker: undefined }))).toMatchObject({
      ticker: 'BINANCE-BTC',
      autoUpdatePrice: false,
    });
  });
});

describe('buildBinanceImportPlan', () => {
  it('creates a new coin', () => {
    const plan = buildBinanceImportPlan([holding()], []);
    expect(plan.holdings[0].kind).toBe('new');
    expect(plan.stats).toMatchObject({ newCount: 1, skippedCount: 0 });
  });

  it('does not create dust or an unpriced coin, and names them', () => {
    const plan = buildBinanceImportPlan(
      [holding({ asset: 'DUST', quantity: 0.0001, price: 1, yahooTicker: undefined }), holding({ asset: 'NOPE', price: undefined })],
      []
    );
    expect(plan.holdings).toHaveLength(0);
    expect(plan.stats.skippedCount).toBe(2);
    expect(plan.warnings.join(' ')).toContain('NOPE');
    expect(plan.warnings.join(' ')).toContain('DUST');
  });

  it('declares a manually priced new coin', () => {
    const plan = buildBinanceImportPlan([holding({ asset: 'AAA', yahooTicker: undefined })], []);
    expect(plan.warnings.join(' ')).toContain('Yahoo non quota');
  });

  it('matches only a Binance-labelled asset: another broker’s BTC is not this one', () => {
    const otherBroker = existing({ exchange: 'Trade Republic' });
    expect(buildBinanceImportPlan([holding()], [otherBroker]).holdings[0].kind).toBe('new');
    expect(buildBinanceImportPlan([holding()], [existing()]).holdings[0].kind).toBe('unchanged');
  });

  it('reports a quantity mismatch as drift and never as a write', () => {
    const plan = buildBinanceImportPlan([holding({ quantity: 0.7 })], [existing()]);
    expect(plan.holdings[0]).toMatchObject({ kind: 'drift-only' });
    expect(plan.holdings[0].quantityDrift).toBeCloseTo(0.2, 8);
    expect(plan.warnings[0]).toContain('Registro');
  });

  it('updates the price only of a manually priced coin whose price moved', () => {
    const manual = existing({ ticker: 'BINANCE-BTC', autoUpdatePrice: false, currentPrice: 50000 });
    expect(buildBinanceImportPlan([holding({ yahooTicker: undefined })], [manual]).holdings[0].kind).toBe(
      'price-update'
    );
    // A coin Yahoo quotes is repriced by the ordinary refresh, not by the sync.
    const quoted = existing({ currentPrice: 50000 });
    expect(buildBinanceImportPlan([holding()], [quoted]).holdings[0].kind).toBe('unchanged');
  });
});
