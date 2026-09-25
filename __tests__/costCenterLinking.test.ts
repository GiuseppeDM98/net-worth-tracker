import { describe, it, expect } from 'vitest';
import type { Expense } from '@/types/expenses';
import {
  DEFAULT_LINK_FILTERS,
  buildLinkCandidates,
  buildLinkPlan,
  buildUnlinkPlan,
  filterLinkCandidates,
  listLinkCategories,
  listLinkYears,
  seriesRowsOf,
  summarizeLinkSelection,
} from '@/lib/utils/costCenterLinking';

// 22 August 2026, 10:00 in Italy.
const NOW = new Date('2026-08-22T10:00:00+02:00');
// Built the way the dialog builds one: local midnight, no time component.
const day = (iso: string) => new Date(`${iso}T00:00:00`);

function expense(partial: Partial<Expense> & { id: string; date: Date; amount: number }): Expense {
  return {
    userId: 'u1',
    type: 'variable',
    categoryId: 'c-auto',
    categoryName: 'Automobile',
    currency: 'EUR',
    createdAt: partial.date,
    updatedAt: partial.date,
    ...partial,
  };
}

const TARGET = { id: 'jogger', name: 'Dacia Jogger' };

// Twelve monthly instalments of 50 €, January → December 2026: eight paid, four to come.
const POLIZZA = Array.from({ length: 12 }, (_, i) =>
  expense({
    id: `rata-${i + 1}`,
    date: day(`2026-${String(i + 1).padStart(2, '0')}-05`),
    amount: -50,
    categoryId: 'c-ass',
    categoryName: 'Assicurazione',
    isInstallment: true,
    installmentParentId: 'polizza',
    notes: 'Polizza RCA',
  }),
);

const ROWS: Expense[] = [
  expense({ id: 'benzina', date: day('2026-08-10'), amount: -70, subCategoryName: 'Carburante', notes: 'Pieno Q8' }),
  expense({ id: 'tagliando', date: day('2026-05-10'), amount: -430, subCategoryName: 'Manutenzione' }),
  expense({ id: 'gia-collegata', date: day('2026-03-01'), amount: -90, costCenterId: 'jogger', costCenterName: 'Dacia Jogger' }),
  expense({ id: 'autostrada', date: day('2025-08-14'), amount: -38, costCenterId: 'vacanze', costCenterName: 'Vacanze', notes: 'Casello' }),
  // A refund: spending by type, a positive amount. A center reads only outgoing rows, so linking it would hide it.
  expense({ id: 'rimborso', date: day('2026-06-02'), amount: 25, notes: 'Rimborso officina' }),
  expense({ id: 'stipendio', date: day('2026-08-01'), amount: 2000, type: 'income', categoryId: 'c-stip', categoryName: 'Stipendio' }),
  expense({ id: 'giroconto', date: day('2026-08-02'), amount: -300, type: 'transfer', categoryId: 'c-giro', categoryName: 'Giroconto' }),
  ...POLIZZA,
];

describe('buildLinkCandidates', () => {
  const candidates = buildLinkCandidates(ROWS, TARGET.id, NOW);
  const byKey = new Map(candidates.map((c) => [c.key, c]));

  it('offers what the center will SHOW once linked: spending by type, with an outgoing amount', () => {
    expect(byKey.has('stipendio')).toBe(false);
    // Negative amount, but a transfer: the type decides first.
    expect(byKey.has('giroconto')).toBe(false);
    expect(byKey.has('rimborso')).toBe(false);
  });

  it('leaves out what is already on the target', () => {
    expect(byKey.has('gia-collegata')).toBe(false);
  });

  it('stands a whole series as ONE candidate, the occurrences to come included', () => {
    const polizza = byKey.get('series:polizza')!;
    expect(polizza.rows).toHaveLength(12);
    expect(polizza.total).toBe(600);
    expect(polizza.series).toEqual({ kind: 'installment', count: 12, scheduledCount: 4 });
    // Recognised by the last instalment PAID, not by the one due in December.
    expect(polizza.date).toEqual(day('2026-08-05'));
    expect(candidates.filter((c) => c.key.startsWith('rata-'))).toEqual([]);
  });

  it('stands a partly linked series for what is left, and drops one fully linked', () => {
    const partly = ROWS.map((row) => (row.id === 'rata-1' || row.id === 'rata-2' ? { ...row, costCenterId: 'jogger', costCenterName: 'Dacia Jogger' } : row));
    const left = buildLinkCandidates(partly, TARGET.id, NOW).find((c) => c.key === 'series:polizza')!;
    expect(left.rows.map((r) => r.id)).not.toContain('rata-1');
    expect(left.series?.count).toBe(10);

    const fully = ROWS.map((row) => (row.installmentParentId ? { ...row, costCenterId: 'jogger', costCenterName: 'Dacia Jogger' } : row));
    expect(buildLinkCandidates(fully, TARGET.id, NOW).some((c) => c.key === 'series:polizza')).toBe(false);
  });

  it('names the center a row would leave', () => {
    expect(byKey.get('autostrada')?.leaves).toEqual([{ centerId: 'vacanze', centerName: 'Vacanze', count: 1 }]);
    expect(byKey.get('benzina')?.leaves).toEqual([]);
  });

  it('sorts newest first', () => {
    expect(candidates.map((c) => c.key)).toEqual(['benzina', 'series:polizza', 'tagliando', 'autostrada']);
  });
});

describe('filterLinkCandidates', () => {
  const candidates = buildLinkCandidates(ROWS, TARGET.id, NOW);
  const keys = (filters: Partial<typeof DEFAULT_LINK_FILTERS>) => filterLinkCandidates(candidates, { ...DEFAULT_LINK_FILTERS, ...filters }).map((c) => c.key);

  it('hides the rows of another center until they are asked for', () => {
    expect(keys({})).not.toContain('autostrada');
    expect(keys({ includeOtherCenters: true })).toContain('autostrada');
  });

  it('searches notes, category and subcategory, accents and case folded', () => {
    expect(keys({ query: 'q8' })).toEqual(['benzina']);
    expect(keys({ query: 'MANUTENZ' })).toEqual(['tagliando']);
    expect(keys({ query: 'assicurazione' })).toEqual(['series:polizza']);
    expect(keys({ query: '   ' })).toHaveLength(3);
  });

  it('filters by category key and by any year a series touches', () => {
    expect(keys({ categoryKey: 'c-ass' })).toEqual(['series:polizza']);
    expect(keys({ year: 2025, includeOtherCenters: true })).toEqual(['autostrada']);
    expect(keys({ year: 2026 })).toHaveLength(3);
  });

  it('lists the categories and the years the candidates hold', () => {
    expect(listLinkCategories(candidates)).toEqual([{ key: 'c-ass', label: 'Assicurazione' }, { key: 'c-auto', label: 'Automobile' }]);
    expect(listLinkYears(candidates)).toEqual([2026, 2025]);
  });
});

describe('summarizeLinkSelection', () => {
  const candidates = buildLinkCandidates(ROWS, TARGET.id, NOW);

  it('counts ROWS, so a ticked series weighs every occurrence', () => {
    const summary = summarizeLinkSelection(candidates, new Set(['benzina', 'series:polizza']));
    expect(summary.rowCount).toBe(13);
    expect(summary.total).toBe(670);
    expect(summary.moves).toEqual([]);
  });

  it('says what a selection takes away from another center', () => {
    const summary = summarizeLinkSelection(candidates, new Set(['autostrada', 'benzina']));
    expect(summary.moves).toEqual([{ centerId: 'vacanze', centerName: 'Vacanze', count: 1 }]);
  });

  it('is empty for an empty selection, and ignores a key the candidates no longer hold', () => {
    expect(summarizeLinkSelection(candidates, new Set())).toEqual({ rowCount: 0, total: 0, moves: [] });
    expect(summarizeLinkSelection(candidates, new Set(['sparita'])).rowCount).toBe(0);
  });
});

describe('the write and its undo', () => {
  const candidates = buildLinkCandidates(ROWS, TARGET.id, NOW);

  it('writes id AND name on every row, and remembers each row as it was', () => {
    const plan = buildLinkPlan(candidates, new Set(['autostrada', 'benzina']), TARGET);
    expect(plan.writes).toEqual([
      { expenseId: 'benzina', costCenterId: 'jogger', costCenterName: 'Dacia Jogger' },
      { expenseId: 'autostrada', costCenterId: 'jogger', costCenterName: 'Dacia Jogger' },
    ]);
    // The undo gives Vacanze its row back: «Annulla» restores, it does not merely unlink.
    expect(plan.undo).toEqual([
      { expenseId: 'benzina', costCenterId: null, costCenterName: null },
      { expenseId: 'autostrada', costCenterId: 'vacanze', costCenterName: 'Vacanze' },
    ]);
  });

  it('expands a series into its twelve writes', () => {
    expect(buildLinkPlan(candidates, new Set(['series:polizza']), TARGET).writes).toHaveLength(12);
  });

  it('unlinks towards no center, with the same two-sided plan', () => {
    const linked = { ...ROWS[0], costCenterId: 'jogger', costCenterName: 'Dacia Jogger' };
    expect(buildUnlinkPlan([linked])).toEqual({
      writes: [{ expenseId: 'benzina', costCenterId: null, costCenterName: null }],
      undo: [{ expenseId: 'benzina', costCenterId: 'jogger', costCenterName: 'Dacia Jogger' }],
    });
  });

  it('finds the occurrences of a row\'s series among a center\'s rows, and only itself for a plain row', () => {
    expect(seriesRowsOf(POLIZZA[3], ROWS)).toHaveLength(12);
    expect(seriesRowsOf(ROWS[0], ROWS)).toEqual([ROWS[0]]);
  });
});
