/**
 * Expense Import Service (thin Firestore layer)
 *
 * Commits an ImportPlan produced by the pure lib/utils/expenseImport.ts layer:
 * creates any missing categories/subcategories, then bulk-writes the expenses.
 *
 * Key behaviours:
 * - Every written expense is stamped with a shared `importBatchId`, so an entire
 *   import can be undone in one call (deleteExpensesByImportBatch).
 * - Amount sign convention is applied here (expenses negative, income positive) —
 *   the plan carries positive magnitudes.
 * - We DELIBERATELY do not set `linkedCashAssetId` / touch cash-asset balances:
 *   historical rows must not mutate current balances (`transfer` rows are
 *   already excluded upstream by buildImportPlan).
 * - `existingCategories` is the same array the caller already fetched via
 *   `getAllCategories` to build the plan (never `getCategoriesByType`, which
 *   needs a composite index that isn't deployed). New categories/subcategories
 *   are resolved from the IDs returned by createCategory/updateCategory —
 *   no extra Firestore read is needed to find them.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { removeUndefinedDeep as removeUndefinedFields } from '@/lib/utils/firestoreData';
import { invalidateDashboardOverviewSummary } from '@/lib/services/dashboardOverviewInvalidation';
import { createCategory, updateCategory } from '@/lib/services/expenseCategoryService';
import { categoryMatchKey } from '@/lib/utils/expenseImport';
import { ImportPlan } from '@/types/expenseImport';
import { ExpenseCategory, ExpenseSubCategory } from '@/types/expenses';

const EXPENSES_COLLECTION = 'expenses';
const BATCH_LIMIT = 400; // mirror costCenterService chunking (Firestore hard limit is 500)

const norm = (s: string): string => s.trim().toLowerCase();
const genSubId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
const genImportBatchId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `import-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

/**
 * Commit a validated ImportPlan for a user.
 *
 * Creates missing categories/subcategories, then writes plan.validRows as expense
 * documents tagged with a fresh importBatchId. Returns the batch id and the number
 * of expenses created (so the UI can offer "undo import").
 */
export async function commitImportPlan(
  userId: string,
  plan: ImportPlan,
  existingCategories: ExpenseCategory[]
): Promise<{ importBatchId: string; created: number }> {
  // Two lookups over the same objects, mirroring how the plan resolved: by document
  // id (rows that attached to an existing category) and by the shared (name, type)
  // key (rows whose category is created below). Same-named same-typed duplicates
  // keep the OLDEST document, matching buildImportPlan's resolution exactly.
  const byId = new Map<string, ExpenseCategory>(existingCategories.map((c) => [c.id, c]));
  const byKey = new Map<string, ExpenseCategory>();
  for (const c of [...existingCategories].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    byKey.set(categoryMatchKey(c.name, c.type), c); // oldest last → oldest wins
  }

  // 1. Create brand-new categories, capturing their Firestore ID directly from createCategory.
  for (const c of plan.categoriesToCreate) {
    const subCategories: ExpenseSubCategory[] = c.subCategories.map((name) => ({ id: genSubId(), name }));
    const categoryId = await createCategory(userId, { name: c.name, type: c.type, subCategories });
    const created: ExpenseCategory = {
      id: categoryId,
      userId,
      name: c.name,
      type: c.type,
      subCategories,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    byId.set(categoryId, created);
    byKey.set(categoryMatchKey(c.name, c.type), created);
  }

  // 2. Add missing subcategories to already-existing categories, merging in-memory
  // (no re-read needed — we already hold the category's current subCategories).
  for (const s of plan.subCategoriesToCreate) {
    const category = byId.get(s.categoryId);
    if (!category) continue;
    const existingNames = new Set(category.subCategories.map((sc) => norm(sc.name)));
    const additions: ExpenseSubCategory[] = s.subCategoryNames
      .filter((n) => !existingNames.has(norm(n)))
      .map((name) => ({ id: genSubId(), name }));
    if (additions.length === 0) continue;
    const mergedSubCategories = [...category.subCategories, ...additions];
    await updateCategory(s.categoryId, { subCategories: mergedSubCategories });
    const merged = { ...category, subCategories: mergedSubCategories };
    byId.set(category.id, merged);
    byKey.set(categoryMatchKey(category.name, category.type), merged);
  }

  const importBatchId = genImportBatchId();
  const now = new Date();

  // 3. Bulk-write the expenses in chunks (Firestore hard limit is 500 ops/batch).
  const batches: ReturnType<typeof writeBatch>[] = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;
  let created = 0;

  for (const row of plan.validRows) {
    // Id resolved by the plan when the category pre-existed; (name, type) key for
    // the ones created in step 1.
    const category =
      (row.categoryId ? byId.get(row.categoryId) : undefined) ??
      byKey.get(categoryMatchKey(row.categoryName, row.type));
    if (!category) continue; // should not happen — every valid row's category was created/exists
    const sub = row.subCategoryName
      ? category.subCategories.find((sc) => norm(sc.name) === norm(row.subCategoryName!))
      : undefined;

    // Sign convention: income positive, all other importable types (fixed/variable/debt) negative.
    const amount = row.type === 'income' ? row.amount : -row.amount;

    const data = removeUndefinedFields({
      userId,
      type: row.type,
      categoryId: category.id,
      categoryName: category.name,
      subCategoryId: sub?.id,
      subCategoryName: sub?.name,
      amount,
      currency: row.currency,
      date: Timestamp.fromDate(row.date),
      notes: row.notes,
      isRecurring: false,
      // No linkedCashAssetId on purpose — historical import must not reconcile balances.
      importBatchId,
      createdAt: now,
      updatedAt: now,
    });

    currentBatch.set(doc(collection(db, EXPENSES_COLLECTION)), data);
    created++;
    opCount++;
    if (opCount === BATCH_LIMIT) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  }
  if (opCount > 0) batches.push(currentBatch);

  await Promise.all(batches.map((b) => b.commit()));
  await invalidateDashboardOverviewSummary(userId, 'expense_created');

  return { importBatchId, created };
}

/**
 * Delete every expense written by a given import batch. Used by the "Annulla import"
 * action. Returns the number of expenses deleted.
 */
export async function deleteExpensesByImportBatch(userId: string, importBatchId: string): Promise<number> {
  const q = query(
    collection(db, EXPENSES_COLLECTION),
    where('userId', '==', userId),
    where('importBatchId', '==', importBatchId)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;

  const batches: ReturnType<typeof writeBatch>[] = [];
  let currentBatch = writeBatch(db);
  let opCount = 0;

  snapshot.docs.forEach((d) => {
    currentBatch.delete(d.ref);
    opCount++;
    if (opCount === BATCH_LIMIT) {
      batches.push(currentBatch);
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  });
  if (opCount > 0) batches.push(currentBatch);

  await Promise.all(batches.map((b) => b.commit()));
  await invalidateDashboardOverviewSummary(userId, 'expense_deleted');

  return snapshot.size;
}
