# DATI-09 — Assistente: tools that query the cashflow, the budget and the cost centres

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-08 (the form of the answer, the model, the
> message shape). DATI-11 and DATI-15 depend on it.
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276 (a line number is a hint, the function's name is the
> anchor). Owner's point 8; decisions 16, 17, 68, 73 and 74. Defines the shared contract **C3** (the Assistente's
> tool registry, index § 7).

## 1. The problem today (evidence on the code)

The owner's three questions (what the daughters cost, the two mortgages, why spending rose against 2025) need figures
the model is never given:

- **Categories exist for the twelve full months only**, the monthly series by TYPE only, and no single row ever
  reaches the model: `lib/utils/cashflowBlock.ts` — caps `:53-58` (40 commitments, 20 sources, 60 subcategories), the
  series `:258-287`, the printer `:826-856`. A period block lists categories for its own period; nothing compares two
  periods by category, nothing lists the rows behind a figure. Seen in DATI-08's phase F (2026-11-26) on the third
  question: to compare January–October by category the model set the previous calendar year beside the last twelve
  months and subtracted (the two months in both cancel). The differences held, the columns read as neither period,
  and the owner could not follow the table. `comparePeriods` (§ 4.1) is the answer; the same question is a good
  check for § 7.
- **There is no tool loop.** The one request (`lib/server/assistant/anthropicStream.ts:233-262`) declares at most the
  server-side web search; the event loop (`:264-307`) knows no `tool_use`.
- The whole expense history is already read at every message (`fetchCashflowBlockInputs`,
  `lib/services/assistantMonthContextService.ts:450-471`, called through
  `lib/server/assistant/cashflowBlockPrompt.ts:12-15`) — the data is on the server, one function call away from the
  answer.

## 2. Goal and acceptance criteria

The model asks the server for the figure it needs — a total by category over any period, a monthly series, a
comparison between two periods, the rows behind a number, the budget's state, a cost centre — and the server computes
it in code. The model never adds up rows it was not given.

1. Every mode but Registra sends the five tools of § 4.2; Registra sends none. Proof: L1.
2. A tool call is answered by code on the expenses read ONCE for the request; the loop runs until the model stops
   asking, at most 8 rounds of tools and 200 seconds: past either, the calls are answered «stop» and the model
   closes with what it has. Proof: L2, L3, L7, S1.
3. Totals follow the cashflow's rules: the row's Italian day, classification by `type`, transfers out, a spending
   figure positive, rows dated after today out unless asked, rows before the history's first year
   (`cashflowHistoryStartYear`) out and counted. Proof: Q1–Q3, Q7.
4. A filter names categories, subcategories and cost centres as the user reads them (case and accents ignored); an
   unknown name is an error result that lists the existing ones. A GROUP is a category's id, never its name: two
   categories of the same name stay two groups. Proof: Q4, Q8, T2.
5. A comparison returns, per group, both totals, the difference and its percentage, largest move first. Proof: Q5.
6. Rows are capped at 100 with the count and the total of ALL the matching rows declared. Proof: Q6.
7. The budget tool returns, per budget line, the ceiling, the spent and the remainder for the year or the month
   asked — for a year also the ceiling up to the current month — with the Budget's own gate
   (`countsTowardBudget`); the cost-centre tool returns the figures the Centri di Costo page shows. Proof: B1, B2.
8. An invalid input, an unknown tool, a thrown tool, a budget or a centre list that could not be read: an `is_error`
   result, never a 500; a truncated or refused turn runs no tool. Proof: T2, L4, L5, S2.
9. While a tool runs the user reads «Faccio i conti sui tuoi dati…». Proof: L6, D1a, D1b.
10. The system prompt stays static; the tools' definitions are identical for every request and every round;
    Registra's system and the emails' do not speak of tools. Proof: L1, P1, P1b.
11. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green.

## 3. Decisions

- **Decision 16** (owner, 2026-11-23): query tools, not a larger block.
- **Decision 17** (owner, 2026-11-23): beside the cashflow — budget and cost centres (here), the trade ledger and the
  dividends, the net-worth history (DATI-15).
- **Decision 68** (owner, 2026-11-23): the loop has a deadline of 200 seconds beside the cap of 8 rounds — the
  function dies at 300 and the answer would be lost.
- **Decision 73** (owner, 2026-11-23): the cashflow tools respect «Storico dal» (`cashflowHistoryStartYear`) as
  Analisi and the CASHFLOW block do; a result says how many rows the floor left out.
- **Decision 74** (owner, 2026-11-23): asked for a year, `budget_stato` gives a monthly line both the ceiling × 12
  and the ceiling up to the current month included.
- Adopted, reversible:
  - (a) a manual streaming loop on `anthropic.beta.messages.stream()` + `finalMessage()` (both in the installed SDK,
    `@anthropic-ai/sdk` 0.115.0); the SDK's tool runner is not used because the loop must keep the route's status
    events and the server-side fallback.
  - (b) at most 8 rounds of tools per answer. EVERY request of an answer sends the same `tools`: past the cap or
    the deadline the calls are not run and each is answered with an `is_error` result that says to close; the model
    gets two such requests, then the loop ends. `tool_choice` is never sent.
  - (c) FILTERS by name, not by id: the names are what the data blocks print and what the user says; a name two
    categories share selects both. GROUPS by id (doc/guide/cashflow.md § Expense Grouping: key by id, label by
    name), labelled through `resolveDisplayLabels` — the type in parentheses only where two groups share a name.
  - (d) the CASHFLOW 12 MESI block stays in the prompt (it carries the commitments and the medians no tool returns);
    the tools add what it cannot hold.
  - (e) the tool results are not saved with the message: the history is replayed as text, as today.
  - (f) `eager_input_streaming` is left OFF on these tools: their inputs are a few short fields, and the buffered
    default keeps the server-side validation.
  - (g) the definitions carry no `strict`: the zod schema is the ONE gate (an input that fails it is an `is_error`
    result and one more round), and the `input_schema` sent is generated from it, so the two cannot drift.
  - (h) a refund — a spending row with a positive amount — counts as spending by its absolute value in the three
    cashflow tools, as in the CASHFLOW block; `centri_di_costo` leaves it out, as the Centri di Costo page does.
  - (i) asked for a month, `budget_stato` measures an ANNUAL line as the Budget page does: its yearly ceiling
    against the year's spending up to the end of that month — never the ceiling ÷ 12.
  - (j) a failed read of the budget or of the centres does not fail the message: only its tool answers with an
    error. A failed read of the expenses is a 500, as today.
  - (k) amounts are summed as recorded, whatever the row's currency — the cashflow has one.

## 4. Solution

### 4.1 Pure queries — `lib/utils/assistantExpenseQueries.ts` (new, written here)

```ts
/**
 * The questions the Assistente may ask about the recorded cashflow, answered by code (2026-11-23).
 *
 * Until then the model read one printed block — categories for twelve months, the series by type,
 * no single row — and was told not to compute. Now it asks for a total, a series, a comparison or
 * the rows behind a figure, and gets numbers it can quote.
 *
 * THE RULES are the cashflow block's (lib/utils/cashflowBlock.ts): a row's day is its ITALIAN day;
 * classification by `type`, never by sign; transfers are neither income nor spending; a spending
 * figure is positive; `excludeFromBudget` rows count unless the query is the Budget's; nothing
 * before the first year of the history the user keeps. A group is an ID, a label is a name
 * (lib/utils/expenseGrouping.ts): two categories of one name are two groups.
 * Pure: no Firebase, no clock — «today» and the floor are a parameter.
 */
import type { Expense } from '@/types/expenses';
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { countsTowardBudget } from '@/lib/utils/budgetUtils';
import { getCategoryKey, getCategoryName, getSubCategoryKey, getSubCategoryLabel, resolveDisplayLabels } from '@/lib/utils/expenseGrouping';

export type QueryKind = 'spending' | 'income';
export type SpendingType = 'fixed' | 'variable' | 'debt';
export type GroupBy = 'category' | 'subcategory' | 'type' | 'month' | 'costCenter';

export interface ExpenseQuery {
  /** Inclusive Italian days, YYYY-MM-DD. */
  fromIso: string;
  toIso: string;
  kind: QueryKind;
  types?: SpendingType[];
  categories?: string[];
  subCategories?: string[];
  costCenters?: string[];
  /** Searched in the notes and in the three names. */
  text?: string;
  minAmount?: number;
  maxAmount?: number;
  /** Only the rows the Budget counts. */
  budgetOnly?: boolean;
  /** Also the rows dated after today. */
  includeScheduled?: boolean;
}

/** What a query is read against. */
export interface QueryClock {
  /** Today's Italian day. */
  todayIso: string;
  /** The first day of the history the user keeps (`${cashflowHistoryStartYear}-01-01`); null when the setting is absent. */
  floorIso: string | null;
}

export function queryClockOf(todayIso: string, cashflowHistoryStartYear: number | undefined): QueryClock {
  return { todayIso, floorIso: cashflowHistoryStartYear ? `${cashflowHistoryStartYear}-01-01` : null };
}

export const GROUPS_CAP = 60;
export const COMPARE_CAP = 40;
export const ROWS_CAP = 100;

export const TYPE_LABELS: Record<Exclude<Expense['type'], 'transfer'>, string> = {
  fixed: 'Spese Necessarie',
  variable: 'Spese Non Necessarie',
  debt: 'Debiti',
  income: 'Entrate',
};

/** Case and accents out: «Sanità» = «sanita». */
export function foldName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

interface Selected {
  row: Expense;
  day: string;
  value: number;
}

interface Selection {
  selected: Selected[];
  /** Rows that answer every filter and lie before the floor: counted, never summed. */
  beforeFloor: number;
}

function selectRows(expenses: readonly Expense[], query: ExpenseQuery, clock: QueryClock): Selection {
  const categories = query.categories?.map(foldName);
  const subCategories = query.subCategories?.map(foldName);
  const costCenters = query.costCenters?.map(foldName);
  const needle = query.text ? foldName(query.text) : '';
  const selected: Selected[] = [];
  let beforeFloor = 0;
  for (const row of expenses) {
    if (row.type === 'transfer') continue;
    if ((row.type === 'income') !== (query.kind === 'income')) continue;
    const day = getItalyDateIso(row.date);
    if (day < query.fromIso || day > query.toIso) continue;
    if (!query.includeScheduled && day > clock.todayIso) continue;
    if (query.types && query.kind === 'spending' && !query.types.includes(row.type as SpendingType)) continue;
    if (categories && !categories.includes(foldName(row.categoryName))) continue;
    if (subCategories && !(row.subCategoryName && subCategories.includes(foldName(row.subCategoryName)))) continue;
    if (costCenters && !(row.costCenterName && costCenters.includes(foldName(row.costCenterName)))) continue;
    if (query.budgetOnly && !countsTowardBudget(row)) continue;
    const value = row.type === 'income' ? row.amount : Math.abs(row.amount);
    if (query.minAmount !== undefined && Math.abs(value) < query.minAmount) continue;
    if (query.maxAmount !== undefined && Math.abs(value) > query.maxAmount) continue;
    if (needle) {
      const haystack = foldName(`${row.notes ?? ''} ${row.categoryName} ${row.subCategoryName ?? ''} ${row.costCenterName ?? ''}`);
      if (!haystack.includes(needle)) continue;
    }
    if (clock.floorIso && day < clock.floorIso) {
      beforeFloor += 1;
      continue;
    }
    selected.push({ row, day, value });
  }
  return { selected, beforeFloor };
}

/** The first Italian day the account holds a row (transfers aside), never before the floor; null with no row. */
function historyStart(expenses: readonly Expense[], clock: QueryClock): string | null {
  let first: string | null = null;
  for (const row of expenses) {
    if (row.type === 'transfer') continue;
    const day = getItalyDateIso(row.date);
    if (first === null || day < first) first = day;
  }
  if (first === null) return null;
  return clock.floorIso && clock.floorIso > first ? clock.floorIso : first;
}

function monthKeysOf(fromIso: string, toIso: string): string[] {
  const [fromYear, fromMonth] = fromIso.split('-').map(Number);
  const [toYear, toMonth] = toIso.split('-').map(Number);
  const keys: string[] = [];
  for (let index = fromYear * 12 + (fromMonth - 1); index <= toYear * 12 + (toMonth - 1); index++) {
    keys.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`);
  }
  return keys;
}

/** A group before its label is settled: `name` may be shared, `qualifier` tells two namesakes apart. */
interface Bucket {
  key: string;
  name: string;
  qualifier?: string;
  total: number;
  rows: number;
}

function groupOf(selected: Selected, by: GroupBy): Pick<Bucket, 'key' | 'name' | 'qualifier'> {
  const { row, day } = selected;
  const typeLabel = TYPE_LABELS[row.type as keyof typeof TYPE_LABELS];
  if (by === 'month') return { key: day.slice(0, 7), name: day.slice(0, 7) };
  if (by === 'type') return { key: row.type, name: typeLabel };
  if (by === 'category') return { key: getCategoryKey(row), name: getCategoryName(row), qualifier: typeLabel };
  if (by === 'subcategory') {
    return {
      key: `${getCategoryKey(row)}/${getSubCategoryKey(row)}`,
      name: `${getCategoryName(row)} › ${getSubCategoryLabel(row)}`,
      qualifier: typeLabel,
    };
  }
  return row.costCenterId
    ? { key: row.costCenterId, name: row.costCenterName ?? row.costCenterId }
    : { key: '', name: '(nessun centro di costo)' };
}

/** The labels of ONE result: a name two keys share takes its type in parentheses. */
function labelsOf(buckets: Iterable<Bucket>): Map<string, string> {
  return resolveDisplayLabels([...buckets].map(({ key, name, qualifier }) => ({ key, name, qualifier })));
}

export interface GroupRow {
  key: string;
  label: string;
  total: number;
  rows: number;
}

export interface TotalsResult {
  total: number;
  rows: number;
  groups: GroupRow[];
  /** Groups past the cap — the smallest, or the oldest months; their sum is in `total`, not in `groups`. */
  omittedGroups: number;
  /** Rows the history's floor left out of everything above. */
  beforeFloorRows: number;
}

function groupAll(selected: Selected[], by: GroupBy): Map<string, Bucket> {
  const groups = new Map<string, Bucket>();
  for (const item of selected) {
    const { key, name, qualifier } = groupOf(item, by);
    const group = groups.get(key) ?? { key, name, qualifier, total: 0, rows: 0 };
    group.total += item.value;
    group.rows += 1;
    groups.set(key, group);
  }
  return groups;
}

/**
 * The total of a query and its groups. Months in calendar order with the empty ones at zero, from
 * the later of the asked start and the account's first month — a query «from 1970» is not six
 * hundred empty months — and the most recent `GROUPS_CAP` of them; any other grouping largest first.
 */
export function totalsBy(expenses: readonly Expense[], query: ExpenseQuery, by: GroupBy, clock: QueryClock): TotalsResult {
  const { selected, beforeFloor } = selectRows(expenses, query, clock);
  const groups = groupAll(selected, by);
  const total = roundToCents(selected.reduce((sum, item) => sum + item.value, 0));
  if (by === 'month') {
    const lastIso = query.includeScheduled || query.toIso <= clock.todayIso ? query.toIso : clock.todayIso;
    const start = historyStart(expenses, clock);
    const fromIso = start !== null && start > query.fromIso ? start : query.fromIso;
    const months = start === null || lastIso < fromIso ? [] : monthKeysOf(fromIso, lastIso);
    const kept = months.slice(-GROUPS_CAP);
    return {
      total,
      rows: selected.length,
      groups: kept.map((key) => {
        const group = groups.get(key);
        return { key, label: key, total: roundToCents(group?.total ?? 0), rows: group?.rows ?? 0 };
      }),
      omittedGroups: months.length - kept.length,
      beforeFloorRows: beforeFloor,
    };
  }
  const labels = labelsOf(groups.values());
  const sorted = [...groups.values()]
    .map((group) => ({ key: group.key, label: labels.get(group.key) ?? group.name, total: roundToCents(group.total), rows: group.rows }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.label.localeCompare(b.label, 'it'));
  return {
    total,
    rows: selected.length,
    groups: sorted.slice(0, GROUPS_CAP),
    omittedGroups: Math.max(0, sorted.length - GROUPS_CAP),
    beforeFloorRows: beforeFloor,
  };
}

export interface CompareRow {
  label: string;
  a: number;
  b: number;
  /** b − a. */
  delta: number;
  /** Null when `a` is zero. */
  deltaPct: number | null;
}

export interface CompareResult {
  totalA: number;
  totalB: number;
  delta: number;
  deltaPct: number | null;
  rows: CompareRow[];
  omittedRows: number;
  /** Rows the history's floor left out, both periods together. */
  beforeFloorRows: number;
}

function pct(a: number, b: number): number | null {
  return a === 0 ? null : Math.round(((b - a) / Math.abs(a)) * 1000) / 10;
}

/** Period B against period A under the same filters, group by group, the largest move first. */
export function comparePeriods(
  expenses: readonly Expense[],
  filters: Omit<ExpenseQuery, 'fromIso' | 'toIso'>,
  periodA: { fromIso: string; toIso: string },
  periodB: { fromIso: string; toIso: string },
  by: Exclude<GroupBy, 'month'>,
  clock: QueryClock,
): CompareResult {
  const { selected: selectedA, beforeFloor: beforeFloorA } = selectRows(expenses, { ...filters, ...periodA }, clock);
  const { selected: selectedB, beforeFloor: beforeFloorB } = selectRows(expenses, { ...filters, ...periodB }, clock);
  const groupsA = groupAll(selectedA, by);
  const groupsB = groupAll(selectedB, by);
  const keys = [...new Set([...groupsA.keys(), ...groupsB.keys()])];
  // One surface, one set of labels: B's name wins for a group both periods hold.
  const labels = labelsOf(keys.map((key) => (groupsB.get(key) ?? groupsA.get(key))!));
  const rows: CompareRow[] = keys.map((key) => {
    const a = roundToCents(groupsA.get(key)?.total ?? 0);
    const b = roundToCents(groupsB.get(key)?.total ?? 0);
    return { label: labels.get(key)!, a, b, delta: roundToCents(b - a), deltaPct: pct(a, b) };
  });
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta) || x.label.localeCompare(y.label, 'it'));
  const totalA = roundToCents(selectedA.reduce((sum, item) => sum + item.value, 0));
  const totalB = roundToCents(selectedB.reduce((sum, item) => sum + item.value, 0));
  return {
    totalA,
    totalB,
    delta: roundToCents(totalB - totalA),
    deltaPct: pct(totalA, totalB),
    rows: rows.slice(0, COMPARE_CAP),
    omittedRows: Math.max(0, rows.length - COMPARE_CAP),
    beforeFloorRows: beforeFloorA + beforeFloorB,
  };
}

export interface RowLine {
  date: string;
  type: string;
  category: string;
  subCategory: string | null;
  amount: number;
  notes: string | null;
  costCenter: string | null;
  recurring: boolean;
}

export interface RowsResult {
  /** Of ALL the matching rows, shown or not. */
  total: number;
  rows: number;
  shown: RowLine[];
  omitted: number;
  /** Rows the history's floor left out. */
  beforeFloorRows: number;
}

/** The rows behind a figure, at most `ROWS_CAP`, with the count and the total of all of them. */
export function listRows(
  expenses: readonly Expense[],
  query: ExpenseQuery,
  order: 'date-desc' | 'date-asc' | 'amount-desc',
  limit: number,
  clock: QueryClock,
  /** The ceiling on what is shown: the tools use the default, the spending-review email a higher one. */
  maxRows: number = ROWS_CAP,
): RowsResult {
  const { selected, beforeFloor } = selectRows(expenses, query, clock);
  selected.sort((a, b) =>
    order === 'amount-desc'
      ? Math.abs(b.value) - Math.abs(a.value) || b.day.localeCompare(a.day)
      : order === 'date-asc'
        ? a.day.localeCompare(b.day)
        : b.day.localeCompare(a.day),
  );
  const cap = Math.min(Math.max(1, Math.floor(limit)), maxRows);
  return {
    total: roundToCents(selected.reduce((sum, item) => sum + item.value, 0)),
    rows: selected.length,
    shown: selected.slice(0, cap).map(({ row, day, value }) => ({
      date: day,
      type: TYPE_LABELS[row.type as keyof typeof TYPE_LABELS],
      category: getCategoryName(row),
      subCategory: row.subCategoryName ?? null,
      amount: roundToCents(value),
      notes: row.notes?.slice(0, 160) ?? null,
      costCenter: row.costCenterName ?? null,
      recurring: row.isRecurring === true || Boolean(row.installmentParentId),
    })),
    omitted: Math.max(0, selected.length - cap),
    beforeFloorRows: beforeFloor,
  };
}

/**
 * The names a filter does not find in `existing` — the caller passes the taxonomy's names AND the
 * ones written on the recorded rows: a deleted category still filters the rows that carry its name.
 */
export function unknownNames(asked: string[] | undefined, existing: readonly string[]): string[] {
  if (!asked) return [];
  const known = new Set(existing.map(foldName));
  return asked.filter((name) => !known.has(foldName(name)));
}
```

### 4.2 The tools — `lib/server/assistant/tools/` (new) — contract C3

`registry.ts` exports the registry every later spec extends by adding an entry, never by editing the loop:

```ts
import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { QueryClock } from '@/lib/utils/assistantExpenseQueries';

/** A read that failed: its tool answers with an error, the message still goes. */
export const UNREADABLE = 'unreadable' as const;

/** What a tool may read: built ONCE per request, before the first model round. */
export interface AssistantToolContext {
  /** The account read — the route's `body.userId` after `assertCanAccessAccount`, the owner's also for a co-owner. Never a tool's input. */
  userId: string;
  todayIso: string;
  now: Date;
  /** `queryClockOf(todayIso, settings.cashflowHistoryStartYear)`: what every cashflow query is read against. */
  clock: QueryClock;
  /** The whole recorded cashflow, the read the CASHFLOW block already makes. */
  expenses: readonly Expense[];
  categories: readonly ExpenseCategory[];
  costCenters: readonly CostCenter[] | typeof UNREADABLE;
  /** null = no budget configured. */
  budgetConfig: BudgetConfig | null | typeof UNREADABLE;
  costCentersEnabled: boolean;
}

/** A tool as the loop sees it: its definition, and one call that validates the raw input and runs. */
export interface AssistantTool {
  definition: Anthropic.Beta.BetaTool;
  /** Throws a `z.ZodError` for an input its schema refuses, `AssistantToolError` for a refusal the model can act on. */
  call(rawInput: unknown, context: AssistantToolContext): Promise<unknown>;
}

export class AssistantToolError extends Error {}

/**
 * A tool from its zod schema: the schema sent to the model is generated from it (no `strict`: zod
 * is the one gate), and `run` reads an input already validated. The generic is closed here, so
 * the registry is a plain `AssistantTool[]`.
 */
export function defineAssistantTool<Input>(spec: {
  name: string;
  description: string;
  input: z.ZodType<Input>;
  run: (input: Input, context: AssistantToolContext) => Promise<unknown> | unknown;
}): AssistantTool {
  const { $schema: _dialect, ...schema } = z.toJSONSchema(spec.input) as Record<string, unknown>;
  return {
    definition: { name: spec.name, description: spec.description, input_schema: schema as Anthropic.Beta.BetaTool['input_schema'] },
    call: async (rawInput, context) => spec.run(spec.input.parse(rawInput), context),
  };
}

export const ASSISTANT_TOOLS: readonly AssistantTool[] = [spendingTotals, spendingCompare, spendingRows, budgetState, costCentersState];
export const ASSISTANT_TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = ASSISTANT_TOOLS.map((tool) => tool.definition);

/** One tool call as the `tool_result` content: the JSON on success, an error sentence otherwise. Never throws. */
export async function runAssistantTool(name: string, rawInput: unknown, context: AssistantToolContext): Promise<{ content: string; isError: boolean }> { … }
```

`runAssistantTool`: unknown name → `{ isError: true, content: 'Strumento sconosciuto: {name}.' }`; a `z.ZodError`
from `tool.call` → `{ isError: true, content: 'Parametri non validi: {path: message; …}' }`; `AssistantToolError` →
its message; any other throw → logged, `'Lo strumento non ha risposto: rispondi con i dati che hai e dillo.'`;
success → `JSON.stringify(result)`. `_dialect` is the one unused name the lint rule allows by its underscore.

The folder's files: `registry.ts` (above); `context.ts`; `filters.ts` (the zod object of the shared filters,
`toExpenseQuery(input)` and `assertKnownNames(input, context)`); `cashflowTotals.ts` (`spendingTotals`),
`cashflowCompare.ts` (`spendingCompare`), `cashflowRows.ts` (`spendingRows`), `budgetState.ts` (`budgetState`, and
the typed pure `computeBudgetState` DATI-11 calls), `costCentersState.ts` (`costCentersState`). Each tool is ONE
`defineAssistantTool({ name, description, input, run })`; the descriptions are in Italian and written out here
because they are the prompt. Every field of a zod schema carries its `.describe()` in Italian — the limits
included («da 1 a 100»), since the model reads the description and zod enforces the number; a date is
`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` refined to a real calendar day («2026-02-30» is refused).

| name | description | input (all strict, `additionalProperties: false`) |
|---|---|---|
| `cashflow_totali` | «Somma le spese o le entrate registrate in un periodo qualunque, raggruppate per categoria, sottocategoria, tipo, mese o centro di costo. Usalo ogni volta che ti serve un totale o una serie mensile che non è già scritta nei dati del messaggio. Le spese tornano come cifre positive; i trasferimenti tra conti non contano mai.» | `kind`, `from`, `to` (YYYY-MM-DD), `groupBy`, + the filters |
| `cashflow_confronto` | «Confronta due periodi con gli stessi filtri: per ogni gruppo i due totali, la differenza (B − A) e la variazione percentuale, dal movimento più grande. Usalo per spiegare perché una cifra è cambiata.» | `kind`, `periodA {from,to}`, `periodB {from,to}`, `groupBy` (no `month`), + the filters |
| `cashflow_righe` | «Elenca le singole righe registrate che rispondono ai filtri (al più 100), con il conteggio e il totale di TUTTE quelle che corrispondono. Usalo per mostrare che cosa c'è dietro una cifra o per cercare una spesa per parola nelle note.» | `kind`, `from`, `to`, `order` (`date-desc` \| `date-asc` \| `amount-desc`), `limit` (1–100), + the filters |
| `budget_stato` | «Lo stato del budget: per ogni voce il tetto, lo speso e il residuo nell'anno o nel mese chiesto; per un anno anche il tetto maturato fino al mese in corso. Una voce di entrata è un obiettivo da raggiungere, non un tetto. Conta solo le righe che il Budget conta, comprese quelle già in calendario.» | `year`, `month?` (1–12) |
| `centri_di_costo` | «I centri di costo: per ciascuno il totale speso in un periodo, il tetto se c'è e l'ultima spesa. I rimborsi non contano.» | `from`, `to` |

The filters, shared by the first three: `types?` (`fixed` \| `variable` \| `debt`, described as «Spese Necessarie»,
«Spese Non Necessarie», «Debiti»), `categories?`, `subCategories?`, `costCenters?` (arrays of names, «scritti come
compaiono nei dati»), `text?`, `minAmount?`, `maxAmount?`, `budgetOnly?`, `includeScheduled?`.

Runs:
- the three cashflow tools: `from ≤ to` (else `AssistantToolError('Il periodo finisce prima di iniziare.')`), then
  `assertKnownNames`: `unknownNames(input.categories, existing)` non-empty → `AssistantToolError('Categoria
  sconosciuta: «X». Esistono: A, B, C…')` (the first 40 names in alphabetical order; «Sottocategoria sconosciuta»,
  «Centro di costo sconosciuto» for the other two), where `existing` is the taxonomy's names (`context.categories`
  and their subcategories, `context.costCenters` when readable) together with the names written on
  `context.expenses` (`categoryName`, `subCategoryName`, `costCenterName`); then `totalsBy` / `comparePeriods` /
  `listRows` with `context.clock`, and the result returned with `{ period: { from, to }, today: context.todayIso }`
  echoed (`cashflow_confronto` echoes `periodA` and `periodB`).
- `budget_stato` = `computeBudgetState(input, context)`:

  ```ts
  export interface BudgetStateLine {
    label: string;
    /** A ceiling to stay under, or an income target to reach. */
    kind: 'expense' | 'income';
    /** How the line is set in Budget. */
    period: 'monthly' | 'annual' | 'overall';
    /** What `spent` covers: the month asked, the year up to the end of the month asked, the whole year. */
    measuredOver: 'month' | 'yearToMonth' | 'year';
    ceiling: number;
    /** A year asked, a monthly or overall line: the ceiling × the months up to the current one included (12 for a past year, 0 for a future one). */
    ceilingToDate?: number;
    /** Rows in calendar included; for an income line, what was received. */
    spent: number;
    /** The part of `spent` dated after today. */
    scheduled: number;
    /** ceiling − spent. */
    remaining: number;
  }
  export type BudgetStateResult =
    | { configured: false }
    | { configured: true; year: number; month?: number; today: string; lines: BudgetStateLine[] };
  export function computeBudgetState(input: { year: number; month?: number }, context: AssistantToolContext): BudgetStateResult
  ```

  `context.budgetConfig === UNREADABLE` → `AssistantToolError('Non riesco a leggere il budget adesso.')`; null or
  no item and no `overallMonthlyAmount` → `{ configured: false }`. One line per `BudgetItem`, in the config's order:
  `label` = `TYPE_LABELS[item.expenseType]` for the scope `type`, else `budgetItemLabel(item)`
  (`lib/utils/budgetUtils.ts`); `kind` and `period` are the item's. A MONTH asked: a monthly item has `measuredOver:
  'month'`, `ceiling` = its amount, `spent` = `getMonthActualForItem`; an annual item has `measuredOver:
  'yearToMonth'`, `ceiling` = its amount, `spent` = the sum of `getMonthlyActualsForItem(item, expenses, year)` up
  to that month. A YEAR asked: `measuredOver: 'year'`, `spent` = `getActualForItem`; a monthly item has `ceiling` =
  amount × 12 and `ceilingToDate`, an annual one `ceiling` = its amount and no `ceilingToDate`. When
  `overallMonthlyAmount` is set, one more line FIRST: `{ label: 'Totale', kind: 'expense', period: 'overall' }`,
  measured as a monthly item with `getMonthlyTotalExpenses` (a year: the sum of its twelve months). `scheduled` is
  the same function on the rows dated after `context.todayIso`. Every amount through `roundToCents`.
- `centri_di_costo`: `!context.costCentersEnabled` → `{ enabled: false }`; `context.costCenters === UNREADABLE` →
  `AssistantToolError('Non riesco a leggere i centri di costo adesso.')`; else `{ enabled: true, period, today,
  centers }` with one entry per `CostCenter`, archived ones included: `{ name, archived: Boolean(archivedAt), spent,
  rows, ceiling: budgetAmount ?? null, ceilingPeriod: budgetPeriod ?? null, lastExpense }`, on the rows of
  `groupExpensesByCostCenter(context.expenses, context.costCenters)[id].spending` (`lib/utils/costCenterUtils.ts` —
  by the centre's ID, refunds out, a row naming a deleted centre in no entry) whose Italian day is inside the
  period and not after today: `spent` = Σ |amount|, `rows` their count, `lastExpense` the Italian day of
  `resolveLastActivityDate` on them, null with none. The history's floor does not apply: the page has none.

`context.ts` exports two functions on ONE read:

```ts
/** The tools' context and the CASHFLOW block from the same expense read: the route's one call. */
export async function readAssistantTurnData(userId: string, now: Date): Promise<{ toolContext: AssistantToolContext; cashflowBlock: string }>
/** The context alone, for a caller with no chat turn (the spending-review email). */
export async function buildAssistantToolContext(userId: string, now: Date): Promise<AssistantToolContext>
```

`readAssistantTurnData` awaits `fetchCashflowBlockInputs` (`lib/services/assistantMonthContextService.ts` — a
rejection is the caller's: a 500, as today) beside `Promise.allSettled` of `fetchCostCenters` and
`fetchBudgetConfig` (both become exported; a rejection is logged and becomes `UNREADABLE`), all three started
together; the block is `formatCashflowBlockForPrompt(buildCashflowBlock(expenses, input))` on that read, as
`readCashflowBlockForPrompt` builds it; `clock` is `queryClockOf(todayIso, settings?.cashflowHistoryStartYear)`
and `costCentersEnabled` is `settings?.costCentersEnabled === true`. `buildAssistantToolContext` returns its
`toolContext`. The route (`app/api/ai/assistant/stream/route.ts`), where it calls `readCashflowBlockForPrompt`
today: Registra keeps that call and gets no context (no read of budget or centres); every other mode calls
`readAssistantTurnData(body.userId, now)` — one expense query a request, as today.

### 4.3 The loop — `lib/server/assistant/anthropicStream.ts`

`streamAssistantResponse` gains `toolContext?: AssistantToolContext` and, for every mode but Registra with a context,
runs this loop in place of the single `create` (`:233-307`); without a context (Registra) the request is today's.

```ts
export const ASSISTANT_TOOL_ROUNDS_MAX = 8;
/** Measured from the first request: past it the tools answer «stop». The function dies at 300 s (owner, 2026-11-23). */
export const ASSISTANT_TOOL_DEADLINE_MS = 200_000;
/** Requests the model gets after the limit: one to close, one more if it asks again. */
const CLOSING_REQUESTS_MAX = 2;
/** Times a paused server-side search is sent back before the loop gives up. */
const PAUSE_RESUMES_MAX = 3;
const TOOL_LIMIT_RESULT = 'Limite di calcoli raggiunto: rispondi adesso con i dati che hai, senza chiedere altri strumenti.';

const messages: Anthropic.Beta.BetaMessageParam[] = buildMessagesArray(mode, userContent, conversationHistory);
// ONE list for every request of the answer: a thinking block already in `messages` was written against it.
const tools = [...(enableWebSearch ? [webSearchTool] : []), ...ASSISTANT_TOOL_DEFINITIONS];
const startedAt = Date.now();
let toolRounds = 0;
let toolCalls = 0;
let closingRequests = 0;
let pauses = 0;
for (;;) {
  const stream = anthropic.beta.messages.stream({
    model: ASSISTANT_MODEL,
    betas: [SERVER_SIDE_FALLBACK_BETA],
    fallbacks: 'default',
    max_tokens: maxTokens,
    system,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    tools,
    messages,
  });
  stream.on('streamEvent', handleEvent); // today's per-chunk handling: status, web search, fallback, text
  const message = await stream.finalMessage();
  stopReason = message.stop_reason;

  // The server's own search loop paused: send the turn back and it resumes.
  if (message.stop_reason === 'pause_turn') {
    if (++pauses > PAUSE_RESUMES_MAX) break;
    messages.push({ role: 'assistant', content: message.content });
    continue;
  }
  const calls = message.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use');
  // A truncated or refused turn can hold a half-written call: never run it.
  if (message.stop_reason !== 'tool_use' || calls.length === 0) break;
  const limitReached = toolRounds >= ASSISTANT_TOOL_ROUNDS_MAX || Date.now() - startedAt >= ASSISTANT_TOOL_DEADLINE_MS;
  if (limitReached && closingRequests >= CLOSING_REQUESTS_MAX) break;

  status = 'computing';
  onStatus('computing');
  // The whole content goes back, thinking blocks included and unchanged.
  messages.push({ role: 'assistant', content: message.content });
  const results = limitReached
    ? calls.map((call) => ({ type: 'tool_result' as const, tool_use_id: call.id, content: TOOL_LIMIT_RESULT, is_error: true }))
    : await Promise.all(calls.map(async (call) => {
        const { content, isError } = await runAssistantTool(call.name, call.input, toolContext);
        return { type: 'tool_result' as const, tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) };
      }));
  if (limitReached) closingRequests += 1;
  else {
    toolRounds += 1;
    toolCalls += calls.length;
  }
  messages.push({ role: 'user', content: results });
  if (aggregatedText.length > 0) breakBeforeText = true;
}
```

- `handleEvent` is the body of today's `for await` (`:264-307`) moved into a function of the chunk — nothing in it
  changes; text written before a tool call streams to the user as it does today. The local `status` it reads
  becomes `'searching' | 'writing' | 'computing'`, and so does the `onStatus` of `StreamAssistantResponseArgs`
  (beside `'saving'`): the assignment in the loop is what makes the first text after the tools emit `'writing'`.
- `maxTokens` is today's expression (`isStructuredAnalysis ? ASSISTANT_STRUCTURED_MAX_TOKENS : chatMaxTokens`) and
  `webSearchTool` today's inline object, both lifted into a `const` above the loop; `max_uses` stays per request.
- After the loop, before today's handling of `stopReason`: a loop that ended on `tool_use` or `pause_turn` with no
  text written answers `TOOL_LIMIT_NOTICE` («*Non sono riuscito a chiudere i conti: riprova con una domanda più
  stretta.*», a constant beside `TRUNCATION_NOTICE`), sent with `onText` and saved as the text; with text written
  the text stands as it is. `max_tokens` with NO text (a turn cut inside its thinking or a call) answers
  `TRUNCATION_NOTICE` alone, as `refusal` answers `REFUSAL_NOTICE` — today that case is an empty bubble.
- The return gains `toolCalls` and `toolRounds` (logged by the route: `[assistant] tools: N calls, R rounds, S s`).
- `types/assistant.ts:436` and `lib/utils/assistantChatNarrative.ts:98`, `:117`: the status union gains
  `'computing'` → `['Faccio i conti sui tuoi dati…', 'Controllo le cifre…']`, a branch of `buildWaitingPhrases`
  beside the one of `'searching'`, before the reading is looked at; `useAssistantStreaming.ts:172`,
  `AssistantConversazioneTile.tsx:30`, `:56` and `AssistantStreamingResponse.tsx:237` treat `'computing'` as they
  treat `'searching'` (the wait comes back under an answer already begun).

### 4.4 The prompt — `lib/server/assistant/prompts.ts`

One constant, `TOOLS_SECTION`, joined by `buildAssistantSystem` (DATI-08) after `ANSWER_CONTRACT` and before the
period line — NOT in `ASSISTANT_SYSTEM_CORE`, which Registra and the emails read and which have no tools:

```
# Gli strumenti sui tuoi dati
Hai strumenti che interrogano il cashflow registrato, il budget e i centri di costo: i conti sulle righe li fa il codice e tu li chiedi. Usali ogni volta che la risposta ha bisogno di una cifra che non è già scritta nei dati del messaggio — un totale per categoria su un periodo qualunque, una serie mensile, il confronto tra due periodi, le righe dietro un numero. Sulle cifre già scritte nel messaggio o tornate da uno strumento il conto resta tuo; una cifra che richiede righe che non hai la chiedi, non la stimi. Chiedi in una volta sola tutto quello che ti serve (più chiamate nello stesso turno), poi rispondi: non nominare mai gli strumenti nella risposta.
Se uno strumento risponde con un errore su un nome, correggi il nome con quelli che ti elenca; se non trova righe, la cifra è zero e lo dici come «nessuna spesa registrata». Se un risultato dice che alcune righe sono rimaste fuori perché precedenti all'inizio dello storico, dillo in mezza riga. Se uno strumento ti dice di chiudere, rispondi con quello che hai.
```

`CASHFLOW_BLOCK_NOTE` (`:969`) is not touched: it is printed for Registra, the emails and the Consulente too.
Registra's contract is unchanged (it has no tools).

## 5. Constraints and traps

- **Opus 5.5 binds thinking blocks to the conversation**: here it means the assistant turn is pushed back as
  `message.content`, whole and unchanged, on every round — never rebuilt from the text.
- **No forced `tool_choice`** (a 400 on Opus 5.5): `tool_choice` is never sent; the prompt steers, and the limit is
  an `is_error` result, not a request without tools.
- **The `tools` array never changes inside an answer**: dropping the client tools on a last round would change the
  prefix the thinking blocks already in `messages` were written against. L3 holds it.
- **All `tool_result` blocks of a round in ONE user message**, each with its `tool_use_id`; a failed tool is an
  `is_error` result, never a dropped one.
- **`pause_turn`** (the server's web-search loop): the turn is re-sent as is, no «continua» message.
- **The system prompt and the tool list are byte-identical across requests** (prefix): the definitions are a module
  constant in a fixed order; no date, no name in a description.
- **Italian day** (`getItalyDateIso`), **cents** (`roundToCents`), **`countsTowardBudget` is the Budget's ONE gate**
  (`budgetUtils.ts:84`): the queries use the three; `budgetOnly` and `budget_stato` are the only places the gate applies.
- **`maxDuration = 300`** (`route.ts:69`): every round is a full model request, and one alone can take minutes —
  the cap of 8 does not bound the time, the deadline of 200 s does (decision 68). It is read when a request ENDS:
  a request in flight is never cut.
- **Tool inputs are the model's output, i.e. untrusted**: every input goes through its zod schema; a name is only
  ever compared, never used as a path or a query; `userId` is the route's `body.userId` already checked by
  `assertCanAccessAccount` (the owner's account, also for a co-owner — never `decodedToken.uid`), never an input.
- **`import 'server-only'` throws outside the `react-server` condition**: a test mocks it (`vi.mock('server-only',
  () => ({}))`), a throwaway script runs with `npx tsx --conditions=react-server`.
- **Key by id, label by name** (doc/guide/cashflow.md § Expense Grouping): the queries group through
  `getCategoryKey` / `getSubCategoryKey` and label through `resolveDisplayLabels`; a group keyed on a name merges
  two categories.
- **A probe never opens a control that spends**: every automated test mocks the SDK; no step calls the model.
- **Rate limit** (`route.ts:194-207`): one message is one unit however many rounds it takes.
- **No owner data**: fixtures are «Spesa 100 €», «Asilo 300 €», «Mutuo A 500 €».

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| Q1 | unit · `__tests__/assistantExpenseQueries.test.ts` | a row at 23:30 UTC of 31 October counts in November; `TZ=UTC` and `Europe/Rome` agree | `row.date.toISOString()` for the day |
| Q2 | unit · same | a transfer never counts; a `debt` row is spending; spending is positive; income is the signed sum (a negative correction lowers it) | `Math.abs` on income |
| Q3 | unit · same | a row dated tomorrow is out, in with `includeScheduled`; month grouping fills the empty months with zero and stops at today's month; asked from 1970 it starts at the account's first month; 70 months → the last 60 and `omittedGroups: 10`, the total still of all 70 | no fill; start at `query.fromIso` |
| Q4 | unit · same | «sanita» finds «Sanità»; a subcategory filter without that subcategory finds nothing; `text` finds a word in the notes; `unknownNames` lists the misses | exact string match |
| Q7 | unit · same | a floor of 2025: a row of December 2024 is in no total and `beforeFloorRows` is 1, in all three functions; no floor → it counts; the monthly series starts at January 2025 | drop the floor test |
| Q8 | unit · same | two categories named «Casa» with different ids, one `fixed` and one `variable` → two groups, «Casa (Spese Necessarie)» and «Casa (Spese Non Necessarie)»; a `categories: ['casa']` filter selects both; a row without subcategory is «Casa › Senza sottocategoria» | key by `foldName(row.categoryName)` |
| Q5 | unit · same | two periods: a group only in B has `a: 0`, `deltaPct: null`; rows by the size of the move; totals and their percentage | sort by label |
| Q6 | unit · same | 130 matching rows, limit 100 → 100 shown, `omitted: 30`, `rows: 130`, the total of all 130; a limit of 500 is 100 | total of the shown |
| B1 | unit · `__tests__/assistantTools.test.ts` (new) | `budget_stato`, today in November: a monthly item of 100 asked for the year has `ceiling: 1200` and `ceilingToDate: 1100`, asked for last year `ceilingToDate: 1200`; an annual item asked for March is `measuredOver: 'yearToMonth'` with January–March spent against the yearly ceiling; an `excludeFromBudget` row is not in `spent`; a row dated tomorrow is in `spent` and in `scheduled`; a type line is labelled «Spese Necessarie»; `overallMonthlyAmount` set → a first line «Totale»; no config → `configured: false` | drop the gate; `ceilingToDate` = `ceiling` |
| B2 | unit · same | `centri_di_costo`: two centres of the same name stay two entries; a refund is in no `spent`; an archived centre has `archived: true`; a row naming a deleted centre is in no entry; off in settings → `enabled: false` | group through `totalsBy(…, 'costCenter')` |
| T1 | unit · same | `cashflow_totali` returns the query's result with the period echoed; the `input_schema` of every definition is an object schema with a description on every property and no `$schema` key | `cashflow_totali` not echoing `period`; drop a `.describe()` |
| T2 | unit · same | an unknown category → `isError` with «Esistono: …»; a category deleted from the taxonomy and still on a row is accepted; `from > to` → `isError`; «2026-02-30» → `isError` «Parametri non validi»; an unknown tool → `isError`; a throwing tool → `isError`, logged; an unreadable budget → `isError` «Non riesco a leggere il budget adesso.» | rethrow |
| L1 | unit · `__tests__/anthropicStream.test.ts` | chat with a context sends the five definitions (and the web tool when on); Registra sends none; the definitions are the same array for two requests | tools on Registra |
| L2 | unit · same | a first message stopping on `tool_use` with two calls → both run, ONE user message with two `tool_result`s in order, the assistant content pushed back unchanged (a thinking block included) → the second round's text is the answer | one message per result |
| L3 | unit · same | a model that asks tools forever: 8 rounds run their tools, the 9th and 10th requests' calls are answered with `TOOL_LIMIT_RESULT` as `is_error` and no tool runs, there is no 11th request, the answer is `TOOL_LIMIT_NOTICE`; every one of the 10 requests carries the same `tools` | no cap; drop the client tools on the closing request |
| L4 | unit · same | `stop_reason: 'max_tokens'` with a `tool_use` block and no text → no tool runs, the answer is the truncation notice alone; `refusal` → no tool runs | run on any `tool_use` block; keep the `text.length > 0` condition |
| L5 | unit · same | `pause_turn` → the turn is re-sent with no added user message; four pauses in a row → the loop ends | push «continua»; no cap on the pauses |
| L6 | unit · same | `onStatus('computing')` before the tools, `'writing'` at the text that follows | drop `status = 'computing'` |
| L7 | unit · same | fake timers: the first request ends 201 s after the start with a tool call → no tool runs, the call is answered with `TOOL_LIMIT_RESULT`, the next request's text is the answer | read the cap only |
| P1 | unit · `__tests__/assistantPromptBundle.test.ts` | `buildAssistantSystem` of every mode contains «# Gli strumenti sui tuoi dati»; Registra's system and the email's do not; the system is equal for two users and two days | put the section in the core; interpolate `todayIso` in it |
| P1b | unit · `__tests__/monthlyEmailService.test.ts` | the AI comment's request names none of the five tools (the web search stays as it is today) | pass `ASSISTANT_TOOL_DEFINITIONS` to the email |
| S1 | unit · `__tests__/assistantRoutes.test.ts` | a chat request reads the expenses ONCE and passes `toolContext` and the block built on that read; Registra gets no context and reads neither budget nor centres | the route calling `readCashflowBlockForPrompt` beside `readAssistantTurnData` |
| S2 | unit · same | `fetchBudgetConfig` rejecting → the request still streams, `toolContext.budgetConfig` is `'unreadable'`; `fetchCashflowBlockInputs` rejecting → 500 | `Promise.all` on the three reads |
| D1a | dom · `__tests__/useAssistantStreaming.test.tsx` | a `status: computing` event → `streamStatus === 'computing'` | map it to `writing` |
| D1b | unit · `__tests__/assistantChatNarrative.test.ts` | `buildWaitingPhrases(reading, 'computing')` → «Faccio i conti sui tuoi dati…», «Controllo le cifre…», whatever the reading | put the branch after the reading's |

**The harness.** L1–L7 spy `Anthropic.Beta.Messages.prototype.stream` and return, per request, a fake `{ on(event,
listener) { … return this; }, finalMessage() }` that replays the recorded `streamEvent`s to the listener and then
resolves the recorded message — the SDK's real `stream()` cannot be fed through the `create` mock the file uses
today (it reads `withResponse()` and the controller). The file's existing tests, which pass no `toolContext`, stay
on `create`. `__tests__/assistantRoutes.test.ts` adds `fetchCostCenters` and `fetchBudgetConfig` to its factory of
`@/lib/services/assistantMonthContextService`. `__tests__/assistantTools.test.ts` mocks `server-only`.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: asked «quanto ho speso per Asilo tra gennaio e ottobre?» on the seeded account, the
Assistente shows «Faccio i conti sui tuoi dati…», then answers with the exact sum of the planted rows as its first
figure; asked «perché ho speso di più quest'anno?» it names the categories that moved, with both years' totals.

- A — the diff; the five definitions read aloud. B–E by a throwaway script inside the repo, run with `npx tsx
  --conditions=react-server`, that drives `streamAssistantResponse` against a MOCKED SDK replaying recorded turns
  (no spend) on the emulators' data: B one tool round; C two parallel calls; D an unknown category, corrected at
  the next round; E the 8-round cap, the deadline, a refusal, and the status line in the browser through the fake
  stream (`e2e/assistantRegister.ts`, `statuses: ['computing']` and no text, so the wait stays on screen). Decoy
  rows «ornitorinco» (a transfer of 9.999 €, which no total may include), «fenicottero» (a row dated tomorrow) and
  «pangolino» (a row before the history's first year).
- F — at the owner's «pronto», on the mirror, with the real model (the owner's yes is the «pronto»: index § 8 rule
  5): the three questions of point 8 again, each checked to the cent against Cashflow › Analisi for the same
  period, and «come sto con il budget quest'anno?» against Cashflow › Budget; the server log's `tools:` line read
  for each.

## 8. Putting it into service

No rules, no index, no migration. Each answer may now be several model rounds: more latency and tokens on a question
that needs data, none on one that does not. The server log line (`tools: N calls, R rounds, S s`) is the measure to
read in the first week. With phase F closed and the commit in `develop`, the owner opens the PR `develop` → `main`
(index § 8 rule 13).

## 9. Documentation

- `doc/guide/assistente.md` — § «The tools» (C3: the registry and `defineAssistantTool`, the context built once,
  the loop with its cap and its deadline, the one `tools` list per answer, the statuses, filters by name and groups
  by id, how a later spec adds a tool); § Per-page blind spots: the tool results are not saved with the thread, so
  a follow-up asks again; a renamed category filters by its current name and by the name still written on its old
  rows; the web search's `max_uses` is per request, so an answer of several rounds may search more than three
  times; between two tool rounds the model may write nothing, and the wait line is all the user sees; the rows
  ahead are read up to twelve months, `includeScheduled` sees no further; a request in flight is never cut by the
  deadline; prompt caching across the rounds is off. DATI-08 leaves the guide near 450 lines: past ~500 this
  session splits «The tools» into `doc/guide/assistente-strumenti.md` (decision 47).
- `doc/guide/cashflow.md` — § «Expenses by window»: the Assistente's server read is whole and shared by the block and
  the tools; § Expense Grouping: the Assistente's queries are one more reader of the rule.
- `doc/guide/cashflow-budget.md` and `doc/guide/centri-di-costo.md` — one sentence each: the Assistente's tool
  reads the page's own functions.
- `doc/guide/server.md` — the tool inputs are untrusted; the deadline against `maxDuration`.
- `AGENTS.md` § 3, Assistente stub — rewritten at equal or shorter length (decision 47). `CLAUDE.md` — the
  Assistente line rewritten at equal or shorter length with «query tools on cashflow, budget and centres, computed
  by code»; the «Latest» entry REPLACED whole (decision 46: the date, this spec in one sentence, «Open: doc/dati/
  (README § 6)», «Next: DATI-10»); under 20.000 characters, counted with `node`.
- `README.md` — the Assistente feature lines. `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`,
  in the file's form: «**Assistente — i conti esatti sulle tue spese** — Added tools the Assistente calls to total,
  compare and list the recorded cashflow over any period, category or single expense, and to read the budget and
  the cost centres: the figures are computed by code.»
- `doc/dati/README.md` § 6 (the row of 09 to `implemented`) and § 7 (C3 as built).

## 10. Declared out of scope

- Tools on the trade ledger, the dividends and the net-worth history → DATI-15.
- The same tools for the spending-review email → DATI-11 (it calls the pure queries directly, no loop).
- Saving the tool results in the thread → doc/guide/assistente.md § Per-page blind spots.
- Prompt caching across the rounds of one answer → doc/guide/assistente.md § Per-page blind spots (the rounds
  re-send the system and the data block; the log line of § 8 is what a later change is measured against).
- A ceiling on the input tokens of one answer (a long thread and nine requests) → the same section.
- Tools for the Consulente → DATI-15 gives it the 30-day block; its agents stay tool-less.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-09-assistente-strumenti-cashflow.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C3, e C4 da DATI-08 —, regole della serie)
- Leggi doc/guide/assistente.md, doc/guide/cashflow.md (§ Expense Sign Convention, § Expenses by
  window, § Expense Grouping: key by id, label by name), doc/guide/cashflow-budget.md,
  doc/guide/centri-di-costo.md, doc/guide/server.md e doc/guide/e2e-emulatori.md PRIMA di scrivere
  codice in quei domini
- Tocca l'API di Anthropic: usa la skill claude-api (uso degli strumenti, ciclo manuale in streaming)
  prima di scrivere il ciclo
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: le interrogazioni pure con Q1–Q8, il registro con
defineAssistantTool e i cinque strumenti (B1, B2, T1, T2), il contesto letto una volta e la route (S1,
S2), il ciclo con il tetto e la scadenza (L1–L7, con il finto `stream` descritto in fondo al § 6), il
prompt (P1, P1b), lo stato «Faccio i conti…» (D1a, D1b), i documenti del § 9 e la riga 09 di
doc/dati/README.md § 6 a `implemented` (e C3 nel § 7 com'è costruito). OGNI test del § 6 va visto rosso
con la sua mutazione. Il codice del § 4.1, il registro del § 4.2 e il ciclo del § 4.3 sono già scritti:
copiali.

Fermati e chiedimi se: DATI-08 non è in develop (`buildAssistantSystem`, `ANSWER_CONTRACT`, il modello),
l'SDK installato non espone `beta.messages.stream` o `finalMessage` come dice la spec, `z.toJSONSchema`
non produce uno schema a oggetto per uno dei cinque strumenti, oppure una verifica automatica chiamerebbe
il modello vero.

Collaudo: § 7, la F al mio «pronto» (le tre domande del punto 8 e il budget, al centesimo). Un branch, un
commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa. A commit in
develop, ricordami la PR develop → main (regola 13 dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an L spec that introduces a shared contract (the tool registry and the
loop) on the route every answer goes through. Estimated size: L (one pure module, a tools folder of eight files, the
loop, 26 tests).
