import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * DELETE /api/assets/[assetId]
 *
 * Delete asset with cascade cleanup of related data
 *
 * Cascade Logic:
 *   - Asset document: Deleted
 *   - Future dividends (exDate > today): Deleted
 *   - Historical dividends (exDate <= today): Preserved
 *   - Linked expenses: Preserved (user's cashflow history)
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
    const { assetId } = await params;

    // Get userId from request body
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

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

    // Delete the asset
    batch.delete(assetDoc.ref);

    // Commit atomically
    await batch.commit();

    console.log(`Asset ${assetId} deleted with ${dividendsSnapshot.size} future dividends removed`);

    return NextResponse.json({
      success: true,
      message: 'Asset deleted successfully',
      deletedFutureDividends: dividendsSnapshot.size,
    });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return NextResponse.json(
      { error: 'Failed to delete asset', details: (error as Error).message },
      { status: 500 }
    );
  }
}
