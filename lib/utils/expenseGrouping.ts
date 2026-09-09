/**
 * Expense grouping vocabulary — how a row is bucketed, and what the bucket is called.
 *
 * WHY THIS EXISTS
 * A category is identified by its document id, never by its name. Nothing in the app
 * enforces name uniqueness (`createCategory` is a bare `addDoc`), and the product
 * deliberately allows "Casa" to exist as a Spese Fisse category AND as a Spese
 * Variabili one — they are two different documents describing two different things.
 * Every surface that grouped by `categoryName` therefore merged them, and the Sankey,
 * whose node identity IS its id, went further: duplicate ids make d3-sankey keep the
 * last node and orphan the first, so one branch swallowed both types' money while a
 * zero-value ghost hung off the other.
 *
 * The fix is one rule, applied everywhere: **key by id, label by name**. This module
 * owns both halves of that rule so the two cannot drift apart again.
 *
 * SCOPE
 * Keying and labelling only — no aggregation, no chart shapes. Callers do their own
 * summing; they just have to agree on what "the same bucket" means.
 */

import {
  Expense,
  ExpenseType,
  NO_SUBCATEGORY_KEY,
  NO_SUBCATEGORY_LABEL,
  UNCATEGORIZED_LABEL,
} from '@/types/expenses';

/**
 * The bucket a row's category belongs to.
 *
 * `categoryId` is declared required, but these documents come out of Firestore through
 * an `as Expense` cast, and a legacy or imported row can genuinely arrive without one
 * (clearExpensesCategoryAssignment also writes the literal 'uncategorized'). Falling
 * back to the name keeps such rows visible instead of collapsing them all into one
 * anonymous bucket — they merge with their namesakes, which is the old behaviour and
 * the best available answer when the identity was never recorded.
 */
export function getCategoryKey(expense: Expense): string {
  return expense.categoryId?.trim() || expense.categoryName?.trim() || UNCATEGORIZED_LABEL;
}

/** Display name for a row's category. */
export function getCategoryName(expense: Expense): string {
  return expense.categoryName?.trim() || UNCATEGORIZED_LABEL;
}

/**
 * The bucket a row's subcategory belongs to.
 *
 * Rows with no subcategory share NO_SUBCATEGORY_KEY, which is what lets callers drop
 * the "is this the Altro bucket?" special case: the sentinel is a key like any other,
 * so a plain equality check selects exactly the rows the node was built from.
 */
export function getSubCategoryKey(expense: Expense): string {
  return expense.subCategoryId?.trim() || NO_SUBCATEGORY_KEY;
}

/** Display name for a row's subcategory, NO_SUBCATEGORY_LABEL when it carries none. */
export function getSubCategoryLabel(expense: Expense): string {
  return getSubCategoryKey(expense) === NO_SUBCATEGORY_KEY
    ? NO_SUBCATEGORY_LABEL
    : expense.subCategoryName?.trim() || NO_SUBCATEGORY_LABEL;
}

export interface LabelledGroup {
  /** Identity — what the caller groups by. */
  key: string;
  /** Display name, which may be shared with other keys. */
  name: string;
  /** Appended in parentheses only when this name is ambiguous on the surface. */
  qualifier?: string;
}

/**
 * Resolve display labels for one rendered surface, disambiguating only real collisions.
 *
 * "Casa" stays "Casa" when it is the only Casa on screen, and becomes
 * "Casa (Spese Fisse)" / "Casa (Spese Variabili)" only when two distinct keys share the
 * name. Qualifying unconditionally would tax every label in the common case to fix a
 * problem almost nobody has, which is why the check is scoped to the data actually
 * being rendered rather than to the taxonomy as a whole.
 *
 * Ambiguity is measured over the set of KEYS per name, not a row count: fifty
 * transactions in one category are not a collision.
 *
 * Two distinct categories sharing both name and qualifier (possible — nothing enforces
 * uniqueness even within a type) end up with the same label. They stay separate groups
 * and clicks still resolve through the key; only the text is ambiguous. Appending a
 * positional counter would be unstable across renders and would put noise on a case the
 * reader cannot act on anyway.
 *
 * @param groups Every group rendered on ONE surface — one chart, or one list.
 * @returns key → display label. Keys absent from `groups` are absent from the map.
 */
export function resolveDisplayLabels(groups: LabelledGroup[]): Map<string, string> {
  const keysByName = new Map<string, Set<string>>();
  for (const group of groups) {
    const keys = keysByName.get(group.name) ?? new Set<string>();
    keys.add(group.key);
    keysByName.set(group.name, keys);
  }

  const labels = new Map<string, string>();
  for (const group of groups) {
    const isAmbiguous = (keysByName.get(group.name)?.size ?? 0) > 1;
    labels.set(group.key, isAmbiguous && group.qualifier ? `${group.name} (${group.qualifier})` : group.name);
  }
  return labels;
}

/**
 * A category, as a drill-down refers to it: what it is, not what it is called.
 * `expenseType` is 'income' for income categories.
 */
export interface CategoryScope {
  expenseType: ExpenseType;
  key: string;
}

/**
 * The rows behind one category, optionally narrowed to one of its subcategories.
 *
 * The type match is EXACT. The predicates this replaces tested `type !== 'income'`,
 * which lumped fixed, variable and debt into one list and let transfers through — so
 * the drill-down under "Casa (Spese Fisse)" also listed the variable Casa rows and its
 * total disagreed with the branch the user had clicked.
 *
 * The subcategory match needs no special case for rows carrying none: getSubCategoryKey
 * maps those to NO_SUBCATEGORY_KEY, a key like any other, so plain equality selects
 * exactly the rows that bucket was built from.
 */
export function selectExpensesForDrillDown(
  expenses: Expense[],
  category: CategoryScope,
  subCategory?: { key: string }
): Expense[] {
  return expenses.filter((expense) => {
    if (expense.type !== category.expenseType) return false;
    if (getCategoryKey(expense) !== category.key) return false;
    if (!subCategory) return true;
    return getSubCategoryKey(expense) === subCategory.key;
  });
}

