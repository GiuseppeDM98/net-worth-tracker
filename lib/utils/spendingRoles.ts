/**
 * The 50/30/20 split — which role a spending row plays, and what a period adds up to.
 *
 * Opt-in (`settings.spendingRolesEnabled`) and shown only in Analisi's Flusso (the Sankey, and
 * the share bar that stands for it below 640px). The role is
 * stored on the category (`ExpenseCategory.spendingRole`) with an optional per-subcategory
 * override, never on the row: a row carries `categoryId`, so reclassifying a category is
 * retroactive for every period with no bulk update. This module is the ONE place that turns
 * (row, categories) into a role; the Sankey builder and any later reader consume its output.
 *
 * RISPARMI IS NOT A CATEGORY TOTAL
 * Savings = the rows classified as `saving` PLUS the period's surplus (income − all spending).
 * A Sankey has no negative width, so when spending exceeds income the missing amount is not
 * subtracted from anything: it becomes `deficit`, drawn on the income side as «Coperto dal
 * patrimonio», and the surplus is zero. Either way both sides carry the same total:
 *   income + deficit === need + want + unclassified + saving + surplus
 *
 * Amounts follow Analisi's own totals (`summarizeFlow`) and Periodo's (`summarizePeriodCashflow`):
 * income is SIGNED, because a negative income row is a reversal of income, and spending is a
 * magnitude; the row's own `type` decides which side it is on, transfers are net-zero and skipped.
 * So «Delle entrate (X €)» here is the same X as Periodo's «Entrate» on the same page.
 */

import {
  Expense,
  ExpenseCategory,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  SpendingRole,
  SPENDING_ROLE_LABELS,
  UNCLASSIFIED_SPENDING_LABEL,
} from '@/types/expenses';
import type { AbsenceKind } from '@/lib/utils/statesNarrative';
import { spendingRoleColorVar } from '@/lib/constants/spendingRoleColors';
import { getCategoryKey, getCategoryName, resolveDisplayLabels } from '@/lib/utils/expenseGrouping';

/** What the resolver needs from a category document — plain data, testable without Firestore. */
export type SpendingRoleSource = Pick<ExpenseCategory, 'id' | 'type' | 'spendingRole' | 'subCategories'>;

/** A role, or the bucket of rows nobody has classified yet. */
export type SpendingBucket = SpendingRole | 'unclassified';

/**
 * THE one order of the buckets — the reading's list, the Sankey's role column, the phone bar and
 * its legend all walk it: the two spending roles, what is still unclassified, then savings last,
 * because Risparmi carries the period's surplus and a surplus is what is left after the rest.
 */
export const SPENDING_ROLE_FLOW_ORDER: readonly SpendingBucket[] = ['need', 'want', 'unclassified', 'saving'];

/** The bucket names as the Flusso prints them (node, bar legend, group header). */
export const SPENDING_BUCKET_LABELS: Record<SpendingBucket, string> = {
  ...SPENDING_ROLE_LABELS,
  unclassified: UNCLASSIFIED_SPENDING_LABEL,
};

/** The spending side of `ExpenseType`: what a role, a type column or a type share can be about. */
export type SpendingExpenseType = Extract<ExpenseType, 'fixed' | 'variable' | 'debt'>;

/**
 * The ONE declaration of which expense types are spending, in reading order. The type Sankey's
 * columns (cashflowSankey.ts), Analisi's type shares (analisiSummary.ts) and the roles here all
 * read it; three copies of this list are how a fourth type would land in one view and not the others.
 */
export const SPENDING_EXPENSE_TYPES: readonly SpendingExpenseType[] = ['fixed', 'variable', 'debt'];

/** Whether rows of this type are spending — the only types a role means anything for. */
export function isSpendingType(type: ExpenseType): type is SpendingExpenseType {
  return (SPENDING_EXPENSE_TYPES as readonly ExpenseType[]).includes(type);
}

/**
 * Why a flow has nothing to draw (DESIGN.md → The Absence-Has-Three-Names Rule): `missing` when
 * the period holds no income or spending row at all, `zero` when it holds some and they come to
 * nothing (a salary and its full reversal). A failed read is the page's `loadFailed`, checked
 * before either.
 */
export type FlowAbsence = Extract<AbsenceKind, 'missing' | 'zero'>;

/** `null` while there is a flow to draw (`base > 0`); otherwise which absence it is. */
export function resolveFlowAbsence(rowCount: number, base: number): FlowAbsence | null {
  if (base > 0) return null;
  return rowCount === 0 ? 'missing' : 'zero';
}

/**
 * The role of a row in `category` with `subCategoryId`.
 *
 * The subcategory's override wins, then the category's role; `null` means «Da classificare».
 * A missing category (deleted, or a legacy row without an id) and a non-spending category
 * (income, transfer — a role left behind by a type change) are `null` too: a stale role on an
 * income category must never pull money into Necessità.
 */
export function resolveSpendingRole(
  category: SpendingRoleSource | undefined,
  subCategoryId?: string
): SpendingRole | null {
  if (!category || !isSpendingType(category.type)) return null;
  const subCategory = subCategoryId
    ? category.subCategories.find((sub) => sub.id === subCategoryId)
    : undefined;
  return subCategory?.spendingRole ?? category.spendingRole ?? null;
}

export interface SpendingRoleSlice {
  /** `getCategoryKey` of the rows — the same identity the Sankey and the dossier use. */
  categoryKey: string;
  categoryName: string;
  /** The rows' own type: with the key, what a click hands to Analisi's entity focus. */
  expenseType: ExpenseType;
  value: number;
}

export interface SpendingBucketTotal {
  total: number;
  /** Largest first. A category split by a subcategory override appears in each of its buckets. */
  categories: SpendingRoleSlice[];
}

export interface SpendingRolesSummary {
  /** SIGNED: a reversal of income lowers it, as on Periodo and in the type reading. */
  income: number;
  /**
   * Net income by category, largest first — the sources a flow starts from. A category whose
   * reversals outweigh its receipts in the period nets to ≤ 0 and is left out (a Sankey link has
   * no negative width), so in that one case the list sums to more than `income` — the roles
   * Sankey takes the difference back off the largest sources before drawing them.
   */
  incomeCategories: SpendingRoleSlice[];
  /** Every spending row, whatever its role. */
  spending: number;
  byBucket: Record<SpendingBucket, SpendingBucketTotal>;
  /** income − spending when positive, else 0. */
  surplus: number;
  /** spending − income when positive, else 0 — «Coperto dal patrimonio». */
  deficit: number;
  /** The Risparmi node: saving-classified rows + surplus. */
  savings: number;
  /** Income and spending rows counted (transfers excluded) — what tells `missing` from `zero`. */
  rowCount: number;
}

/** Sums one period's rows into the four buckets, the surplus and the deficit. */
export function summarizeSpendingRoles(
  expenses: Expense[],
  categories: SpendingRoleSource[]
): SpendingRolesSummary {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const slices = new Map<SpendingBucket, Map<string, SpendingRoleSlice>>(
    SPENDING_ROLE_FLOW_ORDER.map((bucket) => [bucket, new Map()])
  );
  const incomeSlices = new Map<string, SpendingRoleSlice>();
  let income = 0;
  let spending = 0;
  let rowCount = 0;

  const addTo = (bucket: Map<string, SpendingRoleSlice>, expense: Expense, amount: number) => {
    const key = getCategoryKey(expense);
    // Keyed by type too, as the Sankey's own aggregation is: two legacy rows without a categoryId
    // share a name-derived key, and a slice carries ONE type — the one a click hands to the Scheda.
    const id = `${expense.type}:${key}`;
    const slice = bucket.get(id) ?? { categoryKey: key, categoryName: getCategoryName(expense), expenseType: expense.type, value: 0 };
    slice.value += amount;
    bucket.set(id, slice);
  };

  for (const expense of expenses) {
    if (expense.type === 'income') {
      // Signed on purpose: a negative income row is a reversal, never spending (see the header).
      rowCount++;
      income += expense.amount;
      addTo(incomeSlices, expense, expense.amount);
      continue;
    }
    if (!isSpendingType(expense.type)) continue;

    const amount = Math.abs(expense.amount);
    rowCount++;
    spending += amount;
    const role = resolveSpendingRole(categoriesById.get(expense.categoryId), expense.subCategoryId);
    addTo(slices.get(role ?? 'unclassified')!, expense, amount);
  }

  const byBucket = Object.fromEntries(
    SPENDING_ROLE_FLOW_ORDER.map((bucket) => {
      const list = Array.from(slices.get(bucket)!.values()).sort((a, b) => b.value - a.value);
      return [bucket, { total: list.reduce((sum, slice) => sum + slice.value, 0), categories: list }];
    })
  ) as Record<SpendingBucket, SpendingBucketTotal>;

  const surplus = Math.max(0, income - spending);
  const deficit = Math.max(0, spending - income);

  return {
    income,
    incomeCategories: Array.from(incomeSlices.values())
      .filter((slice) => slice.value > 0)
      .sort((a, b) => b.value - a.value),
    spending,
    byBucket,
    surplus,
    deficit,
    savings: byBucket.saving.total + surplus,
    rowCount,
  };
}

/**
 * ONE bucket's categories under the names a list prints: «Casa» stays «Casa», and two categories
 * that share a name inside the bucket take their type («Casa (Spese Necessarie)» / «Casa (Spese
 * Variabili)») — the role they share would tell nothing apart. The roles Sankey resolves its own
 * labels over the whole chart (`resolveRoleCategoryLabels`), where a name can also repeat across
 * roles; a list shows one role at a time, so the type is the only thing that can differ.
 */
export function labelRoleSlices(categories: SpendingRoleSlice[]): SpendingRoleSlice[] {
  const keyOf = (slice: SpendingRoleSlice): string => `${slice.expenseType}:${slice.categoryKey}`;
  const labels = resolveDisplayLabels(
    categories.map((slice) => ({ key: keyOf(slice), name: slice.categoryName, qualifier: EXPENSE_TYPE_LABELS[slice.expenseType] }))
  );
  return categories.map((slice) => ({ ...slice, categoryName: labels.get(keyOf(slice)) ?? slice.categoryName }));
}

export interface SpendingRoleShare {
  bucket: SpendingBucket;
  /** `SPENDING_BUCKET_LABELS[bucket]`. */
  label: string;
  /** Euros. For `saving` it is the whole Risparmi node: the saving rows PLUS the surplus. */
  amount: number;
  /** Whole percent of `base`, rounded to the printed unit; the list adds up to exactly 100. */
  percentage: number;
}

export interface SpendingRoleShares {
  /**
   * What left the budget: income + deficit, which equals need + want + unclassified + saving
   * rows + surplus. The one base of the reading, the bar and its legend. 0 on an empty flow.
   */
  base: number;
  /** The buckets with money in them, in SPENDING_ROLE_FLOW_ORDER. Empty when `base` is 0. */
  shares: SpendingRoleShare[];
  /**
   * Where the income ends along the bar, 0-100 of `base` (clamped), when spending ran past it.
   * `null` when there is no deficit (income covers everything) and when income is not positive
   * (no income, or a net reversal): there is no income line to draw then, only «no income».
   */
  incomeEdge: number | null;
  /** Spending beyond income, «dal patrimonio». */
  deficit: number;
  /** Income ≤ 0 with something spent: the whole outflow came from the wealth. */
  noIncome: boolean;
  /** Risparmi split for the reading: the rows classified as saving… */
  saved: number;
  /** …and what the period left over. `saved + surplus` is the `saving` share's amount. */
  surplus: number;
  /** Non-null exactly when there is no flow to draw (`base` is 0). */
  absence: FlowAbsence | null;
}

/**
 * The shares the Flusso prints by role — ONE source for the reading and the phone bar, so the
 * sentence and the legend cannot disagree by a rounding.
 *
 * Every bucket is rounded to the printed unit (a whole percent), then the drift is handed to ONE
 * bucket so the printed shares add up to exactly 100 (AGENTS.md → «A list that must add up adds up
 * ON SCREEN»). The drift goes to the bucket that is a remainder BY DEFINITION:
 *   - Risparmi, when there is a surplus — the surplus IS income minus everything else;
 *   - otherwise «Da classificare», when it has money — it is spending minus what was classified;
 *   - otherwise (a deficit with every category classified) no bucket is a remainder, and the
 *     largest takes it, where one point is the smallest relative error.
 * If that bucket's own share is too small to absorb a negative drift, the rest of it goes to the
 * largest bucket, so no printed share is ever negative — and a share that rounds to one point or
 * more is never pushed to zero either: a printed 0 means «less than half a point», which the
 * reading writes as «meno dell'1%» (`describeShare`), and the drift must not make that a lie.
 */
export function summarizeSpendingRoleShares(summary: SpendingRolesSummary): SpendingRoleShares {
  const base = summary.income + summary.deficit;
  const saved = summary.byBucket.saving.total;
  const common = { deficit: summary.deficit, saved, surplus: summary.surplus };
  const absence = resolveFlowAbsence(summary.rowCount, base);
  if (absence !== null) {
    return { ...common, base: 0, shares: [], incomeEdge: null, noIncome: false, absence };
  }

  const amountOf = (bucket: SpendingBucket): number => (bucket === 'saving' ? summary.savings : summary.byBucket[bucket].total);
  const shares: SpendingRoleShare[] = SPENDING_ROLE_FLOW_ORDER.filter((bucket) => amountOf(bucket) > 0).map((bucket) => ({
    bucket,
    label: SPENDING_BUCKET_LABELS[bucket],
    amount: amountOf(bucket),
    percentage: Math.round((amountOf(bucket) / base) * 100),
  }));

  const largest = shares.reduce((best, share) => (share.amount > best.amount ? share : best), shares[0]);
  const remainder =
    (summary.surplus > 0 ? shares.find((share) => share.bucket === 'saving') : undefined) ??
    shares.find((share) => share.bucket === 'unclassified') ??
    largest;
  const drift = 100 - shares.reduce((sum, share) => sum + share.percentage, 0);
  // The remainder gives points back down to 1, not to 0, when it has at least one to begin with.
  const remainderFloor = remainder.percentage > 0 ? 1 : 0;
  const absorbed = Math.max(drift, remainderFloor - remainder.percentage);
  remainder.percentage += absorbed;
  largest.percentage += drift - absorbed;

  const hasIncome = summary.income > 0;
  const incomeEdge = hasIncome && summary.deficit > 0 ? Math.min(100, Math.max(0, (summary.income / base) * 100)) : null;
  return { ...common, base, shares, incomeEdge, noIncome: !hasIncome, absence: null };
}

export interface CategoryClassificationCounts {
  /** Spending categories (fixed, variable, debt). */
  spending: number;
  /** Of those, how many carry a role of their own. */
  classified: number;
}

/**
 * How far the classification has got — the Impostazioni reading's numbers.
 *
 * A category counts as classified only through its OWN role: subcategory overrides alone leave
 * its rows without a subcategory in «Da classificare», so they do not make it classified.
 */
export function summarizeCategoryClassification(
  categories: Pick<ExpenseCategory, 'type' | 'spendingRole'>[]
): CategoryClassificationCounts {
  let spending = 0;
  let classified = 0;
  for (const category of categories) {
    if (!isSpendingType(category.type)) continue;
    spending += 1;
    if (category.spendingRole) classified += 1;
  }
  return { spending, classified };
}

/**
 * The colour a category's badge wears in Impostazioni once the 50/30/20 roles are on: the role's
 * token, so the classification reads at a glance down the list. Income categories take the income
 * colour; a spending category without a role is «Da classificare». Null — keep the saved hue — with
 * the roles off, and for transfers, which have no role to show.
 */
export function categoryRoleColor(
  category: Pick<ExpenseCategory, 'type' | 'spendingRole'>,
  rolesEnabled: boolean
): string | null {
  if (!rolesEnabled) return null;
  if (category.type === 'income') return 'var(--positive)';
  if (!isSpendingType(category.type)) return null;
  return spendingRoleColorVar(category.spendingRole ?? 'unclassified');
}
