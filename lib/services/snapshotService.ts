import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Asset, MonthlySnapshot } from '@/types/assets';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateLiquidNetWorth,
} from './assetService';
import { calculateCurrentAllocation } from './assetAllocationService';

const SNAPSHOTS_COLLECTION = 'monthlySnapshots';

/**
 * Create a monthly snapshot from current assets
 */
export async function createSnapshot(
  userId: string,
  assets: Asset[],
  year?: number,
  month?: number
): Promise<string> {
  try {
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

    const snapshot: Omit<MonthlySnapshot, 'createdAt'> & {
      createdAt: Timestamp;
    } = {
      userId,
      year: snapshotYear,
      month: snapshotMonth,
      totalNetWorth,
      liquidNetWorth,
      byAssetClass: allocation.byAssetClass,
      byAsset,
      assetAllocation,
      createdAt: Timestamp.now(),
    };

    const snapshotRef = doc(db, SNAPSHOTS_COLLECTION, snapshotId);
    await setDoc(snapshotRef, snapshot);

    return snapshotId;
  } catch (error) {
    console.error('Error creating snapshot:', error);
    throw new Error('Failed to create snapshot');
  }
}

/**
 * Get all snapshots for a user
 */
export async function getUserSnapshots(
  userId: string
): Promise<MonthlySnapshot[]> {
  try {
    const snapshotsRef = collection(db, SNAPSHOTS_COLLECTION);
    const q = query(
      snapshotsRef,
      where('userId', '==', userId),
      orderBy('year', 'asc'),
      orderBy('month', 'asc')
    );

    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map((doc) => ({
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as MonthlySnapshot[];
  } catch (error) {
    console.error('Error getting snapshots:', error);
    throw new Error('Failed to fetch snapshots');
  }
}

/**
 * Get snapshots for a specific time range
 */
export async function getSnapshotsInRange(
  userId: string,
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): Promise<MonthlySnapshot[]> {
  try {
    const allSnapshots = await getUserSnapshots(userId);

    return allSnapshots.filter((snapshot) => {
      const snapshotDate = snapshot.year * 100 + snapshot.month;
      const startDate = startYear * 100 + startMonth;
      const endDate = endYear * 100 + endMonth;

      return snapshotDate >= startDate && snapshotDate <= endDate;
    });
  } catch (error) {
    console.error('Error getting snapshots in range:', error);
    throw new Error('Failed to fetch snapshots');
  }
}

/**
 * Get the most recent snapshot for a user
 */
export async function getLatestSnapshot(
  userId: string
): Promise<MonthlySnapshot | null> {
  try {
    const snapshots = await getUserSnapshots(userId);

    if (snapshots.length === 0) {
      return null;
    }

    // Return the last one (already sorted by date)
    return snapshots[snapshots.length - 1];
  } catch (error) {
    console.error('Error getting latest snapshot:', error);
    return null;
  }
}

/**
 * Calculate month-over-month change
 */
export function calculateMonthlyChange(
  currentNetWorth: number,
  previousSnapshot: MonthlySnapshot | null
): {
  value: number;
  percentage: number;
} {
  if (!previousSnapshot || previousSnapshot.totalNetWorth === 0) {
    return { value: 0, percentage: 0 };
  }

  const value = currentNetWorth - previousSnapshot.totalNetWorth;
  const percentage = (value / previousSnapshot.totalNetWorth) * 100;

  return { value, percentage };
}
