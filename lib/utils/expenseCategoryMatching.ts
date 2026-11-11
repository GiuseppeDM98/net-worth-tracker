/**
 * Category matching across expense types.
 *
 * Categories are scoped to a type: ExpenseDialog only offers the ones whose `type`
 * matches the selected one. Changing the type of an already-saved expense therefore
 * always invalidates the current selection — mechanically correct, and annoying, because
 * the most common reason to change the type is that the row was filed under the wrong
 * one of two same-named categories ("Casa" as a fixed expense when it was a variable
 * one). This finds the equivalent category under the target type so the form can land
 * the user where they were already going.
 */

import { ExpenseCategory, ExpenseType } from '@/types/expenses';

const normalize = (name: string): string => name.trim().toLowerCase();

/**
 * The category identity a write resolves against: (normalized name, type). Shared by the import
 * (plan and commit, so they never disagree on which document a row attaches to) and the
 * Assistente's card (a `newCategory` that already exists is reused, 2026-11). Here and not in
 * `expenseImport.ts`, whose CSV parser would follow it into every page that names a category.
 */
export function categoryMatchKey(name: string, type: string): string {
  return `${type}::${normalize(name)}`;
}

export interface EquivalentCategory {
  categoryId: string;
  /** Empty string when no subcategory matched — the shape ExpenseFormData expects. */
  subCategoryId: string;
}

/**
 * Find the category with the same name under `targetType`.
 *
 * Name comparison is case-insensitive and trimmed, matching the only other name
 * comparison in the taxonomy (CategoryManagementDialog's duplicate-subcategory guard).
 *
 * The subcategory follows only if its name also matches inside the category we landed
 * on. A partial match is not a failure: keeping the category and dropping the
 * subcategory is strictly better than sending the user back to an empty form.
 *
 * @returns null when nothing matches, so the caller can clear the selection as before.
 */
export function resolveEquivalentCategory(
  categories: ExpenseCategory[],
  currentCategoryId: string,
  currentSubCategoryId: string | undefined,
  targetType: ExpenseType
): EquivalentCategory | null {
  const current = categories.find((category) => category.id === currentCategoryId);
  if (!current) return null;

  // First match wins. Duplicate names within one type are possible (nothing enforces
  // uniqueness), and there is no signal that would make one of them the better guess.
  const target = categories.find(
    (category) => category.type === targetType && normalize(category.name) === normalize(current.name)
  );
  if (!target) return null;

  const currentSubCategory = currentSubCategoryId
    ? current.subCategories?.find((subCategory) => subCategory.id === currentSubCategoryId)
    : undefined;

  const targetSubCategory = currentSubCategory
    ? target.subCategories?.find(
        (subCategory) => normalize(subCategory.name) === normalize(currentSubCategory.name)
      )
    : undefined;

  return { categoryId: target.id, subCategoryId: targetSubCategory?.id ?? '' };
}
