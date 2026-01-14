import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { Asset, MonthlySnapshot } from '@/types/assets';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateLiquidNetWorth,
  calculateIlliquidNetWorth,
} from '@/lib/services/assetService';
import { calculateCurrentAllocation } from '@/lib/services/assetAllocationService';
import { updateUserAssetPrices } from '@/lib/helpers/priceUpdater';

const SNAPSHOTS_COLLECTION = 'monthly-snapshots';

/**
 * POST /api/portfolio/snapshot
 *
 * Create or update monthly snapshot of portfolio state
 *
 * Orchestrates multiple services:
 *   1. Price updates (Yahoo Finance)
 *   2. Asset value calculations
 *   3. Allocation calculations
 *   4. Snapshot persistence
 *
 * Request Body:
 *   {
 *     userId: string,
 *     year?: number,      // Optional: defaults to current Italy year
 *     month?: number,     // Optional: defaults to current Italy month (1-12)
 *     cronSecret?: string // Optional: for cron job authorization
 *   }
 *
 * Snapshot Structure:
 *   - One document per user per month
 *   - Document ID: "{userId}-{year}-{MM}"
 *   - Contains: net worth, allocations, per-asset breakdown
 *
 * Idempotency:
 *   - If snapshot exists for year/month: Updates (overwrites)
 *   - If new: Creates
 *   - Uses Firestore .set() (not .add()) for upsert behavior
 *
 * Hall of Fame Integration:
 *   - NOT called here (see lines 120-121)
 *   - Client-side triggers update after success
 *   - Rationale: Client controls timing for UI feedback
 *
 * Related:
 *   - portfolio/snapshot/manual/route.ts: Manual snapshot with validation
 *   - cron/monthly-snapshot/route.ts: Scheduled monthly snapshots
 *   - hallOfFameService.server.ts: Ranking updates
 */
export async function POST(request: NextRequest) {
  try {
    // Get user ID and optional year/month from request
    const body = await request.json();
    const { userId, year, month, cronSecret } = body;

    // Verify cron secret if provided (for scheduled jobs)
    if (cronSecret && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Invalid cron secret' },
        { status: 401 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      );
    }

    // Attempt fresh price updates before snapshot
    //
    // Error handling strategy: Non-blocking, use stale prices if update fails
    //
    // Why continue on failure?
    //   - Yahoo Finance API occasionally times out or rate-limits
    //   - Assets already have lastPriceUpdate from previous successful fetches
    //   - Better to have snapshot with slightly stale prices than no snapshot
    //   - Monthly snapshots are meant for historical trends, not real-time tracking
    //
    // Alternative considered: Fail snapshot if prices fail
    //   Rejected: Creates brittleness in automated monthly snapshots
    //   Single API failure would break entire snapshot creation
    console.log(`Updating prices for user ${userId}...`);
    try {
      const priceUpdateResult = await updateUserAssetPrices(userId);
      console.log(`Price update result: ${priceUpdateResult.message}`);
    } catch (error) {
      console.error('Error updating prices:', error);
      // Continue with existing prices (potentially stale)
    }

    // Get all assets for the user using Firebase Admin SDK
    const assetsRef = adminDb.collection('assets');
    const snapshot = await assetsRef.where('userId', '==', userId).get();

    if (snapshot.empty) {
      return NextResponse.json({
        success: false,
        message: 'No assets found for user',
        snapshotId: null,
      });
    }

    const assets: Asset[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Asset[];

    // Use Italy timezone for month/year calculation
    //
    // Critical for consistent snapshot timing:
    //   - Server runs in UTC (Vercel default)
    //   - Cron triggers at 00:00 UTC = 01:00 or 02:00 CET (depends on DST)
    //   - Without timezone adjustment: Snapshot created for "yesterday" in Italy
    //
    // Example without adjustment:
    //   Cron runs: 2024-03-01 00:30 UTC
    //   UTC month: March (3)
    //   Italy time: 2024-02-29 01:30 CET (still February!)
    //   Result: Would create March snapshot before February ends in Italy
    //
    // getItalyMonthYear() ensures snapshots align with Italian investor's
    // local calendar month boundaries
    const { month: currentMonth, year: currentYear } = (await import('@/lib/utils/dateHelpers')).getItalyMonthYear();
    const snapshotYear = year ?? currentYear;
    const snapshotMonth = month ?? currentMonth;

    const totalNetWorth = calculateTotalValue(assets);
    const liquidNetWorth = calculateLiquidNetWorth(assets);
    const illiquidNetWorth = calculateIlliquidNetWorth(assets);
    const allocation = calculateCurrentAllocation(assets);

    // Convert absolute allocation values to percentages for historical charts
    //
    // Data transformation:
    //   Input:  allocation.byAssetClass = { equity: 50000, bonds: 30000, cash: 20000 }
    //   Output: assetAllocation = { equity: 50, bonds: 30, cash: 20 }
    //
    // Why store both absolute and percentage?
    //   - byAssetClass: Absolute values for net worth calculations
    //   - assetAllocation: Percentages for allocation drift charts over time
    //
    // Historical context: Early versions only stored percentages
    // Added absolute values in v2 to enable net worth trend charts
    // Kept percentages for backward compatibility and chart simplicity
    const assetAllocation: { [assetClass: string]: number } = {};
    Object.keys(allocation.byAssetClass).forEach((assetClass) => {
      assetAllocation[assetClass] =
        totalNetWorth > 0
          ? (allocation.byAssetClass[assetClass] / totalNetWorth) * 100
          : 0;
    });

    const byAsset = assets.map((asset) => ({
      assetId: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      quantity: asset.quantity,
      price: asset.currentPrice,
      totalValue: calculateAssetValue(asset),
    }));

    const snapshotId = `${userId}-${snapshotYear}-${String(
      snapshotMonth
    ).padStart(2, '0')}`;

    // Check if snapshot already exists
    const existingSnapshotRef = adminDb
      .collection(SNAPSHOTS_COLLECTION)
      .doc(snapshotId);
    const existingSnapshot = await existingSnapshotRef.get();

    const snapshotData: Omit<MonthlySnapshot, 'createdAt'> & {
      createdAt: FirebaseFirestore.Timestamp;
    } = {
      userId,
      year: snapshotYear,
      month: snapshotMonth,
      totalNetWorth,
      liquidNetWorth,
      illiquidNetWorth,
      byAssetClass: allocation.byAssetClass,
      byAsset,
      assetAllocation,
      createdAt: Timestamp.now(),
    };

    // Save snapshot
    await existingSnapshotRef.set(snapshotData);

    // Hall of Fame Integration: Client-side trigger pattern
    //
    // Design Decision: Client calls updateHallOfFame after snapshot success
    // See: app/dashboard/page.tsx createSnapshot function
    //
    // Why not update here?
    //   - Client wants to show loading state during Hall of Fame calculation
    //   - Allows UI to display success message before expensive ranking recalc
    //   - Separates snapshot creation (fast) from ranking (slow, O(n²))
    //
    // Other update locations:
    //   ✓ portfolio/snapshot/manual/route.ts: Server-side trigger
    //   ✓ cron/monthly-snapshot/route.ts: Server-side trigger
    //
    // If adding new snapshot endpoints:
    //   Consider whether client or server should trigger Hall of Fame update
    //   based on whether UI needs to show progress feedback

    return NextResponse.json({
      success: true,
      message: existingSnapshot.exists
        ? 'Snapshot updated successfully'
        : 'Snapshot created successfully',
      snapshotId,
      data: {
        year: snapshotYear,
        month: snapshotMonth,
        totalNetWorth,
        liquidNetWorth,
        assetsCount: assets.length,
      },
    });
  } catch (error) {
    console.error('Error creating snapshot:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create snapshot',
        details: (error as Error).message
      },
      { status: 500 }
    );
  }
}
