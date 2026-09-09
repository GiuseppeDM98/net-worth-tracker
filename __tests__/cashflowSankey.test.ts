import { describe, expect, it } from 'vitest';
import {
  buildBudgetFlowData,
  buildBudgetFlowDataWithSubcategories,
  buildTypeDrillDownData,
  TYPE_COLORS,
  type SankeyView,
} from '@/lib/utils/cashflowSankey';
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
    const view = buildBudgetFlowData(twoCasa, false);

    // Assert
    assertLinksResolve(view);
  });

  it('should keep each type branch on its own amount instead of merging them', () => {
    // Act
    const view = buildBudgetFlowData(twoCasa, false);
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
    const view = buildBudgetFlowData(twoCasa, false);
    const labels = view.nodes.map((node) => node.label);

    // Assert
    expect(labels).toContain('Casa (Spese Fisse)');
    expect(labels).toContain('Casa (Spese Variabili)');
  });

  it('should leave a name that does not collide unqualified', () => {
    // Arrange
    const expenses = [
      makeExpense({ type: 'fixed', amount: -300, categoryId: 'cat-casa', categoryName: 'Casa' }),
      makeExpense({ type: 'variable', amount: -100, categoryId: 'cat-cibo', categoryName: 'Cibo' }),
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const view = buildBudgetFlowData(expenses, false);
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
    const view = buildBudgetFlowData(expenses, false);

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
    const view = buildBudgetFlowData(expenses, false);

    // Assert
    assertLinksResolve(view);
    assertAcyclic(view);
  });
});

describe('buildBudgetFlowData — budget arithmetic', () => {
  it('should route income into Budget and out to the types plus savings', () => {
    // Act
    const view = buildBudgetFlowData(twoCasa, false);
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
    const view = buildBudgetFlowData(expenses, false);

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
    const view = buildBudgetFlowData(expenses, false);

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
    const view = buildBudgetFlowDataWithSubcategories(withSubcategories, false);

    // Assert
    assertLinksResolve(view);
    assertAcyclic(view);
  });

  it('should not let one category swallow the other subcategory list', () => {
    // Act
    const view = buildBudgetFlowDataWithSubcategories(withSubcategories, false);
    const [[fixedCasa]] = outgoingFrom(view, idOf(view, FIXED));
    const [[variableCasa]] = outgoingFrom(view, idOf(view, VARIABLE));

    // Assert — today the flat name-keyed map means the variable Casa overwrites the
    // fixed one, so Elettricità and Gas disappear from the chart entirely.
    expect(outgoingFrom(view, fixedCasa).map(([, value]) => value).sort()).toEqual([100, 200]);
    expect(outgoingFrom(view, variableCasa).map(([, value]) => value)).toEqual([150]);
  });

  it('should label the subcategories of both categories', () => {
    // Act
    const view = buildBudgetFlowDataWithSubcategories(withSubcategories, false);
    const labels = view.nodes.map((node) => node.label);

    // Assert
    expect(labels).toContain('Elettricità');
    expect(labels).toContain('Gas');
    expect(labels).toContain('Arredamento');
  });

  it('should drop a category whose rows carry no subcategory at all', () => {
    // Arrange — a subcategory layer that just repeats the category is not a breakdown
    const expenses = [
      makeExpense({ type: 'fixed', amount: -200, categoryId: 'cat-bare', categoryName: 'Assicurazione' }),
      makeExpense({ type: 'income', amount: 2000, categoryId: 'cat-stip', categoryName: 'Stipendio' }),
    ];

    // Act
    const view = buildBudgetFlowDataWithSubcategories(expenses, false);

    // Assert
    expect(view.nodes.some((node) => node.label === 'Assicurazione')).toBe(false);
    assertLinksResolve(view);
    assertAcyclic(view);
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
    const view = buildBudgetFlowDataWithSubcategories(expenses, false);

    // Assert
    expect(view.nodes.map((node) => node.label)).toContain(NO_SUBCATEGORY_LABEL);
    assertLinksResolve(view);
  });

  it('should keep every link resolvable after mobile top-N slicing', () => {
    // Arrange — mobile keeps 3 categories per type and 4 subcategories per category,
    // which is where dangling nodes appear if the node and link filters disagree.
    const many = Array.from({ length: 6 }, (_, index) =>
      makeExpense({
        type: 'variable',
        amount: -(index + 1) * 10,
        categoryId: `cat-${index}`,
        categoryName: `Categoria ${index}`,
        subCategoryId: `sub-${index}`,
        subCategoryName: `Sotto ${index}`,
      })
    );

    // Act
    const view = buildBudgetFlowDataWithSubcategories(
      [...many, makeExpense({ type: 'income', amount: 5000, categoryId: 'cat-stip', categoryName: 'Stipendio' })],
      true
    );

    // Assert
    assertLinksResolve(view);
    assertAcyclic(view);
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
      ],
      false
    );

    // Assert — no node without a descriptor, no descriptor without a node
    expect(view.index.size).toBe(view.nodes.length);
    for (const node of view.nodes) {
      expect(view.index.has(node.id), `no descriptor for ${node.id}`).toBe(true);
    }
  });

  it('should tag each node with what it actually is', () => {
    // Act
    const view = buildBudgetFlowData(twoCasa, false);

    // Assert
    expect(view.index.get(idOf(view, 'Budget'))).toEqual({ kind: 'budget' });
    expect(view.index.get(idOf(view, 'Risparmi'))).toEqual({ kind: 'savings' });
    expect(view.index.get(idOf(view, FIXED))).toEqual({ kind: 'expenseType', expenseType: 'fixed' });
    expect(view.index.get(idOf(view, 'Casa (Spese Fisse)'))).toEqual({
      kind: 'category',
      expenseType: 'fixed',
      categoryKey: 'cat-casa-fixed',
      categoryLabel: 'Casa (Spese Fisse)',
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
    const view = buildBudgetFlowDataWithSubcategories(expenses, false);

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
    const view = buildTypeDrillDownData(expenses, 'fixed', TYPE_COLORS.fixed, false);

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
    const view = buildTypeDrillDownData(expenses, 'fixed', TYPE_COLORS.fixed, false);

    // Assert
    expect(view.links).toHaveLength(1);
    expect(view.links[0].value).toBe(300);
  });

  it('should return an empty view for a type with no rows', () => {
    // Act
    const view = buildTypeDrillDownData([], 'debt', TYPE_COLORS.debt, false);

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
    const view = buildTypeDrillDownData(expenses, 'fixed', TYPE_COLORS.fixed, false);

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
