import { NextRequest, NextResponse } from 'next/server';
import { getQuote } from '@/lib/services/yahooFinanceService';

/**
 * GET /api/prices/quote
 *
 * Fetch real-time price quote for a single ticker from Yahoo Finance
 *
 * Query Parameters:
 *   @param ticker - Stock/ETF ticker symbol (e.g., "AAPL", "VOO")
 *
 * Response:
 *   {
 *     symbol: string,
 *     price: number,
 *     currency: string,
 *     name: string,
 *     exchange: string
 *   }
 *
 * Related:
 *   - yahooFinanceService.ts: Quote fetching implementation
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

    return NextResponse.json(quote);
  } catch (error) {
    console.error('Error fetching quote:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote' },
      { status: 500 }
    );
  }
}
