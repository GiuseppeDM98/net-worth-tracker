# AI-02 — The Consulente's cashflow block

> Series `doc/ai/` (README.md § 5): **depends on AI-00** (the repo after the upgrade); **AI-04 depends on it** (the
> interview reads the same block). Written on 2026-11-01 from `develop` @ b9411a4d. Executes decision 7 (an aggregate
> block on 12 months + 24 months of monthly series, from a pure function) and the adopted choices A7, A8.

## 1. The problem today (evidence on the code)

- **The strategy's data is the YTD bundle** (`lib/server/allocationAdvice/run.ts:248-251` @ b9411a4d:
  `buildAssistantYtdContext(document.userId)` → `formatBundleForPrompt(bundle)`), i.e. `buildCashflowBreakdown` on the
  rows from 1 January to today (`lib/utils/expenseBreakdown.ts:102`): totals, by type (`expensesByType`), by category
  and subcategory (`expensesByCategory`), income by CATEGORY (`incomeByCategory`, dividends excluded), the largest
  single expenses (`topIndividualExpenses`, 10 for the YTD). Nothing else about the cashflow.
- **What the owner asked for and the bundle cannot say**: «quanto sono concentrati gli stipendi» (income by source
  over time: the bundle has one year-to-date figure per income category, no month-by-month, no share of the top
  source); «dove spende» over a horizon (a January run sees one month); the savings capacity the strategy's
  `monthlyContribution` should rest on (no monthly series → no median, no volatility); the recurring commitments
  (`Expense.isRecurring`, `recurringParentId`, the `debt` rows with `debtAssetId`); the liquid accounts' balances the
  cash reserve should be sized against (the portfolio block lists assets by class, not «which account holds the
  emergency fund»).
- **The prompt does not ask for it**: `buildStrategyPrompt` (`prompts.ts:148-158`) says «I blocchi STRUMENTI,
  ALLOCAZIONE OGGI, … e FAMIGLIA sono esaustivi» — CASHFLOW is not in the list, and `STRATEGY_CONTRACT` (`:113-128`)
  never names income, spending or savings; § 1 «La situazione» is «cosa vedi nel portafoglio».
- **The YTD breakdown is read twice per run** (`runStrategy` and `runInstruments` both call `buildAssistantYtdContext`):
  a new reader must not add a third read of the same rows.
- **The expense fetch is Admin and windowed** (`lib/services/assistantMonthContextService.ts:145-167`: `fetchExpenses(userId, start, end)`
  on `expenses` by `userId` and `date` range) — not exported today.
- **Italian windows**: AGENTS.md (2026-10-20, the assistant's portfolio block): «Every expense window is an Italian
  calendar window (`getItalyMonthBoundsUtc`)» — `lib/utils/dateHelpers.ts:166`.

## 2. Goal and acceptance criteria

The strategy (and, from AI-04, the interview) reads ONE cashflow block that answers: how much comes in, from how
many sources and how concentrated; where it goes, by category; how much is left each month and how stable that is;
which commitments recur; which accounts hold the liquidity.

1. **A pure builder exists**: `buildConsulenteCashflowContext(expenses, input)` in `lib/utils/consulenteCashflowContext.ts`,
   with no Firestore and no `Date.now()` (the «today» is an input). Proof: `__tests__/consulenteCashflowContext.test.ts`
   green in `Europe/Rome` and `TZ=UTC`; `reactCompilerCoverage` untouched (no component).
2. **The block is printed by `formatConsulenteCashflowForPrompt(ctx)`** and appended to the strategy's `userContent`
   after `dataBlock` and before the prior plan. Proof: `allocationAdvicePrompts.test.ts` asserts the order of the
   `---` headers and that `system` is byte-identical to before (snapshot of `buildStrategyPrompt(...).system`).
3. **Every cut is declared in the text** (the silent-cap rule): the series' 24 months, the aggregates' 12 full months
   + the current month, the recurring rows capped at `CONSULENTE_CASHFLOW_ROW_CAP = 40` with «e altre N» when cut, the
   income sources all printed (they are few) or cut with the count. Proof: a test with 50 recurring rows reads
   «e altre 10 non elencate».
4. **The income concentration is a number the model can use**: for the last 12 full months, each income source
   (category › subcategory when present, else category) with its total, its share, the number of months it appeared
   in, and the Herfindahl index of the shares (0–1) with its reading in words («una sola fonte» ≥ 0.8, «due fonti
   principali» 0.4–0.8, «diversificate» < 0.4). Proof: a fixture with one salary source → HHI 1 and «una sola fonte»;
   with two equal sources → 0.5.
5. **The monthly series carries income, spending (necessary, non-necessary, debt), savings and the savings rate per
   month**, 24 rows, the months with no rows printed as zero (declared «nessuna riga»), the current month flagged «in
   corso». Proof: a fixture with a gap month.
6. **Volatility is reported**: the median and the interquartile range of the monthly spending and of the monthly
   savings over the last 12 full months, in euro. Proof: a fixture with one outlier month changes the IQR, not the
   median.
7. **The recurring commitments**: rows with `isRecurring`/`recurringParentId`, grouped by `recurringParentId` (or by
   category+amount when absent), with frequency, amount, category and the next date when it is in the future; the
   `debt` rows grouped by `debtAssetId` with the monthly instalment and the loan's name (from `input.loansById`).
   Proof: a fixture with a 12-row monthly series prints one line, not twelve.
8. **The accounts**: the liquid accounts (`type === 'cash' && assetClass === 'cash'`) with name, balance, and the
   roles «conto di addebito predefinito» / «conto di accredito predefinito» from `input.settings`. Proof: the fixture.
9. **The strategy contract asks for it**: `STRATEGY_CONTRACT` § 1 «La situazione» gains «e nel cashflow: entrate,
   loro concentrazione, spesa, capacità di risparmio»; a new constraint line says `monthlyContribution` of a goal and
   the cash reserve are sized against the block's savings and liquidity. The «esaustivi» line names CASHFLOW. Proof:
   the prompts test and the snapshot.
10. **No third read of the rows per run**: `runStrategy` reads the 24-month window ONCE (an Admin `fetchExpenses`
    exported from the context service or a sibling `fetchExpensesForWindow`) and the YTD bundle stays as it is;
    `runInstruments` does not read the cashflow. Proof: `allocationAdviceRun.test.ts` counts the Firestore `get` calls
    through the existing Admin mock.
11. **The rate limit, the SSE events, the document shape are unchanged**; `allocationAdviceDocument` mapper untouched.
    Proof: the existing suites green.

## 3. Decisions

- **Decision 7 (owner)**: the block's content and the two windows.
- **A7 (adopted, reversible)**: Consulente-only; `formatBundleForPrompt` and `ASSISTANT_SYSTEM_CORE` untouched (the
  Assistente and the emails read them); the Assistente's heir is CLAUDE.md § Not yet present.
- **A8 (adopted, reversible)**: aggregates = the last 12 FULL Italian months + the current month printed apart as
  «in corso»; series = the last 24 months including the current; one read per stage.
- **Adopted, reversible**: transfers (`type === 'transfer'`) are excluded from income/spending (as `buildCashflowBreakdown`
  does) and counted once in a one-line «trasferimenti fra conti: N righe, X € mossi» so the model knows they exist.
- **Adopted, reversible**: a row with `excludeFromBudget` counts (every total but the Budget keeps it — `countsTowardBudget`
  is the Budget's gate, not the cashflow's); `balancePending` rows count on their date like every other reader.
- **Adopted, reversible**: the block is in Italian (the model answers in Italian and the other blocks are Italian),
  headers in the `--- NOME ---` convention of `formatBundleForPrompt`.
- **Adopted, reversible**: HHI thresholds 0.8 / 0.4; a source is category › subcategory when the subcategory exists.

## 4. Solution

### Types and the builder (`lib/utils/consulenteCashflowContext.ts`, pure)

```ts
import type { Expense, ExpenseCategory } from '@/types/expenses';
import type { Asset, AssetAllocationSettings } from '@/types/assets';

export const CONSULENTE_CASHFLOW_ROW_CAP = 40;
export const CONSULENTE_CASHFLOW_SERIES_MONTHS = 24;
export const CONSULENTE_CASHFLOW_AGGREGATE_MONTHS = 12;

export interface ConsulenteCashflowInput {
  /** The Italian «today» (`getItalyDateIso(now)`): the builder never reads the clock. */
  todayIso: string;
  categories: ExpenseCategory[];
  /** Liquid accounts and loans, by id; the builder filters `cash`/`cash` and `loan` itself. */
  assets: Asset[];
  settings: Pick<AssetAllocationSettings, 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId'> | null;
}

export interface IncomeSource { label: string; total: number; share: number; monthsPresent: number }
export interface MonthRow {
  ym: string;                 // 'YYYY-MM' (Italian calendar)
  income: number; necessary: number; nonNecessary: number; debt: number; // magnitudes, ≥ 0
  savings: number;            // income − (necessary + nonNecessary + debt)
  savingsRate: number | null; // savings / income, null when income = 0
  rows: number;               // 0 ⇒ printed «nessuna riga»
  inProgress: boolean;
}
export interface RecurringCommitment { label: string; frequency: 'monthly' | 'yearly' | 'irregolare'; amount: number; category: string; nextIso: string | null; rows: number }
export interface LoanInstalment { loanName: string; monthly: number; rows: number }
export interface AccountLine { name: string; balance: number; roles: ('addebito' | 'accredito')[] }
export interface Quartiles { median: number; q1: number; q3: number }

export interface ConsulenteCashflowContext {
  windows: { aggregateFromYm: string; aggregateToYm: string; seriesFromYm: string; currentYm: string };
  income: { total: number; sources: IncomeSource[]; hhi: number; reading: 'una sola fonte' | 'due fonti principali' | 'diversificate'; sourcesCut: number };
  spending: { total: number; byType: { necessary: number; nonNecessary: number; debt: number }; byCategory: { category: string; total: number; share: number; subCategories: { name: string; total: number }[] }[] };
  series: MonthRow[];
  volatility: { spending: Quartiles; savings: Quartiles };
  recurring: { items: RecurringCommitment[]; cut: number };
  loans: LoanInstalment[];
  transfers: { rows: number; moved: number };
  accounts: AccountLine[];
}

export function buildConsulenteCashflowContext(expenses: readonly Expense[], input: ConsulenteCashflowInput): ConsulenteCashflowContext;
export function formatConsulenteCashflowForPrompt(ctx: ConsulenteCashflowContext): string;
```

Rules inside the builder (each one a test):

- The month key of a row is the Italian calendar month of `row.date` (`getItalyDateIso(row.date).slice(0, 7)`), never
  `getMonth()` of the UTC date (the noon-fixture rule and the midnight rows).
- Income = `type === 'income'` magnitude; spending by type from `fixed` → necessary, `variable` → nonNecessary,
  `debt` → debt, with the sign convention of `types/expenses.ts` read as magnitude (`Math.abs`), never classified by
  sign (the lesson of `expenseBreakdown.ts:20-30`).
- A typeless legacy row counts as nonNecessary and the block says «N righe senza tipo contate fra le non necessarie».
- Sources: key = `categoryName` + (`subCategoryName` ? ` › ${subCategoryName}` : ''), label resolved through
  `input.categories` by id, the row's denormalised name as fallback. `share = total / income.total`; `hhi = Σ share²`.
- Quartiles on the 12 full months (the current month excluded): sort, median = middle (mean of two), q1/q3 by the
  inclusive method; all rounded with `roundToCents`.
- Recurring: group key `recurringParentId ?? `${categoryId}:${amount}``; frequency from `recurringFrequency` of any
  row of the group, else 'irregolare'; `nextIso` = the first row's date after `todayIso`, else null; items sorted by
  amount desc; cut at `CONSULENTE_CASHFLOW_ROW_CAP`.
- Loans: `debt` rows grouped by `debtAssetId`, `monthly` = median of the group's amounts, name from `input.assets`.
- Accounts: `assets.filter(a => a.type === 'cash' && a.assetClass === 'cash')`, balance = `a.currentValue ?? a.value`
  (the field the Patrimonio tile reads — check `lib/utils/assetLiquidity.ts` at implementation and use the same),
  roles from the two default ids.

### The printed block (the shape the test snapshots)

```
--- CASHFLOW (ultimi 12 mesi pieni: 2025-11 → 2026-10; il mese in corso 2026-11 a parte; serie di 24 mesi) ---
Entrate: 31.200 € in 12 mesi. Fonti (quota, mesi presenti): Stipendio › Azienda A 86% (12), Dividendi 9% (4), Rimborsi 5% (3). Concentrazione (HHI 0,75): due fonti principali.
Uscite: 22.800 € — necessarie 14.400 (63%), non necessarie 7.200 (32%), rate 1.200 (5%). Per categoria: Casa 9.600 (42%: Affitto 8.400, Bollette 1.200); Cibo 4.800 (21%: Spesa 3.600, Fuori 1.200); …
Risparmio mensile: mediana 700 €, metà dei mesi fra 350 e 950 €. Spesa mensile: mediana 1.900 €, metà dei mesi fra 1.750 e 2.100 €.
Serie mensile (entrate / necessarie / non necessarie / rate / risparmio / tasso):
2024-12  2.600 / 1.200 / 600 / 100 / 700 / 27%
… (24 righe; un mese senza righe: «nessuna riga»; l'ultimo «in corso»)
Impegni ricorrenti (N): Affitto mensile 700 € (Casa › Affitto, prossima 2026-12-01); Palestra mensile 45 € …; e altre 3 non elencate.
Rate di prestito: Mutuo casa 100 €/mese (12 righe).
Trasferimenti fra conti: 14 righe, 9.000 € mossi (non contati né fra le entrate né fra le uscite).
Conti liquidi: Conto principale 6.200 € (addebito, accredito); Conto risparmio 12.000 €.
```

(Figures invented; the format is the contract.)

### The server side

- `lib/services/assistantMonthContextService.ts`: export the existing `fetchExpenses` (rename nothing) and
  `fetchAssets`, `fetchExpenseCategories`, `fetchSettings` as a small `fetchConsulenteCashflowInputs(userId, now)`
  that returns `{ expenses, input }` for the 24-month window (`getItalyMonthBoundsUtc` of the first month's start to
  the current month's end). One function, Admin, 20 lines.
- `lib/server/allocationAdvice/run.ts` `runStrategy`: after the bundle, `const cashflow = await fetchConsulenteCashflowInputs(userId, now)`;
  `const cashflowBlock = formatConsulenteCashflowForPrompt(buildConsulenteCashflowContext(cashflow.expenses, cashflow.input))`;
  `buildStrategyPrompt(document.answers, dataBlock, priorPlan, cashflowBlock)`.
- `prompts.ts`: `buildStrategyPrompt(answers, dataBlock, priorPlan = null, cashflowBlock = '')` appends
  `cashflowBlock` after `dataBlock` (before the prior plan) when non-empty; the «esaustivi» sentence becomes «I blocchi
  STRUMENTI, …, FAMIGLIA e CASHFLOW sono esaustivi»; `STRATEGY_CONTRACT` § 1 and the new constraint as in criterion 9.
  `system` changes (the contract is in it) — ONE change, snapshotted; it stays identical across users.
- `now` flows from `runAllocationAdviceStage`'s `now` into the fetch (the tests pass a fixed date).

## 5. Constraints and traps (AGENTS.md rules, «here it means that»)

- **«Every expense window is an Italian calendar window»** — here it means that the 24-month window's bounds come from
  `getItalyMonthBoundsUtc`, and the month key of a row from `getItalyDateIso`; the suite runs in both zones.
- **The silent-cap rule (AGENTS.md § Assistente, «printed whole or with the cut declared»)** — here it means every
  `cut` number in the context is printed as «e altre N».
- **`system` byte-identical per mode** — here it means the block is in `userContent`; the contract change is in
  `system` for everyone.
- **The sign convention (`doc/guide/cashflow.md` § Expense Sign Convention)** — here it means magnitudes by `type`,
  never by sign; the legacy typeless rows declared.
- **Transfers are internal** (`expenseBreakdown.ts:99`) — here it means excluded from the totals and counted apart.
- **The fee rows** (`feeOfTransferId`) — here it means a fee is a spending row of its own category (the shared rule in
  cashflow.md): nothing special, it just counts.
- **Window reads, not whole history** (CLAUDE.md § Architecture: expenses by WINDOW on Cashflow and FIRE) — here it
  means 24 months, never the collection whole; the owner's account has rows from 2025 only (prod cleanup 2026-10-24),
  the window is still bounded by date.
- **No owner data in the test fixtures** — invented rows at noon Italian time, round amounts, generic names.
- **`roundToCents`, `floatNoise`** — every printed figure passes through `formatCurrency`'s integer form for the
  prompt (the Assistente prints `1.234 €` without decimals in its blocks: copy its formatter helper).

## 6. Tests per level (with the mutation that proves each)

- **`__tests__/consulenteCashflowContext.test.ts`** (new, pure):
  - month key by Italian calendar: a row at `2026-01-31T23:30:00+01:00` → `2026-01` in both zones. Mutation: use
    `getUTCMonth()` → the UTC run files it under February… (no: 22:30 UTC is still 31 Jan; use a row at
    `2026-02-01T00:30+01:00` = `2026-01-31T23:30Z` → must be `2026-02`; the mutation files it under January).
  - HHI and reading (criterion 4). Mutation: `share` not squared → HHI 1 for two equal sources.
  - series length 24, gap month «nessuna riga», current month `inProgress`. Mutation: series built from the months
    that HAVE rows → length 23.
  - quartiles with an outlier (criterion 6). Mutation: mean instead of median → the outlier moves it.
  - recurring grouping (criterion 7) and the cap with «e altre N». Mutation: cap applied before sorting → a small
    item printed, a big one cut.
  - transfers counted apart, fee rows counted, `excludeFromBudget` counted. Mutation: filter by `countsTowardBudget`
    → the total drops.
  - the printed block snapshot (invented fixture).
- **`__tests__/allocationAdvicePrompts.test.ts`** (extend): the block's position, the «CASHFLOW» word in the esaustivi
  line, the `system` snapshot. Mutation: append the block after the prior plan → the order assertion fails.
- **`__tests__/allocationAdviceRun.test.ts`** (extend): the strategy stage calls the fetch once with the 24-month
  bounds; the instruments stage never. Mutation: call it in `runInstruments` too → the call count fails.
- **`__tests__/reactCompilerCoverage.test.ts`**: untouched (no component).
- **E2E**: none (the run is never opened by a probe).

## 7. Guided verification (WORKFLOW.md § 2)

- **A**: the eleven criteria; the outcome «the strategy prompt carries the block; the run reads the rows once more
  per strategy, not per stage; the Vitest suites green in both zones».
- **B**: the diff of `prompts.ts` read with the owner (the contract's new sentences are product words).
- **C**: `TZ=Europe/Rome npx vitest run consulenteCashflowContext allocationAdvicePrompts allocationAdviceRun` and
  `TZ=UTC …`; `npx tsc --noEmit`; `npm run lint`.
- **D**: on the emulators with the seed (`emulators:seed`), a scratchpad script calls `fetchConsulenteCashflowInputs`
  and prints the block for the seeded user: the figures match the seed (declared before: the seed's income and
  category totals).
- **E**: none in the browser (no UI).
- **F**: the owner's ONE real run on the mirror (`npm run mirror:seed -- <email>`): the block printed to the server log
  (`console.info('[consulente] cashflow block', block.length)` and the block itself only in the session, never
  committed), the report's § 1 «La situazione» read for the cashflow sentences; the owner judges whether
  `monthlyContribution` and the reserve now rest on the savings. `npm run mirror:remove` after.
- **G**: the log line removed, the scratchpad script deleted, the mirror removed.

## 8. Putting it into service

Branch `feat/consulente-cashflow`, commit `feat(consulente): the cashflow block — income concentration, 24-month series,
commitments, accounts`, PR to `develop`. No flag. The Vercel preview's `/api/allocation-advice/run` is not called
from the preview (it spends): the mirror run in phase F is the proof.

## 9. Documentation

- `doc/guide/consulente.md` § La corsa: the context sentence («il contesto è il bundle YTD … blocco portafoglio
  incluso») gains «e il blocco CASHFLOW (`buildConsulenteCashflowContext`, 12 mesi pieni + 24 di serie, una lettura per
  strategia)»; § Files adds `consulenteCashflowContext.ts` and its suite; **fix `maxDuration = 600` → `300`** (the
  route says 300, `app/api/allocation-advice/run/route.ts`; the guide is wrong since 2026-10-20). English for the
  new sentences.
- AGENTS.md § Consulente stub: one line «the cashflow block is the Consulente's (2026-11): `formatBundleForPrompt`
  stays the Assistente's and the emails'».
- CLAUDE.md § Key Features › Allocazione › Consulente: «+ the cashflow block (2026-11)»; § Not yet present (create the
  heading if absent, under Known Issues): «the Assistente does not receive the Consulente's cashflow block».
- `Draft Release Temp.md`: one user-facing line («Il Consulente legge anche entrate, spese e risparmio degli ultimi due
  anni»).

## 10. Declared out of scope

- The interview's use of the block: AI-04 (it calls the same two functions).
- The Assistente's periods reading the block: heir CLAUDE.md § Not yet present (A7).
- A per-member split of income (the household): the block prints sources, not members; heir CLAUDE.md § Not yet
  present («income by household member in the Consulente's block»).
- The review and revision prompts: they read the strategy's markdown, which now contains the cashflow reading; no
  block re-sent (one more 3–4 KB per call avoided).

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md (§ Commands, § Assistente, § Consulente), doc/guide/consulente.md, doc/guide/cashflow.md
§ Expense Sign Convention, doc/ai/README.md § 3-4-7 e doc/ai/AI-02-blocco-cashflow-consulente.md. Implementa AI-02
così com'è scritta: il modulo puro con i nomi della § 4 (identici: sono contratti condivisi con AI-04), la sua suite
con ogni mutazione della § 6, il fetch Admin unico per la strategia, il prompt e il contratto come nei criteri 2 e 9,
la guida con la correzione di maxDuration. Vitest in Europe/Rome E in TZ=UTC. Collaudo: § 7 della spec; la corsa vera
una sola volta, sul mirror, al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **high**. Estimated size: 1 session, ~3 h; ~350 lines of pure module, ~250 of tests,
~40 of server/prompt changes, ~15 of docs.
