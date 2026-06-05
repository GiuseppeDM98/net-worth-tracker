import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { BudgetConfig, BudgetItem } from '@/types/budget';

// Budget Service
//
// Manages CRUD for the user's budget configuration stored as a single
// Firestore document at budgets/{userId}. Full replacement on every write
// (no partial merge) to avoid stale array entries.

const BUDGETS_COLLECTION = 'budgets';

// Settings persisted alongside the budget items in the same document.
export interface BudgetConfigSettings {
  overallMonthlyAmount?: number;
  alertsEnabled?: boolean;
  alertThresholds?: number[];
}

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
      // Migrate items saved before income/expense kind, period, or the
      // monthlyAmount→amount rename existed.
      items: ((data.items || []) as BudgetItem[]).map(normalizeItem),
      overallMonthlyAmount: data.overallMonthlyAmount,
      alertsEnabled: data.alertsEnabled,
      alertThresholds: data.alertThresholds,
      updatedAt: data.updatedAt,
    };
  } catch (error) {
    console.error('Error getting budget config:', error);
    throw new Error('Failed to fetch budget config');
  }
}

/** Save the user's budget config (complete replacement). */
export async function saveBudgetConfig(
  userId: string,
  items: BudgetItem[],
  settings: BudgetConfigSettings = {}
): Promise<void> {
  try {
    const docRef = doc(db, BUDGETS_COLLECTION, userId);

    // Strip undefined fields — Firestore rejects them
    const cleanItems = items.map((item) => {
      const normalized = normalizeItem(item);
      const clean: Record<string, unknown> = {
        id: normalized.id,
        kind: normalized.kind,
        scope: normalized.scope,
        period: normalized.period,
        amount: normalized.amount,
        order: normalized.order,
      };
      if (normalized.expenseType != null) clean.expenseType = normalized.expenseType;
      if (normalized.categoryId != null) clean.categoryId = normalized.categoryId;
      if (normalized.categoryName != null) clean.categoryName = normalized.categoryName;
      if (normalized.subCategoryId != null) clean.subCategoryId = normalized.subCategoryId;
      if (normalized.subCategoryName != null) clean.subCategoryName = normalized.subCategoryName;
      return clean;
    });

    const payload: Record<string, unknown> = {
      userId,
      items: cleanItems,
      updatedAt: new Date(),
    };
    if (settings.overallMonthlyAmount != null) payload.overallMonthlyAmount = settings.overallMonthlyAmount;
    if (settings.alertsEnabled != null) payload.alertsEnabled = settings.alertsEnabled;
    if (settings.alertThresholds != null) payload.alertThresholds = settings.alertThresholds;

    await setDoc(docRef, payload);
  } catch (error) {
    console.error('Error saving budget config:', error);
    throw error;
  }
}

/**
 * Back-fills fields added after the first budget release so older documents keep
 * working:
 *   - `kind`: a 'type'-scope item is income only when expenseType==='income';
 *     category/subcategory items default to 'expense' (reconciled later).
 *   - `period`: defaults to 'monthly'.
 *   - `amount`: falls back to the legacy `monthlyAmount` field.
 */
function normalizeItem(item: BudgetItem): BudgetItem {
  const legacy = item as BudgetItem & { monthlyAmount?: number };
  const kind =
    item.kind === 'expense' || item.kind === 'income'
      ? item.kind
      : item.scope === 'type' && item.expenseType === 'income'
        ? 'income'
        : 'expense';
  return {
    ...item,
    kind,
    period: item.period ?? 'monthly',
    amount: item.amount ?? legacy.monthlyAmount ?? 0,
  };
}
