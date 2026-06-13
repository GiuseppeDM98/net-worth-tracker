import { adminDb } from '@/lib/firebase/admin';
import { Asset, MonthlySnapshot } from '@/types/assets';

/**
 * Fetch all assets for a user using Firebase Admin SDK (server-side only).
 *
 * Required in API routes because assetService.ts uses the client SDK which
 * is not available in server contexts.
 */
export async function getUserAssetsAdmin(userId: string): Promise<Asset[]> {
  try {
    const querySnapshot = await adminDb
      .collection('assets')
      .where('userId', '==', userId)
      .get();

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      lastPriceUpdate: doc.data().lastPriceUpdate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      holdingStartDate: doc.data().holdingStartDate?.toDate(),
    })) as Asset[];
  } catch (error) {
    console.error('[getUserAssetsAdmin] Error fetching assets:', error);
    throw new Error('Failed to fetch assets');
  }
}

/**
 * Fetch all monthly snapshots for a user using Firebase Admin SDK (server-side only).
 *
 * Mirrors getUserSnapshots (client SDK) for use in API routes. No ordering is applied —
 * the only consumer (deriveHoldingStartDates) sorts in memory — so this avoids depending on a
 * composite Firestore index.
 */
export async function getUserSnapshotsAdmin(userId: string): Promise<MonthlySnapshot[]> {
  try {
    const querySnapshot = await adminDb
      .collection('monthly-snapshots')
      .where('userId', '==', userId)
      .get();

    return querySnapshot.docs.map(doc => ({
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    })) as MonthlySnapshot[];
  } catch (error) {
    console.error('[getUserSnapshotsAdmin] Error fetching snapshots:', error);
    throw new Error('Failed to fetch snapshots');
  }
}
