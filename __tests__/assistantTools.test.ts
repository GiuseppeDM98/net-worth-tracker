/**
 * The Assistente's tools (lib/server/assistant/tools/): the budget's state as the Budget page
 * measures it, the cost centres as their page reads them, the definitions generated from zod, and
 * every way a call fails — each an error result, never a throw. Pure over a hand-built context:
 * no Firestore, no model. Fixtures at Italian noon, figures invented and round.
 *
 * Each rule was seen red by the session that wrote it (2026-11-26): the Budget's gate dropped
 * (re-seen red on 2026-11-27) and `ceilingToDate` equal to `ceiling`; the centres grouped by name
 * through the cashflow query; the period not echoed and a `.describe()` dropped; a tool's throw
 * rethrown.
 */

import { describe, expect, it, vi } from 'vitest';
import { fromZonedTime } from 'date-fns-tz';

vi.mock('server-only', () => ({}));

import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { BudgetConfig, BudgetItem } from '@/types/budget';
import type { CostCenter } from '@/types/costCenters';
import { queryClockOf } from '@/lib/utils/assistantExpenseQueries';
import { ASSISTANT_TOOL_DEFINITIONS, runAssistantTool, UNREADABLE, type AssistantToolContext } from '@/lib/server/assistant/tools/registry';
import { computeBudgetState } from '@/lib/server/assistant/tools/budgetState';

const TODAY = '2026-11-15';

let seq = 0;
function row(day: string, type: Expense['type'], amount: number, extra: Partial<Expense> = {}): Expense {
  seq += 1;
  return {
    id: `r-${seq}`,
    userId: 'u1',
    type,
    categoryId: extra.categoryId ?? `cat-${type}`,
    categoryName: extra.categoryName ?? `cat-${type}`,
    amount,
    currency: 'EUR',
    date: fromZonedTime(`${day}T12:00:00`, 'Europe/Rome'),
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...extra,
  } as Expense;
}

function category(id: string, name: string, type: Expense['type'], subs: string[] = []): ExpenseCategory {
  return { id, userId: 'u1', name, type, subCategories: subs.map((sub, index) => ({ id: `${id}-s${index}`, name: sub })), createdAt: new Date(0), updatedAt: new Date(0) };
}

function center(id: string, name: string, extra: Partial<CostCenter> = {}): CostCenter {
  return { id, userId: 'u1', name, createdAt: new Date(0), updatedAt: new Date(0), ...extra };
}

function item(extra: Partial<BudgetItem>): BudgetItem {
  return { id: `b-${extra.categoryId ?? extra.expenseType}`, kind: 'expense', scope: 'category', period: 'monthly', amount: 100, order: 0, ...extra };
}

function budget(items: BudgetItem[], overallMonthlyAmount?: number): BudgetConfig {
  return { userId: 'u1', items, overallMonthlyAmount, updatedAt: new Date(0) };
}

function context(extra: Partial<AssistantToolContext> = {}): AssistantToolContext {
  return {
    userId: 'u1',
    todayIso: TODAY,
    now: fromZonedTime(`${TODAY}T12:00:00`, 'Europe/Rome'),
    clock: queryClockOf(TODAY, undefined),
    expenses: [],
    categories: [],
    costCenters: [],
    budgetConfig: null,
    costCentersEnabled: true,
    ...extra,
  };
}

describe('budget_stato', () => {
  const expenses = [
    row('2026-01-10', 'variable', -100, { categoryId: 'viaggi', categoryName: 'Viaggi' }),
    row('2026-03-10', 'variable', -50, { categoryId: 'viaggi', categoryName: 'Viaggi' }),
    row('2026-04-10', 'variable', -70, { categoryId: 'viaggi', categoryName: 'Viaggi' }),
    row('2026-11-10', 'fixed', -40, { categoryId: 'spesa', categoryName: 'Spesa' }),
    row('2026-11-12', 'fixed', -1000, { categoryId: 'spesa', categoryName: 'Spesa', excludeFromBudget: true }),
    row('2026-11-16', 'fixed', -30, { categoryId: 'spesa', categoryName: 'Spesa' }),
  ];
  const monthly = item({ categoryId: 'spesa', categoryName: 'Spesa', amount: 100 });
  const annual = item({ categoryId: 'viaggi', categoryName: 'Viaggi', period: 'annual', amount: 1000 });
  const byType = item({ scope: 'type', expenseType: 'fixed', categoryId: undefined, amount: 500 });

  it('gives a monthly line asked for the year the ceiling × 12 and the ceiling to the current month', () => {
    const result = computeBudgetState({ year: 2026 }, context({ expenses, budgetConfig: budget([monthly]) }));
    expect(result.configured && result.lines[0]).toMatchObject({ measuredOver: 'year', ceiling: 1200, ceilingToDate: 1100 });
    const past = computeBudgetState({ year: 2025 }, context({ expenses, budgetConfig: budget([monthly]) }));
    expect(past.configured && past.lines[0].ceilingToDate).toBe(1200);
  });

  it('measures an annual line asked for March on January–March against the yearly ceiling', () => {
    const result = computeBudgetState({ year: 2026, month: 3 }, context({ expenses, budgetConfig: budget([annual]) }));
    expect(result.configured && result.lines[0]).toMatchObject({ measuredOver: 'yearToMonth', ceiling: 1000, spent: 150, remaining: 850 });
  });

  it('leaves out a row «Fuori dal budget» and counts a row dated tomorrow, declared as scheduled', () => {
    const result = computeBudgetState({ year: 2026, month: 11 }, context({ expenses, budgetConfig: budget([monthly]) }));
    expect(result.configured && result.lines[0]).toMatchObject({ measuredOver: 'month', ceiling: 100, spent: 70, scheduled: 30, remaining: 30 });
  });

  it('labels a type line by the type and puts the overall ceiling first as «Totale»', () => {
    const result = computeBudgetState({ year: 2026, month: 11 }, context({ expenses, budgetConfig: budget([byType], 800) }));
    expect(result.configured && result.lines.map((line) => [line.label, line.period])).toEqual([
      ['Totale', 'overall'],
      ['Spese Necessarie', 'monthly'],
    ]);
  });

  it('answers configured: false without a budget', () => {
    expect(computeBudgetState({ year: 2026 }, context({ budgetConfig: null }))).toEqual({ configured: false });
    expect(computeBudgetState({ year: 2026 }, context({ budgetConfig: budget([]) }))).toEqual({ configured: false });
  });
});

describe('centri_di_costo', () => {
  const centers = [center('c1', 'Auto'), center('c2', 'Auto', { archivedAt: new Date(0), budgetAmount: 500, budgetPeriod: 'annual' })];
  const expenses = [
    row('2026-05-10', 'variable', -100, { costCenterId: 'c1', costCenterName: 'Auto' }),
    row('2026-06-10', 'variable', -300, { costCenterId: 'c2', costCenterName: 'Auto' }),
    row('2026-06-12', 'variable', 40, { costCenterId: 'c2', costCenterName: 'Auto' }),
    row('2026-06-15', 'variable', -900, { costCenterId: 'c-deleted', costCenterName: 'Auto' }),
  ];

  it('keeps two centres of one name apart, a refund and a deleted centre out of every figure', async () => {
    const result = await runAssistantTool('centri_di_costo', { from: '2026-01-01', to: '2026-12-31' }, context({ expenses, costCenters: centers }));
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content).centers).toEqual([
      { name: 'Auto', archived: false, spent: 100, rows: 1, ceiling: null, ceilingPeriod: null, lastExpense: '2026-05-10' },
      { name: 'Auto', archived: true, spent: 300, rows: 1, ceiling: 500, ceilingPeriod: 'annual', lastExpense: '2026-06-10' },
    ]);
  });

  it('answers enabled: false when the centres are off', async () => {
    const result = await runAssistantTool('centri_di_costo', { from: '2026-01-01', to: '2026-12-31' }, context({ costCentersEnabled: false }));
    expect(JSON.parse(result.content)).toEqual({ enabled: false });
  });
});

/** Every property of a JSON schema, nested objects and array items included, with its path. */
function propertiesOf(schema: Record<string, unknown>, path = ''): [string, Record<string, unknown>][] {
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  return Object.entries(properties).flatMap(([name, property]) => [[`${path}${name}`, property] as [string, Record<string, unknown>], ...propertiesOf(property, `${path}${name}.`)]);
}

describe('the definitions', () => {
  it('cashflow_totali answers the query with its period echoed', async () => {
    const expenses = [row('2026-02-10', 'fixed', -300, { categoryName: 'Asilo' })];
    const result = await runAssistantTool('cashflow_totali', { kind: 'spending', from: '2026-01-01', to: '2026-10-31', groupBy: 'category' }, context({ expenses }));
    expect(JSON.parse(result.content)).toMatchObject({ period: { from: '2026-01-01', to: '2026-10-31' }, today: TODAY, total: 300, rows: 1 });
  });

  it('sends five object schemas, every property described, no dialect key', () => {
    expect(ASSISTANT_TOOL_DEFINITIONS.map((definition) => definition.name)).toEqual(['cashflow_totali', 'cashflow_confronto', 'cashflow_righe', 'budget_stato', 'centri_di_costo']);
    for (const definition of ASSISTANT_TOOL_DEFINITIONS) {
      const schema = definition.input_schema as Record<string, unknown>;
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);
      expect(schema).not.toHaveProperty('$schema');
      for (const [path, property] of propertiesOf(schema)) {
        expect(typeof property.description, `${definition.name}.${path}`).toBe('string');
      }
    }
  });
});

describe('a call that fails is an error result', () => {
  const categories = [category('asilo', 'Asilo', 'fixed'), category('sanita', 'Sanità', 'fixed')];
  const totals = (extra: Record<string, unknown>) => ({ kind: 'spending', from: '2026-01-01', to: '2026-10-31', groupBy: 'category', ...extra });

  it('names the existing categories for an unknown one', async () => {
    const result = await runAssistantTool('cashflow_totali', totals({ categories: ['Palestra'] }), context({ categories }));
    expect(result).toEqual({ isError: true, content: 'Categoria sconosciuta: «Palestra». Esistono: Asilo, Sanità.' });
  });

  it('accepts a category deleted from the taxonomy and still written on a row', async () => {
    const expenses = [row('2026-02-10', 'fixed', -50, { categoryId: 'old', categoryName: 'Vecchia' })];
    const result = await runAssistantTool('cashflow_totali', totals({ categories: ['vecchia'] }), context({ categories, expenses }));
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.content).total).toBe(50);
  });

  it('refuses a period that ends before it starts', async () => {
    const result = await runAssistantTool('cashflow_totali', totals({ from: '2026-05-01', to: '2026-04-01' }), context());
    expect(result).toEqual({ isError: true, content: 'Il periodo finisce prima di iniziare.' });
  });

  it('refuses a day that is not in the calendar', async () => {
    const result = await runAssistantTool('cashflow_totali', totals({ to: '2026-02-30' }), context());
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/^Parametri non validi: to: /);
  });

  it('refuses an unknown tool', async () => {
    expect(await runAssistantTool('cashflow_magia', {}, context())).toEqual({ isError: true, content: 'Strumento sconosciuto: cashflow_magia.' });
  });

  it('turns a tool that throws into an error result, and logs it', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = context({ categories: null as unknown as ExpenseCategory[] });
    const result = await runAssistantTool('cashflow_totali', totals({ categories: ['Asilo'] }), broken);
    expect(result).toEqual({ isError: true, content: 'Lo strumento non ha risposto: rispondi con i dati che hai e dillo.' });
    expect(log).toHaveBeenCalledWith('[assistant] tool cashflow_totali failed', expect.any(TypeError));
    log.mockRestore();
  });

  it('says the budget could not be read', async () => {
    const result = await runAssistantTool('budget_stato', { year: 2026 }, context({ budgetConfig: UNREADABLE }));
    expect(result).toEqual({ isError: true, content: 'Non riesco a leggere il budget adesso.' });
  });
});
