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

    // Support both old format (only targets) and new format (with userAge, riskFreeRate, and withdrawalRate)
    return {
      userAge: data.userAge,
      riskFreeRate: data.riskFreeRate,
      withdrawalRate: data.withdrawalRate,
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

    await setDoc(targetRef, {
      userId,
      userAge: settings.userAge,
      riskFreeRate: settings.riskFreeRate,
      withdrawalRate: settings.withdrawalRate,
      targets: settings.targets,
      updatedAt: Timestamp.now(),
    });
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
 * Gestisce anche asset con composizione (es. fondi pensione misti)
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

    // Se l'asset ha una composizione, distribuisci il valore tra le asset class
    if (asset.composition && asset.composition.length > 0) {
      asset.composition.forEach((comp) => {
        const compValue = (value * comp.percentage) / 100;

        // Aggregate by asset class
        if (!byAssetClass[comp.assetClass]) {
          byAssetClass[comp.assetClass] = 0;
        }
        byAssetClass[comp.assetClass] += compValue;

        // Aggregate by sub-category if present in composition
        // Ogni componente può avere la sua sottocategoria specifica
        // Usa chiave composta "assetClass:subCategory" per evitare collisioni
        if (comp.subCategory) {
          const subCategoryKey = `${comp.assetClass}:${comp.subCategory}`;
          if (!bySubCategory[subCategoryKey]) {
            bySubCategory[subCategoryKey] = 0;
          }
          bySubCategory[subCategoryKey] += compValue;
        }
      });
    } else {
      // Asset semplice (senza composizione) - comportamento normale

      // Aggregate by asset class
      if (!byAssetClass[asset.assetClass]) {
        byAssetClass[asset.assetClass] = 0;
      }
      byAssetClass[asset.assetClass] += value;

      // Aggregate by sub-category if present
      // Usa chiave composta "assetClass:subCategory" per evitare collisioni
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
        // Usa chiave composta "assetClass:subCategory"
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
 * La sottocategoria viene inizializzata con 0% target
 */
export async function addSubCategory(
  userId: string,
  assetClass: string,
  subCategoryName: string
): Promise<void> {
  try {
    // Carica le settings attuali
    const settings = await getSettings(userId);

    if (!settings) {
      throw new Error('Settings not found. Please configure allocation targets first.');
    }

    // Verifica che l'asset class esista
    if (!settings.targets[assetClass]) {
      throw new Error(`Asset class ${assetClass} not found in targets`);
    }

    // Inizializza subCategoryConfig se non esiste
    if (!settings.targets[assetClass].subCategoryConfig) {
      settings.targets[assetClass].subCategoryConfig = {
        enabled: true,
        categories: [],
      };
    }

    // Inizializza subTargets se non esiste
    if (!settings.targets[assetClass].subTargets) {
      settings.targets[assetClass].subTargets = {};
    }

    // Verifica che la sottocategoria non esista già
    const existingCategories = settings.targets[assetClass].subCategoryConfig!.categories;
    if (existingCategories.includes(subCategoryName)) {
      throw new Error(`Subcategory ${subCategoryName} already exists in ${assetClass}`);
    }

    // Aggiungi la nuova sottocategoria
    settings.targets[assetClass].subCategoryConfig!.categories.push(subCategoryName);
    settings.targets[assetClass].subCategoryConfig!.enabled = true;

    // Inizializza il target a 0%
    settings.targets[assetClass].subTargets![subCategoryName] = 0;

    // Salva le settings aggiornate
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
