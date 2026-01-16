/**
 * Currency Conversion Service
 *
 * Provides exchange rate conversion using Frankfurter API (free, no API key required).
 * Implements in-memory caching with 24-hour TTL to minimize API calls.
 *
 * Cache Strategy:
 * - 24-hour TTL balances data freshness with API usage (exchange rates don't change frequently)
 * - Frankfurter has no explicit rate limits, but good practice to minimize calls
 * - Expired cache used as fallback on API failure (graceful degradation)
 *
 * Supported currencies: EUR, USD, GBP, CHF
 */

const FRANKFURTER_API_BASE = 'https://api.frankfurter.app';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ExchangeRateCache {
  rate: number;
  timestamp: number;
}

// In-memory cache: { "USD_EUR": { rate: 0.92, timestamp: 1234567890 } }
const rateCache = new Map<string, ExchangeRateCache>();

/**
 * Get exchange rate from fromCurrency to EUR
 * Uses cache if available and not expired
 *
 * @param fromCurrency - Source currency code (e.g., "USD", "GBP")
 * @returns Exchange rate to convert fromCurrency to EUR
 */
export async function getExchangeRateToEur(fromCurrency: string): Promise<number> {
  // EUR to EUR is always 1
  if (fromCurrency.toUpperCase() === 'EUR') {
    return 1;
  }

  const cacheKey = `${fromCurrency.toUpperCase()}_EUR`;
  const now = Date.now();

  // Check cache first to minimize API calls
  // This reduces latency and prevents hitting potential rate limits
  const cached = rateCache.get(cacheKey);
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`[CurrencyConversion] Using cached rate for ${cacheKey}: ${cached.rate}`);
    return cached.rate;
  }

  // Fetch from API
  try {
    console.log(`[CurrencyConversion] Fetching exchange rate for ${fromCurrency} -> EUR`);
    const url = `${FRANKFURTER_API_BASE}/latest?from=${fromCurrency.toUpperCase()}&to=EUR`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Frankfurter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // API response format: { "rates": { "EUR": 0.92 }, "base": "USD", "date": "2025-01-15" }
    const rate = data.rates?.EUR;

    if (!rate || typeof rate !== 'number') {
      throw new Error(`Invalid exchange rate response for ${fromCurrency}`);
    }

    // Update cache
    rateCache.set(cacheKey, { rate, timestamp: now });
    console.log(`[CurrencyConversion] Cached new rate for ${cacheKey}: ${rate}`);

    return rate;
  } catch (error) {
    console.error(`[CurrencyConversion] Error fetching exchange rate for ${fromCurrency}:`, error);

    // Graceful degradation: use expired cache as fallback on API failure
    // A stale exchange rate (e.g., 1-2 days old) is better than failing the entire
    // dividend creation/conversion process. Exchange rates typically don't change drastically.
    if (cached) {
      console.warn(`[CurrencyConversion] Using expired cache as fallback for ${cacheKey}: ${cached.rate}`);
      return cached.rate;
    }

    // Last resort: throw error if no cache available
    throw new Error(`Failed to fetch exchange rate for ${fromCurrency} -> EUR`);
  }
}

/**
 * Convert amount from any currency to EUR
 *
 * @param amount - Amount in source currency
 * @param fromCurrency - Source currency code (e.g., "USD", "GBP", "CHF")
 * @returns Amount converted to EUR
 */
export async function convertToEur(amount: number, fromCurrency: string): Promise<number> {
  if (fromCurrency.toUpperCase() === 'EUR') {
    return amount;
  }

  const rate = await getExchangeRateToEur(fromCurrency);
  const convertedAmount = amount * rate;

  console.log(`[CurrencyConversion] Converted ${amount} ${fromCurrency} to ${convertedAmount.toFixed(2)} EUR (rate: ${rate})`);

  return convertedAmount;
}

/**
 * Convert multiple amounts from the same currency to EUR in a single operation
 * More efficient than calling convertToEur() multiple times
 *
 * @param amounts - Array of amounts in source currency
 * @param fromCurrency - Source currency code
 * @returns Array of amounts converted to EUR
 */
export async function convertMultipleToEur(
  amounts: number[],
  fromCurrency: string
): Promise<number[]> {
  if (fromCurrency.toUpperCase() === 'EUR') {
    return amounts;
  }

  const rate = await getExchangeRateToEur(fromCurrency);
  return amounts.map(amount => amount * rate);
}

/**
 * Clear the exchange rate cache
 * Useful for testing or forcing a refresh
 */
export function clearExchangeRateCache(): void {
  rateCache.clear();
  console.log('[CurrencyConversion] Cache cleared');
}

/**
 * Get current cache status (for debugging)
 */
export function getCacheStatus(): { key: string; rate: number; age: number }[] {
  const now = Date.now();
  return Array.from(rateCache.entries()).map(([key, cached]) => ({
    key,
    rate: cached.rate,
    age: Math.floor((now - cached.timestamp) / 1000 / 60), // age in minutes
  }));
}
