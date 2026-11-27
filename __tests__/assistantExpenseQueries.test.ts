/**
 * The Assistente's queries on the recorded cashflow (lib/utils/assistantExpenseQueries.ts): the row's
 * Italian day, classification by type, the rows ahead of today, the monthly series and its cap, the
 * filters by name (case and accents ignored), the history's floor, groups by id with labels by name,
 * the comparison of two periods, the rows behind a figure and their cap. Pure: no `vi.mock`; green in
 * `Europe/Rome` and `TZ=UTC`. Every fixture sits at Italian noon except the one beside midnight, which
 * is named by the Italian clock. Figures invented and round.
 *
 * Each rule was seen red by the session that wrote it (2026-11-26): the day read with
 * `toISOString()`; `Math.abs` on income (re-seen red on 2026-11-27); no fill of the empty months and
 * the series started at the asked day; an exact string match for a name; the floor test dropped; a
 * group keyed by its folded name; the comparison sorted by label; the total of the shown rows.
 */

import { describe, expect, it } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import type { Expense } from '@/types/expenses';
import {
  comparePeriods,
  foldName,
  listRows,
  queryClockOf,
  totalsBy,
  unknownNames,
  type ExpenseQuery,
} from '@/lib/utils/assistantExpenseQueries';

const TODAY = '2026-11-15';
const CLOCK = queryClockOf(TODAY, undefined);

let seq = 0;
/** A row at Italian noon of `day`, with an explicit type (never derived from the sign). */
function row(day: string, type: Expense['type'], amount: number, extra: Partial<Expense> = {}): Expense {
  seq += 1;
  return {
    id: `r-${String(seq).padStart(5, '0')}`,
    userId: 'u1',
    type,
    categoryId: extra.categoryId ?? `cat-${type}`,
    categoryName: extra.categoryName ?? extra.categoryId ?? `cat-${type}`,
    amount,
    currency: 'EUR',
    date: fromZonedTime(`${day}T12:00:00`, 'Europe/Rome'),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  } as Expense;
}

function spending(fromIso: string, toIso: string, extra: Partial<ExpenseQuery> = {}): ExpenseQuery {
  return { fromIso, toIso, kind: 'spending', ...extra };
}

describe('totalsBy — the Italian day', () => {
  it('files a row at 23:30 UTC of 31 October under November, in every process zone', () => {
    const late = row('2026-10-31', 'variable', -100, { date: new Date('2026-10-31T23:30:00Z') });
    const result = totalsBy([late], spending('2026-10-01', '2026-11-30'), 'month', CLOCK);
    expect(result.groups.map((group) => [group.key, group.total])).toEqual([['2026-11', 100]]);
  });
});

describe('totalsBy — classification by type', () => {
  const rows = [
    row('2026-03-10', 'transfer', 9999),
    row('2026-03-10', 'debt', -500, { categoryName: 'Mutuo A' }),
    row('2026-03-10', 'variable', -100),
    row('2026-03-10', 'income', 2500),
    row('2026-03-11', 'income', -50),
  ];

  it('counts debt as spending, never a transfer, and prints spending positive', () => {
    const result = totalsBy(rows, spending('2026-03-01', '2026-03-31'), 'type', CLOCK);
    expect(result.total).toBe(600);
    expect(result.rows).toBe(2);
    expect(result.groups.map((group) => [group.label, group.total])).toEqual([
      ['Debiti', 500],
      ['Spese Non Necessarie', 100],
    ]);
  });

  it('sums income signed: a negative correction lowers it', () => {
    const result = totalsBy(rows, { fromIso: '2026-03-01', toIso: '2026-03-31', kind: 'income' }, 'type', CLOCK);
    expect(result.total).toBe(2450);
  });
});

describe('totalsBy — what has not happened, and the monthly series', () => {
  it('leaves a row dated tomorrow out, and takes it with includeScheduled', () => {
    const rows = [row('2026-11-10', 'variable', -100), row('2026-11-16', 'variable', -300)];
    expect(totalsBy(rows, spending('2026-11-01', '2026-11-30'), 'type', CLOCK).total).toBe(100);
    expect(totalsBy(rows, spending('2026-11-01', '2026-11-30', { includeScheduled: true }), 'type', CLOCK).total).toBe(400);
  });

  it('fills the empty months with zero and stops at the month of today', () => {
    const rows = [row('2026-08-05', 'variable', -100), row('2026-11-05', 'variable', -300), row('2026-12-05', 'variable', -50)];
    const result = totalsBy(rows, spending('2026-08-01', '2026-12-31'), 'month', CLOCK);
    expect(result.groups.map((group) => [group.key, group.total])).toEqual([
      ['2026-08', 100],
      ['2026-09', 0],
      ['2026-10', 0],
      ['2026-11', 300],
    ]);
  });

  it('asked from 1970, starts at the first month the account holds', () => {
    const rows = [row('2026-09-05', 'variable', -100)];
    const result = totalsBy(rows, spending('1970-01-01', '2026-11-30'), 'month', CLOCK);
    expect(result.groups.map((group) => group.key)).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('keeps the last 60 of 70 months and counts the 10 left out, the total still of all 70', () => {
    const rows: Expense[] = [];
    for (let index = 0; index < 70; index++) {
      const year = 2021 + Math.floor((index + 1) / 12);
      const month = ((index + 1) % 12) + 1;
      rows.push(row(`${year}-${String(month).padStart(2, '0')}-10`, 'variable', -10));
    }
    const lastDay = getLastDay(rows);
    const result = totalsBy(rows, spending('2021-01-01', lastDay), 'month', queryClockOf(lastDay, undefined));
    expect(result.groups).toHaveLength(60);
    expect(result.omittedGroups).toBe(10);
    expect(result.total).toBe(700);
    expect(result.groups[0].key).toBe('2021-12');
  });
});

function getLastDay(rows: Expense[]): string {
  return rows.map((item) => item.date.toISOString().slice(0, 10)).sort().at(-1)!;
}

describe('filters by name', () => {
  const rows = [
    row('2026-05-10', 'fixed', -100, { categoryName: 'Sanità', subCategoryName: 'Visite', notes: 'Dentista ornitorinco' }),
    row('2026-05-10', 'fixed', -300, { categoryName: 'Asilo' }),
  ];

  it('finds «Sanità» asked as «sanita»', () => {
    const result = totalsBy(rows, spending('2026-05-01', '2026-05-31', { categories: ['sanita'] }), 'category', CLOCK);
    expect(result.total).toBe(100);
  });

  it('finds nothing with a subcategory filter on a row without it', () => {
    const result = totalsBy(rows, spending('2026-05-01', '2026-05-31', { categories: ['Asilo'], subCategories: ['Visite'] }), 'category', CLOCK);
    expect(result.rows).toBe(0);
  });

  it('finds a word of the notes through `text`', () => {
    const result = listRows(rows, spending('2026-05-01', '2026-05-31', { text: 'ORNITORINCO' }), 'date-desc', 100, CLOCK);
    expect(result.rows).toBe(1);
    expect(result.shown[0].category).toBe('Sanità');
  });

  it('lists the names a filter does not find', () => {
    expect(unknownNames(['sanita', 'Palestra'], ['Sanità', 'Asilo'])).toEqual(['Palestra']);
    expect(unknownNames(undefined, ['Sanità'])).toEqual([]);
    expect(foldName('  Città ')).toBe('citta');
  });
});

describe('the history floor', () => {
  const rows = [row('2024-12-10', 'variable', -100, { categoryName: 'Spesa' }), row('2025-03-10', 'variable', -200, { categoryName: 'Spesa' })];
  const floor = queryClockOf(TODAY, 2025);

  it('leaves a row before the floor out of every total and counts it, in all three queries', () => {
    const totals = totalsBy(rows, spending('2024-01-01', '2025-12-31'), 'category', floor);
    expect(totals.total).toBe(200);
    expect(totals.beforeFloorRows).toBe(1);

    const compared = comparePeriods(rows, { kind: 'spending' }, { fromIso: '2024-01-01', toIso: '2024-12-31' }, { fromIso: '2025-01-01', toIso: '2025-12-31' }, 'category', floor);
    expect(compared.totalA).toBe(0);
    expect(compared.beforeFloorRows).toBe(1);

    const listed = listRows(rows, spending('2024-01-01', '2025-12-31'), 'date-desc', 100, floor);
    expect(listed.total).toBe(200);
    expect(listed.beforeFloorRows).toBe(1);
  });

  it('counts the row when the setting is absent', () => {
    expect(totalsBy(rows, spending('2024-01-01', '2025-12-31'), 'category', CLOCK).total).toBe(300);
  });

  it('starts the monthly series at January of the floor year', () => {
    const result = totalsBy(rows, spending('2024-01-01', '2025-03-31'), 'month', floor);
    expect(result.groups[0].key).toBe('2025-01');
  });
});

describe('groups by id, labels by name', () => {
  const rows = [
    row('2026-04-10', 'fixed', -100, { categoryId: 'casa-n', categoryName: 'Casa', subCategoryId: 'sub-1', subCategoryName: 'Affitto' }),
    row('2026-04-10', 'variable', -50, { categoryId: 'casa-v', categoryName: 'Casa' }),
  ];

  it('keeps two categories of one name as two groups, each labelled with its type', () => {
    const result = totalsBy(rows, spending('2026-04-01', '2026-04-30'), 'category', CLOCK);
    expect(result.groups.map((group) => group.label)).toEqual(['Casa (Spese Necessarie)', 'Casa (Spese Non Necessarie)']);
  });

  it('selects both with a filter on the shared name', () => {
    expect(totalsBy(rows, spending('2026-04-01', '2026-04-30', { categories: ['casa'] }), 'category', CLOCK).total).toBe(150);
  });

  it('labels a row without a subcategory «Senza sottocategoria»', () => {
    const result = totalsBy([rows[1]], spending('2026-04-01', '2026-04-30'), 'subcategory', CLOCK);
    expect(result.groups[0].label).toBe('Casa › Senza sottocategoria');
  });
});

describe('comparePeriods', () => {
  const rows = [
    row('2025-02-10', 'variable', -100, { categoryId: 'spesa', categoryName: 'Spesa' }),
    row('2025-02-10', 'fixed', -200, { categoryId: 'casa', categoryName: 'Casa' }),
    row('2026-02-10', 'variable', -500, { categoryId: 'spesa', categoryName: 'Spesa' }),
    row('2026-02-10', 'fixed', -300, { categoryId: 'asilo', categoryName: 'Asilo' }),
  ];
  const result = comparePeriods(rows, { kind: 'spending' }, { fromIso: '2025-01-01', toIso: '2025-12-31' }, { fromIso: '2026-01-01', toIso: '2026-12-31' }, 'category', CLOCK);

  it('gives a group only in B a zero A and no percentage', () => {
    expect(result.rows.find((item) => item.label === 'Asilo')).toEqual({ label: 'Asilo', a: 0, b: 300, delta: 300, deltaPct: null });
  });

  it('orders the rows by the size of the move', () => {
    expect(result.rows.map((item) => item.label)).toEqual(['Spesa', 'Asilo', 'Casa']);
  });

  it('carries both totals and their percentage', () => {
    expect([result.totalA, result.totalB, result.delta, result.deltaPct]).toEqual([300, 800, 500, 166.7]);
  });
});

describe('listRows', () => {
  const rows = Array.from({ length: 130 }, (_, index) => row(`2026-06-${String((index % 28) + 1).padStart(2, '0')}`, 'variable', -10));

  it('shows 100 of 130 rows, counts all of them and totals all of them', () => {
    const result = listRows(rows, spending('2026-06-01', '2026-06-30'), 'date-desc', 100, CLOCK);
    expect(result.shown).toHaveLength(100);
    expect(result.omitted).toBe(30);
    expect(result.rows).toBe(130);
    expect(result.total).toBe(1300);
  });

  it('caps a limit of 500 at 100', () => {
    expect(listRows(rows, spending('2026-06-01', '2026-06-30'), 'date-desc', 500, CLOCK).shown).toHaveLength(100);
  });
});
