import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export interface DummyDataCount {
  snapshots: number;
  expenses: number;
  categories: number;
  total: number;
}

/**
 * Gets count of all dummy data for a user
 */
export async function getDummyDataCount(userId: string): Promise<DummyDataCount> {
  const [snapshotsCount, expensesCount, categoriesCount] = await Promise.all([
    countDummySnapshots(userId),
    countDummyExpenses(userId),
    countDummyCategories(userId),
  ]);

  return {
    snapshots: snapshotsCount,
    expenses: expensesCount,
    categories: categoriesCount,
    total: snapshotsCount + expensesCount + categoriesCount,
  };
}

/**
 * Counts dummy snapshots for a user
 */
async function countDummySnapshots(userId: string): Promise<number> {
  const snapshotsCollection = collection(db, 'monthly-snapshots');
  const q = query(
    snapshotsCollection,
    where('userId', '==', userId),
    where('isDummy', '==', true)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.size;
}

/**
 * Counts dummy expenses for a user
 */
async function countDummyExpenses(userId: string): Promise<number> {
  const expensesCollection = collection(db, 'expenses');

  // Query for expenses with ID starting with "dummy-"
  const q = query(
    expensesCollection,
    where('userId', '==', userId)
  );

  const querySnapshot = await getDocs(q);

  // Filter by ID prefix (Firestore doesn't support startsWith in queries)
  const dummyExpenses = querySnapshot.docs.filter(doc =>
    doc.id.startsWith('dummy-')
  );

  return dummyExpenses.length;
}

/**
 * Counts dummy expense categories for a user
 */
async function countDummyCategories(userId: string): Promise<number> {
  const categoriesCollection = collection(db, 'expenseCategories');

  // Query for categories with ID starting with "dummy-category-"
  const q = query(
    categoriesCollection,
    where('userId', '==', userId)
  );

  const querySnapshot = await getDocs(q);

  // Filter by ID prefix
  const dummyCategories = querySnapshot.docs.filter(doc =>
    doc.id.startsWith('dummy-category-')
  );

  return dummyCategories.length;
}

/**
 * Deletes all dummy snapshots for a user
 */
export async function deleteDummySnapshots(userId: string): Promise<number> {
  const snapshotsCollection = collection(db, 'monthly-snapshots');
  const q = query(
    snapshotsCollection,
    where('userId', '==', userId),
    where('isDummy', '==', true)
  );

  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) {
    return 0;
  }

  // Use batch for efficient bulk deletion
  const batch = writeBatch(db);

  querySnapshot.docs.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });

  await batch.commit();
  return querySnapshot.size;
}

/**
 * Deletes all dummy expenses for a user
 */
export async function deleteDummyExpenses(userId: string): Promise<number> {
  const expensesCollection = collection(db, 'expenses');
  const q = query(
    expensesCollection,
    where('userId', '==', userId)
  );

  const querySnapshot = await getDocs(q);

  // Filter by ID prefix
  const dummyExpenses = querySnapshot.docs.filter(doc =>
    doc.id.startsWith('dummy-')
  );

  if (dummyExpenses.length === 0) {
    return 0;
  }

  // Use batch for efficient bulk deletion
  const batch = writeBatch(db);

  dummyExpenses.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });

  await batch.commit();
  return dummyExpenses.length;
}

/**
 * Deletes all dummy expense categories for a user
 */
export async function deleteDummyCategories(userId: string): Promise<number> {
  const categoriesCollection = collection(db, 'expenseCategories');
  const q = query(
    categoriesCollection,
    where('userId', '==', userId)
  );

  const querySnapshot = await getDocs(q);

  // Filter by ID prefix
  const dummyCategories = querySnapshot.docs.filter(doc =>
    doc.id.startsWith('dummy-category-')
  );

  if (dummyCategories.length === 0) {
    return 0;
  }

  // Use batch for efficient bulk deletion
  const batch = writeBatch(db);

  dummyCategories.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });

  await batch.commit();
  return dummyCategories.length;
}

/**
 * Deletes all dummy data (snapshots, expenses, and categories) for a user
 * Returns the total number of items deleted
 */
export async function deleteAllDummyData(userId: string): Promise<{
  snapshots: number;
  expenses: number;
  categories: number;
  total: number;
}> {
  // Delete all types of dummy data in parallel for better performance
  const [snapshotsDeleted, expensesDeleted, categoriesDeleted] = await Promise.all([
    deleteDummySnapshots(userId),
    deleteDummyExpenses(userId),
    deleteDummyCategories(userId),
  ]);

  return {
    snapshots: snapshotsDeleted,
    expenses: expensesDeleted,
    categories: categoriesDeleted,
    total: snapshotsDeleted + expensesDeleted + categoriesDeleted,
  };
}
