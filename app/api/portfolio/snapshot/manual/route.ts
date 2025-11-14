import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';

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

    // Validate required fields
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

    // Validate year and month ranges
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

    // Create snapshot document ID
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

    // Update Hall of Fame rankings
    try {
      await updateHallOfFame(userId);
      console.log('Hall of Fame updated successfully after manual snapshot');
    } catch (error) {
      console.error('Error updating Hall of Fame:', error);
      // Don't fail the request if Hall of Fame update fails
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
