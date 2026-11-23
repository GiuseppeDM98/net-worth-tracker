/**
 * The CASHFLOW 12 MESI block (lib/utils/cashflowBlock.ts): the Italian month of a row, the fixed
 * windows, income and its concentration, spending by type and by category id, savings with the whole
 * instalment, the series over the whole history, the medians and their base, the recorded commitments, the loans,
 * the transfers apart, the accounts, and the printed block whole. Pure: no `vi.mock`; green in
 * `Europe/Rome` and `TZ=UTC`. Every fixture sits at Italian noon except the one beside midnight, which
 * is named by the Italian clock. Figures invented and round.
 */

import { describe, expect, it } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { Asset } from '@/types/assets';
import {
  buildCashAccountLines,
  buildCashflowBlock,
  CASHFLOW_BLOCK_AGGREGATE_MONTHS,
  CASHFLOW_BLOCK_ROW_CAP,
  CASHFLOW_BLOCK_SOURCE_CAP,
  CASHFLOW_BLOCK_SUBCATEGORY_CAP,
  formatCashflowBlockForPrompt,
  type CashflowBlockInput,
} from '@/lib/utils/cashflowBlock';

const TODAY = '2026-11-15';

let seq = 0;
/** A row at Italian noon of `day`, with an explicit type (never derived from the sign). */
function row(day: string, type: Expense['type'], amount: number, extra: Partial<Expense> = {}): Expense {
  seq += 1;
  const date = fromZonedTime(`${day}T12:00:00`, 'Europe/Rome');
  return {
    id: `r-${String(seq).padStart(5, '0')}`,
    userId: 'u1',
    type,
    categoryId: extra.categoryId ?? `cat-${type}`,
    categoryName: extra.categoryName ?? extra.categoryId ?? `cat-${type}`,
    amount,
    currency: 'EUR',
    date,
    createdAt: date,
    updatedAt: date,
    ...extra,
  } as Expense;
}

function category(id: string, name: string, type: ExpenseCategory['type'], subs: [string, string][] = []): ExpenseCategory {
  return {
    id, userId: 'u1', name, type,
    subCategories: subs.map(([subId, subName]) => ({ id: subId, name: subName })),
    createdAt: new Date(0), updatedAt: new Date(0),
  };
}

function asset(id: string, name: string, type: Asset['type'], assetClass: Asset['assetClass'], quantity: number): Asset {
  return { id, userId: 'u1', name, type, assetClass, quantity, currentPrice: 1, currency: 'EUR' } as Asset;
}

function input(over: Partial<CashflowBlockInput> = {}): CashflowBlockInput {
  return {
    todayIso: TODAY,
    categories: [],
    assets: [],
    settings: null,
    assetValueOf: (a) => a.quantity * (a.currentPrice ?? 1),
    ...over,
  };
}

/** 'YYYY-MM' months from `from`, `count` of them, oldest first. */
function months(from: string, count: number): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** The 12 full months of a `TODAY` run: 2025-11 → 2026-10. */
const FULL = months('2025-11', 12);

/** `Intl` prints U+00A0 before «€» and in a grouped number: normalised as in allocationAdvicePrompts.test.ts. */
function printed(text: string): string {
  return text.replace(/ /g, ' ');
}

function printBlock(expenses: Expense[], over: Partial<CashflowBlockInput> = {}): string {
  return printed(formatCashflowBlockForPrompt(buildCashflowBlock(expenses, input(over))));
}

describe('the month of a row', () => {
  it('is its Italian calendar month: 00:30 on 1 February in Rome is February in both zones', () => {
    // 2026-02-01T00:30:00+01:00 = 2026-01-31T23:30:00Z.
    const date = fromZonedTime('2026-02-01T00:30:00', 'Europe/Rome');
    expect(date.toISOString()).toBe('2026-01-31T23:30:00.000Z');
    const expense = { ...row('2026-02-10', 'variable', -50), date };
    const block = buildCashflowBlock([expense], input({ todayIso: '2026-03-15' }));
    const byYm = new Map(block.series.map((m) => [m.ym, m]));
    expect(byYm.get('2026-02')?.rows).toBe(1);
    expect(byYm.get('2026-02')?.nonNecessary).toBe(50);
    expect(byYm.get('2026-01')?.rows).toBe(0);
  });
});

describe('the windows', () => {
  it('are the 12 full months, the current month up to today apart, and a series never shorter than the 12 months', () => {
    const series = { isRecurring: true, recurringParentId: 'gym', categoryId: 'svago', categoryName: 'Svago' };
    const block = buildCashflowBlock([
      row('2026-10-20', 'variable', -50, series),
      row('2026-11-20', 'variable', -50, series),
      row('2026-12-20', 'variable', -50, series),
    ], input());
    expect(block.windows).toMatchObject({
      aggregateFromYm: '2025-11', aggregateToYm: '2026-10', currentYm: '2026-11', seriesFromYm: '2025-11', todayIso: TODAY,
    });
    // The aggregates and the series ignore both rows after today.
    expect(block.spending.total).toBe(50);
    expect(block.series[block.series.length - 1]).toMatchObject({ ym: '2026-11', state: 'in-progress', rows: 0 });
    // The current month declares the first as scheduled, and counts nothing.
    expect(block.currentMonth).toEqual({ income: 0, spending: 0, rows: 0, scheduled: { rows: 1, income: 0, spending: 50 } });
    // The rows after today serve the commitment's next date.
    expect(block.commitments.items).toHaveLength(1);
    expect(block.commitments.items[0].nextIso).toBe('2026-11-20');
    const text = printBlock([
      row('2026-10-20', 'variable', -50, series),
      row('2026-11-20', 'variable', -50, series),
      row('2026-12-20', 'variable', -50, series),
    ]);
    expect(text).toContain('più 1 riga programmata fino a fine mese (uscite 50 €, entrate 0 €), non contata.');
    expect(text).toContain('Svago mensile 50 € (prossima 2026-11-20)');
  });

  it('cross the year in January: aggregates 2025-01 → 2025-12, and with no row the series is those 12 + the current', () => {
    const block = buildCashflowBlock([], input({ todayIso: '2026-01-15' }));
    expect(block.windows).toMatchObject({
      aggregateFromYm: '2025-01', aggregateToYm: '2025-12', currentYm: '2026-01', seriesFromYm: '2025-01',
    });
    expect(block.series).toHaveLength(CASHFLOW_BLOCK_AGGREGATE_MONTHS + 1);
    expect(block.series[0].ym).toBe('2025-01');
    expect(block.series[12].ym).toBe('2026-01');
  });
});

describe('income and its concentration', () => {
  const salary = { categoryId: 'inc-sal', categoryName: 'Stipendio' };
  const rent = { categoryId: 'inc-rent', categoryName: 'Affitti' };
  const refunds = { categoryId: 'inc-ref', categoryName: 'Rimborsi' };
  const dividends = { categoryId: 'inc-div', categoryName: 'Dividendi' };
  const settings = { dividendIncomeCategoryId: 'inc-div' };

  function shares(...totals: number[]): Expense[] {
    const cats = [salary, rent, refunds];
    return totals.map((total, i) => row('2026-05-10', 'income', total, cats[i]));
  }

  it('one source reads «una fonte dominante (100%)», HHI 1,00', () => {
    const block = buildCashflowBlock(shares(3000), input());
    expect(block.income.reading).toBe('una fonte dominante');
    expect(block.income.hhi).toBe(1);
    expect(printBlock(shares(3000))).toContain('Concentrazione: una fonte dominante (100%), HHI 1,00.');
  });

  it('60/25/15 reads «due fonti principali»', () => {
    expect(buildCashflowBlock(shares(6000, 2500, 1500), input()).income.reading).toBe('due fonti principali');
  });

  it('40/30/30 reads «fonti diversificate», HHI 0,34', () => {
    const block = buildCashflowBlock(shares(4000, 3000, 3000), input());
    expect(block.income.reading).toBe('fonti diversificate');
    expect(block.income.hhi).toBe(0.34);
    expect(printBlock(shares(4000, 3000, 3000))).toContain('Concentrazione: fonti diversificate, HHI 0,34.');
  });

  it('86/9/5 reads «una fonte dominante (86%)», HHI 0,75 — the reading is on the first share, not on the HHI', () => {
    const block = buildCashflowBlock(shares(8600, 900, 500), input());
    expect(block.income.reading).toBe('una fonte dominante');
    expect(block.income.hhi).toBe(0.75);
    expect(printBlock(shares(8600, 900, 500))).toContain('Concentrazione: una fonte dominante (86%), HHI 0,75.');
  });

  it('keeps the dividends in the total and out of the sources: one salary plus a dividend is still 100%', () => {
    const rows = [row('2026-05-10', 'income', 3000, salary), row('2026-06-10', 'income', 200, dividends)];
    const block = buildCashflowBlock(rows, input({ settings }));
    expect(block.income.total).toBe(3200);
    expect(block.income.dividends).toBe(200);
    expect(block.income.sources).toHaveLength(1);
    expect(block.income.sources[0].share).toBe(100);
    expect(block.income.topShare).toBe(100);
    expect(printBlock(rows, { settings })).toContain(
      'Entrate: 3200 € in 12 mesi (di cui dividendi e cedole 200 €, fuori dalle fonti). Fonti (totale, quota, mesi presenti): Stipendio 3000 € 100% (1).');
  });

  it('only dividends: «tutte dividendi e cedole»', () => {
    const rows = [row('2026-06-10', 'income', 200, dividends)];
    expect(printBlock(rows, { settings })).toContain(
      'Entrate: 200 € in 12 mesi, tutte dividendi e cedole: nessuna fonte oltre a dividendi e cedole.');
  });

  it('spending only reads «nessuna entrata», with no HHI', () => {
    const rows = [row('2026-05-10', 'fixed', -800)];
    const block = buildCashflowBlock(rows, input());
    expect(block.income.reading).toBe('nessuna entrata');
    expect(block.income.hhi).toBeNull();
    expect(block.income.topShare).toBeNull();
    expect(printBlock(rows)).toContain('Entrate: nessuna entrata registrata negli ultimi 12 mesi pieni.');
  });

  it('counts the months a source is present in', () => {
    const rows = [
      ...FULL.map((ym) => row(`${ym}-27`, 'income', 2000, salary)),
      row('2026-01-10', 'income', 100, refunds), row('2026-04-10', 'income', 100, refunds), row('2026-04-20', 'income', 100, refunds),
    ];
    const block = buildCashflowBlock(rows, input());
    expect(block.income.sources.map((s) => [s.label, s.monthsPresent])).toEqual([['Stipendio', 12], ['Rimborsi', 2]]);
  });

  it(`prints ${CASHFLOW_BLOCK_SOURCE_CAP} sources and says how many it left out, and their sum`, () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      row('2026-05-10', 'income', 1000 - i * 10, { categoryId: `inc-${i}`, categoryName: `Fonte ${String(i).padStart(2, '0')}` }));
    const block = buildCashflowBlock(rows, input());
    expect(block.income.sources).toHaveLength(CASHFLOW_BLOCK_SOURCE_CAP);
    expect(block.income.sourcesCut).toEqual({ count: 5, total: 800 + 790 + 780 + 770 + 760 });
    expect(printBlock(rows)).toContain('Fonte 19 810 € 4% (1); e altre 5 fonti, 3900 €. Concentrazione: fonti diversificate');
  });

  it('lists a source at or below zero after the others, with no share, out of the HHI', () => {
    const rows = [row('2026-05-10', 'income', 3000, salary), row('2026-06-10', 'income', -200, refunds)];
    const block = buildCashflowBlock(rows, input());
    expect(block.income.sources.map((s) => [s.label, s.total, s.share])).toEqual([['Stipendio', 3000, 100], ['Rimborsi', -200, null]]);
    expect(block.income.hhi).toBe(1);
    expect(printBlock(rows)).toContain('Fonti (totale, quota, mesi presenti): Stipendio 3000 € 100% (1), Rimborsi -200 € (1). Concentrazione: una fonte dominante (100%), HHI 1,00.');
  });

  it('sources that are all at or below zero read «nessuna entrata», and say there is no positive source', () => {
    const rows = [row('2026-06-10', 'income', -200, refunds)];
    const block = buildCashflowBlock(rows, input());
    expect(block.income).toMatchObject({ reading: 'nessuna entrata', hhi: null, topShare: null });
    expect(printBlock(rows)).toContain('Fonti (totale, quota, mesi presenti): Rimborsi -200 € (1). Concentrazione: nessuna fonte con entrate positive.');
  });

  it('declares one source left out in the singular', () => {
    const rows = Array.from({ length: CASHFLOW_BLOCK_SOURCE_CAP + 1 }, (_, i) =>
      row('2026-05-10', 'income', 1000 - i * 10, { categoryId: `inc-${i}`, categoryName: `Fonte ${String(i).padStart(2, '0')}` }));
    expect(printBlock(rows)).toContain('; e altra 1 fonte, 800 €. Concentrazione');
  });

  it('names a source by its subcategory, the current names read from the category document', () => {
    const rows = [row('2026-05-10', 'income', 2000, { ...salary, categoryName: 'Vecchio nome', subCategoryId: 's-a', subCategoryName: 'A' })];
    const categories = [category('inc-sal', 'Stipendio', 'income', [['s-a', 'Azienda A']])];
    expect(buildCashflowBlock(rows, input({ categories })).income.sources[0].label).toBe('Stipendio › Azienda A');
  });
});

describe('spending', () => {
  it('is keyed by id: two categories named «Casa» of two types are two lines, qualified', () => {
    const categories = [category('c-casa-n', 'Casa', 'fixed'), category('c-casa-v', 'Casa', 'variable')];
    const rows = [
      row('2026-05-10', 'fixed', -600, { categoryId: 'c-casa-n', categoryName: 'Casa' }),
      row('2026-05-11', 'variable', -400, { categoryId: 'c-casa-v', categoryName: 'Casa' }),
    ];
    const block = buildCashflowBlock(rows, input({ categories }));
    expect(block.spending.byCategory.map((c) => [c.label, c.total])).toEqual([
      ['Casa (Spese Necessarie)', 600], ['Casa (Spese Non Necessarie)', 400],
    ]);
    expect(block.spending.byType).toEqual({ necessary: 600, nonNecessary: 400, debt: 0, unclassified: 0 });
    expect(printBlock(rows, { categories })).toContain(
      'Per categoria: Casa (Spese Necessarie) 600 € (60%); Casa (Spese Non Necessarie) 400 € (40%).');
  });

  it('without the category documents, qualifies two «Casa» by the rows\' own type', () => {
    const rows = [
      row('2026-05-10', 'fixed', -600, { categoryId: 'c-casa-n', categoryName: 'Casa' }),
      row('2026-05-11', 'variable', -400, { categoryId: 'c-casa-v', categoryName: 'Casa' }),
    ];
    expect(buildCashflowBlock(rows, input()).spending.byCategory.map((c) => c.label)).toEqual([
      'Casa (Spese Necessarie)', 'Casa (Spese Non Necessarie)',
    ]);
  });

  it('says «nessuna uscita» with no spending row, and one subcategory left out in the singular', () => {
    expect(printBlock([])).toContain('Uscite: nessuna uscita registrata negli ultimi 12 mesi pieni.');
    const rows = Array.from({ length: CASHFLOW_BLOCK_SUBCATEGORY_CAP + 1 }, (_, i) =>
      row('2026-05-10', 'variable', -(i + 1), { categoryId: 'c-a', categoryName: 'Alfa', subCategoryId: `sub-${i}`, subCategoryName: `S${String(i + 1).padStart(2, '0')}` }));
    expect(printBlock(rows)).toContain('. E altra 1 sottocategoria minore, 1 € in tutto, già nei totali delle categorie.');
  });

  it('declares the rows with no type, in the line and as a column of the series', () => {
    const rows = [row('2026-05-10', 'fixed', -600), { ...row('2026-05-11', 'variable', -400), type: undefined } as unknown as Expense];
    const block = buildCashflowBlock(rows, input());
    expect(block.spending.byType.unclassified).toBe(400);
    expect(block.spending.untypedRows).toBe(1);
    const text = printBlock(rows);
    expect(text).toContain('Debiti 0 € (0%), Non classificate 400 € (40%, 1 riga senza tipo).');
    expect(text).toContain('(entrate / Spese Necessarie / Spese Non Necessarie / Debiti / Non classificate / risparmio / tasso di risparmio)');
    expect(text).toContain('2026-05: 0 / 600 / 0 / 0 / 400 / -1000 / —');
  });

  it(`prints the ${CASHFLOW_BLOCK_SUBCATEGORY_CAP} largest subcategories across ALL categories and declares the rest`, () => {
    // Two categories, 35 subcategories each, amounts 1..70 interleaved: the cut is global.
    const rows = Array.from({ length: 70 }, (_, i) => {
      const cat = i % 2 === 0 ? 'c-a' : 'c-b';
      return row('2026-05-10', 'variable', -(i + 1), {
        categoryId: cat, categoryName: cat === 'c-a' ? 'Alfa' : 'Beta',
        subCategoryId: `sub-${i}`, subCategoryName: `S${String(i + 1).padStart(2, '0')}`,
      });
    });
    const block = buildCashflowBlock(rows, input());
    const printedSubs = block.spending.byCategory.flatMap((c) => c.subCategories);
    expect(printedSubs).toHaveLength(60);
    expect(Math.min(...printedSubs.map((s) => s.total))).toBe(11);
    expect(block.spending.subCategoriesCut).toEqual({ count: 10, total: 55 });
    // The category totals stay whole.
    expect(block.spending.byCategory.reduce((sum, c) => sum + c.total, 0)).toBe(2485);
    expect(printBlock(rows)).toContain('. E altre 10 sottocategorie minori, 55 € in tutto, già nei totali delle categorie.');
  });

  it('prints «Senza sottocategoria» in a category that has subcategories, and the share alone in one with none', () => {
    const rows = [
      row('2026-05-10', 'fixed', -300, { categoryId: 'casa', categoryName: 'Casa', subCategoryId: 'aff', subCategoryName: 'Affitto' }),
      row('2026-05-11', 'fixed', -100, { categoryId: 'casa', categoryName: 'Casa' }),
      row('2026-05-12', 'variable', -100, { categoryId: 'svago', categoryName: 'Svago' }),
    ];
    expect(printBlock(rows)).toContain('Per categoria: Casa 400 € (80%: Affitto 300 €, Senza sottocategoria 100 €); Svago 100 € (20%).');
  });
});

describe('savings', () => {
  it('count the whole instalment: the principal lowers the debt, but it left the account', () => {
    const rows = [
      row('2026-05-10', 'income', 3000),
      row('2026-05-11', 'debt', -1000, { debtAssetId: 'loan-1', debtInterestPaid: 200, debtPrincipalRepaid: 800 }),
    ];
    const block = buildCashflowBlock(rows, input());
    expect(block.savings.total).toBe(2000);
    expect(block.series.find((m) => m.ym === '2026-05')?.savings).toBe(2000);
    expect(printBlock(rows)).toContain('Risparmio: 2000 € in 12 mesi, il 67% delle entrate; le rate contano per intero: la quota capitale riduce il debito.');
  });

  it('have no rate when income is zero: «—»', () => {
    const rows = [row('2026-05-10', 'fixed', -300)];
    const block = buildCashflowBlock(rows, input());
    expect(block.savings.rate).toBeNull();
    const text = printBlock(rows);
    expect(text).toContain('Risparmio: -300 € in 12 mesi (tasso —: entrate nulle o negative, oppure spese oltre il doppio delle entrate); le rate contano per intero');
    expect(text).toContain('2026-05: 0 / 300 / 0 / 0 / -300 / —');
  });
});

// The savings floor (owner, 2026-11-12): a month or an aggregate below −100%, or without income, is
// not a rate — the block prints «—» and says once what it means; a true −30% keeps its percentage,
// with the typographic minus.
describe('the savings floor', () => {
  const LEGEND = 'tasso —: entrate nulle o negative, oppure spese oltre il doppio delle entrate';

  it('prints «—» for a month below the floor and the legend once after the series (B1)', () => {
    const rows = [
      row('2026-05-10', 'income', 3), row('2026-05-11', 'variable', -500),
      row('2026-06-10', 'income', 3), row('2026-06-11', 'variable', -400),
      row('2026-07-10', 'income', 2000), row('2026-07-11', 'variable', -2600),
    ];
    const block = buildCashflowBlock(rows, input());
    expect(block.series.find((m) => m.ym === '2026-05')?.savingsRate).toBeNull();
    const text = printBlock(rows);
    expect(text).toContain('2026-05: 3 / 0 / 500 / 0 / -497 / —');
    expect(text).toContain('2026-07: 2000 / 0 / 2600 / 0 / -600 / −30%');
    expect(text.split(LEGEND)).toHaveLength(2);
    // The aggregate: 2006 € in, 3500 € out — −74%, still a rate.
    expect(text).toContain('Risparmio: -1494 € in 12 mesi, il −74% delle entrate;');
  });

  it('prints «—» for an aggregate below the floor (B1)', () => {
    const rows = [row('2026-05-10', 'income', 3), row('2026-05-11', 'variable', -500)];
    expect(buildCashflowBlock(rows, input()).savings.rate).toBeNull();
    expect(printBlock(rows)).toContain(`Risparmio: -497 € in 12 mesi (${LEGEND});`);
  });

  it('prints no legend when every month with rows is a rate (B2)', () => {
    const rows = [row('2026-05-10', 'income', 2000), row('2026-05-11', 'variable', -2600)];
    const text = printBlock(rows);
    expect(text).toContain('2026-05: 2000 / 0 / 2600 / 0 / -600 / −30%');
    expect(text).not.toContain(LEGEND);
  });
});

describe('the series', () => {
  it('runs from the first month holding a row, a gap month reads «nessuna riga», the current month is flagged «in corso»', () => {
    const all = months('2024-12', 24).filter((ym) => ym !== '2025-04');
    const rows = all.map((ym) => row(`${ym}-${ym === '2026-11' ? '05' : '10'}`, 'variable', -100));
    const block = buildCashflowBlock(rows, input());
    expect(block.series).toHaveLength(24);
    expect(block.series[0].ym).toBe('2024-12');
    expect(block.series.find((m) => m.ym === '2025-04')).toMatchObject({ rows: 0, state: 'full' });
    const text = printBlock(rows);
    expect(text).toContain('\n2025-04: nessuna riga\n');
    expect(text).toContain('\n2026-11 (in corso, fino al 2026-11-15): 0 / 0 / 100 / 0 / -100 / —\n');
  });

  it('covers the whole recorded history, with no cap (owner, 2026-11-07)', () => {
    const rows = [row('2020-03-10', 'variable', -100), row('2026-10-10', 'variable', -100)];
    const block = buildCashflowBlock(rows, input());
    // 2020-03 → 2026-11: 6 years and 9 months.
    expect(block.series).toHaveLength(81);
    expect(block.series[0]).toMatchObject({ ym: '2020-03', state: 'full', rows: 1, nonNecessary: 100 });
    // The aggregates stay on the 12 full months.
    expect(block.spending.total).toBe(100);
    expect(printBlock(rows)).toContain('serie mensile: 2020-03 → 2026-11) ---');
  });

  it('a transfer or a row after today never opens the series', () => {
    const rows = [
      row('2023-05-10', 'transfer', 500, { linkedCashAssetId: 'a', transferCashAssetId: 'b' }),
      row('2026-11-20', 'variable', -100),
    ];
    expect(buildCashflowBlock(rows, input()).windows.seriesFromYm).toBe('2025-11');
  });

  it('a row before the floor year never opens the series, counts nowhere, and the header says it left it out', () => {
    // The floor opens no month of the series here, yet a row was dropped: the header names the cut
    // (the silent-cap rule, 2026-11-07).
    const rows = [row('2024-12-10', 'variable', -500), row('2025-12-10', 'variable', -100)];
    const settings = { cashflowHistoryStartYear: 2025 };
    const block = buildCashflowBlock(rows, input({ settings }));
    expect(block.series[0]).toMatchObject({ ym: '2025-11', state: 'full', rows: 0 });
    expect(block.spending.total).toBe(100);
    expect(block.windows.beforeFloorRows).toBe(1);
    expect(printBlock(rows, { settings })).toContain('serie mensile: 2025-11 → 2026-11; storico contato dal 2025-01, 1 riga precedente esclusa) ---');
  });

  it('a floor inside the 12 full months prints the months before it and names it in the header', () => {
    const rows = [row('2025-12-10', 'variable', -500), row('2026-02-10', 'variable', -100)];
    const settings = { cashflowHistoryStartYear: 2026 };
    const block = buildCashflowBlock(rows, input({ settings }));
    expect(block.series[0]).toMatchObject({ ym: '2025-11', state: 'before-floor', rows: 0 });
    expect(block.series[1]).toMatchObject({ ym: '2025-12', state: 'before-floor', rows: 0, nonNecessary: 0 });
    expect(block.spending.total).toBe(100);
    const text = printBlock(rows, { settings });
    expect(text).toContain("\n2025-12: prima dell'inizio dello storico\n");
    expect(text).toContain('serie mensile: 2025-11 → 2026-11; storico contato dal 2026-01, 1 riga precedente esclusa) ---');
    expect(printBlock([row('2026-02-10', 'variable', -100)], { settings })).toContain('serie mensile: 2025-11 → 2026-11; storico contato dal 2026-01) ---');
  });

  it('the floor outside the series, with no row before it, is not in the header', () => {
    expect(printBlock([], { settings: { cashflowHistoryStartYear: 2020 } })).toContain('serie mensile: 2025-11 → 2026-11) ---');
  });
});

describe('the medians', () => {
  const spendingFrom = (amounts: number[], from = '2025-11') =>
    months(from, amounts.length).map((ym, i) => row(`${ym}-10`, 'fixed', -amounts[i]));
  const STEPS = Array.from({ length: 12 }, (_, i) => 1000 + i * 100);   // 1.000 … 2.100

  it('are the median and the interquartile range (QUARTILE.INC) of the 12 full months', () => {
    const block = buildCashflowBlock(spendingFrom(STEPS), input());
    expect(block.volatility?.spending).toEqual({ q1: 1275, median: 1550, q3: 1825 });
    expect(block.windows).toMatchObject({ medianFromYm: '2025-11', medianMonths: 12 });
    expect(printBlock(spendingFrom(STEPS))).toContain(
      'Su 12 mesi (dal 2025-11): spesa mensile mediana 1550 €, metà dei mesi fra 1275 € e 1825 €; risparmio mensile mediano -1550 €, metà dei mesi fra -1825 € e -1275 €.');
  });

  it('do not move with an outlier', () => {
    const withOutlier = [...STEPS.slice(0, 11), 9000];
    expect(buildCashflowBlock(spendingFrom(withOutlier), input()).volatility?.spending).toEqual({ q1: 1275, median: 1550, q3: 1825 });
  });

  it('count from the first month holding a row, and say on how many months', () => {
    const block = buildCashflowBlock(spendingFrom(STEPS.slice(0, 9), '2026-02'), input());
    expect(block.windows).toMatchObject({ medianFromYm: '2026-02', medianMonths: 9 });
    expect(printBlock(spendingFrom(STEPS.slice(0, 9), '2026-02'))).toContain('Su 9 mesi (dal 2026-02)');
  });

  it('count a month inside the span with no row as zero', () => {
    const rows = [row('2026-08-10', 'fixed', -300), row('2026-10-10', 'fixed', -600)];
    expect(buildCashflowBlock(rows, input()).volatility?.spending).toEqual({ q1: 150, median: 300, q3: 450 });
  });

  it('are refused under 3 months', () => {
    const rows = spendingFrom([1000, 1100], '2026-09');
    expect(buildCashflowBlock(rows, input()).volatility).toBeNull();
    expect(printBlock(rows)).toContain('Mediane: dati insufficienti per le mediane (2 mesi pieni con dati).');
    expect(printBlock([row('2026-10-10', 'fixed', -100)])).toContain('(1 mese pieno con dati)');
    expect(printBlock([])).toContain('(0 mesi pieni con dati)');
  });

  it('never start before the floor year', () => {
    // The floor guard of the counted rows is the ONE line that holds this (2026-11-07): without it the
    // 2025-12 row would open an 11-month span.
    const rows = [row('2025-12-10', 'fixed', -100), row('2026-08-10', 'fixed', -100), row('2026-09-10', 'fixed', -200), row('2026-10-10', 'fixed', -300)];
    const block = buildCashflowBlock(rows, input({ settings: { cashflowHistoryStartYear: 2026 } }));
    expect(block.windows).toMatchObject({ medianFromYm: '2026-08', medianMonths: 3 });
    expect(block.volatility?.spending).toEqual({ q1: 150, median: 200, q3: 250 });
  });
});

describe('the commitments', () => {
  const rent = { isRecurring: true, recurringParentId: 'rent', recurringFrequency: 'monthly' as const, categoryId: 'casa', categoryName: 'Casa', subCategoryId: 'aff', subCategoryName: 'Affitto' };

  it('a 12-row monthly series is ONE line, with its next date', () => {
    const rows = [...months('2025-12', 12).map((ym) => row(`${ym}-01`, 'fixed', -700, rent)), row('2026-12-01', 'fixed', -700, rent)];
    const block = buildCashflowBlock(rows, input());
    expect(block.commitments.items).toHaveLength(1);
    expect(block.commitments.items[0]).toMatchObject({ kind: 'recurring', frequency: 'monthly', amount: 700, nextIso: '2026-12-01', change: null });
    expect(printBlock(rows)).toContain('Impegni ricorrenti (serie e piani a rate con almeno una riga dal 2025-11): Casa › Affitto mensile 700 € (prossima 2026-12-01).');
  });

  it('a legacy series with no recurringFrequency is monthly', () => {
    const legacy = { isRecurring: true, recurringParentId: 'old', categoryId: 'svago', categoryName: 'Svago' };
    const rows = [row('2026-10-05', 'variable', -10, legacy), row('2026-12-05', 'variable', -10, legacy)];
    // The printer reads anything but 'yearly' as «mensile»: the field is what proves the default.
    expect(buildCashflowBlock(rows, input()).commitments.items[0].frequency).toBe('monthly');
    expect(printBlock(rows)).toContain('Svago mensile 10 € (prossima 2026-12-05)');
  });

  it('an amount change before the floor year is never printed (2026-11-07)', () => {
    const gym = { isRecurring: true, recurringParentId: 'gym', categoryId: 'salute', categoryName: 'Salute' };
    const rows = [
      row('2025-12-05', 'variable', -40, gym),
      ...months('2026-01', 12).map((ym) => row(`${ym}-05`, 'variable', -45, gym)),
    ];
    const block = buildCashflowBlock(rows, input({ settings: { cashflowHistoryStartYear: 2026 } }));
    expect(block.commitments.items[0]).toMatchObject({ amount: 45, change: null, nextIso: '2026-12-05' });
    // Without the floor the 2025-12 row is a change.
    expect(buildCashflowBlock(rows, input()).commitments.items[0].change).toEqual({ from: 40, sinceYm: '2026-01' });
  });

  it('a yearly series, an amount change, an ended series', () => {
    const insurance = { isRecurring: true, recurringParentId: 'ins', recurringFrequency: 'yearly' as const, categoryId: 'auto', categoryName: 'Auto', subCategoryId: 'ass', subCategoryName: 'Assicurazione' };
    const gym = { isRecurring: true, recurringParentId: 'gym', categoryId: 'salute', categoryName: 'Salute', subCategoryId: 'pal', subCategoryName: 'Palestra' };
    const streaming = { isRecurring: true, recurringParentId: 'tv', categoryId: 'svago', categoryName: 'Svago', subCategoryId: 'str', subCategoryName: 'Streaming' };
    const rows = [
      row('2026-03-10', 'fixed', -600, insurance), row('2027-03-10', 'fixed', -600, insurance),
      row('2026-01-05', 'variable', -40, gym), row('2026-02-05', 'variable', -40, gym),
      ...months('2026-03', 10).map((ym) => row(`${ym}-05`, 'variable', -45, gym)),
      ...months('2026-01', 6).map((ym) => row(`${ym}-20`, 'variable', -12, streaming)),
    ];
    const text = printBlock(rows);
    expect(text).toContain('Auto › Assicurazione annuale 600 € (prossima 2027-03-10)');
    expect(text).toContain('Salute › Palestra mensile 45 € (da 40 € a 45 € dal 2026-03; prossima 2026-12-05)');
    expect(text).toContain('Svago › Streaming mensile 12 € (terminata il 2026-06)');
    // Active first by monthly equivalent (600/12 = 50 > 45), the ended last.
    expect(buildCashflowBlock(rows, input()).commitments.items.map((c) => c.key)).toEqual(['ins', 'gym', 'tv']);
  });

  it('an instalment plan reads «rata N di M», or «prima rata il …» before the first', () => {
    const phone = { installmentParentId: 'phone', isInstallment: true, installmentTotal: 12, categoryId: 'tech', categoryName: 'Tecnologia', subCategoryId: 'tel', subCategoryName: 'Telefono' };
    const sofa = { installmentParentId: 'sofa', isInstallment: true, installmentTotal: 6, categoryId: 'casa', categoryName: 'Casa' };
    const rows = [
      ...months('2026-05', 12).map((ym, i) => row(`${ym}-15`, 'variable', -50, { ...phone, installmentNumber: i + 1 })),
      ...months('2026-12', 6).map((ym, i) => row(`${ym}-01`, 'variable', -30, { ...sofa, installmentNumber: i + 1 })),
    ];
    const text = printBlock(rows);
    expect(text).toContain('Tecnologia › Telefono a rate 50 €, rata 7 di 12 (prossima 2026-12-15)');
    expect(text).toContain('Casa a rate 30 €, prima rata il 2026-12-01');
  });

  it('never lists a series whose rows all precede the window, nor a row with isRecurring and no parent', () => {
    const old = { isRecurring: true, recurringParentId: 'old' };
    const rows = [row('2025-09-10', 'fixed', -10, old), row('2026-05-10', 'fixed', -10, { isRecurring: true })];
    expect(buildCashflowBlock(rows, input()).commitments.items).toEqual([]);
    expect(printBlock(rows)).toContain('Impegni ricorrenti: nessuna serie né piano a rate dal 2025-11.');
  });

  it(`cuts at ${CASHFLOW_BLOCK_ROW_CAP} AFTER sorting: the largest are printed, «e altre N non elencate»`, () => {
    // 50 series, the smallest first in id order: a cut before sorting would print the small ones.
    const rows = Array.from({ length: 50 }, (_, i) =>
      row('2026-12-01', 'variable', -(i + 1), { isRecurring: true, recurringParentId: `s-${String(i).padStart(2, '0')}`, categoryId: 'abb', categoryName: 'Abbonamenti', subCategoryId: `x${i}`, subCategoryName: `Servizio ${i + 1}` }));
    const block = buildCashflowBlock(rows, input());
    expect(block.commitments.items).toHaveLength(CASHFLOW_BLOCK_ROW_CAP);
    expect(block.commitments.cut).toBe(10);
    expect(block.commitments.items[0].amount).toBe(50);
    expect(block.commitments.items.map((c) => c.amount)).not.toContain(1);
    expect(printBlock(rows)).toContain('Abbonamenti › Servizio 11 mensile 11 € (prossima 2026-12-01); e altre 10 non elencate.');
  });
});

describe('the loans', () => {
  const loans = [asset('loan-car', 'Prestito auto', 'loan', 'cash', 5000)];
  const car = { debtAssetId: 'loan-car', isRecurring: true, recurringParentId: 'car-series', categoryId: 'prestiti', categoryName: 'Prestiti' };

  it('a recurring `debt` series naming a loan is listed under the loan only, never among the commitments', () => {
    const rows = [...FULL.map((ym) => row(`${ym}-01`, 'debt', -100, car)), row('2026-12-01', 'debt', -100, car)];
    const block = buildCashflowBlock(rows, input({ assets: loans }));
    expect(block.commitments.items).toEqual([]);
    expect(block.loans.items).toEqual([{ debtAssetId: 'loan-car', name: 'Prestito auto', monthly: 100, monthlyRows: 12, payoff: 0, nextIso: '2026-12-01' }]);
    expect(printBlock(rows, { assets: loans })).toContain('Rate di prestito: Prestito auto 100 €/mese (mediana su 12 rate; prossima 2026-12-01).');
  });

  it('keeps a payoff out of the median and sums it apart', () => {
    // Six instalments at 100, six at 120: median 110; a 5.000 payoff in the median would make it 120.
    const rows = [
      ...FULL.map((ym, i) => row(`${ym}-01`, 'debt', i < 6 ? -100 : -120, car)),
      row('2026-06-20', 'debt', -5000, { debtAssetId: 'loan-car', isDebtPayoff: true, categoryId: 'prestiti', categoryName: 'Prestiti' }),
    ];
    const block = buildCashflowBlock(rows, input({ assets: loans }));
    expect(block.loans.items[0]).toMatchObject({ monthly: 110, monthlyRows: 12, payoff: 5000, nextIso: null });
    expect(printBlock(rows, { assets: loans })).toContain('Prestito auto 110 €/mese (mediana su 12 rate; estinzioni anticipate 5000 €)');
  });

  it('a loan no longer among the assets reads «prestito eliminato»; a `debt` row with no loan and no series is declared', () => {
    const rows = [
      row('2026-09-01', 'debt', -100, { debtAssetId: 'loan-gone' }),
      row('2026-12-01', 'debt', -100, { debtAssetId: 'loan-gone' }),
      row('2026-05-10', 'debt', -200), row('2026-06-10', 'debt', -100),
    ];
    const block = buildCashflowBlock(rows, input());
    expect(block.loans.items[0].name).toBeNull();
    expect(block.loans.unlinked).toEqual({ rows: 2, total: 300 });
    expect(printBlock(rows)).toContain('Rate di prestito: prestito eliminato 100 €/mese (mediana su 1 rata; prossima 2026-12-01). 2 rate senza prestito collegato, 300 €.');
  });

  it('a `debt` row with no loan inside a series or a plan is the commitment\'s, never an unlinked instalment', () => {
    const rows = [
      row('2026-05-10', 'debt', -100, { isRecurring: true, recurringParentId: 'p', categoryId: 'prestiti', categoryName: 'Prestiti' }),
      row('2026-06-10', 'debt', -50, { installmentParentId: 'plan', installmentNumber: 1, installmentTotal: 2, categoryId: 'prestiti', categoryName: 'Prestiti' }),
      row('2026-07-10', 'debt', -200),
    ];
    const block = buildCashflowBlock(rows, input());
    expect(block.loans.unlinked).toEqual({ rows: 1, total: 200 });
    expect(block.commitments.items.map((c) => c.key).sort()).toEqual(['p', 'plan']);
  });

  it('names a loan only when the asset IS a loan, and the next instalment skips a payoff', () => {
    const assets = [...loans, asset('acc-a', 'Conto A', 'cash', 'cash', 1000)];
    const rows = [
      row('2026-09-01', 'debt', -100, { debtAssetId: 'acc-a' }),
      row('2026-10-01', 'debt', -100, car),
      row('2026-11-20', 'debt', -2000, { debtAssetId: 'loan-car', isDebtPayoff: true }),
      row('2026-12-01', 'debt', -100, car),
    ];
    const block = buildCashflowBlock(rows, input({ assets }));
    // Equal medians: ordered by name, and a nameless line sorts first.
    expect(block.loans.items.map((l) => [l.debtAssetId, l.name, l.nextIso])).toEqual([
      ['acc-a', null, null], ['loan-car', 'Prestito auto', '2026-12-01'],
    ]);
  });

  it('a loan with no instalment in the 12 months and none ahead says so, its payoff in brackets', () => {
    const rows = [row('2026-06-20', 'debt', -5000, { debtAssetId: 'loan-car', isDebtPayoff: true })];
    expect(printBlock(rows, { assets: loans })).toContain('Rate di prestito: Prestito auto: nessuna rata nei 12 mesi pieni (estinzioni anticipate 5000 €).');
  });

  it('a loan with no instalment yet reads «prima rata il …»; none at all reads «nessuna»', () => {
    const rows = [row('2026-12-01', 'debt', -100, { debtAssetId: 'loan-car' })];
    expect(printBlock(rows, { assets: loans })).toContain('Rate di prestito: Prestito auto: prima rata il 2026-12-01.');
    expect(printBlock([])).toContain('Rate di prestito: nessuna.');
  });
});

describe('transfers and the rows that count', () => {
  const assets = [
    asset('acc-a', 'Conto A', 'cash', 'cash', 1000),
    asset('acc-b', 'Conto B', 'cash', 'cash', 1000),
    asset('home', 'Casa', 'realestate', 'realestate', 200000),
  ];

  it('transfers are out of income and spending, counted apart, those touching a property named; fee, «Fuori dal budget» and pending rows count', () => {
    const rows = [
      row('2026-03-10', 'transfer', 1000, { linkedCashAssetId: 'acc-a', transferCashAssetId: 'acc-b' }),
      row('2026-04-10', 'transfer', 500, { linkedCashAssetId: 'acc-b', transferCashAssetId: 'acc-a' }),
      row('2026-05-10', 'transfer', 5000, { linkedCashAssetId: 'acc-a', transferCashAssetId: 'home' }),
      row('2026-03-10', 'variable', -5, { feeOfTransferId: 'x' }),
      row('2026-06-10', 'variable', -100, { excludeFromBudget: true }),
      row('2026-10-30', 'fixed', -50, { balancePending: true }),
    ];
    const block = buildCashflowBlock(rows, input({ assets }));
    expect(block.transfers).toEqual({ rows: 3, moved: 6500, property: { rows: 1, moved: 5000 } });
    expect(block.spending.total).toBe(155);
    expect(block.income.total).toBe(0);
    expect(block.series.find((m) => m.ym === '2026-03')?.rows).toBe(1);
    expect(printBlock(rows, { assets })).toContain(
      'Trasferimenti fra conti: 3 righe, 6500 € mossi, di cui 1 verso o da immobili, 5000 € (non contati né fra le entrate né fra le uscite).');
    expect(printBlock([])).toContain('Trasferimenti fra conti: nessuno.');
  });

  it('a transfer FROM a property is named too', () => {
    const rows = [row('2026-05-10', 'transfer', 3000, { linkedCashAssetId: 'home', transferCashAssetId: 'acc-a' })];
    expect(buildCashflowBlock(rows, input({ assets })).transfers.property).toEqual({ rows: 1, moved: 3000 });
  });
});

describe('the accounts', () => {
  const assets = [
    asset('acc-main', 'Conto principale', 'cash', 'cash', 6200),
    asset('acc-save', 'Conto risparmio', 'cash', 'cash', 12000),
    asset('acc-closed', 'Conto chiuso', 'cash', 'cash', 0),
    asset('etf-mm', 'ETF Monetario', 'etf', 'cash', 30000),
  ];
  const assetValueOf = (a: Asset) => a.quantity;

  it('buildCashAccountLines returns EVERY cash account, a closed one included, never a money-market ETF', () => {
    const lines = buildCashAccountLines(assets, { defaultDebitCashAssetId: 'acc-main', defaultCreditCashAssetId: 'acc-main' }, assetValueOf);
    expect(lines).toEqual([
      { id: 'acc-save', name: 'Conto risparmio', balance: 12000, roles: [] },
      { id: 'acc-main', name: 'Conto principale', balance: 6200, roles: ['addebito', 'accredito'] },
      { id: 'acc-closed', name: 'Conto chiuso', balance: 0, roles: [] },
    ]);
  });

  it('the block drops a closed account with no role, and keeps it once it is the default debit', () => {
    const settings = { defaultDebitCashAssetId: 'acc-main', defaultCreditCashAssetId: 'acc-main' };
    const block = buildCashflowBlock([], input({ assets, settings, assetValueOf }));
    expect(block.accounts.map((a) => a.id)).toEqual(['acc-save', 'acc-main']);
    expect(printBlock([], { assets, settings, assetValueOf })).toContain(
      'Conti liquidi: Conto risparmio 12.000 €; Conto principale 6200 € (addebito e accredito predefiniti).');
    const named = buildCashflowBlock([], input({ assets, settings: { defaultDebitCashAssetId: 'acc-closed' }, assetValueOf }));
    expect(named.accounts.map((a) => [a.id, a.roles])).toEqual([['acc-save', []], ['acc-main', []], ['acc-closed', ['addebito']]]);
    expect(printBlock([], { assets, settings: { defaultDebitCashAssetId: 'acc-closed' }, assetValueOf })).toContain('Conto chiuso 0 € (addebito predefinito)');
    expect(printBlock([])).toContain('Conti liquidi: nessun conto registrato.');
  });
});

describe('the printed block', () => {
  it('is printed whole, line for line', () => {
    const categories = [
      category('inc-sal', 'Stipendio', 'income', [['s-a', 'Azienda A']]),
      category('inc-div', 'Dividendi', 'income'),
      category('casa', 'Casa', 'fixed', [['aff', 'Affitto']]),
      category('svago', 'Svago', 'variable'),
      category('prestiti', 'Prestiti', 'debt'),
      category('abb', 'Abbonamenti', 'variable', Array.from({ length: 40 }, (_, i): [string, string] => [`x${i + 1}`, `S${String(i + 1).padStart(2, '0')}`])),
    ];
    const assets = [
      asset('acc-main', 'Conto principale', 'cash', 'cash', 6200),
      asset('acc-save', 'Conto risparmio', 'cash', 'cash', 12000),
      asset('acc-closed', 'Conto chiuso', 'cash', 'cash', 0),
      asset('etf-mm', 'ETF Monetario', 'etf', 'cash', 30000),
      asset('loan-car', 'Prestito auto', 'loan', 'cash', 3000),
      asset('home', 'Casa al mare', 'realestate', 'realestate', 150000),
    ];
    const settings = {
      dividendIncomeCategoryId: 'inc-div', cashflowHistoryStartYear: 2025,
      defaultDebitCashAssetId: 'acc-main', defaultCreditCashAssetId: 'acc-main',
    };
    const salary = { categoryId: 'inc-sal', categoryName: 'Stipendio', subCategoryId: 's-a', subCategoryName: 'Azienda A' };
    const rent = { isRecurring: true, recurringParentId: 'rent', recurringFrequency: 'monthly' as const, categoryId: 'casa', categoryName: 'Casa', subCategoryId: 'aff', subCategoryName: 'Affitto' };
    const car = { debtAssetId: 'loan-car', isRecurring: true, recurringParentId: 'car', categoryId: 'prestiti', categoryName: 'Prestiti' };

    // 2024-12 (before the floor: it never opens the series) → 2026-11, no row at all in 2025-04.
    const lived = months('2024-12', 24).filter((ym) => ym !== '2025-04' && ym !== '2026-11');
    const rows: Expense[] = [
      ...lived.map((ym) => row(`${ym}-27`, 'income', 2000, salary)),
      ...lived.map((ym) => row(`${ym}-01`, 'fixed', -700, rent)),
      row('2025-03-15', 'variable', -1300.3, { categoryId: 'svago', categoryName: 'Svago' }),
      row('2026-06-10', 'income', 100, { categoryId: 'inc-div', categoryName: 'Dividendi' }),
      ...FULL.map((ym) => row(`${ym}-05`, 'debt', -100, car)),
      row('2026-12-05', 'debt', -100, car),
      row('2026-03-10', 'transfer', 5000, { linkedCashAssetId: 'acc-main', transferCashAssetId: 'home' }),
      row('2026-04-10', 'transfer', 1000, { linkedCashAssetId: 'acc-main', transferCashAssetId: 'acc-save' }),
      // The current month: two rows up to today, one scheduled after it.
      row('2026-11-01', 'fixed', -700, rent),
      row('2026-11-05', 'income', 2000, salary),
      row('2026-11-25', 'variable', -50, { categoryId: 'svago', categoryName: 'Svago' }),
      ...months('2026-12', 6).map((ym) => row(`${ym}-01`, 'fixed', -700, rent)),
      // 40 subscriptions with only future rows: listed (a row after the window's start), counted nowhere.
      ...Array.from({ length: 40 }, (_, i) =>
        row('2026-12-01', 'variable', -(i + 1), { isRecurring: true, recurringParentId: `abb-${i + 1}`, categoryId: 'abb', categoryName: 'Abbonamenti', subCategoryId: `x${i + 1}`, subCategoryName: `S${String(i + 1).padStart(2, '0')}` })),
    ];

    const subscriptions = Array.from({ length: 39 }, (_, i) => 40 - i)
      .map((n) => `Abbonamenti › S${String(n).padStart(2, '0')} mensile ${n} € (prossima 2026-12-01)`)
      .join('; ');
    const expected = [
      '--- CASHFLOW 12 MESI (ultimi 12 mesi pieni: 2025-11 → 2026-10; il mese in corso 2026-11 fino al 2026-11-15, a parte; serie mensile: 2025-01 → 2026-11; storico contato dal 2025-01, 2 righe precedenti escluse) ---',
      'Entrate: 24.100 € in 12 mesi (di cui dividendi e cedole 100 €, fuori dalle fonti). Fonti (totale, quota, mesi presenti): Stipendio › Azienda A 24.000 € 100% (12). Concentrazione: una fonte dominante (100%), HHI 1,00.',
      'Uscite: 9600 € in 12 mesi — Spese Necessarie 8400 € (88%), Spese Non Necessarie 0 € (0%), Debiti 1200 € (13%). Per categoria: Casa 8400 € (88%: Affitto 8400 €); Prestiti 1200 € (13%).',
      'Risparmio: 14.500 € in 12 mesi, il 60% delle entrate; le rate contano per intero: la quota capitale riduce il debito.',
      'Su 12 mesi (dal 2025-11): spesa mensile mediana 800 €, metà dei mesi fra 800 € e 800 €; risparmio mensile mediano 1200 €, metà dei mesi fra 1200 € e 1200 €.',
      'Il mese in corso (2026-11, fino al 2026-11-15): entrate 2000 €, uscite 700 € (2 righe); più 1 riga programmata fino a fine mese (uscite 50 €, entrate 0 €), non contata.',
      'Serie mensile in euro (entrate / Spese Necessarie / Spese Non Necessarie / Debiti / risparmio / tasso di risparmio):',
      '2025-01: 2000 / 700 / 0 / 0 / 1300 / 65%',
      '2025-02: 2000 / 700 / 0 / 0 / 1300 / 65%',
      '2025-03: 2000 / 700 / 1300 / 0 / 0 / 0%',
      '2025-04: nessuna riga',
      '2025-05: 2000 / 700 / 0 / 0 / 1300 / 65%',
      '2025-06: 2000 / 700 / 0 / 0 / 1300 / 65%',
      '2025-07: 2000 / 700 / 0 / 0 / 1300 / 65%',
      '2025-08: 2000 / 700 / 0 / 0 / 1300 / 65%',
      '2025-09: 2000 / 700 / 0 / 0 / 1300 / 65%',
      '2025-10: 2000 / 700 / 0 / 0 / 1300 / 65%',
      '2025-11: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2025-12: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-01: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-02: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-03: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-04: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-05: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-06: 2100 / 700 / 0 / 100 / 1300 / 62%',
      '2026-07: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-08: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-09: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-10: 2000 / 700 / 0 / 100 / 1200 / 60%',
      '2026-11 (in corso, fino al 2026-11-15): 2000 / 700 / 0 / 0 / 1300 / 65%',
      `Impegni ricorrenti (serie e piani a rate con almeno una riga dal 2025-11): Casa › Affitto mensile 700 € (prossima 2026-12-01); ${subscriptions}; e altra 1 non elencata.`,
      'Rate di prestito: Prestito auto 100 €/mese (mediana su 12 rate; prossima 2026-12-05).',
      'Trasferimenti fra conti: 2 righe, 6000 € mossi, di cui 1 verso o da immobili, 5000 € (non contati né fra le entrate né fra le uscite).',
      'Conti liquidi: Conto risparmio 12.000 €; Conto principale 6200 € (addebito e accredito predefiniti).',
    ].join('\n');

    expect(printBlock(rows, { categories, assets, settings, assetValueOf: (a) => a.quantity })).toBe(expected);
  });

  it('reads every count singular at 1, and a rounded zero never as «-0 €»', () => {
    const rows = [
      row('2026-05-10', 'income', 100.2),
      row('2026-05-11', 'variable', -100.4, { categoryId: 'svago', categoryName: 'Svago' }),
      row('2026-05-12', 'debt', -0.3),
      row('2026-06-10', 'transfer', 100, { linkedCashAssetId: 'a', transferCashAssetId: 'b' }),
      row('2026-11-01', 'variable', -10),
      row('2026-11-20', 'variable', -10),
    ];
    const text = printBlock(rows);
    expect(text).toContain('Risparmio: 0 € in 12 mesi, il 0% delle entrate');
    expect(text).not.toContain('-0 €');
    expect(text).not.toContain('-0%');
    expect(text).toContain('2026-05: 100 / 0 / 100 / 0 / 0 / 0%');
    expect(text).toContain('uscite 10 € (1 riga); più 1 riga programmata fino a fine mese (uscite 10 €, entrate 0 €), non contata.');
    expect(text).toContain('Trasferimenti fra conti: 1 riga, 100 € mossi (non contati');
    expect(text).toContain('1 rata senza prestito collegato, 0 €');
  });
});
