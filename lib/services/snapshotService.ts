import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  deleteField,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Asset, MonthlySnapshot } from '@/types/assets';
import {
  calculateAssetValue,
  calculateTotalValue,
  calculateLiquidNetWorth,
  calculateIlliquidNetWorth,
} from './assetService';
import { calculateCurrentAllocation } from './assetAllocationService';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

const SNAPSHOTS_COLLECTION = 'monthly-snapshots';

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
    const { month: currentMonth, year: currentYear } = getItalyMonthYear();
    const snapshotYear = year ?? currentYear;
    const snapshotMonth = month ?? currentMonth;

    const totalNetWorth = calculateTotalValue(assets);
    const liquidNetWorth = calculateLiquidNetWorth(assets);
    const illiquidNetWorth = calculateIlliquidNetWorth(assets);
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

    const snapshotId = `${userId}-${snapshotYear}-${snapshotMonth}`;

    const snapshot: Omit<MonthlySnapshot, 'createdAt'> & {
      createdAt: Timestamp;
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

/**
 * Calculate year-to-date change
 * Compares current net worth with the first snapshot of the current year
 */
export function calculateYearlyChange(
  currentNetWorth: number,
  snapshots: MonthlySnapshot[]
): {
  value: number;
  percentage: number;
} | null {
  if (snapshots.length === 0) {
    return null;
  }

  const currentYear = new Date().getFullYear();

  // Find the first snapshot of the current year
  const firstSnapshotOfYear = snapshots.find(s => s.year === currentYear);

  if (!firstSnapshotOfYear || firstSnapshotOfYear.totalNetWorth === 0) {
    return null;
  }

  const value = currentNetWorth - firstSnapshotOfYear.totalNetWorth;
  const percentage = (value / firstSnapshotOfYear.totalNetWorth) * 100;

  return { value, percentage };
}

/**
 * Update or delete a note from a monthly snapshot
 * @param userId - User ID
 * @param year - Snapshot year
 * @param month - Snapshot month (1-12)
 * @param note - Note text (empty string deletes the note)
 * @throws Error if note exceeds 500 characters or if snapshot doesn't exist
 */
export async function updateSnapshotNote(
  userId: string,
  year: number,
  month: number,
  note: string
): Promise<void> {
  const trimmedNote = note.trim();

  if (trimmedNote.length > 500) {
    throw new Error('La nota non può superare i 500 caratteri');
  }

  // Firestore document ID format: userId-YYYY-M (without padding for consistency with existing snapshots)
  const snapshotId = `${userId}-${year}-${month}`;
  const snapshotRef = doc(db, SNAPSHOTS_COLLECTION, snapshotId);

  // Use setDoc with merge: true to handle both create and update cases
  // Include userId to satisfy Firestore security rules for document creation
  if (trimmedNote.length === 0) {
    await setDoc(
      snapshotRef,
      {
        note: deleteField(),
        userId: userId,
      },
      { merge: true }
    );
  } else {
    await setDoc(
      snapshotRef,
      {
        note: trimmedNote,
        userId: userId,
      },
      { merge: true }
    );
  }
}
