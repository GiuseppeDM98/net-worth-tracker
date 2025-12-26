import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { Dividend } from '@/types/dividend';
import { updateDividend } from '@/lib/services/dividendService';
import { toDate } from '@/lib/utils/dateHelpers';

/**
 * Create an expense entry from a dividend
 * Returns the created expense ID
 * Uses EUR-converted amount if available, otherwise uses original currency
 */
export async function createExpenseFromDividend(
  dividend: Dividend,
  categoryId: string,
  categoryName: string,
  subCategoryId?: string,
  subCategoryName?: string
): Promise<string> {
  try {
    const now = Timestamp.now();
    const paymentDate = toDate(dividend.paymentDate);

    // Determine amount and currency to use
    // Prefer EUR-converted amount if available (for non-EUR dividends)
    const useEurAmount = dividend.currency.toUpperCase() !== 'EUR' && dividend.netAmountEur !== undefined;
    const expenseAmount = useEurAmount ? dividend.netAmountEur! : dividend.netAmount;
    const expenseCurrency = useEurAmount ? 'EUR' : dividend.currency;

    // Create expense with dividend data using Admin SDK
    const expenseData = {
      userId: dividend.userId,
      type: 'income',
      categoryId,
      categoryName,
      subCategoryId: subCategoryId || null,
      subCategoryName: subCategoryName || null,
      amount: expenseAmount, // Use EUR amount if available, otherwise net amount
      currency: expenseCurrency, // EUR if converted, otherwise original currency
      date: Timestamp.fromDate(paymentDate),
      notes: `Dividendo ${dividend.assetTicker} - ${dividend.assetName}${
        useEurAmount ? ` (${dividend.netAmount.toFixed(2)} ${dividend.currency} convertiti)` : ''
      }${dividend.notes ? ` | ${dividend.notes}` : ''}`,
      createdAt: now,
      updatedAt: now,
    };

    const expenseRef = await adminDb.collection('expenses').add(expenseData);

    // Update dividend with expense reference
    await updateDividend(dividend.id, {
      expenseId: expenseRef.id,
    } as any);

    console.log(`[dividendIncomeService] Created expense in ${expenseCurrency} (amount: ${expenseAmount.toFixed(2)})`);
    return expenseRef.id;
  } catch (error) {
    console.error('Error creating expense from dividend:', error);
    throw new Error('Failed to create expense from dividend');
  }
}

/**
 * Update an existing expense entry from a dividend
 * Uses EUR-converted amount if available, otherwise uses original currency
 */
export async function updateExpenseFromDividend(
  dividend: Dividend,
  expenseId: string,
  categoryName: string,
  subCategoryName?: string
): Promise<void> {
  try {
    const paymentDate = toDate(dividend.paymentDate);

    // Determine amount and currency to use
    // Prefer EUR-converted amount if available (for non-EUR dividends)
    const useEurAmount = dividend.currency.toUpperCase() !== 'EUR' && dividend.netAmountEur !== undefined;
    const expenseAmount = useEurAmount ? dividend.netAmountEur! : dividend.netAmount;
    const expenseCurrency = useEurAmount ? 'EUR' : dividend.currency;

    // Update expense using Admin SDK
    await adminDb.collection('expenses').doc(expenseId).update({
      amount: expenseAmount, // Use EUR amount if available, otherwise net amount
      currency: expenseCurrency, // EUR if converted, otherwise original currency
      date: Timestamp.fromDate(paymentDate),
      notes: `Dividendo ${dividend.assetTicker} - ${dividend.assetName}${
        useEurAmount ? ` (${dividend.netAmount.toFixed(2)} ${dividend.currency} convertiti)` : ''
      }${dividend.notes ? ` | ${dividend.notes}` : ''}`,
      categoryName,
      subCategoryName: subCategoryName || null,
      updatedAt: Timestamp.now(),
    });

    console.log(`[dividendIncomeService] Updated expense in ${expenseCurrency} (amount: ${expenseAmount.toFixed(2)})`);
  } catch (error) {
    console.error('Error updating expense from dividend:', error);
    throw new Error('Failed to update expense from dividend');
  }
}

/**
 * Delete expense entry associated with a dividend
 * Also removes expense reference from dividend
 */
export async function deleteExpenseForDividend(
  dividendId: string,
  expenseId: string
): Promise<void> {
  try {
    // Delete the expense using Admin SDK
    await adminDb.collection('expenses').doc(expenseId).delete();

    // Remove expense reference from dividend
    await updateDividend(dividendId, {
      expenseId: undefined,
    } as any);
  } catch (error) {
    console.error('Error deleting expense for dividend:', error);
    throw new Error('Failed to delete expense for dividend');
  }
}

/**
 * Sync all dividends to expense entries
 * Creates expenses for dividends without expense references
 * Useful for bulk synchronization
 */
export async function syncDividendExpenses(
  userId: string,
  dividends: Dividend[],
  categoryId: string,
  categoryName: string,
  subCategoryId?: string,
  subCategoryName?: string
): Promise<{ created: number; skipped: number; failed: number }> {
  const results = {
    created: 0,
    skipped: 0,
    failed: 0,
  };

  // Only create expenses for dividends already paid
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const dividend of dividends) {
    try {
      // Skip if expense already exists
      if (dividend.expenseId) {
        results.skipped++;
        continue;
      }

      // Skip if payment date is in the future
      const paymentDate = toDate(dividend.paymentDate);
      if (paymentDate > today) {
        results.skipped++;
        continue;
      }

      // Create expense for this dividend
      await createExpenseFromDividend(
        dividend,
        categoryId,
        categoryName,
        subCategoryId,
        subCategoryName
      );

      results.created++;
    } catch (error) {
      console.error(`Error syncing dividend ${dividend.id}:`, error);
      results.failed++;
    }
  }

  console.log('Dividend expense sync completed:', results);
  return results;
}

/**
 * Remove expense associations from dividends
 * Deletes expense entries and clears expenseId references
 * Useful for bulk de-synchronization
 */
export async function unsyncDividendExpenses(
  dividends: Dividend[]
): Promise<{ deleted: number; skipped: number; failed: number }> {
  const results = {
    deleted: 0,
    skipped: 0,
    failed: 0,
  };

  for (const dividend of dividends) {
    try {
      // Skip if no expense association
      if (!dividend.expenseId) {
        results.skipped++;
        continue;
      }

      // Delete expense and clear reference
      await deleteExpenseForDividend(dividend.id, dividend.expenseId);

      results.deleted++;
    } catch (error) {
      console.error(`Error unsyncing dividend ${dividend.id}:`, error);
      results.failed++;
    }
  }

  console.log('Dividend expense unsync completed:', results);
  return results;
}
