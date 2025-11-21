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
import {
  ExpenseCategory,
  ExpenseCategoryFormData,
  ExpenseType,
  ExpenseSubCategory
} from '@/types/expenses';
import {
  updateExpensesCategoryName,
  updateExpensesSubCategoryName,
} from './expenseService';

const CATEGORIES_COLLECTION = 'expenseCategories';

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
 * Get categories by type for a specific user
 */
export async function getCategoriesByType(
  userId: string,
  type: ExpenseType
): Promise<ExpenseCategory[]> {
  try {
    const categoriesRef = collection(db, CATEGORIES_COLLECTION);
    const q = query(
      categoriesRef,
      where('userId', '==', userId),
      where('type', '==', type),
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
    console.error('Error getting expense categories by type:', error);
    throw new Error('Failed to fetch expense categories by type');
  }
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
    const now = Timestamp.now();
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
  updates: Partial<ExpenseCategoryFormData>
): Promise<void> {
  try {
    // If the name is being updated, also update all associated expenses
    if (updates.name) {
      const oldCategory = await getCategoryById(categoryId);
      if (oldCategory && oldCategory.name !== updates.name) {
        // Update all expenses with this category
        await updateExpensesCategoryName(categoryId, updates.name);
      }
    }

    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);

    const cleanedUpdates = removeUndefinedFields({
      ...updates,
      updatedAt: Timestamp.now(),
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

/**
 * Add a subcategory to an existing category
 */
export async function addSubCategory(
  categoryId: string,
  subCategoryName: string
): Promise<void> {
  try {
    const category = await getCategoryById(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    // Check if subcategory already exists
    if (category.subCategories.some(sub => sub.name === subCategoryName)) {
      throw new Error('Subcategory already exists');
    }

    // Generate a simple ID for the subcategory
    const newSubCategory: ExpenseSubCategory = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: subCategoryName,
    };

    const updatedSubCategories = [...category.subCategories, newSubCategory];

    await updateCategory(categoryId, {
      subCategories: updatedSubCategories,
    });
  } catch (error) {
    console.error('Error adding subcategory:', error);
    throw new Error('Failed to add subcategory');
  }
}

/**
 * Remove a subcategory from a category
 */
export async function removeSubCategory(
  categoryId: string,
  subCategoryId: string
): Promise<void> {
  try {
    const category = await getCategoryById(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    const updatedSubCategories = category.subCategories.filter(
      sub => sub.id !== subCategoryId
    );

    await updateCategory(categoryId, {
      subCategories: updatedSubCategories,
    });
  } catch (error) {
    console.error('Error removing subcategory:', error);
    throw new Error('Failed to remove subcategory');
  }
}

/**
 * Update a subcategory name
 * Automatically updates all associated expenses with the new subcategory name
 */
export async function updateSubCategory(
  categoryId: string,
  subCategoryId: string,
  newName: string
): Promise<void> {
  try {
    const category = await getCategoryById(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    // Find the old subcategory to check if name is different
    const oldSubCategory = category.subCategories.find(sub => sub.id === subCategoryId);

    if (oldSubCategory && oldSubCategory.name !== newName) {
      // Update all expenses with this subcategory
      await updateExpensesSubCategoryName(categoryId, subCategoryId, newName);
    }

    const updatedSubCategories = category.subCategories.map(sub =>
      sub.id === subCategoryId ? { ...sub, name: newName } : sub
    );

    // Use direct Firestore update to avoid infinite recursion
    const categoryRef = doc(db, CATEGORIES_COLLECTION, categoryId);
    const cleanedUpdates = removeUndefinedFields({
      subCategories: updatedSubCategories,
      updatedAt: Timestamp.now(),
    });
    await updateDoc(categoryRef, cleanedUpdates);
  } catch (error) {
    console.error('Error updating subcategory:', error);
    throw new Error('Failed to update subcategory');
  }
}
