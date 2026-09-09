/**
 * Search index behind the "Vai a categoria…" combobox — every category and
 * subcategory a user can focus, searchable with accent-folded matching.
 *
 * WHY A UNION OF TAXONOMY AND DATA
 * The taxonomy (ExpenseCategory[]) is the intended universe, including subcategories
 * with zero expenses — those must be findable too. But real rows can point outside it:
 * a legacy or imported row whose categoryId is missing or stale falls back to a
 * name-derived key (see getCategoryKey), and a row can carry a subCategoryId its
 * category's taxonomy no longer lists. Indexing only the taxonomy would make those
 * buckets unreachable by search even though the drill-down renders them; the index is
 * therefore taxonomy ∪ data-derived buckets, with the taxonomy winning on duplicates.
 *
 * IDENTITY RULE
 * Key by id, label by name — all keying goes through expenseGrouping, never through
 * names. Two "Casa" categories under different types are two entries whose ids differ;
 * the qualifier (always shown by the UI) is what keeps them tellable apart.
 *
 * The NO_SUBCATEGORY bucket is deliberately NOT indexed: "senza sottocategoria" is
 * reached by drilling into its category, not by typing a name it does not have.
 */

import {
  Expense,
  ExpenseCategory,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  NO_SUBCATEGORY_KEY,
} from '@/types/expenses';
import {
  getCategoryKey,
  getCategoryName,
  getSubCategoryKey,
  getSubCategoryLabel,
} from '@/lib/utils/expenseGrouping';

/** What a picked entry focuses: a category, or one of its subcategories. */
export interface EntitySearchTarget {
  expenseType: ExpenseType;
  categoryKey: string;
  /** Absent for category entries. */
  subCategoryKey?: string;
}

/** One searchable entry of the index. */
export interface EntitySearchItem {
  /** Stable React key: `${type}:${categoryKey}` or `${type}:${categoryKey}:${subCategoryKey}`. */
  id: string;
  target: EntitySearchTarget;
  /** Display name — "Condominio" / "Casa". */
  label: string;
  /** Subcategory entries only: the parent category's name. */
  parentLabel?: string;
  /** EXPENSE_TYPE_LABELS[type] — the UI always shows it, so same-named entries stay tellable apart. */
  qualifier: string;
  /** Accent-folded lowercase of label + parentLabel + qualifier, what queries match against. */
  searchText: string;
}

/**
 * Accent-fold for matching: NFD splits letters from their combining marks, the marks
 * are stripped, and the rest is lowercased — "Elettricità" and "elettricita" become
 * the same string.
 */
function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function toItem(target: EntitySearchTarget, label: string, parentLabel?: string): EntitySearchItem {
  const qualifier = EXPENSE_TYPE_LABELS[target.expenseType];
  const id = target.subCategoryKey
    ? `${target.expenseType}:${target.categoryKey}:${target.subCategoryKey}`
    : `${target.expenseType}:${target.categoryKey}`;
  const searchText = foldForSearch([label, parentLabel, qualifier].filter(Boolean).join(' '));
  return parentLabel
    ? { id, target, label, parentLabel, qualifier, searchText }
    : { id, target, label, qualifier, searchText };
}

/**
 * Build the full search index: one entry per taxonomy category and subcategory
 * (zero-expense ones included), plus the buckets that exist only in the data.
 *
 * Data-derived entries carry the ROW's type, not a taxonomy type: they exist to make
 * actual rows reachable, and the drill-down matches type exactly — a bucket keyed by
 * anything other than what the rows carry would select nothing.
 *
 * @param categories The taxonomy, as loaded by useExpenseCategories.
 * @param expenses   Every row the surface can drill into.
 * @returns Entries with unique ids; taxonomy wins over data-derived duplicates.
 */
export function buildEntitySearchIndex(
  categories: ExpenseCategory[],
  expenses: Expense[]
): EntitySearchItem[] {
  const items = new Map<string, EntitySearchItem>();
  const taxonomyById = new Map(categories.map((category) => [category.id, category]));

  // Taxonomy first, so it wins over data-derived entries with the same id.
  for (const category of categories) {
    // Transfers are net-zero movements excluded from every Analisi metric; a
    // transfer "entity" has no dossier semantics (its share would divide transfer
    // magnitude by a spending denominator), so it is not searchable either.
    if (category.type === 'transfer') continue;

    const categoryItem = toItem({ expenseType: category.type, categoryKey: category.id }, category.name);
    items.set(categoryItem.id, categoryItem);

    for (const sub of category.subCategories) {
      const subItem = toItem(
        { expenseType: category.type, categoryKey: category.id, subCategoryKey: sub.id },
        sub.name,
        category.name
      );
      items.set(subItem.id, subItem);
    }
  }

  for (const expense of expenses) {
    // Same rule as the taxonomy loop: transfer rows produce no searchable bucket.
    if (expense.type === 'transfer') continue;

    const categoryKey = getCategoryKey(expense);
    const taxonomyCategory = taxonomyById.get(categoryKey);

    // Legacy bucket: the key is not a taxonomy id (name-fallback or stale id), so the
    // only name available is the row's denormalized one.
    if (!taxonomyCategory) {
      const categoryItem = toItem({ expenseType: expense.type, categoryKey }, getCategoryName(expense));
      if (!items.has(categoryItem.id)) items.set(categoryItem.id, categoryItem);
    }

    const subCategoryKey = getSubCategoryKey(expense);
    if (subCategoryKey === NO_SUBCATEGORY_KEY) continue;
    if (taxonomyCategory?.subCategories.some((sub) => sub.id === subCategoryKey)) continue;

    // A subcategory the taxonomy does not know: keep it findable under its parent,
    // preferring the taxonomy's category name (fresher than the denormalized copy).
    const subItem = toItem(
      { expenseType: expense.type, categoryKey, subCategoryKey },
      getSubCategoryLabel(expense),
      taxonomyCategory?.name ?? getCategoryName(expense)
    );
    if (!items.has(subItem.id)) items.set(subItem.id, subItem);
  }

  return Array.from(items.values());
}

/**
 * How well an item matches the query's first token, best first:
 * label prefix, then label substring, then a match only via parent/qualifier.
 */
function rankAgainstFirstToken(foldedLabel: string, firstToken: string | undefined): number {
  if (firstToken === undefined || foldedLabel.startsWith(firstToken)) return 0;
  if (foldedLabel.includes(firstToken)) return 1;
  return 2;
}

/**
 * Match and rank index entries against a query.
 *
 * The query is accent-folded and tokenized on whitespace; EVERY token must be a
 * substring of the entry's searchText. An empty query therefore matches everything —
 * the combobox shows the first entries before the user has typed.
 *
 * Ranking: label-prefix match of the first token, then label-substring, then entries
 * matching only through parent/qualifier. Ties break by shorter label, then
 * alphabetically on the folded label, then by id — fully deterministic.
 *
 * @param limit Maximum entries returned, default 8.
 */
export function searchEntities(index: EntitySearchItem[], query: string, limit = 8): EntitySearchItem[] {
  const tokens = foldForSearch(query).split(/\s+/).filter(Boolean);

  const matches: Array<{ item: EntitySearchItem; rank: number; foldedLabel: string }> = [];
  for (const item of index) {
    if (!tokens.every((token) => item.searchText.includes(token))) continue;
    const foldedLabel = foldForSearch(item.label);
    matches.push({ item, rank: rankAgainstFirstToken(foldedLabel, tokens[0]), foldedLabel });
  }

  matches.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.item.label.length !== b.item.label.length) return a.item.label.length - b.item.label.length;
    if (a.foldedLabel !== b.foldedLabel) return a.foldedLabel < b.foldedLabel ? -1 : 1;
    return a.item.id === b.item.id ? 0 : a.item.id < b.item.id ? -1 : 1;
  });

  return matches.slice(0, limit).map((match) => match.item);
}
