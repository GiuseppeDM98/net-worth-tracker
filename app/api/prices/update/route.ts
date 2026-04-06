import { NextRequest, NextResponse } from 'next/server';
import { updateUserAssetPrices } from '@/lib/helpers/priceUpdater';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';

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
    const decodedToken = await requireFirebaseAuth(request);
    // Get user ID from request
    const body = await request.json();
    const { userId } = body;

    assertSameUser(decodedToken, userId);

    // Update prices using the shared helper function
    const result = await updateUserAssetPrices(userId);
    await invalidateDashboardOverviewSummaryServer(userId, 'asset_prices_updated');

    return NextResponse.json(result);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error updating prices:', error);
    return NextResponse.json(
      { error: 'Failed to update prices', details: (error as Error).message },
      { status: 500 }
    );
  }
}
