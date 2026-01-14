import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';

/**
 * POST /api/portfolio/snapshot/manual
 *
 * Create manual snapshot with explicit data (no automatic calculations)
 *
 * Use Case:
 *   - Import historical snapshots from external sources
 *   - Override automated snapshot calculations
 *   - Bulk snapshot creation from CSV imports
 *
 * Differences from /api/portfolio/snapshot:
 *   - Requires complete snapshot data in request body
 *   - No price fetching or calculation steps
 *   - More extensive validation (all fields required)
 *   - Always triggers Hall of Fame update (server-side)
 *
 * Request Body (all fields required):
 *   {
 *     userId: string,
 *     year: number,              // 1900-2100
 *     month: number,             // 1-12
 *     totalNetWorth: number,
 *     liquidNetWorth: number,
 *     illiquidNetWorth: number,
 *     byAssetClass: { [key: string]: number },
 *     assetAllocation: { [key: string]: number },
 *     byAsset?: Array<{
 *       assetId: string,
 *       ticker: string,
 *       name: string,
 *       quantity: number,
 *       price: number,
 *       totalValue: number
 *     }>
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     snapshotId: string,  // Format: "{userId}-{year}-{MM}"
 *     message: string
 *   }
 *
 * Related:
 *   - portfolio/snapshot/route.ts: Automated snapshot creation
 *   - hallOfFameService.server.ts: Triggered on success
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      year,
      month,
      totalNetWorth,
      liquidNetWorth,
      illiquidNetWorth,
      byAssetClass,
      byAsset,
      assetAllocation,
    } = body;

    // ========== Required Field Validation ==========
    //
    // Manual snapshots require all data upfront (no automatic calculation)
    // Validation order: Basic fields → Numeric fields → Object fields → Ranges
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (!year || !month) {
      return NextResponse.json(
        { error: 'year and month are required' },
        { status: 400 }
      );
    }

    if (totalNetWorth === undefined || totalNetWorth === null) {
      return NextResponse.json(
        { error: 'totalNetWorth is required' },
        { status: 400 }
      );
    }

    if (liquidNetWorth === undefined || liquidNetWorth === null) {
      return NextResponse.json(
        { error: 'liquidNetWorth is required' },
        { status: 400 }
      );
    }

    if (illiquidNetWorth === undefined || illiquidNetWorth === null) {
      return NextResponse.json(
        { error: 'illiquidNetWorth is required' },
        { status: 400 }
      );
    }

    if (!byAssetClass || typeof byAssetClass !== 'object') {
      return NextResponse.json(
        { error: 'byAssetClass is required and must be an object' },
        { status: 400 }
      );
    }

    if (!assetAllocation || typeof assetAllocation !== 'object') {
      return NextResponse.json(
        { error: 'assetAllocation is required and must be an object' },
        { status: 400 }
      );
    }

    // ========== Range Validation ==========
    //
    // Year range validation: 1900-2100
    //
    // Why these bounds?
    //   - 1900: Reasonable lower bound for historical financial data
    //   - 2100: Future-proofing without allowing absurd values (year 9999)
    //   - Prevents: Typos (202 instead of 2024), date parsing errors
    //
    // Edge case: Year 2100 will need updating
    // TODO(2099-01-01): Extend upper bound to 2200
    if (year < 1900 || year > 2100) {
      return NextResponse.json(
        { error: 'Invalid year' },
        { status: 400 }
      );
    }

    if (month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'Invalid month (must be 1-12)' },
        { status: 400 }
      );
    }

    // Snapshot document ID format: "{userId}-{year}-{MM}"
    //
    // Examples:
    //   user123-2024-01
    //   user123-2024-12
    //
    // Design considerations:
    //   - Composite key enables:
    //     - One snapshot per user per month (automatic upsert)
    //     - Efficient queries by userId prefix
    //     - Sortable by month (lexicographic ordering)
    //   - Month zero-padded: "2024-01" sorts before "2024-12"
    //   - Alternative considered: Auto-generated IDs
    //     Rejected: Would allow duplicate snapshots per month
    const snapshotId = `${userId}-${year}-${month}`;

    // Create snapshot object
    const snapshot = {
      userId,
      year,
      month,
      totalNetWorth,
      liquidNetWorth,
      illiquidNetWorth,
      byAssetClass,
      byAsset: byAsset || [],
      assetAllocation,
      createdAt: Timestamp.now(),
    };

    // Save to Firestore
    await adminDb.collection('monthly-snapshots').doc(snapshotId).set(snapshot);

    // Update Hall of Fame rankings after snapshot creation
    //
    // Error handling: Non-critical failure (snapshot still succeeds)
    //
    // Rationale:
    //   - Hall of Fame is a secondary feature (nice-to-have, not essential)
    //   - Snapshot data is the critical operation (must succeed)
    //   - Ranking errors (e.g., DB timeout) shouldn't block snapshot imports
    //   - User can manually recalculate rankings later if needed
    //
    // This mirrors the error handling in cron/monthly-snapshot/route.ts
    try {
      await updateHallOfFame(userId);
      console.log('Hall of Fame updated successfully after manual snapshot');
    } catch (error) {
      console.error('Error updating Hall of Fame:', error);
      // Snapshot succeeds even if Hall of Fame update fails
    }

    return NextResponse.json({
      success: true,
      snapshotId,
      message: 'Manual snapshot created successfully',
    });
  } catch (error) {
    console.error('Error creating manual snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to create manual snapshot' },
      { status: 500 }
    );
  }
}
