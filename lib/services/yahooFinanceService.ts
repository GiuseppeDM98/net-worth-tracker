/**
 * Yahoo Finance Integration Service
 *
 * Provides real-time stock/ETF price quotes using yahoo-finance2 library.
 *
 * Features:
 * - Single ticker quotes: getQuote()
 * - Batch quotes: getMultipleQuotes() (parallel fetching with Promise.allSettled)
 *
 * AN ISIN IS QUOTED THROUGH THE LIBRARY. A broker that publishes only an ISIN leaves the asset
 * with the ISIN as its ticker, and Yahoo quotes no ISIN: `quote('LU0605515377')` answers nothing
 * (measured), while the symbol the library's own search names for that ISIN (`FPIJ.F`) quotes the
 * same fund at the same price (37,633 € — the broker's own file says 37,74 €). The symbol is
 * found and MEASURED by `lib/server/yahooSymbol.ts`, the ONE resolver the exposure reads too.
 *
 * Error Handling Strategy:
 * Returns null prices on failure rather than throwing errors, allowing callers
 * to decide how to handle missing data (e.g., keep old price, show warning, etc.).
 */

import YahooFinance from 'yahoo-finance2';
import { hasMarketPrice } from '@/lib/utils/assetPricing';
import { resolveQuotableSymbol } from '@/lib/server/yahooSymbol';

// Create YahooFinance instance (required in v3+)
const yahooFinance = new YahooFinance();

export interface QuoteResult {
  ticker: string;
  price: number | null;
  currency: string;
  error?: string;
}

/**
 * Get current quote for a single ticker
 *
 * @param ticker - Stock/ETF ticker symbol (e.g., "AAPL", "VWCE.DE") or an ISIN
 * @returns Quote result with price and currency, or null price with error message
 */
export async function getQuote(ticker: string): Promise<QuoteResult> {
  try {
    const symbol = await resolveQuotableSymbol(ticker);
    const quote = await yahooFinance.quote(symbol);

    if (!quote || !quote.regularMarketPrice) {
      return {
        ticker,
        price: null,
        currency: quote?.currency || 'EUR',
        error: 'Price not available',
      };
    }

    return {
      ticker,
      price: quote.regularMarketPrice,
      currency: quote.currency || 'EUR',
    };
  } catch (error) {
    console.error(`Error fetching quote for ${ticker}:`, error);
    return {
      ticker,
      price: null,
      currency: 'EUR',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get quotes for multiple tickers (batch operation)
 *
 * Fetches all tickers in parallel for efficiency. Uses Promise.allSettled
 * to continue processing even if some tickers fail.
 *
 * @param tickers - Array of ticker symbols to fetch
 * @returns Map of ticker → quote result
 */
export async function getMultipleQuotes(
  tickers: string[]
): Promise<Map<string, QuoteResult>> {
  const results = new Map<string, QuoteResult>();

  // Process all tickers in parallel
  const promises = tickers.map(async (ticker) => {
    const result = await getQuote(ticker);
    return { ticker, result };
  });

  // Use Promise.allSettled instead of Promise.all to continue processing
  // even if some tickers fail (e.g., invalid symbols, API timeouts)
  const settled = await Promise.allSettled(promises);

  settled.forEach((outcome) => {
    if (outcome.status === 'fulfilled') {
      const { ticker, result } = outcome.value;
      results.set(ticker, result);
    } else {
      console.error('Failed to fetch quote:', outcome.reason);
    }
  });

  return results;
}

/**
 * Helper to check if asset type requires price updates
 *
 * Kept as a named export because callers (priceUpdater, AssetDialog) read better with the
 * intent-revealing verb, but the rule itself lives in `lib/utils/assetPricing.ts` — the
 * single source of truth shared with the manual-price UI treatment on Patrimonio.
 *
 * @param assetType - Asset type (stock, etf, bond, crypto, commodity, cash, realestate, pensionFund)
 * @param subCategory - Asset subcategory (e.g., "Private Equity")
 * @returns True if asset supports price updates, false otherwise
 */
export function shouldUpdatePrice(assetType: string, subCategory?: string): boolean {
  return hasMarketPrice(assetType, subCategory);
}
