# Cashflow — meccanica delle spese condivisa

> **Quando aprire questa guida** — questa guida copre le regole comuni a tutte le tab
> Cashflow (Tracciamento, Analisi, Budget, Dividendi, Divisione) e ai Centri di Costo — segno,
> ricorrenze, import, raggruppamento, drill-down, Sankey. Aprila quando tocchi
> `lib/utils/{expenseGrouping,expenseTypeTransition,recurrenceDates,expenseImport,cashflowSankey}.ts`,
> `lib/services/expenseImportService.ts`, `handleEntitySelect` in `AnalisiTab.tsx` o i loro
> consumatori. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa.
> Moduli e file: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Cashflow services**: services `lib/services/{budgetService,costCenterService,cashBalanceReconciliation,expenseImportService}.ts`, `lib/utils/expenseImport.ts`; the settlement rule `lib/utils/cashSettlement.ts` (pure) + `lib/server/cashSettlement.ts` (the server half, run by `/api/portfolio/snapshot`), «Collega la serie» (to an account or to a mortgage) in `components/expenses/LinkSeriesDialog.tsx`
- **Transfer fee** (2026-09-25): `lib/utils/transferFee.ts` (pure), `createTransferWithFee` / `saveTransferFee` / `getTransferFeeOf` / `deleteExpenseRows` in `lib/services/expenseService.ts`; tests `__tests__/transferFee.test.ts`, `e2e/cashflow.transfer-fee.spec.ts`
- **50/30/20 roles**: pure `lib/utils/spendingRoles.ts` (resolution, summary, the printed shares `summarizeSpendingRoleShares`, classification counts, the badge colour), the bucket → `--role-*` token map `lib/constants/spendingRoleColors.ts`, the `deleteField()` in `updateCategory` (`lib/services/expenseCategoryService.ts`), the picker and the cache invalidation (`invalidateCategoryCaches`) in `components/expenses/CategoryManagementDialog.tsx`; tests `__tests__/{spendingRoles,expenseCategoryService}.test.ts`, `e2e/settings.roles.spec.ts`
- **Mortgage instalment → property debt** (2026-09-25): `lib/utils/mortgageRepayment.ts` (pure), `lib/services/debtRepaymentService.ts` (client transactions), the server half inside `lib/server/cashSettlement.ts`; tests `__tests__/{mortgageRepayment,serverCashSettlement,updateAssetDebtFields}.test.ts`, `e2e/cashflow.mortgage.spec.ts`
- **Category icons** (2026-09-30): the curated names and labels `lib/constants/categoryIcons.ts`, one loader per icon `components/expenses/categoryIconLoaders.ts` (deep paths to lucide's canonical files, typed by `types/lucide-icon-modules.d.ts`), the ONE lazy map `LAZY_CATEGORY_ICONS` + `CategoryIcon` in `components/expenses/IconPickerPopover.tsx`; test `__tests__/categoryIcons.test.ts`
- **Expenses by window** (2026-09-30): pure `lib/utils/expenseWindows.ts` (`trackingWindow`, `budgetWindow`, `budgetSuggestionWindow`, `fireWindows`, `listExpenseYears`), hooks `useExpensesInRange` / `useExpenseBounds` / `expensesInRangeQueryOptions` in `lib/hooks/useExpenses.ts`, readers `getExpensesByDateRange` / `getExpenseDateBounds` in `lib/services/expenseService.ts`, keys `queryKeys.expenses.{range,bounds}`; tests `__tests__/expenseWindows.test.ts` (bounds and invariance), `__tests__/persistCache.test.ts` (the two builders), `e2e/cashflow.tracciamento.spec.ts` (the second window)
- **Tabs on demand** (2026-10-05): the four `lazyComponent`s at the top of `app/dashboard/cashflow/page.tsx`, their
  skeleton cells `lib/constants/cashflowTabSkeletons.ts`; held by `perf:budget` (Cashflow's ceiling) and by every
  `e2e/cashflow.*.spec.ts` that opens a tab
- **Suites to run after a change here — Transfers / cash** (moved from `AGENTS.md` § Commands on 2026-09-30): `cashBalanceReconciliation`, `updateCashAssetBalancesAtomic`, `transferFeature`, `cashSettlement`, `serverCashSettlement` · **Commissione** `transferFee` (+ `settingsRoundTrip`) · **Mutuo** `mortgageRepayment`, `mortgageSummary`, `updateAssetDebtFields` (+ `patrimonioNarrative` for the tile's words) · **Ricorrenze** `recurrenceDates` · **Browser** `e2e/cashflow.{accounts,transfer-fee,mortgage}.spec.ts`

## Expenses by window (`lib/utils/expenseWindows.ts`)
- **Tracciamento, Divisione, Budget and FIRE read a WINDOW of the expenses, never the collection** (2026-09-30).
  The pure functions of each page did not change — they still slice and bucket the list they are handed — what
  changed is the list: `useExpensesInRange(ownerId, window)`, one key per window under the `expenses.all` prefix.
  Until then every one of them read the whole collection to show a month (1547 documents on the owner's account),
  and the cost was the SDK deserialising them on the main thread: Cashflow's cold load took 1,9 s to its first figure
  and takes 1,0 with 838.
- **The windows, and the ONE module that defines them**: `trackingWindow(period)` — from the first day of the month
  twelve months before the period starts to the end of the MONTH it ends in (Tracciamento; Divisione on its own
  period); `budgetWindow(now)` — from the older of January and the first of the six trailing months, to December;
  `budgetSuggestionWindow(now, floor)` — whole years from the floor to last year, read by the budget dialog alone;
  `fireWindows(now, firstSnapshot)` — `recent` (January of last year → December) for every FIRE tab and `older` (from
  eleven months before the first snapshot) for the Calcolatore's «Dettaglio» only. Each guide says what its window
  holds and why.
- **A window is the UNION of what its page reads, not its period.** The readers behind the period count: the
  previous period and the same days of the previous month, the six months of the flow chart, the twelve of the
  savings history — and both charts draw the period's LAST MONTH WHOLE, so a custom range that stops on the 20th
  reads to the end of that month (the first draft closed on the range's last day: the invariance test found it).
  A reader added to a page widens its window in the same commit and joins `__tests__/expenseWindows.test.ts`, which
  runs every reader twice — on the window's rows and on the whole list — and compares.
- **The bounds are calendar days in BOTH calendars, never UTC.** The form saves at LOCAL midnight
  (`new Date(dateString + 'T00:00:00')`), the period slice compares in the browser's calendar and every month bucket
  reads the ITALIAN one. So a window opens at the earlier of the two midnights of its first day and closes at the
  later of the two ends of its last: the same instants in Italy, a few hours wider anywhere else. Local midnight
  alone — the spec's first wording — lost the rows of the 1st from Budget's buckets in a browser west of Italy (seen
  red under `TZ=America/New_York`), and `Date.UTC` loses them in Italy itself.
- **What a window cannot say about the rest of the collection comes from `useExpenseBounds`**: the dates of the
  oldest and of the newest row (two one-document reads, `['expenses', uid, 'bounds']`). The period pickers take their
  years from it (`listExpenseYears`), CONTIGUOUS from the oldest to the newest — a year with no row in between is
  offered too, and opens on an empty period.
- **Who has NO window, by declared need**: Storico (the Driver spans every year), Centri di Costo and «Collega
  spese…» (a centre is lifetime), Hall of Fame's recalculation — and Analisi, by the owner's decision of 2026-09-30:
  its Scheda, Confronto, Dettaglio and search span the history from the floor on and the Andamento ranks its categories
  on the rows after this year too, so a window left out 48 rows of 1547 on the real account, for one more list in
  memory and in the persisted record. They share the one `useExpenses` list. **Measure before giving a page a
  window**: a window pays where the page reads a small part of the collection, and costs a key everywhere.
- **Every expense write invalidates `queryKeys.expenses.all`, and that is enough**: it is the prefix of every window
  and of the bounds. The windows on screen reread at once; the others (another period, another page) are marked and
  reread when next opened. Found while checking every writer: deleting or renaming a cost centre rewrites expense
  rows and invalidated the centres only — it now invalidates the prefix too (doc/guide/centri-di-costo.md).
- **A new window is a wait, never the previous window's rows** (no `placeholderData`): the rows of another period
  under the new one would be figures of the wrong months. A window read in the last 24 hours opens from the
  persisted cache (doc/guide/cache-persistita.md).
- **A window has no rollback flag: its rollback is the revert** (owner, 2026-10-01). Nothing written changes shape —
  the collection, the rows and every writer are as before — and every reader filters in memory the list it is handed,
  so the whole-collection list is one `git revert` away and no emergency switch has to be kept alive and tested. A
  flag is for a change that alters what sits on DISK across a release (the persisted cache, AGENTS.md § Caching),
  never for a refactor of the readers.

## Category icons: one chunk per icon, by name (`components/expenses/categoryIconLoaders.ts`)
- **A category stores its icon by lucide's PascalCase name; the screen loads that one icon, never the library**
  (2026-09-30). Until then each lazy icon ran `import('lucide-react')` and read the name off the module — an
  import read by a runtime name cannot be tree-shaken, so the first icon of Tracciamento downloaded all of lucide
  (575 KB raw, 143 gz). lucide's own `dynamicIconImports` was measured and refused: its ~1900 loaders land in the
  initial JS of every page that renders an icon (+49 KB gz on Cashflow and Impostazioni). The 121 loaders point at
  the CANONICAL file (six names are aliases: `Home` → `house.js`, `Train` → `tram-front.js`, `ParkingSquare` →
  `square-parking.js`, `BarChart2` → `chart-no-axes-column.js`, `AlertCircle` → `circle-alert.js`, `IceCream` →
  `ice-cream-cone.js`); one icon is a ~350 B gz chunk, the picker's grid loads one per icon it shows.
- **A new curated icon is two lines**: its label in `CATEGORY_ICONS`, its loader in `CATEGORY_ICON_LOADERS`.
  `__tests__/categoryIcons.test.ts` goes red until both lists agree and each loader draws what lucide's map draws
  under the same kebab name (seen red with an invented «Fenicottero»); a name without a loader renders the fallback.
- **The picker's grid has never been timed** (2026-09-30): opening it requests one chunk per icon it shows — up to
  121, ~350 B gz each — and nobody measured that on a slow network. If it proves slow, the picker imports the 121
  icons statically (tree-shaken, ~30 KB raw by the 2026-09-26 estimate) and only the render by name keeps the lazy map.

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
- **`ExpenseDialog` type change is shape-aware across all five types**: `editBalanceEffects` (lib/utils/cashSettlement.ts)
  gives back the OLD shape's applied effect and applies the new one, both legs of a transfer included, in one transaction.
  `updateExpense` re-derives the sign from the incoming type and nulls `transferCashAssetId` when it leaves transfer.
  **That control lives in EDIT mode only** — creation picks the type in step 1 (AGENTS.md § Two-Step Create Dialogs), so the
  reconciliation paths above are reachable exclusively from a saved row.
- **A transfer IS its two accounts** (2026-09-13): `expenseSchema`'s last `superRefine` refuses a `transfer` without
  origin and destination or with the same account twice, with the error under each Select (the `__none__` sentinel
  counts as empty); the two labels carried an asterisk the schema did not honour, so a transfer saved without accounts
  moved no money and said nothing. Without any cash account the dialog says so in place of the pickers.
- **A linked row moves its account ON ITS OWN DATE** (2026-09-19, `lib/utils/cashSettlement.ts`). Until then a series
  moved its account ONCE, for its first row, the day it was saved, and the other occurrences never — a mortgage entered
  in January for the whole year left the account eleven instalments too high by December — and a single row dated in
  the future moved the account the day it was typed. Now: the expense form creates through `createExpenseSettledOnDate`,
  which puts the account on EVERY occurrence and writes the ones dated after today (Italian day, `settlesLater`)
  `balancePending: true`; the rows already happened (a series started in the past included) move the account at save,
  in ONE transaction (`applyBalanceEffects`), with the sign of their type. `settleDueBalances`
  (`lib/server/cashSettlement.ts`) settles the rest on their day and deletes the flag; it runs at the top of
  `/api/portfolio/snapshot`, so the daily cron and «Crea snapshot» photograph the balances AFTER the day's instalments,
  whichever of the two `0 18 * * *` crons runs first. Idempotent: each row is re-read in the transaction and settled only
  while still pending. **The flag's ABSENCE means applied**, so every row written before the rule (it moved its account at
  save) needs no migration and is never applied twice. An edit is ONE set of effects (`editBalanceEffects`: the old row's
  APPLIED effect given back, the new one applied unless its new date is still to come) — it replaced the four
  `reconcile*Edit` functions; every delete, a single row or a whole series, gives back only what was applied
  (`reverseAppliedBalances`). `createExpense` keeps the old contract (first row only, nothing pending) for the caller
  that settles its own transfer — a voluntary pension contribution. Pinned by `__tests__/cashSettlement.test.ts`,
  `__tests__/cashBalanceReconciliation.test.ts` and `e2e/cashflow.accounts.spec.ts` (every row linked, today's debited
  at save, the next one waiting).
- **The rule in one breath** (the stub's wording, moved here from `AGENTS.md` on 2026-09-20): every occurrence carries
  `linkedCashAssetId` and moves the account ON ITS OWN DATE (`lib/utils/cashSettlement.ts`, 2026-09-19): a row after
  today is `balancePending` until `settleDueBalances` runs in `/api/portfolio/snapshot`; a flag ABSENT means applied
  (older rows moved at save); edits and deletes move only what was applied. A `transfer` IS its two accounts: the schema
  refuses one without origin and destination, or with the same account twice (`e2e/cashflow.accounts.spec.ts`).
- **«Collega la serie a un conto»** (`LinkSeriesDialog`, from a series row's detail on the feed): a series written before
  the rule carries its account on the first row only; `linkSeriesToCashAccount` puts the chosen account on the
  occurrences still to come that have not moved one (`selectLinkableOccurrences`) and leaves them pending. The past is
  never touched — its effect is in today's balance — and an occurrence linked AND applied is never re-pointed.
- **A transfer's fee is a ROW of its own, linked both ways** (2026-09-25, `lib/utils/transferFee.ts`). A transfer is
  net-zero and in no total, so a fee kept on it would never reach Tracciamento, Analisi or Budget: the form's
  «Commissione» writes a spending row in the category chosen in Impostazioni › Spese (`transferFeeCategoryId`, its TYPE
  follows the category), same date, debiting the transfer's ORIGIN on its date like any linked row. The transfer carries
  `transferFeeExpenseId`, the fee `feeOfTransferId`; creation is ONE batch with pre-generated ids
  (`createTransferWithFee`). The fee is edited FROM the transfer (`planTransferFee` → `saveTransferFee`: update follows
  the transfer's date and origin, a cleared field or a row re-typed away from transfer deletes it, a new one needs the
  category) — its category and note are its own and never rewritten. A single delete goes through `rowsDeletedWith` +
  `deleteExpenseRows`: the fee goes with its transfer, its applied balance given back; a fee deleted by hand unlinks
  itself from its transfer in the same batch. Without a category the field is disabled and LINKS the setting; the edit
  form refuses to save while the saved fee is unread (it could only guess: a duplicate, or an orphan).
- **A `debt` row can repay a property's mortgage — by its PRINCIPAL** (2026-09-25, `lib/utils/mortgageRepayment.ts`).
  `debtAssetId` names the property; on the row's date (the SAME `balancePending` as its account: `hasDatedEffects`)
  `outstandingDebt` falls by `instalment − debt × TAN / 12` (`splitInstalment`, French amortisation, TAN =
  `Asset.debtInterestRate`, absent = 0% and said in the form), never by the whole instalment — the interest would
  otherwise inflate the net worth every month. Rows applied together go in DATE ORDER on the debt the previous one left
  (`planDebtRepayments`). What a row repaid is STORED (`debtPrincipalRepaid`, and beside it the interest it paid,
  `debtInterestPaid`, read by Patrimonio's «Mutuo» tile) because the interest depends on that day's debt: an edit gives it back and re-splits on today's debt (`planDebtEdit`, a no-op when property, amount and date side
  are unchanged), a delete gives back exactly it (`reverseAppliedBalances` → `reverseDebtRepayments`). The client applies
  the rows already happened (`debtRepaymentService`), `settleDueBalances` the rest on their day, in the same
  transaction as the accounts. «Collega la serie al mutuo…» (`selectDebtLinkableOccurrences`) links only the future
  occurrences not yet linked whose account has not moved; the past is never touched — the typed debt reflects it.
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
  decision; **`transfer` is structural** — the settlement would handle its two legs per occurrence
  (`balanceEffectsOf`), but the form, the series writers and `createRecurringExpenses`' negative sign were never widened
  to it; a monthly card payment is one transfer a month, typed on the day. Widening the set
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

## Ruoli 50/30/20: Necessità · Desideri · Risparmi (`lib/utils/spendingRoles.ts`)
- **Opt-in** (`settings.spendingRolesEnabled`, default off, Impostazioni › Spese › «Ruoli 50/30/20», the five write
  places) and meant for Analisi's Flusso only (doc/guide/cashflow-analisi.md): no 50/30/20 tile, no budget per role,
  nothing in emails, PDF or the assistant. Off, the app is exactly what it was — the role colours are not even read
  (`useCssColorTokens` disabled), and the Flusso renders once at mount. (The phone's Flusso is a bar and rows for
  everyone since #401; the flag only adds the roles view to it.)
- **The role lives on the category, never on the row**: `ExpenseCategory.spendingRole`, with an optional per-subcategory
  override (`ExpenseSubCategory.spendingRole`, WiFi = need inside a want-classified Abbonamenti). Rows carry
  `categoryId`, so a reclassification is retroactive on every period with no bulk update. **`resolveSpendingRole` is the
  ONE resolution**: override → category → `null` («Da classificare»); a missing category and a non-spending one (income,
  transfer — a role left behind by a type change) are `null` too.
- **Risparmi is not a category total**: `summarizeSpendingRoles` gives savings = saving-classified rows + the period's
  surplus. When spending exceeds income the surplus is 0 and the gap becomes `deficit`, drawn on the income side as
  «Coperto dal patrimonio» — a Sankey has no negative width. Invariant, tested: `income + deficit = need + want +
  unclassified + saving + surplus`. **Income is SIGNED** (a negative income row is a reversal, as in `summarizeFlow`
  and Periodo, so «Delle entrate (X €)» is Periodo's X), spending a magnitude; the row's own type decides the side,
  transfers skip. The roles Sankey takes its income nodes from the same summary, net per category (a category at ≤ 0
  is left out: a link has no negative width), and balances Budget on the right side's money, `max(spending, income)`:
  the sources carry `max(income, 0)` — a left-out category's reversal comes off the largest sources — and «Coperto dal
  patrimonio» carries `spending − max(income, 0)`, never `summary.deficit`, which with income net negative would count
  the reversals a second time (tested: a lone 600 reversal against 100 in, and a category holding only a reversal).
- **The printed shares have ONE source, `summarizeSpendingRoleShares`**: the reading and the phone bar both read it, in
  `SPENDING_ROLE_FLOW_ORDER` (necessità, desideri, da classificare, risparmi — the Sankey's order). Each share is
  rounded to a whole percent and the drift goes to the bucket that is a remainder by definition — Risparmi with a
  surplus, else «Da classificare», else the largest — so the printed list adds up to 100. The income edge of a
  deficit is clamped to 0–100, and there is none when income is ≤ 0.
- **A category write reaches Analisi at once**: Analisi reads the roles off `queryKeys.expenses.categories`, so every
  category write invalidates it where it happens (`invalidateCategoryCaches`, doc/guide/impostazioni.md) — and
  `expenses.all` when the rows were rewritten too.
- **Clearing a role must delete the field**: «Da classificare» is the absence of `spendingRole`, and
  `removeUndefinedFields` would drop the key and keep the old role. `updateCategory` writes `deleteField()` when the key
  is present with `undefined`; the key absent means "not edited". **The dialog writes the role only when it showed it**
  (setting on), so a category saved with the setting off keeps its classification; a category moved to income or
  transfer sheds its roles.

## The expense form reads the keys (`components/expenses/ExpenseDialog.tsx`)
- **`ExpenseDialog` opens from the cache** (2026-09-29): its four reads — the categories, the assets (the cash
  accounts and the repayable properties), the settings (the default accounts, the three feature flags, the family, the
  fee category) and the cost centres — are `useExpenseCategories`, `useAssets`, `useSettings` and `useCostCenters` with
  `enabled: open`, the keys every page shares; on Cashflow they are already in memory, so «Nuova spesa» waits for nothing.
  Until then every opening ran four reads of its own. A category created from the form reaches every reader through
  the invalidation `loadCategories` now is; the default account of a NEW row is set by an effect declared AFTER the
  form-reset effect, so the reset clears the field first in the commit that opens the dialog (the order the old async
  loader had by accident). The form's reset rules are unchanged (AGENTS.md § Dialog Form Reset).
- **The other category readers go through the key too**: `CategoryDeleteConfirmDialog`, `CategoryMoveDialog`,
  `CategoryManagementDialog` and the CSV import read once after a write with
  `queryClient.fetchQuery(categoriesQueryOptions(ownerId))` — the import's commit with `staleTime: 0`, because the
  preview may be stale.
- **A form body handed `form` subscribes to the errors itself: `useFormState({ control })`** (2026-10-05, the React
  Compiler). `FormBody` (here) and `CategoryFormBody` (`CategoryManagementDialog`) receive the `useForm` object, which
  is the same object on every render; with the compiler on, the parent hands them unchanged props, React skips them,
  and an error read off `form.formState.errors` never showed under its field («L'importo è obbligatorio», «Scegli il
  conto di origine»: `e2e/cashflow.{tracciamento,accounts}.spec.ts` went red until the subscription moved into the
  body). Any new child that reads `formState` from a `form` prop does the same.

## The tabs load their code on demand (`app/dashboard/cashflow/page.tsx`)
- **Dividendi, Budget, Divisione and Centri di Costo are `lazyComponent`s** (2026-10-05, PERF-12): only Tracciamento's
  code is in Cashflow's initial JavaScript. With the React Compiler on, the five tabs as static imports took the page
  from 736 to 832 KB gz and its first figure from 616 to 730 ms cold on the mirror; lazy, 717 KB and the same 593 ms as
  without the compiler (A/B, 7 runs). Each tab is preloaded once Tracciamento's data is in (`usePreloadWhenIdle`, the
  optional two only when their flag is on), so a click usually draws at once; until the chunk arrives the panel shows
  the tab's OWN skeleton, the cells of `lib/constants/cashflowTabSkeletons.ts`, which the tab draws too while its data
  loads. A value imported from a tab module into the page puts it back in the initial graph — types only. A deep link
  (`?tab=dividends`) pays one chunk request before the tab's own reads.

## Per-page blind spots

- **A mortgage instalment is split on the debt of the day it SETTLES** (2026-09-25): if the property's debt is typed by hand after the instalments were linked, the next one is split on the new figure; a debt corrected by hand is never reconciled with the rows. A series started in the past repays its past instalments at save, like its account: if the debt typed on the property already reflects them, leave the property empty on the form and link the series afterwards («Collega la serie al mutuo…» takes only the future). A future row of a series written before 2026-09-19 whose account already moved at save cannot be linked to the mortgage (flagging it pending would debit the account twice). An instalment smaller than the month's interest repays nothing (negative amortisation is not modelled). The BATCH re-typing paths (a category moved to another type from Impostazioni) do not give back a repayment already applied: only the expense form and the deletes do; a row re-typed that way keeps its stamp, gives it back if deleted, and a pending one simply repays nothing on its day. The fee of a transfer follows the transfer's date and origin on every edit, so a date typed on the fee row itself is overwritten by the next edit of its transfer.
- **A row that comes due moves its account in the evening, not at midnight** (2026-09-19): the settlement runs with the snapshot at 18:00 UTC (20:00 in Italy), so until then Patrimonio shows the balance without the day's instalment while Tracciamento already counts it as happened. A row entered TODAY with a past or today's date moves the account at save — including a series started in the past: if the balance typed from the bank already reflects those rows, leave the account empty or they are debited twice. A credit card is a cash account allowed below zero (doc/guide/patrimonio.md); its monthly payment is one transfer typed on the day, since a transfer cannot recur.
- **A running year is the WHOLE calendar year on Tracciamento and Analisi**, so its figures include what is only scheduled; each verdict declares it with amount and horizon, each such row is chipped «In calendario» and drops its sign colour. **«Da inizio anno» (YTD) is the other window** (`Period.kind = 'ytd'`, Analisi's fourth `PeriodMode`): it runs to the END of today's month, not to today, so it carries scheduled rows too. **On «Anno corrente» the delta compares twelve months against twelve** (`resolveComparisonScope` → `fullYear`), biased downward as the year runs; YTD keeps `sameMonths`, and Tracciamento's verdict and a category's Scheda still say «stessi mesi». Not extended to Panoramica, Storico, Budget or Centri di Costo. DESIGN → *The Scheduled-Is-Not-Spent Rule*. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
