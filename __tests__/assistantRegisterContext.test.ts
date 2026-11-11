/**
 * The Registra mode's context: the ids a proposal may copy, the recent rows of an ITALIAN window
 * (one line per recurring series, every cut printed) and the month so far.
 *
 * Every figure and name is invented. Amounts print as `formatNumberIt` prints them: it-IT groups
 * from five digits, so «2500,00 €» carries no dot. The suite runs in Europe/Rome, the machine's zone and UTC:
 * the rows beside the window's first midnight are built with `fromZonedTime`, by the Italian clock.
 */
import { describe, expect, it } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';
import {
  REGISTER_MONTH_BUDGET_ROWS_CAP,
  REGISTER_RECENT_ROWS_CAP,
  buildAssistantRegisterContext,
  formatRegisterContextForPrompt,
  summarizeRegisterContext,
  type AssistantRegisterContextInput,
} from '@/lib/utils/assistantRegisterContext';
import type { Asset } from '@/types/assets';
import type { BudgetConfig, BudgetItem } from '@/types/budget';
import type { CostCenter } from '@/types/costCenters';
import type { DashboardOverviewExpenseStats } from '@/types/dashboardOverview';
import type { Expense, ExpenseCategory } from '@/types/expenses';

const NOW = new Date('2026-11-01T10:00:00Z'); // domenica 1 novembre 2026, 11:00 in Italy
const italian = (isoDay: string, time = '12:00:00.000'): Date => fromZonedTime(`${isoDay}T${time}`, 'Europe/Rome');

function category(id: string, name: string, type: ExpenseCategory['type'], subs: [string, string][] = []): ExpenseCategory {
  return {
    id, userId: 'u1', name, type,
    subCategories: subs.map(([subId, subName]) => ({ id: subId, name: subName })),
    createdAt: NOW, updatedAt: NOW,
  } as ExpenseCategory;
}

function cash(id: string, name: string, balance: number): Asset {
  return { id, userId: 'u1', name, type: 'cash', assetClass: 'cash', quantity: balance, currentPrice: 1, currency: 'EUR' } as Asset;
}

let nextId = 0;
function row(overrides: Partial<Expense> & { date: Date }): Expense {
  nextId += 1;
  return {
    id: `exp-${String(nextId).padStart(4, '0')}`, userId: 'u1', type: 'variable', categoryId: 'cat-cibo', categoryName: 'Cibo',
    amount: -10, currency: 'EUR', createdAt: NOW, updatedAt: NOW,
    ...overrides,
  } as Expense;
}

const CATEGORIES = [
  category('cat-cibo', 'Cibo', 'variable', [['sub-spesa', 'Spesa']]),
  category('cat-casa', 'Casa', 'fixed'),
  category('cat-stipendio', 'Stipendio', 'income'),
  category('cat-mutuo', 'Mutuo', 'debt'),
  category('cat-giro', 'Giroconto', 'transfer'),
];

function input(overrides: Partial<AssistantRegisterContextInput> = {}): AssistantRegisterContextInput {
  return {
    now: NOW,
    categories: CATEGORIES,
    assets: [
      cash('acc-main', 'Conto principale', 2500),
      cash('acc-empty', 'Conto vuoto', 0),
      { id: 'etf-1', userId: 'u1', name: 'ETF Monetario', type: 'etf', assetClass: 'cash', quantity: 10, currentPrice: 100, currency: 'EUR' } as Asset,
    ],
    settings: {
      defaultDebitCashAssetId: 'acc-main', defaultCreditCashAssetId: 'acc-main',
      costCentersEnabled: true, expenseSplitEnabled: true, familyMembers: [{ id: 'm-anna', name: 'Anna' }],
    },
    costCenters: [
      { id: 'cc-auto', userId: 'u1', name: 'Automobile' } as CostCenter,
      { id: 'cc-old', userId: 'u1', name: 'Vecchia casa', archivedAt: NOW } as CostCenter,
    ],
    recentExpenses: [],
    month: { stats: null, budget: null, budgetFailed: false },
    assetValueOf: (asset) => asset.quantity * (asset.currentPrice ?? 1),
    ...overrides,
  };
}

const stats = (currentMonth: DashboardOverviewExpenseStats['currentMonth']): DashboardOverviewExpenseStats =>
  ({ currentMonth, previousMonth: { income: 0, expenses: 0, net: 0 } }) as DashboardOverviewExpenseStats;

function budgetItem(overrides: Partial<BudgetItem>): BudgetItem {
  return { id: 'b', kind: 'expense', scope: 'category', period: 'monthly', amount: 100, order: 0, ...overrides } as BudgetItem;
}

const budget = (items: BudgetItem[], overallMonthlyAmount?: number): BudgetConfig =>
  ({ userId: 'u1', items, overallMonthlyAmount, updatedAt: NOW }) as BudgetConfig;

describe('buildAssistantRegisterContext — ids', () => {
  it('prints today by the Italian calendar: the weekday, the date, the ISO form', () => {
    const block = formatRegisterContextForPrompt(buildAssistantRegisterContext(input()));
    expect(block).toContain('--- REGISTRA ---');
    expect(block).toContain('Oggi: domenica 1 novembre 2026 (2026-11-01)');
  });

  it('is already tomorrow in Italy at 23:30 UTC', () => {
    const ctx = buildAssistantRegisterContext(input({ now: new Date('2026-11-01T23:30:00Z') }));
    expect(ctx.today).toEqual({ iso: '2026-11-02', label: 'lunedì 2 novembre 2026' });
  });

  it('lists every category with its id, its type label and its subcategories', () => {
    const block = formatRegisterContextForPrompt(buildAssistantRegisterContext(input()));
    expect(block).toContain('[cat-cibo] Cibo · Spese Non Necessarie');
    expect(block).toContain('  - [sub-spesa] Spesa');
    expect(block).toContain('[cat-casa] Casa · Spese Necessarie');
    expect(block).toContain('[cat-stipendio] Stipendio · Entrate');
  });

  it('lists a debt and a transfer category like any other: every type is proposable since 2026-11', () => {
    const block = formatRegisterContextForPrompt(buildAssistantRegisterContext(input()));
    expect(block).toContain('[cat-mutuo] Mutuo · Debiti');
    expect(block).toContain('[cat-giro] Giroconto · Trasferimento');
    expect(block).not.toContain('non proponibile');
  });

  it('says so when there is no category', () => {
    expect(formatRegisterContextForPrompt(buildAssistantRegisterContext(input({ categories: [] })))).toContain('Nessuna categoria configurata');
  });

  it('lists the cash ACCOUNTS only, a zero balance included, with the default roles', () => {
    const ctx = buildAssistantRegisterContext(input());
    const block = formatRegisterContextForPrompt(ctx);
    expect(ctx.accounts.map((a) => a.id)).toEqual(['acc-main', 'acc-empty']);
    expect(block).toContain('[acc-main] Conto principale · 2500,00 € · addebito predefinito · accredito predefinito');
    expect(block).toContain('[acc-empty] Conto vuoto · 0,00 €');
    expect(block).not.toContain('ETF Monetario');
    expect(ctx.defaults).toEqual({ debitId: 'acc-main', creditId: 'acc-main' });
  });

  it('drops a default that is not a listed account', () => {
    const ctx = buildAssistantRegisterContext(input({
      settings: { defaultDebitCashAssetId: 'gone', defaultCreditCashAssetId: undefined, costCentersEnabled: false, expenseSplitEnabled: false, familyMembers: [] },
    }));
    expect(ctx.defaults).toEqual({ debitId: null, creditId: null });
  });

  it('says a row moves no balance when there is no account', () => {
    const block = formatRegisterContextForPrompt(buildAssistantRegisterContext(input({ assets: [] })));
    expect(block).toContain('Nessun conto configurato: una riga proposta non muove alcun saldo');
  });

  it('lists the centres that are not archived and the members, or says the feature is off', () => {
    const on = formatRegisterContextForPrompt(buildAssistantRegisterContext(input()));
    expect(on).toContain('[cc-auto] Automobile');
    expect(on).not.toContain('Vecchia casa');
    expect(on).toContain('[m-anna] Anna');

    const off = formatRegisterContextForPrompt(buildAssistantRegisterContext(input({
      settings: { costCentersEnabled: false, expenseSplitEnabled: false, familyMembers: [{ id: 'm-anna', name: 'Anna' }] },
    })));
    expect(off).toContain('Centri di costo: non attivi');
    expect(off).toContain('Intestatari: non attivi');
    expect(off).not.toContain('[m-anna]');
  });
});

describe('buildAssistantRegisterContext — recent rows', () => {
  it('opens the window at the Italian midnight of the first day, eleven months back', () => {
    const ctx = buildAssistantRegisterContext(input({
      recentExpenses: [
        row({ date: italian('2025-12-01', '00:00:00.000'), notes: 'dentro' }),
        row({ date: italian('2025-11-30', '23:59:59.999'), notes: 'fuori' }),
      ],
    }));
    expect(ctx.recent?.sinceIso).toBe('2025-12-01');
    expect(ctx.recent?.rows.map((r) => r.note)).toEqual(['dentro']);
    expect(ctx.recent?.read).toBe(1);
  });

  it('leaves out a row dated after the Italian today', () => {
    const ctx = buildAssistantRegisterContext(input({
      recentExpenses: [row({ date: italian('2026-11-01'), notes: 'oggi' }), row({ date: italian('2026-11-02', '00:00:00.000'), notes: 'domani' })],
    }));
    expect(ctx.recent?.rows.map((r) => r.note)).toEqual(['oggi']);
  });

  it('prints a row with its ids, newest first', () => {
    const ctx = buildAssistantRegisterContext(input({
      recentExpenses: [
        row({ date: italian('2026-10-10'), amount: -42.5, subCategoryId: 'sub-spesa', subCategoryName: 'Spesa', linkedCashAssetId: 'acc-main', notes: 'Mercato', costCenterName: 'Automobile', personalMemberId: 'm-anna', excludeFromBudget: true }),
        row({ date: italian('2026-10-20'), type: 'income', categoryId: 'cat-stipendio', categoryName: 'Stipendio', amount: 2000 }),
      ],
    }));
    const block = formatRegisterContextForPrompt(ctx);
    expect(ctx.recent?.rows.map((r) => r.dateIso)).toEqual(['2026-10-20', '2026-10-10']);
    expect(block).toContain('2026-10-20 · Entrate · 2000,00 € · Stipendio [cat-stipendio]');
    expect(block).toContain(
      '2026-10-10 · Spese Non Necessarie · 42,50 € · Cibo [cat-cibo] › Spesa [sub-spesa] · Conto principale [acc-main] · centro Automobile · di Anna · «Mercato» · fuori budget',
    );
  });

  it('collapses a recurring series to its newest occurrence up to today, and counts those', () => {
    const series = Array.from({ length: 12 }, (_, index) =>
      row({
        date: italian(`${index === 0 ? '2025-12' : `2026-${String(index).padStart(2, '0')}`}-05`),
        type: 'fixed', categoryId: 'cat-casa', categoryName: 'Casa', amount: -700,
        isRecurring: true, recurringParentId: 'series-affitto',
      }),
    );
    const ctx = buildAssistantRegisterContext(input({ recentExpenses: [...series, row({ date: italian('2026-10-30') })] }));
    // The occurrence of 5 November is still to come: eleven are in the window, the newest of 5 October.
    expect(ctx.recent?.rows).toHaveLength(2);
    expect(ctx.recent?.read).toBe(12);
    const line = ctx.recent?.rows.find((r) => r.recurringParentId === 'series-affitto');
    expect(line).toMatchObject({ dateIso: '2026-10-05', series: { count: 11, frequency: 'monthly' } });
  });

  it('counts twelve occurrences of a series that fits the window: «serie ×12, mensile»', () => {
    const months = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
    const series = months.map((month) =>
      row({ date: italian(`${month}-01`), type: 'fixed', categoryId: 'cat-casa', categoryName: 'Casa', amount: -700, isRecurring: true, recurringParentId: 'series-affitto' }),
    );
    const ctx = buildAssistantRegisterContext(input({ recentExpenses: series }));
    expect(ctx.recent?.rows).toHaveLength(1);
    expect(formatRegisterContextForPrompt(ctx)).toContain('2026-11-01 · Spese Necessarie · 700,00 € · Casa [cat-casa] · serie ×12, mensile');
  });

  it('cuts the OLDEST lines past the cap and prints how many', () => {
    const rows = Array.from({ length: REGISTER_RECENT_ROWS_CAP + 10 }, (_, index) => {
      const day = new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10); // 2026-01-01 … 2026-11-06
      return row({ date: italian(day), notes: `riga ${index}` });
    }).filter((r) => r.date <= italian('2026-11-01', '23:59:59.999'));
    // 305 rows fit the window up to today (1 January → 1 November): add five more on its first days.
    const extra = Array.from({ length: 5 }, (_, index) => row({ date: italian(`2025-12-0${index + 1}`), notes: `vecchia ${index}` }));
    const all = [...rows, ...extra];
    expect(all).toHaveLength(REGISTER_RECENT_ROWS_CAP + 10);

    const ctx = buildAssistantRegisterContext(input({ recentExpenses: all }));
    expect(ctx.recent?.rows).toHaveLength(REGISTER_RECENT_ROWS_CAP);
    expect(ctx.recent?.cut).toBe(10);
    expect(ctx.recent?.read).toBe(REGISTER_RECENT_ROWS_CAP + 10);
    // The newest row is printed, the oldest ones are the ones cut.
    expect(ctx.recent?.rows[0].dateIso).toBe('2026-11-01');
    expect(ctx.recent?.rows.some((r) => r.note?.startsWith('vecchia'))).toBe(false);
    expect(formatRegisterContextForPrompt(ctx)).toContain('(le 10 righe più vecchie sono omesse; sotto le 300 più recenti)');
    expect(summarizeRegisterContext(ctx).recent).toEqual({ rows: 300, cut: 10 });
  });

  it('is null in the browser, where no row is read', () => {
    const ctx = buildAssistantRegisterContext(input({ recentExpenses: null, month: null }));
    expect(ctx.recent).toBeNull();
    expect(ctx.month).toBeNull();
    expect(summarizeRegisterContext(ctx)).toEqual({
      accounts: ctx.accounts, categories: 5, costCentersEnabled: true, membersEnabled: true, recent: null,
    });
  });
});

describe('buildAssistantRegisterContext — IL MESE', () => {
  const monthRows = [
    row({ date: italian('2026-11-01'), type: 'fixed', categoryId: 'cat-casa', categoryName: 'Casa', amount: -700 }),
    row({ date: italian('2026-11-01'), amount: -540 }),
    row({ date: italian('2026-10-31'), amount: -99 }), // last month: not in «finora»
    row({ date: italian('2026-11-01'), type: 'income', categoryId: 'cat-stipendio', categoryName: 'Stipendio', amount: 2000 }),
  ];

  it('prints the totals of the Panoramica and the split by type of the month so far', () => {
    const ctx = buildAssistantRegisterContext(input({
      recentExpenses: monthRows,
      month: { stats: stats({ income: 2000, expenses: 1500, net: 500, expensesScheduled: 260 }), budget: null, budgetFailed: false },
    }));
    const block = formatRegisterContextForPrompt(ctx);
    expect(block).toContain('--- IL MESE (novembre 2026) ---');
    expect(block).toContain('Entrate 2000,00 € · Spese 1500,00 € (di cui 260,00 € in calendario dopo oggi) · Saldo 500,00 €');
    expect(block).toContain('Spese finora per tipo: Spese Necessarie 700,00 € · Spese Non Necessarie 540,00 € · Debiti 0,00 €');
    expect(block).toContain('Budget: nessuno configurato.');
  });

  it('never prints zeros for a summary that was not read', () => {
    const ctx = buildAssistantRegisterContext(input({ recentExpenses: monthRows, month: { stats: null, budget: null, budgetFailed: true } }));
    const block = formatRegisterContextForPrompt(ctx);
    expect(ctx.month?.totals).toBeNull();
    expect(block).toContain('Riepilogo del mese non disponibile: lettura non riuscita.');
    expect(block).not.toContain('Entrate 0,00 €');
    expect(block).toContain('Budget: lettura non riuscita.');
  });

  it('measures a budget with the Budget tab’s rules: 540 of 600 is 90%', () => {
    const ctx = buildAssistantRegisterContext(input({
      recentExpenses: monthRows,
      month: {
        stats: null,
        budget: budget([
          budgetItem({ id: 'b-cibo', categoryId: 'cat-cibo', categoryName: 'Cibo', amount: 600 }),
          budgetItem({ id: 'b-casa', categoryId: 'cat-casa', categoryName: 'Casa', amount: 7000, period: 'annual' }),
          budgetItem({ id: 'b-income', kind: 'income', categoryId: 'cat-stipendio', categoryName: 'Stipendio', amount: 2000 }),
          budgetItem({ id: 'b-zero', categoryId: 'cat-x', categoryName: 'Senza tetto', amount: 0 }),
        ], 2000),
        budgetFailed: false,
      },
    }));
    const block = formatRegisterContextForPrompt(ctx);
    expect(block).toContain('- Cibo: 540,00 € / 600,00 € (90%) · mensile');
    expect(block).toContain('- Casa: 700,00 € / 7000,00 € (10%) · annuale, da inizio anno');
    expect(block).not.toContain('Stipendio:');
    expect(block).not.toContain('Senza tetto');
    expect(block).toContain('Tetto complessivo: 1240,00 € / 2000,00 € (62%) · mensile');
    // Highest ratio first.
    expect(block.indexOf('- Cibo:')).toBeLessThan(block.indexOf('- Casa:'));
  });

  it('names a budget on a TYPE by the type’s label, never by its id', () => {
    const ctx = buildAssistantRegisterContext(input({
      recentExpenses: monthRows,
      month: { stats: null, budget: budget([budgetItem({ id: 'b-fixed', scope: 'type', expenseType: 'fixed', amount: 1400 })]), budgetFailed: false },
    }));
    const block = formatRegisterContextForPrompt(ctx);
    expect(block).toContain('- Spese Necessarie: 700,00 € / 1400,00 € (50%) · mensile');
    expect(block).not.toContain('- fixed:');
  });

  it('cuts the budget lines past the cap and prints how many', () => {
    const items = Array.from({ length: REGISTER_MONTH_BUDGET_ROWS_CAP + 3 }, (_, index) =>
      budgetItem({ id: `b-${index}`, categoryId: `cat-${index}`, categoryName: `Voce ${index}`, amount: 100 + index }),
    );
    const ctx = buildAssistantRegisterContext(input({ month: { stats: null, budget: budget(items), budgetFailed: false } }));
    expect(ctx.month?.budgets).toHaveLength(REGISTER_MONTH_BUDGET_ROWS_CAP);
    expect(ctx.month?.budgetsCut).toBe(3);
    expect(formatRegisterContextForPrompt(ctx)).toContain('(e altri 3 budget non elencati)');
  });

  it('says «nessuno configurato» for a document with no expense budget and no ceiling', () => {
    const ctx = buildAssistantRegisterContext(input({ month: { stats: null, budget: budget([]), budgetFailed: false } }));
    expect(ctx.month?.budgets).toBe('none');
  });
});

// ── PATTERN, PRESTITI, IMMOBILI (2026-11) ──

function loanAsset(id: string, name: string, debt: number, rate?: number): Asset {
  return { id, userId: 'u1', name, type: 'loan', assetClass: 'cash', quantity: debt, currentPrice: 1, currency: 'EUR', ...(rate === undefined ? {} : { debtInterestRate: rate }) } as Asset;
}

function house(id: string, name: string, value: number): Asset {
  return { id, userId: 'u1', name, type: 'realestate', assetClass: 'realestate', quantity: value, currentPrice: 1, currency: 'EUR' } as Asset;
}

/** `count` rows of «Cibo» spread over the window, oldest first; `oldest` overrides the first. */
function spread(count: number, base: Partial<Expense>, oldest: Partial<Expense> = {}): Expense[] {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(2025, 11, 1 + Math.floor((index * 330) / count), 12)).toISOString().slice(0, 10);
    return row({ date: italian(day), linkedCashAssetId: 'acc-main', ...base, ...(index === 0 ? oldest : {}) });
  });
}

describe('buildAssistantRegisterContext — PATTERN', () => {
  it('computes the shares over EVERY row of the window, before the cut and the collapse', () => {
    const rows = spread(301, {}, { linkedCashAssetId: 'acc-empty' });
    const ctx = buildAssistantRegisterContext(input({ recentExpenses: rows }));
    // The cut drops the oldest line — the only one on the other account — and the share still sees it.
    expect(ctx.recent?.cut).toBe(1);
    const block = formatRegisterContextForPrompt(ctx);
    expect(block).toContain('[cat-cibo] Cibo · 301 righe in 12 mesi · conto più usato Conto principale 99,7% · in un centro: 0 righe · personali 0% · fuori budget 0%');
  });

  it('prints the centre, the member and the «fuori budget» clauses only where they apply', () => {
    const rows = [
      ...spread(4, { costCenterId: 'cc-auto', personalMemberId: 'm-anna', excludeFromBudget: true }),
      row({ date: italian('2026-10-10'), type: 'income', categoryId: 'cat-stipendio', categoryName: 'Stipendio', amount: 2000, linkedCashAssetId: 'acc-main' }),
    ];
    const on = formatRegisterContextForPrompt(buildAssistantRegisterContext(input({ recentExpenses: rows })));
    expect(on).toContain('[cat-cibo] Cibo · 4 righe in 12 mesi · conto più usato Conto principale 100% · in un centro: 4 righe · personali 100% · fuori budget 100%');
    // An income has no budget clause.
    expect(on).toContain('[cat-stipendio] Stipendio · 1 riga in 12 mesi · conto più usato Conto principale 100% · in un centro: 0 righe · personali 0%');
    expect(on).not.toMatch(/Stipendio · .*fuori budget/);
    const off = formatRegisterContextForPrompt(
      buildAssistantRegisterContext(input({ recentExpenses: rows, settings: { defaultDebitCashAssetId: 'acc-main', defaultCreditCashAssetId: 'acc-main', costCentersEnabled: false, expenseSplitEnabled: false } })),
    );
    expect(off).toContain('[cat-cibo] Cibo · 4 righe in 12 mesi · conto più usato Conto principale 100% · fuori budget 100%');
  });

  it('leaves the fee rows and the transfers out of the base', () => {
    const rows = [
      ...spread(3, {}),
      row({ date: italian('2026-10-11'), categoryId: 'cat-cibo', amount: -1, linkedCashAssetId: 'acc-empty', feeOfTransferId: 'exp-x' }),
      row({ date: italian('2026-10-12'), type: 'transfer', categoryId: 'cat-giro', categoryName: 'Giroconto', amount: -100, linkedCashAssetId: 'acc-main' }),
    ];
    const block = formatRegisterContextForPrompt(buildAssistantRegisterContext(input({ recentExpenses: rows })));
    expect(block).toContain('[cat-cibo] Cibo · 3 righe in 12 mesi · conto più usato Conto principale 100%');
    expect(block).not.toMatch(/\[cat-giro\] Giroconto · \d+ rig/);
  });

  it('counts a row with no account in the base', () => {
    const rows = [...spread(3, {}), row({ date: italian('2026-10-11') })];
    expect(formatRegisterContextForPrompt(buildAssistantRegisterContext(input({ recentExpenses: rows })))).toContain('4 righe in 12 mesi · conto più usato Conto principale 75%');
  });

  it('stands before «ULTIME RIGHE», and says the rows were not read in the browser', () => {
    const block = formatRegisterContextForPrompt(buildAssistantRegisterContext(input({ recentExpenses: spread(2, {}) })));
    expect(block.indexOf('--- PATTERN ---')).toBeLessThan(block.indexOf('--- ULTIME RIGHE ---'));
    expect(formatRegisterContextForPrompt(buildAssistantRegisterContext(input({ recentExpenses: null })))).toContain('Pattern: righe non lette.');
  });
});

describe('buildAssistantRegisterContext — PRESTITI and IMMOBILI', () => {
  it('prints each loan with its debt, its TAN and the median instalment, a series once', () => {
    const series = Array.from({ length: 12 }, (_, index) =>
      row({ date: italian(`2026-${String(index === 0 ? 11 : index).padStart(2, '0')}-01`), type: 'debt', categoryId: 'cat-mutuo', categoryName: 'Mutuo', amount: -500, debtAssetId: 'loan-casa', isRecurring: true, recurringParentId: 'series-mutuo' }),
    ).filter((expense) => getDay(expense) <= '2026-11-01');
    const ctx = buildAssistantRegisterContext(input({
      assets: [cash('acc-main', 'Conto principale', 2500), loanAsset('loan-casa', 'Mutuo casa', 100000, 1.25), loanAsset('loan-auto', 'Prestito auto', 3000)],
      recentExpenses: series,
    }));
    const block = formatRegisterContextForPrompt(ctx);
    expect(block).toContain('[loan-casa] Mutuo casa · debito residuo 100.000,00 € · TAN 1,25% · rata mediana 500,00 € su 1 riga (serie contata una volta)');
    expect(block).toContain('[loan-auto] Prestito auto · debito residuo 3000,00 € · TAN non indicato · nessuna rata nelle righe recenti');
    expect(block.indexOf('--- CONTI ---')).toBeLessThan(block.indexOf('--- PRESTITI ---'));
    expect(block.indexOf('--- PRESTITI ---')).toBeLessThan(block.indexOf('--- IMMOBILI ---'));
    expect(block.indexOf('--- IMMOBILI ---')).toBeLessThan(block.indexOf('--- CENTRI DI COSTO ---'));
  });

  it('takes the median of several instalments', () => {
    const rows = [300, 100, 200, 400].map((amount, index) =>
      row({ date: italian(`2026-0${index + 6}-10`), type: 'debt', categoryId: 'cat-mutuo', categoryName: 'Mutuo', amount: -amount, debtAssetId: 'loan-casa' }),
    );
    const ctx = buildAssistantRegisterContext(input({ assets: [loanAsset('loan-casa', 'Mutuo casa', 1000, 2)], recentExpenses: rows }));
    expect(ctx.loans[0].medianInstalment).toEqual({ amount: 250, lines: 4 });
  });

  it('prints every transferable property with its value, and the absences', () => {
    const block = formatRegisterContextForPrompt(buildAssistantRegisterContext(input({ assets: [cash('acc-main', 'Conto principale', 2500), house('prop-1', 'Casa ornitorinco', 150000)] })));
    expect(block).toContain('[prop-1] Casa ornitorinco · valore 150.000,00 €');
    expect(block).toContain('nessun prestito');
    const none = formatRegisterContextForPrompt(buildAssistantRegisterContext(input()));
    expect(none).toContain('nessun immobile');
  });
});

function getDay(expense: Expense): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(expense.date as Date);
}
