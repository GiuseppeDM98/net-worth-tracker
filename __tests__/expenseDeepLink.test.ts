import { describe, expect, it } from 'vitest';
import type { ExpenseCategory } from '@/types/expenses';
import {
  parseDeepLinkAmount,
  parseExpenseDeepLinkRequest,
  resolveDeepLinkCategory,
  toExpenseDeepLinkDraft,
} from '@/lib/utils/expenseDeepLink';

function reader(params: Record<string, string>) {
  return (name: string) => params[name] ?? null;
}

function category(id: string, name: string, type: 'variable' | 'fixed' | 'income' | 'transfer'): ExpenseCategory {
  return {
    id,
    userId: 'u1',
    name,
    type,
    subCategories: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('parseExpenseDeepLinkRequest', () => {
  it('returns null without nuova-spesa=1', () => {
    expect(parseExpenseDeepLinkRequest(reader({}))).toBeNull();
    expect(parseExpenseDeepLinkRequest(reader({ 'nuova-spesa': '0' }))).toBeNull();
    expect(parseExpenseDeepLinkRequest(reader({ importo: '12.50' }))).toBeNull();
  });

  it('parses amount, notes and category', () => {
    expect(
      parseExpenseDeepLinkRequest(
        reader({ 'nuova-spesa': '1', importo: '12.50', nota: 'Bar Centrale', categoria: 'Alimentari' }),
      ),
    ).toEqual({ amount: 12.5, notes: 'Bar Centrale', categoryName: 'Alimentari' });
  });

  it('accepts the Italian decimal comma', () => {
    expect(
      parseExpenseDeepLinkRequest(reader({ 'nuova-spesa': '1', importo: '12,50' }))?.amount,
    ).toBe(12.5);
  });

  it('drops a malformed amount but keeps the rest', () => {
    const parsed = parseExpenseDeepLinkRequest(
      reader({ 'nuova-spesa': '1', importo: 'dodici', nota: 'Bar' }),
    );
    expect(parsed?.amount).toBeUndefined();
    expect(parsed?.notes).toBe('Bar');
  });

  it('returns an empty request when only the flag is present', () => {
    expect(parseExpenseDeepLinkRequest(reader({ 'nuova-spesa': '1' }))).toEqual({});
  });
});

describe('parseDeepLinkAmount', () => {
  it('accepts plain decimals with dot or comma', () => {
    expect(parseDeepLinkAmount('12.50')).toBe(12.5);
    expect(parseDeepLinkAmount('12,5')).toBe(12.5);
    expect(parseDeepLinkAmount('7')).toBe(7);
    expect(parseDeepLinkAmount(' 12,50 €')).toBe(12.5);
  });

  it('rejects zero, negatives, thousands and words', () => {
    expect(parseDeepLinkAmount('0')).toBeUndefined();
    expect(parseDeepLinkAmount('0,00')).toBeUndefined();
    expect(parseDeepLinkAmount('-5')).toBeUndefined();
    expect(parseDeepLinkAmount('1.200,50')).toBeUndefined();
    expect(parseDeepLinkAmount('12.345')).toBeUndefined();
    expect(parseDeepLinkAmount('dodici')).toBeUndefined();
    expect(parseDeepLinkAmount('')).toBeUndefined();
    expect(parseDeepLinkAmount(null)).toBeUndefined();
  });
});

describe('resolveDeepLinkCategory', () => {
  const categories = [
    category('c1', 'Alimentari', 'variable'),
    category('c2', 'Casa', 'variable'),
    category('c3', 'Casa', 'fixed'),
    category('c4', 'Stipendio', 'income'),
  ];

  it('resolves a unique outflow name case-insensitively', () => {
    expect(resolveDeepLinkCategory(categories, 'alimentari')).toEqual({
      categoryId: 'c1',
      type: 'variable',
    });
  });

  it('drops an ambiguous name instead of guessing', () => {
    expect(resolveDeepLinkCategory(categories, 'Casa')).toBeNull();
  });

  it('ignores income and transfer namesakes', () => {
    expect(resolveDeepLinkCategory(categories, 'Stipendio')).toBeNull();
  });

  it('returns null for unknown or absent names', () => {
    expect(resolveDeepLinkCategory(categories, 'Viaggi')).toBeNull();
    expect(resolveDeepLinkCategory(categories, undefined)).toBeNull();
    expect(resolveDeepLinkCategory([], 'Alimentari')).toBeNull();
  });
});

describe('toExpenseDeepLinkDraft', () => {
  it('carries amount and notes and resolves the category', () => {
    const categories = [category('c1', 'Alimentari', 'variable')];
    expect(
      toExpenseDeepLinkDraft(
        { amount: 12.5, notes: 'Bar', categoryName: 'Alimentari' },
        categories,
      ),
    ).toEqual({ amount: 12.5, notes: 'Bar', categoryId: 'c1', type: 'variable' });
  });

  it('keeps amount and notes when the category is ambiguous', () => {
    const categories = [category('c2', 'Casa', 'variable'), category('c3', 'Casa', 'fixed')];
    expect(
      toExpenseDeepLinkDraft({ amount: 9, categoryName: 'Casa' }, categories),
    ).toEqual({ amount: 9, categoryName: 'Casa' });
  });

  it('carries the unknown name as a create hint', () => {
    expect(
      toExpenseDeepLinkDraft({ amount: 5, categoryName: 'Palestra' }, []),
    ).toEqual({ amount: 5, categoryName: 'Palestra' });
  });
});
