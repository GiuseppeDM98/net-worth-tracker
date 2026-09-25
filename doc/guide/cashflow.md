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
- **Mortgage instalment → property debt** (2026-09-25): `lib/utils/mortgageRepayment.ts` (pure), `lib/services/debtRepaymentService.ts` (client transactions), the server half inside `lib/server/cashSettlement.ts`; tests `__tests__/{mortgageRepayment,serverCashSettlement,updateAssetDebtFields}.test.ts`, `e2e/cashflow.mortgage.spec.ts`

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

## Per-page blind spots

- **A mortgage instalment is split on the debt of the day it SETTLES** (2026-09-25): if the property's debt is typed by hand after the instalments were linked, the next one is split on the new figure; a debt corrected by hand is never reconciled with the rows. A series started in the past repays its past instalments at save, like its account: if the debt typed on the property already reflects them, leave the property empty on the form and link the series afterwards («Collega la serie al mutuo…» takes only the future). A future row of a series written before 2026-09-19 whose account already moved at save cannot be linked to the mortgage (flagging it pending would debit the account twice). An instalment smaller than the month's interest repays nothing (negative amortisation is not modelled). The BATCH re-typing paths (a category moved to another type from Impostazioni) do not give back a repayment already applied: only the expense form and the deletes do; a row re-typed that way keeps its stamp, gives it back if deleted, and a pending one simply repays nothing on its day. The fee of a transfer follows the transfer's date and origin on every edit, so a date typed on the fee row itself is overwritten by the next edit of its transfer.
- **A row that comes due moves its account in the evening, not at midnight** (2026-09-19): the settlement runs with the snapshot at 18:00 UTC (20:00 in Italy), so until then Patrimonio shows the balance without the day's instalment while Tracciamento already counts it as happened. A row entered TODAY with a past or today's date moves the account at save — including a series started in the past: if the balance typed from the bank already reflects those rows, leave the account empty or they are debited twice. A credit card is a cash account allowed below zero (doc/guide/patrimonio.md); its monthly payment is one transfer typed on the day, since a transfer cannot recur.
- **A running year is the WHOLE calendar year on Tracciamento and Analisi**, so its figures include what is only scheduled; each verdict declares it with amount and horizon, each such row is chipped «In calendario» and drops its sign colour. **«Da inizio anno» (YTD) is the other window** (`Period.kind = 'ytd'`, Analisi's fourth `PeriodMode`): it runs to the END of today's month, not to today, so it carries scheduled rows too. **On «Anno corrente» the delta compares twelve months against twelve** (`resolveComparisonScope` → `fullYear`), biased downward as the year runs; YTD keeps `sameMonths`, and Tracciamento's verdict and a category's Scheda still say «stessi mesi». Not extended to Panoramica, Storico, Budget or Centri di Costo. DESIGN → *The Scheduled-Is-Not-Spent Rule*. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
