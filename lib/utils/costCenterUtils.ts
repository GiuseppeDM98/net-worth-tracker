/**
 * Cost Center pure utilities — the center-level facts that do not depend on a window:
 * the composition by category and by subcategory, the fixed/one-off split, the last
 * activity and the lifecycle derived from it. Every figure that IS a window (lifetime
 * total, year-to-date, the ceiling, the projections) lives in `costCenterSummary.ts`,
 * which builds on these. The period axis and its helpers (`filterExpensesByPeriod`,
 * `computePeriodComparison`) retired with the 2026-08-23 redesign: the page reads a
 * center's whole cost.
 *
 * SIGN CONVENTION:
 * Expenses are stored as negative numbers. Callers pass the already-filtered list of
 * outgoing expenses (amount < 0); every figure returned here is a positive "cost".
 */

import { Expense, EXPENSE_TYPE_LABELS, NO_SUBCATEGORY_KEY, NO_SUBCATEGORY_LABEL } from '@/types/expenses';
import { getCategoryKey, resolveDisplayLabels } from '@/lib/utils/expenseGrouping';
import { CostCenter, CostCenterCategorySlice, CostCenterSubCategorySlice, CostCenterRecurringSplit, CostCenterLifecycle } from '@/types/costCenters';
import { toDate } from '@/lib/utils/dateHelpers';

// A center is "dormant" (but not archived) when it has had no spending for this many
// days. Surfaced visually so a long-finished project doesn't look active forever.
export const DORMANT_THRESHOLD_DAYS = 90;

// Categories beyond this rank collapse into a single "Altro" slice so the composition
// list stays readable instead of sprouting a dozen thin rows.
const MAX_COMPOSITION_CATEGORIES = 5;

const OTHER_CATEGORY_LABEL = 'Altro';

const absAmount = (e: Expense) => Math.abs(e.amount);

// ==================== Last activity ====================

/**
 * Most recent activity across the center's WHOLE history, never a window of it.
 *
 * Dormancy is a fact about the center, not about any axis: a period-scoped last date made a
 * center with no spend in the selected window report `null`, and null maps to 'dormant'
 * without ever reaching the 90-day threshold the status exists to measure. The redesign
 * dropped the axis, and this stays the one read `getLifecycleStatus` is fed.
 */
export function resolveLastActivityDate(expenses: Expense[]): Date | null {
  if (expenses.length === 0) return null;
  return expenses
    .map((e) => toDate(e.date))
    .reduce((max, d) => (d > max ? d : max));
}

// ==================== Category composition (A4) ====================

/**
 * Breaks the center's spend down by expense category, sorted by amount descending.
 * Categories past MAX_COMPOSITION_CATEGORIES collapse into a single "Altro" slice so
 * the breakdown stays readable.
 */
export function buildCategoryComposition(expenses: Expense[]): CostCenterCategorySlice[] {
  if (expenses.length === 0) return [];

  // Keyed by category id (name-fallback for legacy rows): two same-named categories
  // are two slices, disambiguated with their type qualifier only when both land on
  // screen — the same identity rule as buildSubCategoryComposition below.
  const byCategory = new Map<string, { name: string; qualifier: string; total: number; count: number }>();
  for (const e of expenses) {
    const key = getCategoryKey(e);
    const entry = byCategory.get(key) ?? {
      name: e.categoryName?.trim() || OTHER_CATEGORY_LABEL,
      qualifier: EXPENSE_TYPE_LABELS[e.type],
      total: 0,
      count: 0,
    };
    entry.total += absAmount(e);
    entry.count += 1;
    byCategory.set(key, entry);
  }

  const grandTotal = [...byCategory.values()].reduce((sum, v) => sum + v.total, 0) || 1;
  const sorted = [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total);

  const head = sorted.slice(0, MAX_COMPOSITION_CATEGORIES);
  const tail = sorted.slice(MAX_COMPOSITION_CATEGORIES);

  const labels = resolveDisplayLabels(
    head.map(([key, v]) => ({ key, name: v.name, qualifier: v.qualifier }))
  );

  const slices: CostCenterCategorySlice[] = head.map(([key, v]) => ({
    key,
    categoryName: labels.get(key) ?? v.name,
    total: v.total,
    pct: v.total / grandTotal,
    transactionCount: v.count,
  }));

  if (tail.length > 0) {
    const total = tail.reduce((sum, [, v]) => sum + v.total, 0);
    const count = tail.reduce((sum, [, v]) => sum + v.count, 0);
    slices.push({
      key: OTHER_CATEGORY_LABEL,
      categoryName: OTHER_CATEGORY_LABEL,
      total,
      pct: total / grandTotal,
      transactionCount: count,
    });
  }

  return slices;
}

/**
 * Breaks the center's spend down by subcategory, sorted by amount descending.
 *
 * Keyed by `subCategoryId` (not name) so two subcategories sharing a label under
 * different categories stay distinct; expenses without a subcategory collapse into a
 * single "Senza sottocategoria" slice. Unlike the category composition this does NOT
 * cap into an "Altro" bucket — every subcategory stays its own row so the caller can
 * toggle each one on/off when answering "how much net of subcategory X?".
 *
 * Returns absolute totals + counts; the net total and per-row share are derived by the
 * caller over the currently-included subset.
 */
export function buildSubCategoryComposition(expenses: Expense[]): CostCenterSubCategorySlice[] {
  if (expenses.length === 0) return [];

  const bySubCategory = new Map<string, { subCategoryName: string; categoryName: string; total: number; count: number }>();
  for (const e of expenses) {
    const key = e.subCategoryId?.trim() || NO_SUBCATEGORY_KEY;
    const subCategoryName =
      key === NO_SUBCATEGORY_KEY ? NO_SUBCATEGORY_LABEL : e.subCategoryName?.trim() || NO_SUBCATEGORY_LABEL;
    const categoryName = e.categoryName?.trim() || OTHER_CATEGORY_LABEL;
    const entry = bySubCategory.get(key) ?? { subCategoryName, categoryName, total: 0, count: 0 };
    entry.total += absAmount(e);
    entry.count += 1;
    bySubCategory.set(key, entry);
  }

  return [...bySubCategory.entries()]
    .map(([key, v]) => ({
      key,
      subCategoryName: v.subCategoryName,
      categoryName: v.categoryName,
      total: v.total,
      transactionCount: v.count,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Splits spend into fixed (recurring or installment) vs one-off (A4).
 * Surfaces a signal already latent in the expense flags but never shown.
 */
export function splitRecurringVsOneOff(expenses: Expense[]): CostCenterRecurringSplit {
  let recurring = 0;
  let oneOff = 0;
  for (const e of expenses) {
    const amount = absAmount(e);
    if (e.isRecurring || e.isInstallment) recurring += amount;
    else oneOff += amount;
  }
  const total = recurring + oneOff;
  return { recurring, oneOff, recurringPct: total > 0 ? recurring / total : 0 };
}

// ==================== Lifecycle (B4) ====================

/**
 * Derives the lifecycle status of a center (B4):
 * - archived: the user explicitly closed it (archivedAt set)
 * - dormant: no spending for DORMANT_THRESHOLD_DAYS
 * - active: otherwise
 */
export function getLifecycleStatus(
  center: Pick<CostCenter, 'archivedAt'>,
  lastActivityDate: Date | null,
  now: Date = new Date(),
): CostCenterLifecycle {
  if (center.archivedAt) return 'archived';
  if (!lastActivityDate) return 'dormant';
  const daysSince = (now.getTime() - lastActivityDate.getTime()) / 86_400_000;
  return daysSince > DORMANT_THRESHOLD_DAYS ? 'dormant' : 'active';
}
