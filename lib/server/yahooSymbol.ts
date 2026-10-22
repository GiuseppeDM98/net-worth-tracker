/**
 * The symbol Yahoo quotes for an ISIN — the ONE resolver, for the price and the exposure alike.
 *
 * WHY. Yahoo quotes no ISIN: `quote('LU0605515377')` answers nothing, and a broker that publishes
 * only an ISIN leaves the asset with the ISIN as its ticker. The symbol has to be FOUND, and a
 * symbol nobody checked is a wrong price (or another fund's holdings) on a real asset.
 *
 * THE ORDER, and the reason for it:
 *  1. the WRITTEN catalogue (`lib/utils/yahooSymbolForIsin.ts`) — measured by hand, free, and the
 *     answer for the funds the brokers sell;
 *  2. yahoo-finance2's own SEARCH for the ISIN, and the symbol it names is MEASURED before it is
 *     used: the search names the fund, the symbol's own price names what that symbol quotes, and
 *     the two must be the same fund (`namesTheSameFund` — the rule the catalogue was measured
 *     with, so a written row and a runtime answer are judged by ONE yardstick).
 *
 * WHAT IS REFUSED. A symbol Yahoo will not describe is not used: its name cannot be compared, and
 * an unchecked symbol is another fund's price. An ISIN the library cannot name keeps the ISIN it
 * had — an unquotable position, never a wrong one (measured: `LU0119620416` has no listing on
 * Yahoo at all).
 *
 * The found symbols are remembered for the life of the process: the price cron and the exposure
 * route ask for the same instruments over and over, and a miss is NOT remembered (a search that
 * failed because Yahoo was briefly down must not poison the process for good).
 *
 * SERVER-ONLY: it calls yahoo-finance2.
 */
import YahooFinance from 'yahoo-finance2';
import {
  isIsinShaped,
  namesTheSameFund,
  resolveYahooSymbolForIsin,
} from '@/lib/utils/yahooSymbolForIsin';

const yahooFinance = new YahooFinance();

/** The symbols this process has already found and measured. */
const quotableSymbolByIsin = new Map<string, string>();

/**
 * The symbol yahoo-finance2's search names for the ISIN, MEASURED before it is used. `null` when
 * the library cannot name the fund.
 */
async function searchQuotableSymbol(isin: string): Promise<string | null> {
  const cached = quotableSymbolByIsin.get(isin);
  if (cached) return cached;

  let symbol: string | null = null;
  try {
    const result = (await yahooFinance.search(isin)) as {
      quotes?: Array<{ symbol?: string; longname?: string; shortname?: string }>;
    };
    for (const hit of result?.quotes ?? []) {
      if (!hit.symbol) continue;
      let quoteName: string | undefined;
      try {
        const summary = (await yahooFinance.quoteSummary(hit.symbol, { modules: ['price'] })) as {
          price?: { longName?: string; shortName?: string };
        };
        quoteName = summary?.price?.longName ?? summary?.price?.shortName;
      } catch {
        // A symbol Yahoo will not describe is a symbol we will not quote.
        continue;
      }
      if (namesTheSameFund(hit.longname ?? hit.shortname, quoteName)) {
        symbol = hit.symbol;
        break;
      }
    }
  } catch (error) {
    console.error(`[yahoo] ISIN search failed for ${isin}:`, error);
  }

  if (symbol) quotableSymbolByIsin.set(isin, symbol);
  return symbol;
}

/**
 * The symbol to ask Yahoo for: the ticker as it is, unless it is an ISIN — then the catalogue's
 * measured row, else the symbol the library's search names and the measurement confirms.
 */
export async function resolveQuotableSymbol(ticker: string): Promise<string> {
  const trimmed = ticker.trim();
  if (!isIsinShaped(trimmed)) return trimmed;
  const known = resolveYahooSymbolForIsin(trimmed);
  if (known) return known;
  return (await searchQuotableSymbol(trimmed.toUpperCase())) ?? trimmed;
}
