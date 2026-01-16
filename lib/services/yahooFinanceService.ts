/**
 * Yahoo Finance Integration Service
 *
 * Provides real-time stock/ETF price quotes using yahoo-finance2 library.
 *
 * Features:
 * - Single ticker quotes: getQuote()
 * - Batch quotes: getMultipleQuotes() (parallel fetching with Promise.allSettled)
 * - Ticker search: searchTicker()
 * - Ticker validation: validateTicker()
 *
 * Error Handling Strategy:
 * Returns null prices on failure rather than throwing errors, allowing callers
 * to decide how to handle missing data (e.g., keep old price, show warning, etc.).
 */

import YahooFinance from 'yahoo-finance2';

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
 * @param ticker - Stock/ETF ticker symbol (e.g., "AAPL", "VWCE.DE")
 * @returns Quote result with price and currency, or null price with error message
 */
export async function getQuote(ticker: string): Promise<QuoteResult> {
  try {
    const quote = await yahooFinance.quote(ticker);

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
 * Validate if a ticker exists and can be fetched
 *
 * @param ticker - Ticker symbol to validate
 * @returns True if ticker exists and has a price, false otherwise
 */
export async function validateTicker(ticker: string): Promise<boolean> {
  try {
    const quote = await yahooFinance.quote(ticker);
    return !!quote && !!quote.regularMarketPrice;
  } catch (error) {
    console.error(`Error validating ticker ${ticker}:`, error);
    return false;
  }
}

/**
 * Search for tickers by name or symbol
 *
 * @param query - Search query (company name or ticker symbol)
 * @returns Array of matching results (limited to top 10)
 */
export async function searchTicker(
  query: string
): Promise<Array<{ symbol: string; name: string; exchange: string }>> {
  try {
    const results = await yahooFinance.search(query);

    if (!results || !results.quotes) {
      return [];
    }

    return results.quotes
      .filter((quote) => quote.symbol && quote.shortname)
      .map((quote) => ({
        symbol: (quote.symbol || '') as string,
        name: (quote.shortname || quote.longname || '') as string,
        exchange: (quote.exchange || '') as string,
      }))
      .slice(0, 10); // Limit to top 10 results
  } catch (error) {
    console.error('Error searching ticker:', error);
    return [];
  }
}

/**
 * Helper to check if asset type requires price updates
 *
 * Determines which asset types support automatic price updates from market data.
 *
 * @param assetType - Asset class (equity, bonds, cash, realestate, etc.)
 * @param subCategory - Asset subcategory (e.g., "Private Equity")
 * @returns True if asset supports price updates, false otherwise
 */
export function shouldUpdatePrice(assetType: string, subCategory?: string): boolean {
  // Real estate and private equity have fixed/manual valuations (not market-traded)
  // These assets require manual price updates based on appraisals, not market quotes
  if (assetType === 'realestate' || subCategory === 'Private Equity') {
    return false;
  }

  // Cash always has price = 1 (no updates needed)
  // Cash is the base unit of measurement, not a traded asset
  if (assetType === 'cash') {
    return false;
  }

  return true;
}
