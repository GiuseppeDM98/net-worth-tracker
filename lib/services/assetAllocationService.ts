import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Asset, AssetAllocationTarget, AllocationResult } from '@/types/assets';
import { calculateAssetValue, calculateTotalValue } from './assetService';
import { DEFAULT_SUB_CATEGORIES, DEFAULT_EQUITY_SUB_TARGETS } from '@/lib/constants/defaultSubCategories';

const ALLOCATION_TARGETS_COLLECTION = 'assetAllocationTargets';

/**
 * Get allocation targets for a user
 */
export async function getTargets(
  userId: string
): Promise<AssetAllocationTarget | null> {
  try {
    const targetRef = doc(db, ALLOCATION_TARGETS_COLLECTION, userId);
    const targetDoc = await getDoc(targetRef);

    if (!targetDoc.exists()) {
      return null;
    }

    return targetDoc.data().targets as AssetAllocationTarget;
  } catch (error) {
    console.error('Error getting allocation targets:', error);
    throw new Error('Failed to fetch allocation targets');
  }
}

/**
 * Set allocation targets for a user
 */
export async function setTargets(
  userId: string,
  targets: AssetAllocationTarget
): Promise<void> {
  try {
    const targetRef = doc(db, ALLOCATION_TARGETS_COLLECTION, userId);

    await setDoc(targetRef, {
      userId,
      targets,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error setting allocation targets:', error);
    throw new Error('Failed to save allocation targets');
  }
}

/**
 * Calculate current allocation from assets
 */
export function calculateCurrentAllocation(assets: Asset[]): {
  byAssetClass: { [assetClass: string]: number };
  bySubCategory: { [subCategory: string]: number };
  totalValue: number;
} {
  const totalValue = calculateTotalValue(assets);

  if (totalValue === 0) {
    return {
      byAssetClass: {},
      bySubCategory: {},
      totalValue: 0,
    };
  }

  const byAssetClass: { [assetClass: string]: number } = {};
  const bySubCategory: { [subCategory: string]: number } = {};

  assets.forEach((asset) => {
    const value = calculateAssetValue(asset);

    // Aggregate by asset class
    if (!byAssetClass[asset.assetClass]) {
      byAssetClass[asset.assetClass] = 0;
    }
    byAssetClass[asset.assetClass] += value;

    // Aggregate by sub-category if present
    if (asset.subCategory) {
      if (!bySubCategory[asset.subCategory]) {
        bySubCategory[asset.subCategory] = 0;
      }
      bySubCategory[asset.subCategory] += value;
    }
  });

  return {
    byAssetClass,
    bySubCategory,
    totalValue,
  };
}

/**
 * Compare current allocation against targets and generate rebalancing actions
 */
export function compareAllocations(
  assets: Asset[],
  targets: AssetAllocationTarget | null
): AllocationResult {
  const current = calculateCurrentAllocation(assets);

  if (!targets || current.totalValue === 0) {
    return {
      byAssetClass: {},
      bySubCategory: {},
      totalValue: current.totalValue,
    };
  }

  const byAssetClass: AllocationResult['byAssetClass'] = {};
  const bySubCategory: AllocationResult['bySubCategory'] = {};

  // Compare asset classes
  Object.keys(targets).forEach((assetClass) => {
    const targetData = targets[assetClass];
    const currentValue = current.byAssetClass[assetClass] || 0;
    const currentPercentage = (currentValue / current.totalValue) * 100;
    const targetPercentage = targetData.targetPercentage;
    const targetValue = (current.totalValue * targetPercentage) / 100;
    const difference = currentPercentage - targetPercentage;
    const differenceValue = currentValue - targetValue;

    // Determine action (threshold: ±1%)
    let action: 'COMPRA' | 'VENDI' | 'OK';
    if (difference > 1) {
      action = 'VENDI';
    } else if (difference < -1) {
      action = 'COMPRA';
    } else {
      action = 'OK';
    }

    byAssetClass[assetClass] = {
      currentPercentage,
      currentValue,
      targetPercentage,
      targetValue,
      difference,
      differenceValue,
      action,
    };

    // Compare sub-categories if they exist
    if (targetData.subTargets) {
      const assetClassTotal = currentValue;

      Object.keys(targetData.subTargets).forEach((subCategory) => {
        const subTargetPercentage = targetData.subTargets![subCategory];
        const subCurrentValue = current.bySubCategory[subCategory] || 0;

        // Sub-category percentage is relative to its asset class
        const subCurrentPercentage =
          assetClassTotal > 0 ? (subCurrentValue / assetClassTotal) * 100 : 0;

        // Target value is percentage of the asset class total
        const subTargetValue = (assetClassTotal * subTargetPercentage) / 100;
        const subDifference = subCurrentPercentage - subTargetPercentage;
        const subDifferenceValue = subCurrentValue - subTargetValue;

        let subAction: 'COMPRA' | 'VENDI' | 'OK';
        if (subDifference > 1) {
          subAction = 'VENDI';
        } else if (subDifference < -1) {
          subAction = 'COMPRA';
        } else {
          subAction = 'OK';
        }

        bySubCategory[subCategory] = {
          currentPercentage: subCurrentPercentage,
          currentValue: subCurrentValue,
          targetPercentage: subTargetPercentage,
          targetValue: subTargetValue,
          difference: subDifference,
          differenceValue: subDifferenceValue,
          action: subAction,
        };
      });
    }
  });

  return {
    byAssetClass,
    bySubCategory,
    totalValue: current.totalValue,
  };
}

/**
 * Get default allocation targets for a new user
 */
export function getDefaultTargets(): AssetAllocationTarget {
  return {
    equity: {
      targetPercentage: 70,
      subCategoryConfig: {
        enabled: true,
        categories: DEFAULT_SUB_CATEGORIES.equity,
      },
      subTargets: DEFAULT_EQUITY_SUB_TARGETS,
    },
    bonds: {
      targetPercentage: 20,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.bonds,
      },
    },
    crypto: {
      targetPercentage: 3,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.crypto,
      },
    },
    realestate: {
      targetPercentage: 5,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.realestate,
      },
    },
    cash: {
      targetPercentage: 2,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.cash,
      },
    },
    commodity: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.commodity,
      },
    },
  };
}
