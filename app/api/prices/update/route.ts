import { NextRequest, NextResponse } from 'next/server';
import { updateUserAssetPrices } from '@/lib/helpers/priceUpdater';

/**
 * POST /api/prices/update
 *
 * Update current prices for all user assets from Yahoo Finance
 *
 * Request Body:
 *   {
 *     userId: string  // Required
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     message: string,
 *     updatedCount: number,
 *     failedTickers: string[]
 *   }
 *
 * Related:
 *   - priceUpdater.ts: Price fetching implementation
 *   - yahooFinanceService.ts: API integration
 */
export async function POST(request: NextRequest) {
  try {
    // Get user ID from request
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    // Update prices using the shared helper function
    const result = await updateUserAssetPrices(userId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating prices:', error);
    return NextResponse.json(
      { error: 'Failed to update prices', details: (error as Error).message },
      { status: 500 }
    );
  }
}
