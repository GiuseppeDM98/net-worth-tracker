import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { BudgetConfig, BudgetItem } from '@/types/budget';

// Budget Service
//
// Manages CRUD for the user's budget configuration stored as a single
// Firestore document at budgets/{userId}. Full replacement on every write
// (no partial merge) to avoid stale array entries.

const BUDGETS_COLLECTION = 'budgets';

/** Fetch the user's budget config. Returns null if no document exists yet. */
export async function getBudgetConfig(userId: string): Promise<BudgetConfig | null> {
  try {
    const docRef = doc(db, BUDGETS_COLLECTION, userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      userId: data.userId,
      items: (data.items || []) as BudgetItem[],
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    console.error('Error getting budget config:', error);
    throw new Error('Failed to fetch budget config');
  }
}

/** Save the user's budget config (complete replacement). */
export async function saveBudgetConfig(userId: string, items: BudgetItem[]): Promise<void> {
  try {
    const docRef = doc(db, BUDGETS_COLLECTION, userId);

    // Strip undefined fields — Firestore rejects them
    const cleanItems = items.map((item) => {
      const clean: Record<string, unknown> = {
        id: item.id,
        scope: item.scope,
        monthlyAmount: item.monthlyAmount,
        order: item.order,
      };
      if (item.expenseType != null) clean.expenseType = item.expenseType;
      if (item.categoryId != null) clean.categoryId = item.categoryId;
      if (item.categoryName != null) clean.categoryName = item.categoryName;
      if (item.subCategoryId != null) clean.subCategoryId = item.subCategoryId;
      if (item.subCategoryName != null) clean.subCategoryName = item.subCategoryName;
      return clean;
    });

    await setDoc(docRef, {
      userId,
      items: cleanItems,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error saving budget config:', error);
    throw error;
  }
}
