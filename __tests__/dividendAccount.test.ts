/**
 * Tests for lib/utils/dividendAccount.ts — which cash account a dividend credits, when, and with
 * what amount.
 *
 * The dates are built the way production builds them (a payment date is a midnight, the cron runs
 * at 18:00 UTC), not at a comfortable noon: the rule compares ITALIAN calendar days, and a noon
 * fixture cannot see a day boundary. Run under `TZ=Europe/Rome` and without.
 */

import { describe, expect, it } from 'vitest';

import {
  NO_DIVIDEND_ACCOUNT,
  dividendAccountFromForm,
  dividendIncomeAmount,
  isPaymentDueOrAhead,
  paysDividends,
  resolveDividendAccount,
} from '@/lib/utils/dividendAccount';

/** 20:00 in Italy on 2026-09-20 (CEST, UTC+2): the daily cron's hour. */
const CRON_NOW = new Date('2026-09-20T18:00:00Z');
/** Italian midnight of a day, as a UTC instant (CEST). */
const italianMidnight = (isoDay: string) => new Date(`${isoDay}T00:00:00+02:00`);

describe('isPaymentDueOrAhead', () => {
  it('should accept a payment dated today, from its first minute to its last', () => {
    expect(isPaymentDueOrAhead(italianMidnight('2026-09-20'), CRON_NOW)).toBe(true);
    expect(isPaymentDueOrAhead(new Date('2026-09-20T21:59:00Z'), CRON_NOW)).toBe(true); // 23:59 in Italy
  });

  it('should accept a payment still to come', () => {
    expect(isPaymentDueOrAhead(italianMidnight('2026-09-21'), CRON_NOW)).toBe(true);
  });

  it('should refuse yesterday, even at its last minute', () => {
    expect(isPaymentDueOrAhead(new Date('2026-09-19T21:59:00Z'), CRON_NOW)).toBe(false);
    expect(isPaymentDueOrAhead(italianMidnight('2026-03-10'), CRON_NOW)).toBe(false);
  });

  it('should read the ITALIAN day: 23:30 UTC of the 19th is already the 20th in Italy', () => {
    expect(isPaymentDueOrAhead(new Date('2026-09-19T23:30:00Z'), CRON_NOW)).toBe(true);
  });
});

describe('resolveDividendAccount', () => {
  const today = italianMidnight('2026-09-20');

  it('should prefer the account of the instrument over the default', () => {
    expect(
      resolveDividendAccount({ assetAccountId: 'directa', defaultAccountId: 'fineco', paymentDate: today, now: CRON_NOW }),
    ).toBe('directa');
  });

  it('should fall back to the default when the instrument has none', () => {
    expect(
      resolveDividendAccount({ assetAccountId: undefined, defaultAccountId: 'fineco', paymentDate: today, now: CRON_NOW }),
    ).toBe('fineco');
    expect(resolveDividendAccount({ assetAccountId: '', defaultAccountId: 'fineco', paymentDate: today, now: CRON_NOW })).toBe('fineco');
  });

  it('should credit nothing when no account is configured', () => {
    expect(
      resolveDividendAccount({ assetAccountId: undefined, defaultAccountId: null, paymentDate: today, now: CRON_NOW }),
    ).toBeUndefined();
  });

  it('should credit nothing for an arrear, whatever is configured', () => {
    // A scrape brings in last spring's dividend: the balance aligned to the bank already holds it.
    expect(
      resolveDividendAccount({
        assetAccountId: 'directa',
        defaultAccountId: 'fineco',
        paymentDate: italianMidnight('2026-03-10'),
        now: CRON_NOW,
      }),
    ).toBeUndefined();
  });
});

describe('dividendIncomeAmount', () => {
  it('should round a EUR net to the cent and keep the currency', () => {
    expect(dividendIncomeAmount({ currency: 'EUR', netAmount: 12.3456 })).toEqual({
      amount: 12.35,
      currency: 'EUR',
      isConvertedToEur: false,
    });
  });

  it('should take the EUR conversion of a foreign dividend, to the cent', () => {
    expect(dividendIncomeAmount({ currency: 'USD', netAmount: 20, netAmountEur: 17.0049 })).toEqual({
      amount: 17,
      currency: 'EUR',
      isConvertedToEur: true,
    });
  });

  it('should keep the native net when a foreign dividend has no conversion', () => {
    expect(dividendIncomeAmount({ currency: 'usd', netAmount: 20.005 })).toEqual({
      amount: 20.01,
      currency: 'usd',
      isConvertedToEur: false,
    });
  });
});

describe('the asset form', () => {
  it('should ask an account only of the types that pay', () => {
    expect(['stock', 'etf', 'bond'].every((type) => paysDividends(type as never))).toBe(true);
    expect(['crypto', 'commodity', 'cash', 'realestate', 'pensionFund'].some((type) => paysDividends(type as never))).toBe(false);
  });

  it('should store the chosen account, and nothing for the sentinel', () => {
    expect(dividendAccountFromForm('etf', 'directa')).toBe('directa');
    expect(dividendAccountFromForm('etf', NO_DIVIDEND_ACCOUNT)).toBeUndefined();
    expect(dividendAccountFromForm('etf', undefined)).toBeUndefined();
  });

  it('should drop the account of an instrument re-typed to something that pays nothing', () => {
    expect(dividendAccountFromForm('realestate', 'directa')).toBeUndefined();
  });
});
