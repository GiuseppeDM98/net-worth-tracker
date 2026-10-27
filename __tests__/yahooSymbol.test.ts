/**
 * The ONE resolver: the symbol Yahoo quotes for an ISIN, found and measured.
 *
 * THE PROPERTY UNDER TEST. Yahoo quotes no ISIN (`quote('LU0605515377')` answers nothing), so a
 * position born with an ISIN as its ticker was unquotable — and a symbol nobody checked is a wrong
 * price (or another fund's holdings) on a real asset. So the symbol the library's search names is
 * used ONLY when the search's name and the symbol's own price name the same fund.
 *
 * Every case uses its OWN ISIN: a found symbol is remembered for the life of the process, and a
 * shared one would make the cases answer each other.
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

const { resolveQuotableSymbol } = await import('@/lib/server/yahooSymbol');

describe('resolveQuotableSymbol', () => {
  beforeEach(() => {
    quote.mockReset();
    search.mockReset();
    quoteSummary.mockReset();
  });

  it('returns a symbol as it is — a symbol is not searched', async () => {
    expect(await resolveQuotableSymbol('VWCE.MI')).toBe('VWCE.MI');
    expect(await resolveQuotableSymbol('  AAPL  ')).toBe('AAPL');
    expect(search).not.toHaveBeenCalled();
  });

  it('uses the written catalogue before asking the network', async () => {
    // `IE00BK5BQT80` is measured in `lib/utils/yahooSymbolForIsin.ts`: free, and already verified.
    expect(await resolveQuotableSymbol('IE00BK5BQT80')).toBe('VWCE.MI');
    expect(search).not.toHaveBeenCalled();
  });

  it('quotes the symbol the library names, once the measurement confirms the fund', async () => {
    search.mockResolvedValue({
      quotes: [{ symbol: 'FPIJ.F', longname: 'Fidelity Funds - Global Dividend Fund' }],
    });
    quoteSummary.mockResolvedValue({
      price: { longName: 'Fidelity Funds - Global Dividend Fund' },
    });

    expect(await resolveQuotableSymbol('LU0605515377')).toBe('FPIJ.F');
  });

  it('refuses a symbol whose own price names another fund', async () => {
    search.mockResolvedValue({
      quotes: [{ symbol: 'WRONG.F', longname: 'Fidelity Funds - Global Dividend Fund' }],
    });
    quoteSummary.mockResolvedValue({
      price: { longName: 'Fidelity Global Dividend Fund Series T5 LSC' },
    });

    // The ISIN it had: an unquotable position, never another fund's price.
    expect(await resolveQuotableSymbol('LU0605515378')).toBe('LU0605515378');
  });

  it('refuses a symbol Yahoo will not describe', async () => {
    search.mockResolvedValue({
      quotes: [{ symbol: 'FPIJ.F', longname: 'Fidelity Funds - Global Dividend Fund' }],
    });
    quoteSummary.mockRejectedValue(new Error('No fundamentals data found for symbol: FPIJ.F'));

    // Its name cannot be compared, so it cannot be used.
    expect(await resolveQuotableSymbol('LU0605515379')).toBe('LU0605515379');
  });

  it('keeps the ISIN when the library cannot name the fund', async () => {
    search.mockResolvedValue({ quotes: [] });

    // Measured: `LU0119620416` has no listing on Yahoo at all.
    expect(await resolveQuotableSymbol('LU0119620416')).toBe('LU0119620416');
  });

  it('searches an ISIN once, then reuses the symbol it found', async () => {
    search.mockResolvedValue({
      quotes: [{ symbol: '0P00017T6E.F', longname: 'R-co Valor C EUR' }],
    });
    quoteSummary.mockResolvedValue({ price: { longName: 'R-co Valor C EUR' } });

    await resolveQuotableSymbol('FR0011253624');
    await resolveQuotableSymbol('FR0011253624');

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('does not remember a miss: a search that failed must be tried again', async () => {
    search.mockResolvedValue({ quotes: [] });

    expect(await resolveQuotableSymbol('LU1234567890')).toBe('LU1234567890');
    expect(await resolveQuotableSymbol('LU1234567890')).toBe('LU1234567890');

    expect(search).toHaveBeenCalledTimes(2);
  });
});
