/**
 * The ISIN → Yahoo symbol bridge for the broker that publishes only an ISIN.
 *
 * The property worth defending is not "the table is right" — that is verified against Yahoo by
 * hand and documented per entry — it is that an UNKNOWN ISIN changes nothing. A bridge that
 * guessed a suffix would put a wrong price on a real asset, so the failure mode under test here
 * is "returns null and the caller keeps what it had".
 */

import { describe, it, expect } from 'vitest';
import {
  CORRECTED_ISIN_PAIRS,
  YAHOO_SYMBOL_BY_ISIN,
  isCorrectedIsin,
  namesTheSameFund,
  resolveYahooSymbolForIsin,
} from '@/lib/utils/yahooSymbolForIsin';
import { TR_YAHOO_TICKER_BY_ISIN } from '@/lib/utils/tradeRepublicImport';

describe('resolveYahooSymbolForIsin', () => {
  it('answers for an ISIN the catalogue knows, whatever case it arrives in', () => {
    const isin = 'IE00BK5BQT80';
    expect(resolveYahooSymbolForIsin(isin)).toBe('VWCE.MI');
    expect(resolveYahooSymbolForIsin(isin.toLowerCase())).toBe('VWCE.MI');
    expect(resolveYahooSymbolForIsin(`  ${isin}  `)).toBe('VWCE.MI');
  });

  it('answers null for everything it does not know, rather than guessing a suffix', () => {
    // The load-bearing property. `?? 'IE00XXXXXXX.DE'` here would price a real fund off a listing
    // nobody checked, which is the exact harm the source table's header warns about.
    expect(resolveYahooSymbolForIsin('IE00B6R52259')).toBeNull();
    expect(resolveYahooSymbolForIsin('US0378331005')).toBeNull();
    expect(resolveYahooSymbolForIsin('')).toBeNull();
    expect(resolveYahooSymbolForIsin(null)).toBeNull();
    expect(resolveYahooSymbolForIsin(undefined)).toBeNull();
  });

  it('leaves crypto to the broker, whose crypto pair is its own decision', () => {
    // Trade Republic prices BTC-EUR; another broker would not. The pseudo-ISIN carries the coin
    // code, so the caller derives it — this function must not pick a venue for someone else.
    expect(resolveYahooSymbolForIsin('XF000BTC0017')).toBeNull();
  });

  it('keeps every stored symbol a full Yahoo symbol, suffix included', () => {
    // A suffix cannot be derived from the ISIN, so an entry without one is an incomplete entry.
    // Not always two letters, though: `.L` is London and `.SW` is the Swiss exchange, which is why
    // this is not `/\.[A-Z]{2}$/` — that shape rejected three rows that Yahoo quotes happily.
    for (const [isin, symbol] of Object.entries(YAHOO_SYMBOL_BY_ISIN)) {
      expect(symbol, `${isin} has no exchange suffix`).toMatch(/\.[A-Z]{1,3}$/);
    }
  });

  it('gives the bond fund its OWN symbol, not the world fund\'s', () => {
    // THE BUG. `tradeRepublicImport.ts` paired IE00B3VTMJ91 with 'SWDA.MI' and called it «iShares
    // Core MSCI World». OpenFIGI measures that ISIN as ISHARES EURO GOVT BOND 1-3Y, and SWDA as the
    // London/Milan listing of IE00B4L5Y983. The old row put a world-equity price on a
    // euro-government-bond position, and Trade Republic DOES auto-update prices from Yahoo.
    //
    // The row then claimed the German ticker `SXRN`, which Yahoo does not quote at all — a second
    // wrong number in the same record. The fund is quoted `CBE3.L`, measured the same way as every
    // other row: `search(isin)` names the fund and `quoteSummary(symbol)` names what it quotes.
    expect(resolveYahooSymbolForIsin('IE00B3VTMJ91')).toBe('CBE3.L');
    expect(resolveYahooSymbolForIsin('IE00B4L5Y983')).toBe('SWDA.MI');
    // And the two funds must not have swapped symbols on the way.
    expect(YAHOO_SYMBOL_BY_ISIN.IE00B3VTMJ91).not.toBe(YAHOO_SYMBOL_BY_ISIN.IE00B4L5Y983);
    expect(isCorrectedIsin('IE00B3VTMJ91')).toBe(true);
    expect(CORRECTED_ISIN_PAIRS.IE00B3VTMJ91.correctIsinForOldSymbol).toBe('IE00B4L5Y983');
  });

  it('never stores an ISIN back as its own symbol', () => {
    // FALSIFICATION: the two removed rows read 'IE000M7V94E1.SG' and 'IE000U58J0M1.SG' — the ISIN
    // echoed with a suffix, on a comment saying Xetra while the suffix said Singapore. Yahoo cannot
    // quote those, and had it resolved one it would have been garbage. A table that cannot hold a
    // symbol identical to its own key cannot regress this way.
    for (const [isin, symbol] of Object.entries(YAHOO_SYMBOL_BY_ISIN)) {
      expect(symbol.split('.')[0], `${isin} is stored as its own symbol`).not.toBe(isin);
    }
  });

  it('resolves every recorded correction to a DIFFERENT symbol than the one it had', () => {
    // A correction that left the old symbol in place would be a record, not a fix. This is the
    // check that keeps CORRECTED_ISIN_PAIRS honest rather than decorative.
    const corrected = Object.keys(CORRECTED_ISIN_PAIRS);
    expect(corrected.length).toBeGreaterThan(0);
    for (const isin of corrected) {
      const now = resolveYahooSymbolForIsin(isin);
      expect(now, `${isin} is recorded as corrected but resolves to nothing`).not.toBeNull();
      expect(now, `${isin} still resolves to the symbol the correction removed`).not.toBe(CORRECTED_ISIN_PAIRS[isin].wasSymbol);
    }
  });

  it('holds no fund twice: the shared catalogue is the only fund table', () => {
    // The duplication is what let a mismatched pair hide — one copy in the broker table, one in the
    // geographic override, and only one of them got corrected.
    for (const isin of Object.keys(TR_YAHOO_TICKER_BY_ISIN)) {
      expect(isin in YAHOO_SYMBOL_BY_ISIN, `${isin} is written down in both fund tables`).toBe(false);
    }
  });
});

describe('namesTheSameFund', () => {
  it('reads the two spellings of one fund as one fund', () => {
    // Measured pair (2026-10-22): `search('LU0605515377')` names «Fidelity Funds - Global
    // Dividend Fund» and `quoteSummary('FPIJ.F', ['price']).longName` names the same string.
    expect(
      namesTheSameFund('Fidelity Funds - Global Dividend Fund', 'Fidelity Funds - Global Dividend Fund')
    ).toBe(true);
    // Case, punctuation and spacing are the same name spelled differently.
    expect(namesTheSameFund('R-co Valor C EUR', 'R-Co Valor C EUR')).toBe(true);
    expect(namesTheSameFund('R-CO VALOR', 'R CO VALOR')).toBe(true);
  });

  it('refuses another fund, and an absent name', () => {
    // The load-bearing half: a name that merely resembles another one is another fund, and a
    // symbol we cannot name is a symbol we may not quote.
    expect(
      namesTheSameFund('Fidelity Funds - Global Dividend Fund', 'Fidelity Global Dividend Fund Series T5 LSC')
    ).toBe(false);
    expect(namesTheSameFund('Fidelity Global Dividend Fund', 'R-co Valor C EUR')).toBe(false);
    expect(namesTheSameFund('Fidelity Global Dividend Fund', undefined)).toBe(false);
    expect(namesTheSameFund(undefined, 'Fidelity Global Dividend Fund')).toBe(false);
    expect(namesTheSameFund('', '')).toBe(false);
  });
});
