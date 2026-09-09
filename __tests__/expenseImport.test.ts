/**
 * Tests for the pure import layer in lib/utils/expenseImport.ts.
 *
 * Covers the tricky, locale-sensitive parts of the historical CSV importer:
 *   1. parseItalianNumber — IT (`1.234,56`) vs EN (`1234.56`) + thousands heuristic.
 *   2. parseFlexibleDate — ISO and DD/MM/YYYY, with invalid/overflow rejection.
 *   3. parseImportCsv — header aliases, `;` delimiter, missing-column errors.
 *   4. buildImportPlan — (name, type) identity: same-named categories of different
 *      types resolve/create side by side, untyped rows inherit the single
 *      namesake's type (ambiguous → rejected), same-name-same-type duplicates
 *      attach to the oldest with a preview notice; plus transfer skip,
 *      subcategory creation, summary totals.
 *
 * No React, no Firebase — the module imports only papaparse + types.
 */

import { describe, it, expect } from 'vitest';
import {
  parseItalianNumber,
  parseFlexibleDate,
  parseImportCsv,
  buildImportPlan,
  buildTemplateCsv,
} from '@/lib/utils/expenseImport';
import { ExpenseCategory } from '@/types/expenses';

function cat(partial: Partial<ExpenseCategory> & { name: string; type: ExpenseCategory['type'] }): ExpenseCategory {
  return {
    id: partial.id ?? `id-${partial.name}`,
    userId: 'u1',
    name: partial.name,
    type: partial.type,
    subCategories: partial.subCategories ?? [],
    createdAt: partial.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
}

describe('parseItalianNumber', () => {
  it('parses IT format with dot thousands and comma decimal', () => {
    expect(parseItalianNumber('1.234,56')).toBe(1234.56);
    expect(parseItalianNumber('1.234.567,89')).toBe(1234567.89);
  });

  it('parses EN format', () => {
    expect(parseItalianNumber('1234.56')).toBe(1234.56);
    expect(parseItalianNumber('1,234.56')).toBe(1234.56);
  });

  it('treats a single separator grouping 3 digits as thousands', () => {
    expect(parseItalianNumber('1.234')).toBe(1234);
    expect(parseItalianNumber('1,234')).toBe(1234);
  });

  it('treats a single separator with 1-2 decimals as decimal', () => {
    expect(parseItalianNumber('12,5')).toBe(12.5);
    expect(parseItalianNumber('12.50')).toBe(12.5);
  });

  it('strips currency symbols and returns positive magnitude', () => {
    expect(parseItalianNumber('€ 54,90')).toBe(54.9);
    expect(parseItalianNumber('-50,00')).toBe(50);
  });

  it('returns null for junk', () => {
    expect(parseItalianNumber('abc')).toBeNull();
    expect(parseItalianNumber('')).toBeNull();
  });
});

describe('parseFlexibleDate', () => {
  it('parses ISO YYYY-MM-DD', () => {
    const d = parseFlexibleDate('2024-01-15')!;
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(15);
  });

  it('parses DD/MM/YYYY (and . / - separators)', () => {
    expect(parseFlexibleDate('15/01/2024')!.getMonth()).toBe(0);
    expect(parseFlexibleDate('15.01.2024')!.getDate()).toBe(15);
    expect(parseFlexibleDate('15-01-2024')!.getFullYear()).toBe(2024);
  });

  it('rejects overflow and garbage', () => {
    expect(parseFlexibleDate('31/02/2024')).toBeNull();
    expect(parseFlexibleDate('2024-13-01')).toBeNull();
    expect(parseFlexibleDate('not a date')).toBeNull();
    expect(parseFlexibleDate('')).toBeNull();
  });
});

describe('parseImportCsv', () => {
  it('parses a `;`-delimited file with Italian headers', () => {
    const csv = 'data;importo;tipo;categoria;sottocategoria;note;valuta\n2024-01-15;1200,00;fixed;Casa;Affitto;x;EUR';
    const rows = parseImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ line: 1, categoria: 'Casa', importo: '1200,00', tipo: 'fixed' });
  });

  it('accepts English header aliases and `,` delimiter', () => {
    const csv = 'date,amount,type,category\n2024-01-15,50.00,variable,Spesa';
    const rows = parseImportCsv(csv);
    expect(rows[0]).toMatchObject({ data: '2024-01-15', importo: '50.00', tipo: 'variable', categoria: 'Spesa' });
  });

  it('tolerates a UTF-8 BOM and the generated template', () => {
    const rows = parseImportCsv(buildTemplateCsv());
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0].categoria).toBe('Casa');
  });

  it('throws when a required column is missing', () => {
    expect(() => parseImportCsv('data;tipo;categoria\n2024-01-15;fixed;Casa')).toThrow(/importo/i);
  });
});

describe('buildImportPlan', () => {
  const rowsCsv = (body: string) =>
    parseImportCsv('data;importo;tipo;categoria;sottocategoria;note;valuta\n' + body);

  it('falls back to variable when type is empty', () => {
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;;Spesa;;;'), []);
    expect(plan.validRows).toHaveLength(1);
    expect(plan.validRows[0].type).toBe('variable');
  });

  it('skips transfer rows with a dedicated reason', () => {
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;transfer;Giroconto;;;'), []);
    expect(plan.validRows).toHaveLength(0);
    expect(plan.errors[0].reason).toMatch(/transfer/i);
  });

  it('treats a name used with two types in the file as two distinct categories', () => {
    // (name, type) is the identity app-wide: "Auto" fissa and "Auto" variabile are
    // two documents, not a conflict.
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;fixed;Auto;;;\n2024-02-15;60,00;variable;Auto;;;'),
      []
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.validRows).toHaveLength(2);
    expect(plan.categoriesToCreate).toHaveLength(2);
    expect(plan.categoriesToCreate.map((c) => c.type).sort()).toEqual(['fixed', 'variable']);
  });

  it('creates a same-named category of a different type beside the existing one', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;variable;Casa;;;'),
      [cat({ name: 'Casa', type: 'fixed' })]
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.validRows).toHaveLength(1);
    expect(plan.validRows[0].categoryId).toBeUndefined(); // the variable Casa does not exist yet
    expect(plan.categoriesToCreate).toEqual([{ name: 'Casa', type: 'variable', subCategories: [] }]);
  });

  it('inherits the single existing namesake type when the row has no type', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;;Casa;;;'),
      [cat({ name: 'Casa', type: 'fixed' })]
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.validRows[0]).toMatchObject({ type: 'fixed', categoryId: 'id-Casa' });
    expect(plan.categoriesToCreate).toHaveLength(0);
  });

  it('rejects an untyped row when same-named categories of different types exist', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;;Casa;;;'),
      [cat({ id: 'c-fix', name: 'Casa', type: 'fixed' }), cat({ id: 'c-var', name: 'Casa', type: 'variable' })]
    );
    expect(plan.validRows).toHaveLength(0);
    expect(plan.errors[0].reason).toMatch(/ambiguo/i);
    expect(plan.errors[0].reason).toMatch(/Spese Fisse/);
  });

  it('attaches same-name-same-type duplicates to the OLDEST document and says so', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;fixed;Casa;;;'),
      [
        cat({ id: 'c-new', name: 'Casa', type: 'fixed', createdAt: new Date(2026, 0, 1) }),
        cat({ id: 'c-old', name: 'Casa', type: 'fixed', createdAt: new Date(2024, 0, 1) }),
      ]
    );
    expect(plan.errors).toHaveLength(0);
    expect(plan.validRows[0].categoryId).toBe('c-old');
    expect(plan.notices).toHaveLength(1);
    expect(plan.notices[0]).toMatchObject({ categoryName: 'Casa', type: 'fixed', duplicateCount: 2 });
    expect(plan.notices[0].message).toMatch(/più vecchia/);
  });

  it('resolves existing categories case-insensitively and plans new subcategories', () => {
    const plan = buildImportPlan(
      rowsCsv('2024-01-15;50,00;fixed;casa;Bollette;;'),
      [cat({ name: 'Casa', type: 'fixed', subCategories: [{ id: 's1', name: 'Affitto' }] })]
    );
    expect(plan.validRows).toHaveLength(1);
    expect(plan.validRows[0].categoryId).toBe('id-Casa');
    expect(plan.categoriesToCreate).toHaveLength(0);
    expect(plan.notices).toHaveLength(0);
    expect(plan.subCategoriesToCreate).toHaveLength(1);
    expect(plan.subCategoriesToCreate[0]).toMatchObject({ categoryId: 'id-Casa', subCategoryNames: ['Bollette'] });
  });

  it('plans a new category with its subcategories', () => {
    const plan = buildImportPlan(rowsCsv('2024-01-15;50,00;income;Stipendio;Bonus;;'), []);
    expect(plan.categoriesToCreate).toHaveLength(1);
    expect(plan.categoriesToCreate[0]).toMatchObject({ name: 'Stipendio', type: 'income', subCategories: ['Bonus'] });
  });

  it('computes summary totals, date range, and counts', () => {
    const plan = buildImportPlan(
      rowsCsv(
        '2024-01-15;2500,00;income;Stipendio;;;\n' +
          '2024-03-20;1200,00;fixed;Casa;;;\n' +
          '2024-02-10;50,00;variable;Spesa;;;\n' +
          'bad;10;fixed;X;;;'
      ),
      []
    );
    expect(plan.summary.validCount).toBe(3);
    expect(plan.summary.skippedCount).toBe(1);
    expect(plan.summary.totalIncome).toBe(2500);
    expect(plan.summary.totalExpense).toBe(1250);
    expect(plan.summary.newCategoriesCount).toBe(3);
    expect(plan.summary.dateFrom!.getMonth()).toBe(0);
    expect(plan.summary.dateTo!.getMonth()).toBe(2);
  });
});
