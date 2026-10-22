/**
 * The price side of an ISIN: the symbol is found and measured by `lib/server/yahooSymbol.ts`, and
 * the PRICE comes from yahoo-finance2.
 *
 * THE PROPERTY UNDER TEST. Yahoo quotes no ISIN (`quote('LU0605515377')` answers nothing), so a
 * position born with an ISIN as its ticker was unquotable. The library's own search names the
 * symbol (`FPIJ.F`), and the measurement — the search's name and the symbol's own price name must
 * be the same fund — is what makes that symbol usable. The resolution itself is tested in
 * `__tests__/yahooSymbol.test.ts`; here it is what the PRICE does with it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const quote = vi.fn();
const search = vi.fn();
const quoteSummary = vi.fn();

vi.mock('yahoo-finance2', () => ({
  default: class {
    quote = quote;
    search = search;
    quoteSummary = quoteSummary;
  },
}));

const { getQuote } = await import('@/lib/services/yahooFinanceService');

/** Yahoo answers no price for a symbol that is an ISIN — that is the whole problem. */
function yahooQuote(symbol: string) {
  if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(symbol)) return { symbol, currency: 'EUR' };
  return { symbol, regularMarketPrice: 37.633, currency: 'EUR' };
}

describe('getQuote', () => {
  beforeEach(() => {
    quote.mockReset();
    search.mockReset();
    quoteSummary.mockReset();
    quote.mockImplementation(async (symbol: string) => yahooQuote(symbol));
  });

  it('quotes the symbol the library names, once the measurement confirms the fund', async () => {
    search.mockResolvedValue({
      quotes: [{ symbol: 'FPIJ.F', longname: 'Fidelity Funds - Global Dividend Fund' }],
    });
    quoteSummary.mockResolvedValue({
      price: { longName: 'Fidelity Funds - Global Dividend Fund' },
    });

    const result = await getQuote('LU0605515377');

    expect(result.price).toBe(37.633);
    // The ISIN is the ticker the caller knows; the SYMBOL is what Yahoo was asked.
    expect(quote).toHaveBeenCalledWith('FPIJ.F');
  });

  it('asks the ticker as it is when it is not an ISIN', async () => {
    const result = await getQuote('VWCE.MI');

    expect(result.price).toBe(37.633);
    expect(quote).toHaveBeenCalledWith('VWCE.MI');
  });

  it('keeps the ISIN when the library cannot name the fund', async () => {
    search.mockResolvedValue({ quotes: [] });

    const result = await getQuote('LU0119620416');

    expect(result.price).toBeNull();
    expect(quote).toHaveBeenCalledWith('LU0119620416');
  });

  it('uses the written catalogue before asking the network', async () => {
    // `IE00BK5BQT80` is measured in `lib/utils/yahooSymbolForIsin.ts`: no search, no risk.
    const result = await getQuote('IE00BK5BQT80');

    expect(result.price).toBe(37.633);
    expect(quote).toHaveBeenCalledWith('VWCE.MI');
    expect(search).not.toHaveBeenCalled();
  });
});
