import 'server-only';

import { adminDb } from '@/lib/firebase/admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  Dividend,
  DividendFormData,
  DividendStats,
  DividendsByAsset,
  DividendType,
} from '@/types/dividend';
import { convertMultipleToEur, getExchangeRateToEur } from './currencyConversionService';

const DIVIDENDS_COLLECTION = 'dividends';

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
 * Get all dividends for a specific user
 * Sorted by payment date (most recent first)
 */
export async function getAllDividends(userId: string): Promise<Dividend[]> {
  try {
    console.log('[dividendService] getAllDividends called for userId:', userId);
    const querySnapshot = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('paymentDate', 'desc')
      .get();

    console.log('[dividendService] Query successful, docs count:', querySnapshot.size);

    const dividends = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      exDate: doc.data().exDate?.toDate() || new Date(),
      paymentDate: doc.data().paymentDate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Dividend[];

    console.log('[dividendService] Returning', dividends.length, 'dividends');
    return dividends;
  } catch (error) {
    console.error('[dividendService] Error getting dividends:', error);
    console.error('[dividendService] Error details:', {
      name: (error as Error).name,
      message: (error as Error).message,
      stack: (error as Error).stack,
    });
    throw error;
  }
}

/**
 * Get dividends for a specific asset
 * Sorted by payment date (most recent first)
 */
export async function getDividendsByAsset(
  userId: string,
  assetId: string
): Promise<Dividend[]> {
  try {
    const querySnapshot = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .where('userId', '==', userId)
      .where('assetId', '==', assetId)
      .orderBy('paymentDate', 'desc')
      .get();

    const dividends = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      exDate: doc.data().exDate?.toDate() || new Date(),
      paymentDate: doc.data().paymentDate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Dividend[];

    return dividends;
  } catch (error) {
    console.error('Error getting dividends by asset:', error);
    throw new Error('Failed to fetch dividends by asset');
  }
}

/**
 * Get dividends in a date range
 * Sorted by payment date (most recent first)
 */
export async function getDividendsByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Dividend[]> {
  try {
    const querySnapshot = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .where('userId', '==', userId)
      .where('paymentDate', '>=', Timestamp.fromDate(startDate))
      .where('paymentDate', '<=', Timestamp.fromDate(endDate))
      .orderBy('paymentDate', 'desc')
      .get();

    const dividends = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      exDate: doc.data().exDate?.toDate() || new Date(),
      paymentDate: doc.data().paymentDate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Dividend[];

    return dividends;
  } catch (error) {
    console.error('Error getting dividends by date range:', error);
    throw new Error('Failed to fetch dividends by date range');
  }
}

/**
 * Get a single dividend by ID
 */
export async function getDividendById(dividendId: string): Promise<Dividend | null> {
  try {
    const dividendDoc = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .doc(dividendId)
      .get();

    if (!dividendDoc.exists) {
      return null;
    }

    return {
      id: dividendDoc.id,
      ...dividendDoc.data(),
      exDate: dividendDoc.data()?.exDate?.toDate() || new Date(),
      paymentDate: dividendDoc.data()?.paymentDate?.toDate() || new Date(),
      createdAt: dividendDoc.data()?.createdAt?.toDate() || new Date(),
      updatedAt: dividendDoc.data()?.updatedAt?.toDate() || new Date(),
    } as Dividend;
  } catch (error) {
    console.error('Error getting dividend:', error);
    throw new Error('Failed to fetch dividend');
  }
}

/**
 * Create a new dividend
 * Automatically calculates netAmount if not provided
 * Automatically converts amounts to EUR if currency is different
 */
export async function createDividend(
  userId: string,
  dividendData: DividendFormData,
  assetTicker: string,
  assetName: string,
  assetIsin?: string,
  isAutoGenerated: boolean = false
): Promise<string> {
  try {
    const now = Timestamp.now();

    // Auto-calculate netAmount if not already set
    const netAmount = dividendData.netAmount || (dividendData.grossAmount - dividendData.taxAmount);

    // Convert dates to Date objects if they're strings
    const exDate = dividendData.exDate instanceof Date
      ? dividendData.exDate
      : new Date(dividendData.exDate);
    const paymentDate = dividendData.paymentDate instanceof Date
      ? dividendData.paymentDate
      : new Date(dividendData.paymentDate);

    // Currency conversion to EUR
    let grossAmountEur: number | undefined;
    let taxAmountEur: number | undefined;
    let netAmountEur: number | undefined;
    let exchangeRate: number | undefined;

    if (dividendData.currency.toUpperCase() !== 'EUR') {
      try {
        // Get exchange rate
        exchangeRate = await getExchangeRateToEur(dividendData.currency);

        // Convert all amounts at once for efficiency
        const [convertedGross, convertedTax, convertedNet] = await convertMultipleToEur(
          [dividendData.grossAmount, dividendData.taxAmount, netAmount],
          dividendData.currency
        );

        grossAmountEur = convertedGross;
        taxAmountEur = convertedTax;
        netAmountEur = convertedNet;

        console.log(`[dividendService] Converted dividend from ${dividendData.currency} to EUR using rate ${exchangeRate}`);
      } catch (conversionError) {
        console.error('[dividendService] Currency conversion failed:', conversionError);
        // Continue without conversion - EUR fields will remain undefined
      }
    }

    const cleanedData = removeUndefinedFields({
      userId,
      assetId: dividendData.assetId,
      assetTicker,
      assetName,
      assetIsin,
      exDate: Timestamp.fromDate(exDate),
      paymentDate: Timestamp.fromDate(paymentDate),
      dividendPerShare: dividendData.dividendPerShare,
      quantity: dividendData.quantity,
      grossAmount: dividendData.grossAmount,
      taxAmount: dividendData.taxAmount,
      netAmount,
      currency: dividendData.currency,
      dividendType: dividendData.dividendType,
      notes: dividendData.notes,
      isAutoGenerated,
      // Currency conversion fields (only if currency !== EUR)
      grossAmountEur,
      taxAmountEur,
      netAmountEur,
      exchangeRate,
      createdAt: now,
      updatedAt: now,
    });

    const docRef = await adminDb.collection(DIVIDENDS_COLLECTION).add(cleanedData);

    return docRef.id;
  } catch (error) {
    console.error('Error creating dividend:', error);
    throw new Error('Failed to create dividend');
  }
}

/**
 * Update an existing dividend
 * Recalculates EUR amounts if currency or amounts are changed
 */
export async function updateDividend(
  dividendId: string,
  updates: Partial<DividendFormData>
): Promise<void> {
  try {
    // Convert dates to Date objects if they're strings, then to Timestamps
    const exDate = updates.exDate
      ? (updates.exDate instanceof Date ? updates.exDate : new Date(updates.exDate))
      : undefined;
    const paymentDate = updates.paymentDate
      ? (updates.paymentDate instanceof Date ? updates.paymentDate : new Date(updates.paymentDate))
      : undefined;

    // Recalculate netAmount if gross or tax amounts changed
    let netAmount = updates.netAmount;
    if (updates.grossAmount !== undefined && updates.taxAmount !== undefined && !netAmount) {
      netAmount = updates.grossAmount - updates.taxAmount;
    }

    // Currency conversion to EUR (if currency is provided in updates)
    let grossAmountEur: number | undefined;
    let taxAmountEur: number | undefined;
    let netAmountEur: number | undefined;
    let exchangeRate: number | undefined;

    if (updates.currency && updates.currency.toUpperCase() !== 'EUR') {
      try {
        // Get exchange rate
        exchangeRate = await getExchangeRateToEur(updates.currency);

        // Determine which amounts to convert
        const amountsToConvert: number[] = [];
        if (updates.grossAmount !== undefined) amountsToConvert.push(updates.grossAmount);
        if (updates.taxAmount !== undefined) amountsToConvert.push(updates.taxAmount);
        if (netAmount !== undefined) amountsToConvert.push(netAmount);

        if (amountsToConvert.length > 0) {
          const convertedAmounts = await convertMultipleToEur(amountsToConvert, updates.currency);

          if (updates.grossAmount !== undefined) grossAmountEur = convertedAmounts.shift();
          if (updates.taxAmount !== undefined) taxAmountEur = convertedAmounts.shift();
          if (netAmount !== undefined) netAmountEur = convertedAmounts.shift();

          console.log(`[dividendService] Updated dividend with EUR conversion using rate ${exchangeRate}`);
        }
      } catch (conversionError) {
        console.error('[dividendService] Currency conversion failed during update:', conversionError);
      }
    } else if (updates.currency && updates.currency.toUpperCase() === 'EUR') {
      // If changed to EUR, clear conversion fields
      grossAmountEur = undefined;
      taxAmountEur = undefined;
      netAmountEur = undefined;
      exchangeRate = undefined;
    }

    const cleanedUpdates = removeUndefinedFields({
      ...updates,
      netAmount,
      exDate: exDate ? Timestamp.fromDate(exDate) : undefined,
      paymentDate: paymentDate ? Timestamp.fromDate(paymentDate) : undefined,
      grossAmountEur,
      taxAmountEur,
      netAmountEur,
      exchangeRate,
      updatedAt: Timestamp.now(),
    });

    await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .doc(dividendId)
      .update(cleanedUpdates);
  } catch (error) {
    console.error('Error updating dividend:', error);
    throw new Error('Failed to update dividend');
  }
}

/**
 * Delete a dividend
 */
export async function deleteDividend(dividendId: string): Promise<void> {
  try {
    await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .doc(dividendId)
      .delete();
  } catch (error) {
    console.error('Error deleting dividend:', error);
    throw new Error('Failed to delete dividend');
  }
}

/**
 * Calculate dividend statistics for a user
 * Optionally filtered by date range
 */
export async function calculateDividendStats(
  userId: string,
  startDate?: Date,
  endDate?: Date
): Promise<DividendStats> {
  try {
    let dividends: Dividend[];

    if (startDate && endDate) {
      dividends = await getDividendsByDateRange(userId, startDate, endDate);
    } else {
      dividends = await getAllDividends(userId);
    }

    // Filter out future dividends (only calculate stats for paid dividends)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paidDividends = dividends.filter(div => {
      const paymentDate = div.paymentDate instanceof Date ? div.paymentDate : new Date();
      return paymentDate <= today;
    });

    const stats: DividendStats = {
      totalGross: 0,
      totalTax: 0,
      totalNet: 0,
      count: paidDividends.length,
      byAsset: {},
      byType: {
        ordinary: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
        extraordinary: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
        interim: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
        final: { totalGross: 0, totalTax: 0, totalNet: 0, count: 0 },
      },
    };

    paidDividends.forEach(dividend => {
      // Total stats
      stats.totalGross += dividend.grossAmount;
      stats.totalTax += dividend.taxAmount;
      stats.totalNet += dividend.netAmount;

      // By asset stats
      if (!stats.byAsset[dividend.assetId]) {
        stats.byAsset[dividend.assetId] = {
          assetTicker: dividend.assetTicker,
          assetName: dividend.assetName,
          totalGross: 0,
          totalTax: 0,
          totalNet: 0,
          count: 0,
        };
      }
      stats.byAsset[dividend.assetId].totalGross += dividend.grossAmount;
      stats.byAsset[dividend.assetId].totalTax += dividend.taxAmount;
      stats.byAsset[dividend.assetId].totalNet += dividend.netAmount;
      stats.byAsset[dividend.assetId].count += 1;

      // By type stats
      stats.byType[dividend.dividendType].totalGross += dividend.grossAmount;
      stats.byType[dividend.dividendType].totalTax += dividend.taxAmount;
      stats.byType[dividend.dividendType].totalNet += dividend.netAmount;
      stats.byType[dividend.dividendType].count += 1;
    });

    return stats;
  } catch (error) {
    console.error('Error calculating dividend stats:', error);
    throw new Error('Failed to calculate dividend stats');
  }
}

/**
 * Get dividends grouped by asset
 * Returns array of assets with their dividends and totals
 */
export async function getDividendsByAssetGrouped(
  userId: string
): Promise<DividendsByAsset[]> {
  try {
    const dividends = await getAllDividends(userId);

    // Group by assetId
    const groupedMap = new Map<string, DividendsByAsset>();

    dividends.forEach(dividend => {
      if (!groupedMap.has(dividend.assetId)) {
        groupedMap.set(dividend.assetId, {
          assetId: dividend.assetId,
          assetTicker: dividend.assetTicker,
          assetName: dividend.assetName,
          dividends: [],
          totalGross: 0,
          totalTax: 0,
          totalNet: 0,
        });
      }

      const group = groupedMap.get(dividend.assetId)!;
      group.dividends.push(dividend);
      group.totalGross += dividend.grossAmount;
      group.totalTax += dividend.taxAmount;
      group.totalNet += dividend.netAmount;
    });

    // Convert map to array and sort by total net (highest first)
    return Array.from(groupedMap.values()).sort(
      (a, b) => b.totalNet - a.totalNet
    );
  } catch (error) {
    console.error('Error getting dividends grouped by asset:', error);
    throw new Error('Failed to get dividends grouped by asset');
  }
}

/**
 * Get upcoming dividends (payment date in the future)
 * Sorted by payment date (nearest first)
 */
export async function getUpcomingDividends(userId: string): Promise<Dividend[]> {
  try {
    const now = new Date();
    const querySnapshot = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .where('userId', '==', userId)
      .where('paymentDate', '>=', Timestamp.fromDate(now))
      .orderBy('paymentDate', 'asc')
      .get();

    const dividends = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      exDate: doc.data().exDate?.toDate() || new Date(),
      paymentDate: doc.data().paymentDate?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Dividend[];

    return dividends;
  } catch (error) {
    console.error('Error getting upcoming dividends:', error);
    throw new Error('Failed to fetch upcoming dividends');
  }
}

/**
 * Check if a dividend already exists for an asset on a specific ex-date
 * Used to prevent duplicate imports from scraping
 */
export async function isDuplicateDividend(
  userId: string,
  assetId: string,
  exDate: Date
): Promise<boolean> {
  try {
    // Create date range for the same day (start of day to end of day)
    const startOfDay = new Date(exDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(exDate);
    endOfDay.setHours(23, 59, 59, 999);

    const querySnapshot = await adminDb
      .collection(DIVIDENDS_COLLECTION)
      .where('userId', '==', userId)
      .where('assetId', '==', assetId)
      .where('exDate', '>=', Timestamp.fromDate(startOfDay))
      .where('exDate', '<=', Timestamp.fromDate(endOfDay))
      .get();

    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking duplicate dividend:', error);
    throw new Error('Failed to check duplicate dividend');
  }
}

/**
 * Calculate withholding tax amount
 * Default Italian withholding tax rate: 26%
 */
export function calculateWithholdingTax(
  grossAmount: number,
  taxRate: number = 26
): number {
  return grossAmount * (taxRate / 100);
}
