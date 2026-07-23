import { adminDb } from '@/lib/firebase/admin';
import { Asset, MonthlySnapshot } from '@/types/assets';
import { toDate } from '@/lib/utils/dateHelpers';
import { ASSET_TRANSACTIONS_COLLECTION, type AssetTransaction } from '@/types/assetTransactions';

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

/**
 * Fetch every trade-ledger transaction for a user using the Admin SDK (server-side only).
 *
 * Read-only mirror of the Timestamp→Date conversion in assetTransactionUseCase.ts
 * (docToAssetTransaction) — duplicated rather than imported: that module already imports
 * getUserAssetsAdmin from this file, so importing back would create a cycle.
 */
export async function getAssetTransactionsAdmin(userId: string): Promise<AssetTransaction[]> {
  try {
    const querySnapshot = await adminDb
      .collection(ASSET_TRANSACTIONS_COLLECTION)
      .where('userId', '==', userId)
      .get();

    return querySnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        assetId: data.assetId,
        type: data.type,
        date: toDate(data.date),
        quantity: data.quantity,
        pricePerUnit: data.pricePerUnit,
        priceEur: data.priceEur,
        fees: data.fees,
        linkedCashAssetId: data.linkedCashAssetId,
        isBaseline: data.isBaseline,
        note: data.note,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      } as AssetTransaction;
    });
  } catch (error) {
    console.error('[getAssetTransactionsAdmin] Error fetching asset transactions:', error);
    throw new Error('Failed to fetch asset transactions');
  }
}
