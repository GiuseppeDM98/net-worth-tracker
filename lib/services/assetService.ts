import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Asset, AssetFormData } from '@/types/assets';

const ASSETS_COLLECTION = 'assets';

/**
 * Define asset class ordering priority
 * Order: Azioni → Obbligazioni → Commodities → Real Estate → Cash → Crypto
 */
export const ASSET_CLASS_ORDER: Record<string, number> = {
  equity: 1,
  bonds: 2,
  commodity: 3,
  realestate: 4,
  cash: 5,
  crypto: 6,
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
 * Get all equity assets with ISIN for a specific user
 * Used for automatic dividend scraping
 * Filters: assetClass === 'equity' AND isin exists AND isin is not empty
 */
export async function getAssetsWithIsin(userId: string): Promise<Asset[]> {
  try {
    const assetsRef = collection(db, ASSETS_COLLECTION);
    const q = query(
      assetsRef,
      where('userId', '==', userId),
      where('assetClass', '==', 'equity')
    );

    const querySnapshot = await getDocs(q);

    const assets = querySnapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
        lastPriceUpdate: doc.data().lastPriceUpdate?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      }))
      .filter(asset => {
        // Filter out assets without ISIN or with empty ISIN
        const assetData = asset as Asset;
        return assetData.isin && assetData.isin.trim() !== '';
      }) as Asset[];

    return assets;
  } catch (error) {
    console.error('Error getting assets with ISIN:', error);
    throw new Error('Failed to fetch assets with ISIN');
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
 * If ISIN exists and we have historical dividends with that ISIN, reuse the existing assetId
 * to maintain continuity with historical dividend data
 */
export async function createAsset(
  userId: string,
  assetData: AssetFormData
): Promise<string> {
  try {
    const now = Timestamp.now();
    const assetsRef = collection(db, ASSETS_COLLECTION);

    // Check if ISIN exists and we have historical dividends with that ISIN
    let assetId: string | null = null;

    if (assetData.isin && assetData.isin.trim() !== '') {
      // Query dividends collection to find existing assetId for this ISIN
      const dividendsRef = collection(db, 'dividends');
      const dividendsQuery = query(
        dividendsRef,
        where('userId', '==', userId),
        where('assetIsin', '==', assetData.isin.trim()),
        limit(1)
      );

      const dividendsSnapshot = await getDocs(dividendsQuery);

      if (!dividendsSnapshot.empty) {
        // Found existing dividend with this ISIN - reuse its assetId
        const existingDividend = dividendsSnapshot.docs[0].data();
        assetId = existingDividend.assetId;

        console.log(`Reusing existing assetId ${assetId} for ISIN ${assetData.isin}`);
      }
    }

    // Remove undefined fields to prevent Firebase errors
    const cleanedData = removeUndefinedFields({
      ...assetData,
      userId,
      lastPriceUpdate: now,
      createdAt: now,
      updatedAt: now,
    });

    if (assetId) {
      // Reuse existing ID
      const assetRef = doc(db, ASSETS_COLLECTION, assetId);
      await setDoc(assetRef, cleanedData);
      console.log(`Asset created with existing ID: ${assetId}`);
      return assetId;
    } else {
      // Generate new ID
      const docRef = await addDoc(assetsRef, cleanedData);
      console.log(`Asset created with new ID: ${docRef.id}`);
      return docRef.id;
    }
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
 * Delete an asset and its future dividends
 * Only deletes dividends with ex-date > today to preserve historical data
 * Uses API endpoint to leverage Admin SDK and bypass Firestore Security Rules
 */
export async function deleteAsset(assetId: string, userId: string): Promise<void> {
  try {
    const response = await fetch(`/api/assets/${assetId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete asset');
    }

    const result = await response.json();
    console.log(`Asset ${assetId} deleted with ${result.deletedFutureDividends} future dividends removed`);
  } catch (error) {
    console.error('Error deleting asset:', error);
    throw new Error('Failed to delete asset');
  }
}

/**
 * Calculate total value of an asset
 *
 * For real estate with outstanding debt: net value = gross value - debt
 * This calculates the equity (net ownership) rather than gross property value.
 *
 * @param asset - Asset to calculate value for
 * @returns Total asset value (quantity × price, minus outstanding debt for real estate)
 */
export function calculateAssetValue(asset: Asset): number {
  const baseValue = asset.quantity * asset.currentPrice;

  // For real estate with outstanding debt, subtract the debt to get net equity
  // Use Math.max(0, ...) to prevent negative values for underwater mortgages
  // (where debt > property value). Negative net worth is tracked at portfolio level.
  if (asset.assetClass === 'realestate' && asset.outstandingDebt) {
    return Math.max(0, baseValue - asset.outstandingDebt);
  }

  return baseValue;
}

/**
 * Calculate total portfolio value from assets
 */
export function calculateTotalValue(assets: Asset[]): number {
  return assets.reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate liquid net worth (assets that can be quickly converted to cash)
 *
 * Liquidity determination:
 * - If isLiquid field is explicitly defined, use that value (allows user override)
 * - Otherwise use legacy logic: exclude real estate and private equity (for backwards compatibility)
 *
 * The isLiquid override takes precedence because users may have unique situations
 * (e.g., illiquid bonds, liquid real estate like REITs).
 *
 * @param assets - All user assets
 * @returns Total value of liquid assets
 */
export function calculateLiquidNetWorth(assets: Asset[]): number {
  return assets
    .filter(asset => {
      // If isLiquid is explicitly defined, use that value (user override)
      if (asset.isLiquid !== undefined) {
        return asset.isLiquid === true;
      }
      // Otherwise use legacy logic for backwards compatibility
      // (assets created before isLiquid field was added)
      return (
        asset.assetClass !== 'realestate' &&
        asset.subCategory !== 'Private Equity'
      );
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate illiquid net worth (assets that cannot be quickly converted to cash)
 *
 * See calculateLiquidNetWorth() for liquidity determination logic.
 *
 * @param assets - All user assets
 * @returns Total value of illiquid assets
 */
export function calculateIlliquidNetWorth(assets: Asset[]): number {
  return assets
    .filter(asset => {
      // If isLiquid is explicitly defined, use that value (user override)
      if (asset.isLiquid !== undefined) {
        return asset.isLiquid === false;
      }
      // Otherwise use legacy logic for backwards compatibility
      return (
        asset.assetClass === 'realestate' ||
        asset.subCategory === 'Private Equity'
      );
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate FIRE-eligible net worth (conditionally excludes primary residences)
 *
 * FIRE calculations MAY exclude primary residences because:
 * - You need somewhere to live (not available for withdrawal)
 * - Selling your primary home doesn't contribute to retirement income
 * - Aligns with standard FIRE methodology (only count assets that generate income/can be liquidated)
 *
 * However, some users prefer to include primary residence equity in their FIRE number,
 * especially if they plan to downsize or relocate in retirement.
 *
 * Includes ALL other assets:
 * - Liquid assets (stocks, bonds, cash)
 * - Illiquid assets (except optionally primary residence real estate)
 * - Investment properties (rental income = FIRE-eligible)
 *
 * @param assets - All user assets
 * @param includePrimaryResidence - If true, include primary residences; if false, exclude them (default: false)
 * @returns Total value of FIRE-eligible assets
 */
export function calculateFIRENetWorth(assets: Asset[], includePrimaryResidence: boolean = false): number {
  return assets
    .filter(asset => {
      // Exclude real estate marked as primary residence (if user setting is disabled)
      if (!includePrimaryResidence && asset.assetClass === 'realestate' && asset.isPrimaryResidence === true) {
        return false;
      }
      return true;
    })
    .reduce((total, asset) => total + calculateAssetValue(asset), 0);
}

/**
 * Calculate unrealized gains for a single asset
 *
 * Returns 0 if averageCost is not set because gains cannot be calculated
 * without a cost basis (we don't know the purchase price).
 *
 * @param asset - Asset to calculate gains for
 * @returns Unrealized gain/loss (current value - cost basis)
 */
export function calculateUnrealizedGains(asset: Asset): number {
  // Cannot calculate gains without cost basis - return 0 as neutral value
  if (!asset.averageCost || asset.averageCost <= 0) {
    return 0;
  }

  const currentValue = asset.quantity * asset.currentPrice;
  const costBasis = asset.quantity * asset.averageCost;
  return currentValue - costBasis;
}

/**
 * Calculate estimated taxes on unrealized gains for a single asset
 * Returns 0 if taxRate is not set or gains are negative/zero
 */
export function calculateEstimatedTaxes(asset: Asset): number {
  const gains = calculateUnrealizedGains(asset);

  if (gains <= 0 || !asset.taxRate || asset.taxRate <= 0) {
    return 0;
  }

  return gains * (asset.taxRate / 100);
}

/**
 * Calculate total unrealized gains for portfolio
 */
export function calculateTotalUnrealizedGains(assets: Asset[]): number {
  return assets.reduce((total, asset) => total + calculateUnrealizedGains(asset), 0);
}

/**
 * Calculate total estimated taxes for portfolio
 */
export function calculateTotalEstimatedTaxes(assets: Asset[]): number {
  return assets.reduce((total, asset) => total + calculateEstimatedTaxes(asset), 0);
}

/**
 * Calculate estimated taxes only for liquid assets
 * Used to calculate net liquid net worth
 */
export function calculateLiquidEstimatedTaxes(assets: Asset[]): number {
  return assets
    .filter(asset => {
      // Use same logic as calculateLiquidNetWorth
      if (asset.isLiquid !== undefined) {
        return asset.isLiquid === true;
      }
      // Legacy logic for backwards compatibility
      return (
        asset.assetClass !== 'realestate' &&
        asset.subCategory !== 'Private Equity'
      );
    })
    .reduce((total, asset) => total + calculateEstimatedTaxes(asset), 0);
}

/**
 * Calculate gross total (current portfolio value)
 * Alias for calculateTotalValue for clarity in cost basis context
 */
export function calculateGrossTotal(assets: Asset[]): number {
  return calculateTotalValue(assets);
}

/**
 * Calculate net total (portfolio value after estimated taxes on unrealized gains)
 */
export function calculateNetTotal(assets: Asset[]): number {
  const grossTotal = calculateTotalValue(assets);
  const estimatedTaxes = calculateTotalEstimatedTaxes(assets);
  return grossTotal - estimatedTaxes;
}

/**
 * Calculate portfolio weighted average TER (Total Expense Ratio)
 * Formula: TER_portfolio = (TER_asset1 × Value_asset1 + TER_asset2 × Value_asset2 + ...) / Total_portfolio_value
 * Only includes assets that have a TER value
 * Returns 0 if no assets have TER
 */
export function calculatePortfolioWeightedTER(assets: Asset[]): number {
  // Filter assets that have TER defined
  const assetsWithTER = assets.filter(
    asset => asset.totalExpenseRatio !== undefined && asset.totalExpenseRatio > 0
  );

  if (assetsWithTER.length === 0) {
    return 0;
  }

  // Calculate weighted sum of TER
  const weightedTERSum = assetsWithTER.reduce((sum, asset) => {
    const assetValue = calculateAssetValue(asset);
    const ter = asset.totalExpenseRatio || 0;
    return sum + (ter * assetValue);
  }, 0);

  // Calculate total value of assets with TER
  const totalValueWithTER = assetsWithTER.reduce(
    (sum, asset) => sum + calculateAssetValue(asset),
    0
  );

  if (totalValueWithTER === 0) {
    return 0;
  }

  return weightedTERSum / totalValueWithTER;
}

/**
 * Calculate annual portfolio cost based on TER
 * Formula: Annual_cost = Total_portfolio_value × (TER_portfolio / 100)
 * Returns 0 if no assets have TER
 */
export function calculateAnnualPortfolioCost(assets: Asset[]): number {
  const portfolioTER = calculatePortfolioWeightedTER(assets);

  if (portfolioTER === 0) {
    return 0;
  }

  // Calculate total value of assets with TER
  const assetsWithTER = assets.filter(
    asset => asset.totalExpenseRatio !== undefined && asset.totalExpenseRatio > 0
  );

  const totalValueWithTER = assetsWithTER.reduce(
    (sum, asset) => sum + calculateAssetValue(asset),
    0
  );

  return totalValueWithTER * (portfolioTER / 100);
}
