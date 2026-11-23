/**
 * Tests for lib/services/yahooFinanceService.ts › getQuote, with `yahoo-finance2` mocked.
 *
 * A quote carries the time of its last trade (2026-11-20): a symbol that stopped updating must be
 * told from a live one before the Consulente's click creates an instrument with its price. Mutation
 * that turns it red: drop `quotedAt` from the result.
 */
import { describe, it, expect, vi } from 'vitest';

const quote = vi.fn();
vi.mock('yahoo-finance2', () => ({
  default: class {
    quote = (ticker: string) => quote(ticker);
  },
}));

import { getQuote } from '@/lib/services/yahooFinanceService';

describe('getQuote', () => {
  it('returns quotedAt from regularMarketTime', async () => {
    quote.mockResolvedValueOnce({ regularMarketPrice: 50, currency: 'EUR', regularMarketTime: new Date('2026-11-18T16:30:00Z') });
    expect(await getQuote('ETFA.MI')).toEqual({ ticker: 'ETFA.MI', price: 50, currency: 'EUR', quotedAt: '2026-11-18T16:30:00.000Z' });
  });

  it('leaves it out when Yahoo gives no time', async () => {
    quote.mockResolvedValueOnce({ regularMarketPrice: 50, currency: 'EUR' });
    expect(await getQuote('ETFA.MI')).not.toHaveProperty('quotedAt');
  });
});
