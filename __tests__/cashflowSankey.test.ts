import { describe, expect, it } from 'vitest';
import {
  buildBudgetFlowData,
  buildBudgetFlowDataWithSubcategories,
  buildTypeDrillDownData,
  buildSpendingRoleDrillDownData,
  buildSpendingRolesFlowData,
  buildSpendingRolesFlowDataWithSubcategories,
  DEFAULT_SPENDING_ROLE_PALETTE,
  DEFICIT_NODE_LABEL,
  deriveSubcategoryColors,
  countSankeyLayers,
  resolveSankeyHeight,
  MAX_SUBCATEGORIES,
  MAX_SUBCATEGORY_CATEGORIES,
  TYPE_COLORS,
  type SankeyView,
} from '@/lib/utils/cashflowSankey';
import type { SpendingRoleSource } from '@/lib/utils/spendingRoles';
// Row-selection vocabulary from its home module — the cashflowSankey re-export
// fell with the internal category drill (2026-08-14). Its tests stay in this file
// for the shared same-named-categories fixtures; production consumers are now
// expenseEntityStats and AnalisiTab.
import { selectExpensesForDrillDown } from '@/lib/utils/expenseGrouping';
import {
  Expense,
  ExpenseType,
  EXPENSE_TYPE_LABELS,
  NO_SUBCATEGORY_KEY,
  NO_SUBCATEGORY_LABEL,
} from '@/types/expenses';

type SankeyData = SankeyView;

/**
 * Builds an expense doc with only the fields the builders read.
 *
 * `categoryId` and `categoryName` are separate parameters on purpose: the whole point
 * of these tests is that two rows can share a name while being different categories.
 */
function makeExpense(overrides: Partial<Expense> & { type: ExpenseType; amount: number }): Expense {
  return {
    id: 'e1',
    userId: 'u1',
    categoryId: 'cat-casa',
    categoryName: 'Casa',
    currency: 'EUR',
    date: new Date('2025-06-15T12:00:00Z'),
    createdAt: new Date('2025-06-15T12:00:00Z'),
    updatedAt: new Date('2025-06-15T12:00:00Z'),
    ...overrides,
  } as Expense;
}

// ── Structural invariants ────────────────────────────────────────────────────
// Both mirror what d3-sankey does internally, so a violation here is exactly a
// broken chart in the browser rather than a stylistic complaint.

/**
 * Every link endpoint must exist among the nodes, and no two nodes may share an id.
 *
 * d3-sankey resolves endpoints through `new Map(nodes.map(d => [id(d), d]))`, where a
 * duplicate id silently keeps the LAST node: the earlier one is left with no links and
 * renders as a zero-value ghost, while the survivor absorbs both branches' value via
 * `value = max(sum(sourceLinks), sum(targetLinks))`.
 */
function assertLinksResolve(view: SankeyData): void {
  const ids = view.nodes.map((node) => node.id);
  expect(new Set(ids).size, `duplicate node ids: ${ids.join(', ')}`).toBe(ids.length);

  const known = new Set(ids);
  for (const link of view.links) {
    expect(known.has(link.source), `dangling link source: ${link.source}`).toBe(true);
    expect(known.has(link.target), `dangling link target: ${link.target}`).toBe(true);
  }
}

/**
 * Replicates d3-sankey's `computeNodeDepths` BFS, which throws "circular link" — and
 * blanks the whole chart — when the graph cannot be layered.
 */
function assertAcyclic(view: SankeyData): void {
  const outgoing = new Map<string, string[]>();
  for (const link of view.links) {
    outgoing.set(link.source, [...(outgoing.get(link.source) ?? []), link.target]);
  }

  let current = new Set(view.nodes.map((node) => node.id));
  let depth = 0;
  while (current.size > 0) {
    const next = new Set<string>();
    for (const id of current) {
      for (const target of outgoing.get(id) ?? []) next.add(target);
    }
    depth += 1;
    expect(depth, 'circular link: the flow never reaches a terminal node').toBeLessThanOrEqual(
      view.nodes.length
    );
    current = next;
  }
}

/**
 * Node ids are opaque by design, so the tests address nodes the way a reader does —
 * by the label on screen. This keeps every assertion independent of the id format.
 */
function idOf(view: SankeyData, label: string): string {
  const matches = view.nodes.filter((node) => node.label === label);
  expect(matches, `expected exactly one node labelled "${label}"`).toHaveLength(1);
  return matches[0].id;
}

/** The flows leaving one node, as [target, value] pairs. */
function outgoingFrom(view: SankeyData, sourceId: string): Array<[string, number]> {
  return view.links.filter((link) => link.source === sourceId).map((link) => [link.target, link.value]);
}

const FIXED = EXPENSE_TYPE_LABELS.fixed;
const VARIABLE = EXPENSE_TYPE_LABELS.variable;

/** Two categories that share a name but are different documents under different types. */
const twoCasa = [
  makeExpense({ type: 'fixed', amount: -300, categoryId: 'cat-casa-fixed', categoryName: 'Casa' }),
  makeExpense({ type: 'variable', amount: -100, categoryId: 'cat-casa-var', categoryName: 'Casa' }),
  makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stipendio', categoryName: 'Stipendio' }),
];

describe('buildBudgetFlowData — same category name under two types', () => {
  it('should emit one node per category document, not one per name', () => {
    // Act
    const view = buildBudgetFlowData(twoCasa);

    // Assert
    assertLinksResolve(view);
  });

  it('should keep each type branch on its own amount instead of merging them', () => {
    // Act
    const view = buildBudgetFlowData(twoCasa);
    const [[fixedTarget, fixedValue]] = outgoingFrom(view, idOf(view, FIXED));
    const [[variableTarget, variableValue]] = outgoingFrom(view, idOf(view, VARIABLE));

    // Assert — the two branches must land on different nodes, or d3-sankey pours
    // 300 + 100 into whichever node survives the id collision.
    expect(fixedTarget).not.toBe(variableTarget);
    expect(fixedValue).toBe(300);
    expect(variableValue).toBe(100);
  });

  it('should qualify both colliding labels with their type', () => {
    // Act
    const view = buildBudgetFlowData(twoCasa);
    const labels = view.nodes.map((node) => node.label);

    // Assert
    expect(labels).toContain('Casa (Spese Necessarie)');
    expect(labels).toContain('Casa (Spese Non Necessarie)');
  });

  it('should leave a name that does not collide unqualified', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'fixed', amount: -300, categoryId: 'cat-casa', categoryName: 'Casa' }),
      makeExpense({ type: 'variable', amount: -100, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const view = buildBudgetFlowData(expenses);
    const labels = view.nodes.map((node) => node.label);

    // Assert
    expect(labels).toContain('Casa');
    expect(labels).toContain('Cibo');
    expect(labels.some((label) => label?.includes('('))).toBe(false);
  });
});

describe('buildBudgetFlowData — an income category sharing a name with an expense category', () => {
  it('should not close a cycle through the Budget node', () => {
    // Arrange — "Affitto" is both rent received and rent paid
    const expenses = [
      makeExpense({ type: 'income', amount: 800, categoryId: 'cat-affitto-in', categoryName: 'Affitto' }),
      makeExpense({ type: 'fixed', amount: -500, categoryId: 'cat-affitto-out', categoryName: 'Affitto' }),
    ];

    // Act
    const view = buildBudgetFlowData(expenses);

    // Assert
    assertLinksResolve(view);
    assertAcyclic(view);
  });

  it('should stay acyclic for legacy rows that carry no category id', () => {
    // Arrange — both fall back to the name as their key, so only the node kind separates them
    const expenses = [
      makeExpense({ type: 'income', amount: 800, categoryId: '', categoryName: 'Affitto' }),
      makeExpense({ type: 'fixed', amount: -500, categoryId: '', categoryName: 'Affitto' }),
    ];

    // Act
    const view = buildBudgetFlowData(expenses);

    // Assert
    assertLinksResolve(view);
    assertAcyclic(view);
  });
});

describe('buildBudgetFlowData — budget arithmetic', () => {
  it('should route income into Budget and out to the types plus savings', () => {
    // Act
    const view = buildBudgetFlowData(twoCasa);
    const budgetId = idOf(view, 'Budget');
    const intoBudget = view.links.filter((l) => l.target === budgetId).reduce((s, l) => s + l.value, 0);
    const outOfBudget = outgoingFrom(view, budgetId).reduce((s, [, value]) => s + value, 0);

    // Assert
    expect(intoBudget).toBe(2000);
    expect(outOfBudget).toBeCloseTo(2000, 6);
  });

  it('should omit the savings node when spending exceeds income', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'income', amount: 100, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      makeExpense({ type: 'fixed', amount: -400, categoryId: 'cat-casa', categoryName: 'Casa' }),
    ];

    // Act
    const view = buildBudgetFlowData(expenses);

    // Assert
    expect(view.nodes.some((node) => node.label === 'Risparmi')).toBe(false);
    assertLinksResolve(view);
  });

  it('should exclude transfers from every flow', () => {
    // Arrange
    const expenses = [
      ...twoCasa,
      makeExpense({ type: 'transfer', amount: 500, categoryId: 'cat-giro', categoryName: 'Trasferimenti' }),
    ];

    // Act
    const view = buildBudgetFlowData(expenses);

    // Assert
    expect(view.nodes.some((node) => node.label === 'Trasferimenti')).toBe(false);
    assertLinksResolve(view);
  });
});

describe('buildBudgetFlowDataWithSubcategories — same category name under two types', () => {
  const withSubcategories = [
    makeExpense({
      type: 'fixed',
      amount: -200,
      categoryId: 'cat-casa-fixed',
      categoryName: 'Casa',
      subCategoryId: 'sub-luce',
      subCategoryName: 'Elettricità',
    }),
    makeExpense({
      type: 'fixed',
      amount: -100,
      categoryId: 'cat-casa-fixed',
      categoryName: 'Casa',
      subCategoryId: 'sub-gas',
      subCategoryName: 'Gas',
    }),
    makeExpense({
      type: 'variable',
      amount: -150,
      categoryId: 'cat-casa-var',
      categoryName: 'Casa',
      subCategoryId: 'sub-arredo',
      subCategoryName: 'Arredamento',
    }),
    makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
  ];

  it('should keep both categories intact', () => {
    // Act
    const view = buildBudgetFlowDataWithSubcategories(withSubcategories);

    // Assert
    assertLinksResolve(view);
    assertAcyclic(view);
  });

  it('should not let one category swallow the other subcategory list', () => {
    // Act
    const view = buildBudgetFlowDataWithSubcategories(withSubcategories);
    const [[fixedCasa]] = outgoingFrom(view, idOf(view, FIXED));
    const [[variableCasa]] = outgoingFrom(view, idOf(view, VARIABLE));

    // Assert — today the flat name-keyed map means the variable Casa overwrites the
    // fixed one, so Elettricità and Gas disappear from the chart entirely.
    expect(outgoingFrom(view, fixedCasa).map(([, value]) => value).sort()).toEqual([100, 200]);
    expect(outgoingFrom(view, variableCasa).map(([, value]) => value)).toEqual([150]);
  });

  it('should label the subcategories of both categories', () => {
    // Act
    const view = buildBudgetFlowDataWithSubcategories(withSubcategories);
    const labels = view.nodes.map((node) => node.label);

    // Assert
    expect(labels).toContain('Elettricità');
    expect(labels).toContain('Gas');
    expect(labels).toContain('Arredamento');
  });

  it('should keep a category whose rows carry no subcategory as a leaf, with its money', () => {
    // Arrange — a subcategory layer that just repeats the category is not a breakdown, but
    // dropping the category hid 200 € of the flow (until 2026-09-14)
    const expenses = [
      makeExpense({ type: 'fixed', amount: -200, categoryId: 'cat-bare', categoryName: 'Assicurazione' }),
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const view = buildBudgetFlowDataWithSubcategories(expenses);

    // Assert
    const leaf = idOf(view, 'Assicurazione');
    expect(outgoingFrom(view, leaf)).toEqual([]);
    expect(view.links.find((link) => link.target === leaf)?.value).toBe(200);
    assertLinksResolve(view);
    assertAcyclic(view);
  });

  it('should open only the largest categories, cap their subcategories and fold the rest into one node that adds up', () => {
    // Arrange — eight categories with a breakdown; the smallest two must stay leaves, and the
    // biggest one has six subcategories, so two fold into «Altre 2»
    const expenses = [
      ...Array.from({ length: 8 }, (_, index) =>
        makeExpense({ type: 'variable', amount: -(index + 1) * 100, categoryId: `cat-${index}`, categoryName: `Categoria ${index}`, subCategoryId: `sub-${index}-a`, subCategoryName: `Sotto ${index} A` }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        makeExpense({ type: 'variable', amount: -10, categoryId: `cat-${index}`, categoryName: `Categoria ${index}`, subCategoryId: `sub-${index}-b`, subCategoryName: `Sotto ${index} B` }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        makeExpense({ type: 'variable', amount: -(index + 1), categoryId: 'cat-7', categoryName: 'Categoria 7', subCategoryId: `sub-7-extra-${index}`, subCategoryName: `Extra ${index}` }),
      ),
      makeExpense({ type: 'income', amount: 9000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const view = buildBudgetFlowDataWithSubcategories(expenses);

    // Assert — the two smallest categories are leaves, the six largest open
    expect(outgoingFrom(view, idOf(view, 'Categoria 0'))).toEqual([]);
    expect(outgoingFrom(view, idOf(view, 'Categoria 1'))).toEqual([]);
    expect(outgoingFrom(view, idOf(view, 'Categoria 2')).length).toBeGreaterThan(0);
    const opened = view.nodes.filter((node) => view.index.get(node.id)?.kind === 'subCategory' || node.id.startsWith('subrest:'));
    const openedCategories = new Set(opened.map((node) => node.id.split(':')[2]));
    expect(openedCategories.size).toBe(MAX_SUBCATEGORY_CATEGORIES);
    // Categoria 7: 800 + 10 + 1 + 2 + 3 + 4 across six subcategories → the four largest and «Altre 2» = 10 + 1 + ... wait: the fold takes the two smallest (1 and 2)
    const big = idOf(view, 'Categoria 7');
    const out = outgoingFrom(view, big);
    expect(out).toHaveLength(MAX_SUBCATEGORIES + 1);
    const rest = view.nodes.find((node) => node.id === 'subrest:variable:cat-7');
    expect(rest?.label).toBe('Altre 2');
    expect(out.find(([target]) => target === rest!.id)?.[1]).toBe(1 + 2);
    expect(out.reduce((sum, [, value]) => sum + value, 0)).toBeCloseTo(820);
    // The residual opens the category's Scheda.
    expect(view.index.get(rest!.id)).toMatchObject({ kind: 'category', categoryKey: 'cat-7' });
    assertLinksResolve(view);
    assertAcyclic(view);
  });

  it('should count its columns and size the plot on the widest one', () => {
    const view = buildBudgetFlowData(twoCasa);
    const counts = countSankeyLayers(view);
    expect(counts).toEqual({ incomeCategories: 1, expenseTypes: 2, categories: 2, subCategories: 0, hasSavings: true });
    // Two types and the savings beside them: three nodes wide at most → the base height.
    expect(resolveSankeyHeight(counts)).toBe(500);
    // Thirty categories: a row each, capped so a pathological taxonomy scrolls the page instead.
    expect(resolveSankeyHeight({ ...counts, categories: 30 })).toBe(30 * 26 + 80);
    expect(resolveSankeyHeight({ ...counts, subCategories: 200 })).toBe(1100);
  });

  it('should give the rows without a subcategory their own labelled bucket', () => {
    // Arrange
    const expenses = [
      makeExpense({
        type: 'fixed',
        amount: -200,
        categoryId: 'cat-casa',
        categoryName: 'Casa',
        subCategoryId: 'sub-luce',
        subCategoryName: 'Elettricità',
      }),
      makeExpense({ type: 'fixed', amount: -50, categoryId: 'cat-casa', categoryName: 'Casa' }),
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const view = buildBudgetFlowDataWithSubcategories(expenses);

    // Assert
    expect(view.nodes.map((node) => node.label)).toContain(NO_SUBCATEGORY_LABEL);
    assertLinksResolve(view);
  });
});

describe('the descriptor index', () => {
  it('should describe every node exactly once', () => {
    // Act
    const view = buildBudgetFlowDataWithSubcategories(
      [
        makeExpense({
          type: 'fixed',
          amount: -200,
          categoryId: 'cat-casa',
          categoryName: 'Casa',
          subCategoryId: 'sub-luce',
          subCategoryName: 'Elettricità',
        }),
        makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
      ]
    );

    // Assert — no node without a descriptor, no descriptor without a node
    expect(view.index.size).toBe(view.nodes.length);
    for (const node of view.nodes) {
      expect(view.index.has(node.id), `no descriptor for ${node.id}`).toBe(true);
    }
  });

  it('should tag each node with what it actually is', () => {
    // Act
    const view = buildBudgetFlowData(twoCasa);

    // Assert
    expect(view.index.get(idOf(view, 'Budget'))).toEqual({ kind: 'budget' });
    expect(view.index.get(idOf(view, 'Risparmi'))).toEqual({ kind: 'savings' });
    expect(view.index.get(idOf(view, FIXED))).toEqual({ kind: 'expenseType', expenseType: 'fixed' });
    expect(view.index.get(idOf(view, 'Casa (Spese Necessarie)'))).toEqual({
      kind: 'category',
      expenseType: 'fixed',
      categoryKey: 'cat-casa-fixed',
      categoryLabel: 'Casa (Spese Necessarie)',
    });
  });

  it('should carry the parent category on a subcategory descriptor', () => {
    // Arrange
    const expenses = [
      makeExpense({
        type: 'fixed',
        amount: -200,
        categoryId: 'cat-casa',
        categoryName: 'Casa',
        subCategoryId: 'sub-luce',
        subCategoryName: 'Elettricità',
      }),
      makeExpense({
        type: 'fixed',
        amount: -60,
        categoryId: 'cat-casa',
        categoryName: 'Casa',
        subCategoryId: 'sub-gas',
        subCategoryName: 'Gas',
      }),
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const view = buildBudgetFlowDataWithSubcategories(expenses);

    // Assert — enough on its own to build the exact transaction filter
    expect(view.index.get(idOf(view, 'Elettricità'))).toEqual({
      kind: 'subCategory',
      expenseType: 'fixed',
      categoryKey: 'cat-casa',
      categoryLabel: 'Casa',
      subCategoryKey: 'sub-luce',
      subCategoryLabel: 'Elettricità',
    });
  });
});

describe('buildTypeDrillDownData', () => {
  it('should keep two same-named categories of the drilled type apart', () => {
    // Arrange — nothing enforces uniqueness even inside one type
    const expenses = [
      makeExpense({ type: 'fixed', amount: -300, categoryId: 'cat-casa-a', categoryName: 'Casa' }),
      makeExpense({ type: 'fixed', amount: -100, categoryId: 'cat-casa-b', categoryName: 'Casa' }),
    ];

    // Act
    const view = buildTypeDrillDownData(expenses, 'fixed', TYPE_COLORS.fixed);

    // Assert
    assertLinksResolve(view);
    expect(view.links.map((link) => link.value).sort((a, b) => a - b)).toEqual([100, 300]);
  });

  it('should ignore rows of every other type', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'fixed', amount: -300, categoryId: 'cat-casa-fixed', categoryName: 'Casa' }),
      makeExpense({ type: 'variable', amount: -100, categoryId: 'cat-casa-var', categoryName: 'Casa' }),
    ];

    // Act
    const view = buildTypeDrillDownData(expenses, 'fixed', TYPE_COLORS.fixed);

    // Assert
    expect(view.links).toHaveLength(1);
    expect(view.links[0].value).toBe(300);
  });

  it('should return an empty view for a type with no rows', () => {
    // Act
    const view = buildTypeDrillDownData([], 'debt', TYPE_COLORS.debt);

    // Assert
    expect(view.nodes).toHaveLength(0);
    expect(view.links).toHaveLength(0);
    expect(view.index.size).toBe(0);
  });

  it('should not mistake a category named like a type for the type node', () => {
    // Arrange — the old label reverse-lookup matched "Trasferimento" as a type
    const expenses = [
      makeExpense({ type: 'fixed', amount: -80, categoryId: 'cat-giro', categoryName: 'Trasferimento' }),
    ];

    // Act
    const view = buildTypeDrillDownData(expenses, 'fixed', TYPE_COLORS.fixed);

    // Assert
    assertLinksResolve(view);
    expect(view.index.get(idOf(view, 'Trasferimento'))).toMatchObject({ kind: 'category' });
  });
});

describe('selectExpensesForDrillDown', () => {
  const rows = [
    makeExpense({ id: 'fixed-1', type: 'fixed', amount: -300, categoryId: 'cat-casa-fixed', categoryName: 'Casa' }),
    makeExpense({ id: 'var-1', type: 'variable', amount: -100, categoryId: 'cat-casa-var', categoryName: 'Casa' }),
    makeExpense({ id: 'transfer-1', type: 'transfer', amount: 500, categoryId: 'cat-casa-fixed', categoryName: 'Casa' }),
    makeExpense({
      id: 'fixed-2',
      type: 'fixed',
      amount: -50,
      categoryId: 'cat-casa-fixed',
      categoryName: 'Casa',
      subCategoryId: 'sub-luce',
      subCategoryName: 'Elettricità',
    }),
  ];

  it('should return only the rows of the drilled type', () => {
    // Act
    const selected = selectExpensesForDrillDown(rows, { expenseType: 'fixed', key: 'cat-casa-fixed' });

    // Assert
    expect(selected.map((e) => e.id)).toEqual(['fixed-1', 'fixed-2']);
  });

  it('should exclude transfers even when they sit in the drilled category', () => {
    // Act
    const selected = selectExpensesForDrillDown(rows, { expenseType: 'fixed', key: 'cat-casa-fixed' });

    // Assert
    expect(selected.some((e) => e.type === 'transfer')).toBe(false);
  });

  it('should select a real subcategory by key', () => {
    // Act
    const selected = selectExpensesForDrillDown(
      rows,
      { expenseType: 'fixed', key: 'cat-casa-fixed' },
      { key: 'sub-luce' }
    );

    // Assert
    expect(selected.map((e) => e.id)).toEqual(['fixed-2']);
  });

  it('should select the rows carrying no subcategory through the sentinel', () => {
    // Arrange — a blank string must land in the same bucket as a missing field
    const withBlank = [
      ...rows,
      makeExpense({
        id: 'fixed-3',
        type: 'fixed',
        amount: -10,
        categoryId: 'cat-casa-fixed',
        categoryName: 'Casa',
        subCategoryId: '   ',
      }),
    ];

    // Act
    const selected = selectExpensesForDrillDown(
      withBlank,
      { expenseType: 'fixed', key: 'cat-casa-fixed' },
      { key: NO_SUBCATEGORY_KEY }
    );

    // Assert
    expect(selected.map((e) => e.id)).toEqual(['fixed-1', 'fixed-3']);
  });
});

// ── Shades ───────────────────────────────────────────────────────────────────

describe('deriveSubcategoryColors', () => {
  it('stops darkening at the floor, so a long list never fades to black', () => {
    // Found on the owner's tour (2026-09-27): «Da classificare» held 25 categories and, with no
    // floor, every node from the eighth on was painted #000000 — invisible on a dark theme.
    const shades = deriveSubcategoryColors('#94a3b8', 25);

    expect(shades[0]).toBe('#94a3b8');
    expect(shades).not.toContain('#000000');
    // The ramp reaches its floor at the fourth shade and stays there.
    expect(new Set(shades.slice(3)).size).toBe(1);
    expect(new Set(shades.slice(0, 4)).size).toBe(4);
  });
});

// ── 50/30/20 view ────────────────────────────────────────────────────────────

describe('buildSpendingRolesFlowData', () => {
  const PALETTE = { ...DEFAULT_SPENDING_ROLE_PALETTE, need: '#111111', want: '#222222', saving: '#333333', deficit: '#444444' };

  const CATEGORIES: SpendingRoleSource[] = [
    { id: 'cat-casa', type: 'fixed', spendingRole: 'need', subCategories: [{ id: 'sub-affitto', name: 'Affitto' }, { id: 'sub-utenze', name: 'Utenze' }] },
    {
      id: 'cat-abbonamenti',
      type: 'fixed',
      spendingRole: 'want',
      subCategories: [{ id: 'sub-wifi', name: 'WiFi', spendingRole: 'need' }, { id: 'sub-streaming', name: 'Streaming' }],
    },
    { id: 'cat-regali-spesa', type: 'variable', spendingRole: 'want', subCategories: [] },
    { id: 'cat-pac', type: 'variable', spendingRole: 'saving', subCategories: [] },
    { id: 'cat-altro', type: 'variable', subCategories: [] },
    { id: 'cat-stipendio', type: 'income', subCategories: [] },
    { id: 'cat-regali-entrata', type: 'income', subCategories: [] },
  ];

  const stipendio = (amount: number) => makeExpense({ type: 'income', amount, categoryId: 'cat-stipendio', categoryName: 'Stipendio' });
  const casa = (amount: number, subCategoryId = 'sub-affitto', subCategoryName = 'Affitto') =>
    makeExpense({ type: 'fixed', amount: -amount, categoryId: 'cat-casa', categoryName: 'Casa', subCategoryId, subCategoryName });
  const wifi = makeExpense({ type: 'fixed', amount: -30, categoryId: 'cat-abbonamenti', categoryName: 'Abbonamenti', subCategoryId: 'sub-wifi', subCategoryName: 'WiFi' });
  const streaming = makeExpense({ type: 'fixed', amount: -15, categoryId: 'cat-abbonamenti', categoryName: 'Abbonamenti', subCategoryId: 'sub-streaming', subCategoryName: 'Streaming' });

  /** Money into Budget equals money out of it — the balance summarizeSpendingRoles guarantees. */
  function assertBudgetBalanced(view: SankeyData): void {
    const budgetId = view.nodes.find((node) => view.index.get(node.id)?.kind === 'budget')!.id;
    const into = view.links.filter((link) => link.target === budgetId).reduce((sum, link) => sum + link.value, 0);
    const out = view.links.filter((link) => link.source === budgetId).reduce((sum, link) => sum + link.value, 0);
    expect(into).toBeCloseTo(out, 6);
  }

  const labelOf = (view: SankeyData, id: string) => view.nodes.find((node) => node.id === id)!.label;

  it('routes spending by role and ends the surplus in Risparmi', () => {
    const view = buildSpendingRolesFlowData(
      [stipendio(3000), casa(900), wifi, streaming, makeExpense({ type: 'variable', amount: -200, categoryId: 'cat-pac', categoryName: 'PAC' })],
      CATEGORIES,
      PALETTE
    );
    assertLinksResolve(view);
    assertAcyclic(view);
    assertBudgetBalanced(view);

    const out = Object.fromEntries(outgoingFrom(view, idOf(view, 'Budget')).map(([target, value]) => [labelOf(view, target), value]));
    // Risparmi = the PAC row (200) + the surplus (3000 − 1145 = 1855).
    expect(out).toEqual({ Necessità: 930, Desideri: 15, Risparmi: 2055 });
    expect(view.nodes.some((node) => node.label === DEFICIT_NODE_LABEL)).toBe(false);
  });

  it('draws an overspent period as «Coperto dal patrimonio» on the income side, with no Risparmi', () => {
    const view = buildSpendingRolesFlowData([stipendio(1000), casa(1200)], CATEGORIES, PALETTE);
    assertLinksResolve(view);
    assertAcyclic(view);
    assertBudgetBalanced(view);

    const deficit = idOf(view, DEFICIT_NODE_LABEL);
    expect(outgoingFrom(view, deficit)).toEqual([[idOf(view, 'Budget'), 200]]);
    expect(view.index.get(deficit)).toEqual({ kind: 'deficit' });
    expect(view.nodes.find((node) => node.id === deficit)!.nodeColor).toBe('#444444');
    expect(view.nodes.some((node) => node.label === 'Risparmi')).toBe(false);
  });

  it('keeps a category split by an override as one node per role, labels qualified by the role', () => {
    const view = buildSpendingRolesFlowData([stipendio(3000), wifi, streaming], CATEGORIES, PALETTE);
    assertLinksResolve(view);

    const need = idOf(view, 'Abbonamenti (Necessità)');
    const want = idOf(view, 'Abbonamenti (Desideri)');
    expect(need).not.toBe(want);
    expect(outgoingFrom(view, idOf(view, 'Necessità'))).toEqual([[need, 30]]);
    expect(outgoingFrom(view, idOf(view, 'Desideri'))).toEqual([[want, 15]]);
  });

  it('does not close a cycle when an income and a spending category share a name', () => {
    const view = buildSpendingRolesFlowData(
      [
        makeExpense({ type: 'income', amount: 500, categoryId: 'cat-regali-entrata', categoryName: 'Regali' }),
        makeExpense({ type: 'variable', amount: -80, categoryId: 'cat-regali-spesa', categoryName: 'Regali' }),
      ],
      CATEGORIES,
      PALETTE
    );
    assertLinksResolve(view);
    assertAcyclic(view);
    expect(view.nodes.map((node) => node.label)).toEqual(expect.arrayContaining(['Regali (Entrate)', 'Regali (Desideri)']));
  });

  it('gives unclassified spending its own node', () => {
    const view = buildSpendingRolesFlowData(
      [stipendio(500), makeExpense({ type: 'variable', amount: -40, categoryId: 'cat-altro', categoryName: 'Altro' })],
      CATEGORIES,
      PALETTE
    );
    const node = idOf(view, 'Da classificare');
    expect(view.index.get(node)).toEqual({ kind: 'spendingRole', bucket: 'unclassified' });
    expect(outgoingFrom(view, node)).toEqual([[idOf(view, 'Altro'), 40]]);
  });

  describe('same-named categories (found on the owner’s tour, 2026-09-27: «Casa (Da classificare)» twice)', () => {
    const SAME_NAME: SpendingRoleSource[] = [
      ...CATEGORIES,
      { id: 'cat-casa-fissa', type: 'fixed', subCategories: [] },
      { id: 'cat-casa-variabile', type: 'variable', subCategories: [] },
    ];
    const casaFissa = makeExpense({ type: 'fixed', amount: -700, categoryId: 'cat-casa-fissa', categoryName: 'Casa' });
    const casaVariabile = makeExpense({ type: 'variable', amount: -90, categoryId: 'cat-casa-variabile', categoryName: 'Casa' });

    const assertLabelsDistinct = (view: SankeyData): void => {
      const labels = view.nodes.map((node) => node.label);
      expect(new Set(labels).size, `duplicate labels: ${labels.join(', ')}`).toBe(labels.length);
    };

    it('tells two of them in ONE role apart by their type: the role they share says nothing', () => {
      const view = buildSpendingRolesFlowData([stipendio(3000), casaFissa, casaVariabile], SAME_NAME, PALETTE);
      assertLinksResolve(view);
      assertLabelsDistinct(view);
      expect(outgoingFrom(view, idOf(view, 'Da classificare'))).toEqual([
        [idOf(view, `Casa (${EXPENSE_TYPE_LABELS.fixed})`), 700],
        [idOf(view, `Casa (${EXPENSE_TYPE_LABELS.variable})`), 90],
      ]);
    });

    it('names the role AND the type when the name collides across both', () => {
      // «Casa» three times: a need (fixed), and twice unclassified (fixed and variable).
      const view = buildSpendingRolesFlowData([stipendio(3000), casa(900), casaFissa, casaVariabile], SAME_NAME, PALETTE);
      assertLinksResolve(view);
      assertLabelsDistinct(view);
      expect(view.nodes.map((node) => node.label)).toEqual(
        expect.arrayContaining([
          `Casa (Necessità · ${EXPENSE_TYPE_LABELS.fixed})`,
          `Casa (Da classificare · ${EXPENSE_TYPE_LABELS.fixed})`,
          `Casa (Da classificare · ${EXPENSE_TYPE_LABELS.variable})`,
        ])
      );
    });
  });

  it('colours a branch with its role, and a category node routes clicks by type and key', () => {
    const view = buildSpendingRolesFlowData([stipendio(3000), casa(900)], CATEGORIES, PALETTE);
    const casaId = idOf(view, 'Casa');
    expect(view.nodes.find((node) => node.id === casaId)!.nodeColor).toBe('#111111');
    expect(view.index.get(casaId)).toEqual({ kind: 'category', expenseType: 'fixed', categoryKey: 'cat-casa', categoryLabel: 'Casa' });
  });

  it('adds a subcategory layer under each role category', () => {
    const view = buildSpendingRolesFlowDataWithSubcategories(
      [stipendio(3000), casa(900), casa(100, 'sub-utenze', 'Utenze')],
      CATEGORIES,
      PALETTE
    );
    assertLinksResolve(view);
    assertAcyclic(view);
    assertBudgetBalanced(view);
    expect(outgoingFrom(view, idOf(view, 'Casa')).map(([, value]) => value).sort((a, b) => a - b)).toEqual([100, 900]);
  });

  it('opens only the largest categories across the roles, keeps the rest as leaves and folds extra subcategories', () => {
    // Eight unclassified categories with a breakdown (the two smallest stay leaves), one without
    // any subcategory (a leaf, never dropped), and the biggest with six subcategories («Altre 2»).
    const rows = [
      stipendio(20000),
      ...Array.from({ length: 8 }, (_, index) =>
        makeExpense({ type: 'variable', amount: -(index + 1) * 100, categoryId: `cat-${index}`, categoryName: `Categoria ${index}`, subCategoryId: `sub-${index}-a`, subCategoryName: `Sotto ${index} A` }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        makeExpense({ type: 'variable', amount: -10, categoryId: `cat-${index}`, categoryName: `Categoria ${index}`, subCategoryId: `sub-${index}-b`, subCategoryName: `Sotto ${index} B` }),
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        makeExpense({ type: 'variable', amount: -(index + 1), categoryId: 'cat-7', categoryName: 'Categoria 7', subCategoryId: `sub-7-extra-${index}`, subCategoryName: `Extra ${index}` }),
      ),
      makeExpense({ type: 'variable', amount: -2000, categoryId: 'cat-flat', categoryName: 'Senza sotto' }),
    ];

    const view = buildSpendingRolesFlowDataWithSubcategories(rows, CATEGORIES, PALETTE);

    expect(outgoingFrom(view, idOf(view, 'Senza sotto'))).toEqual([]);
    expect(outgoingFrom(view, idOf(view, 'Categoria 0'))).toEqual([]);
    expect(outgoingFrom(view, idOf(view, 'Categoria 1'))).toEqual([]);
    const opened = new Set(
      view.nodes
        .filter((node) => node.id.startsWith('rsub:') || node.id.startsWith('rsubrest:'))
        .map((node) => node.id.split(':').slice(2, 4).join(':')),
    );
    expect(opened.size).toBe(MAX_SUBCATEGORY_CATEGORIES);
    const out = outgoingFrom(view, idOf(view, 'Categoria 7'));
    expect(out).toHaveLength(MAX_SUBCATEGORIES + 1);
    const rest = view.nodes.find((node) => node.id.startsWith('rsubrest:') && node.id.endsWith(':cat-7'));
    expect(rest?.label).toBe('Altre 2');
    expect(out.find(([target]) => target === rest!.id)?.[1]).toBe(1 + 2);
    expect(view.index.get(rest!.id)).toMatchObject({ kind: 'category', categoryKey: 'cat-7' });
    assertLinksResolve(view);
    assertAcyclic(view);
    assertBudgetBalanced(view);
  });

  it('returns an empty view for a period with nothing in it', () => {
    expect(buildSpendingRolesFlowData([], CATEGORIES, PALETTE).nodes).toEqual([]);
  });

  it('nets a reversal of income on the income side, so Budget stays balanced', () => {
    // 3000 in, 500 of it reversed: the source is 2500, as in the reading and on Periodo.
    const view = buildSpendingRolesFlowData([stipendio(3000), stipendio(-500), casa(1000)], CATEGORIES, PALETTE);
    assertLinksResolve(view);
    assertBudgetBalanced(view);
    expect(outgoingFrom(view, idOf(view, 'Stipendio'))).toEqual([[idOf(view, 'Budget'), 2500]]);
  });

  it('draws nothing for a lone reversal of income', () => {
    expect(buildSpendingRolesFlowData([stipendio(-200)], CATEGORIES, PALETTE).nodes).toEqual([]);
  });

  it('covers the whole spending from the wealth when income nets negative, and no more', () => {
    // 100 in, 600 reversed: income is −500. The 1000 spent came from the wealth — 1000, not 1500.
    const view = buildSpendingRolesFlowData([stipendio(100), stipendio(-600), casa(1000)], CATEGORIES, PALETTE);
    assertLinksResolve(view);
    assertBudgetBalanced(view);
    expect(outgoingFrom(view, idOf(view, DEFICIT_NODE_LABEL))).toEqual([[idOf(view, 'Budget'), 1000]]);
    expect(view.nodes.some((node) => node.label === 'Stipendio')).toBe(false);
  });

  it('takes a category netting negative off the other income sources, largest first', () => {
    // Regali holds only a 300 reversal: income is 1700, so Stipendio's 2000 carries 1700 into
    // Budget, and 1000 spent leaves 700 in Risparmi.
    const view = buildSpendingRolesFlowData(
      [
        stipendio(2000),
        makeExpense({ type: 'income', amount: -300, categoryId: 'cat-regali-entrata', categoryName: 'Regali' }),
        casa(1000),
      ],
      CATEGORIES,
      PALETTE
    );
    assertLinksResolve(view);
    assertBudgetBalanced(view);
    expect(outgoingFrom(view, idOf(view, 'Stipendio'))).toEqual([[idOf(view, 'Budget'), 1700]]);
    expect(view.nodes.some((node) => node.label === DEFICIT_NODE_LABEL)).toBe(false);
    expect(outgoingFrom(view, idOf(view, 'Budget')).find(([target]) => labelOf(view, target) === 'Risparmi')?.[1]).toBe(700);
  });

  it('drops a source the reversal empties and keeps the rest ranked', () => {
    // Sources 800 and 500, a 900 reversal elsewhere: the 800 goes to 0, the 500 carries 400.
    const view = buildSpendingRolesFlowData(
      [
        stipendio(800),
        makeExpense({ type: 'income', amount: 500, categoryId: 'cat-bonus', categoryName: 'Bonus' }),
        makeExpense({ type: 'income', amount: -900, categoryId: 'cat-regali-entrata', categoryName: 'Regali' }),
        casa(1000),
      ],
      CATEGORIES,
      PALETTE
    );
    assertLinksResolve(view);
    assertBudgetBalanced(view);
    expect(view.nodes.some((node) => node.label === 'Stipendio')).toBe(false);
    expect(outgoingFrom(view, idOf(view, 'Bonus'))).toEqual([[idOf(view, 'Budget'), 400]]);
    expect(outgoingFrom(view, idOf(view, DEFICIT_NODE_LABEL))).toEqual([[idOf(view, 'Budget'), 600]]);
  });
});

describe('buildSpendingRoleDrillDownData', () => {
  const CATEGORIES: SpendingRoleSource[] = [
    { id: 'cat-out', type: 'variable', spendingRole: 'want', subCategories: [] },
    { id: 'cat-viaggi', type: 'variable', spendingRole: 'want', subCategories: [] },
  ];

  it('lists one role’s categories, largest first', () => {
    const view = buildSpendingRoleDrillDownData(
      [
        makeExpense({ type: 'variable', amount: -50, categoryId: 'cat-out', categoryName: 'Out' }),
        makeExpense({ type: 'variable', amount: -400, categoryId: 'cat-viaggi', categoryName: 'Viaggi' }),
      ],
      CATEGORIES,
      'want',
      '#222222'
    );
    assertLinksResolve(view);
    expect(outgoingFrom(view, idOf(view, 'Desideri')).map(([, value]) => value)).toEqual([400, 50]);
  });

  it('is empty for Risparmi made only of surplus', () => {
    const view = buildSpendingRoleDrillDownData(
      [makeExpense({ type: 'income', amount: 1000, categoryId: 'x', categoryName: 'Stipendio' })],
      CATEGORIES,
      'saving',
      '#333333'
    );
    expect(view.nodes).toEqual([]);
  });
});

describe('buildSpendingRolesFlowData — the type view’s colours on income and Budget', () => {
  it('paints income sources and Budget exactly as buildBudgetFlowData does', () => {
    const rows = [
      makeExpense({ type: 'income', amount: 3000, categoryId: 'i1', categoryName: 'Stipendio' }),
      makeExpense({ type: 'income', amount: 200, categoryId: 'i2', categoryName: 'Cedole' }),
      makeExpense({ type: 'fixed', amount: -900, categoryId: 'f1', categoryName: 'Casa' }),
    ];
    const colours = (view: SankeyView) =>
      Object.fromEntries(
        view.nodes
          .filter((node) => ['Stipendio', 'Cedole', 'Budget'].includes(node.label))
          .map((node) => [node.label, node.nodeColor])
      );
    expect(colours(buildSpendingRolesFlowData(rows, [], DEFAULT_SPENDING_ROLE_PALETTE))).toEqual(
      colours(buildBudgetFlowData(rows))
    );
  });
});
