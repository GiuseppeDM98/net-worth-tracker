/**
 * Expense Category Service
 *
 * Manages categories and subcategories for expense classification.
 *
 * Features:
 * - CRUD operations for categories and subcategories
 * - Filter categories by type (fixed, variable, debt, income)
 * - Cascading updates: When category/subcategory names change, all associated expenses are updated
 * - Subcategories stored as nested array within category documents
 *
 * Structure:
 * - Category: Top-level classification (e.g., "Housing", "Food")
 * - SubCategory: Optional second-level classification (e.g., "Housing" → "Rent", "Utilities")
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
  orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import {
  ExpenseCategory,
  ExpenseCategoryFormData,
} from '@/types/expenses';
import {
  updateExpensesCategoryName,
  updateExpensesType,
} from './expenseService';

const CATEGORIES_COLLECTION = 'expenseCategories';

/**
 * Get all categories for a specific user
 */
export async function getAllCategories(userId: string): Promise<ExpenseCategory[]> {
  try {
    const categoriesRef = collection(db, CATEGORIES_COLLECTION);
    const q = query(
      categoriesRef,
      where('userId', '==', userId),
      orderBy('name', 'asc')
    );

    const querySnapshot = await getDocs(q);

    const categories = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      subCategories: doc.data().subCategories || [],
    })) as ExpenseCategory[];

    return categories;
  } catch (error) {
    console.error('Error getting expense categories:', error);
    throw new Error('Failed to fetch expense categories');
  }
}

/**
 * Ensure a system "Trasferimenti" category of type 'transfer' exists for the user.
 * Returns the category ID — creates the category if missing.
 */
export async function ensureTransferCategory(userId: string): Promise<string> {
  const categories = await getAllCategories(userId);
  const existing = categories.find(c => c.type === 'transfer');
  if (existing) return existing.id;

  return createCategory(userId, {
    name: 'Trasferimenti',
    type: 'transfer',
    icon: 'ArrowLeftRight',
    subCategories: [],
  });
}

/**
 * Get a single category by ID
 */
export async function getCategoryById(categoryId: string): Promise<ExpenseCategory | null> {
  try {
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    const categoryDoc = await getDoc(categoryRef);

    if (!categoryDoc.exists()) {
      return null;
    }

    return {
      id: categoryDoc.id,
      ...categoryDoc.data(),
      createdAt: categoryDoc.data().createdAt?.toDate() || new Date(),
      updatedAt: categoryDoc.data().updatedAt?.toDate() || new Date(),
      subCategories: categoryDoc.data().subCategories || [],
    } as ExpenseCategory;
  } catch (error) {
    console.error('Error getting expense category:', error);
    throw new Error('Failed to fetch expense category');
  }
}

/**
 * Create a new expense category
 */
export async function createCategory(
  userId: string,
  categoryData: ExpenseCategoryFormData
): Promise<string> {
  try {
    const now = new Date();
    const categoriesRef = collection(db, CATEGORIES_COLLECTION);

    const cleanedData = removeUndefinedFields({
      ...categoryData,
      userId,
      subCategories: categoryData.subCategories || [],
      createdAt: now,
      updatedAt: now,
    });

    const docRef = await addDoc(categoriesRef, cleanedData);

    return docRef.id;
  } catch (error) {
    console.error('Error creating expense category:', error);
    throw new Error('Failed to create expense category');
  }
}

/**
 * Update an existing expense category
 * Automatically updates all associated expenses if the category name changes
 */
export async function updateCategory(
  categoryId: string,
  updates: Partial<ExpenseCategoryFormData>,
  userId?: string
): Promise<void> {
  try {
    // Fetch old category once to check both name and type changes
    let oldCategory: Awaited<ReturnType<typeof getCategoryById>> | null = null;
    if ((updates.name || updates.type) && userId) {
      oldCategory = await getCategoryById(categoryId);
    }

    // Cascade name change to all associated expenses
    if (updates.name && userId && oldCategory && oldCategory.name !== updates.name) {
      await updateExpensesCategoryName(categoryId, updates.name, userId);
    }

    // Cascade type change to all associated expenses, flipping signs when crossing income ↔ expense
    if (updates.type && userId && oldCategory && oldCategory.type !== updates.type) {
      await updateExpensesType(categoryId, oldCategory.type, updates.type, userId);
    }

    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);

    const cleanedUpdates = removeUndefinedFields({
      ...updates,
      updatedAt: new Date(),
    });

    await updateDoc(categoryRef, cleanedUpdates);
  } catch (error) {
    console.error('Error updating expense category:', error);
    throw new Error('Failed to update expense category');
  }
}

/**
 * Delete an expense category
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  try {
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    await deleteDoc(categoryRef);
  } catch (error) {
    console.error('Error deleting expense category:', error);
    throw new Error('Failed to delete expense category');
  }
}

