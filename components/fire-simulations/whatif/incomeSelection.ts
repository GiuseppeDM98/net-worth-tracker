/**
 * The job-loss income picker's keys and sum — UI-side on purpose: the pure What If layer is
 * category-agnostic and receives only the SUM of the sources the user ticked (doc/guide/fire.md § FIRE,
 * What If and Goals). Selection is keyed per subcategory leaf so a category can be partially
 * selected (one partner's salary lost, the other retained).
 */

import type { IncomeSourceCategory } from '@/lib/services/fireService';

/** The sentinel `getAnnualCashflowData` uses for income recorded without a subcategory. */
export const NO_SUBCATEGORY_ID = '__none__';

export function leafKey(categoryId: string, subCategoryId: string): string {
  return `${categoryId}::${subCategoryId}`;
}

export function categoryLeafKeys(category: IncomeSourceCategory): string[] {
  return category.subCategories.map((sub) => leafKey(category.categoryId, sub.subCategoryId));
}

export function collectLeafKeys(sources: IncomeSourceCategory[]): string[] {
  return sources.flatMap(categoryLeafKeys);
}

/** The annual income of the ticked leaves — the one figure the pure layer receives. */
export function sumSelectedIncome(sources: IncomeSourceCategory[], selected: Set<string>): number {
  let total = 0;
  for (const category of sources) {
    for (const sub of category.subCategories) {
      if (selected.has(leafKey(category.categoryId, sub.subCategoryId))) total += sub.annualAmount;
    }
  }
  return total;
}
