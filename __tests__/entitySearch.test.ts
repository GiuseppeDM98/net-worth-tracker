import { describe, expect, it } from 'vitest';
import { buildEntitySearchIndex, searchEntities } from '@/lib/utils/entitySearch';
import { Expense, ExpenseCategory, ExpenseType, NO_SUBCATEGORY_KEY } from '@/types/expenses';

function makeCategory(
  overrides: Partial<ExpenseCategory> & { id: string; name: string; type: ExpenseType }
): ExpenseCategory {
  return {
    userId: 'u1',
    subCategories: [],
    // Fixture dates are constructed locally with new Date(year, monthIndex, day),
    // so they are TZ-safe by construction; the module never reads them anyway.
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    ...overrides,
  };
}

/** Expense fixtures always take an EXPLICIT type — classification is by type, never by sign. */
function makeExpense(overrides: Partial<Expense> & { type: ExpenseType; amount: number }): Expense {
  return {
    id: 'e1',
    userId: 'u1',
    categoryId: 'cat-casa',
    categoryName: 'Casa',
    currency: 'EUR',
    date: new Date(2026, 5, 15),
    createdAt: new Date(2026, 5, 15),
    updatedAt: new Date(2026, 5, 15),
    ...overrides,
  } as Expense;
}

describe('buildEntitySearchIndex', () => {
  it('should index every taxonomy category and subcategory, including ones with zero expenses', () => {
    // Arrange
    const categories = [
      makeCategory({
        id: 'cat-casa',
        name: 'Casa',
        type: 'fixed',
        subCategories: [
          { id: 'sub-cond', name: 'Condominio' },
          { id: 'sub-elet', name: 'Elettricità' },
        ],
      }),
    ];

    // Act — no expenses at all: the taxonomy alone populates the index
    const index = buildEntitySearchIndex(categories, []);

    // Assert
    expect(index.map((item) => item.id)).toEqual([
      'fixed:cat-casa',
      'fixed:cat-casa:sub-cond',
      'fixed:cat-casa:sub-elet',
    ]);
    const condominio = index.find((item) => item.id === 'fixed:cat-casa:sub-cond');
    expect(condominio?.label).toBe('Condominio');
    expect(condominio?.parentLabel).toBe('Casa');
    expect(condominio?.qualifier).toBe('Spese Fisse');
    expect(condominio?.target).toEqual({ expenseType: 'fixed', categoryKey: 'cat-casa', subCategoryKey: 'sub-cond' });
  });

  it('should give two same-named categories under different types two entries told apart by qualifier', () => {
    // Arrange — two distinct documents that merely share the name "Casa"
    const categories = [
      makeCategory({ id: 'cat-casa-fixed', name: 'Casa', type: 'fixed' }),
      makeCategory({ id: 'cat-casa-var', name: 'Casa', type: 'variable' }),
    ];

    // Act
    const index = buildEntitySearchIndex(categories, []);

    // Assert — keyed by id, so neither swallows the other
    expect(index).toHaveLength(2);
    expect(index.map((item) => [item.id, item.label, item.qualifier])).toEqual([
      ['fixed:cat-casa-fixed', 'Casa', 'Spese Fisse'],
      ['variable:cat-casa-var', 'Casa', 'Spese Variabili'],
    ]);
  });

  it('should exclude transfer categories and transfer rows from the index entirely', () => {
    // Arrange — every account has a transfer category (ensureTransferCategory), and
    // transfer rows are near-universal; neither may become a searchable "entity",
    // because transfers are net-zero and excluded from every Analisi metric.
    const categories = [
      makeCategory({
        id: 'cat-giroconto',
        name: 'Giroconto',
        type: 'transfer',
        subCategories: [{ id: 'sub-x', name: 'Interno' }],
      }),
      makeCategory({ id: 'cat-casa', name: 'Casa', type: 'fixed' }),
    ];
    const expenses = [
      makeExpense({ type: 'transfer', amount: 500, categoryId: 'cat-legacy-giro', categoryName: 'Giro Vecchio' }),
      makeExpense({ type: 'fixed', amount: -100, categoryId: 'cat-casa', categoryName: 'Casa' }),
    ];

    // Act
    const index = buildEntitySearchIndex(categories, expenses);

    // Assert — only the spending category survives; no transfer entry from either source
    expect(index.map((item) => item.id)).toEqual(['fixed:cat-casa']);
  });

  it('should add a name-keyed entry for a legacy expense whose categoryId is missing', () => {
    // Arrange — legacy import: no categoryId, only the denormalized name survives
    const expenses = [
      makeExpense({ type: 'variable', amount: -40, categoryId: '', categoryName: 'Vecchia Palestra' }),
    ];

    // Act
    const index = buildEntitySearchIndex([], expenses);

    // Assert — the key falls back to the name itself, matching getCategoryKey
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('variable:Vecchia Palestra');
    expect(index[0].label).toBe('Vecchia Palestra');
    expect(index[0].target).toEqual({ expenseType: 'variable', categoryKey: 'Vecchia Palestra' });
  });

  it('should add an entry for a stale categoryId absent from the taxonomy', () => {
    // Arrange — the category document was deleted; the row still points at its id
    const categories = [makeCategory({ id: 'cat-casa', name: 'Casa', type: 'fixed' })];
    const expenses = [makeExpense({ type: 'variable', amount: -25, categoryId: 'cat-gone', categoryName: 'Sport' })];

    // Act
    const index = buildEntitySearchIndex(categories, expenses);

    // Assert
    const stale = index.find((item) => item.id === 'variable:cat-gone');
    expect(stale?.label).toBe('Sport');
    expect(index).toHaveLength(2);
  });

  it('should not duplicate a taxonomy category referenced by expenses, and let the taxonomy name win', () => {
    // Arrange — the denormalized name is stale; the taxonomy is the fresher source
    const categories = [makeCategory({ id: 'cat-casa', name: 'Casa', type: 'fixed' })];
    const expenses = [
      makeExpense({ type: 'fixed', amount: -800, categoryId: 'cat-casa', categoryName: 'Casa Vecchia' }),
      makeExpense({ type: 'fixed', amount: -100, categoryId: 'cat-casa', categoryName: 'Casa Vecchia' }),
    ];

    // Act
    const index = buildEntitySearchIndex(categories, expenses);

    // Assert
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe('fixed:cat-casa');
    expect(index[0].label).toBe('Casa');
  });

  it('should add a subcategory present on rows but missing from its category taxonomy', () => {
    // Arrange
    const categories = [
      makeCategory({
        id: 'cat-casa',
        name: 'Casa',
        type: 'fixed',
        subCategories: [{ id: 'sub-cond', name: 'Condominio' }],
      }),
    ];
    const expenses = [
      makeExpense({
        type: 'fixed',
        amount: -60,
        categoryId: 'cat-casa',
        categoryName: 'Casa Vecchia',
        subCategoryId: 'sub-gone',
        subCategoryName: 'Giardino',
      }),
    ];

    // Act
    const index = buildEntitySearchIndex(categories, expenses);

    // Assert — findable under its parent, whose taxonomy name is preferred
    const giardino = index.find((item) => item.id === 'fixed:cat-casa:sub-gone');
    expect(giardino?.label).toBe('Giardino');
    expect(giardino?.parentLabel).toBe('Casa');
    expect(giardino?.target).toEqual({ expenseType: 'fixed', categoryKey: 'cat-casa', subCategoryKey: 'sub-gone' });
  });

  it('should never index the senza sottocategoria bucket', () => {
    // Arrange — rows with no subcategory, under both a taxonomy and a legacy category
    const categories = [makeCategory({ id: 'cat-casa', name: 'Casa', type: 'fixed' })];
    const expenses = [
      makeExpense({ type: 'fixed', amount: -800, categoryId: 'cat-casa', categoryName: 'Casa' }),
      makeExpense({ type: 'variable', amount: -40, categoryId: '', categoryName: 'Vecchia Palestra' }),
    ];

    // Act
    const index = buildEntitySearchIndex(categories, expenses);

    // Assert — that bucket is reached by drilling, not by name
    expect(index.some((item) => item.target.subCategoryKey === NO_SUBCATEGORY_KEY)).toBe(false);
    expect(index.map((item) => item.id)).toEqual(['fixed:cat-casa', 'variable:Vecchia Palestra']);
  });
});

describe('searchEntities', () => {
  it('should rank a label-prefix match above one that only matches through the parent', () => {
    // Arrange — "Acqua" matches "cond" only via its parent "Condominio Mare"
    const index = buildEntitySearchIndex(
      [
        makeCategory({
          id: 'cat-casa',
          name: 'Casa',
          type: 'fixed',
          subCategories: [{ id: 'sub-cond', name: 'Condominio' }],
        }),
        makeCategory({
          id: 'cat-mare',
          name: 'Condominio Mare',
          type: 'variable',
          subCategories: [{ id: 'sub-acqua', name: 'Acqua' }],
        }),
      ],
      []
    );

    // Act
    const results = searchEntities(index, 'cond');

    // Assert — prefix matches first (shorter label winning the tie), parent-only match last
    expect(results.map((item) => item.label)).toEqual(['Condominio', 'Condominio Mare', 'Acqua']);
  });

  it('should rank label prefix, then label substring, then qualifier-only matches', () => {
    // Arrange — "Casa" (fixed) matches "spese" only through its qualifier "Spese Fisse"
    const index = buildEntitySearchIndex(
      [
        makeCategory({ id: 'cat-med', name: 'Spese Mediche', type: 'variable' }),
        makeCategory({ id: 'cat-altre', name: 'Altre Spese', type: 'variable' }),
        makeCategory({ id: 'cat-casa', name: 'Casa', type: 'fixed' }),
      ],
      []
    );

    // Act
    const results = searchEntities(index, 'spese');

    // Assert
    expect(results.map((item) => item.label)).toEqual(['Spese Mediche', 'Altre Spese', 'Casa']);
  });

  it('should match accented and unaccented queries alike', () => {
    // Arrange
    const index = buildEntitySearchIndex(
      [
        makeCategory({
          id: 'cat-casa',
          name: 'Casa',
          type: 'fixed',
          subCategories: [{ id: 'sub-elet', name: 'Elettricità' }],
        }),
      ],
      []
    );

    // Act
    const accented = searchEntities(index, 'elettricità');
    const unaccented = searchEntities(index, 'elettricita');

    // Assert
    expect(accented.map((item) => item.label)).toEqual(['Elettricità']);
    expect(unaccented.map((item) => item.label)).toEqual(['Elettricità']);
  });

  it('should require every token of the query to match', () => {
    // Arrange — two "Casa" documents; the second token discriminates by qualifier
    const index = buildEntitySearchIndex(
      [
        makeCategory({ id: 'cat-casa-fixed', name: 'Casa', type: 'fixed' }),
        makeCategory({ id: 'cat-casa-var', name: 'Casa', type: 'variable' }),
      ],
      []
    );

    // Act
    const results = searchEntities(index, 'casa fisse');

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('fixed:cat-casa-fixed');
    expect(results[0].qualifier).toBe('Spese Fisse');
  });

  it('should default the limit to 8, honor an explicit one, and break ties alphabetically', () => {
    // Arrange — ten equal-rank, equal-length labels, inserted out of order
    const letters = ['J', 'C', 'A', 'F', 'B', 'H', 'D', 'G', 'E', 'I'];
    const index = buildEntitySearchIndex(
      letters.map((letter) => makeCategory({ id: `cat-${letter}`, name: `Cat ${letter}`, type: 'variable' })),
      []
    );

    // Act
    const defaulted = searchEntities(index, 'cat');
    const limited = searchEntities(index, 'cat', 3);

    // Assert
    expect(defaulted).toHaveLength(8);
    expect(defaulted.map((item) => item.label)).toEqual([
      'Cat A',
      'Cat B',
      'Cat C',
      'Cat D',
      'Cat E',
      'Cat F',
      'Cat G',
      'Cat H',
    ]);
    expect(limited.map((item) => item.label)).toEqual(['Cat A', 'Cat B', 'Cat C']);
  });

  it('should match everything with an empty query so the combobox has entries before typing', () => {
    // Arrange
    const index = buildEntitySearchIndex(
      [
        makeCategory({ id: 'cat-casa', name: 'Casa', type: 'fixed' }),
        makeCategory({ id: 'cat-cibo', name: 'Cibo', type: 'variable' }),
      ],
      []
    );

    // Act
    const results = searchEntities(index, '   ');

    // Assert — deterministic order: shorter label first, then alphabetical
    expect(results.map((item) => item.label)).toEqual(['Casa', 'Cibo']);
  });
});
