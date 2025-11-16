import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Asset, AssetAllocationTarget, AssetAllocationSettings, AllocationResult } from '@/types/assets';
import { calculateAssetValue, calculateTotalValue } from './assetService';
import { DEFAULT_SUB_CATEGORIES, DEFAULT_EQUITY_SUB_TARGETS } from '@/lib/constants/defaultSubCategories';

const ALLOCATION_TARGETS_COLLECTION = 'assetAllocationTargets';

/**
 * Get allocation settings for a user (includes targets, age, and risk-free rate)
 */
export async function getSettings(
  userId: string
): Promise<AssetAllocationSettings | null> {
  try {
    const targetRef = doc(db, ALLOCATION_TARGETS_COLLECTION, userId);
    const targetDoc = await getDoc(targetRef);

    if (!targetDoc.exists()) {
      return null;
    }

    const data = targetDoc.data();

    // Support both old format (only targets) and new format (with userAge, riskFreeRate, withdrawalRate, and plannedAnnualExpenses)
    return {
      userAge: data.userAge,
      riskFreeRate: data.riskFreeRate,
      withdrawalRate: data.withdrawalRate,
      plannedAnnualExpenses: data.plannedAnnualExpenses,
      targets: data.targets as AssetAllocationTarget,
    };
  } catch (error) {
    console.error('Error getting allocation settings:', error);
    throw new Error('Failed to fetch allocation settings');
  }
}

/**
 * Get allocation targets for a user (legacy function for backward compatibility)
 */
export async function getTargets(
  userId: string
): Promise<AssetAllocationTarget | null> {
  const settings = await getSettings(userId);
  return settings ? settings.targets : null;
}

/**
 * Set allocation settings for a user (includes targets, age, and risk-free rate)
 */
export async function setSettings(
  userId: string,
  settings: AssetAllocationSettings
): Promise<void> {
  try {
    const targetRef = doc(db, ALLOCATION_TARGETS_COLLECTION, userId);

    // Build the document object, only including defined fields
    const docData: any = {
      userId,
      targets: settings.targets,
      updatedAt: Timestamp.now(),
    };

    // Only add optional fields if they are defined
    if (settings.userAge !== undefined) {
      docData.userAge = settings.userAge;
    }
    if (settings.riskFreeRate !== undefined) {
      docData.riskFreeRate = settings.riskFreeRate;
    }
    if (settings.withdrawalRate !== undefined) {
      docData.withdrawalRate = settings.withdrawalRate;
    }
    if (settings.plannedAnnualExpenses !== undefined) {
      docData.plannedAnnualExpenses = settings.plannedAnnualExpenses;
    }

    await setDoc(targetRef, docData);
  } catch (error) {
    console.error('Error setting allocation settings:', error);
    throw new Error('Failed to save allocation settings');
  }
}

/**
 * Set allocation targets for a user (legacy function for backward compatibility)
 */
export async function setTargets(
  userId: string,
  targets: AssetAllocationTarget
): Promise<void> {
  await setSettings(userId, { targets });
}

/**
 * Calculate current allocation from assets
 *
 * Handles both simple assets and composite assets (e.g., mixed pension funds).
 * For composite assets, distributes value across multiple asset classes based
 * on the composition percentages.
 *
 * @param assets - All user assets
 * @returns Allocation breakdown by asset class, sub-category, and total value
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

    // For composite assets, distribute value across multiple asset classes
    if (asset.composition && asset.composition.length > 0) {
      asset.composition.forEach((comp) => {
        const compValue = (value * comp.percentage) / 100;

        // Aggregate by asset class
        if (!byAssetClass[comp.assetClass]) {
          byAssetClass[comp.assetClass] = 0;
        }
        byAssetClass[comp.assetClass] += compValue;

        // Aggregate by sub-category if present in composition
        // Each component can have its own specific sub-category
        // Use composite key "assetClass:subCategory" to avoid collisions
        if (comp.subCategory) {
          const subCategoryKey = `${comp.assetClass}:${comp.subCategory}`;
          if (!bySubCategory[subCategoryKey]) {
            bySubCategory[subCategoryKey] = 0;
          }
          bySubCategory[subCategoryKey] += compValue;
        }
      });
    } else {
      // Simple asset (no composition) - standard aggregation

      // Aggregate by asset class
      if (!byAssetClass[asset.assetClass]) {
        byAssetClass[asset.assetClass] = 0;
      }
      byAssetClass[asset.assetClass] += value;

      // Aggregate by sub-category if present
      // Use composite key "assetClass:subCategory" to avoid collisions
      if (asset.subCategory) {
        const subCategoryKey = `${asset.assetClass}:${asset.subCategory}`;
        if (!bySubCategory[subCategoryKey]) {
          bySubCategory[subCategoryKey] = 0;
        }
        bySubCategory[subCategoryKey] += value;
      }
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

  // Check if cash is using fixed amount
  const cashTarget = targets['cash'];
  const useCashFixedAmount = cashTarget?.useFixedAmount || false;
  const cashFixedAmount = useCashFixedAmount ? (cashTarget?.fixedAmount || 0) : 0;

  // Calculate remaining value (total - fixed cash)
  // This is the value on which other asset classes percentages will be applied
  const remainingValue = useCashFixedAmount
    ? Math.max(0, current.totalValue - cashFixedAmount)
    : current.totalValue;

  const byAssetClass: AllocationResult['byAssetClass'] = {};
  const bySubCategory: AllocationResult['bySubCategory'] = {};

  // Compare asset classes
  Object.keys(targets).forEach((assetClass) => {
    const targetData = targets[assetClass];
    const currentValue = current.byAssetClass[assetClass] || 0;
    const currentPercentage = current.totalValue > 0
      ? (currentValue / current.totalValue) * 100
      : 0;

    let targetValue: number;
    let targetPercentage: number;

    // Special handling for cash if using fixed amount
    if (assetClass === 'cash' && targetData.useFixedAmount) {
      // For fixed cash, target value is the fixed amount
      targetValue = targetData.fixedAmount || 0;
      // Target percentage is calculated as fixed amount / total value
      targetPercentage = current.totalValue > 0
        ? (targetValue / current.totalValue) * 100
        : 0;
    } else {
      // For other asset classes:
      // - If cash is fixed, apply percentage to remaining value
      // - Otherwise, apply percentage to total value (normal behavior)
      const baseValue = useCashFixedAmount ? remainingValue : current.totalValue;
      targetValue = (baseValue * targetData.targetPercentage) / 100;
      // Target percentage shown is relative to total value
      targetPercentage = current.totalValue > 0
        ? (targetValue / current.totalValue) * 100
        : targetData.targetPercentage;
    }

    const difference = currentPercentage - targetPercentage;
    const differenceValue = currentValue - targetValue;

    // Determine action (threshold: ±100€)
    let action: 'COMPRA' | 'VENDI' | 'OK';
    if (differenceValue > 100) {
      action = 'VENDI';
    } else if (differenceValue < -100) {
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
      const assetClassCurrentTotal = currentValue;
      const assetClassTargetTotal = targetValue;

      Object.keys(targetData.subTargets).forEach((subCategory) => {
        const subTargetPercentage = targetData.subTargets![subCategory];
        // Use composite key "assetClass:subCategory" to avoid collisions
        const subCategoryKey = `${assetClass}:${subCategory}`;
        const subCurrentValue = current.bySubCategory[subCategoryKey] || 0;

        // Sub-category percentage is relative to its asset class current value
        const subCurrentPercentage =
          assetClassCurrentTotal > 0 ? (subCurrentValue / assetClassCurrentTotal) * 100 : 0;

        // Target value is percentage of the asset class target value
        const subTargetValue = (assetClassTargetTotal * subTargetPercentage) / 100;
        const subDifference = subCurrentPercentage - subTargetPercentage;
        const subDifferenceValue = subCurrentValue - subTargetValue;

        let subAction: 'COMPRA' | 'VENDI' | 'OK';
        if (subDifferenceValue > 100) {
          subAction = 'VENDI';
        } else if (subDifferenceValue < -100) {
          subAction = 'COMPRA';
        } else {
          subAction = 'OK';
        }

        bySubCategory[subCategoryKey] = {
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
 * Calculate equity percentage based on age and risk-free rate
 * Formula: 125 - age - (riskFreeRate * 5)
 */
export function calculateEquityPercentage(
  userAge: number,
  riskFreeRate: number
): number {
  const percentage = 125 - userAge - (riskFreeRate * 5);
  // Ensure percentage is between 0 and 100
  return Math.max(0, Math.min(100, percentage));
}

/**
 * Add a new subcategory to an asset class
 *
 * The subcategory is initialized with 0% target allocation.
 * This allows users to create custom sub-categories beyond the defaults.
 *
 * @param userId - The user ID
 * @param assetClass - The asset class to add the subcategory to
 * @param subCategoryName - Name of the new subcategory
 */
export async function addSubCategory(
  userId: string,
  assetClass: string,
  subCategoryName: string
): Promise<void> {
  try {
    // Load current settings
    const settings = await getSettings(userId);

    if (!settings) {
      throw new Error('Settings not found. Please configure allocation targets first.');
    }

    // Verify that the asset class exists
    if (!settings.targets[assetClass]) {
      throw new Error(`Asset class ${assetClass} not found in targets`);
    }

    // Initialize subCategoryConfig if it doesn't exist
    if (!settings.targets[assetClass].subCategoryConfig) {
      settings.targets[assetClass].subCategoryConfig = {
        enabled: true,
        categories: [],
      };
    }

    // Initialize subTargets if it doesn't exist
    if (!settings.targets[assetClass].subTargets) {
      settings.targets[assetClass].subTargets = {};
    }

    // Verify that the subcategory doesn't already exist
    const existingCategories = settings.targets[assetClass].subCategoryConfig!.categories;
    if (existingCategories.includes(subCategoryName)) {
      throw new Error(`Subcategory ${subCategoryName} already exists in ${assetClass}`);
    }

    // Add the new subcategory
    settings.targets[assetClass].subCategoryConfig!.categories.push(subCategoryName);
    settings.targets[assetClass].subCategoryConfig!.enabled = true;

    // Initialize target to 0%
    settings.targets[assetClass].subTargets![subCategoryName] = 0;

    // Save updated settings
    await setSettings(userId, settings);
  } catch (error) {
    console.error('Error adding subcategory:', error);
    throw error;
  }
}

/**
 * Get default allocation targets for a new user
 * Default: 60% equity, 40% bonds
 */
export function getDefaultTargets(): AssetAllocationTarget {
  return {
    equity: {
      targetPercentage: 60,
      subCategoryConfig: {
        enabled: true,
        categories: DEFAULT_SUB_CATEGORIES.equity,
      },
      subTargets: DEFAULT_EQUITY_SUB_TARGETS,
    },
    bonds: {
      targetPercentage: 40,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.bonds,
      },
    },
    crypto: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.crypto,
      },
    },
    realestate: {
      targetPercentage: 0,
      subCategoryConfig: {
        enabled: false,
        categories: DEFAULT_SUB_CATEGORIES.realestate,
      },
    },
    cash: {
      targetPercentage: 0,
      useFixedAmount: false,
      fixedAmount: 0,
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
