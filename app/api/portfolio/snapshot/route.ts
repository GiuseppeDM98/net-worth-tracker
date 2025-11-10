import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { Asset, MonthlySnapshot } from '@/types/assets';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateLiquidNetWorth,
} from '@/lib/services/assetService';
import { calculateCurrentAllocation } from '@/lib/services/assetAllocationService';

const SNAPSHOTS_COLLECTION = 'monthly-snapshots';

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

    // Calculate snapshot data
    const now = new Date();
    const snapshotYear = year ?? now.getFullYear();
    const snapshotMonth = month ?? now.getMonth() + 1; // 1-12

    const totalNetWorth = calculateTotalValue(assets);
    const liquidNetWorth = calculateLiquidNetWorth(assets);
    const allocation = calculateCurrentAllocation(assets);

    // Convert allocation values to percentages
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
      byAssetClass: allocation.byAssetClass,
      byAsset,
      assetAllocation,
      createdAt: adminDb.Timestamp.now(),
    };

    // Save snapshot
    await existingSnapshotRef.set(snapshotData);

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
