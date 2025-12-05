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
import {
  Expense,
  ExpenseFormData,
  ExpenseStats,
  MonthlyExpenseSummary,
  ExpenseType
} from '@/types/expenses';

const EXPENSES_COLLECTION = 'expenses';

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
 * Get expenses for a specific month
 */
export async function getExpensesByMonth(
  userId: string,
  year: number,
  month: number
): Promise<Expense[]> {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

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
    console.error('Error getting expenses by month:', error);
    throw new Error('Failed to fetch expenses by month');
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
 * Get a single expense by ID
 */
export async function getExpenseById(expenseId: string): Promise<Expense | null> {
  try {
    const expenseRef = doc(db, EXPENSES_COLLECTION, expenseId);
    const expenseDoc = await getDoc(expenseRef);

    if (!expenseDoc.exists()) {
      return null;
    }

    return {
      id: expenseDoc.id,
      ...expenseDoc.data(),
      date: expenseDoc.data().date?.toDate() || new Date(),
      createdAt: expenseDoc.data().createdAt?.toDate() || new Date(),
      updatedAt: expenseDoc.data().updatedAt?.toDate() || new Date(),
    } as Expense;
  } catch (error) {
    console.error('Error getting expense:', error);
    throw new Error('Failed to fetch expense');
  }
}

/**
 * Create a new expense
 * If isRecurring is true and recurringMonths is provided, creates multiple expenses
 */
export async function createExpense(
  userId: string,
  expenseData: ExpenseFormData,
  categoryName: string,
  subCategoryName?: string
): Promise<string | string[]> {
  try {
    const now = Timestamp.now();

    // Check installment first (priority over recurring)
    if (expenseData.isInstallment && expenseData.installmentCount && expenseData.installmentCount > 1) {
      return await createInstallmentExpenses(userId, expenseData, categoryName, subCategoryName);
    }

    // If it's a recurring expense, create multiple entries
    if (expenseData.isRecurring && expenseData.recurringMonths && expenseData.recurringMonths > 0) {
      return await createRecurringExpenses(userId, expenseData, categoryName, subCategoryName);
    }

    // Create single expense
    const expensesRef = collection(db, EXPENSES_COLLECTION);

    // Ensure amount is negative for expenses (fixed, variable, debt) and positive for income
    let amount = Math.abs(expenseData.amount);
    if (expenseData.type !== 'income') {
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
      isRecurring: false,
      createdAt: now,
      updatedAt: now,
    });

    const docRef = await addDoc(expensesRef, cleanedData);

    return docRef.id;
  } catch (error) {
    console.error('Error creating expense:', error);
    throw new Error('Failed to create expense');
  }
}

/**
 * Create recurring expenses (for debts)
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
    const now = Timestamp.now();

    // Create parent expense ID for reference
    const parentId = `recurring-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Ensure amount is negative for debts
    const amount = -Math.abs(expenseData.amount);

    const recurringDay = expenseData.recurringDay || expenseData.date.getDate();
    const startDate = new Date(expenseData.date);

    // Create expense for each month
    for (let i = 0; i < (expenseData.recurringMonths || 1); i++) {
      const expenseDate = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + i,
        recurringDay
      );

      // If the day doesn't exist in the month (e.g., 31st in February), use last day of month
      if (expenseDate.getDate() !== recurringDay) {
        expenseDate.setDate(0); // Set to last day of previous month
        expenseDate.setMonth(expenseDate.getMonth() + 1); // Move to correct month
      }

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
        isRecurring: true,
        recurringDay,
        recurringParentId: parentId,
        createdAt: now,
        updatedAt: now,
      });

      batch.set(docRef, cleanedData);
      createdIds.push(docRef.id);
    }

    await batch.commit();

    return createdIds;
  } catch (error) {
    console.error('Error creating recurring expenses:', error);
    throw new Error('Failed to create recurring expenses');
  }
}

/**
 * Create installment expenses (for BNPL payments)
 * Supports both auto-calculation and manual amounts
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
    const now = Timestamp.now();

    // Generate unique parent ID for linking installments
    const parentId = `installment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const installmentCount = expenseData.installmentCount!;
    const startDate = expenseData.installmentStartDate || expenseData.date;

    // Calculate amounts based on mode
    let installmentAmounts: number[];
    let totalAmount: number;

    if (expenseData.installmentMode === 'auto') {
      // Auto-calculation: divide total amount
      totalAmount = expenseData.installmentTotalAmount!;
      const perInstallment = totalAmount / installmentCount;
      const baseAmount = Math.floor(perInstallment * 100) / 100; // Round down to 2 decimals
      const remainder = totalAmount - (baseAmount * installmentCount);

      // All installments get base amount except last one (gets base + remainder)
      installmentAmounts = Array(installmentCount - 1).fill(baseAmount);
      installmentAmounts.push(baseAmount + remainder);
    } else {
      // Manual: use provided amounts
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
          ? `${expenseData.notes} (Rata ${i + 1}/${installmentCount})`
          : `Rata ${i + 1}/${installmentCount}`,
        link: expenseData.link,

        // Installment-specific fields
        isInstallment: true,
        installmentParentId: parentId,
        installmentNumber: i + 1,
        installmentTotal: installmentCount,
        installmentTotalAmount: totalAmount,

        createdAt: now,
        updatedAt: now,
      });

      batch.set(docRef, cleanedData);
      createdIds.push(docRef.id);
    }

    await batch.commit();

    console.log(`Created ${installmentCount} installment expenses with parent ID: ${parentId}`);
    return createdIds;
  } catch (error) {
    console.error('Error creating installment expenses:', error);
    throw new Error('Failed to create installment expenses');
  }
}

/**
 * Delete all expenses in an installment series
 * @param installmentParentId - The parent ID linking all installments
 */
export async function deleteInstallmentExpenses(installmentParentId: string): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('installmentParentId', '==', installmentParentId)
    );

    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);

    querySnapshot.docs.forEach(docSnapshot => {
      batch.delete(docSnapshot.ref);
    });

    await batch.commit();
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

    // If amount is being updated, ensure correct sign
    let updatedAmount = updates.amount;
    if (updatedAmount !== undefined && updates.type) {
      updatedAmount = Math.abs(updatedAmount);
      if (updates.type !== 'income') {
        updatedAmount = -updatedAmount;
      }
    }

    const cleanedUpdates = removeUndefinedFields({
      ...updates,
      amount: updatedAmount,
      categoryName,
      subCategoryName,
      date: updates.date ? Timestamp.fromDate(updates.date) : undefined,
      updatedAt: Timestamp.now(),
    });

    await updateDoc(expenseRef, cleanedUpdates);
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
    await deleteDoc(expenseRef);
  } catch (error) {
    console.error('Error deleting expense:', error);
    throw new Error('Failed to delete expense');
  }
}

/**
 * Delete all recurring expenses with the same parent ID
 */
export async function deleteRecurringExpenses(recurringParentId: string): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('recurringParentId', '==', recurringParentId)
    );

    const querySnapshot = await getDocs(q);
    const batch = writeBatch(db);

    querySnapshot.docs.forEach(docSnapshot => {
      batch.delete(docSnapshot.ref);
    });

    await batch.commit();
  } catch (error) {
    console.error('Error deleting recurring expenses:', error);
    throw new Error('Failed to delete recurring expenses');
  }
}

/**
 * Calculate monthly summary for a specific month
 */
export async function getMonthlyExpenseSummary(
  userId: string,
  year: number,
  month: number
): Promise<MonthlyExpenseSummary> {
  try {
    const expenses = await getExpensesByMonth(userId, year, month);

    const summary: MonthlyExpenseSummary = {
      year,
      month,
      totalIncome: 0,
      totalExpenses: 0,
      netBalance: 0,
      byCategory: {},
      byType: {
        fixed: { total: 0, count: 0 },
        variable: { total: 0, count: 0 },
        debt: { total: 0, count: 0 },
        income: { total: 0, count: 0 },
      },
    };

    expenses.forEach(expense => {
      // Update totals
      if (expense.type === 'income') {
        summary.totalIncome += expense.amount;
      } else {
        summary.totalExpenses += Math.abs(expense.amount);
      }

      // Update by category
      if (!summary.byCategory[expense.categoryId]) {
        summary.byCategory[expense.categoryId] = {
          categoryName: expense.categoryName,
          total: 0,
          count: 0,
        };
      }
      summary.byCategory[expense.categoryId].total += expense.amount;
      summary.byCategory[expense.categoryId].count += 1;

      // Update by type
      summary.byType[expense.type].total += Math.abs(expense.amount);
      summary.byType[expense.type].count += 1;
    });

    summary.netBalance = summary.totalIncome - summary.totalExpenses;

    return summary;
  } catch (error) {
    console.error('Error calculating monthly expense summary:', error);
    throw new Error('Failed to calculate monthly expense summary');
  }
}

/**
 * Get expense statistics with delta from previous month
 */
export async function getExpenseStats(userId: string): Promise<ExpenseStats> {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Calculate previous month
    let previousYear = currentYear;
    let previousMonth = currentMonth - 1;
    if (previousMonth === 0) {
      previousMonth = 12;
      previousYear -= 1;
    }

    const [currentSummary, previousSummary] = await Promise.all([
      getMonthlyExpenseSummary(userId, currentYear, currentMonth),
      getMonthlyExpenseSummary(userId, previousYear, previousMonth),
    ]);

    // Calculate deltas (percentage change)
    const incomeDelta = previousSummary.totalIncome > 0
      ? ((currentSummary.totalIncome - previousSummary.totalIncome) / previousSummary.totalIncome) * 100
      : 0;

    const expensesDelta = previousSummary.totalExpenses > 0
      ? ((currentSummary.totalExpenses - previousSummary.totalExpenses) / previousSummary.totalExpenses) * 100
      : 0;

    const netDelta = previousSummary.netBalance !== 0
      ? ((currentSummary.netBalance - previousSummary.netBalance) / Math.abs(previousSummary.netBalance)) * 100
      : 0;

    return {
      currentMonth: {
        income: currentSummary.totalIncome,
        expenses: currentSummary.totalExpenses,
        net: currentSummary.netBalance,
      },
      previousMonth: {
        income: previousSummary.totalIncome,
        expenses: previousSummary.totalExpenses,
        net: previousSummary.netBalance,
      },
      delta: {
        income: incomeDelta,
        expenses: expensesDelta,
        net: netDelta,
      },
    };
  } catch (error) {
    console.error('Error getting expense stats:', error);
    throw new Error('Failed to get expense stats');
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

/**
 * Calculate total expenses for a period
 */
export function calculateTotalExpenses(expenses: Expense[]): number {
  return expenses
    .filter(expense => expense.type !== 'income')
    .reduce((total, expense) => total + Math.abs(expense.amount), 0);
}

/**
 * Calculate net balance (income - expenses)
 */
export function calculateNetBalance(expenses: Expense[]): number {
  return calculateTotalIncome(expenses) - calculateTotalExpenses(expenses);
}

/**
 * Calculate income to expense ratio
 * Returns the ratio of total income to total expenses
 * Returns null if total expenses is 0 (to avoid division by zero)
 */
export function calculateIncomeExpenseRatio(expenses: Expense[]): number | null {
  const totalIncome = calculateTotalIncome(expenses);
  const totalExpenses = calculateTotalExpenses(expenses);

  if (totalExpenses === 0) {
    return null;
  }

  return totalIncome / totalExpenses;
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
        updatedAt: Timestamp.now(),
      });
    });

    await batch.commit();
  } catch (error) {
    console.error('Error updating expenses category name:', error);
    throw new Error('Failed to update expenses category name');
  }
}

/**
 * Update all expenses when a subcategory name changes
 */
export async function updateExpensesSubCategoryName(
  categoryId: string,
  subCategoryId: string,
  newSubCategoryName: string,
  userId: string
): Promise<void> {
  try {
    const expensesRef = collection(db, EXPENSES_COLLECTION);
    const q = query(
      expensesRef,
      where('userId', '==', userId),
      where('categoryId', '==', categoryId),
      where('subCategoryId', '==', subCategoryId)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return; // No expenses to update
    }

    const batch = writeBatch(db);

    querySnapshot.docs.forEach(docSnapshot => {
      batch.update(docSnapshot.ref, {
        subCategoryName: newSubCategoryName,
        updatedAt: Timestamp.now(),
      });
    });

    await batch.commit();
  } catch (error) {
    console.error('Error updating expenses subcategory name:', error);
    throw new Error('Failed to update expenses subcategory name');
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
        updatedAt: Timestamp.now(),
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
        categoryName: 'Senza categoria',
        subCategoryId: null,
        subCategoryName: null,
        updatedAt: Timestamp.now(),
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
        updatedAt: Timestamp.now(),
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
