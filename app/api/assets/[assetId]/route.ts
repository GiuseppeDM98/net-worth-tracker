import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { invalidateDashboardOverviewSummaryServer } from '@/lib/services/dashboardOverviewInvalidation.server';

/**
 * DELETE /api/assets/[assetId]
 *
 * Delete asset with cascade cleanup of related data
 *
 * Refused with 409 `has-ledger-operations` (and `operations`, the count) when the asset has any row in
 * the Registro operazioni other than the migration's opening position: those trades are what the
 * realized gains and Rendimenti are computed from, and a delete would orphan them (2026-11-23).
 *
 * Cascade Logic:
 *   - Asset document: Deleted
 *   - Its opening position (`isBaseline`), when it is the only row: Deleted with it
 *   - Future dividends (exDate > today): Deleted
 *   - Historical dividends (exDate <= today): Preserved
 *   - Linked expenses: Preserved (user's cashflow history); none can be a fee row of this asset's
 *     trades, since an asset with a trade is never deleted
 *
 * Why preserve historical data?
 *   - User needs historical dividend/expense records for taxes
 *   - Asset deletion represents "I no longer own this" not "this never existed"
 *   - Past cashflow impacts (expenses) should remain in financial history
 *
 * Request Body:
 *   {
 *     userId: string  // Required for ownership verification
 *   }
 *
 * URL Parameters:
 *   @param assetId - Asset document ID to delete
 *
 * Response:
 *   {
 *     success: boolean,
 *     message: string,
 *     deletedFutureDividends: number  // Count of future dividends removed
 *   }
 *
 * Security:
 *   - Uses Admin SDK (bypasses security rules)
 *   - Manual asset ownership verification required
 *
 * Related:
 *   - dividends/[dividendId]/route.ts: Delete individual dividends
 *   - assetService.ts: Asset management logic
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const { assetId } = await params;

    // Get userId from request body
    const body = await request.json();
    const { userId } = body;
    await assertCanAccessAccount(decodedToken, userId);

    // Verify asset exists and belongs to user
    const assetDoc = await adminDb.collection('assets').doc(assetId).get();

    if (!assetDoc.exists) {
      return NextResponse.json(
        { error: 'Asset not found' },
        { status: 404 }
      );
    }

    const asset = assetDoc.data();
    if (asset?.userId !== userId) {
      return NextResponse.json(
        { error: 'Asset does not belong to user' },
        { status: 403 }
      );
    }

    // The asset's whole ledger, read BEFORE anything is deleted: its own trades forbid the delete.
    const tradesSnapshot = await adminDb
      .collection('assetTransactions')
      .where('userId', '==', userId)
      .where('assetId', '==', assetId)
      .get();
    // The migration's opening position is not an operation of the owner's: it leaves with the instrument (2026-11-23).
    const ownTrades = tradesSnapshot.docs.filter((tradeDoc) => tradeDoc.data().isBaseline !== true);
    if (ownTrades.length > 0) {
      return NextResponse.json(
        { error: 'Asset has ledger operations', code: 'has-ledger-operations', operations: ownTrades.length },
        { status: 409 },
      );
    }

    // Future dividends deletion strategy: Delete > today, preserve <= today
    //
    // Calculate today at midnight for clean date-only comparison
    // (Firestore Timestamp includes time component, need consistent cutoff)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    // Query FUTURE dividends (exDate > today)
    //
    // Why only future?
    //   - Historical dividends (exDate <= today): Already paid, part of financial history
    //   - User may need for tax records, portfolio performance calculations
    //   - Future dividends: Speculative, no longer relevant if asset sold
    //
    // Example: User sells AAPL on 2024-06-15
    //   - Dividends with exDate <= 2024-06-15: Keep (user was eligible)
    //   - Dividends with exDate > 2024-06-15: Delete (user no longer owns shares)
    //
    // Note: We use exDate (not paymentDate) because exDate determines eligibility
    const dividendsSnapshot = await adminDb
      .collection('dividends')
      .where('assetId', '==', assetId)
      .where('exDate', '>', todayTimestamp)
      .get();

    // Atomic batch deletion: All-or-nothing transaction
    //
    // Why batch instead of sequential deletes?
    //   - Atomicity: If asset deletion fails, dividends won't be orphaned
    //   - Performance: Single network round-trip for multiple deletes
    //   - Consistency: Avoids race conditions (concurrent reads see consistent state)
    //
    // Firestore batch limitations:
    //   - Max 500 operations per batch
    //   - Not a concern here (users rarely have 500+ future dividends)
    //   - If needed in future: Implement batch chunking
    //
    // Transaction order:
    //   1. Add all dividend deletes to batch
    //   2. Add asset delete to batch
    //   3. Commit atomically (all succeed or all fail)
    const batch = adminDb.batch();

    // Delete future dividends
    dividendsSnapshot.docs.forEach(dividendDoc => {
      batch.delete(dividendDoc.ref);
    });

    // Past the check every remaining trade is an opening position: it goes with the asset
    tradesSnapshot.docs.forEach((tradeDoc) => {
      batch.delete(tradeDoc.ref);
    });

    // Delete the asset
    batch.delete(assetDoc.ref);

    // Commit atomically
    await batch.commit();
    await invalidateDashboardOverviewSummaryServer(userId, 'asset_deleted');

    console.log(
      `Asset ${assetId} deleted with ${dividendsSnapshot.size} future dividends and ${tradesSnapshot.docs.length} opening rows removed`,
    );

    return NextResponse.json({
      success: true,
      message: 'Asset deleted successfully',
      deletedFutureDividends: dividendsSnapshot.size,
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error deleting asset:', error);
    return NextResponse.json(
      { error: 'Failed to delete asset', details: (error as Error).message },
      { status: 500 }
    );
  }
}
