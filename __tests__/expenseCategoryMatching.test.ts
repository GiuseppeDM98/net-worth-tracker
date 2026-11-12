import { describe, expect, it } from 'vitest';
import { resolveEquivalentCategory } from '@/lib/utils/expenseCategoryMatching';
import { ExpenseCategory, ExpenseType } from '@/types/expenses';

function makeCategory(
  overrides: Partial<ExpenseCategory> & { id: string; name: string; type: ExpenseType }
): ExpenseCategory {
  return {
    userId: 'u1',
    subCategories: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  } as ExpenseCategory;
}

const casaFixed = makeCategory({
  id: 'cat-casa-fixed',
  name: 'Casa',
  type: 'fixed',
  subCategories: [
    { id: 'sub-luce-fixed', name: 'Elettricità' },
    { id: 'sub-gas-fixed', name: 'Gas' },
  ],
});

const casaVariable = makeCategory({
  id: 'cat-casa-var',
  name: 'Casa',
  type: 'variable',
  subCategories: [{ id: 'sub-luce-var', name: 'Elettricità' }],
});

const cibo = makeCategory({ id: 'cat-cibo', name: 'Cibo', type: 'variable' });

describe('resolveEquivalentCategory', () => {
  it('should find the same-named category under the target type', () => {
    // Act
    const match = resolveEquivalentCategory([casaFixed, casaVariable, cibo], 'cat-casa-fixed', undefined, 'variable');

    // Assert
    expect(match).toEqual({ categoryId: 'cat-casa-var', subCategoryId: '' });
  });

  it('should carry the subcategory over when its name matches too', () => {
    // Act
    const match = resolveEquivalentCategory(
      [casaFixed, casaVariable, cibo],
      'cat-casa-fixed',
      'sub-luce-fixed',
      'variable'
    );

    // Assert
    expect(match).toEqual({ categoryId: 'cat-casa-var', subCategoryId: 'sub-luce-var' });
  });

  it('should keep the category and drop the subcategory when only the latter is missing', () => {
    // Act — the variable Casa has no "Gas"
    const match = resolveEquivalentCategory(
      [casaFixed, casaVariable, cibo],
      'cat-casa-fixed',
      'sub-gas-fixed',
      'variable'
    );

    // Assert
    expect(match).toEqual({ categoryId: 'cat-casa-var', subCategoryId: '' });
  });

  it('should ignore case and surrounding whitespace', () => {
    // Arrange
    const messy = makeCategory({ id: 'cat-casa-debt', name: '  CASA ', type: 'debt' });

    // Act
    const match = resolveEquivalentCategory([casaFixed, messy], 'cat-casa-fixed', undefined, 'debt');

    // Assert
    expect(match).toEqual({ categoryId: 'cat-casa-debt', subCategoryId: '' });
  });

  it('should return null when no category of the target type shares the name', () => {
    // Act
    const match = resolveEquivalentCategory([casaFixed, cibo], 'cat-casa-fixed', undefined, 'income');

    // Assert
    expect(match).toBeNull();
  });

  it('should return null when the current category is not in the list', () => {
    // Act
    const match = resolveEquivalentCategory([casaFixed, casaVariable], 'cat-ghost', undefined, 'variable');

    // Assert
    expect(match).toBeNull();
  });

  it('should not match the category against itself', () => {
    // Act — asking for the type it already has finds itself, which is a no-op the caller
    // never triggers (the dialog only calls this when the type actually changed)
    const match = resolveEquivalentCategory([casaFixed, casaVariable], 'cat-casa-fixed', undefined, 'fixed');

    // Assert
    expect(match).toEqual({ categoryId: 'cat-casa-fixed', subCategoryId: '' });
  });

  it('should tolerate a category document with no subcategories array', () => {
    // Arrange — legacy documents predate the field
    const legacy = { id: 'cat-legacy', name: 'Casa', type: 'debt', userId: 'u1' } as unknown as ExpenseCategory;

    // Act
    const match = resolveEquivalentCategory([casaFixed, legacy], 'cat-casa-fixed', 'sub-luce-fixed', 'debt');

    // Assert
    expect(match).toEqual({ categoryId: 'cat-legacy', subCategoryId: '' });
  });
});

import { categoryMatchKey } from '@/lib/utils/expenseCategoryMatching';

describe('categoryMatchKey', () => {
  it('is the type and the trimmed, lowercased name: one key per (name, type)', () => {
    expect(categoryMatchKey('  Vasi Ornitorinco ', 'variable')).toBe('variable::vasi ornitorinco');
    expect(categoryMatchKey('Casa', 'fixed')).not.toBe(categoryMatchKey('Casa', 'variable'));
  });
});
