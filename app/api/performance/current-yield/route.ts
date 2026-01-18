import { NextRequest, NextResponse } from 'next/server';
import { getAllDividends } from '@/lib/services/dividendService';
import { calculateCurrentYieldMetrics } from '@/lib/services/performanceService';
import { adminDb } from '@/lib/firebase/admin';
import { Asset } from '@/types/assets';

/**
 * Fetch all assets for a user using Firebase Admin SDK (server-side only)
 * This is needed because assetService.ts uses client SDK which doesn't work in API routes
 */
async function getUserAssetsAdmin(userId: string): Promise<Asset[]> {
  try {
    const querySnapshot = await adminDb
      .collection('assets')
      .where('userId', '==', userId)
      .get();

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      lastPriceUpdate: doc.data().lastPriceUpdate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Asset[];
  } catch (error) {
    console.error('[getUserAssetsAdmin] Error fetching assets:', error);
    throw new Error('Failed to fetch assets');
  }
}

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
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const startDateStr = searchParams.get('startDate');
    const dividendEndDateStr = searchParams.get('dividendEndDate');
    const numberOfMonthsStr = searchParams.get('numberOfMonths');

    // Validate required parameters
    if (!userId || !startDateStr || !dividendEndDateStr || !numberOfMonthsStr) {
      return NextResponse.json(
        { error: 'Missing required parameters: userId, startDate, dividendEndDate, numberOfMonths' },
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

    // Fetch dividends and assets server-side using Firebase Admin SDK
    const [allDividends, allAssets] = await Promise.all([
      getAllDividends(userId),
      getUserAssetsAdmin(userId),
    ]);

    // Calculate Current Yield metrics
    const currentYieldMetrics = calculateCurrentYieldMetrics(
      allDividends,
      allAssets,
      startDate,
      dividendEndDate,
      numberOfMonths
    );

    return NextResponse.json(currentYieldMetrics);
  } catch (error) {
    console.error('[API /performance/current-yield] Error calculating Current Yield:', error);
    return NextResponse.json(
      { error: 'Failed to calculate Current Yield metrics' },
      { status: 500 }
    );
  }
}
