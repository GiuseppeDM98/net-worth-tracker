/**
 * Cashflow Sankey data builders — pure, chart-library-agnostic.
 *
 * Extracted from components/cashflow/CashflowSankeyChart.tsx so the graph construction
 * can be tested against plain arrays: vitest.config.ts collects only
 * `__tests__/**\/*.test.ts`, so logic living inside a `.tsx` has no way to be covered at
 * all. The shapes below are plain objects; @nivo/sankey consumes them structurally.
 *
 * A second, structural reason to keep this file free of React: doc/guide/grafici.md § Recharts records that
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
 *
 * With settings.spendingRolesEnabled the same two views exist by 50/30/20 role instead of by
 * type (the «50/30/20 view» section at the end): roles in place of types, same shapes.
 */

import {
  Expense,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  NO_SUBCATEGORY_KEY,
} from '@/types/expenses';
import {
  isSpendingType,
  resolveSpendingRole,
  SPENDING_BUCKET_LABELS,
  SPENDING_EXPENSE_TYPES,
  SPENDING_ROLE_FLOW_ORDER,
  summarizeSpendingRoles,
  type SpendingBucket,
  type SpendingRoleSource,
} from '@/lib/utils/spendingRoles';
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

/**
 * The subcategory layer is a detail of the biggest categories, not a fifth column for every
 * one of them: on the real account (29 categories) it drew 98 nodes in 500px and no label was
 * readable (2026-09-14). Only the `MAX_SUBCATEGORY_CATEGORIES` largest categories, across the
 * types, open into their `MAX_SUBCATEGORIES` largest subcategories; what those leave out is
 * ONE «Altre N» node per category (it still adds up), and every other category stays a leaf.
 * The tile's aside says so («prime 6 categorie»).
 */
export const MAX_SUBCATEGORY_CATEGORIES = 6;
export const MAX_SUBCATEGORIES = 4;

/**
 * Label text, one neutral per mode — the labels used to take each node's colour brightened
 * 1.5×, which put rgb(255,255,19) yellow beside the type's violet. Hex because the chart is
 * Nivo on react-spring (doc/guide/grafici.md § Recharts: never a CSS token here); the values are the
 * sRGB of DESIGN.md's off-blanc and charcoal, declared in the DOM-side hex inventory.
 */
export const LABEL_TEXT_COLORS = { dark: '#e5e5e5', light: '#262626' } as const;

/** Nodes per column, the input of `resolveSankeyHeight` — exported for the tile's aside and its tests. */
export interface SankeyLayerCounts {
  incomeCategories: number;
  expenseTypes: number;
  categories: number;
  subCategories: number;
  hasSavings: boolean;
}

/**
 * How many nodes stand in each column of a view. With `align="left"` a node sits at its
 * depth from the sources, so the savings node shares the types' column and a category
 * without a subcategory layer stays in the categories' column — the widest column is what
 * decides the height.
 */
export function countSankeyLayers(view: SankeyView): SankeyLayerCounts {
  const counts: SankeyLayerCounts = { incomeCategories: 0, expenseTypes: 0, categories: 0, subCategories: 0, hasSavings: false };
  for (const descriptor of view.index.values()) {
    switch (descriptor.kind) {
      case 'category':
        if (descriptor.expenseType === 'income') counts.incomeCategories++;
        else counts.categories++;
        break;
      case 'expenseType':
      case 'spendingRole':
        counts.expenseTypes++;
        break;
      case 'deficit':
        counts.incomeCategories++;
        break;
      case 'subCategory':
        counts.subCategories++;
        break;
      case 'savings':
        counts.hasSavings = true;
        break;
      case 'budget':
        break;
    }
  }
  return counts;
}

/** Vertical room per node of the widest column: the spacing plus an 11px label with its leading. */
const ROW_PX = 26;
const BASE_HEIGHT = 500;
const MAX_HEIGHT = 1100;

/**
 * The plot's height from its widest column: a fixed 500px packed 30 category nodes at 10px
 * of spacing, so the smallest nodes' labels overlapped (16 pairs measured at 1440 on the real
 * account, 2026-09-14). Each node of the widest column gets a row; the height never drops
 * below the base and never exceeds the cap, so a pathological taxonomy scrolls the page rather
 * than the label pitch. One variant only: the Sankey is not drawn below 640px (FlussoTile).
 */
export function resolveSankeyHeight(counts: SankeyLayerCounts): number {
  const widest = Math.max(counts.incomeCategories, counts.expenseTypes + (counts.hasSavings ? 1 : 0), counts.categories, counts.subCategories, 1);
  return Math.min(MAX_HEIGHT, Math.max(BASE_HEIGHT, widest * ROW_PX + 80));
}

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
  /** A 50/30/20 role node (Necessità, Desideri, Risparmi, Da classificare). */
  | { kind: 'spendingRole'; bucket: SpendingBucket }
  /** «Coperto dal patrimonio»: what spending took beyond the period's income. */
  | { kind: 'deficit' }
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

/** The «Altre N» residual of a category's subcategory layer — one per category, namespaced like the rest. */
const subCategoryRestNodeId = (expenseType: ExpenseType, categoryKey: string): string => `subrest:${expenseType}:${categoryKey}`;

// ── Color derivation ─────────────────────────────────────────────────────────

/**
 * The darkest a derived shade gets, as a share of the base colour's brightness. Without it the
 * ramp below reaches zero at the eighth shade and paints every later node #000000 — invisible on
 * a dark theme — which a branch of 25 categories («Da classificare») made plain (2026-09-27).
 */
const MIN_SHADE_FACTOR = 0.55;

/**
 * Derive subcategory colors from parent category color
 *
 * Algorithm: Brightness-based variation from base color
 * - Parse hex to RGB
 * - Apply brightness factor (1.0 → MIN_SHADE_FACTOR) for gradual darkening: the first four shades
 *   differ, every later one takes the floor
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
    // Create variations by adjusting brightness (gradually darken, never past the floor)
    const factor = Math.max(MIN_SHADE_FACTOR, 1 - (i * 0.15));
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

/** Adds one row to a category total and to its subcategory. */
function addToCategory(category: CategoryTotal, expense: Expense, amount: number): void {
  category.value += amount;
  const subKey = getSubCategoryKey(expense);
  const subCategory = category.subCategories.get(subKey) ?? { key: subKey, name: getSubCategoryLabel(expense), value: 0 };
  subCategory.value += amount;
  category.subCategories.set(subKey, subCategory);
}

function upsertCategory(bucket: Map<string, CategoryTotal>, expense: Expense, amount: number): CategoryTotal {
  const key = getCategoryKey(expense);
  const category = bucket.get(key) ?? { key, name: getCategoryName(expense), value: 0, subCategories: new Map() };
  addToCategory(category, expense, amount);
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
}

/**
 * Build the budget flow: Income categories → Budget → Expense types → Categories
 * (→ Subcategories) + Savings.
 *
 * @param expenses All rows for the period, income and expenses together.
 */
function buildBudgetFlow(expenses: Expense[], options: BudgetFlowOptions): SankeyView {
  const { withSubcategories } = options;
  const totals = aggregateFlow(expenses);
  const savings = totals.totalIncome - totals.totalExpenses;

  const incomeCategories = rank(totals.incomeCategories.values());

  // Every category of every type, ranked: the labels are resolved over what is on screen.
  const categoriesByType = new Map<ExpenseType, CategoryTotal[]>(
    SPENDING_EXPENSE_TYPES.map((type) => [type, rank((totals.categoriesByType.get(type) ?? new Map()).values())])
  );

  const labels = resolveCategoryLabels([
    ...incomeCategories.map((category) => ({
      nodeId: categoryNodeId('income', category.key),
      name: category.name,
      expenseType: 'income' as ExpenseType,
    })),
    ...SPENDING_EXPENSE_TYPES.flatMap((type) =>
      (categoriesByType.get(type) ?? []).map((category) => ({
        nodeId: categoryNodeId(type, category.key),
        name: category.name,
        expenseType: type,
      }))
    ),
  ]);

  // The categories that open into a subcategory layer: the largest with a real breakdown,
  // across the types (see MAX_SUBCATEGORY_CATEGORIES).
  const openCategories = new Set<string>(
    withSubcategories
      ? rank(
          SPENDING_EXPENSE_TYPES.flatMap((type) =>
            (categoriesByType.get(type) ?? []).filter(hasRealBreakdown).map((category) => ({ nodeId: categoryNodeId(type, category.key), value: category.value })),
          ),
          MAX_SUBCATEGORY_CATEGORIES,
        ).map((entry) => entry.nodeId)
      : [],
  );

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
  for (const type of SPENDING_EXPENSE_TYPES) {
    const typeTotal = totals.totalsByType.get(type) ?? 0;
    if (typeTotal <= 0) continue;

    const typeId = typeNodeId(type);
    builder.addNode(typeId, EXPENSE_TYPE_LABELS[type], TYPE_COLORS[type], { kind: 'expenseType', expenseType: type });
    builder.addLink(BUDGET_NODE_ID, typeId, typeTotal);

    const categories = categoriesByType.get(type) ?? [];
    const categoryColors = deriveSubcategoryColors(TYPE_COLORS[type], categories.length);

    categories.forEach((category, position) => {
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

          // A category outside the largest ones, or without a real breakdown, is a leaf: it keeps
      // its node and its money, it just does not open (dropping it hid the category entirely).
      if (!openCategories.has(categoryNodeId(type, category.key))) return;

      const rankedSubCategories = rank(category.subCategories.values());
      const subCategories = rankedSubCategories.slice(0, MAX_SUBCATEGORIES);
      const rest = rankedSubCategories.slice(MAX_SUBCATEGORIES);
      const subColors = deriveSubcategoryColors(categoryColor, subCategories.length + (rest.length > 0 ? 1 : 0));

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

      // The residual is a node of its own so the category still adds up; it opens the
      // category's Scheda, where every subcategory is listed.
      if (rest.length > 0) {
        const restId = subCategoryRestNodeId(type, category.key);
        const restValue = rest.reduce((sum, subCategory) => sum + subCategory.value, 0);
        builder.addNode(restId, rest.length === 1 ? "Un'altra" : `Altre ${rest.length}`, subColors[subCategories.length], {
          kind: 'category',
          expenseType: type,
          categoryKey: category.key,
          categoryLabel,
        });
        builder.addLink(categoryId, restId, restValue);
      }
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
export function buildBudgetFlowData(expenses: Expense[]): SankeyView {
  return buildBudgetFlow(expenses, { withSubcategories: false });
}

/**
 * 5-layer budget flow, adding a subcategory layer under the largest categories
 * (MAX_SUBCATEGORY_CATEGORIES, MAX_SUBCATEGORIES + one «Altre N» node each); every other
 * category, and one whose rows carry no subcategory at all (hasRealBreakdown), stays a leaf.
 */
export function buildBudgetFlowDataWithSubcategories(expenses: Expense[]): SankeyView {
  return buildBudgetFlow(expenses, { withSubcategories: true });
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
  typeColor: string
): SankeyView {
  const bucket = new Map<string, CategoryTotal>();
  for (const expense of expenses) {
    if (expense.type !== expenseType) continue;
    upsertCategory(bucket, expense, Math.abs(expense.amount));
  }
  if (bucket.size === 0) return EMPTY_VIEW;

  const categories = rank(bucket.values());
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

// ── 50/30/20 view ────────────────────────────────────────────────────────────
//
// Income categories (+ «Coperto dal patrimonio») → Budget → roles → categories (→ subcategories).
// The role of a row comes from resolveSpendingRole and the node TOTALS from summarizeSpendingRoles —
// the same functions the tile's reading uses — so the flow and the sentence above it cannot drift.
// Risparmi carries the saving-classified categories plus the surplus, which has no child: a Sankey
// node's value is max(in, out), so the surplus simply ends there.
//
// Income and Budget keep the type view's colours; the roles take theme tokens (the five `--role-*`
// aliases in globals.css), resolved to hex by the tile through useCssColorTokens, and their
// categories the same derived shades as a type's.

/** The role colours, resolved to hex (Nivo cannot take oklch/lab) — see useCssColorTokens. */
export interface SpendingRolePalette {
  need: string;
  want: string;
  saving: string;
  unclassified: string;
  deficit: string;
}

/** Painted before the theme tokens are read, and whenever one is unreadable. */
export const DEFAULT_SPENDING_ROLE_PALETTE: SpendingRolePalette = {
  need: '#3b82f6',
  want: '#8b5cf6',
  saving: '#14b8a6',
  unclassified: '#94a3b8',
  deficit: '#ef4444',
};

export const DEFICIT_NODE_LABEL = 'Coperto dal patrimonio';

const DEFICIT_NODE_ID = 'deficit';
const roleNodeId = (bucket: SpendingBucket): string => `role:${bucket}`;
// The bucket is part of the category id: one category split by a subcategory override is two
// nodes (Abbonamenti under Necessità AND under Desideri), and one id would merge them.
const roleCategoryNodeId = (bucket: SpendingBucket, expenseType: ExpenseType, categoryKey: string): string =>
  `rcat:${bucket}:${expenseType}:${categoryKey}`;
const roleSubCategoryNodeId = (bucket: SpendingBucket, expenseType: ExpenseType, categoryKey: string, subKey: string): string =>
  `rsub:${bucket}:${expenseType}:${categoryKey}:${subKey}`;
/** The «Altre N» residual of a role category's subcategory layer, the roles twin of `subCategoryRestNodeId`. */
const roleSubCategoryRestNodeId = (bucket: SpendingBucket, expenseType: ExpenseType, categoryKey: string): string =>
  `rsubrest:${bucket}:${expenseType}:${categoryKey}`;

/**
 * Lowers a ranked list to `total`, taking the excess off the largest entries first and dropping
 * any that reach zero; re-ranked, because taking from the largest can reorder it. The largest
 * first because they can absorb it with the least change to the picture.
 */
function trimToTotal<T extends { value: number }>(items: T[], total: number): T[] {
  let excess = items.reduce((sum, item) => sum + item.value, 0) - total;
  const trimmed = rank(items).map((item) => {
    const taken = Math.min(Math.max(excess, 0), item.value);
    excess -= taken;
    return { ...item, value: item.value - taken };
  });
  // Not `> 0`: euro amounts in binary floating point leave a 1e-13 residue that would be a node.
  return rank(trimmed.filter((item) => item.value > 1e-6));
}

interface RoleCategoryTotal extends CategoryTotal {
  expenseType: ExpenseType;
}

interface RoleCategoryLabelEntry {
  nodeId: string;
  name: string;
  /** `null` for an income category, which has no role. */
  bucket: SpendingBucket | null;
  expenseType: ExpenseType;
}

/**
 * The labels of every category node of the roles flow, disambiguating only real collisions and
 * only by what actually differs between the nodes that collide.
 *
 * A name can repeat for two reasons here, where the type view has one. The SAME category split by
 * a subcategory override sits under two roles: the role tells the two nodes apart («Abbonamenti
 * (Necessità)» / «Abbonamenti (Desideri)»). Two DIFFERENT categories that share a name sit under
 * one role with two types: the role they share says nothing, the type does («Casa (Spese Fisse)» /
 * «Casa (Spese Variabili)»). When both happen at once the qualifier carries both. An income
 * category is always «(Entrate)»: it has no role, and its type is what sets it apart.
 */
function resolveRoleCategoryLabels(entries: RoleCategoryLabelEntry[]): Map<string, string> {
  const roleOf = (entry: RoleCategoryLabelEntry): string =>
    entry.bucket === null ? EXPENSE_TYPE_LABELS.income : SPENDING_BUCKET_LABELS[entry.bucket];
  const typeOf = (entry: RoleCategoryLabelEntry): string => EXPENSE_TYPE_LABELS[entry.expenseType];
  const bothOf = (entry: RoleCategoryLabelEntry): string =>
    entry.bucket === null ? EXPENSE_TYPE_LABELS.income : `${roleOf(entry)} · ${typeOf(entry)}`;

  const byName = new Map<string, RoleCategoryLabelEntry[]>();
  for (const entry of entries) byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);

  const labels = new Map<string, string>();
  for (const [name, sameName] of byName) {
    if (sameName.length === 1) {
      labels.set(sameName[0].nodeId, name);
      continue;
    }
    // The shortest qualifier that leaves no two of these nodes with the same words.
    const isDistinct = (qualify: (entry: RoleCategoryLabelEntry) => string): boolean =>
      new Set(sameName.map(qualify)).size === sameName.length;
    const qualify = [roleOf, typeOf].find(isDistinct) ?? bothOf;
    for (const entry of sameName) labels.set(entry.nodeId, `${name} (${qualify(entry)})`);
  }
  return labels;
}

/** Spending rows grouped bucket → (type, category) → subcategory, by the ONE role resolution. */
function aggregateByRole(
  expenses: Expense[],
  categories: SpendingRoleSource[]
): Map<SpendingBucket, Map<string, RoleCategoryTotal>> {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const byBucket = new Map<SpendingBucket, Map<string, RoleCategoryTotal>>(
    SPENDING_ROLE_FLOW_ORDER.map((bucket) => [bucket, new Map()])
  );
  for (const expense of expenses) {
    if (!isSpendingType(expense.type)) continue;
    const bucket: SpendingBucket = resolveSpendingRole(categoriesById.get(expense.categoryId), expense.subCategoryId) ?? 'unclassified';
    const perCategory = byBucket.get(bucket)!;
    const key = getCategoryKey(expense);
    // Keyed by type too: a row carries its own type, and one category can back two mid-cascade.
    const id = `${expense.type}:${key}`;
    const category = perCategory.get(id) ?? { key, name: getCategoryName(expense), value: 0, subCategories: new Map(), expenseType: expense.type };
    addToCategory(category, expense, Math.abs(expense.amount));
    perCategory.set(id, category);
  }
  return byBucket;
}

function buildSpendingRolesFlow(
  expenses: Expense[],
  categories: SpendingRoleSource[],
  palette: SpendingRolePalette,
  options: BudgetFlowOptions
): SankeyView {
  const { withSubcategories } = options;
  const summary = summarizeSpendingRoles(expenses, categories);
  if (summary.income + summary.deficit <= 0) return EMPTY_VIEW;

  // The income side comes from the SAME summary as the role totals, net per category (a reversal
  // lowers its category). aggregateFlow's income is a magnitude per row — right for the type
  // view's own totals, but it would add a reversal to the left of this one while the summary
  // subtracts it on the right.
  //
  // The right side of Budget is spending + surplus = max(spending, income), so the left side is
  // built to match it: the income categories carry max(income, 0) and «Coperto dal patrimonio»
  // the rest of the spending. A category netting to ≤ 0 is not in `summary.incomeCategories` (a
  // link has no negative width), so its reversal is still owed by the others: it comes off them
  // largest first, which is how the list adds up to the income Periodo prints.
  const coveredIncome = Math.max(summary.income, 0);
  const incomeCategories = trimToTotal(
    summary.incomeCategories.map((slice) => ({ key: slice.categoryKey, name: slice.categoryName, value: slice.value })),
    coveredIncome
  );
  const uncovered = summary.spending - coveredIncome;
  const byRole = aggregateByRole(expenses, categories);
  // Every category of every role, ranked, as the type view does.
  const rankedByRole = new Map<SpendingBucket, RoleCategoryTotal[]>(
    SPENDING_ROLE_FLOW_ORDER.map((bucket) => [bucket, rank(byRole.get(bucket)!.values())])
  );

  const labels = resolveRoleCategoryLabels([
    ...incomeCategories.map((category) => ({
      nodeId: categoryNodeId('income', category.key),
      name: category.name,
      bucket: null,
      expenseType: 'income' as ExpenseType,
    })),
    ...SPENDING_ROLE_FLOW_ORDER.flatMap((bucket) =>
      (rankedByRole.get(bucket) ?? []).map((category) => ({
        nodeId: roleCategoryNodeId(bucket, category.expenseType, category.key),
        name: category.name,
        bucket,
        expenseType: category.expenseType,
      }))
    ),
  ]);

  // The same cut as the type view (MAX_SUBCATEGORY_CATEGORIES): only the largest categories with a
  // real breakdown, across the roles, open into a subcategory layer; every other category is a leaf.
  const openCategories = new Set<string>(
    withSubcategories
      ? rank(
          SPENDING_ROLE_FLOW_ORDER.flatMap((bucket) =>
            (rankedByRole.get(bucket) ?? [])
              .filter(hasRealBreakdown)
              .map((category) => ({ nodeId: roleCategoryNodeId(bucket, category.expenseType, category.key), value: category.value })),
          ),
          MAX_SUBCATEGORY_CATEGORIES,
        ).map((entry) => entry.nodeId)
      : [],
  );

  const builder = new ViewBuilder();

  // Layer 1: income categories, and the part of spending the income did not cover
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
  // Not `summary.deficit` (spending − SIGNED income): with income net negative that would also
  // count the reversals, which no longer appear on either side.
  if (uncovered > 0) {
    builder.addNode(DEFICIT_NODE_ID, DEFICIT_NODE_LABEL, palette.deficit, { kind: 'deficit' });
    builder.addLink(DEFICIT_NODE_ID, BUDGET_NODE_ID, uncovered);
  }

  // Layer 2
  builder.addNode(BUDGET_NODE_ID, 'Budget', BUDGET_NODE_COLOR, { kind: 'budget' });

  // Layer 3+: one branch per role
  for (const bucket of SPENDING_ROLE_FLOW_ORDER) {
    const total = bucket === 'saving' ? summary.savings : summary.byBucket[bucket].total;
    if (total <= 0) continue;
    const roleId = roleNodeId(bucket);
    const roleColor = palette[bucket];
    builder.addNode(roleId, SPENDING_BUCKET_LABELS[bucket], roleColor, { kind: 'spendingRole', bucket });
    builder.addLink(BUDGET_NODE_ID, roleId, total);

    const roleCategories = rankedByRole.get(bucket) ?? [];
    const categoryColors = deriveSubcategoryColors(roleColor, roleCategories.length);

    roleCategories.forEach((category, position) => {
      const categoryId = roleCategoryNodeId(bucket, category.expenseType, category.key);
      const categoryLabel = labels.get(categoryId) ?? category.name;
      const categoryColor = categoryColors[position];
      builder.addNode(categoryId, categoryLabel, categoryColor, {
        kind: 'category',
        expenseType: category.expenseType,
        categoryKey: category.key,
        categoryLabel,
      });
      builder.addLink(roleId, categoryId, category.value);

      // A category outside the largest ones, or without a real breakdown, keeps its node and its money as a leaf.
      if (!withSubcategories || !openCategories.has(categoryId)) return;
      const rankedSubCategories = rank(category.subCategories.values());
      const subCategories = rankedSubCategories.slice(0, MAX_SUBCATEGORIES);
      const rest = rankedSubCategories.slice(MAX_SUBCATEGORIES);
      const subColors = deriveSubcategoryColors(categoryColor, subCategories.length + (rest.length > 0 ? 1 : 0));

      subCategories.forEach((subCategory, subPosition) => {
        const subId = roleSubCategoryNodeId(bucket, category.expenseType, category.key, subCategory.key);
        builder.addNode(subId, subCategory.name, subColors[subPosition], {
          kind: 'subCategory',
          expenseType: category.expenseType,
          categoryKey: category.key,
          categoryLabel,
          subCategoryKey: subCategory.key,
          subCategoryLabel: subCategory.name,
        });
        builder.addLink(categoryId, subId, subCategory.value);
      });
      // The residual keeps the category adding up and opens its Scheda, where every subcategory is listed.
      if (rest.length > 0) {
        const restId = roleSubCategoryRestNodeId(bucket, category.expenseType, category.key);
        const restValue = rest.reduce((sum, subCategory) => sum + subCategory.value, 0);
        builder.addNode(restId, rest.length === 1 ? "Un'altra" : `Altre ${rest.length}`, subColors[subCategories.length], {
          kind: 'category',
          expenseType: category.expenseType,
          categoryKey: category.key,
          categoryLabel,
        });
        builder.addLink(categoryId, restId, restValue);
      }
    });
  }

  return builder.build();
}

/** 50/30/20 flow: income (+ «Coperto dal patrimonio») → Budget → roles → categories. */
export function buildSpendingRolesFlowData(
  expenses: Expense[],
  categories: SpendingRoleSource[],
  palette: SpendingRolePalette
): SankeyView {
  return buildSpendingRolesFlow(expenses, categories, palette, { withSubcategories: false });
}

/** The same flow with a subcategory layer under the largest categories, as in the type view. */
export function buildSpendingRolesFlowDataWithSubcategories(
  expenses: Expense[],
  categories: SpendingRoleSource[],
  palette: SpendingRolePalette
): SankeyView {
  return buildSpendingRolesFlow(expenses, categories, palette, { withSubcategories: true });
}

/**
 * Role drill-down: one role → its categories, the counterpart of buildTypeDrillDownData.
 * Risparmi's surplus has no category, so a savings role with no saving rows is an empty view.
 */
export function buildSpendingRoleDrillDownData(
  expenses: Expense[],
  categories: SpendingRoleSource[],
  bucket: SpendingBucket,
  roleColor: string
): SankeyView {
  const ranked = rank(aggregateByRole(expenses, categories).get(bucket)!.values());
  if (ranked.length === 0) return EMPTY_VIEW;

  // Inside one role the only possible collision is the same name under two types.
  const labels = resolveDisplayLabels(
    ranked.map((category) => ({
      key: roleCategoryNodeId(bucket, category.expenseType, category.key),
      name: category.name,
      qualifier: EXPENSE_TYPE_LABELS[category.expenseType],
    }))
  );
  const colors = deriveSubcategoryColors(roleColor, ranked.length);
  const builder = new ViewBuilder();
  const roleId = roleNodeId(bucket);
  builder.addNode(roleId, SPENDING_BUCKET_LABELS[bucket], roleColor, { kind: 'spendingRole', bucket });
  ranked.forEach((category, position) => {
    const categoryId = roleCategoryNodeId(bucket, category.expenseType, category.key);
    const categoryLabel = labels.get(categoryId) ?? category.name;
    builder.addNode(categoryId, categoryLabel, colors[position], {
      kind: 'category',
      expenseType: category.expenseType,
      categoryKey: category.key,
      categoryLabel,
    });
    builder.addLink(roleId, categoryId, category.value);
  });
  return builder.build();
}
