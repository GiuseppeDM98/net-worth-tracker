/**
 * COST CENTER SERVICE
 *
 * CRUD operations for cost centers and helpers to query associated expenses.
 *
 * DESIGN DECISION — flat collection vs subcollection:
 * We use a top-level `costCenters` collection keyed by auto-ID (same pattern as `expenses`
 * and `expenseCategories`). Each document carries a `userId` field for ownership checks and
 * for the "list all cost centers for a user" query. Firestore's compound query
 * (where userId == uid + orderBy createdAt) requires a composite index — we create it
 * lazily when Firestore logs the index URL.
 *
 * DENORMALIZATION:
 * When a cost center is renamed, callers must invoke `renameCostCenter()` which bulk-updates
 * all expenses in that cost center. This avoids expensive join queries at read time.
 * WARNING: If you add new places that store costCenterName, update `renameCostCenter` too.
 */

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { CostCenter, CostCenterFormData } from '@/types/costCenters';
import { Expense } from '@/types/expenses';
import { toDate } from '@/lib/utils/dateHelpers';

const COST_CENTERS = 'costCenters';
const EXPENSES = 'expenses';

// --- Converters ---

function docToCostCenter(id: string, data: Record<string, unknown>): CostCenter {
  return {
    id,
    userId: data.userId as string,
    name: data.name as string,
    description: data.description as string | undefined,
    color: data.color as string | undefined,
    createdAt: toDate(data.createdAt as never),
    updatedAt: toDate(data.updatedAt as never),
  };
}

// --- Read ---

/**
 * Returns all cost centers for the given user, ordered by creation date ascending.
 */
export async function getCostCenters(userId: string): Promise<CostCenter[]> {
  const q = query(
    collection(db, COST_CENTERS),
    where('userId', '==', userId),
    orderBy('createdAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => docToCostCenter(d.id, d.data() as Record<string, unknown>));
}

/**
 * Returns all expenses assigned to a specific cost center.
 * Results are ordered by date ascending so the caller can build monthly aggregates.
 */
export async function getExpensesForCostCenter(
  userId: string,
  costCenterId: string
): Promise<Expense[]> {
  const q = query(
    collection(db, EXPENSES),
    where('userId', '==', userId),
    where('costCenterId', '==', costCenterId),
    orderBy('date', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data() as Omit<Expense, 'id'>;
    return { ...data, id: d.id } as Expense;
  });
}

// --- Write ---

/**
 * Creates a new cost center document and returns the full object with generated ID.
 */
export async function createCostCenter(
  userId: string,
  formData: CostCenterFormData
): Promise<CostCenter> {
  const payload = {
    userId,
    name: formData.name.trim(),
    description: formData.description?.trim() ?? null,
    color: formData.color ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, COST_CENTERS), payload);
  // serverTimestamp() resolves asynchronously; use Date.now() as a local stand-in.
  const now = new Date();
  return {
    id: ref.id,
    userId,
    name: payload.name,
    description: payload.description ?? undefined,
    color: payload.color ?? undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates mutable fields of a cost center.
 * If the name changed, also bulk-updates costCenterName on all linked expenses.
 */
export async function updateCostCenter(
  costCenter: CostCenter,
  formData: CostCenterFormData
): Promise<void> {
  const ref = doc(db, COST_CENTERS, costCenter.id);
  const newName = formData.name.trim();
  await updateDoc(ref, {
    name: newName,
    description: formData.description?.trim() ?? null,
    color: formData.color ?? null,
    updatedAt: serverTimestamp(),
  });

  // Keep denormalized costCenterName in sync when the name changes.
  if (newName !== costCenter.name) {
    await renameCostCenterInExpenses(costCenter.userId, costCenter.id, newName);
  }
}

/**
 * Deletes a cost center and removes the costCenterId/costCenterName from all linked expenses.
 * We do NOT delete the expenses themselves — they remain in Cashflow without a cost center.
 */
export async function deleteCostCenter(
  userId: string,
  costCenterId: string
): Promise<void> {
  // Unlink all associated expenses first (batched writes, max 500 per batch).
  const expenses = await getExpensesForCostCenter(userId, costCenterId);
  const batches: ReturnType<typeof writeBatch>[] = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;

  for (const expense of expenses) {
    const ref = doc(db, EXPENSES, expense.id);
    // Remove the cost center fields by setting them to null;
    // Firestore doesn't support deleteField() in updateDoc via a map literal without importing it,
    // so we set to null and filter nulls out in the UI layer.
    currentBatch.update(ref, { costCenterId: null, costCenterName: null });
    opCount++;
    if (opCount === 400) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  }
  if (opCount > 0) batches.push(currentBatch);

  await Promise.all(batches.map(b => b.commit()));
  await deleteDoc(doc(db, COST_CENTERS, costCenterId));
}

// --- Internal helpers ---

/**
 * Bulk-updates costCenterName on all expenses belonging to a cost center.
 * Called by updateCostCenter when the name changes.
 */
async function renameCostCenterInExpenses(
  userId: string,
  costCenterId: string,
  newName: string
): Promise<void> {
  const expenses = await getExpensesForCostCenter(userId, costCenterId);
  const batches: ReturnType<typeof writeBatch>[] = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;

  for (const expense of expenses) {
    currentBatch.update(doc(db, EXPENSES, expense.id), { costCenterName: newName });
    opCount++;
    if (opCount === 400) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  }
  if (opCount > 0) batches.push(currentBatch);
  await Promise.all(batches.map(b => b.commit()));
}
