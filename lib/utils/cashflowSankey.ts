/**
 * Cashflow Sankey data builders — pure, chart-library-agnostic.
 *
 * Extracted from components/cashflow/CashflowSankeyChart.tsx so the graph construction
 * can be tested against plain arrays: vitest.config.ts collects only
 * `__tests__/**\/*.test.ts`, so logic living inside a `.tsx` has no way to be covered at
 * all. The shapes below are plain objects; @nivo/sankey consumes them structurally.
 *
 * A second, structural reason to keep this file free of React: AGENTS.md § Recharts records that
 * `useChartColors()` must never reach a Nivo component (react-spring cannot interpolate
 * oklch and crashes on arity). The palettes live here precisely because a module that
 * cannot import a hook cannot break that rule.
 *
 * IDENTITY IS THE WHOLE POINT
 * A Sankey node's id IS its identity: d3-sankey resolves every link endpoint through
 * `new Map(nodes.map(d => [id(d), d]))`, so two nodes sharing an id collapse into one —
 * the last one wins, the first is orphaned at value 0, and the survivor absorbs both
 * branches because `value = max(sum(sourceLinks), sum(targetLinks))`. Building ids from
 * category NAMES therefore merged "Casa" under Spese Fisse with "Casa" under Spese
 * Variabili, which are two different documents the product deliberately allows. Worse,
 * an income category sharing a name with an expense one closed a cycle through Budget
 * and made d3-sankey throw "circular link", blanking the chart.
 *
 * So ids are built from category/subcategory IDS and namespaced by kind, and names are
 * carried separately as `label`. Ids are opaque: nothing parses or splits them. The
 * `index` returned with every view is the only sanctioned way to ask what a node means.
 *
 * TWO VIEWS (the internal category drill-down fell on 2026-08-14: category and
 * subcategory node clicks now route to the entity dossier in AnalisiTab instead
 * of a third in-chart navigation level)
 * 1. Budget flow (default): Income categories → Budget → Expense types → Categories
 *    (+ Subcategories in the 5-layer variant) + Savings
 * 2. Type drill-down: one expense type → its categories
 */

import {
  Expense,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  NO_SUBCATEGORY_KEY,
} from '@/types/expenses';
import {
  getCategoryKey,
  getCategoryName,
  getSubCategoryKey,
  getSubCategoryLabel,
  resolveDisplayLabels,
  type LabelledGroup,
} from '@/lib/utils/expenseGrouping';

// ── Palette ──────────────────────────────────────────────────────────────────

// Color palette for income category nodes. These are semantic hex values that
// remain stable across themes — the Sankey uses intentional semantic colors
// (blue=fixed, violet=variable, amber=debt) that should not follow the chart palette.
export const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
];

/** Semantic per-type node colors. Deliberately theme-independent, see COLORS. */
export const TYPE_COLORS: Record<ExpenseType, string> = {
  fixed: '#3b82f6',     // blue
  variable: '#8b5cf6',  // violet
  debt: '#f59e0b',      // amber
  income: '#10b981',    // green (not used in expense flow)
  transfer: '#6b7280',  // gray
};

const BUDGET_NODE_COLOR = '#10b981';
const SAVINGS_NODE_COLOR = '#3b82f6';

/** The spending types the flow renders, in reading order. Income and transfers are not flows here. */
export const EXPENSE_FLOW_TYPES: ExpenseType[] = ['fixed', 'variable', 'debt'];

// Mobile keeps the chart legible by showing only the largest slices at each level.
const MOBILE_MAX_INCOME_CATEGORIES = 5;
const MOBILE_MAX_CATEGORIES_PER_TYPE = 3;
const MOBILE_MAX_SUBCATEGORIES = 4;
const MOBILE_MAX_DRILLDOWN_ITEMS = 8;

// ── Public shapes ────────────────────────────────────────────────────────────

export interface SankeyNode {
  /** Opaque identity. Never parsed — ask `SankeyView.index` what it means. */
  id: string;
  nodeColor: string;
  /**
   * What the reader sees. Required rather than optional: with namespaced ids, a
   * forgotten label would put `cat:fixed:aB3xK9` on screen, and the type system is a
   * better guard against that than vigilance.
   */
  label: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

/** What a node id MEANS. Produced by the builders, consumed by the click handler. */
export type SankeyNodeDescriptor =
  | { kind: 'budget' }
  | { kind: 'savings' }
  | { kind: 'expenseType'; expenseType: ExpenseType }
  | { kind: 'category'; expenseType: ExpenseType; categoryKey: string; categoryLabel: string }
  | {
      kind: 'subCategory';
      /** The PARENT category's type — together with categoryKey it pins the exact rows. */
      expenseType: ExpenseType;
      categoryKey: string;
      categoryLabel: string;
      /** NO_SUBCATEGORY_KEY for the bucket of rows carrying no subcategory. */
      subCategoryKey: string;
      subCategoryLabel: string;
    };

export interface SankeyView {
  nodes: SankeyNode[];
  links: SankeyLink[];
  index: Map<string, SankeyNodeDescriptor>;
}

// ── Node ids ─────────────────────────────────────────────────────────────────

const BUDGET_NODE_ID = 'budget';
const SAVINGS_NODE_ID = 'savings';

const typeNodeId = (expenseType: ExpenseType): string => `type:${expenseType}`;

/**
 * The type belongs INSIDE the category node id, not just in the aggregation map.
 *
 * A row carries its own denormalized `type` (see the warning on types/expenses.ts), so
 * one category document can legitimately back rows of two types while a bulk cascade is
 * mid-flight. The aggregation splits those into separate buckets; an id without the type
 * would map both buckets onto one node and reproduce the very collision this fixes.
 */
const categoryNodeId = (expenseType: ExpenseType, categoryKey: string): string =>
  `cat:${expenseType}:${categoryKey}`;

const subCategoryNodeId = (expenseType: ExpenseType, categoryKey: string, subCategoryKey: string): string =>
  `sub:${expenseType}:${categoryKey}:${subCategoryKey}`;

// ── Color derivation ─────────────────────────────────────────────────────────

/**
 * Derive subcategory colors from parent category color
 *
 * Algorithm: Brightness-based variation from base color
 * - Parse hex to RGB
 * - Apply brightness factor (1.0 → 0.55) for gradual darkening
 * - Convert back to hex
 */
export const deriveSubcategoryColors = (baseColor: string, count: number): string[] => {
  // Parse hex color to RGB
  const hex = baseColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    // Create variations by adjusting brightness (gradually darken)
    const factor = 1 - (i * 0.15);
    const newR = Math.round(Math.max(0, Math.min(255, r * factor)));
    const newG = Math.round(Math.max(0, Math.min(255, g * factor)));
    const newB = Math.round(Math.max(0, Math.min(255, b * factor)));
    colors.push(`#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`);
  }
  return colors;
};

// ── Aggregation ──────────────────────────────────────────────────────────────

interface SubCategoryTotal {
  key: string;
  name: string;
  value: number;
}

interface CategoryTotal {
  key: string;
  name: string;
  value: number;
  /**
   * Subcategory totals hang off their own category rather than living in a flat
   * name-keyed side map. That side map was a second copy of the identity problem: two
   * same-named categories overwrote each other's list, so one of them lost its entire
   * subcategory layer while still receiving both types' money on the incoming side.
   */
  subCategories: Map<string, SubCategoryTotal>;
}

interface FlowTotals {
  incomeCategories: Map<string, CategoryTotal>;
  totalsByType: Map<ExpenseType, number>;
  categoriesByType: Map<ExpenseType, Map<string, CategoryTotal>>;
  totalIncome: number;
  totalExpenses: number;
}

function upsertCategory(bucket: Map<string, CategoryTotal>, expense: Expense, amount: number): CategoryTotal {
  const key = getCategoryKey(expense);
  const category = bucket.get(key) ?? { key, name: getCategoryName(expense), value: 0, subCategories: new Map() };
  category.value += amount;

  const subKey = getSubCategoryKey(expense);
  const subCategory = category.subCategories.get(subKey) ?? { key: subKey, name: getSubCategoryLabel(expense), value: 0 };
  subCategory.value += amount;
  category.subCategories.set(subKey, subCategory);

  bucket.set(key, category);
  return category;
}

/**
 * One pass over the period, producing every total the budget views need.
 *
 * The 4-layer view simply ignores the subcategory level rather than running a second,
 * near-identical pass — two copies of this aggregation is how the original drifted.
 */
function aggregateFlow(expenses: Expense[]): FlowTotals {
  const totals: FlowTotals = {
    incomeCategories: new Map(),
    totalsByType: new Map(),
    categoriesByType: new Map(),
    totalIncome: 0,
    totalExpenses: 0,
  };

  for (const expense of expenses) {
    // Internal movements are net-zero and are excluded from every metric in the app.
    if (expense.type === 'transfer') continue;

    const amount = Math.abs(expense.amount);

    if (expense.type === 'income') {
      upsertCategory(totals.incomeCategories, expense, amount);
      totals.totalIncome += amount;
      continue;
    }

    totals.totalsByType.set(expense.type, (totals.totalsByType.get(expense.type) ?? 0) + amount);
    totals.totalExpenses += amount;

    const bucket = totals.categoriesByType.get(expense.type) ?? new Map<string, CategoryTotal>();
    upsertCategory(bucket, expense, amount);
    totals.categoriesByType.set(expense.type, bucket);
  }

  return totals;
}

const byValueDescending = (a: { value: number }, b: { value: number }) => b.value - a.value;

function rank<T extends { value: number }>(items: Iterable<T>, limit?: number): T[] {
  const sorted = Array.from(items).sort(byValueDescending);
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

/**
 * A category shows a subcategory layer only when it has a real breakdown. One bucket
 * holding every row (the "no subcategory" sentinel) is not a breakdown — rendering it
 * would add a layer that repeats the category, and leave a dangling node behind if the
 * node and link filters ever disagreed.
 */
function hasRealBreakdown(category: CategoryTotal): boolean {
  return !(category.subCategories.size === 1 && category.subCategories.has(NO_SUBCATEGORY_KEY));
}

// ── View builders ────────────────────────────────────────────────────────────

/**
 * Accumulates nodes, links and descriptors together so a node can never be emitted
 * without the descriptor that explains it — `index.size === nodes.length` is an
 * invariant of construction rather than something callers have to remember.
 */
class ViewBuilder {
  private readonly nodes: SankeyNode[] = [];
  private readonly links: SankeyLink[] = [];
  private readonly index = new Map<string, SankeyNodeDescriptor>();

  addNode(id: string, label: string, nodeColor: string, descriptor: SankeyNodeDescriptor): void {
    this.nodes.push({ id, label, nodeColor });
    this.index.set(id, descriptor);
  }

  addLink(source: string, target: string, value: number): void {
    this.links.push({ source, target, value });
  }

  build(): SankeyView {
    return { nodes: this.nodes, links: this.links, index: this.index };
  }
}

const EMPTY_VIEW: SankeyView = { nodes: [], links: [], index: new Map() };

/**
 * Resolve the labels for every category node on one chart in a single pass.
 *
 * Keyed by NODE ID, not by category key: that is what lets two rows which fall back to
 * the same name-derived key (legacy documents with no categoryId) still be told apart,
 * because their node ids carry the type.
 */
function resolveCategoryLabels(
  entries: Array<{ nodeId: string; name: string; expenseType: ExpenseType }>
): Map<string, string> {
  const groups: LabelledGroup[] = entries.map((entry) => ({
    key: entry.nodeId,
    name: entry.name,
    qualifier: EXPENSE_TYPE_LABELS[entry.expenseType],
  }));
  return resolveDisplayLabels(groups);
}

interface BudgetFlowOptions {
  /** Emit the subcategory layer (5-layer view) instead of stopping at categories. */
  withSubcategories: boolean;
  isMobile: boolean;
}

/**
 * Build the budget flow: Income categories → Budget → Expense types → Categories
 * (→ Subcategories) + Savings.
 *
 * @param expenses All rows for the period, income and expenses together.
 */
function buildBudgetFlow(expenses: Expense[], options: BudgetFlowOptions): SankeyView {
  const { withSubcategories, isMobile } = options;
  const totals = aggregateFlow(expenses);
  const savings = totals.totalIncome - totals.totalExpenses;

  const incomeCategories = rank(
    totals.incomeCategories.values(),
    isMobile ? MOBILE_MAX_INCOME_CATEGORIES : undefined
  );

  // Rank and slice per type BEFORE labelling, so the labels describe what is on screen:
  // a name that collides only with a category the mobile cut removed is not ambiguous.
  const categoriesByType = new Map<ExpenseType, CategoryTotal[]>(
    EXPENSE_FLOW_TYPES.map((type) => [
      type,
      rank(
        (totals.categoriesByType.get(type) ?? new Map()).values(),
        isMobile ? MOBILE_MAX_CATEGORIES_PER_TYPE : undefined
      ),
    ])
  );

  const labels = resolveCategoryLabels([
    ...incomeCategories.map((category) => ({
      nodeId: categoryNodeId('income', category.key),
      name: category.name,
      expenseType: 'income' as ExpenseType,
    })),
    ...EXPENSE_FLOW_TYPES.flatMap((type) =>
      (categoriesByType.get(type) ?? []).map((category) => ({
        nodeId: categoryNodeId(type, category.key),
        name: category.name,
        expenseType: type,
      }))
    ),
  ]);

  const builder = new ViewBuilder();

  // Layer 1: income categories → Budget
  incomeCategories.forEach((category, position) => {
    const nodeId = categoryNodeId('income', category.key);
    const label = labels.get(nodeId) ?? category.name;
    builder.addNode(nodeId, label, COLORS[position % COLORS.length], {
      kind: 'category',
      expenseType: 'income',
      categoryKey: category.key,
      categoryLabel: label,
    });
    builder.addLink(nodeId, BUDGET_NODE_ID, category.value);
  });

  // Layer 2: the Budget node itself
  builder.addNode(BUDGET_NODE_ID, 'Budget', BUDGET_NODE_COLOR, { kind: 'budget' });

  // Layer 3+: one branch per spending type
  for (const type of EXPENSE_FLOW_TYPES) {
    const typeTotal = totals.totalsByType.get(type) ?? 0;
    if (typeTotal <= 0) continue;

    const typeId = typeNodeId(type);
    builder.addNode(typeId, EXPENSE_TYPE_LABELS[type], TYPE_COLORS[type], { kind: 'expenseType', expenseType: type });
    builder.addLink(BUDGET_NODE_ID, typeId, typeTotal);

    const categories = categoriesByType.get(type) ?? [];
    const categoryColors = deriveSubcategoryColors(TYPE_COLORS[type], categories.length);

    categories.forEach((category, position) => {
      // In the 5-layer view a category without a real breakdown is dropped along with
      // its link, so the layer below never has a parent that emits nothing.
      if (withSubcategories && !hasRealBreakdown(category)) return;

      const categoryId = categoryNodeId(type, category.key);
      const categoryLabel = labels.get(categoryId) ?? category.name;
      const categoryColor = categoryColors[position];

      builder.addNode(categoryId, categoryLabel, categoryColor, {
        kind: 'category',
        expenseType: type,
        categoryKey: category.key,
        categoryLabel,
      });
      builder.addLink(typeId, categoryId, category.value);

      if (!withSubcategories) return;

      const subCategories = rank(category.subCategories.values(), isMobile ? MOBILE_MAX_SUBCATEGORIES : undefined);
      const subColors = deriveSubcategoryColors(categoryColor, subCategories.length);

      subCategories.forEach((subCategory, subPosition) => {
        const subId = subCategoryNodeId(type, category.key, subCategory.key);
        builder.addNode(subId, subCategory.name, subColors[subPosition], {
          kind: 'subCategory',
          expenseType: type,
          categoryKey: category.key,
          categoryLabel,
          subCategoryKey: subCategory.key,
          subCategoryLabel: subCategory.name,
        });
        builder.addLink(categoryId, subId, subCategory.value);
      });
    });
  }

  // Savings is what the budget does not spend — absent when spending exceeds income,
  // because a negative flow has no width to draw.
  if (savings > 0) {
    builder.addNode(SAVINGS_NODE_ID, 'Risparmi', SAVINGS_NODE_COLOR, { kind: 'savings' });
    builder.addLink(BUDGET_NODE_ID, SAVINGS_NODE_ID, savings);
  }

  return builder.build();
}

/**
 * 4-layer budget flow: Income categories → Budget → Expense types → Categories + Savings.
 */
export function buildBudgetFlowData(expenses: Expense[], isMobile: boolean): SankeyView {
  return buildBudgetFlow(expenses, { withSubcategories: false, isMobile });
}

/**
 * 5-layer budget flow, adding a subcategory layer under each category.
 *
 * Categories whose rows carry no subcategory at all are dropped from both layers —
 * see hasRealBreakdown.
 */
export function buildBudgetFlowDataWithSubcategories(expenses: Expense[], isMobile: boolean): SankeyView {
  return buildBudgetFlow(expenses, { withSubcategories: true, isMobile });
}

/**
 * Type drill-down: one expense type → its categories.
 *
 * Takes the `ExpenseType` itself rather than its Italian label, which used to be
 * reverse-looked-up through EXPENSE_TYPE_LABELS — a lookup that also matched a category
 * literally named "Trasferimento".
 *
 * No label qualifier here: the whole view is one type, so appending it to every node
 * would say nothing. Two same-named categories within the type keep the same label and
 * stay separate nodes; the click resolves through the id.
 */
export function buildTypeDrillDownData(
  expenses: Expense[],
  expenseType: ExpenseType,
  typeColor: string,
  isMobile: boolean
): SankeyView {
  const bucket = new Map<string, CategoryTotal>();
  for (const expense of expenses) {
    if (expense.type !== expenseType) continue;
    upsertCategory(bucket, expense, Math.abs(expense.amount));
  }
  if (bucket.size === 0) return EMPTY_VIEW;

  const categories = rank(bucket.values(), isMobile ? MOBILE_MAX_DRILLDOWN_ITEMS : undefined);
  const colors = deriveSubcategoryColors(typeColor, categories.length);

  const builder = new ViewBuilder();
  const typeId = typeNodeId(expenseType);
  builder.addNode(typeId, EXPENSE_TYPE_LABELS[expenseType], typeColor, { kind: 'expenseType', expenseType });

  categories.forEach((category, position) => {
    const categoryId = categoryNodeId(expenseType, category.key);
    builder.addNode(categoryId, category.name, colors[position], {
      kind: 'category',
      expenseType,
      categoryKey: category.key,
      categoryLabel: category.name,
    });
    builder.addLink(typeId, categoryId, category.value);
  });

  return builder.build();
}


