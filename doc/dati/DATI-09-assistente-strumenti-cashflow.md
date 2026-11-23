# DATI-09 — Assistente: tools that query the cashflow, the budget and the cost centres

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-08 (the form of the answer, the model, the
> message shape). DATI-11 and DATI-15 depend on it.
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 8; decisions 16 and 17. Defines the
> shared contract **C3** (the Assistente's tool registry, index § 7).

## 1. The problem today (evidence on the code)

The owner's three questions (what the daughters cost, the two mortgages, why spending rose against 2025) need figures
the model is never given:

- **Categories exist for the twelve full months only**, the monthly series by TYPE only, and no single row ever
  reaches the model: `lib/utils/cashflowBlock.ts` — caps `:53-58` (40 commitments, 20 sources, 60 subcategories), the
  series `:258-287`, the printer `:826-856`. A period block lists categories for its own period; nothing compares two
  periods by category, nothing lists the rows behind a figure.
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
   asking, at most 8 rounds. Proof: L2, L3.
3. Totals follow the cashflow's rules: the row's Italian day, classification by `type`, transfers out, a spending
   figure positive, rows dated after today out unless asked. Proof: Q1–Q3.
4. A filter names categories, subcategories and cost centres as the user reads them (case and accents ignored); an
   unknown name is an error result that lists the existing ones. Proof: Q4, T2.
5. A comparison returns, per group, both totals, the difference and its percentage, largest move first. Proof: Q5.
6. Rows are capped at 100 with the count and the total of ALL the matching rows declared. Proof: Q6.
7. The budget tool returns, per budget line, the ceiling, the spent and the remainder for the year or the month
   asked, with the Budget's own gate (`countsTowardBudget`). Proof: B1.
8. An invalid input, an unknown tool, a thrown tool: an `is_error` result, never a 500; a truncated or refused turn
   runs no tool. Proof: L4, L5.
9. While a tool runs the user reads «Faccio i conti sui tuoi dati…». Proof: L6, D1.
10. The system prompt stays static; the tools' definitions are identical for every request. Proof: P1.
11. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green.

## 3. Decisions

- **Decision 16** (owner, 2026-11-23): query tools, not a larger block.
- **Decision 17** (owner, 2026-11-23): beside the cashflow — budget and cost centres (here), the trade ledger and the
  dividends, the net-worth history (DATI-15).
- Adopted, reversible:
  - (a) a manual streaming loop on `anthropic.beta.messages.stream()` + `finalMessage()` (both in the installed SDK,
    `@anthropic-ai/sdk` 0.115.0); the SDK's tool runner is not used because the loop must keep the route's status
    events and the server-side fallback.
  - (b) at most 8 model rounds per answer; past them the model is asked once, with no tools, to answer with what it
    has.
  - (c) filters by NAME, not by id: the names are what the data blocks print and what the user says.
  - (d) the CASHFLOW 12 MESI block stays in the prompt (it carries the commitments and the medians no tool returns);
    the tools add what it cannot hold.
  - (e) the tool results are not saved with the message: the history is replayed as text, as today.
  - (f) `eager_input_streaming` is left OFF on these tools: their inputs are a few short fields, and the buffered
    default keeps the server-side validation.

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
 * figure is positive; `excludeFromBudget` rows count unless the query is the Budget's.
 * Pure: no Firebase, no clock — «today» is a parameter.
 */
import type { Expense } from '@/types/expenses';
import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { countsTowardBudget } from '@/lib/utils/budgetUtils';

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

function selectRows(expenses: readonly Expense[], query: ExpenseQuery, todayIso: string): Selected[] {
  const categories = query.categories?.map(foldName);
  const subCategories = query.subCategories?.map(foldName);
  const costCenters = query.costCenters?.map(foldName);
  const needle = query.text ? foldName(query.text) : '';
  const selected: Selected[] = [];
  for (const row of expenses) {
    if (row.type === 'transfer') continue;
    if ((row.type === 'income') !== (query.kind === 'income')) continue;
    const day = getItalyDateIso(row.date);
    if (day < query.fromIso || day > query.toIso) continue;
    if (!query.includeScheduled && day > todayIso) continue;
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
    selected.push({ row, day, value });
  }
  return selected;
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

function groupOf(selected: Selected, by: GroupBy): { key: string; label: string } {
  const { row, day } = selected;
  if (by === 'month') return { key: day.slice(0, 7), label: day.slice(0, 7) };
  if (by === 'type') return { key: row.type, label: TYPE_LABELS[row.type as keyof typeof TYPE_LABELS] };
  if (by === 'category') return { key: foldName(row.categoryName), label: row.categoryName };
  if (by === 'subcategory') {
    const sub = row.subCategoryName ?? '(senza sottocategoria)';
    return { key: `${foldName(row.categoryName)}/${foldName(sub)}`, label: `${row.categoryName} › ${sub}` };
  }
  return row.costCenterName
    ? { key: foldName(row.costCenterName), label: row.costCenterName }
    : { key: '', label: '(nessun centro di costo)' };
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
  /** Groups past the cap, smallest first to go; their sum is in `total`, not in `groups`. */
  omittedGroups: number;
}

function groupAll(selected: Selected[], by: GroupBy): Map<string, GroupRow> {
  const groups = new Map<string, GroupRow>();
  for (const item of selected) {
    const { key, label } = groupOf(item, by);
    const group = groups.get(key) ?? { key, label, total: 0, rows: 0 };
    group.total += item.value;
    group.rows += 1;
    groups.set(key, group);
  }
  return groups;
}

/** The total of a query and its groups: months in calendar order with the empty ones at zero, any other grouping largest first. */
export function totalsBy(expenses: readonly Expense[], query: ExpenseQuery, by: GroupBy, todayIso: string): TotalsResult {
  const selected = selectRows(expenses, query, todayIso);
  const groups = groupAll(selected, by);
  const total = roundToCents(selected.reduce((sum, item) => sum + item.value, 0));
  if (by === 'month') {
    const lastIso = query.includeScheduled || query.toIso <= todayIso ? query.toIso : todayIso;
    const months = lastIso < query.fromIso ? [] : monthKeysOf(query.fromIso, lastIso);
    return {
      total,
      rows: selected.length,
      groups: months.map((key) => {
        const group = groups.get(key);
        return { key, label: key, total: roundToCents(group?.total ?? 0), rows: group?.rows ?? 0 };
      }),
      omittedGroups: 0,
    };
  }
  const sorted = [...groups.values()]
    .map((group) => ({ ...group, total: roundToCents(group.total) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.label.localeCompare(b.label, 'it'));
  return { total, rows: selected.length, groups: sorted.slice(0, GROUPS_CAP), omittedGroups: Math.max(0, sorted.length - GROUPS_CAP) };
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
  todayIso: string,
): CompareResult {
  const selectedA = selectRows(expenses, { ...filters, ...periodA }, todayIso);
  const selectedB = selectRows(expenses, { ...filters, ...periodB }, todayIso);
  const groupsA = groupAll(selectedA, by);
  const groupsB = groupAll(selectedB, by);
  const rows: CompareRow[] = [...new Set([...groupsA.keys(), ...groupsB.keys()])].map((key) => {
    const a = roundToCents(groupsA.get(key)?.total ?? 0);
    const b = roundToCents(groupsB.get(key)?.total ?? 0);
    return { label: (groupsB.get(key) ?? groupsA.get(key))!.label, a, b, delta: roundToCents(b - a), deltaPct: pct(a, b) };
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
}

/** The rows behind a figure, at most `ROWS_CAP`, with the count and the total of all of them. */
export function listRows(
  expenses: readonly Expense[],
  query: ExpenseQuery,
  order: 'date-desc' | 'date-asc' | 'amount-desc',
  limit: number,
  todayIso: string,
  /** The ceiling on what is shown: the tools use the default, the spending-review email a higher one. */
  maxRows: number = ROWS_CAP,
): RowsResult {
  const selected = selectRows(expenses, query, todayIso);
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
      category: row.categoryName,
      subCategory: row.subCategoryName ?? null,
      amount: roundToCents(value),
      notes: row.notes?.slice(0, 160) ?? null,
      costCenter: row.costCenterName ?? null,
      recurring: row.isRecurring === true || Boolean(row.installmentParentId),
    })),
    omitted: Math.max(0, selected.length - cap),
  };
}

/** The names a filter does not find among the recorded rows and the taxonomy, with what exists. */
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
import type { z } from 'zod';

/** What a tool may read: built ONCE per request, before the first model round. */
export interface AssistantToolContext {
  userId: string;
  todayIso: string;
  now: Date;
  /** The whole recorded cashflow, the read the CASHFLOW block already makes. */
  expenses: readonly Expense[];
  categories: readonly ExpenseCategory[];
  costCenters: readonly CostCenter[];
  budgetConfig: BudgetConfig | null;
  costCentersEnabled: boolean;
}

export interface AssistantTool<Input = unknown> {
  definition: Anthropic.Beta.BetaTool;
  input: z.ZodType<Input>;
  /** Returns the JSON the model reads; throws `AssistantToolError` for a refusal the model can act on. */
  run: (input: Input, context: AssistantToolContext) => Promise<unknown> | unknown;
}

export class AssistantToolError extends Error {}

export const ASSISTANT_TOOLS: readonly AssistantTool[] = [spendingTotals, spendingCompare, spendingRows, budgetState, costCentersState];
export const ASSISTANT_TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = ASSISTANT_TOOLS.map((tool) => tool.definition);

/** One tool call as the `tool_result` content: the JSON on success, an error sentence otherwise. Never throws. */
export async function runAssistantTool(name: string, rawInput: unknown, context: AssistantToolContext): Promise<{ content: string; isError: boolean }> { … }
```

`runAssistantTool`: unknown name → `{ isError: true, content: 'Strumento sconosciuto: {name}.' }`; `tool.input.safeParse`
failing → `{ isError: true, content: 'Parametri non validi: {issues}' }`; `AssistantToolError` → its message; any other
throw → logged, `'Lo strumento non ha risposto: rispondi con i dati che hai e dillo.'`; success →
`JSON.stringify(result)`.

The five tools (each a file beside the registry; descriptions in Italian, written out here because they are the
prompt):

| name | description | input (all strict, `additionalProperties: false`) |
|---|---|---|
| `cashflow_totali` | «Somma le spese o le entrate registrate in un periodo qualunque, raggruppate per categoria, sottocategoria, tipo, mese o centro di costo. Usalo ogni volta che ti serve un totale o una serie mensile che non è già scritta nei dati del messaggio. Le spese tornano come cifre positive; i trasferimenti tra conti non contano mai.» | `kind`, `from`, `to` (YYYY-MM-DD), `groupBy`, + the filters |
| `cashflow_confronto` | «Confronta due periodi con gli stessi filtri: per ogni gruppo i due totali, la differenza (B − A) e la variazione percentuale, dal movimento più grande. Usalo per spiegare perché una cifra è cambiata.» | `kind`, `periodA {from,to}`, `periodB {from,to}`, `groupBy` (no `month`), + the filters |
| `cashflow_righe` | «Elenca le singole righe registrate che rispondono ai filtri (al più 100), con il conteggio e il totale di TUTTE quelle che corrispondono. Usalo per mostrare che cosa c'è dietro una cifra o per cercare una spesa per parola nelle note.» | `kind`, `from`, `to`, `order` (`date-desc` \| `date-asc` \| `amount-desc`), `limit` (1–100), + the filters |
| `budget_stato` | «Lo stato del budget: per ogni voce il tetto, lo speso e il residuo nell'anno o nel mese chiesto. Conta solo le righe che il Budget conta.» | `year`, `month?` (1–12) |
| `centri_di_costo` | «I centri di costo: per ciascuno il totale speso in un periodo, il tetto se c'è e l'ultima spesa.» | `from`, `to` |

The filters, shared by the first three: `types?` (`fixed` \| `variable` \| `debt`, described as «Spese Necessarie»,
«Spese Non Necessarie», «Debiti»), `categories?`, `subCategories?`, `costCenters?` (arrays of names, «scritti come
compaiono nei dati»), `text?`, `minAmount?`, `maxAmount?`, `budgetOnly?`, `includeScheduled?`.

Runs:
- the three cashflow tools validate `from ≤ to` and the names: `unknownNames(input.categories, namesOf(context.categories))`
  (and the same for subcategories and centres) non-empty → `AssistantToolError('Categoria sconosciuta: «X». Esistono:
  A, B, C…')` (the first 40 names); then call `totalsBy` / `comparePeriods` / `listRows` and return its result with
  `{ period: { from, to }, today: context.todayIso }` echoed.
- `budget_stato`: no config → `{ configured: false }`; else, per `BudgetItem` of the config, `{ label, period,
  ceiling, spent, remaining }` where `spent` is `getMonthActualForItem` (`lib/utils/budgetUtils.ts:188`) for a month
  or `getActualForItem` (`:128`) for the year, and `ceiling` the item's amount for the asked span (a monthly item ×
  12 for a year, an annual item ÷ 12 for a month, `roundToCents`); the line's label from `budgetItemKey`'s scope
  («Totale», the type's label, «Categoria», «Categoria › Sottocategoria»).
- `centri_di_costo`: centres off in settings → `{ enabled: false }`; else per centre `{ name, spent, rows, ceiling,
  ceilingPeriod, lastExpense }` from `totalsBy(…, 'costCenter')` and `resolveLastActivityDate`
  (`lib/utils/costCenterUtils.ts:42`) on the centre's rows.

`context.ts` exports `buildAssistantToolContext(userId, now)`: ONE `Promise.all` of `fetchCashflowBlockInputs`
(`assistantMonthContextService.ts:450`), `fetchCostCenters` (`:219`) and `fetchBudgetConfig` (`:234`) — the last two
become exported. The route builds the context where it calls `readCashflowBlockForPrompt` today
(`app/api/ai/assistant/stream/route.ts:337`) and derives the CASHFLOW block from the SAME read
(`formatCashflowBlockForPrompt(buildCashflowBlock(context.expenses, inputs))`), so the request still makes one
expense query.

### 4.3 The loop — `lib/server/assistant/anthropicStream.ts`

`streamAssistantResponse` gains `toolContext?: AssistantToolContext` and, for every mode but Registra with a context,
runs this loop in place of the single `create` (`:233-307`); without a context (Registra) the request is today's.

```ts
export const ASSISTANT_TOOL_ROUNDS_MAX = 8;

const messages: Anthropic.Beta.BetaMessageParam[] = buildMessagesArray(mode, userContent, conversationHistory);
const serverTools = enableWebSearch ? [webSearchTool] : [];
for (let round = 0; ; round++) {
  const lastRound = round === ASSISTANT_TOOL_ROUNDS_MAX;
  const stream = anthropic.beta.messages.stream({
    model: ASSISTANT_MODEL,
    betas: [SERVER_SIDE_FALLBACK_BETA],
    fallbacks: 'default',
    max_tokens: maxTokens,
    system,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    // The last round offers no client tool: the model answers with what it has.
    tools: lastRound ? serverTools : [...serverTools, ...ASSISTANT_TOOL_DEFINITIONS],
    messages,
  });
  stream.on('streamEvent', handleEvent); // today's per-chunk handling: status, web search, fallback, text
  const message = await stream.finalMessage();
  stopReason = message.stop_reason;

  // The server's own search loop paused: send the turn back and it resumes.
  if (message.stop_reason === 'pause_turn') {
    messages.push({ role: 'assistant', content: message.content });
    continue;
  }
  const calls = message.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use');
  // A truncated or refused turn can hold a half-written call: never run it.
  if (message.stop_reason !== 'tool_use' || calls.length === 0 || lastRound) break;

  onStatus('computing');
  // The whole content goes back, thinking blocks included and unchanged.
  messages.push({ role: 'assistant', content: message.content });
  const results = await Promise.all(calls.map(async (call) => {
    const { content, isError } = await runAssistantTool(call.name, call.input, toolContext);
    return { type: 'tool_result' as const, tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) };
  }));
  messages.push({ role: 'user', content: results });
  if (aggregatedText.length > 0) breakBeforeText = true;
}
```

- `handleEvent` is the body of today's `for await` (`:264-307`) moved into a function of the chunk — nothing in it
  changes; text written before a tool call streams to the user as it does today.
- The return gains `toolCalls: number` (logged: `[assistant] tools: N calls, R rounds`).
- `types/assistant.ts:436` and `lib/utils/assistantChatNarrative.ts:98`, `:117`: the status union gains
  `'computing'` → `['Faccio i conti sui tuoi dati…', 'Controllo le cifre…']`; `useAssistantStreaming.ts:172`,
  `AssistantConversazioneTile.tsx:30`, `:56` and `AssistantStreamingResponse.tsx:237` treat `'computing'` as they
  treat `'searching'` (the wait comes back under an answer already begun).

### 4.4 The prompt — `lib/server/assistant/prompts.ts`

One section added to `ASSISTANT_SYSTEM_CORE`, after «# Regole sui dati»:

```
# Gli strumenti sui tuoi dati (quando la richiesta te li dà)
Quando la richiesta ti dà strumenti che interrogano il cashflow registrato, il budget e i centri di costo, i conti li fa il codice e tu li chiedi. Usali ogni volta che la risposta ha bisogno di una cifra che non è già scritta nei dati del messaggio — un totale per categoria su un periodo qualunque, una serie mensile, il confronto tra due periodi, le righe dietro un numero. Non sommare a mano righe che non hai chiesto e non stimare una cifra che uno strumento può darti. Chiedi in una volta sola tutto quello che ti serve (più chiamate nello stesso turno), poi rispondi: non nominare mai gli strumenti nella risposta.
Se uno strumento risponde con un errore su un nome, correggi il nome con quelli che ti elenca; se non trova righe, la cifra è zero e lo dici come «nessuna spesa registrata».
```

`CASHFLOW_BLOCK_NOTE` (`:969`) gains: «Per ogni cifra che qui non c'è, usa gli strumenti, se la richiesta te li dà.» Registra's contract is
unchanged (it has no tools).

## 5. Constraints and traps

- **Opus 5.5 binds thinking blocks to the conversation**: here it means the assistant turn is pushed back as
  `message.content`, whole and unchanged, on every round — never rebuilt from the text.
- **No forced `tool_choice`** (a 400 on Opus 5.5): `tool_choice` is never sent; the prompt steers.
- **All `tool_result` blocks of a round in ONE user message**, each with its `tool_use_id`; a failed tool is an
  `is_error` result, never a dropped one.
- **`pause_turn`** (the server's web-search loop): the turn is re-sent as is, no «continua» message.
- **The system prompt and the tool list are byte-identical across requests** (prefix): the definitions are a module
  constant in a fixed order; no date, no name in a description.
- **Italian day** (`getItalyDateIso`), **cents** (`roundToCents`), **`countsTowardBudget` is the Budget's ONE gate**
  (`budgetUtils.ts:84`): the queries use the three; `budgetOnly` and `budget_stato` are the only places the gate applies.
- **`maxDuration = 300`** (`route.ts:69`): eight rounds of in-memory queries add model time only; the cap is what
  keeps a looping model inside it.
- **Tool inputs are the model's output, i.e. untrusted**: every input goes through its zod schema; a name is only
  ever compared, never used as a path or a query; `userId` comes from the verified token, never from an input.
- **A probe never opens a control that spends**: every automated test mocks the SDK; no step calls the model.
- **Rate limit** (`route.ts:194-207`): one message is one unit however many rounds it takes.
- **No owner data**: fixtures are «Spesa 100 €», «Asilo 300 €», «Mutuo A 500 €».

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| Q1 | unit · `__tests__/assistantExpenseQueries.test.ts` | a row at 23:30 UTC of 31 October counts in November; `TZ=UTC` and `Europe/Rome` agree | `row.date.toISOString()` for the day |
| Q2 | unit · same | a transfer never counts; a `debt` row is spending; spending is positive; income is the signed sum (a negative correction lowers it) | `Math.abs` on income |
| Q3 | unit · same | a row dated tomorrow is out, in with `includeScheduled`; month grouping fills the empty months with zero and stops at today's month | no fill |
| Q4 | unit · same | «sanita» finds «Sanità»; a subcategory filter without that subcategory finds nothing; `text` finds a word in the notes; `unknownNames` lists the misses | exact string match |
| Q5 | unit · same | two periods: a group only in B has `a: 0`, `deltaPct: null`; rows by the size of the move; totals and their percentage | sort by label |
| Q6 | unit · same | 130 matching rows, limit 100 → 100 shown, `omitted: 30`, `rows: 130`, the total of all 130; a limit of 500 is 100 | total of the shown |
| B1 | unit · `__tests__/assistantTools.test.ts` (new) | `budget_stato`: a monthly item asked for the year has the ceiling × 12; an `excludeFromBudget` row is not in `spent`; no config → `configured: false` | drop the gate |
| T1 | unit · same | `cashflow_totali` returns the query's result with the period echoed; `centri_di_costo` off → `enabled: false` | — (wiring) |
| T2 | unit · same | an unknown category → `isError` with «Esistono: …»; `from > to` → `isError`; an unknown tool → `isError`; a throwing tool → `isError`, logged | rethrow |
| L1 | unit · `__tests__/anthropicStream.test.ts` | chat with a context sends the five definitions (and the web tool when on); Registra sends none; the definitions are the same array for two requests | tools on Registra |
| L2 | unit · same | a first message stopping on `tool_use` with two calls → both run, ONE user message with two `tool_result`s in order, the assistant content pushed back unchanged (a thinking block included) → the second round's text is the answer | one message per result |
| L3 | unit · same | a model that asks tools forever stops at 8 rounds: the 9th request carries no client tool | no cap |
| L4 | unit · same | `stop_reason: 'max_tokens'` with a `tool_use` block → no tool runs, the truncation notice; `refusal` → no tool runs | run on any `tool_use` block |
| L5 | unit · same | `pause_turn` → the turn is re-sent with no added user message | push «continua» |
| L6 | unit · same | `onStatus('computing')` before the tools, `'writing'` at the text that follows | no status |
| P1 | unit · `__tests__/assistantPromptBundle.test.ts` | the system has «# Gli strumenti sui tuoi dati (quando la richiesta te li dà)»; still equal for two users; the email request sends no tool | — |
| S1 | unit · `__tests__/assistantRoutes.test.ts` | the route builds ONE context (one expense read) and passes it; Registra gets none | a second `fetchExpenses` |
| D1 | dom · `__tests__/useAssistantStreaming.test.tsx` | a `status: computing` event shows «Faccio i conti sui tuoi dati…» | map it to `writing` |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: asked «quanto ho speso per Asilo tra gennaio e ottobre?» on the seeded account, the
Assistente shows «Faccio i conti sui tuoi dati…», then answers with the exact sum of the planted rows as its first
figure; asked «perché ho speso di più quest'anno?» it names the categories that moved, with both years' totals.

- A — the diff; the five definitions read aloud. B–E by a throwaway script that drives `streamAssistantResponse`
  against a MOCKED SDK replaying recorded turns (no spend) on the emulators' data: B one tool round; C two parallel
  calls; D an unknown category, corrected at the next round; E the 8-round cap, a refusal, and the status line in the
  browser through the fake stream (`e2e/assistantRegister.ts`) with a planted `computing` event. Decoy rows
  «ornitorinco» (a transfer of 9.999 €, which no total may include) and «fenicottero» (a row dated tomorrow).
- F — at the owner's «pronto», on the mirror, with the real model: the three questions of point 8 again, each
  checked to the euro against Cashflow › Analisi for the same period.

## 8. Putting it into service

No rules, no index, no migration. Each answer may now be several model rounds: more latency and tokens on a question
that needs data, none on one that does not. The server log line (`tools: N calls, R rounds`) is the measure to read
in the first week.

## 9. Documentation

- `doc/guide/assistente.md` — § «The tools» (C3: the registry, the context built once, the loop and its cap, the
  statuses, why names and not ids, how a later spec adds a tool); § blind spots: the tool results are not saved with
  the thread, so a follow-up asks again; a renamed category matches by its current name only.
- `doc/guide/cashflow.md` — § «Expenses by window»: the Assistente's server read is whole and shared by the block and
  the tools.
- `doc/guide/server.md` — the tool inputs are untrusted; the loop's cap against `maxDuration`.
- `AGENTS.md` § 3, Assistente stub — one sentence. `CLAUDE.md` — Assistente line: «query tools on cashflow, budget
  and centres, computed by code (2026-11)», under 20.000 characters.
- `README.md` — the Assistente feature lines. `Draft Release Temp.md` — «Assistente: risponde con i conti esatti su
  qualunque periodo, categoria o singola spesa».
- `doc/dati/README.md` § 6 and § 7 (C3 as built).

## 10. Declared out of scope

- Tools on the trade ledger, the dividends and the net-worth history → DATI-15.
- The same tools for the spending-review email → DATI-11 (it calls the pure queries directly, no loop).
- Saving the tool results in the thread → doc/guide/assistente.md § blind spots.
- Prompt caching across the rounds of one answer → doc/guide/assistente.md § blind spots (the rounds re-send the
  system and the data block; measured in § 8 before any change).
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
  window), doc/guide/cashflow-budget.md, doc/guide/centri-di-costo.md e doc/guide/server.md PRIMA di
  scrivere codice in quei domini
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

Implementa la spec così com'è scritta, nell'ordine: le interrogazioni pure con Q1–Q6 (ognuna vista
rossa con la sua mutazione), il registro e i cinque strumenti (B1, T1, T2), il contesto letto una volta
e la route (S1), il ciclo (L1–L6), il prompt (P1), lo stato «Faccio i conti…» (D1). Il codice del § 4.1
e il ciclo del § 4.3 sono già scritti: copiali.

Fermati e chiedimi se: DATI-08 non è in develop (il modello, la forma della risposta), l'SDK installato
non espone `beta.messages.stream` o `finalMessage` come dice la spec, una verifica automatica
chiamerebbe il modello vero, oppure il ciclo non sta nei 300 secondi della route in un caso reale.

Collaudo: § 7, la F al mio «pronto» (le tre domande del punto 8, al centesimo). Un branch, un commit,
solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec that introduces a shared contract (the tool registry and the
loop) on the route every answer goes through. Estimated size: L (one pure module, a tools folder of seven files, the
loop, ~20 tests).
