/**
 * Snapshot Service
 *
 * Manages monthly portfolio snapshots for historical tracking and performance analysis.
 *
 * Features:
 * - Create snapshots from current asset state (with optional custom date)
 * - Fetch snapshots with sorting and filtering by date range
 * - Calculate month-over-month and year-to-date changes
 * - Add/update/delete notes for specific snapshots
 *
 * Storage format: Firestore document ID is "userId-YYYY-M" (month without padding)
 * Snapshots are sorted by year (asc), then month (asc) for chronological order.
 */

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
 *
 * Calculates total/liquid/illiquid net worth, asset allocation percentages,
 * and stores a point-in-time record of all assets with their values.
 *
 * @param userId - User ID
 * @param assets - Current asset array (with updated prices)
 * @param year - Optional year override (defaults to current Italy time)
 * @param month - Optional month override (defaults to current Italy time)
 * @returns Snapshot document ID (format: "userId-YYYY-M")
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

    // Convert allocation values (absolute EUR amounts) to percentages
    // This allows comparing allocation trends over time even as portfolio size changes
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
 * Get all snapshots for a user, sorted chronologically (oldest first)
 *
 * Snapshots are sorted by year (asc), then month (asc) to maintain chronological order
 * for time-series analysis and charting.
 *
 * @param userId - User ID
 * @returns Array of snapshots sorted chronologically
 */
export async function getUserSnapshots(
  userId: string
): Promise<MonthlySnapshot[]> {
  try {
    const snapshotsRef = collection(db, SNAPSHOTS_COLLECTION);
    // Sort by year, then month (both ascending) for chronological order
    // This ensures consistent ordering for time-series calculations and charts
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
 *
 * Filters snapshots between start and end dates (inclusive on both sides).
 *
 * @param userId - User ID
 * @param startYear - Start year
 * @param startMonth - Start month (1-12)
 * @param endYear - End year
 * @param endMonth - End month (1-12)
 * @returns Array of snapshots within the specified range, sorted chronologically
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
      // Convert year/month to comparable integer: YYYYMM format (e.g., 2024*100 + 3 = 202403)
      // This allows simple numeric comparison for date ranges without Date object overhead
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
 *
 * @param userId - User ID
 * @returns Latest snapshot, or null if no snapshots exist
 */
export async function getLatestSnapshot(
  userId: string
): Promise<MonthlySnapshot | null> {
  try {
    const snapshots = await getUserSnapshots(userId);

    if (snapshots.length === 0) {
      return null;
    }

    // Return the last one (already sorted chronologically by getUserSnapshots)
    return snapshots[snapshots.length - 1];
  } catch (error) {
    console.error('Error getting latest snapshot:', error);
    return null;
  }
}

/**
 * Calculate month-over-month change in net worth
 *
 * Compares current net worth with the most recent snapshot to show
 * portfolio change since last month.
 *
 * @param currentNetWorth - Current total net worth
 * @param previousSnapshot - Most recent snapshot (null if no snapshots exist)
 * @returns Object with absolute value change and percentage change
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
 * Calculate year-to-date (YTD) change in net worth
 *
 * Compares current net worth with the first snapshot of the current year
 * to show portfolio performance since January 1st.
 *
 * @param currentNetWorth - Current total net worth
 * @param snapshots - Array of all snapshots (sorted chronologically)
 * @returns Object with absolute value change and percentage change, or null if no snapshots for current year
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

  // Find the first snapshot of the current year (earliest month in current year)
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
 *
 * Uses setDoc with merge: true to handle both create and update cases safely.
 * This allows adding notes even if the snapshot document doesn't exist yet.
 *
 * @param userId - User ID
 * @param year - Snapshot year
 * @param month - Snapshot month (1-12)
 * @param note - Note text (empty string deletes the note)
 * @throws Error if note exceeds 500 characters
 */
export async function updateSnapshotNote(
  userId: string,
  year: number,
  month: number,
  note: string
): Promise<void> {
  const trimmedNote = note.trim();

  if (trimmedNote.length > 500) {
    throw new Error('Note cannot exceed 500 characters');
  }

  // Firestore document ID format: userId-YYYY-M (without padding for consistency with existing snapshots)
  const snapshotId = `${userId}-${year}-${month}`;
  const snapshotRef = doc(db, SNAPSHOTS_COLLECTION, snapshotId);

  // Use setDoc with merge: true to handle both create and update cases
  // This prevents overwriting existing snapshot data and satisfies Firestore security rules
  // Include userId field to allow document creation if snapshot doesn't exist yet
  if (trimmedNote.length === 0) {
    await setDoc(
      snapshotRef,
      {
        note: deleteField(), // Firestore special value to remove field
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
