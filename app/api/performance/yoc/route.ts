import { NextRequest, NextResponse } from 'next/server';
import { getAllDividends } from '@/lib/services/dividendService';
import { calculateYocMetrics } from '@/lib/services/performanceService';
import { getUserAssetsAdmin, getUserSnapshotsAdmin } from '@/lib/server/assetAdminRepository';
import { deriveHoldingStartDates } from '@/lib/utils/snapshotAssetBreakdown';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';


/**
 * GET /api/performance/yoc
 *
 * Calculate Yield on Cost (YOC) metrics for a specific period
 *
 * Query params:
 * - userId: User ID (required)
 * - startDate: Period start date ISO string (required)
 * - dividendEndDate: Period end date ISO string (required, MUST be capped at today)
 * - numberOfMonths: Duration in months for annualization (required)
 *
 * Returns:
 * - yocGross: YOC based on gross dividends (%)
 * - yocNet: YOC based on net dividends (%)
 * - yocDividendsGross: Total gross dividends in period
 * - yocDividendsNet: Total net dividends in period
 * - yocCostBasis: Total cost basis
 * - yocAssetCount: Number of assets included
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
    await assertCanAccessAccount(decodedToken, userId);
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

    // Calculate YOC metrics
    const yocMetrics = calculateYocMetrics(
      allDividends,
      assetsWithHolding,
      startDate,
      dividendEndDate,
      numberOfMonths
    );

    return NextResponse.json(yocMetrics);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('[API /performance/yoc] Error calculating YOC:', error);
    return NextResponse.json(
      { error: 'Failed to calculate YOC metrics' },
      { status: 500 }
    );
  }
}
