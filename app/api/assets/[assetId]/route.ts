import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * DELETE /api/assets/[assetId]
 * Deletes an asset and its future dividends
 * Uses Admin SDK to bypass Firestore Security Rules
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

    // Calculate today at midnight for clean comparison
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);

    // Query FUTURE dividends associated with the asset (exDate > today)
    const dividendsSnapshot = await adminDb
      .collection('dividends')
      .where('assetId', '==', assetId)
      .where('exDate', '>', todayTimestamp)
      .get();

    // Use batch for atomic deletion
    const batch = adminDb.batch();

    // Delete future dividends
    dividendsSnapshot.docs.forEach(dividendDoc => {
      batch.delete(dividendDoc.ref);
    });

    // Delete the asset
    batch.delete(assetDoc.ref);

    // Commit the transaction
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
