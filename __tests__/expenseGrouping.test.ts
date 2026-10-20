import { describe, expect, it } from 'vitest';
import {
  getCategoryKey,
  getCategoryName,
  getSubCategoryKey,
  getSubCategoryLabel,
  resolveDisplayLabels,
} from '@/lib/utils/expenseGrouping';
import {
  Expense,
  ExpenseType,
  NO_SUBCATEGORY_KEY,
  NO_SUBCATEGORY_LABEL,
  UNCATEGORIZED_LABEL,
} from '@/types/expenses';

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

describe('getCategoryKey', () => {
  it('should key by category id when one is present', () => {
    // Arrange
    const expense = makeExpense({ type: 'fixed', amount: -100, categoryId: 'cat-casa', categoryName: 'Casa' });

    // Act
    const key = getCategoryKey(expense);

    // Assert
    expect(key).toBe('cat-casa');
  });

  it('should give two same-named categories two different keys', () => {
    // Arrange
    const fixedCasa = makeExpense({ type: 'fixed', amount: -100, categoryId: 'cat-casa-fixed', categoryName: 'Casa' });
    const variableCasa = makeExpense({ type: 'variable', amount: -40, categoryId: 'cat-casa-var', categoryName: 'Casa' });

    // Act
    const keys = [getCategoryKey(fixedCasa), getCategoryKey(variableCasa)];

    // Assert
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('should fall back to the trimmed name when the id is blank', () => {
    // Arrange
    const expense = makeExpense({ type: 'fixed', amount: -100, categoryId: '   ', categoryName: '  Casa  ' });

    // Act
    const key = getCategoryKey(expense);

    // Assert
    expect(key).toBe('Casa');
  });

  it('should fall back to the uncategorized sentinel when both id and name are blank', () => {
    // Arrange
    const expense = makeExpense({ type: 'fixed', amount: -100, categoryId: '', categoryName: '' });

    // Act
    const key = getCategoryKey(expense);

    // Assert
    expect(key).toBe(UNCATEGORIZED_LABEL);
  });
});

describe('getCategoryName', () => {
  it('should trim the stored name', () => {
    // Arrange
    const expense = makeExpense({ type: 'fixed', amount: -100, categoryName: '  Casa  ' });

    // Act
    const name = getCategoryName(expense);

    // Assert
    expect(name).toBe('Casa');
  });

  it('should return the uncategorized sentinel when the name is missing', () => {
    // Arrange
    const expense = makeExpense({ type: 'fixed', amount: -100, categoryName: '' });

    // Act
    const name = getCategoryName(expense);

    // Assert
    expect(name).toBe(UNCATEGORIZED_LABEL);
  });
});

describe('getSubCategoryKey', () => {
  it('should key by subcategory id when one is present', () => {
    // Arrange
    const expense = makeExpense({ type: 'fixed', amount: -100, subCategoryId: 'sub-luce' });

    // Act
    const key = getSubCategoryKey(expense);

    // Assert
    expect(key).toBe('sub-luce');
  });

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['whitespace only', '   '],
  ])('should map %s to the no-subcategory sentinel', (_label, subCategoryId) => {
    // Arrange
    const expense = makeExpense({ type: 'fixed', amount: -100, subCategoryId });

    // Act
    const key = getSubCategoryKey(expense);

    // Assert
    expect(key).toBe(NO_SUBCATEGORY_KEY);
  });
});

describe('getSubCategoryLabel', () => {
  it('should return the trimmed subcategory name', () => {
    // Arrange
    const expense = makeExpense({
      type: 'fixed',
      amount: -100,
      subCategoryId: 'sub-luce',
      subCategoryName: '  Elettricità  ',
    });

    // Act
    const label = getSubCategoryLabel(expense);

    // Assert
    expect(label).toBe('Elettricità');
  });

  it('should return the sentinel label when the row carries no subcategory', () => {
    // Arrange
    const expense = makeExpense({ type: 'fixed', amount: -100 });

    // Act
    const label = getSubCategoryLabel(expense);

    // Assert
    expect(label).toBe(NO_SUBCATEGORY_LABEL);
  });

  it('should return the sentinel label when the id is present but the name is blank', () => {
    // Arrange
    const expense = makeExpense({ type: 'fixed', amount: -100, subCategoryId: 'sub-orphan', subCategoryName: '  ' });

    // Act
    const label = getSubCategoryLabel(expense);

    // Assert
    expect(label).toBe(NO_SUBCATEGORY_LABEL);
  });
});

describe('resolveDisplayLabels', () => {
  it('should leave unique names untouched', () => {
    // Arrange
    const groups = [
      { key: 'cat-casa', name: 'Casa', qualifier: 'Spese Necessarie' },
      { key: 'cat-cibo', name: 'Cibo', qualifier: 'Spese Non Necessarie' },
    ];

    // Act
    const labels = resolveDisplayLabels(groups);

    // Assert
    expect(labels.get('cat-casa')).toBe('Casa');
    expect(labels.get('cat-cibo')).toBe('Cibo');
  });

  it('should qualify only the colliding name, leaving its neighbours plain', () => {
    // Arrange
    const groups = [
      { key: 'cat-casa-fixed', name: 'Casa', qualifier: 'Spese Necessarie' },
      { key: 'cat-casa-var', name: 'Casa', qualifier: 'Spese Non Necessarie' },
      { key: 'cat-cibo', name: 'Cibo', qualifier: 'Spese Non Necessarie' },
    ];

    // Act
    const labels = resolveDisplayLabels(groups);

    // Assert
    expect(labels.get('cat-casa-fixed')).toBe('Casa (Spese Necessarie)');
    expect(labels.get('cat-casa-var')).toBe('Casa (Spese Non Necessarie)');
    expect(labels.get('cat-cibo')).toBe('Cibo');
  });

  it('should not treat repeated entries of one key as a collision', () => {
    // Arrange — the same group listed twice, as a caller building per-row would produce
    const groups = [
      { key: 'cat-casa', name: 'Casa', qualifier: 'Spese Necessarie' },
      { key: 'cat-casa', name: 'Casa', qualifier: 'Spese Necessarie' },
    ];

    // Act
    const labels = resolveDisplayLabels(groups);

    // Assert
    expect(labels.get('cat-casa')).toBe('Casa');
  });

  it('should keep both keys when name and qualifier are identical', () => {
    // Arrange — nothing enforces uniqueness even within one type
    const groups = [
      { key: 'cat-casa-a', name: 'Casa', qualifier: 'Spese Necessarie' },
      { key: 'cat-casa-b', name: 'Casa', qualifier: 'Spese Necessarie' },
    ];

    // Act
    const labels = resolveDisplayLabels(groups);

    // Assert
    expect(labels.size).toBe(2);
    expect(labels.get('cat-casa-a')).toBe('Casa (Spese Necessarie)');
    expect(labels.get('cat-casa-b')).toBe('Casa (Spese Necessarie)');
  });

  it('should fall back to the plain name when a colliding group has no qualifier', () => {
    // Arrange
    const groups = [
      { key: 'sub-a', name: 'Manutenzione' },
      { key: 'sub-b', name: 'Manutenzione' },
    ];

    // Act
    const labels = resolveDisplayLabels(groups);

    // Assert
    expect(labels.get('sub-a')).toBe('Manutenzione');
    expect(labels.get('sub-b')).toBe('Manutenzione');
  });

  it('should return an empty map for no groups', () => {
    // Arrange / Act
    const labels = resolveDisplayLabels([]);

    // Assert
    expect(labels.size).toBe(0);
  });
});
