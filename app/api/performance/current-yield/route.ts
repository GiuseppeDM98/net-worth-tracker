import { NextRequest, NextResponse } from 'next/server';
import { getAllDividends } from '@/lib/services/dividendService';
import { calculateCurrentYieldMetrics } from '@/lib/services/performanceService';
import { getUserAssetsAdmin, getUserSnapshotsAdmin } from '@/lib/server/assetAdminRepository';
import { deriveHoldingStartDates } from '@/lib/utils/snapshotAssetBreakdown';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';

/**
 * GET /api/performance/current-yield
 *
 * Calculate Current Yield metrics for a specific period
 *
 * Current Yield measures annualized dividend yield based on current market value,
 * unlike YOC which uses original cost basis. This shows what an investor would
 * earn TODAY if purchasing the portfolio at current prices.
 *
 * Query params:
 * - userId: User ID (required)
 * - startDate: Period start date ISO string (required)
 * - dividendEndDate: Period end date ISO string (required, MUST be capped at today)
 * - numberOfMonths: Duration in months for annualization (required)
 *
 * Returns:
 * - currentYield: Current yield percentage (gross)
 * - currentYieldNet: Current yield percentage (net, after tax)
 * - currentYieldDividends: Total gross dividends in period (not annualized)
 * - currentYieldDividendsNet: Total net dividends in period (not annualized)
 * - currentYieldPortfolioValue: Current market value of dividend-paying assets
 * - currentYieldAssetCount: Number of assets included
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const startDateStr = searchParams.get('startDate');
    const dividendEndDateStr = searchParams.get('dividendEndDate');
    const numberOfMonthsStr = searchParams.get('numberOfMonths');

    // Validate required parameters
    assertSameUser(decodedToken, userId);
    const authenticatedUserId = userId as string;

    if (!startDateStr || !dividendEndDateStr || !numberOfMonthsStr) {
      return NextResponse.json(
        { error: 'Missing required parameters: startDate, dividendEndDate, numberOfMonths' },
        { status: 400 }
      );
    }

    // Parse dates and numberOfMonths
    const startDate = new Date(startDateStr);
    const dividendEndDate = new Date(dividendEndDateStr);
    const numberOfMonths = parseInt(numberOfMonthsStr, 10);

    if (isNaN(startDate.getTime()) || isNaN(dividendEndDate.getTime()) || isNaN(numberOfMonths)) {
      return NextResponse.json(
        { error: 'Invalid date or numberOfMonths format' },
        { status: 400 }
      );
    }

    // Fetch dividends, assets and snapshots server-side using Firebase Admin SDK
    const [allDividends, allAssets, snapshots] = await Promise.all([
      getAllDividends(authenticatedUserId),
      getUserAssetsAdmin(authenticatedUserId),
      getUserSnapshotsAdmin(authenticatedUserId),
    ]);

    // Tag each asset with the start of its current holding so the engine ignores dividends from a
    // previous, discontinuous holding (an instrument sold then rebought keeps the same id).
    const holdingStarts = deriveHoldingStartDates(snapshots);
    const assetsWithHolding = allAssets.map(asset => ({
      ...asset,
      // Prefer the exact start stamped at (re)purchase; fall back to the snapshot-derived value
      // for assets rebought before holdingStartDate was recorded.
      holdingStartDate: asset.holdingStartDate ?? holdingStarts.get(asset.id),
    }));

    // Calculate Current Yield metrics
    const currentYieldMetrics = calculateCurrentYieldMetrics(
      allDividends,
      assetsWithHolding,
      startDate,
      dividendEndDate,
      numberOfMonths
    );

    return NextResponse.json(currentYieldMetrics);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('[API /performance/current-yield] Error calculating Current Yield:', error);
    return NextResponse.json(
      { error: 'Failed to calculate Current Yield metrics' },
      { status: 500 }
    );
  }
}
