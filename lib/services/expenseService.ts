/**
 * Expense Service
 *
 * Manages expense tracking for budgeting and cashflow analysis.
 *
 * Features:
 * - CRUD operations for expenses (create, read, update, delete)
 * - Recurring expenses (monthly or yearly series of fixed/variable/debt entries)
 * - Installment expenses (BNPL - Buy Now Pay Later)
 * - Monthly summaries and statistics with month-over-month comparison
 * - Category and subcategory management integration
 *
 * Amount sign convention:
 * - Expenses (fixed, variable, debt): stored as negative values
 * - Income: stored as positive values
 * - Transfers: stored as positive values (direction encoded by origin/destination asset IDs)
 * This allows simple summing for net cashflow calculations.
 */

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
  orderBy,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { needsSignFlip, crossesTransferBoundary } from '@/lib/utils/expenseTypeTransition';
import { buildRecurrenceDates, resolveRecurrenceFrequency } from '@/lib/utils/recurrenceDates';
import {
  Expense,
  ExpenseFormData,
  ExpenseType
} from '@/types/expenses';

const EXPENSES_COLLECTION = 'expenses';

/**
 * Raised by the batch re-typing paths (moveExpensesToCategory,
 * moveExpensesFromSubCategory, updateExpensesType) when a move would cross the
 * transfer boundary with linked expenses: each of those rows touches two cash
 * accounts, so no batch reconciliation of balances is possible. Carries a
 * user-facing message the dialogs surface as-is.
 */
export class TransferBoundaryError extends Error {
  constructor() {
    super(
      'Impossibile convertire in blocco da o verso Trasferimento: ogni voce tocca due conti e i saldi non sarebbero riconciliabili. Modifica le singole voci dal Cashflow.'
    );
    this.name = 'TransferBoundaryError';
  }
}

/**
 * Get all expenses for a specific user
 */
export async function getAllExpenses(userId: string): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const expenses = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];

    return expenses;
  } catch (error) {
    console.error('Error getting expenses:', error);
    throw new Error('Failed to fetch expenses');
  }
}

/**
 * Get expenses in a date range
 */
export async function getExpensesByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    );

    const querySnapshot = await getDocs(q);

    const expenses = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];

    return expenses;
  } catch (error) {
    console.error('Error getting expenses by date range:', error);
    throw new Error('Failed to fetch expenses by date range');
  }
}

/**
 * Create a new expense (single, recurring, or installment)
 *
 * Handles three creation modes based on form data:
 * 1. Installment (BNPL): Creates multiple expenses spread over months with defined amounts
 * 2. Recurring: Creates multiple expenses with the same amount, one per month or per year
 * 3. Single: Creates one expense
 *
 * Priority: Installment > Recurring > Single (installments checked first)
 *
 * @param userId - User ID
 * @param expenseData - Form data with expense details and mode flags
 * @param categoryName - Category name for display
 * @param subCategoryName - Optional subcategory name
 * @returns Single expense ID or array of IDs (for recurring/installments)
 */
export async function createExpense(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Promise<string | string[]> {
  try {
    const now = new Date();

    // Priority 1: Check installment first (BNPL payments with varying amounts)
    // Installments have priority over recurring since they're more specific
    if (expenseData.isInstallment && expenseData.installmentCount && expenseData.installmentCount > 1) {
      return await createInstallmentExpenses(userId, expenseData, categoryName, subCategoryName);
    }

    // Priority 2: Recurring expenses (a fixed amount repeating monthly or yearly)
    if (expenseData.isRecurring && expenseData.recurringCount && expenseData.recurringCount > 0) {
      return await createRecurringExpenses(userId, expenseData, categoryName, subCategoryName);
    }

    // Priority 3: Create single expense
    const expensesRef = collection(db, EXPENSES_COLLECTION);

    // Apply amount sign convention: expenses negative, income/transfers positive
    // This allows simple sum() for net cashflow without conditional logic
    let amount = Math.abs(expenseData.amount);
    if (expenseData.type !== 'income' && expenseData.type !== 'transfer') {
      amount = -amount;
    }

    const cleanedData = removeUndefinedFields({
      userId,
      type: expenseData.type,
      categoryId: expenseData.categoryId,
      categoryName,
      subCategoryId: expenseData.subCategoryId,
      subCategoryName,
      amount,
      currency: expenseData.currency,
      date: Timestamp.fromDate(expenseData.date),
      notes: expenseData.notes,
      link: expenseData.link,
      isRecurring: false,
      linkedCashAssetId: expenseData.linkedCashAssetId,
      transferCashAssetId: expenseData.transferCashAssetId,
      costCenterId: expenseData.costCenterId,
      costCenterName: expenseData.costCenterName,
      personalMemberId: expenseData.personalMemberId,
      createdAt: now,
      updatedAt: now,
    });

    const docRef = await addDoc(expensesRef, cleanedData);
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    return docRef.id;
  } catch (error) {
    console.error('Error creating expense:', error);
    throw new Error('Failed to create expense');
  }
}

/**
 * Create a recurring expense series (fixed, variable or debt).
 *
 * The series is MATERIALISED: one real, future-dated document per occurrence, all sharing a
 * `recurringParentId` so they can be deleted together. Nothing downstream evaluates a rule —
 * Cashflow, Analisi, Budget and the assistant all read ordinary expense rows.
 *
 * The whole batch is committed at once, which is why the occurrence count is capped at
 * `MAX_RECURRENCE_OCCURRENCES` (see recurrenceDates.ts): a `writeBatch` takes at most 500
 * operations, and `deleteRecurringExpenses` has the same ceiling on the way out.
 *
 * @returns The ids of every created occurrence, in chronological order.
 */
async function createRecurringExpenses(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Promise<string[]> {
  try {
    const batch = writeBatch(db);
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const createdIds: string[] = [];
    const now = new Date();

    // Create parent expense ID for reference
    const parentId = `recurring-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Sign convention: only spending types can recur (canTypeRecur), so the amount is always
    // negative here. Kept as an explicit statement rather than an implicit one — if the set of
    // recurring types ever widens to income or transfers, this line is the one that breaks.
    const amount = -Math.abs(expenseData.amount);

    const recurringFrequency = resolveRecurrenceFrequency(expenseData.recurringFrequency);
    const recurringDay = expenseData.recurringDay || expenseData.date.getDate();
    const dates = buildRecurrenceDates({
      start: expenseData.date,
      frequency: recurringFrequency,
      count: expenseData.recurringCount || 1,
      dayOfMonth: recurringDay,
    });

    dates.forEach((expenseDate, index) => {
      const docRef = doc(expensesRef);
      const cleanedData = removeUndefinedFields({
        userId,
        type: expenseData.type,
        categoryId: expenseData.categoryId,
        categoryName,
        subCategoryId: expenseData.subCategoryId,
        subCategoryName,
        amount,
        currency: expenseData.currency,
        date: Timestamp.fromDate(expenseDate),
        notes: expenseData.notes,
        link: expenseData.link,
        isRecurring: true,
        recurringFrequency,
        recurringDay,
        recurringParentId: parentId,
        // Only store on the first entry — balance update applies to current payment only,
        // not to future-dated recurring instances.
        linkedCashAssetId: index === 0 ? expenseData.linkedCashAssetId : undefined,
        costCenterId: expenseData.costCenterId,
        costCenterName: expenseData.costCenterName,
        // Every occurrence of a series belongs to the same person: unlike linkedCashAssetId,
        // which settles only the payment made today, ownership is a property of the expense.
        personalMemberId: expenseData.personalMemberId,
        createdAt: now,
        updatedAt: now,
      });

      batch.set(docRef, cleanedData);
      createdIds.push(docRef.id);
    });

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    return createdIds;
  } catch (error) {
    console.error('Error creating recurring expenses:', error);
    throw new Error('Failed to create recurring expenses');
  }
}

/**
 * Create installment expenses (for BNPL - Buy Now Pay Later payments)
 *
 * Supports two modes:
 * 1. Auto mode: Divides total amount evenly across installments
 *    - Rounds each installment down to 2 decimals
 *    - Last installment gets remainder to match exact total (prevents rounding errors)
 * 2. Manual mode: Uses user-provided amounts for each installment
 *
 * All installments are linked via a shared parentId for bulk operations.
 *
 * @param userId - User ID
 * @param expenseData - Form data with installment configuration
 * @param categoryName - Category name for display
 * @param subCategoryName - Optional subcategory name
 * @returns Array of created expense IDs
 */
async function createInstallmentExpenses(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Promise<string[]> {
  try {
    const batch = writeBatch(db);
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const createdIds: string[] = [];
    const now = new Date();

    // Generate unique parent ID for linking all installments together
    // This allows bulk operations like "delete all installments in this series"
    const parentId = `installment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const installmentCount = expenseData.installmentCount!;
    const startDate = expenseData.installmentStartDate || expenseData.date;

    // Calculate amounts based on mode
    let installmentAmounts: number[];
    let totalAmount: number;

    if (expenseData.installmentMode === 'auto') {
      // Auto-calculation: divide total amount evenly across installments
      totalAmount = expenseData.installmentTotalAmount!;
      const perInstallment = totalAmount / installmentCount;
      const baseAmount = Math.floor(perInstallment * 100) / 100; // Round down to 2 decimals
      const remainder = totalAmount - (baseAmount * installmentCount);

      // All installments get base amount except last one
      // Last installment gets base + remainder to ensure total matches exactly
      // (e.g., €100 / 3 = €33.33 + €33.33 + €33.34)
      installmentAmounts = Array(installmentCount - 1).fill(baseAmount);
      installmentAmounts.push(baseAmount + remainder);
    } else {
      // Manual mode: use user-provided amounts (for irregular payment schedules)
      installmentAmounts = expenseData.installmentAmounts!;
      totalAmount = installmentAmounts.reduce((sum, amt) => sum + amt, 0);
    }

    // Ensure amounts are negative for expenses (positive for income)
    const isExpense = expenseData.type !== 'income';
    if (isExpense) {
      installmentAmounts = installmentAmounts.map(amt => -Math.abs(amt));
      totalAmount = -Math.abs(totalAmount);
    }

    // Create one expense document per installment
    for (let i = 0; i < installmentCount; i++) {
      const installmentDate = new Date(startDate);
      installmentDate.setMonth(installmentDate.getMonth() + i);

      const docRef = doc(expensesRef);
      const cleanedData = removeUndefinedFields({
        userId,
        type: expenseData.type,
        categoryId: expenseData.categoryId,
        categoryName,
        subCategoryId: expenseData.subCategoryId,
        subCategoryName,
        amount: installmentAmounts[i],
        currency: expenseData.currency,
        date: Timestamp.fromDate(installmentDate),
        notes: expenseData.notes
          ? `${expenseData.notes} (Installment ${i + 1}/${installmentCount})`
          : `Installment ${i + 1}/${installmentCount}`,
        link: expenseData.link,

        // Installment-specific fields
        isInstallment: true,
        installmentParentId: parentId,
        installmentNumber: i + 1,
        installmentTotal: installmentCount,
        installmentTotalAmount: totalAmount,

        // Only store on the first installment — balance update applies to the immediate
        // payment only, not to future-dated installments.
        linkedCashAssetId: i === 0 ? expenseData.linkedCashAssetId : undefined,
        costCenterId: expenseData.costCenterId,
        costCenterName: expenseData.costCenterName,
        // Every occurrence of a series belongs to the same person: unlike linkedCashAssetId,
        // which settles only the payment made today, ownership is a property of the expense.
        personalMemberId: expenseData.personalMemberId,

        createdAt: now,
        updatedAt: now,
      });

      batch.set(docRef, cleanedData);
      createdIds.push(docRef.id);
    }

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_created');

    console.log(`Created ${installmentCount} installment expenses with parent ID: ${parentId}`);
    return createdIds;
  } catch (error) {
    console.error('Error creating installment expenses:', error);
    throw new Error('Failed to create installment expenses');
  }
}

/**
 * Delete all expenses in an installment series
 * @param userId - Owner of the series
 * @param installmentParentId - The parent ID linking all installments
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function deleteInstallmentExpenses(
  userId: string,
  installmentParentId: string
): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('installmentParentId', '==', installmentParentId)
    );

    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);

    querySnapshot.docs.forEach(docSnapshot => {
      batch.delete(docSnapshot.ref);
    });

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
    console.log(`Deleted ${querySnapshot.size} installment expenses with parent ID: ${installmentParentId}`);
  } catch (error) {
    console.error('Error deleting installment expenses:', error);
    throw new Error('Failed to delete installment expenses');
  }
}

/**
 * Update an existing expense
 */
export async function updateExpense(
  expenseId: string,
  updates: Partial<ExpenseFormData>,
  categoryName?: string,
  subCategoryName?: string
): Promise<void> {
  try {
    const expenseRef = doc(db, EXPENSES_COLLECTION, expenseId);
    const existingExpense = await getDoc(expenseRef);

    // If amount is being updated, ensure correct sign
    let updatedAmount = updates.amount;
    if (updatedAmount !== undefined && updates.type) {
      updatedAmount = Math.abs(updatedAmount);
      if (updates.type !== 'income' && updates.type !== 'transfer') {
        updatedAmount = -updatedAmount;
      }
    }

    const cleanedUpdates = removeUndefinedFields({
      ...updates,
      amount: updatedAmount,
      categoryName,
      subCategoryName,
      date: updates.date ? Timestamp.fromDate(updates.date) : undefined,
      linkedCashAssetId: updates.linkedCashAssetId,
      transferCashAssetId: updates.transferCashAssetId,
      updatedAt: new Date(),
    });

    await updateDoc(expenseRef, cleanedUpdates);
    const userId = existingExpense.data()?.userId as string | undefined;
    if (userId) {
      await invalidateDashboardOverviewSummary(userId, 'expense_updated');
    }
  } catch (error) {
    console.error('Error updating expense:', error);
    throw new Error('Failed to update expense');
  }
}

/**
 * Delete an expense
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  try {
    const expenseRef = doc(db, EXPENSES_COLLECTION, expenseId);
    const existingExpense = await getDoc(expenseRef);
    await deleteDoc(expenseRef);
    const userId = existingExpense.data()?.userId as string | undefined;
    if (userId) {
      await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
    }
  } catch (error) {
    console.error('Error deleting expense:', error);
    throw new Error('Failed to delete expense');
  }
}

/**
 * Delete all recurring expenses with the same parent ID
 * @param userId - Owner of the series
 * @param recurringParentId - The shared parent ID of the recurring series
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function deleteRecurringExpenses(
  userId: string,
  recurringParentId: string
): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('recurringParentId', '==', recurringParentId)
    );

    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);

    querySnapshot.docs.forEach(docSnapshot => {
      batch.delete(docSnapshot.ref);
    });

    await batch.commit();
    await invalidateDashboardOverviewSummary(userId, 'expense_deleted');
  } catch (error) {
    console.error('Error deleting recurring expenses:', error);
    throw new Error('Failed to delete recurring expenses');
  }
}


/**
 * Calculate total income for a period
 */
export function calculateTotalIncome(expenses: Expense[]): number {
  return expenses
    .filter(expense => expense.type === 'income')
    .reduce((total, expense) => total + expense.amount, 0);
}

/** Expense types that count as real spending (excludes income and transfers). */
export const COUNTABLE_EXPENSE_TYPES: ExpenseType[] = ['fixed', 'variable', 'debt'];

/** Returns true if the expense is a real spending entry (not income or transfer). */
export function isCountableExpense(e: Expense): boolean {
  return COUNTABLE_EXPENSE_TYPES.includes(e.type);
}

/**
 * Calculate total expenses for a period.
 * Only counts real spending types (fixed, variable, debt) — excludes income and transfers.
 */
export function calculateTotalExpenses(expenses: Expense[]): number {
  return expenses
    .filter(isCountableExpense)
    .reduce((total, expense) => total + Math.abs(expense.amount), 0);
}

/**
 * Calculate net balance (income - expenses)
 */
export function calculateNetBalance(expenses: Expense[]): number {
  return calculateTotalIncome(expenses) - calculateTotalExpenses(expenses);
}

/**
 * Count expenses associated with a category
 */
export async function getExpenseCountByCategoryId(
  categoryId: string,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error counting expenses by category:', error);
    throw new Error('Failed to count expenses by category');
  }
}

/**
 * Count expenses associated with a subcategory
 */
export async function getExpenseCountBySubCategoryId(
  categoryId: string,
  subCategoryId: string,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId),
      where('subCategoryId', '==', subCategoryId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error('Error counting expenses by subcategory:', error);
    throw new Error('Failed to count expenses by subcategory');
  }
}

/**
 * Update all expenses when a category name changes
 */
export async function updateExpensesCategoryName(
  categoryId: string,
  newCategoryName: string,
  userId: string
): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return; // No expenses to update
    }

    const batch = writeBatch(db);

    querySnapshot.docs.forEach(docSnapshot => {
      batch.update(docSnapshot.ref, {
        categoryName: newCategoryName,
        updatedAt: new Date(),
      });
    });

    await batch.commit();
  } catch (error) {
    console.error('Error updating expenses category name:', error);
    throw new Error('Failed to update expenses category name');
  }
}


/**
 * Reassign all expenses from one category to another
 */
export async function reassignExpensesCategory(
  oldCategoryId: string,
  newCategoryId: string,
  newCategoryName: string,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', oldCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0; // No expenses to reassign
    }

    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: any = {
        categoryId: newCategoryId,
        categoryName: newCategoryName,
        updatedAt: new Date(),
      };

      // If new subcategory is provided, update it; otherwise clear it
      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    return count;
  } catch (error) {
    console.error('Error reassigning expenses category:', error);
    throw new Error('Failed to reassign expenses category');
  }
}

/**
 * Clear category assignment from expenses when category is deleted without reassignment
 */
export async function clearExpensesCategoryAssignment(
  categoryId: string,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0; // No expenses to update
    }

    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: any = {
        categoryId: 'uncategorized',
        categoryName: 'Uncategorized',
        subCategoryId: null,
        subCategoryName: null,
        updatedAt: new Date(),
      };

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    return count;
  } catch (error) {
    console.error('Error clearing expenses category assignment:', error);
    throw new Error('Failed to clear expenses category assignment');
  }
}

/**
 * Reassign all expenses from one subcategory to another (or to no subcategory)
 */
export async function reassignExpensesSubCategory(
  categoryId: string,
  oldSubCategoryId: string,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId),
      where('subCategoryId', '==', oldSubCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0; // No expenses to reassign
    }

    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: any = {
        updatedAt: new Date(),
      };

      // If new subcategory is provided, update it; otherwise clear it
      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    return count;
  } catch (error) {
    console.error('Error reassigning expenses subcategory:', error);
    throw new Error('Failed to reassign expenses subcategory');
  }
}

/**
 * Move all expenses from one category to another, updating type for cross-type moves.
 *
 * Unlike reassignExpensesCategory (used during deletion), this preserves the source
 * category and also updates the expense `type` field to match the destination category.
 * When crossing the positive/negative sign boundary, flips the amount sign to maintain
 * the sign convention (income/transfer = positive, expenses = negative).
 * Refuses to cross the transfer boundary when expenses exist (TransferBoundaryError).
 */
export async function moveExpensesToCategory(
  oldCategoryId: string,
  oldType: ExpenseType,
  newCategoryId: string,
  newCategoryName: string,
  newType: ExpenseType,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', oldCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    if (crossesTransferBoundary(oldType, newType)) {
      throw new TransferBoundaryError();
    }

    const flipSign = needsSignFlip(oldType, newType);
    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: any = {
        categoryId: newCategoryId,
        categoryName: newCategoryName,
        type: newType,
        updatedAt: new Date(),
      };

      // Flip amount sign when crossing the positive/negative boundary
      if (flipSign) {
        const currentAmount = docSnapshot.data().amount;
        updates.amount = -currentAmount;
      }

      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    return count;
  } catch (error) {
    if (error instanceof TransferBoundaryError) throw error;
    console.error('Error moving expenses to category:', error);
    throw new Error('Failed to move expenses to category');
  }
}

/**
 * Move all expenses from a specific subcategory to another category/subcategory.
 *
 * Supports cross-category and cross-type moves. Source subcategory is preserved.
 * When crossing the positive/negative sign boundary, flips the amount sign.
 * Refuses to cross the transfer boundary when expenses exist (TransferBoundaryError).
 */
export async function moveExpensesFromSubCategory(
  oldCategoryId: string,
  oldSubCategoryId: string,
  oldType: ExpenseType,
  newCategoryId: string,
  newCategoryName: string,
  newType: ExpenseType,
  userId: string,
  newSubCategoryId?: string,
  newSubCategoryName?: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', oldCategoryId),
      where('subCategoryId', '==', oldSubCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    if (crossesTransferBoundary(oldType, newType)) {
      throw new TransferBoundaryError();
    }

    const flipSign = needsSignFlip(oldType, newType);
    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: any = {
        categoryId: newCategoryId,
        categoryName: newCategoryName,
        type: newType,
        updatedAt: new Date(),
      };

      // Flip amount sign when crossing the positive/negative boundary
      if (flipSign) {
        const currentAmount = docSnapshot.data().amount;
        updates.amount = -currentAmount;
      }

      if (newSubCategoryId && newSubCategoryName) {
        updates.subCategoryId = newSubCategoryId;
        updates.subCategoryName = newSubCategoryName;
      } else {
        updates.subCategoryId = null;
        updates.subCategoryName = null;
      }

      batch.update(docSnapshot.ref, removeUndefinedFields(updates));
      count++;
    });

    await batch.commit();
    return count;
  } catch (error) {
    if (error instanceof TransferBoundaryError) throw error;
    console.error('Error moving expenses from subcategory:', error);
    throw new Error('Failed to move expenses from subcategory');
  }
}

/**
 * Batch-update the type of all expenses in a category when the category type changes.
 *
 * Keeps categoryId and categoryName unchanged — only updates the `type` field
 * and flips amount signs when crossing the positive/negative sign boundary.
 * Refuses to cross the transfer boundary when expenses exist (TransferBoundaryError).
 *
 * @param categoryId - The category whose expenses need updating
 * @param oldType - Previous category type
 * @param newType - New category type
 * @param userId - Owner of the expenses
 * @returns Number of expenses updated
 */
export async function updateExpensesType(
  categoryId: string,
  oldType: ExpenseType,
  newType: ExpenseType,
  userId: string
): Promise<number> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return 0;
    }

    if (crossesTransferBoundary(oldType, newType)) {
      throw new TransferBoundaryError();
    }

    const flipSign = needsSignFlip(oldType, newType);
    const batch = writeBatch(db);
    let count = 0;

    querySnapshot.docs.forEach(docSnapshot => {
      const updates: Record<string, unknown> = {
        type: newType,
        updatedAt: new Date(),
      };

      if (flipSign) {
        const currentAmount = docSnapshot.data().amount as number;
        updates.amount = -currentAmount;
      }

      batch.update(docSnapshot.ref, updates);
      count++;
    });

    await batch.commit();
    return count;
  } catch (error) {
    if (error instanceof TransferBoundaryError) throw error;
    console.error('Error updating expense types in category:', error);
    throw new Error('Failed to update expense types');
  }
}

/**
 * Fetch all expenses in a recurring series by parent ID.
 *
 * Used before deleting a series to identify which entries had a linked cash asset
 * so the asset balance can be reversed before deletion.
 *
 * @param userId - Owner of the series
 * @param recurringParentId - The shared parent ID of the recurring series
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function getExpensesByRecurringParentId(
  userId: string,
  recurringParentId: string
): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('recurringParentId', '==', recurringParentId)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];
  } catch (error) {
    console.error('Error fetching recurring series expenses:', error);
    throw new Error('Failed to fetch recurring series expenses');
  }
}

/**
 * Fetch all expenses in an installment series by parent ID.
 *
 * Used before deleting a series to identify which entries had a linked cash asset
 * so the asset balance can be reversed before deletion.
 *
 * @param userId - Owner of the series
 * @param installmentParentId - The shared parent ID of the installment series
 *
 * SCOPED BY userId, and it has to be: `firestore.rules` guards `expenses` with
 * `canAccess(resource.data.userId)`, and Firestore refuses a LIST whose constraints do not
 * already guarantee the rule holds. A query on the parent id alone comes back
 * `permission-denied` at any result size (verified on the emulator), so the series would read
 * as empty and the delete would silently do nothing.
 */
export async function getExpensesByInstallmentParentId(
  userId: string,
  installmentParentId: string
): Promise<Expense[]> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('installmentParentId', '==', installmentParentId)
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date: doc.data().date?.toDate() || new Date(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as Expense[];
  } catch (error) {
    console.error('Error fetching installment series expenses:', error);
    throw new Error('Failed to fetch installment series expenses');
  }
}
