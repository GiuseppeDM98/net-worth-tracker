import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/services/yahooFinanceService';
import { convertToEur } from '@/lib/services/currencyConversionService';

/**
 * GET /api/prices/quote
 *
 * Fetch real-time price quote for a single ticker from Yahoo Finance.
 * Also normalizes GBp (pence) to GBP and pre-converts the price to EUR
 * so the client can store currentPriceEur immediately at asset creation.
 *
 * Query Parameters:
 *   @param ticker - Stock/ETF ticker symbol (e.g., "AAPL", "VOO")
 *
 * Response:
 *   {
 *     ticker: string,
 *     price: number,        // normalized price (GBp → GBP)
 *     currency: string,     // normalized currency (GBp → GBP)
 *     currentPriceEur?: number  // price converted to EUR (omitted for EUR assets or on FX failure)
 *   }
 *
 * Related:
 *   - yahooFinanceService.ts: Quote fetching implementation
 *   - currencyConversionService.ts: Frankfurter FX conversion
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker');

    if (!ticker) {
      return NextResponse.json(
        { error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const quote = await getQuote(ticker);

    // Normalize GBp (pence) → GBP (pounds) for LSE tickers.
    // Yahoo Finance returns prices in pence for UK-listed assets (e.g. SWDA.L: 4874 GBp = 48.74 GBP).
    // Mirror the same normalization done in priceUpdater.ts.
    const isGBp = quote.currency === 'GBp';
    const normalizedPrice = isGBp && quote.price ? quote.price / 100 : quote.price;
    const normalizedCurrency = isGBp ? 'GBP' : quote.currency;

    let currentPriceEur: number | undefined;

    if (normalizedPrice && normalizedPrice > 0 && normalizedCurrency && normalizedCurrency.toUpperCase() !== 'EUR') {
      try {
        currentPriceEur = await convertToEur(normalizedPrice, normalizedCurrency);
      } catch (fxError) {
        // FX failure is non-fatal: the client falls back to showing the native price.
        // currentPriceEur will be populated on the next price-update run.
        console.warn(`[/api/prices/quote] FX conversion failed for ${ticker} (${normalizedCurrency}→EUR):`, fxError);
      }
    }

    return NextResponse.json({
      ...quote,
      price: normalizedPrice,
      currency: normalizedCurrency,
      ...(currentPriceEur !== undefined ? { currentPriceEur } : {}),
    });
  } catch (error) {
    console.error('Error fetching quote:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}
