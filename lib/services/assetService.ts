import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Asset, AssetFormData } from '@/types/assets';

const ASSETS_COLLECTION = 'assets';

/**
 * Define asset class ordering priority
 */
const ASSET_CLASS_ORDER: Record<string, number> = {
  equity: 1,
  bonds: 2,
  realestate: 3,
  crypto: 4,
  commodity: 5,
  cash: 6,
};

/**
 * Remove undefined fields from an object to prevent Firebase errors
 */
function removeUndefinedFields<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {};
  Object.keys(obj).forEach((key) => {
    const value = obj[key];
    if (value !== undefined) {
      cleaned[key as keyof T] = value;
    }
  });
  return cleaned;
}

/**
 * Get all assets for a specific user
 * Assets are sorted by asset class (equity, bonds, realestate, crypto, commodity, cash)
 * and then by name within each class
 */
export async function getAllAssets(userId: string): Promise<Asset[]> {
  try {
    const assetsRef = collection(db, ASSETS_COLLECTION);
    const q = query(
      assetsRef,
      where('userId', '==', userId)
    );

    const querySnapshot = await getDocs(q);

    const assets = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      lastPriceUpdate: doc.data().lastPriceUpdate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Asset[];

    // Sort by asset class first, then by name
    return assets.sort((a, b) => {
      const orderA = ASSET_CLASS_ORDER[a.assetClass] || 999;
      const orderB = ASSET_CLASS_ORDER[b.assetClass] || 999;

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // If same asset class, sort by name
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error getting assets:', error);
    throw new Error('Failed to fetch assets');
  }
}

/**
 * Get a single asset by ID
 */
export async function getAssetById(assetId: string): Promise<Asset | null> {
  try {
    const assetRef = doc(db, ASSETS_COLLECTION, assetId);
    const assetDoc = await getDoc(assetRef);

    if (!assetDoc.exists()) {
      return null;
    }

    return {
      id: assetDoc.id,
      ...assetDoc.data(),
      lastPriceUpdate: assetDoc.data().lastPriceUpdate?.toDate() || new Date(),
      createdAt: assetDoc.data().createdAt?.toDate() || new Date(),
      updatedAt: assetDoc.data().updatedAt?.toDate() || new Date(),
    } as Asset;
  } catch (error) {
    console.error('Error getting asset:', error);
    throw new Error('Failed to fetch asset');
  }
}

/**
 * Create a new asset
 */
export async function createAsset(
  userId: string,
  assetData: AssetFormData
): Promise<string> {
  try {
    const now = Timestamp.now();
    const assetsRef = collection(db, ASSETS_COLLECTION);

    // Remove undefined fields to prevent Firebase errors
    const cleanedData = removeUndefinedFields({
      ...assetData,
      userId,
      lastPriceUpdate: now,
      createdAt: now,
      updatedAt: now,
    });

    const docRef = await addDoc(assetsRef, cleanedData);

    return docRef.id;
  } catch (error) {
    console.error('Error creating asset:', error);
    throw new Error('Failed to create asset');
  }
}

/**
 * Update an existing asset
 */
export async function updateAsset(
  assetId: string,
  updates: Partial<AssetFormData>
): Promise<void> {
  try {
    const assetRef = doc(db, ASSETS_COLLECTION, assetId);

    // Remove undefined fields to prevent Firebase errors
    const cleanedUpdates = removeUndefinedFields({
      ...updates,
      updatedAt: Timestamp.now(),
    });

    await updateDoc(assetRef, cleanedUpdates);
  } catch (error) {
    console.error('Error updating asset:', error);
    throw new Error('Failed to update asset');
  }
}

/**
 * Update asset price and timestamp
 */
export async function updateAssetPrice(
  assetId: string,
  price: number
): Promise<void> {
  try {
    const assetRef = doc(db, ASSETS_COLLECTION, assetId);

    await updateDoc(assetRef, {
      currentPrice: price,
      lastPriceUpdate: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating asset price:', error);
    throw new Error('Failed to update asset price');
  }
}

/**
 * Delete an asset
 */
export async function deleteAsset(assetId: string): Promise<void> {
  try {
    const assetRef = doc(db, ASSETS_COLLECTION, assetId);
    await deleteDoc(assetRef);
  } catch (error) {
    console.error('Error deleting asset:', error);
    throw new Error('Failed to delete asset');
  }
}

/**
 * Calculate total value of an asset
 */
export function calculateAssetValue(asset: Asset): number {
  return asset.quantity * asset.currentPrice;
}

/**
 * Calculate total portfolio value from assets
 */
export function calculateTotalValue(assets: Asset[]): number {
  return assets.reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate liquid net worth
 * Se isLiquid è definito, usa quel valore
 * Altrimenti usa la logica legacy (esclude real estate e private equity)
 */
export function calculateLiquidNetWorth(assets: Asset[]): number {
  return assets
    .filter(asset => {
      // Se isLiquid è definito esplicitamente, usa quel valore
      if (asset.isLiquid !== undefined) {
        return asset.isLiquid === true;
      }
      // Altrimenti usa la logica legacy per retrocompatibilità
      return (
        asset.assetClass !== 'realestate' &&
        asset.subCategory !== 'Private Equity'
      );
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate illiquid net worth
 */
export function calculateIlliquidNetWorth(assets: Asset[]): number {
  return assets
    .filter(asset => {
      // Se isLiquid è definito esplicitamente, usa quel valore
      if (asset.isLiquid !== undefined) {
        return asset.isLiquid === false;
      }
      // Altrimenti usa la logica legacy per retrocompatibilità
      return (
        asset.assetClass === 'realestate' ||
        asset.subCategory === 'Private Equity'
      );
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}
