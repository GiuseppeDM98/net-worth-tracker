/**
 * Tests for lib/utils/tradeFx.ts — the euro side of a trade in a foreign currency: the statement's
 * euro total turned into a rate, the ECB rate of the day when there is none, the 25% typing guard,
 * a euro fee saved before 2026-11-23 inside the total, and the words Movimenti and the form print.
 */

import { describe, expect, it } from 'vitest';

import { roundToCents } from '@/lib/utils/cents';
import {
  STATEMENT_RATE_TOLERANCE,
  TradeFxError,
  describeTotalOff,
  describeTradeFx,
  formatFxPair,
  resolveTradeFx,
  type TradeFxInput,
} from '@/lib/utils/tradeFx';

const BUY: TradeFxInput = { type: 'buy', quantity: 10, pricePerUnit: 50, feesNative: 5, ecb: null };

function errorOf(run: () => unknown): TradeFxError {
  try {
    run();
  } catch (error) {
    if (error instanceof TradeFxError) return error;
    throw error;
  }
  throw new Error('expected a TradeFxError');
}

describe('resolveTradeFx — with the statement total (U1, U2)', () => {
  it('should derive the rate from the total of a buy so that quantity × priceEur + fee is the total to the cent', () => {
    const result = resolveTradeFx({ ...BUY, settledTotalEur: 460 });

    expect(result.fxRate).toBeCloseTo(460 / 505, 12);
    expect(result.feesEur).toBe(4.55);
    expect(result.fxSource).toBe('statement');
    expect(roundToCents(10 * result.priceEur + result.feesEur)).toBe(460);
  });

  it('should make quantity × priceEur − fee the credited total on a sale', () => {
    const result = resolveTradeFx({ ...BUY, type: 'sell', settledTotalEur: 460 });

    expect(result.fxRate).toBeCloseTo(460 / 495, 12);
    expect(result.fxSource).toBe('statement');
    expect(roundToCents(10 * result.priceEur - result.feesEur)).toBe(460);
  });
});

describe('resolveTradeFx — without a total (U3)', () => {
  it('should convert price and fee at the ECB rate of the day', () => {
    const result = resolveTradeFx({ ...BUY, ecb: { rate: 0.9, isLatest: false } });

    expect(result.priceEur).toBeCloseTo(45, 12);
    expect(result.feesEur).toBe(4.5);
    expect(result.fxRate).toBe(0.9);
    expect(result.fxSource).toBe('ecb');
  });

  it('should say ecb-latest when the day had no fixing and the latest one answered', () => {
    expect(resolveTradeFx({ ...BUY, ecb: { rate: 0.9, isLatest: true } }).fxSource).toBe('ecb-latest');
  });

  it('should refuse with no-rate when there is neither a total nor an ECB rate', () => {
    expect(errorOf(() => resolveTradeFx(BUY)).code).toBe('no-rate');
  });
});

describe('resolveTradeFx — the typing guard (U4)', () => {
  const ecb = { rate: 0.9, isLatest: false };

  it('should refuse a total whose implied rate is 30% off the ECB one, carrying the ECB rate', () => {
    const error = errorOf(() => resolveTradeFx({ ...BUY, ecb, settledTotalEur: 0.9 * 1.3 * 505 }));

    expect(error.code).toBe('total-off');
    expect(error.ecbRate).toBe(0.9);
  });

  it('should accept a total 20% off the ECB rate', () => {
    expect(resolveTradeFx({ ...BUY, ecb, settledTotalEur: 0.9 * 1.2 * 505 }).fxSource).toBe('statement');
  });

  it('should accept any total when no ECB rate could be read', () => {
    expect(resolveTradeFx({ ...BUY, settledTotalEur: 5000 }).fxRate).toBeCloseTo(5000 / 505, 12);
  });

  it('should keep the tolerance at 25%', () => {
    expect(STATEMENT_RATE_TOLERANCE).toBe(0.25);
  });
});

describe('the words (U5)', () => {
  it('should print the pair as it is quoted, the inverse of the stored rate', () => {
    expect(formatFxPair('USD', 0.9123)).toBe('EUR/USD 1,0961');
  });

  it('should print pence as GBP', () => {
    expect(formatFxPair('GBp', 0.8)).toBe('EUR/GBP 1,2500');
  });

  it('should name the source of each rate', () => {
    const day = new Date('2026-11-16T12:00:00Z');

    expect(describeTradeFx('USD', 0.9123, 'statement', day)).toBe("EUR/USD 1,0961 · dal totale dell'estratto");
    expect(describeTradeFx('USD', 0.9123, 'ecb', day)).toBe('EUR/USD 1,0961 · BCE del 16/11/2026');
    expect(describeTradeFx('USD', 0.9123, 'ecb-latest', day)).toBe(
      'EUR/USD 1,0961 · BCE più recente: quello del giorno non era disponibile'
    );
  });

  it('should show the ECB rate in the refusal of a total', () => {
    expect(describeTotalOff('USD', 0.9123)).toBe(
      'Il totale in euro non torna con il cambio del giorno (EUR/USD 1,0961): controlla la cifra.'
    );
  });
});

describe('resolveTradeFx — a euro fee saved before 2026-11-23 (U6)', () => {
  const LEGACY: TradeFxInput = { type: 'buy', quantity: 10, pricePerUnit: 50, feesNative: 0, legacyFeesEur: 5, ecb: null };

  it('should keep the euro fee inside the total of a buy and derive the rate from the titles alone', () => {
    const result = resolveTradeFx({ ...LEGACY, settledTotalEur: 460 });

    expect(result.fxRate).toBeCloseTo(455 / 500, 12);
    expect(result.feesEur).toBe(5);
    expect(roundToCents(10 * result.priceEur + 5)).toBe(460);
  });

  it('should add the euro fee back on a sale', () => {
    const result = resolveTradeFx({ ...LEGACY, type: 'sell', settledTotalEur: 460 });

    expect(result.fxRate).toBeCloseTo(465 / 500, 12);
    expect(roundToCents(10 * result.priceEur - 5)).toBe(460);
  });

  it('should keep the euro fee as it is when the ECB rate converts the price', () => {
    const result = resolveTradeFx({ ...LEGACY, ecb: { rate: 0.9, isLatest: false } });

    expect(result.priceEur).toBeCloseTo(45, 12);
    expect(result.feesEur).toBe(5);
  });

  it('should refuse a total on a price of 0 with nothing-to-convert', () => {
    expect(errorOf(() => resolveTradeFx({ ...LEGACY, pricePerUnit: 0, settledTotalEur: 460 })).code).toBe(
      'nothing-to-convert'
    );
  });
});
