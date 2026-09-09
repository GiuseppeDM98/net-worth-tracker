# Cashflow — meccanica delle spese condivisa

> **Quando aprire questa guida** — questa guida copre le regole comuni a tutte le tab
> Cashflow (Tracciamento, Analisi, Budget, Dividendi, Divisione) e ai Centri di Costo — segno,
> ricorrenze, import, raggruppamento, drill-down, Sankey. Aprila quando tocchi
> `lib/utils/{expenseGrouping,expenseTypeTransition,recurrenceDates,expenseImport,cashflowSankey}.ts`,
> `lib/services/expenseImportService.ts`, `handleEntitySelect` in `AnalisiTab.tsx` o i loro
> consumatori. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa.
> Moduli e file: `CLAUDE.md` → *Key Files* → le voci *Analisi*, *Cashflow / cost centers* e
> *Shared utils*.

## Expense Grouping: key by id, label by name (`lib/utils/expenseGrouping.ts`)
- **Category names are NOT unique and never will be** — the product deliberately allows "Casa" as both a *Spese Fisse*
  and a *Spese Variabili* category, so anything keyed on `categoryName` merges them.
- **The one rule: group by `getCategoryKey`/`getSubCategoryKey`, display via `resolveDisplayLabels`.** `getCategoryKey` =
  `categoryId || trimmed name || UNCATEGORIZED_LABEL`; `getSubCategoryKey` maps missing/blank to `NO_SUBCATEGORY_KEY`, a
  key like any other — which is what lets callers drop their `=== 'Altro'` special cases.
- **`resolveDisplayLabels` qualifies ONLY where the rendered surface actually collides**: ambiguity is measured over the
  set of KEYS per name, not a row count. `selectExpensesForDrillDown` matches the type **EXACTLY** — `type !== 'income'` would lump
  fixed+variable+debt together and let transfers through.

## Expense Sign Convention and Type Changes
- Income positive, expenses negative, net savings = `sum(income) + sum(expenses)`; crossing the boundary flips the sign.
- **Classification is ALWAYS by `type`, never by the sign of `amount`** (`transfer` skipped, `income` income, everything
  else spending via `Math.abs`) — by sign, a refund counts as income. Fixtures must carry an explicit `type`.
- **`ExpenseDialog` type change is shape-aware across all five types**: `reconcileTransferEdit`, `reconcileSingleEdit`
  and the two cross-shape edits, which reverse the OLD shape and apply the new one in one delta-map transaction.
  `updateExpense` re-derives the sign from the incoming type and nulls `transferCashAssetId` when it leaves transfer.
  **That control lives in EDIT mode only** — creation picks the type in step 1 (AGENTS.md § Two-Step Create Dialogs), so the
  reconciliation paths above are reachable exclusively from a saved row.
- **The BATCH paths refuse to cross the transfer boundary** (`crossesTransferBoundary`): `updateExpensesType`,
  `moveExpensesToCategory`, `moveExpensesFromSubCategory` throw `TransferBoundaryError` when expenses exist, since each
  row would need its own destination account.
- Changing the type always invalidates the category (categories are type-scoped) — `resolveEquivalentCategory` re-points
  to the same-named one under the new type.

## Recurring Series (`lib/utils/recurrenceDates.ts`)
- **A recurring expense is not a rule, it is N documents.** `createRecurringExpenses` materialises the whole series as
  real future-dated rows sharing a `recurringParentId`, which is why Cashflow, Analisi, Budget and the assistant know
  nothing about recurrence — and why the form states how many rows it is about to write, and over which span.
- **`canTypeRecur` is the single source on which types may recur** (`fixed`/`variable`/`debt`). `income` is a product
  decision; **`transfer` is structural** — each occurrence moves TWO accounts while the series reconciles balances only
  on its FIRST entry, so a recurring transfer needs a two-legged reconciliation that does not exist. Widening the set
  also breaks `createRecurringExpenses`' unconditional `-Math.abs(amount)`.
- **Both ceilings in `MAX_RECURRENCE_OCCURRENCES` (360 monthly / 40 yearly) exist to stay under 500**: the series is
  created in ONE `writeBatch` and `deleteRecurringExpenses` removes it in one too. Raising either past 500 means
  chunking both.
- **`new Date(y, m, 31)` rolls February forward into March** — the clamp must cap the day against the real length of
  the TARGET month before constructing the Date, never fix up an already-overflowed one.
- **An absent `recurringFrequency` means monthly, never unknown** (rows predate the cadence): read it through
  `resolveRecurrenceFrequency`. A yearly series' MONTH is not stored — it is the month of the row's own date, which
  every occurrence shares by construction, and `describeRecurrence` is the only place that turns that into words.
- **`recurringCount` is form-only and must never reach Firestore**: `updateExpense` spreads whatever it is handed, so
  the edit path passes it as `undefined` explicitly. The toggle itself is **creation-only** — the length of a saved
  series is not editable from one of its rows.

## Expense CSV Import (`lib/utils/expenseImport.ts`, `lib/services/expenseImportService.ts`)
- Impostazioni → Spese. A pure parse → validate → plan layer with a MANDATORY preview before any write; every row of
  one import shares an `importBatchId`, which is what the one-tap undo deletes by. Category identity is **(name,
  type)**, never the name alone. `transfer` rows are rejected and cash balances are never touched by an import.

## Cashflow Drill-Down: One Landing Path
- **There is ONE drill destination and ONE transaction list**: every entity entry point on Analisi (a category row, a
  Fuori scala row, a Spese maggiori row, a Sankey node, `EntitySearch`, a Confronto row) lands through
  `handleEntitySelect` in `AnalisiTab.tsx`, which resolves labels exactly like a URL-restored focus and opens the
  Scheda tile. A new entry point calls that handler only.

## Sankey: node identity is the node id (`lib/utils/cashflowSankey.ts`)
- **d3-sankey resolves link endpoints through a `Map` of ids**, so a duplicate id keeps the LAST node and orphans the
  earlier one as a zero-value ghost. Ids are built from **ids**, never display names.
- **The type belongs inside the category id** (`cat:{tipo}:{chiave}`), because without that prefix an income and an
  expense category of the same name close a cycle through Budget and `computeNodeDepths` throws `"circular link"`,
  blanking the chart. **Ids are opaque**: `index` is the only sanctioned way to ask what a node is.
