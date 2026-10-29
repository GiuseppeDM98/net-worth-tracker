import { describe, expect, it } from 'vitest';
import {
  binanceKlineSymbols,
  historicalEurPrice,
  parseBinanceTrades,
} from '@/lib/utils/binanceTradeImport';
import { buildBrokerTradePlan } from '@/lib/utils/brokerTradePlan';

const DAY = 86_400_000;
const T0 = Date.UTC(2025, 0, 10, 12);
const day = (ts: number) => String(Math.floor(ts / DAY));

// EURUSDT 1.25 (so 1 USDT = 0.8 EUR), BTCEUR 40000, SOLUSDT 100 (= 80 EUR).
const klines = {
  EURUSDT: { [day(T0)]: 1.25, [day(T0 + DAY)]: 1.25 },
  BTCEUR: { [day(T0)]: 40000 },
  SOLUSDT: { [day(T0)]: 100, [day(T0 + DAY)]: 100 },
};

describe('historicalEurPrice', () => {
  it('prefers the direct EUR pair, else goes through USDT', () => {
    expect(historicalEurPrice('BTC', T0, klines)).toBe(40000);
    expect(historicalEurPrice('SOL', T0, klines)).toBeCloseTo(80);
    expect(historicalEurPrice('USDT', T0, klines)).toBeCloseTo(0.8);
    expect(historicalEurPrice('EUR', T0, klines)).toBe(1);
  });

  it('looks one day either side and gives up beyond it', () => {
    expect(historicalEurPrice('BTC', T0 + DAY, klines)).toBe(40000);
    expect(historicalEurPrice('BTC', T0 + 5 * DAY, klines)).toBeNull();
  });
});

describe('binanceKlineSymbols', () => {
  it('asks for the EUR and USDT pair of every coin plus EURUSDT', () => {
    expect(binanceKlineSymbols(['BTC', 'USDT', 'EUR'])).toEqual(['BTCEUR', 'BTCUSDT', 'EURUSDT']);
  });
});

describe('parseBinanceTrades', () => {
  it('turns a Spot buy into a sell of the quote and a buy of the base, in EUR', () => {
    const { trades } = parseBinanceTrades({
      klines,
      fiatBuys: [
        { orderNo: 'N1', status: 'Completed', fiatCurrency: 'EUR', cryptoCurrency: 'USDT', sourceAmount: '80', obtainAmount: '100', createTime: T0 - 1000 },
      ],
      spotTrades: [
        { symbol: 'SOLUSDT', id: 7, _base: 'SOL', _quote: 'USDT', qty: '1', quoteQty: '100', commission: '0', commissionAsset: 'SOL', time: T0, isBuyer: true },
      ],
    });
    expect(trades.map((t) => [t.sourceRef, t.coin, t.type])).toEqual([
      ['f-N1', 'USDT', 'buy'],
      ['s-SOLUSDT-7-q', 'USDT', 'sell'],
      ['s-SOLUSDT-7-b', 'SOL', 'buy'],
    ]);
    const sol = trades.find((t) => t.coin === 'SOL')!;
    expect(sol.pricePerUnit).toBeCloseTo(80);
    expect(sol.currency).toBe('EUR');
    expect(trades.every((t) => t.source === 'binance')).toBe(true);
  });

  it('takes a fee paid in the bought coin out of the units received', () => {
    const { trades } = parseBinanceTrades({
      klines,
      fiatBuys: [
        { orderNo: 'N1', status: 'Completed', fiatCurrency: 'EUR', cryptoCurrency: 'USDT', sourceAmount: '80', obtainAmount: '100', createTime: T0 - 1000 },
      ],
      spotTrades: [
        { symbol: 'SOLUSDT', id: 7, _base: 'SOL', _quote: 'USDT', qty: '1', quoteQty: '100', commission: '0.001', commissionAsset: 'SOL', time: T0, isBuyer: true },
      ],
    });
    expect(trades.find((t) => t.coin === 'SOL')!.quantity).toBeCloseTo(0.999);
  });

  it('clips a sell to what the history bought and names the rest', () => {
    const { trades, skipped } = parseBinanceTrades({
      klines,
      fiatBuys: [
        { orderNo: 'N1', status: 'Completed', fiatCurrency: 'EUR', cryptoCurrency: 'BTC', sourceAmount: '2000', obtainAmount: '0.05', createTime: T0 - 1000 },
      ],
      convert: [
        { orderId: 9, orderStatus: 'SUCCESS', fromAsset: 'BTC', fromAmount: '0.08', toAsset: 'USDT', toAmount: '3200', createTime: T0 },
      ],
    });
    const sell = trades.find((t) => t.sourceRef === 'c-9-s')!;
    expect(sell.quantity).toBeCloseTo(0.05);
    expect(sell.pricePerUnit).toBeCloseTo(40000);
    expect(skipped.some((s) => s.sourceRef === 'c-9-s' && /importata la parte coperta/.test(s.reason))).toBe(true);
  });

  it('skips a sell of a coin the history never bought, with a reason', () => {
    const { trades, skipped } = parseBinanceTrades({
      klines,
      convert: [
        { orderId: 3, orderStatus: 'SUCCESS', fromAsset: 'BTC', fromAmount: '0.01', toAsset: 'EUR', toAmount: '400', createTime: T0 },
      ],
    });
    expect(trades).toEqual([]);
    expect(skipped).toHaveLength(1);
  });

  it('never writes a leg it cannot price, and ignores failed Convert orders', () => {
    const { trades, skipped } = parseBinanceTrades({
      klines: {},
      convert: [
        { orderId: 1, orderStatus: 'FAIL', fromAsset: 'BTC', fromAmount: '1', toAsset: 'USDT', toAmount: '1', createTime: T0 },
        { orderId: 2, orderStatus: 'SUCCESS', fromAsset: 'BTC', fromAmount: '1', toAsset: 'USDT', toAmount: '1', createTime: T0 },
      ],
    });
    expect(trades).toEqual([]);
    expect(skipped.map((s) => s.sourceRef)).toEqual(['c-2']);
  });

  it('declares a fiat purchase that was not paid in EUR', () => {
    const { trades, skipped } = parseBinanceTrades({
      klines,
      fiatBuys: [{ orderNo: 'N2', status: 'Completed', fiatCurrency: 'USD', cryptoCurrency: 'BTC', sourceAmount: '10', obtainAmount: '0.0002', createTime: T0 }],
    });
    expect(trades).toEqual([]);
    expect(skipped[0].reason).toMatch(/USD/);
  });

  it('turns the reader\'s warnings into declared rows, and keeps sourceRefs valid', () => {
    const { skipped } = parseBinanceTrades({ klines, readWarnings: ['Convert non letto: boom'] });
    expect(skipped[0].reason).toBe('Convert non letto: boom');
    const { trades } = parseBinanceTrades({
      klines,
      fiatBuys: [{ orderNo: 'N/3 x', status: 'Completed', fiatCurrency: 'EUR', cryptoCurrency: 'BTC', sourceAmount: '40', obtainAmount: '0.001', createTime: T0 }],
    });
    expect(trades[0].sourceRef).toMatch(/^[A-Za-z0-9_-]{1,128}$/);
  });
});

describe('buildBrokerTradePlan — the coin join', () => {
  const trade = (coin: string) => ({
    sourceRef: 'x', source: 'binance' as const, type: 'buy' as const, coin, label: coin,
    date: new Date(T0), quantity: 1, pricePerUnit: 1, currency: 'EUR',
  });
  const asset = (over: Record<string, unknown>) => ({ id: 'a1', name: 'BTC', type: 'crypto' as const, ...over });

  it('joins on the Binance label AND the coin\'s ticker, never on the label alone', () => {
    const plan = buildBrokerTradePlan({
      trades: [trade('BTC')],
      assets: [asset({ exchange: 'Binance', ticker: 'BINANCE-BTC' })],
      existingTransactions: [],
    });
    expect(plan.toImport[0].assetId).toBe('a1');

    const other = buildBrokerTradePlan({
      trades: [trade('BTC')],
      assets: [asset({ exchange: 'Trade Republic', ticker: 'BTC-EUR' })],
      existingTransactions: [],
    });
    expect(other.skipped[0].reason).toBe('asset-not-found');
  });
});
