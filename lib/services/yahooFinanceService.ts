import yahooFinance from 'yahoo-finance2';

export interface QuoteResult {
  ticker: string;
  price: number | null;
  currency: string;
  error?: string;
}

/**
 * Get current quote for a single ticker
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
        symbol: quote.symbol || '',
        name: quote.shortname || quote.longname || '',
        exchange: quote.exchange || '',
      }))
      .slice(0, 10); // Limit to top 10 results
  } catch (error) {
    console.error('Error searching ticker:', error);
    return [];
  }
}

/**
 * Helper to check if asset type requires price updates
 */
export function shouldUpdatePrice(assetType: string, subCategory?: string): boolean {
  // Real estate and private equity have fixed valuations
  if (assetType === 'realestate' || subCategory === 'Private Equity') {
    return false;
  }

  // Cash always has price = 1
  if (assetType === 'cash') {
    return false;
  }

  return true;
}
