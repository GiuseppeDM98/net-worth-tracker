import { NextRequest, NextResponse } from 'next/server';
import { getBondPriceByIsin } from '@/lib/services/borsaItalianaBondScraperService';

/**
 * GET /api/prices/bond-quote?isin=IT0005672024
 *
 * Test endpoint for Borsa Italiana bond price scraper.
 * Useful for manual validation and debugging.
 *
 * Query Parameters:
 *   @param isin - Bond ISIN code
 *
 * Response:
 *   {
 *     isin: string,
 *     price: number | null,
 *     currency: string,
 *     priceType: 'ultimo' | 'ufficiale' | 'apertura',
 *     lastUpdate?: Date,
 *     error?: string
 *   }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const isin = searchParams.get('isin');

    if (!isin) {
      return NextResponse.json(
        { error: 'ISIN parameter is required' },
        { status: 400 }
      );
    }

    // Call scraper
    const result = await getBondPriceByIsin(isin);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in bond-quote API:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch bond quote',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
